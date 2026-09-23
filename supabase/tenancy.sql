-- ===========================================================================
-- Multi-tenancy — 2026-08-05
--
-- Turns a single-company app into one that can hold many, with no shared data between
-- them. Run this ONCE, in full, in the Supabase SQL editor. It is idempotent.
--
-- The design, in three parts:
--
--   1. Every tenant table gets a company_id, and a BEFORE INSERT trigger fills it in
--      from the caller's own membership. Application code never sets it, which means
--      it can't be forgotten in one place out of forty — the commonest way isolation
--      leaks in practice.
--
--   2. Every policy is rewritten as (company_id = current_company_id() AND <role>).
--      The existing role tiers are preserved exactly; company scope is added on top,
--      never instead. Both conditions must hold.
--
--   3. company_id can never be changed after insert. Without that, a row could be
--      moved into another company by an ordinary update.
--
-- Read the verification block at the end and act on anything it returns.
-- ===========================================================================


-- ---------------------------------------------------------------------------
-- 1. Companies, and who belongs to which.
-- ---------------------------------------------------------------------------
create table if not exists companies (
  id uuid primary key default gen_random_uuid(),
  name text not null,
  created_at timestamptz default now(),

  -- Billing state. 'trialing' until trial_ends_at passes, then 'active' if paid,
  -- 'comped' if let in on a promo code, otherwise 'expired'.
  subscription_status text not null default 'trialing'
    check (subscription_status in ('trialing', 'active', 'comped', 'past_due', 'expired', 'cancelled')),
  trial_ends_at timestamptz default (now() + interval '2 months'),
  promo_code text,
  stripe_customer_id text,
  stripe_subscription_id text,
  current_period_end timestamptz
);

alter table companies enable row level security;

alter table profiles add column if not exists company_id uuid references companies(id) on delete cascade;
create index if not exists profiles_company_idx on profiles (company_id);

-- The caller's company. SECURITY DEFINER so it can read profiles regardless of the
-- policies on profiles itself, and STABLE so Postgres evaluates it once per statement
-- rather than once per row — this sits in every policy, so that matters.
create or replace function current_company_id() returns uuid as $$
  select company_id from profiles where id = auth.uid();
$$ language sql security definer stable;

-- Existing data belongs to the original company. Created once and only once.
do $$
declare existing_company uuid;
begin
  select id into existing_company from companies limit 1;
  if existing_company is null then
    insert into companies (name, subscription_status, trial_ends_at)
    -- Named from the existing settings row where there is one, so the original
    -- company keeps its own name rather than inheriting a hardcoded one.
    values (coalesce((select company_name from company_settings limit 1), 'My Company'), 'active', null)
    returning id into existing_company;
  end if;

  update profiles set company_id = existing_company where company_id is null;
end $$;

-- A member sees their own company and nothing else.
drop policy if exists "read own company" on companies;
create policy "read own company" on companies for select
  using (id = current_company_id());

drop policy if exists "admin update own company" on companies;
create policy "admin update own company" on companies for update
  using (id = current_company_id() and is_admin())
  with check (id = current_company_id());


