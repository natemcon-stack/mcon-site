-- ===========================================================================
-- Payments recorded short by the tax — 2026-09-23
-- READ ONLY. This finds the problem; it does not change anything.
--
-- invoices.amount stores the PRE-TAX subtotal. The "Mark paid" button worked out the
-- remaining balance from that figure, so an invoice for $40 + 5% GST was recorded as
-- paid in full at $40 rather than $42.
--
-- The client-facing pay page always computed the correct total, so anyone who paid by
-- PayPal or from the emailed link paid the right amount. The risk is invoices marked
-- paid by hand for cash, cheque or e-transfer, where the short figure may have been
-- what was actually collected.
-- ===========================================================================

with doc_tax as (
  select
    i.id,
    i.doc_number,
    i.date,
    i.amount                                   as subtotal,
    coalesce(i.markup_pct, 0)                  as markup_pct,
    coalesce(i.discount_amount, 0)             as discount,
    i.tax_exempt,
    i.gst_enabled,
    i.company_id,
    c.name                                     as company,
    -- Same arithmetic the app uses: markup, then discount, then tax on the remainder.
    round(
      ((i.amount * (1 + coalesce(i.markup_pct, 0) / 100.0)) - coalesce(i.discount_amount, 0))
      * (1 + case when i.tax_exempt then 0 else coalesce((
            select sum(t.rate) / 100.0 from tax_rates t
            where t.company_id = i.company_id and t.enabled
              and (i.gst_enabled or upper(trim(t.name)) <> 'GST')
          ), 0) end)
    , 2) as true_total
  from invoices i
  left join companies c on c.id = i.company_id
)
select
  d.company,
  d.doc_number,
  d.date,
  d.subtotal,
  d.true_total,
  coalesce(sum(p.amount), 0)                      as recorded_paid,
  round(d.true_total - coalesce(sum(p.amount), 0), 2) as still_owed
from doc_tax d
left join deposits p on p.invoice_id = d.id
group by d.company, d.doc_number, d.date, d.subtotal, d.true_total
having round(d.true_total - coalesce(sum(p.amount), 0), 2) between 0.01 and 100000
   and coalesce(sum(p.amount), 0) > 0
order by d.date desc;
