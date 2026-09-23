-- ===========================================================================
-- Importing historical Joist invoices — 2026-08-12
-- Run once. Idempotent.
-- ===========================================================================

-- The tax that was actually charged at the time. Without this, an imported 2025 invoice
-- would be re-taxed at today's rates whenever a report is run — quietly restating a
-- return that has already been filed.
alter table invoices add column if not exists imported_tax_amount numeric;
alter table invoices add column if not exists imported_tax_label text;
alter table estimates add column if not exists imported_tax_amount numeric;
alter table estimates add column if not exists imported_tax_label text;

-- Where a document came from, so re-importing the same PDF twice doesn't double-count
-- it in the tax summary. Joist's own invoice number is the natural key.
alter table invoices add column if not exists source_system text;
alter table invoices add column if not exists source_ref text;
alter table estimates add column if not exists source_system text;
alter table estimates add column if not exists source_ref text;

create unique index if not exists invoices_source_ref_key
  on invoices (company_id, source_system, source_ref)
  where source_ref is not null;

create unique index if not exists estimates_source_ref_key
  on estimates (company_id, source_system, source_ref)
  where source_ref is not null;

-- Verification.
select 'invoices' as table, count(*) filter (where source_system = 'joist') as imported from invoices
union all
select 'estimates', count(*) filter (where source_system = 'joist') from estimates;
