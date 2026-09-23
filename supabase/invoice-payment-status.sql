-- ===========================================================================
-- Invoices stayed "unpaid" after being paid — 2026-09-09
-- Run once. Idempotent.
--
-- Payments were recorded against invoices correctly, and the client pay page worked out
-- the balance from them — which is why the client link showed the right thing while the
-- app showed "unpaid".
--
-- Nothing updated invoices.payment_status. That is not cosmetic: the tax summary's
-- cash-basis view selects invoices where payment_status = 'paid', so every invoice paid
-- by deposit, e-transfer, cheque or PayPal was MISSING FROM THE TAX REPORT. Revenue
-- was being understated.
--
-- Fixed with a trigger rather than in application code. Payments arrive from at least
-- four places — the deposits form, the edit panel, PayPal capture, and the Joist import
-- — and any one of them could forget.
-- ===========================================================================

-- Recomputes an invoice's payment state from the payments actually recorded against it.
--
-- Deliberately does not touch an invoice a person has marked paid by hand with no
-- payment rows: some are settled by trade or written off, and overruling that would be
-- rude. It only ever promotes on the strength of real payments, or demotes when the
-- payments that justified it are gone.
create or replace function recompute_invoice_payment(target_invoice uuid) returns void as $$
declare
  invoice_total numeric;
  paid_total numeric;
  last_payment date;
  last_method text;
begin
  if target_invoice is null then return; end if;

  select amount into invoice_total from invoices where id = target_invoice;
  if invoice_total is null then return; end if;

  select coalesce(sum(amount), 0), max(date)
    into paid_total, last_payment
  from deposits where invoice_id = target_invoice;

  select payment_method into last_method
  from deposits
  where invoice_id = target_invoice
  order by date desc nulls last
  limit 1;

  if paid_total <= 0 then
    -- No payments. Only clear a status this trigger could have set — never undo a
    -- manual "mark paid" on an invoice that was settled some other way.
    update invoices
    set payment_status = 'unpaid', paid_date = null
    where id = target_invoice
      and payment_status = 'paid'
      and payment_method is not null
      and exists (select 1 from deposits d where d.invoice_id = target_invoice);
    return;
  end if;

  -- A cent of tolerance: rounding on a split payment shouldn't leave an invoice
  -- eternally one cent short of paid.
  if paid_total >= invoice_total - 0.01 then
    update invoices
    set payment_status = 'paid',
        paid_date = coalesce(last_payment, current_date),
        payment_method = coalesce(payment_method, last_method)
    where id = target_invoice;
  else
    -- Part paid. Still outstanding for reporting, which is correct — cash basis counts
    -- it when it's settled.
    update invoices
    set payment_status = 'unpaid', paid_date = null
    where id = target_invoice and payment_status = 'paid';
  end if;
end;
$$ language plpgsql security definer;


create or replace function deposits_touch_invoice() returns trigger as $$
begin
  -- Both sides on an update, so moving a payment from one invoice to another corrects
  -- the status of each.
  if tg_op in ('UPDATE', 'DELETE') and old.invoice_id is not null then
    perform recompute_invoice_payment(old.invoice_id);
  end if;
  if tg_op in ('INSERT', 'UPDATE') and new.invoice_id is not null then
    perform recompute_invoice_payment(new.invoice_id);
  end if;
  return null;
end;
$$ language plpgsql security definer;

drop trigger if exists deposits_touch_invoice_trigger on deposits;
create trigger deposits_touch_invoice_trigger
  after insert or update or delete on deposits
  for each row execute function deposits_touch_invoice();


-- Bring every existing invoice into line. This is the part that restores the missing
-- revenue to the tax report.
do $$
declare inv record;
begin
  for inv in select distinct invoice_id from deposits where invoice_id is not null loop
    perform recompute_invoice_payment(inv.invoice_id);
  end loop;
end $$;


-- Verification: what changed, and anything still outstanding with money against it.
select c.name as company,
       i.doc_number,
       i.amount,
       coalesce(sum(d.amount), 0) as paid,
       i.payment_status,
       i.paid_date
from invoices i
left join deposits d on d.invoice_id = i.id
left join companies c on c.id = i.company_id
group by c.name, i.doc_number, i.amount, i.payment_status, i.paid_date
having coalesce(sum(d.amount), 0) > 0
order by c.name, i.doc_number;
