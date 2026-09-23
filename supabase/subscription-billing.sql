-- ===========================================================================
-- Subscription billing — 2026-08-05
--
-- Subscribers are invoiced through the operator's own company, using the invoicing and
-- PayPal flow that already exists. No second payment system: subscription revenue lands
-- in the same invoices, reports, GST calculation and accountant export as contracting
-- revenue, which is the whole reason for doing it this way.
--
-- Run after tenancy.sql and company-config.sql. Idempotent.
-- ===========================================================================


-- ---------------------------------------------------------------------------
-- 1. What each company is signed up for.
-- ---------------------------------------------------------------------------
alter table companies add column if not exists billing_period text
  check (billing_period in ('monthly', 'annual'));
alter table companies add column if not exists price numeric;
alter table companies add column if not exists next_renewal_at date;

-- Set when an invoice goes unpaid past its due date. Access continues — they keep their
-- jobs, hours, photos and can still be paid by their own clients — but no new estimates
-- or invoices can be raised. Enough to prompt a payment without holding their business
-- hostage over it.
alter table companies add column if not exists restricted_at timestamptz;

-- The contact record representing this subscriber in the operator's books, so a second
-- one isn't created every renewal.
alter table companies add column if not exists billing_contact_id uuid references contacts(id) on delete set null;


-- ---------------------------------------------------------------------------
-- 2. Tie a subscription invoice back to the company it renews.
--
-- Without this, a paid invoice is just money — nothing tells the platform which
-- company's access to extend.
-- ---------------------------------------------------------------------------
alter table invoices add column if not exists subscription_company_id uuid references companies(id) on delete set null;
alter table invoices add column if not exists subscription_period_start date;
alter table invoices add column if not exists subscription_period_end date;

create index if not exists invoices_subscription_company_idx
  on invoices (subscription_company_id) where subscription_company_id is not null;


-- ---------------------------------------------------------------------------
-- 3. Which company is the operator's — the one that bills everyone else.
--
-- Defaults to the oldest, which is the original install. Override by setting
-- PLATFORM_COMPANY_ID if that ever stops being true.
-- ---------------------------------------------------------------------------
create or replace function platform_company_id() returns uuid as $$
  select id from companies order by created_at limit 1;
$$ language sql security definer stable;


-- ---------------------------------------------------------------------------
-- 4. Existing companies get a renewal date so the first run has something to do.
--    Trialing companies renew when their trial ends; anyone already active renews
--    a month out rather than being billed retroactively.
-- ---------------------------------------------------------------------------
update companies
set next_renewal_at = coalesce(trial_ends_at::date, (now() + interval '1 month')::date)
where next_renewal_at is null
  and id <> platform_company_id()
  and subscription_status in ('trialing', 'active', 'past_due');


-- ---------------------------------------------------------------------------
-- 5. Verification.
-- ---------------------------------------------------------------------------
select c.name,
       c.subscription_status,
       c.billing_period,
       c.price,
       c.next_renewal_at,
       (c.id = platform_company_id()) as is_operator
from companies c
order by c.created_at;


-- ---------------------------------------------------------------------------
-- 6. A standing job per subscriber (added after testing, 2026-08-06).
--
-- Invoices hang off a job — the client is read from the job rather than stored on the
-- invoice itself. Subscription invoices therefore need a job to belong to, one per
-- subscriber, created on first billing and reused after that.
-- ---------------------------------------------------------------------------
alter table companies add column if not exists billing_job_id uuid references jobs(id) on delete set null;
