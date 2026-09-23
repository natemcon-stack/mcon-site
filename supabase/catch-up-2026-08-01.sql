-- ===========================================================================
-- Consolidated catch-up migration — 2026-08-01
--
-- Everything outstanding, in one run. Every statement is idempotent, so this is safe
-- whether or not parts of it have already been applied — anything already done is a
-- no-op rather than an error.
--
-- Assumes security-hardening.sql and foreman-role.sql have been run, since it builds on
-- is_admin() and is_management(). If either function is missing, run those first.
-- ===========================================================================


-- ---------------------------------------------------------------------------
-- 1. Foreman access to the documents bucket and work orders.
--
-- Saving an invoice writes a generated PDF into the documents bucket, and client
-- attachments live there too. The security review had restricted that bucket to admins,
-- which left a foreman with a save that half-succeeded: the record written, the PDF
-- missing, no error shown.
-- ---------------------------------------------------------------------------
drop policy if exists "admin read documents" on storage.objects;
drop policy if exists "management read documents" on storage.objects;
create policy "management read documents" on storage.objects for select to authenticated
  using (bucket_id = 'documents' and is_management());

drop policy if exists "admin write documents" on storage.objects;
drop policy if exists "management write documents" on storage.objects;
create policy "management write documents" on storage.objects for insert to authenticated
  with check (bucket_id = 'documents' and is_management());

drop policy if exists "management update documents" on storage.objects;
create policy "management update documents" on storage.objects for update to authenticated
  using (bucket_id = 'documents' and is_management())
  with check (bucket_id = 'documents' and is_management());

drop policy if exists "admin manage document_attachments" on document_attachments;
drop policy if exists "management manage document_attachments" on document_attachments;
create policy "management manage document_attachments" on document_attachments for all
  using (is_management()) with check (is_management());

do $$
declare t text;
begin
  foreach t in array array['work_orders', 'work_order_items', 'work_order_materials', 'work_order_resources'] loop
    if to_regclass(t) is not null then
      execute format('drop policy if exists "management full access %I" on %I', t, t);
      execute format(
        'create policy "management full access %I" on %I for all using (is_management()) with check (is_management())',
        t, t);
    end if;
  end loop;
end $$;


-- ---------------------------------------------------------------------------
-- 2. Payment de-duplication on an exact column rather than a text search.
--
-- Recording a PayPal payment checked for duplicates with ilike against the free-text
-- note. In a like pattern % and _ are wildcards, so a capture id carrying either would
-- match an unrelated deposit and the code would conclude the payment was already
-- recorded — and silently skip banking a real one. The unique index below is the actual
-- guard: two requests arriving at once both pass the application check, and the second
-- insert fails instead of double-recording.
-- ---------------------------------------------------------------------------
alter table deposits add column if not exists paypal_capture_id text;

-- Backfill from existing notes, so payments recorded before this are still recognised
-- and can't be recorded a second time.
update deposits
set paypal_capture_id = substring(note from 'PayPal capture ([A-Za-z0-9]+)')
where paypal_capture_id is null and note like 'PayPal capture %';

update deposits
set paypal_capture_id = substring(note from 'order ([A-Za-z0-9]+)')
where paypal_capture_id is null and note like '%PayPal deposit on estimate%';

create unique index if not exists deposits_paypal_capture_id_key
  on deposits (paypal_capture_id) where paypal_capture_id is not null;


-- ---------------------------------------------------------------------------
-- 3. Email delivery tracking on estimates and invoices.
--
-- Separate from the existing view tracking, which records the client opening the pay
-- page. These record what happened to the message: delivered, opened, bounced,
-- complained. The bounce is the valuable one — an invoice sent to a dead address looks
-- exactly like one being ignored, and the two need different responses.
-- ---------------------------------------------------------------------------
alter table estimates add column if not exists last_email_id text;
alter table estimates add column if not exists last_emailed_at timestamptz;
alter table estimates add column if not exists last_email_to text;
alter table estimates add column if not exists email_status text;
alter table estimates add column if not exists email_opened_at timestamptz;

alter table invoices add column if not exists last_email_id text;
alter table invoices add column if not exists last_emailed_at timestamptz;
alter table invoices add column if not exists last_email_to text;
alter table invoices add column if not exists email_status text;
alter table invoices add column if not exists email_opened_at timestamptz;

-- The webhook looks documents up by message id, so both need an index.
create index if not exists estimates_last_email_id_idx on estimates (last_email_id) where last_email_id is not null;
create index if not exists invoices_last_email_id_idx on invoices (last_email_id) where last_email_id is not null;


-- ---------------------------------------------------------------------------
-- 4. Verification — read the output.
--
-- Three rows expected: the deposits index, and the two email-id indexes.
-- ---------------------------------------------------------------------------
select 'index' as kind, indexname as name
from pg_indexes
where schemaname = 'public'
  and indexname in ('deposits_paypal_capture_id_key', 'estimates_last_email_id_idx', 'invoices_last_email_id_idx')

union all

select 'policy', policyname
from pg_policies
where policyname in ('management read documents', 'management write documents', 'management manage document_attachments')

order by kind, name;