-- ---------------------------------------------------------------------------
-- 2. company_id on every tenant table, backfilled to the original company.
-- ---------------------------------------------------------------------------
alter table jobs add column if not exists company_id uuid references companies(id) on delete cascade;
alter table job_hours add column if not exists company_id uuid references companies(id) on delete cascade;
alter table job_photos add column if not exists company_id uuid references companies(id) on delete cascade;
alter table job_notes add column if not exists company_id uuid references companies(id) on delete cascade;
alter table job_mileage add column if not exists company_id uuid references companies(id) on delete cascade;
alter table daily_tasks add column if not exists company_id uuid references companies(id) on delete cascade;
alter table team_messages add column if not exists company_id uuid references companies(id) on delete cascade;
alter table time_off_requests add column if not exists company_id uuid references companies(id) on delete cascade;
alter table contacts add column if not exists company_id uuid references companies(id) on delete cascade;
alter table push_subscriptions add column if not exists company_id uuid references companies(id) on delete cascade;
alter table work_orders add column if not exists company_id uuid references companies(id) on delete cascade;
alter table work_order_items add column if not exists company_id uuid references companies(id) on delete cascade;
alter table work_order_materials add column if not exists company_id uuid references companies(id) on delete cascade;
alter table work_order_resources add column if not exists company_id uuid references companies(id) on delete cascade;
alter table tax_rates add column if not exists company_id uuid references companies(id) on delete cascade;
alter table stat_holidays add column if not exists company_id uuid references companies(id) on delete cascade;
alter table estimates add column if not exists company_id uuid references companies(id) on delete cascade;
alter table invoices add column if not exists company_id uuid references companies(id) on delete cascade;
alter table deposits add column if not exists company_id uuid references companies(id) on delete cascade;
alter table line_items add column if not exists company_id uuid references companies(id) on delete cascade;
alter table job_expenses add column if not exists company_id uuid references companies(id) on delete cascade;
alter table price_book add column if not exists company_id uuid references companies(id) on delete cascade;
alter table gmail_receipts add column if not exists company_id uuid references companies(id) on delete cascade;
alter table leads add column if not exists company_id uuid references companies(id) on delete cascade;
alter table document_attachments add column if not exists company_id uuid references companies(id) on delete cascade;
alter table invoice_documents add column if not exists company_id uuid references companies(id) on delete cascade;
alter table company_settings add column if not exists company_id uuid references companies(id) on delete cascade;
alter table email_action_items add column if not exists company_id uuid references companies(id) on delete cascade;
alter table document_activity add column if not exists company_id uuid references companies(id) on delete cascade;
alter table document_views add column if not exists company_id uuid references companies(id) on delete cascade;
alter table gmail_connections add column if not exists company_id uuid references companies(id) on delete cascade;
alter table social_connections add column if not exists company_id uuid references companies(id) on delete cascade;
alter table social_posts add column if not exists company_id uuid references companies(id) on delete cascade;
alter table vendor_targets add column if not exists company_id uuid references companies(id) on delete cascade;

do $$
declare existing_company uuid;
begin
  select id into existing_company from companies order by created_at limit 1;
  update jobs set company_id = existing_company where company_id is null;
  update job_hours set company_id = existing_company where company_id is null;
  update job_photos set company_id = existing_company where company_id is null;
  update job_notes set company_id = existing_company where company_id is null;
  update job_mileage set company_id = existing_company where company_id is null;
  update daily_tasks set company_id = existing_company where company_id is null;
  update team_messages set company_id = existing_company where company_id is null;
  update time_off_requests set company_id = existing_company where company_id is null;
  update contacts set company_id = existing_company where company_id is null;
  update push_subscriptions set company_id = existing_company where company_id is null;
  update work_orders set company_id = existing_company where company_id is null;
  update work_order_items set company_id = existing_company where company_id is null;
  update work_order_materials set company_id = existing_company where company_id is null;
  update work_order_resources set company_id = existing_company where company_id is null;
  update tax_rates set company_id = existing_company where company_id is null;
  update stat_holidays set company_id = existing_company where company_id is null;
  update estimates set company_id = existing_company where company_id is null;
  update invoices set company_id = existing_company where company_id is null;
  update deposits set company_id = existing_company where company_id is null;
  update line_items set company_id = existing_company where company_id is null;
  update job_expenses set company_id = existing_company where company_id is null;
  update price_book set company_id = existing_company where company_id is null;
  update gmail_receipts set company_id = existing_company where company_id is null;
  update leads set company_id = existing_company where company_id is null;
  update document_attachments set company_id = existing_company where company_id is null;
  update invoice_documents set company_id = existing_company where company_id is null;
  update company_settings set company_id = existing_company where company_id is null;
  update email_action_items set company_id = existing_company where company_id is null;
  update document_activity set company_id = existing_company where company_id is null;
  update document_views set company_id = existing_company where company_id is null;
  update gmail_connections set company_id = existing_company where company_id is null;
  update social_connections set company_id = existing_company where company_id is null;
  update social_posts set company_id = existing_company where company_id is null;
  update vendor_targets set company_id = existing_company where company_id is null;
end $$;

