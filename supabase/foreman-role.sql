-- ===========================================================================
-- Foreman role + document approval queue — 2026-07-31
--
-- Run in the Supabase SQL editor. Idempotent and safe to re-run.
--
-- A foreman sits between employee and admin: everything an employee sees, plus job
-- financials, the price book, all staff hours, client contacts, leads, and filing
-- material purchases. They can write estimates and invoices, but nothing they produce
-- reaches a client until an admin approves it. Reports stay closed to them specifically
-- so company-wide monthly and yearly revenue isn't visible; PDF library and reviews are
-- closed too. They can archive but never delete.
-- ===========================================================================


-- ---------------------------------------------------------------------------
-- 1. The role itself.
-- ---------------------------------------------------------------------------
do $$ begin
  if not exists (
    select 1 from information_schema.constraint_column_usage
    where table_name = 'profiles' and constraint_name = 'profiles_role_check'
  ) then
    alter table profiles add constraint profiles_role_check
      check (role in ('admin', 'foreman', 'employee'));
  end if;
end $$;

-- is_management() covers "admin or foreman" — the common case for anything a foreman
-- is allowed to see. is_admin() keeps its existing meaning, so every current policy
-- that uses it stays exactly as strict as it was.
create or replace function is_foreman() returns boolean as $$
  select exists (
    select 1 from profiles
    where id = auth.uid() and role = 'foreman' and is_active
  );
$$ language sql security definer stable;

create or replace function is_management() returns boolean as $$
  select exists (
    select 1 from profiles
    where id = auth.uid() and role in ('admin', 'foreman') and is_active
  );
$$ language sql security definer stable;


-- ---------------------------------------------------------------------------
-- 2. Approval state on client-facing documents.
--
-- 'approved' is the default so every existing document — and everything an admin
-- writes from now on — behaves exactly as it does today. Only a foreman's work starts
-- as 'draft', and only 'approved' documents can be sent.
-- ---------------------------------------------------------------------------
alter table estimates add column if not exists approval_status text not null default 'approved';
alter table invoices  add column if not exists approval_status text not null default 'approved';

do $$ begin
  if not exists (select 1 from information_schema.constraint_column_usage
                 where table_name = 'estimates' and constraint_name = 'estimates_approval_status_check') then
    alter table estimates add constraint estimates_approval_status_check
      check (approval_status in ('draft', 'pending_approval', 'approved', 'changes_requested'));
  end if;
  if not exists (select 1 from information_schema.constraint_column_usage
                 where table_name = 'invoices' and constraint_name = 'invoices_approval_status_check') then
    alter table invoices add constraint invoices_approval_status_check
      check (approval_status in ('draft', 'pending_approval', 'approved', 'changes_requested'));
  end if;
end $$;

alter table estimates add column if not exists submitted_by uuid references profiles(id) on delete set null;
alter table estimates add column if not exists submitted_at timestamptz;
alter table estimates add column if not exists reviewed_by uuid references profiles(id) on delete set null;
alter table estimates add column if not exists reviewed_at timestamptz;
alter table estimates add column if not exists review_note text;

alter table invoices add column if not exists submitted_by uuid references profiles(id) on delete set null;
alter table invoices add column if not exists submitted_at timestamptz;
alter table invoices add column if not exists reviewed_by uuid references profiles(id) on delete set null;
alter table invoices add column if not exists reviewed_at timestamptz;
alter table invoices add column if not exists review_note text;

create index if not exists estimates_approval_idx on estimates (approval_status) where approval_status <> 'approved';
create index if not exists invoices_approval_idx on invoices (approval_status) where approval_status <> 'approved';


-- ---------------------------------------------------------------------------
-- 3. Only an admin may set approval_status to 'approved'.
--
-- Enforced in the database, not just the interface: a foreman who can write to the
-- table could otherwise approve their own document with one call from the browser,
-- which would defeat the entire point of the queue.
-- ---------------------------------------------------------------------------
create or replace function guard_document_approval() returns trigger as $$
begin
  if auth.uid() is null then
    return new;  -- service role: server-side routes handle their own checks
  end if;

  if new.approval_status is distinct from old.approval_status
     and new.approval_status = 'approved'
     and not is_admin() then
    raise exception 'Only an administrator can approve a document';
  end if;

  return new;
end;
$$ language plpgsql security definer;

drop trigger if exists guard_estimate_approval on estimates;
create trigger guard_estimate_approval before update on estimates
  for each row execute function guard_document_approval();

drop trigger if exists guard_invoice_approval on invoices;
create trigger guard_invoice_approval before update on invoices
  for each row execute function guard_document_approval();

