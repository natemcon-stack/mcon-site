-- ===========================================================================
-- Deposits paid on an estimate weren't credited to its invoice — 2026-08-12
--
-- A client who paid a deposit through the estimate link was then shown the full amount
-- on the invoice and asked to pay it again. The payment was recorded against the job but
-- never attached to the invoice, and the pay page never looked at payments at all.
--
-- Code is fixed. This attaches the payments already taken, so existing invoices show the
-- right balance.
-- ===========================================================================

-- Only where the job has exactly one invoice — with two, guessing which one a deposit
-- settles would be worse than leaving it for a person to assign.
update deposits d
set invoice_id = i.id
from invoices i
where d.invoice_id is null
  and d.job_id = i.job_id
  and (select count(*) from invoices i2 where i2.job_id = d.job_id) = 1;

-- 1. Any invoice where a payment is now credited. Check these look right.
select c.name as company,
       i.doc_number,
       i.amount as invoice_amount,
       sum(d.amount) as paid_to_date,
       i.payment_status
from invoices i
join deposits d on d.invoice_id = i.id
left join companies c on c.id = i.company_id
group by c.name, i.doc_number, i.amount, i.payment_status
order by c.name, i.doc_number;

-- 2. Payments still attached to a job but no invoice — these are on jobs with more than
-- one invoice and need assigning by hand on the Financials tab.
select c.name as company, j.title as job, d.date, d.amount, d.payment_method
from deposits d
join jobs j on j.id = d.job_id
left join companies c on c.id = d.company_id
where d.invoice_id is null
order by d.date desc;