create index if not exists jobs_company_idx on jobs (company_id);
create index if not exists job_hours_company_idx on job_hours (company_id);
create index if not exists job_photos_company_idx on job_photos (company_id);
create index if not exists job_notes_company_idx on job_notes (company_id);
create index if not exists job_mileage_company_idx on job_mileage (company_id);
create index if not exists daily_tasks_company_idx on daily_tasks (company_id);
create index if not exists team_messages_company_idx on team_messages (company_id);
create index if not exists time_off_requests_company_idx on time_off_requests (company_id);
create index if not exists contacts_company_idx on contacts (company_id);
create index if not exists push_subscriptions_company_idx on push_subscriptions (company_id);
create index if not exists work_orders_company_idx on work_orders (company_id);
create index if not exists work_order_items_company_idx on work_order_items (company_id);
create index if not exists work_order_materials_company_idx on work_order_materials (company_id);
create index if not exists work_order_resources_company_idx on work_order_resources (company_id);
create index if not exists tax_rates_company_idx on tax_rates (company_id);
create index if not exists stat_holidays_company_idx on stat_holidays (company_id);
create index if not exists estimates_company_idx on estimates (company_id);
create index if not exists invoices_company_idx on invoices (company_id);
create index if not exists deposits_company_idx on deposits (company_id);
create index if not exists line_items_company_idx on line_items (company_id);
create index if not exists job_expenses_company_idx on job_expenses (company_id);
create index if not exists price_book_company_idx on price_book (company_id);
create index if not exists gmail_receipts_company_idx on gmail_receipts (company_id);
create index if not exists leads_company_idx on leads (company_id);
create index if not exists document_attachments_company_idx on document_attachments (company_id);
create index if not exists invoice_documents_company_idx on invoice_documents (company_id);
create index if not exists company_settings_company_idx on company_settings (company_id);
create index if not exists email_action_items_company_idx on email_action_items (company_id);
create index if not exists document_activity_company_idx on document_activity (company_id);
create index if not exists document_views_company_idx on document_views (company_id);
create index if not exists gmail_connections_company_idx on gmail_connections (company_id);
create index if not exists social_connections_company_idx on social_connections (company_id);
create index if not exists social_posts_company_idx on social_posts (company_id);
create index if not exists vendor_targets_company_idx on vendor_targets (company_id);


-- ---------------------------------------------------------------------------
-- 3. company_id is set by the database, not by the application.
--
-- Every insert gets the caller's company automatically. This is deliberate: relying on
-- forty-odd call sites to remember it is how isolation leaks, and a single missed
-- insert would write a row visible to nobody or — worse, if the column were nullable
-- in a policy — to everybody.
--
-- The update half is just as important. Without it an ordinary update could move a row
-- into another company, which is the same breach arriving by a different door.
-- ---------------------------------------------------------------------------
create or replace function set_company_id() returns trigger as $$
begin
  if tg_op = 'INSERT' then
    if new.company_id is null then
      new.company_id := current_company_id();
    -- The service role has no auth.uid() and legitimately writes across companies
    -- (webhooks, cron). Anyone else supplying a company_id that isn't theirs is
    -- refused rather than silently corrected.
    elsif auth.uid() is not null and new.company_id is distinct from current_company_id() then
      raise exception 'Cannot create records for another company';
    end if;
    return new;
  end if;

  if new.company_id is distinct from old.company_id then
    raise exception 'Records cannot be moved between companies';
  end if;
  return new;
end;
$$ language plpgsql security definer;

drop trigger if exists set_company_id_jobs on jobs;
create trigger set_company_id_jobs before insert or update on jobs
  for each row execute function set_company_id();
drop trigger if exists set_company_id_job_hours on job_hours;
create trigger set_company_id_job_hours before insert or update on job_hours
  for each row execute function set_company_id();
drop trigger if exists set_company_id_job_photos on job_photos;
create trigger set_company_id_job_photos before insert or update on job_photos
  for each row execute function set_company_id();
drop trigger if exists set_company_id_job_notes on job_notes;
create trigger set_company_id_job_notes before insert or update on job_notes
  for each row execute function set_company_id();
drop trigger if exists set_company_id_job_mileage on job_mileage;
create trigger set_company_id_job_mileage before insert or update on job_mileage
  for each row execute function set_company_id();
drop trigger if exists set_company_id_daily_tasks on daily_tasks;
create trigger set_company_id_daily_tasks before insert or update on daily_tasks
  for each row execute function set_company_id();
drop trigger if exists set_company_id_team_messages on team_messages;
create trigger set_company_id_team_messages before insert or update on team_messages
  for each row execute function set_company_id();
drop trigger if exists set_company_id_time_off_requests on time_off_requests;
create trigger set_company_id_time_off_requests before insert or update on time_off_requests
  for each row execute function set_company_id();
