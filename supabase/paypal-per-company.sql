-- ===========================================================================
-- Per-company PayPal credentials — 2026-08-12
-- Run once. Idempotent.
--
-- PayPal credentials came from environment variables: one set per deployment. Correct
-- when the app served one company; wrong now. Every client payment would have gone to
-- whoever owned the environment variables, whichever company issued the invoice.
--
-- The secret is stored encrypted (AES-256-GCM, see lib/secrets.js) because it isn't
-- ours — it can move money out of someone else's business.
-- ===========================================================================

alter table companies add column if not exists paypal_client_id text;
alter table companies add column if not exists paypal_secret_encrypted text;
alter table companies add column if not exists paypal_mode text not null default 'sandbox'
  check (paypal_mode in ('sandbox', 'live'));

-- The secret must never be readable from a browser session, even by an admin of that
-- company. It's written and read only by the server with the service role, which
-- bypasses RLS — so no policy grants access to it and none is needed.
--
-- Deliberately NOT a column-level revoke: Postgres errors on `select *` when any column
-- is unreadable, which would break every existing query against companies. The column
-- is simply never selected by client-side code.

-- Verification: mode set for every company, and who has connected an account.
select name,
       paypal_mode,
       (paypal_client_id is not null and paypal_secret_encrypted is not null) as paypal_connected
from companies
order by created_at;
