-- ===========================================================================
-- Receipt parsing fields — 2026-08-13
-- Run once. Idempotent.
--
-- The receipt scanner was extracting nothing useful from real supplier documents. The
-- old patterns matched a flat blob of text, which fails on every invoice tested: every
-- vendor prints its GST registration number immediately after the word "GST", so a
-- pattern looking for "GST then a number" reliably found the registration number rather
-- than the tax.
--
-- These columns hold what the rewritten parser now finds.
-- ===========================================================================

-- PST is claimed differently from GST and shouldn't be lumped in with it.
alter table gmail_receipts add column if not exists extracted_pst numeric;

-- The date printed on the receipt, which is what the expense should be dated — not the
-- date the email happened to arrive.
alter table gmail_receipts add column if not exists extracted_date date;

-- Anything the parser was unsure about, kept with the receipt so it can be shown at
-- review time rather than discovered in a tax report.
alter table gmail_receipts add column if not exists parse_warnings text[];

alter table job_expenses add column if not exists pst_amount numeric;

-- Verification.
select count(*) as receipts,
       count(extracted_amount) as with_amount,
       count(extracted_gst) as with_gst
from gmail_receipts;