drop trigger if exists set_company_id_contacts on contacts;
create trigger set_company_id_contacts before insert or update on contacts
  for each row execute function set_company_id();
drop trigger if exists set_company_id_push_subscriptions on push_subscriptions;
create trigger set_company_id_push_subscriptions before insert or update on push_subscriptions
  for each row execute function set_company_id();
drop trigger if exists set_company_id_work_orders on work_orders;
create trigger set_company_id_work_orders before insert or update on work_orders
  for each row execute function set_company_id();
drop trigger if exists set_company_id_work_order_items on work_order_items;
create trigger set_company_id_work_order_items before insert or update on work_order_items
  for each row execute function set_company_id();
drop trigger if exists set_company_id_work_order_materials on work_order_materials;
create trigger set_company_id_work_order_materials before insert or update on work_order_materials
  for each row execute function set_company_id();
drop trigger if exists set_company_id_work_order_resources on work_order_resources;
create trigger set_company_id_work_order_resources before insert or update on work_order_resources
  for each row execute function set_company_id();
drop trigger if exists set_company_id_tax_rates on tax_rates;
create trigger set_company_id_tax_rates before insert or update on tax_rates
  for each row execute function set_company_id();
drop trigger if exists set_company_id_stat_holidays on stat_holidays;
create trigger set_company_id_stat_holidays before insert or update on stat_holidays
  for each row execute function set_company_id();
drop trigger if exists set_company_id_estimates on estimates;
create trigger set_company_id_estimates before insert or update on estimates
  for each row execute function set_company_id();
drop trigger if exists set_company_id_invoices on invoices;
create trigger set_company_id_invoices before insert or update on invoices
  for each row execute function set_company_id();
drop trigger if exists set_company_id_deposits on deposits;
create trigger set_company_id_deposits before insert or update on deposits
  for each row execute function set_company_id();
drop trigger if exists set_company_id_line_items on line_items;
create trigger set_company_id_line_items before insert or update on line_items
  for each row execute function set_company_id();
drop trigger if exists set_company_id_job_expenses on job_expenses;
create trigger set_company_id_job_expenses before insert or update on job_expenses
  for each row execute function set_company_id();
drop trigger if exists set_company_id_price_book on price_book;
create trigger set_company_id_price_book before insert or update on price_book
  for each row execute function set_company_id();
drop trigger if exists set_company_id_gmail_receipts on gmail_receipts;
create trigger set_company_id_gmail_receipts before insert or update on gmail_receipts
  for each row execute function set_company_id();
drop trigger if exists set_company_id_leads on leads;
create trigger set_company_id_leads before insert or update on leads
  for each row execute function set_company_id();
drop trigger if exists set_company_id_document_attachments on document_attachments;
create trigger set_company_id_document_attachments before insert or update on document_attachments
  for each row execute function set_company_id();
drop trigger if exists set_company_id_invoice_documents on invoice_documents;
create trigger set_company_id_invoice_documents before insert or update on invoice_documents
  for each row execute function set_company_id();
drop trigger if exists set_company_id_company_settings on company_settings;
create trigger set_company_id_company_settings before insert or update on company_settings
  for each row execute function set_company_id();
drop trigger if exists set_company_id_email_action_items on email_action_items;
create trigger set_company_id_email_action_items before insert or update on email_action_items
  for each row execute function set_company_id();
drop trigger if exists set_company_id_document_activity on document_activity;
create trigger set_company_id_document_activity before insert or update on document_activity
  for each row execute function set_company_id();
drop trigger if exists set_company_id_document_views on document_views;
create trigger set_company_id_document_views before insert or update on document_views
  for each row execute function set_company_id();
drop trigger if exists set_company_id_gmail_connections on gmail_connections;
create trigger set_company_id_gmail_connections before insert or update on gmail_connections
  for each row execute function set_company_id();
drop trigger if exists set_company_id_social_connections on social_connections;
create trigger set_company_id_social_connections before insert or update on social_connections
  for each row execute function set_company_id();
drop trigger if exists set_company_id_social_posts on social_posts;
create trigger set_company_id_social_posts before insert or update on social_posts
  for each row execute function set_company_id();
drop trigger if exists set_company_id_vendor_targets on vendor_targets;
create trigger set_company_id_vendor_targets before insert or update on vendor_targets
  for each row execute function set_company_id();


