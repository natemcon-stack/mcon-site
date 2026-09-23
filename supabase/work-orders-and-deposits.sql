-- ===========================================================================
-- Work order assignment + linking payments to invoices — 2026-08-10
-- Run once. Idempotent.
-- ===========================================================================

-- ---------------------------------------------------------------------------
-- 1. Who a work order is for.
--
-- The date already existed; this adds the other half, so a work order can be given to
-- someone after it's generated rather than being decided up front in a dialog.
-- ---------------------------------------------------------------------------
alter table work_orders add column if not exists assigned_to uuid references profiles(id) on delete set null;

create index if not exists work_orders_assigned_idx on work_orders (assigned_to);


-- ---------------------------------------------------------------------------
-- 2. Which invoice a payment is against.
--
-- Deposits were recorded against the job only, so a job with two invoices had no way
-- to say which one a payment settled — and no way to show what's still outstanding on
-- either. Nullable on purpose: a deposit taken before any invoice exists is a real
-- thing and stays attached to the job alone.
-- ---------------------------------------------------------------------------
alter table deposits add column if not exists invoice_id uuid references invoices(id) on delete set null;

create index if not exists deposits_invoice_idx on deposits (invoice_id) where invoice_id is not null;


-- ---------------------------------------------------------------------------
-- 3. Attach existing PayPal payments to their invoice where it's unambiguous.
--
-- Only where the job has exactly one invoice — with two, guessing which one a payment
-- settled would be worse than leaving it for a person to assign.
-- ---------------------------------------------------------------------------
update deposits d
set invoice_id = i.id
from invoices i
where d.invoice_id is null
  and d.job_id = i.job_id
  and (select count(*) from invoices i2 where i2.job_id = d.job_id) = 1;


-- ---------------------------------------------------------------------------
-- 4. Verification.
-- ---------------------------------------------------------------------------
select
  (select count(*) from deposits where invoice_id is not null) as payments_linked,
  (select count(*) from deposits where invoice_id is null) as payments_unlinked;