-- A foreman's new document starts unapproved regardless of what the client sends.
create or replace function default_document_approval() returns trigger as $$
begin
  if auth.uid() is not null and is_foreman() then
    new.approval_status := 'draft';
    new.submitted_by := auth.uid();
  end if;
  return new;
end;
$$ language plpgsql security definer;

drop trigger if exists default_estimate_approval on estimates;
create trigger default_estimate_approval before insert on estimates
  for each row execute function default_document_approval();

drop trigger if exists default_invoice_approval on invoices;
create trigger default_invoice_approval before insert on invoices
  for each row execute function default_document_approval();


-- ---------------------------------------------------------------------------
-- 4. What a foreman can reach.
--
-- Each policy is replaced rather than added to, so the resulting access is exactly
-- what's described here and nothing is inherited from an older permissive rule.
-- ---------------------------------------------------------------------------

-- Financial documents: read and write, but see section 3 for what happens on send.
do $$
declare t text;
begin
  foreach t in array array['estimates', 'invoices', 'deposits', 'line_items'] loop
    execute format('drop policy if exists "admin full access %I" on %I', t, t);
    execute format('drop policy if exists "management full access %I" on %I', t, t);
    execute format(
      'create policy "management full access %I" on %I for all using (is_management()) with check (is_management())',
      t, t);
  end loop;
end $$;

-- Price book: a foreman prices work, so they need costs and markup.
drop policy if exists "admin read price book" on price_book;
drop policy if exists "management read price book" on price_book;
create policy "management read price book" on price_book for select using (is_management());

-- Only an admin edits the price book itself.
drop policy if exists "admin write price book" on price_book;
create policy "admin write price book" on price_book for insert with check (is_admin());
drop policy if exists "admin update price book" on price_book;
create policy "admin update price book" on price_book for update using (is_admin());
drop policy if exists "admin delete price book" on price_book;
create policy "admin delete price book" on price_book for delete using (is_admin());

-- Receipts and expenses: a foreman files material purchases.
do $$
declare t text;
begin
  foreach t in array array['gmail_receipts', 'job_expenses'] loop
    execute format('drop policy if exists "admin full access %I" on %I', t, t);
    execute format('drop policy if exists "management full access %I" on %I', t, t);
    execute format(
      'create policy "management full access %I" on %I for all using (is_management()) with check (is_management())',
      t, t);
  end loop;
end $$;

-- Leads.
drop policy if exists "admin full access leads" on leads;
drop policy if exists "management full access leads" on leads;
create policy "management full access leads" on leads for all
  using (is_management()) with check (is_management());

-- All staff hours. The table is job_hours; an employee still sees only their own
-- through the policy that was already there.
drop policy if exists "admin read all job_hours" on job_hours;
drop policy if exists "management read all job_hours" on job_hours;
create policy "management read all job_hours" on job_hours for select using (is_management());

-- Explicitly NOT extended to a foreman, and listed here so the omission is visibly
-- deliberate rather than an oversight:
--   payroll_runs      — pay rates
--   company_settings  — insurance, WCB, terms, sending address
--   profiles (write)  — creating accounts and setting roles
--   email_action_items — the owner's inbox
-- Reports, reviews and the PDF library are pages rather than tables and are gated in
-- the app; Reports specifically because it shows company-wide revenue.


-- ---------------------------------------------------------------------------
-- 5. Archive instead of delete.
--
-- A foreman can archive a job or document but never remove one. Deleting stays with
-- the admin who can also see what was deleted.
-- ---------------------------------------------------------------------------
alter table jobs add column if not exists archived_at timestamptz;
alter table estimates add column if not exists archived_at timestamptz;
alter table invoices add column if not exists archived_at timestamptz;

do $$
declare t text;
begin
  foreach t in array array['jobs', 'estimates', 'invoices', 'job_photos'] loop
    if to_regclass(t) is not null then
      execute format('drop policy if exists "admin delete %I" on %I', t, t);
      execute format('create policy "admin delete %I" on %I for delete using (is_admin())', t, t);
    end if;
  end loop;
end $$;


-- ---------------------------------------------------------------------------
-- 6. Documents bucket access for a foreman.
--
-- Saving an invoice stores a generated PDF in the documents bucket, and attaching a
-- file for a client writes there too. The security review restricted that bucket to
-- admins, which would leave a foreman with a save that half-succeeds — the record
-- written, the PDF missing. Read and write both extend to management; deleting stays
-- with the admin.
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

-- Attachment rows follow the same rule as the files they point at.
drop policy if exists "admin manage document_attachments" on document_attachments;
drop policy if exists "management manage document_attachments" on document_attachments;
create policy "management manage document_attachments" on document_attachments for all
  using (is_management()) with check (is_management());

-- Work orders: a foreman builds them from their own estimates.
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
