-- ===========================================================================
-- More than one email address per contact — 2026-09-22
-- Run once. Idempotent.
--
-- Plenty of clients are two people: a couple who both want the invoice, or an
-- office manager alongside the owner. A review request to one of them failed
-- because only a single address could be stored.
--
-- The primary address stays exactly where it is, so nothing that reads
-- contacts.email needs to change or risks breaking. Extra addresses are added
-- alongside and included on every send.
-- ===========================================================================

alter table contacts add column if not exists additional_emails text[] default '{}';

-- Never null, so code can spread it without a guard.
update contacts set additional_emails = '{}' where additional_emails is null;

-- Verification: any contact with more than one address on file.
select name, email, additional_emails
from contacts
where array_length(additional_emails, 1) > 0
order by name;