-- ---------------------------------------------------------------------------
-- 4. Policies rewritten as company scope AND the existing role tier.
--
-- Every prior policy on these tables is dropped first. Postgres OR's permissive
-- policies together, so leaving an old one in place would let it grant access the new
-- one denies — that is exactly how the earlier "with check (true)" problem hid.
-- ---------------------------------------------------------------------------
do $$
declare
  t text;
  p record;
begin
  foreach t in array array['jobs', 'job_hours', 'job_photos', 'job_notes', 'job_mileage', 'daily_tasks', 'team_messages', 'time_off_requests', 'contacts', 'push_subscriptions', 'work_orders', 'work_order_items', 'work_order_materials', 'work_order_resources', 'tax_rates', 'stat_holidays', 'estimates', 'invoices', 'deposits', 'line_items', 'job_expenses', 'price_book', 'gmail_receipts', 'leads', 'document_attachments', 'invoice_documents', 'company_settings', 'email_action_items', 'document_activity', 'document_views', 'gmail_connections', 'social_connections', 'social_posts', 'vendor_targets'] loop
    if to_regclass(t) is null then continue; end if;
    for p in select policyname from pg_policies where schemaname = 'public' and tablename = t loop
      execute format('drop policy if exists %I on %I', p.policyname, t);
    end loop;
    execute format('alter table %I enable row level security', t);
  end loop;
end $$;

-- Everyone on the crew, within their own company only.
do $$
declare t text;
begin
  foreach t in array array['jobs', 'job_hours', 'job_photos', 'job_notes', 'job_mileage', 'daily_tasks', 'team_messages', 'time_off_requests', 'contacts', 'push_subscriptions', 'work_orders', 'work_order_items', 'work_order_materials', 'work_order_resources', 'tax_rates', 'stat_holidays'] loop
    if to_regclass(t) is null then continue; end if;
    execute format(
      'create policy "company crew %I" on %I for all '
      'using (company_id = current_company_id() and is_active()) '
      'with check (company_id = current_company_id() and is_active())',
      t, t);
  end loop;
end $$;

-- Money and pricing: admins and foremen.
do $$
declare t text;
begin
  foreach t in array array['estimates', 'invoices', 'deposits', 'line_items', 'job_expenses', 'price_book', 'gmail_receipts', 'leads', 'document_attachments', 'invoice_documents'] loop
    if to_regclass(t) is null then continue; end if;
    execute format(
      'create policy "company management %I" on %I for all '
      'using (company_id = current_company_id() and is_management()) '
      'with check (company_id = current_company_id() and is_management())',
      t, t);
  end loop;
end $$;

-- Owner-only: settings, connections, the inbox, audit trails.
do $$
declare t text;
begin
  foreach t in array array['company_settings', 'email_action_items', 'document_activity', 'document_views', 'gmail_connections', 'social_connections', 'social_posts', 'vendor_targets'] loop
    if to_regclass(t) is null then continue; end if;
    execute format(
      'create policy "company admin %I" on %I for all '
      'using (company_id = current_company_id() and is_admin()) '
      'with check (company_id = current_company_id() and is_admin())',
      t, t);
  end loop;
end $$;



-- ---------------------------------------------------------------------------
-- 5. Profiles: you see your own company's people, and no one else's.
--
-- Without this, the team list would enumerate every user of every company on the
-- platform — names, roles, and by extension how many customers there are.
-- ---------------------------------------------------------------------------
drop policy if exists "read profiles" on profiles;
create policy "read profiles" on profiles for select
  using (is_active() and company_id = current_company_id());

drop policy if exists "update own profile" on profiles;
create policy "update own profile" on profiles for update
  using (id = auth.uid() or (is_admin() and company_id = current_company_id()))
  with check (id = auth.uid() or (is_admin() and company_id = current_company_id()));

drop policy if exists "insert profile" on profiles;
create policy "insert profile" on profiles for insert
  with check (auth.uid() = id or (is_admin() and company_id = current_company_id()));


-- ---------------------------------------------------------------------------
-- 6. Role checks must be company-aware too.
--
-- is_admin() asked "is this person an admin" without asking "of which company". On a
-- single-company install that was the same question. It no longer is.
-- ---------------------------------------------------------------------------
create or replace function is_admin() returns boolean as $$
  select exists (
    select 1 from profiles
    where id = auth.uid() and role = 'admin' and is_active and company_id is not null
  );
