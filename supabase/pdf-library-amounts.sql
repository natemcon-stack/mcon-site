-- ===========================================================================
-- Amount and document number on filed PDFs — 2026-08-12
-- Run once. Idempotent.
--
-- The PDF library recorded who and when but not how much, so a filed invoice couldn't
-- be reconciled against anything without opening it. Now that the client, date and
-- total are read out of the PDF automatically, there's somewhere to put them.
-- ===========================================================================

alter table invoice_documents add column if not exists amount numeric;
alter table invoice_documents add column if not exists doc_number text;

-- Verification.
select count(*) as filed_documents,
       count(amount) as with_amount
from invoice_documents;
