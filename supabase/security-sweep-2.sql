-- ===========================================================================
-- Security sweep #2 — 2026-08-01
--
-- Adversarial pass: what could someone actually do with a stolen session, a
-- deactivated account, or a client document link. Run in the Supabase SQL editor.
-- Idempotent and safe to re-run.
-- ===========================================================================


-- ---------------------------------------------------------------------------
-- 1. HIGH — deactivating an admin or foreman did not actually revoke anything.
--
-- is_admin() checked the role and nothing else, so `is_active = false` never applied
-- to any policy written in terms of it — estimates, invoices, deposits, line items,
-- leads, receipts, payroll, company settings, the approvals queue. An account you
-- switched off kept full access to all of it, and the app signing them out on the
-- client side does nothing to stop direct API calls made with the anon key and a
-- still-valid token.
--
-- is_active() was already correct and covers the crew tables, which is why this went
-- unnoticed: turning off an employee worked, turning off an admin didn't.
-- ---------------------------------------------------------------------------
create or replace function is_admin() returns boolean as $$
  select exists (
    select 1 from profiles
    where id = auth.uid() and role = 'admin' and is_active
  );
$$ language sql security definer stable;


-- ---------------------------------------------------------------------------
-- 2. MEDIUM — document_activity accepted writes from anyone, signed in or not.
--
-- An early policy created it with `with check (true)`. Policies are OR'd, so the
-- admin-only one added later never restricted anything: the permissive rule still
-- granted the insert. Anyone holding the public anon key — which ships in the browser
-- bundle by design — could write unlimited arbitrary rows into the activity log,
-- either to bury real events or simply to fill the database.
--
-- The public pay page writes activity through a server route using the service role,
-- so it is unaffected by this.
-- ---------------------------------------------------------------------------
drop policy if exists "insert document_activity" on document_activity;
drop policy if exists "public insert document_activity" on document_activity;

do $$ begin
  if not exists (select 1 from pg_policies
                 where tablename = 'document_activity' and policyname = 'admin insert document_activity') then
    create policy "admin insert document_activity" on document_activity for insert with check (is_admin());
  end if;
end $$;


-- ---------------------------------------------------------------------------
-- 3. MEDIUM — the same permissive-policy pattern elsewhere.
--
-- Any `with check (true)` or bare `auth.role() = 'authenticated'` policy left on a
-- table that also has a stricter one is dead weight that silently overrides it.
-- These are the remaining ones.
-- ---------------------------------------------------------------------------
drop policy if exists "insert document_views" on document_views;
drop policy if exists "public insert document_views" on document_views;

-- Profiles are readable so names can appear on checklists and hours. Restricting to
-- active accounts means a disabled login can't enumerate the team either.
drop policy if exists "read profiles" on profiles;
create policy "read profiles" on profiles for select using (is_active());


-- ---------------------------------------------------------------------------
-- 4. MEDIUM — an estimate could be signed before it was approved.
--
-- The public GET already 404s an unapproved document, but the sign endpoint is a
-- separate POST and never checked. Anyone who had been given a link while the document
-- was still in draft could sign it, and if auto_generate_invoice was set that produced
-- a real invoice from unapproved work.
--
-- Enforced in the database as well as the route, because the route is not the only
-- thing that writes here.
-- ---------------------------------------------------------------------------
create or replace function guard_document_signature() returns trigger as $$
begin
  if new.signature_name is distinct from old.signature_name
     and new.signature_name is not null
     and coalesce(new.approval_status, 'approved') <> 'approved' then
    raise exception 'This document has not been approved yet';
  end if;
  return new;
end;
$$ language plpgsql security definer;

drop trigger if exists guard_estimate_signature on estimates;
create trigger guard_estimate_signature before update on estimates
  for each row execute function guard_document_signature();


-- ---------------------------------------------------------------------------
-- 5. LOW — cap free-text written by unauthenticated callers.
--
-- signature_name comes from whoever holds a document link. React escapes it on
-- display, so this is a storage-abuse limit rather than an injection fix.
-- ---------------------------------------------------------------------------
do $$ begin
  if not exists (select 1 from information_schema.constraint_column_usage
                 where table_name = 'estimates' and constraint_name = 'estimates_signature_name_length') then
    alter table estimates add constraint estimates_signature_name_length
      check (signature_name is null or length(signature_name) <= 120);
  end if;
  if not exists (select 1 from information_schema.constraint_column_usage
                 where table_name = 'invoices' and constraint_name = 'invoices_signature_name_length') then
    alter table invoices add constraint invoices_signature_name_length
      check (signature_name is null or length(signature_name) <= 120);
  end if;
end $$;


-- ---------------------------------------------------------------------------
-- 6. Verification — run this and read the output.
--
-- Any row returned by the first query is a policy that grants access without checking
-- whether the account is still active. Empty result is what you want.
-- ---------------------------------------------------------------------------
select tablename, policyname, cmd
from pg_policies
where schemaname = 'public'
  and (qual ilike '%auth.role() = ''authenticated''%'
       or with_check ilike '%auth.role() = ''authenticated''%'
       or qual = 'true'
       or with_check = 'true')
order by tablename, policyname;


-- ---------------------------------------------------------------------------
-- 7. Payment de-duplication on an exact column, not a text search (2026-08-01).
--
-- Recording a PayPal payment checked for a duplicate with ilike on the free-text note
-- field. Two problems with that: % and _ are wildcards in a like pattern, so a capture
-- id containing either would match unrelated rows and silently skip recording a real
-- payment; and matching money against a description is fragile regardless. The id now
-- has its own column with a unique index, so the database enforces one deposit per
-- capture rather than the application hoping.
-- ---------------------------------------------------------------------------
alter table deposits add column if not exists paypal_capture_id text;

-- Backfill from the existing notes so previously recorded payments are still recognised
-- and can't be re-recorded.
update deposits
set paypal_capture_id = substring(note from 'PayPal capture ([A-Za-z0-9]+)')
where paypal_capture_id is null and note like 'PayPal capture %';

update deposits
set paypal_capture_id = substring(note from 'order ([A-Za-z0-9]+)')
where paypal_capture_id is null and note like '%PayPal deposit on estimate%';

create unique index if not exists deposits_paypal_capture_id_key
  on deposits (paypal_capture_id) where paypal_capture_id is not null;