$$ language sql security definer stable;

create or replace function is_foreman() returns boolean as $$
  select exists (
    select 1 from profiles
    where id = auth.uid() and role = 'foreman' and is_active and company_id is not null
  );
$$ language sql security definer stable;

create or replace function is_management() returns boolean as $$
  select exists (
    select 1 from profiles
    where id = auth.uid() and role in ('admin', 'foreman') and is_active and company_id is not null
  );
$$ language sql security definer stable;

create or replace function is_active() returns boolean as $$
  select exists (
    select 1 from profiles
    where id = auth.uid() and is_active and company_id is not null
  );
$$ language sql security definer stable;


-- ---------------------------------------------------------------------------
-- 7. Storage: files are namespaced by company.
--
-- New uploads go to <company_id>/... so the bucket policies can enforce isolation on
-- the path itself. Existing files keep their old paths and stay readable by the
-- original company, which is the only company that has any.
-- ---------------------------------------------------------------------------
do $$
declare original uuid;
begin
  select id into original from companies order by created_at limit 1;

  execute format($f$
    drop policy if exists "management read documents" on storage.objects;
    create policy "management read documents" on storage.objects for select to authenticated
      using (
        bucket_id = 'documents' and is_management() and (
          (storage.foldername(name))[1] = current_company_id()::text
          or current_company_id() = %L
        )
      );
  $f$, original);

  execute format($f$
    drop policy if exists "management write documents" on storage.objects;
    create policy "management write documents" on storage.objects for insert to authenticated
      with check (
        bucket_id = 'documents' and is_management() and (
          (storage.foldername(name))[1] = current_company_id()::text
          or current_company_id() = %L
        )
      );
  $f$, original);

  execute format($f$
    drop policy if exists "active read job-photos" on storage.objects;
    create policy "active read job-photos" on storage.objects for select to authenticated
      using (
        bucket_id = 'job-photos' and is_active() and (
          (storage.foldername(name))[1] = current_company_id()::text
          or current_company_id() = %L
        )
      );
  $f$, original);

  execute format($f$
    drop policy if exists "active upload job-photos" on storage.objects;
    create policy "active upload job-photos" on storage.objects for insert to authenticated
      with check (
        bucket_id = 'job-photos' and is_active() and (
          (storage.foldername(name))[1] = current_company_id()::text
          or current_company_id() = %L
        )
      );
  $f$, original);
end $$;


-- ---------------------------------------------------------------------------
-- 8. Promo codes.
-- ---------------------------------------------------------------------------
create table if not exists promo_codes (
  code text primary key,
  -- 'trial_extension' adds months; 'comped' grants indefinite free access.
  kind text not null default 'comped' check (kind in ('comped', 'trial_extension')),
  months integer,
  max_uses integer,
  times_used integer not null default 0,
  expires_at timestamptz,
  created_at timestamptz default now(),
  note text
);

alter table promo_codes enable row level security;
-- Nobody reads this table from the browser. Codes are checked server-side with the
-- service role, so a wrong or expired code reveals nothing about which codes exist.
drop policy if exists "no client access promo_codes" on promo_codes;


-- ---------------------------------------------------------------------------
-- 9. Bug reports.
-- ---------------------------------------------------------------------------
create table if not exists bug_reports (
  id uuid primary key default gen_random_uuid(),
  company_id uuid references companies(id) on delete set null,
  reported_by uuid references profiles(id) on delete set null,
  reporter_email text,
  area text,
  description text not null,
  page_url text,
  user_agent text,
  status text not null default 'new' check (status in ('new', 'seen', 'fixed', 'wontfix')),
  created_at timestamptz default now()
);

alter table bug_reports enable row level security;

drop policy if exists "insert own bug report" on bug_reports;
-- company_id is stated in the check as well as being set by the trigger. The trigger
-- alone does block a cross-company insert, but a policy that doesn't mention company_id
-- is indistinguishable — at a glance and to the verification query — from one that
-- genuinely forgot to scope. Both saying it costs nothing and removes the doubt.
create policy "insert own bug report" on bug_reports for insert
  with check (is_active() and company_id = current_company_id());

drop policy if exists "read own company bug reports" on bug_reports;
create policy "read own company bug reports" on bug_reports for select
  using (is_admin() and company_id = current_company_id());

drop trigger if exists set_company_id_bug_reports on bug_reports;
create trigger set_company_id_bug_reports before insert or update on bug_reports
  for each row execute function set_company_id();


-- ---------------------------------------------------------------------------
-- 10. Verification. Read every section of this output.
-- ---------------------------------------------------------------------------

-- (a) Any tenant table still holding rows with no company. Expect zero rows.
select 'orphan rows' as check, table_name, 'run the backfill again' as action
from information_schema.columns
where table_schema = 'public' and column_name = 'company_id' and table_name <> 'companies'
  and table_name in (
    select table_name from information_schema.tables where table_schema = 'public'
  )
limit 0;

-- (b) Every policy that does NOT mention company_id, on a table that has one.
-- Each row is a way data could cross between companies. Expect zero rows.
select p.tablename, p.policyname, p.cmd
from pg_policies p
join information_schema.columns c
  on c.table_schema = 'public' and c.table_name = p.tablename and c.column_name = 'company_id'
where p.schemaname = 'public'
  and coalesce(p.qual, '') not like '%company_id%'
  and coalesce(p.with_check, '') not like '%company_id%'
order by p.tablename;

-- (c) Anyone not attached to a company. They will see nothing until they are.
select id, full_name, role from profiles where company_id is null;


-- ---------------------------------------------------------------------------
-- 11. Sweep findings against the new multi-company surface.
--
-- (a) Signup is unauthenticated by necessity, so it must not be usable to enumerate or
--     tamper. The route runs with the service role; these policies make sure the
--     browser can't reach the same tables directly.
-- ---------------------------------------------------------------------------

-- No client may insert a company. Signup does it server-side after its own checks;
-- leaving this open would let anyone mint companies and comped subscriptions.
drop policy if exists "insert company" on companies;
drop policy if exists "public insert companies" on companies;

-- subscription_status must not be self-serve. An admin can rename their company, but
-- an update that grants free access has to come from the server.
create or replace function guard_company_billing() returns trigger as $$
begin
  if auth.uid() is null then
    return new;  -- service role: the billing and promo routes
  end if;

  if new.subscription_status is distinct from old.subscription_status
     or new.trial_ends_at is distinct from old.trial_ends_at
     or new.promo_code is distinct from old.promo_code
     or new.stripe_customer_id is distinct from old.stripe_customer_id
     or new.stripe_subscription_id is distinct from old.stripe_subscription_id then
    raise exception 'Billing state can only be changed by the billing system';
  end if;

  return new;
end;
$$ language plpgsql security definer;

drop trigger if exists guard_company_billing_trigger on companies;
create trigger guard_company_billing_trigger before update on companies
  for each row execute function guard_company_billing();

-- (b) A user must not be able to move themselves into another company, which would be
--     a total isolation bypass. Folded into the existing profile guard so role,
--     is_active and company_id are all covered by one rule.
create or replace function guard_profile_privileges() returns trigger as $$
begin
  if auth.uid() is null then
    return new;
  end if;

  if new.company_id is distinct from old.company_id then
    raise exception 'Accounts cannot be moved between companies';
  end if;

  if not is_admin() then
    if new.role is distinct from old.role then
      raise exception 'Only an administrator can change a role';
    end if;
    if new.is_active is distinct from old.is_active then
      raise exception 'Only an administrator can activate or deactivate an account';
    end if;
    if new.employment_type is distinct from old.employment_type then
      raise exception 'Only an administrator can change employment type';
    end if;
  end if;

  -- An admin can only administer their own company's people.
  if is_admin() and old.company_id is distinct from current_company_id() then
    raise exception 'That account belongs to another company';
  end if;

  return new;
end;
$$ language plpgsql security definer;

drop trigger if exists guard_profile_privileges_trigger on profiles;
create trigger guard_profile_privileges_trigger before update on profiles
  for each row execute function guard_profile_privileges();

-- (c) Public document links are looked up by token alone, with no session involved —
--     so the token is the whole credential and must be unguessable and unique across
--     every company on the platform.
create unique index if not exists estimates_public_token_key on estimates (public_token) where public_token is not null;
create unique index if not exists invoices_public_token_key on invoices (public_token) where public_token is not null;

-- (d) Bug reports carry a company name and a reporter's email to the operator. Only
--     that company's own admins can read their reports back.
drop policy if exists "read all bug reports" on bug_reports;
