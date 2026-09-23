-- Contractor CRM schema
-- Run this in the Supabase SQL Editor (Project > SQL Editor > New query)

create table if not exists profiles (
  id uuid primary key references auth.users(id) on delete cascade,
  full_name text,
  role text not null default 'employee', -- 'admin' or 'employee'
  created_at timestamptz default now()
);

create table if not exists contacts (
  id uuid primary key default gen_random_uuid(),
  name text not null,
  email text,
  phone text,
  address text,
  source text default 'referral',
  notes text,
  external_ref text, -- id from imported system (e.g. Joist), for de-duping re-imports
  created_at timestamptz default now()
);

create table if not exists jobs (
  id uuid primary key default gen_random_uuid(),
  job_number text,
  title text not null,
  contact_id uuid references contacts(id) on delete set null,
  address text,
  status text default 'estimate', -- estimate | active | on_hold | complete
  start_date date,
  end_date date,
  notes text,
  created_at timestamptz default now()
);

create table if not exists job_hours (
  id uuid primary key default gen_random_uuid(),
  job_id uuid references jobs(id) on delete cascade,
  worker_name text not null,
  date date not null,
  hours numeric not null,
  note text,
  created_at timestamptz default now()
);

create table if not exists job_expenses (
  id uuid primary key default gen_random_uuid(),
  job_id uuid references jobs(id) on delete cascade,
  description text not null,
  category text default 'materials',
  amount numeric not null,
  date date not null,
  created_at timestamptz default now()
);

create table if not exists job_photos (
  id uuid primary key default gen_random_uuid(),
  job_id uuid references jobs(id) on delete cascade,
  url text not null,
  caption text,
  lat numeric,
  lng numeric,
  created_at timestamptz default now()
);

create table if not exists estimates (
  id uuid primary key default gen_random_uuid(),
  job_id uuid references jobs(id) on delete cascade,
  amount numeric not null,
  date date not null,
  note text,
  external_ref text,
  created_at timestamptz default now()
);

create table if not exists invoices (
  id uuid primary key default gen_random_uuid(),
  job_id uuid references jobs(id) on delete cascade,
  amount numeric not null,
  date date not null,
  note text,
  external_ref text,
  created_at timestamptz default now()
);

create table if not exists deposits (
  id uuid primary key default gen_random_uuid(),
  job_id uuid references jobs(id) on delete cascade,
  amount numeric not null,
  date date not null,
  note text,
  created_at timestamptz default now()
);

create table if not exists work_orders (
  id uuid primary key default gen_random_uuid(),
  job_id uuid references jobs(id) on delete cascade,
  title text not null,
  source_type text, -- 'estimate' | 'invoice' | 'manual'
  source_id uuid,
  created_by uuid references profiles(id),
  created_at timestamptz default now()
);

create table if not exists work_order_items (
  id uuid primary key default gen_random_uuid(),
  work_order_id uuid references work_orders(id) on delete cascade,
  description text not null,
  sort_order int default 0,
  checked_at timestamptz,
  checked_by uuid references profiles(id),
  created_at timestamptz default now()
);

create table if not exists push_subscriptions (
  id uuid primary key default gen_random_uuid(),
  user_id uuid references profiles(id) on delete cascade unique,
  subscription jsonb not null,
  created_at timestamptz default now()
);

-- Enable Row Level Security
alter table profiles enable row level security;
alter table contacts enable row level security;
alter table jobs enable row level security;
alter table job_hours enable row level security;
alter table job_expenses enable row level security;
alter table job_photos enable row level security;
alter table estimates enable row level security;
alter table invoices enable row level security;
alter table deposits enable row level security;
alter table work_orders enable row level security;
alter table work_order_items enable row level security;
alter table push_subscriptions enable row level security;

-- Helper: is the current user an admin?
create or replace function is_admin() returns boolean as $$
  select exists (
    select 1 from profiles where id = auth.uid() and role = 'admin'
  );
$$ language sql security definer stable;

-- Profiles: everyone signed in can read all profiles (needed for names on checklists),
-- only admins can change roles.
do $$ begin
  if not exists (select 1 from pg_policies where tablename = 'profiles' and policyname = 'read profiles') then
    create policy "read profiles" on profiles for select using (auth.role() = 'authenticated');
  end if;
end $$;
do $$ begin
  if not exists (select 1 from pg_policies where tablename = 'profiles' and policyname = 'update own profile') then
    create policy "update own profile" on profiles for update using (auth.uid() = id or is_admin());
  end if;
end $$;
do $$ begin
  if not exists (select 1 from pg_policies where tablename = 'profiles' and policyname = 'insert profile') then
    create policy "insert profile" on profiles for insert with check (auth.uid() = id or is_admin());
  end if;
end $$;

-- Everyday operational tables: any signed-in crew member can read/write.
do $$ begin
  if not exists (select 1 from pg_policies where tablename = 'contacts' and policyname = 'authenticated full access') then
    create policy "authenticated full access" on contacts for all using (auth.role() = 'authenticated') with check (auth.role() = 'authenticated');
  end if;
end $$;
do $$ begin
  if not exists (select 1 from pg_policies where tablename = 'jobs' and policyname = 'authenticated full access') then
    create policy "authenticated full access" on jobs for all using (auth.role() = 'authenticated') with check (auth.role() = 'authenticated');
  end if;
end $$;
do $$ begin
  if not exists (select 1 from pg_policies where tablename = 'job_hours' and policyname = 'authenticated full access') then
    create policy "authenticated full access" on job_hours for all using (auth.role() = 'authenticated') with check (auth.role() = 'authenticated');
  end if;
end $$;
do $$ begin
  if not exists (select 1 from pg_policies where tablename = 'job_expenses' and policyname = 'authenticated full access') then
    create policy "authenticated full access" on job_expenses for all using (auth.role() = 'authenticated') with check (auth.role() = 'authenticated');
  end if;
end $$;
do $$ begin
  if not exists (select 1 from pg_policies where tablename = 'job_photos' and policyname = 'authenticated full access') then
    create policy "authenticated full access" on job_photos for all using (auth.role() = 'authenticated') with check (auth.role() = 'authenticated');
  end if;
end $$;
do $$ begin
  if not exists (select 1 from pg_policies where tablename = 'work_orders' and policyname = 'authenticated full access') then
    create policy "authenticated full access" on work_orders for all using (auth.role() = 'authenticated') with check (auth.role() = 'authenticated');
  end if;
end $$;
do $$ begin
  if not exists (select 1 from pg_policies where tablename = 'work_order_items' and policyname = 'authenticated full access') then
    create policy "authenticated full access" on work_order_items for all using (auth.role() = 'authenticated') with check (auth.role() = 'authenticated');
  end if;
end $$;

-- Financials: admin only, at the database level (not just hidden in the UI).
do $$ begin
  if not exists (select 1 from pg_policies where tablename = 'estimates' and policyname = 'admin only') then
    create policy "admin only" on estimates for all using (is_admin()) with check (is_admin());
  end if;
end $$;
do $$ begin
  if not exists (select 1 from pg_policies where tablename = 'invoices' and policyname = 'admin only') then
    create policy "admin only" on invoices for all using (is_admin()) with check (is_admin());
  end if;
end $$;
do $$ begin
  if not exists (select 1 from pg_policies where tablename = 'deposits' and policyname = 'admin only') then
    create policy "admin only" on deposits for all using (is_admin()) with check (is_admin());
  end if;
end $$;

-- Push subscriptions: users manage their own; admin/server can read all to send notifications.
do $$ begin
  if not exists (select 1 from pg_policies where tablename = 'push_subscriptions' and policyname = 'manage own subscription') then
    create policy "manage own subscription" on push_subscriptions for all using (auth.uid() = user_id) with check (auth.uid() = user_id);
  end if;
end $$;

-- ===== Added: price book, line items, work order materials/resources, expense tax categories, Gmail receipts =====

create table if not exists price_book (
  id uuid primary key default gen_random_uuid(),
  name text not null,
  category text default 'materials',
  unit text default 'each',
  unit_cost numeric not null default 0,
  markup_pct numeric not null default 20,
  rona_search_term text,
  updated_at timestamptz default now(),
  updated_by uuid references profiles(id)
);

-- Line items belong to either an estimate or an invoice (parent_type/parent_id).
-- is_material=true items make up the internal materials list (never shown to the client).
create table if not exists line_items (
  id uuid primary key default gen_random_uuid(),
  parent_type text not null, -- 'estimate' | 'invoice'
  parent_id uuid not null,
  price_book_id uuid references price_book(id),
  description text not null,
  quantity numeric not null default 1,
  unit text default 'each',
  unit_cost numeric not null default 0,
  markup_pct numeric not null default 0,
  is_material boolean default true,
  sort_order int default 0,
  created_at timestamptz default now()
);

create table if not exists work_order_materials (
  id uuid primary key default gen_random_uuid(),
  work_order_id uuid references work_orders(id) on delete cascade,
  description text not null,
  quantity numeric default 1,
  unit text default 'each',
  sort_order int default 0
);

create table if not exists work_order_resources (
  id uuid primary key default gen_random_uuid(),
  work_order_id uuid references work_orders(id) on delete cascade,
  description text not null, -- e.g. "Scissor lift", "Concrete mixer rental"
  needed_by date,
  notes text
);

alter table job_expenses add column if not exists tax_category text;
alter table job_expenses add column if not exists source text default 'manual'; -- manual | gmail_import
alter table job_expenses add column if not exists receipt_url text;

create table if not exists gmail_connections (
  id uuid primary key default gen_random_uuid(),
  user_id uuid references profiles(id) on delete cascade unique,
  email text,
  refresh_token text not null,
  connected_at timestamptz default now()
);

create table if not exists gmail_receipts (
  id uuid primary key default gen_random_uuid(),
  user_id uuid references profiles(id),
  gmail_message_id text unique,
  from_email text,
  subject text,
  received_at timestamptz,
  extracted_amount numeric,
  extracted_vendor text,
  suggested_category text,
  linked_job_id uuid references jobs(id),
  status text default 'pending', -- pending | categorized | dismissed
  linked_expense_id uuid references job_expenses(id),
  created_at timestamptz default now()
);

alter table price_book enable row level security;
alter table line_items enable row level security;
alter table work_order_materials enable row level security;
alter table work_order_resources enable row level security;
alter table gmail_connections enable row level security;
alter table gmail_receipts enable row level security;

-- Price book: everyone reads (needed for estimating), only admins edit.
do $$ begin
  if not exists (select 1 from pg_policies where tablename = 'price_book' and policyname = 'read price book') then
    create policy "read price book" on price_book for select using (auth.role() = 'authenticated');
  end if;
end $$;
do $$ begin
  if not exists (select 1 from pg_policies where tablename = 'price_book' and policyname = 'admin manage price book') then
    create policy "admin manage price book" on price_book for insert with check (is_admin());
  end if;
end $$;
do $$ begin
  if not exists (select 1 from pg_policies where tablename = 'price_book' and policyname = 'admin update price book') then
    create policy "admin update price book" on price_book for update using (is_admin());
  end if;
end $$;
do $$ begin
  if not exists (select 1 from pg_policies where tablename = 'price_book' and policyname = 'admin delete price book') then
    create policy "admin delete price book" on price_book for delete using (is_admin());
  end if;
end $$;

-- Line items inherit estimate/invoice's admin-only visibility.
do $$ begin
  if not exists (select 1 from pg_policies where tablename = 'line_items' and policyname = 'admin only') then
    create policy "admin only" on line_items for all using (is_admin()) with check (is_admin());
  end if;
end $$;

-- Work order materials/resources: same access as work orders (all crew).
do $$ begin
  if not exists (select 1 from pg_policies where tablename = 'work_order_materials' and policyname = 'authenticated full access') then
    create policy "authenticated full access" on work_order_materials for all using (auth.role() = 'authenticated') with check (auth.role() = 'authenticated');
  end if;
end $$;
do $$ begin
  if not exists (select 1 from pg_policies where tablename = 'work_order_resources' and policyname = 'authenticated full access') then
    create policy "authenticated full access" on work_order_resources for all using (auth.role() = 'authenticated') with check (auth.role() = 'authenticated');
  end if;
end $$;

-- Gmail: users manage their own connection; receipts are admin-only (financial data).
do $$ begin
  if not exists (select 1 from pg_policies where tablename = 'gmail_connections' and policyname = 'manage own gmail connection') then
    create policy "manage own gmail connection" on gmail_connections for all using (auth.uid() = user_id) with check (auth.uid() = user_id);
  end if;
end $$;
do $$ begin
  if not exists (select 1 from pg_policies where tablename = 'gmail_receipts' and policyname = 'admin only') then
    create policy "admin only" on gmail_receipts for all using (is_admin()) with check (is_admin());
  end if;
end $$;

-- ===== Added: lead generation (public tender monitoring) =====

create table if not exists leads (
  id uuid primary key default gen_random_uuid(),
  source text not null, -- 'canadabuys' | 'manual'
  external_ref text,
  title text not null,
  organization text,
  category text, -- bollard_removal | bollard_painting | rollout | deck_build | insurance_rebuild | other
  region text,
  closing_date date,
  url text,
  snippet text,
  status text default 'new', -- new | reviewing | pursuing | dismissed
  found_at timestamptz default now()
);
create unique index if not exists leads_source_ref on leads (source, external_ref) where external_ref is not null;

alter table leads enable row level security;
do $$ begin
  if not exists (select 1 from pg_policies where tablename = 'leads' and policyname = 'admin only') then
    create policy "admin only" on leads for all using (is_admin()) with check (is_admin());
  end if;
end $$;

-- ===== Added: vendor/subcontractor network targets (companies that source work via direct application, not public tenders) =====

create table if not exists vendor_targets (
  id uuid primary key default gen_random_uuid(),
  company_name text not null,
  website text,
  notes text,
  status text default 'not_applied', -- not_applied | applied | in_review | approved | declined
  applied_date date,
  created_at timestamptz default now()
);
alter table vendor_targets enable row level security;
do $$ begin
  if not exists (select 1 from pg_policies where tablename = 'vendor_targets' and policyname = 'admin only') then
    create policy "admin only" on vendor_targets for all using (is_admin()) with check (is_admin());
  end if;
end $$;

insert into vendor_targets (company_name, website)
select 'Lane Valente Industries', 'https://canadalvi.com'
where not exists (select 1 from vendor_targets where company_name = 'Lane Valente Industries');

insert into vendor_targets (company_name, website)
select 'OCC Solutions (One Call Commercial Solutions)', 'https://occsolutions.ca'
where not exists (select 1 from vendor_targets where company_name = 'OCC Solutions (One Call Commercial Solutions)');

-- ===== Added: restrict deletes to admin only, everywhere. Read/insert/update stay open to all crew. =====

drop policy if exists "authenticated full access" on contacts;
do $$ begin
  if not exists (select 1 from pg_policies where tablename = 'contacts' and policyname = 'read contacts') then
    create policy "read contacts" on contacts for select using (auth.role() = 'authenticated');
  end if;
end $$;
do $$ begin
  if not exists (select 1 from pg_policies where tablename = 'contacts' and policyname = 'insert contacts') then
    create policy "insert contacts" on contacts for insert with check (auth.role() = 'authenticated');
  end if;
end $$;
do $$ begin
  if not exists (select 1 from pg_policies where tablename = 'contacts' and policyname = 'update contacts') then
    create policy "update contacts" on contacts for update using (auth.role() = 'authenticated');
  end if;
end $$;
do $$ begin
  if not exists (select 1 from pg_policies where tablename = 'contacts' and policyname = 'admin delete contacts') then
    create policy "admin delete contacts" on contacts for delete using (is_admin());
  end if;
end $$;

drop policy if exists "authenticated full access" on jobs;
do $$ begin
  if not exists (select 1 from pg_policies where tablename = 'jobs' and policyname = 'read jobs') then
    create policy "read jobs" on jobs for select using (auth.role() = 'authenticated');
  end if;
end $$;
do $$ begin
  if not exists (select 1 from pg_policies where tablename = 'jobs' and policyname = 'insert jobs') then
    create policy "insert jobs" on jobs for insert with check (auth.role() = 'authenticated');
  end if;
end $$;
do $$ begin
  if not exists (select 1 from pg_policies where tablename = 'jobs' and policyname = 'update jobs') then
    create policy "update jobs" on jobs for update using (auth.role() = 'authenticated');
  end if;
end $$;
do $$ begin
  if not exists (select 1 from pg_policies where tablename = 'jobs' and policyname = 'admin delete jobs') then
    create policy "admin delete jobs" on jobs for delete using (is_admin());
  end if;
end $$;

drop policy if exists "authenticated full access" on job_hours;
do $$ begin
  if not exists (select 1 from pg_policies where tablename = 'job_hours' and policyname = 'read job_hours') then
    create policy "read job_hours" on job_hours for select using (auth.role() = 'authenticated');
  end if;
end $$;
do $$ begin
  if not exists (select 1 from pg_policies where tablename = 'job_hours' and policyname = 'insert job_hours') then
    create policy "insert job_hours" on job_hours for insert with check (auth.role() = 'authenticated');
  end if;
end $$;
do $$ begin
  if not exists (select 1 from pg_policies where tablename = 'job_hours' and policyname = 'update job_hours') then
    create policy "update job_hours" on job_hours for update using (auth.role() = 'authenticated');
  end if;
end $$;
do $$ begin
  if not exists (select 1 from pg_policies where tablename = 'job_hours' and policyname = 'admin delete job_hours') then
    create policy "admin delete job_hours" on job_hours for delete using (is_admin());
  end if;
end $$;

drop policy if exists "authenticated full access" on job_expenses;
do $$ begin
  if not exists (select 1 from pg_policies where tablename = 'job_expenses' and policyname = 'read job_expenses') then
    create policy "read job_expenses" on job_expenses for select using (auth.role() = 'authenticated');
  end if;
end $$;
do $$ begin
  if not exists (select 1 from pg_policies where tablename = 'job_expenses' and policyname = 'insert job_expenses') then
    create policy "insert job_expenses" on job_expenses for insert with check (auth.role() = 'authenticated');
  end if;
end $$;
do $$ begin
  if not exists (select 1 from pg_policies where tablename = 'job_expenses' and policyname = 'update job_expenses') then
    create policy "update job_expenses" on job_expenses for update using (auth.role() = 'authenticated');
  end if;
end $$;
do $$ begin
  if not exists (select 1 from pg_policies where tablename = 'job_expenses' and policyname = 'admin delete job_expenses') then
    create policy "admin delete job_expenses" on job_expenses for delete using (is_admin());
  end if;
end $$;

drop policy if exists "authenticated full access" on job_photos;
do $$ begin
  if not exists (select 1 from pg_policies where tablename = 'job_photos' and policyname = 'read job_photos') then
    create policy "read job_photos" on job_photos for select using (auth.role() = 'authenticated');
  end if;
end $$;
do $$ begin
  if not exists (select 1 from pg_policies where tablename = 'job_photos' and policyname = 'insert job_photos') then
    create policy "insert job_photos" on job_photos for insert with check (auth.role() = 'authenticated');
  end if;
end $$;
do $$ begin
  if not exists (select 1 from pg_policies where tablename = 'job_photos' and policyname = 'update job_photos') then
    create policy "update job_photos" on job_photos for update using (auth.role() = 'authenticated');
  end if;
end $$;
do $$ begin
  if not exists (select 1 from pg_policies where tablename = 'job_photos' and policyname = 'admin delete job_photos') then
    create policy "admin delete job_photos" on job_photos for delete using (is_admin());
  end if;
end $$;

drop policy if exists "authenticated full access" on work_orders;
do $$ begin
  if not exists (select 1 from pg_policies where tablename = 'work_orders' and policyname = 'read work_orders') then
    create policy "read work_orders" on work_orders for select using (auth.role() = 'authenticated');
  end if;
end $$;
do $$ begin
  if not exists (select 1 from pg_policies where tablename = 'work_orders' and policyname = 'insert work_orders') then
    create policy "insert work_orders" on work_orders for insert with check (auth.role() = 'authenticated');
  end if;
end $$;
do $$ begin
  if not exists (select 1 from pg_policies where tablename = 'work_orders' and policyname = 'update work_orders') then
    create policy "update work_orders" on work_orders for update using (auth.role() = 'authenticated');
  end if;
end $$;
do $$ begin
  if not exists (select 1 from pg_policies where tablename = 'work_orders' and policyname = 'admin delete work_orders') then
    create policy "admin delete work_orders" on work_orders for delete using (is_admin());
  end if;
end $$;

drop policy if exists "authenticated full access" on work_order_items;
do $$ begin
  if not exists (select 1 from pg_policies where tablename = 'work_order_items' and policyname = 'read work_order_items') then
    create policy "read work_order_items" on work_order_items for select using (auth.role() = 'authenticated');
  end if;
end $$;
do $$ begin
  if not exists (select 1 from pg_policies where tablename = 'work_order_items' and policyname = 'insert work_order_items') then
    create policy "insert work_order_items" on work_order_items for insert with check (auth.role() = 'authenticated');
  end if;
end $$;
do $$ begin
  if not exists (select 1 from pg_policies where tablename = 'work_order_items' and policyname = 'update work_order_items') then
    create policy "update work_order_items" on work_order_items for update using (auth.role() = 'authenticated');
  end if;
end $$;
do $$ begin
  if not exists (select 1 from pg_policies where tablename = 'work_order_items' and policyname = 'admin delete work_order_items') then
    create policy "admin delete work_order_items" on work_order_items for delete using (is_admin());
  end if;
end $$;

drop policy if exists "authenticated full access" on work_order_materials;
do $$ begin
  if not exists (select 1 from pg_policies where tablename = 'work_order_materials' and policyname = 'read work_order_materials') then
    create policy "read work_order_materials" on work_order_materials for select using (auth.role() = 'authenticated');
  end if;
end $$;
do $$ begin
  if not exists (select 1 from pg_policies where tablename = 'work_order_materials' and policyname = 'insert work_order_materials') then
    create policy "insert work_order_materials" on work_order_materials for insert with check (auth.role() = 'authenticated');
  end if;
end $$;
do $$ begin
  if not exists (select 1 from pg_policies where tablename = 'work_order_materials' and policyname = 'update work_order_materials') then
    create policy "update work_order_materials" on work_order_materials for update using (auth.role() = 'authenticated');
  end if;
end $$;
do $$ begin
  if not exists (select 1 from pg_policies where tablename = 'work_order_materials' and policyname = 'admin delete work_order_materials') then
    create policy "admin delete work_order_materials" on work_order_materials for delete using (is_admin());
  end if;
end $$;

drop policy if exists "authenticated full access" on work_order_resources;
do $$ begin
  if not exists (select 1 from pg_policies where tablename = 'work_order_resources' and policyname = 'read work_order_resources') then
    create policy "read work_order_resources" on work_order_resources for select using (auth.role() = 'authenticated');
  end if;
end $$;
do $$ begin
  if not exists (select 1 from pg_policies where tablename = 'work_order_resources' and policyname = 'insert work_order_resources') then
    create policy "insert work_order_resources" on work_order_resources for insert with check (auth.role() = 'authenticated');
  end if;
end $$;
do $$ begin
  if not exists (select 1 from pg_policies where tablename = 'work_order_resources' and policyname = 'update work_order_resources') then
    create policy "update work_order_resources" on work_order_resources for update using (auth.role() = 'authenticated');
  end if;
end $$;
do $$ begin
  if not exists (select 1 from pg_policies where tablename = 'work_order_resources' and policyname = 'admin delete work_order_resources') then
    create policy "admin delete work_order_resources" on work_order_resources for delete using (is_admin());
  end if;
end $$;

-- Financials, price book, leads, vendor_targets are already admin-only for every operation
-- (see their existing "admin only" / "admin manage/update/delete" policies), so deletes there
-- are already restricted correctly.

-- ===== Added: full-time/part-time flag + automatic stat holiday hours =====

alter table profiles add column if not exists employment_type text default 'part_time'; -- 'full_time' | 'part_time'

create table if not exists stat_holidays (
  id uuid primary key default gen_random_uuid(),
  date date not null unique,
  name text not null,
  region text default 'BC',
  created_at timestamptz default now()
);

alter table stat_holidays enable row level security;
do $$ begin
  if not exists (select 1 from pg_policies where tablename = 'stat_holidays' and policyname = 'read stat_holidays') then
    create policy "read stat_holidays" on stat_holidays for select using (auth.role() = 'authenticated');
  end if;
end $$;
do $$ begin
  if not exists (select 1 from pg_policies where tablename = 'stat_holidays' and policyname = 'admin manage stat_holidays') then
    create policy "admin manage stat_holidays" on stat_holidays for insert with check (is_admin());
  end if;
end $$;
do $$ begin
  if not exists (select 1 from pg_policies where tablename = 'stat_holidays' and policyname = 'admin update stat_holidays') then
    create policy "admin update stat_holidays" on stat_holidays for update using (is_admin());
  end if;
end $$;
do $$ begin
  if not exists (select 1 from pg_policies where tablename = 'stat_holidays' and policyname = 'admin delete stat_holidays') then
    create policy "admin delete stat_holidays" on stat_holidays for delete using (is_admin());
  end if;
end $$;

-- 2026 BC statutory holidays (Employment Standards Act) — add future years from the Team page.
insert into stat_holidays (date, name) values
  ('2026-01-01', 'New Year''s Day'),
  ('2026-02-16', 'Family Day'),
  ('2026-04-03', 'Good Friday'),
  ('2026-05-18', 'Victoria Day'),
  ('2026-07-01', 'Canada Day'),
  ('2026-08-03', 'British Columbia Day'),
  ('2026-09-07', 'Labour Day'),
  ('2026-09-30', 'National Day for Truth and Reconciliation'),
  ('2026-10-12', 'Thanksgiving'),
  ('2026-11-11', 'Remembrance Day'),
  ('2026-12-25', 'Christmas Day')
on conflict (date) do nothing;

-- ===== Added: geolocation for jobs and photos, for the Map tab =====

alter table jobs add column if not exists lat numeric;
alter table jobs add column if not exists lng numeric;
alter table job_photos add column if not exists lat numeric;
alter table job_photos add column if not exists lng numeric;

-- ===== Added: payment tracking, PayPal deposits, company info, client-facing emailed documents, overdue reminders =====

create table if not exists company_settings (
  id uuid primary key default gen_random_uuid(),
  wcb_number text,
  insurance_provider text,
  insurance_policy_number text,
  insurance_amount text,
  insurance_certificate_url text,
  reply_to_email text,
  updated_at timestamptz default now()
);
alter table company_settings enable row level security;
do $$ begin
  if not exists (select 1 from pg_policies where tablename = 'company_settings' and policyname = 'read company_settings') then
    create policy "read company_settings" on company_settings for select using (auth.role() = 'authenticated');
  end if;
end $$;
do $$ begin
  if not exists (select 1 from pg_policies where tablename = 'company_settings' and policyname = 'admin manage company_settings') then
    create policy "admin manage company_settings" on company_settings for insert with check (is_admin());
  end if;
end $$;
do $$ begin
  if not exists (select 1 from pg_policies where tablename = 'company_settings' and policyname = 'admin update company_settings') then
    create policy "admin update company_settings" on company_settings for update using (is_admin());
  end if;
end $$;
insert into company_settings (id) select gen_random_uuid() where not exists (select 1 from company_settings);

alter table invoices add column if not exists due_date date;
alter table invoices add column if not exists payment_status text default 'unpaid'; -- unpaid | partial | paid
alter table invoices add column if not exists paid_date date;
alter table invoices add column if not exists payment_method text;
alter table invoices add column if not exists send_reminders boolean default false;
alter table invoices add column if not exists last_reminder_sent date;
alter table invoices add column if not exists public_token uuid default gen_random_uuid() unique;

alter table estimates add column if not exists public_token uuid default gen_random_uuid() unique;

alter table deposits add column if not exists payment_method text; -- cash | cheque | e_transfer | paypal | credit_card | other

-- Note: also create a Storage bucket named "documents" (Public) in the Supabase dashboard,
-- the same way "job-photos" was created — used for the insurance certificate upload.

-- ===== Added: employee time-off requests =====

create table if not exists time_off_requests (
  id uuid primary key default gen_random_uuid(),
  user_id uuid references profiles(id) on delete cascade,
  start_date date not null,
  end_date date not null,
  reason text,
  status text default 'pending', -- pending | approved | denied
  requested_at timestamptz default now(),
  decided_at timestamptz,
  decided_by uuid references profiles(id)
);
alter table time_off_requests enable row level security;

-- Employees see and create their own requests; admins see and decide on everyone's.
do $$ begin
  if not exists (select 1 from pg_policies where tablename = 'time_off_requests' and policyname = 'read own or admin') then
    create policy "read own or admin" on time_off_requests for select using (auth.uid() = user_id or is_admin());
  end if;
end $$;
do $$ begin
  if not exists (select 1 from pg_policies where tablename = 'time_off_requests' and policyname = 'insert own') then
    create policy "insert own" on time_off_requests for insert with check (auth.uid() = user_id);
  end if;
end $$;
do $$ begin
  if not exists (select 1 from pg_policies where tablename = 'time_off_requests' and policyname = 'admin decide') then
    create policy "admin decide" on time_off_requests for update using (is_admin());
  end if;
end $$;
do $$ begin
  if not exists (select 1 from pg_policies where tablename = 'time_off_requests' and policyname = 'admin or owner delete') then
    create policy "admin or owner delete" on time_off_requests for delete using (auth.uid() = user_id or is_admin());
  end if;
end $$;

-- ===== Added: storage upload permissions (creating a bucket doesn't grant upload rights on its own) =====

do $$ begin
  if not exists (select 1 from pg_policies where tablename = 'storage.objects' and policyname = 'authenticated upload job photos') then
    create policy "authenticated upload job photos" on storage.objects for insert to authenticated
  with check (bucket_id = 'job-photos');
  end if;
end $$;
do $$ begin
  if not exists (select 1 from pg_policies where tablename = 'storage.objects' and policyname = 'public read job photos') then
    create policy "public read job photos" on storage.objects for select to public
  using (bucket_id = 'job-photos');
  end if;
end $$;
do $$ begin
  if not exists (select 1 from pg_policies where tablename = 'storage.objects' and policyname = 'admin delete job photos') then
    create policy "admin delete job photos" on storage.objects for delete to authenticated
  using (bucket_id = 'job-photos' and exists (select 1 from profiles where id = auth.uid() and role = 'admin'));
  end if;
end $$;

do $$ begin
  if not exists (select 1 from pg_policies where tablename = 'storage.objects' and policyname = 'authenticated upload documents') then
    create policy "authenticated upload documents" on storage.objects for insert to authenticated
  with check (bucket_id = 'documents');
  end if;
end $$;
do $$ begin
  if not exists (select 1 from pg_policies where tablename = 'storage.objects' and policyname = 'public read documents') then
    create policy "public read documents" on storage.objects for select to public
  using (bucket_id = 'documents');
  end if;
end $$;

-- ===== Added: Storage upload/delete permissions (marking a bucket "Public" only allows
-- viewing files — it does NOT allow uploading. This was the actual cause of photo uploads
-- silently failing with a row-level security error. =====

do $$ begin
  if not exists (select 1 from pg_policies where tablename = 'objects' and policyname = 'authenticated upload job-photos') then
    create policy "authenticated upload job-photos"
    on storage.objects for insert
    with check (bucket_id = 'job-photos' and auth.role() = 'authenticated');
  end if;
  if not exists (select 1 from pg_policies where tablename = 'objects' and policyname = 'anyone view job-photos') then
    create policy "anyone view job-photos"
    on storage.objects for select
    using (bucket_id = 'job-photos');
  end if;
  if not exists (select 1 from pg_policies where tablename = 'objects' and policyname = 'admin delete job-photos') then
    create policy "admin delete job-photos"
    on storage.objects for delete
    using (bucket_id = 'job-photos' and is_admin());
  end if;
  if not exists (select 1 from pg_policies where tablename = 'objects' and policyname = 'admin upload documents') then
    create policy "admin upload documents"
    on storage.objects for insert
    with check (bucket_id = 'documents' and is_admin());
  end if;
  if not exists (select 1 from pg_policies where tablename = 'objects' and policyname = 'anyone view documents') then
    create policy "anyone view documents"
    on storage.objects for select
    using (bucket_id = 'documents');
  end if;
  if not exists (select 1 from pg_policies where tablename = 'objects' and policyname = 'admin delete documents') then
    create policy "admin delete documents"
    on storage.objects for delete
    using (bucket_id = 'documents' and is_admin());
  end if;
end $$;

-- ===== Added: match Joist invoice/estimate layout — grouped sections, GST, terms, e-signature =====

alter table line_items add column if not exists scope_notes text; -- bullet-style scope lines shown under a section heading

alter table company_settings add column if not exists business_number text;
alter table company_settings add column if not exists address text;
alter table company_settings add column if not exists phone text;
alter table company_settings add column if not exists website text;
alter table company_settings add column if not exists payment_terms text default 'Due upon receipt';
alter table company_settings add column if not exists terms_and_conditions text;

-- Business number, address, phone, website, and terms are per-instance and are
-- entered by an admin under Admin > Company. They are deliberately not seeded here
-- so that running this schema against a new database does not stamp another
-- company's details onto it.

alter table estimates add column if not exists signature_name text;
alter table estimates add column if not exists signed_at timestamptz;
alter table invoices add column if not exists signature_name text;
alter table invoices add column if not exists signed_at timestamptz;

-- ===== Added: private (internal-only) notes on estimates/invoices, separate from client-facing notes =====
alter table estimates add column if not exists private_notes text;
alter table invoices add column if not exists private_notes text;

-- ===== Added: PO numbers, sequential doc numbers, configurable taxes, deposit/discount/markup at
-- document level, auto-invoice-on-signature, activity log, email templates =====

alter table estimates add column if not exists po_number text;
alter table invoices add column if not exists po_number text;

create sequence if not exists estimate_doc_number_seq start 1001;
create sequence if not exists invoice_doc_number_seq start 1001;
alter table estimates add column if not exists doc_number integer default nextval('estimate_doc_number_seq');
alter table invoices add column if not exists doc_number integer default nextval('invoice_doc_number_seq');

create table if not exists tax_rates (
  id uuid primary key default gen_random_uuid(),
  name text not null,
  rate numeric not null, -- e.g. 5 for 5%
  enabled boolean default true,
  sort_order int default 0
);
alter table tax_rates enable row level security;
do $$ begin
  if not exists (select 1 from pg_policies where tablename = 'tax_rates' and policyname = 'read tax_rates') then
    create policy "read tax_rates" on tax_rates for select using (auth.role() = 'authenticated');
  end if;
end $$;
do $$ begin
  if not exists (select 1 from pg_policies where tablename = 'tax_rates' and policyname = 'admin manage tax_rates') then
    create policy "admin manage tax_rates" on tax_rates for insert with check (is_admin());
  end if;
end $$;
do $$ begin
  if not exists (select 1 from pg_policies where tablename = 'tax_rates' and policyname = 'admin update tax_rates') then
    create policy "admin update tax_rates" on tax_rates for update using (is_admin());
  end if;
end $$;
do $$ begin
  if not exists (select 1 from pg_policies where tablename = 'tax_rates' and policyname = 'admin delete tax_rates') then
    create policy "admin delete tax_rates" on tax_rates for delete using (is_admin());
  end if;
end $$;
insert into tax_rates (name, rate, sort_order)
select 'GST', 5, 0 where not exists (select 1 from tax_rates where name = 'GST');

alter table estimates add column if not exists deposit_request_amount numeric;
alter table estimates add column if not exists discount_amount numeric default 0;
alter table estimates add column if not exists markup_pct numeric default 0;
alter table estimates add column if not exists auto_generate_invoice boolean default false;
alter table invoices add column if not exists deposit_request_amount numeric;
alter table invoices add column if not exists discount_amount numeric default 0;
alter table invoices add column if not exists markup_pct numeric default 0;

create table if not exists document_activity (
  id uuid primary key default gen_random_uuid(),
  parent_type text not null, -- 'estimate' | 'invoice'
  parent_id uuid not null,
  event_type text not null, -- 'viewed' | 'emailed' | 'signed' | 'paid'
  occurred_at timestamptz default now(),
  meta jsonb
);
alter table document_activity enable row level security;
do $$ begin
  if not exists (select 1 from pg_policies where tablename = 'document_activity' and policyname = 'read document_activity') then
    create policy "read document_activity" on document_activity for select using (is_admin());
  end if;
end $$;
do $$ begin
  if not exists (select 1 from pg_policies where tablename = 'document_activity' and policyname = 'insert document_activity') then
    create policy "insert document_activity" on document_activity for insert with check (true);
  end if;
end $$;

alter table company_settings add column if not exists estimate_email_subject text;
alter table company_settings add column if not exists estimate_email_body text default 'We are excited about the possibility of working with you.';
alter table company_settings add column if not exists invoice_email_subject text;
alter table company_settings add column if not exists invoice_email_body text default 'Thanks for your business!';

-- ===== Added: referral source survey, percent-based deposits, internal tools list, labor hour estimates =====

alter table estimates add column if not exists referral_source text;
alter table estimates add column if not exists deposit_type text default 'fixed'; -- 'fixed' | 'percent'
alter table estimates add column if not exists deposit_request_percent numeric;
alter table invoices add column if not exists deposit_type text default 'fixed';
alter table invoices add column if not exists deposit_request_percent numeric;

alter table estimates add column if not exists skilled_labor_hours numeric;
alter table estimates add column if not exists unskilled_labor_hours numeric;
alter table estimates add column if not exists travel_hours numeric;
alter table estimates add column if not exists material_pickup_hours numeric;

alter table line_items add column if not exists is_tool boolean default false;

-- ===== Added: per-document GST toggle and tax-exempt (First Nations land) flag =====

do $$ begin
  if not exists (select 1 from information_schema.columns where table_name = 'estimates' and column_name = 'gst_enabled') then
    alter table estimates add column gst_enabled boolean default true;
  end if;
  if not exists (select 1 from information_schema.columns where table_name = 'estimates' and column_name = 'tax_exempt') then
    alter table estimates add column tax_exempt boolean default false;
  end if;
  if not exists (select 1 from information_schema.columns where table_name = 'invoices' and column_name = 'gst_enabled') then
    alter table invoices add column gst_enabled boolean default true;
  end if;
  if not exists (select 1 from information_schema.columns where table_name = 'invoices' and column_name = 'tax_exempt') then
    alter table invoices add column tax_exempt boolean default false;
  end if;
end $$;

-- ===== Added: structured address fields (line, city, province, postal code) for accurate
-- geocoding — a bare street name was ambiguous enough that Nominatim once matched Texas
-- instead of BC. Old single "address" text column stays as a fallback/legacy display. =====

do $$ begin
  if not exists (select 1 from information_schema.columns where table_name = 'contacts' and column_name = 'address_line2') then
    alter table contacts add column address_line2 text;
  end if;
  if not exists (select 1 from information_schema.columns where table_name = 'contacts' and column_name = 'city') then
    alter table contacts add column city text;
  end if;
  if not exists (select 1 from information_schema.columns where table_name = 'contacts' and column_name = 'province') then
    alter table contacts add column province text default 'BC';
  end if;
  if not exists (select 1 from information_schema.columns where table_name = 'contacts' and column_name = 'postal_code') then
    alter table contacts add column postal_code text;
  end if;
  if not exists (select 1 from information_schema.columns where table_name = 'jobs' and column_name = 'address_line2') then
    alter table jobs add column address_line2 text;
  end if;
  if not exists (select 1 from information_schema.columns where table_name = 'jobs' and column_name = 'city') then
    alter table jobs add column city text;
  end if;
  if not exists (select 1 from information_schema.columns where table_name = 'jobs' and column_name = 'province') then
    alter table jobs add column province text default 'BC';
  end if;
  if not exists (select 1 from information_schema.columns where table_name = 'jobs' and column_name = 'postal_code') then
    alter table jobs add column postal_code text;
  end if;
end $$;

-- ===== Added: truck travel mileage log, and sketch/notes for quote appointments =====

create table if not exists job_mileage (
  id uuid primary key default gen_random_uuid(),
  job_id uuid references jobs(id) on delete cascade,
  driver_name text not null,
  date date not null,
  km numeric not null,
  purpose text,
  created_at timestamptz default now()
);
alter table job_mileage enable row level security;

do $$ begin
  if not exists (select 1 from pg_policies where tablename = 'job_mileage' and policyname = 'read job_mileage') then
    create policy "read job_mileage" on job_mileage for select using (auth.role() = 'authenticated');
  end if;
  if not exists (select 1 from pg_policies where tablename = 'job_mileage' and policyname = 'insert job_mileage') then
    create policy "insert job_mileage" on job_mileage for insert with check (auth.role() = 'authenticated');
  end if;
  if not exists (select 1 from pg_policies where tablename = 'job_mileage' and policyname = 'update job_mileage') then
    create policy "update job_mileage" on job_mileage for update using (auth.role() = 'authenticated');
  end if;
  if not exists (select 1 from pg_policies where tablename = 'job_mileage' and policyname = 'admin delete job_mileage') then
    create policy "admin delete job_mileage" on job_mileage for delete using (is_admin());
  end if;
end $$;

create table if not exists job_notes (
  id uuid primary key default gen_random_uuid(),
  job_id uuid references jobs(id) on delete cascade,
  author_name text,
  note_text text,
  sketch_url text,
  created_at timestamptz default now()
);
alter table job_notes enable row level security;

do $$ begin
  if not exists (select 1 from pg_policies where tablename = 'job_notes' and policyname = 'read job_notes') then
    create policy "read job_notes" on job_notes for select using (auth.role() = 'authenticated');
  end if;
  if not exists (select 1 from pg_policies where tablename = 'job_notes' and policyname = 'insert job_notes') then
    create policy "insert job_notes" on job_notes for insert with check (auth.role() = 'authenticated');
  end if;
  if not exists (select 1 from pg_policies where tablename = 'job_notes' and policyname = 'admin delete job_notes') then
    create policy "admin delete job_notes" on job_notes for delete using (is_admin());
  end if;
end $$;

-- ===== Security fix: document_activity previously allowed literally anyone with the
-- public anon key to insert arbitrary rows directly (bypassing our app entirely),
-- since the policy was "with check (true)". Our own API route uses the service-role
-- key, which bypasses RLS anyway, so tightening this to admin-only doesn't break it —
-- it just blocks writing to this table any other way. =====

drop policy if exists "insert document_activity" on document_activity;
create policy "admin insert document_activity" on document_activity for insert with check (is_admin());

-- ===== Security: switch job-photos and documents buckets from permanent public URLs to
-- expiring signed URLs. Store the storage PATH (not a public URL) going forward; a signed
-- URL is generated fresh, server-side, each time something needs to be viewed. =====

do $$ begin
  if not exists (select 1 from information_schema.columns where table_name = 'job_photos' and column_name = 'storage_path') then
    alter table job_photos add column storage_path text;
  end if;
  if not exists (select 1 from information_schema.columns where table_name = 'job_notes' and column_name = 'sketch_path') then
    alter table job_notes add column sketch_path text;
  end if;
  if not exists (select 1 from information_schema.columns where table_name = 'company_settings' and column_name = 'insurance_certificate_path') then
    alter table company_settings add column insurance_certificate_path text;
  end if;
end $$;

-- Once the buckets are switched to Private (manual step in Supabase dashboard — see
-- instructions), the "anyone view" policies below are no longer needed: signed URLs are
-- generated using the service-role key, which bypasses RLS entirely. Dropping them means
-- there is no direct public read path into these buckets at all anymore.
drop policy if exists "anyone view job-photos" on storage.objects;
drop policy if exists "public read job photos" on storage.objects;
drop policy if exists "anyone view documents" on storage.objects;
drop policy if exists "public read documents" on storage.objects;

-- ===== Added: manual Google review request queue — never auto-sent, admin picks who to ask =====

do $$ begin
  if not exists (select 1 from information_schema.columns where table_name = 'invoices' and column_name = 'review_request_sent_at') then
    alter table invoices add column review_request_sent_at timestamptz;
  end if;
  if not exists (select 1 from information_schema.columns where table_name = 'invoices' and column_name = 'review_request_skipped') then
    alter table invoices add column review_request_skipped boolean default false;
  end if;
  if not exists (select 1 from information_schema.columns where table_name = 'company_settings' and column_name = 'google_review_url') then
    alter table company_settings add column google_review_url text;
  end if;
  if not exists (select 1 from information_schema.columns where table_name = 'company_settings' and column_name = 'review_email_subject') then
    alter table company_settings add column review_email_subject text default 'How did we do?';
  end if;
  if not exists (select 1 from information_schema.columns where table_name = 'company_settings' and column_name = 'review_email_body') then
    alter table company_settings add column review_email_body text default 'Thanks again for your business. If you have a moment, we''d really appreciate a quick review — it helps other people in the area find us.';
  end if;
end $$;

-- ===== Added: PDF invoice library — old Joist PDFs (manually uploaded) plus every new
-- invoice generated by the app, all in one browsable, filterable place. =====

create table if not exists invoice_documents (
  id uuid primary key default gen_random_uuid(),
  invoice_id uuid references invoices(id) on delete set null, -- null for manually uploaded legacy Joist PDFs
  client_name text not null,
  doc_date date not null,
  status text not null default 'invoiced', -- 'invoiced' | 'paid'
  file_path text not null, -- path in the 'documents' storage bucket
  source text not null default 'generated', -- 'generated' | 'joist_import'
  created_at timestamptz default now()
);
alter table invoice_documents enable row level security;

do $$ begin
  if not exists (select 1 from pg_policies where tablename = 'invoice_documents' and policyname = 'admin read invoice_documents') then
    create policy "admin read invoice_documents" on invoice_documents for select using (is_admin());
  end if;
  if not exists (select 1 from pg_policies where tablename = 'invoice_documents' and policyname = 'admin insert invoice_documents') then
    create policy "admin insert invoice_documents" on invoice_documents for insert with check (is_admin());
  end if;
  if not exists (select 1 from pg_policies where tablename = 'invoice_documents' and policyname = 'admin update invoice_documents') then
    create policy "admin update invoice_documents" on invoice_documents for update using (is_admin());
  end if;
  if not exists (select 1 from pg_policies where tablename = 'invoice_documents' and policyname = 'admin delete invoice_documents') then
    create policy "admin delete invoice_documents" on invoice_documents for delete using (is_admin());
  end if;
end $$;

-- Needed for the upsert-by-invoice_id pattern (regenerating a PDF when an invoice is
-- marked paid updates the same row instead of creating a duplicate). Partial index so
-- multiple manually-uploaded legacy rows (invoice_id null) are still allowed.
create unique index if not exists invoice_documents_invoice_id_unique
  on invoice_documents (invoice_id) where invoice_id is not null;

-- ===== Bug fix: job_photos.url was still required (not null) from before the switch to
-- storage_path + signed URLs, so every new photo upload was failing this constraint. =====
alter table job_photos alter column url drop not null;

-- ===== Fix: job_photos.url was still NOT NULL from before the storage_path switch,
-- which silently blocked every new photo upload (uploads now only set storage_path). =====
alter table job_photos alter column url drop not null;

-- ===== Added: match receipt emails to a job automatically via PO number reference =====
do $$ begin
  if not exists (select 1 from information_schema.columns where table_name = 'gmail_receipts' and column_name = 'matched_po_number') then
    alter table gmail_receipts add column matched_po_number text;
  end if;
end $$;

-- ===== Added: "needs a reply" email scanning for the Today page =====

create table if not exists email_action_items (
  id uuid primary key default gen_random_uuid(),
  gmail_message_id text unique,
  from_email text,
  subject text,
  snippet text,
  reason text, -- why it was flagged (heuristic match, for transparency)
  received_at timestamptz,
  dismissed boolean default false,
  created_at timestamptz default now()
);
alter table email_action_items enable row level security;

do $$ begin
  if not exists (select 1 from pg_policies where tablename = 'email_action_items' and policyname = 'admin read email_action_items') then
    create policy "admin read email_action_items" on email_action_items for select using (is_admin());
  end if;
  if not exists (select 1 from pg_policies where tablename = 'email_action_items' and policyname = 'admin update email_action_items') then
    create policy "admin update email_action_items" on email_action_items for update using (is_admin());
  end if;
end $$;

-- ===== Added: ICC-style material/labour breakdown structure, insurance markup setting =====

do $$ begin
  if not exists (select 1 from information_schema.columns where table_name = 'line_items' and column_name = 'is_labour') then
    alter table line_items add column is_labour boolean default false;
  end if;
  if not exists (select 1 from information_schema.columns where table_name = 'line_items' and column_name = 'waste_pct') then
    alter table line_items add column waste_pct numeric default 0;
  end if;
  if not exists (select 1 from information_schema.columns where table_name = 'line_items' and column_name = 'manufacturer') then
    alter table line_items add column manufacturer text;
  end if;
  if not exists (select 1 from information_schema.columns where table_name = 'line_items' and column_name = 'color') then
    alter table line_items add column color text;
  end if;
  if not exists (select 1 from information_schema.columns where table_name = 'company_settings' and column_name = 'insurance_markup_pct') then
    alter table company_settings add column insurance_markup_pct numeric default 0;
  end if;
end $$;

-- ===== Added: Facebook + Instagram posting from within the app =====

create table if not exists social_connections (
  id uuid primary key default gen_random_uuid(),
  page_id text,
  page_name text,
  page_access_token text,
  ig_business_account_id text,
  connected_by uuid references profiles(id),
  connected_at timestamptz default now()
);
alter table social_connections enable row level security;

do $$ begin
  if not exists (select 1 from pg_policies where tablename = 'social_connections' and policyname = 'admin manage social_connections') then
    create policy "admin manage social_connections" on social_connections for all using (is_admin());
  end if;
end $$;

create table if not exists social_posts (
  id uuid primary key default gen_random_uuid(),
  caption text,
  image_path text, -- storage path in the 'documents' bucket
  post_to_facebook boolean default false,
  post_to_instagram boolean default false,
  status text default 'draft', -- draft | posted | failed
  fb_post_id text,
  ig_post_id text,
  error_message text,
  job_id uuid references jobs(id),
  created_by uuid references profiles(id),
  created_at timestamptz default now(),
  posted_at timestamptz
);
alter table social_posts enable row level security;

do $$ begin
  if not exists (select 1 from pg_policies where tablename = 'social_posts' and policyname = 'admin manage social_posts') then
    create policy "admin manage social_posts" on social_posts for all using (is_admin());
  end if;
end $$;

-- ===== Added: tie deposits/payments to a specific invoice, for partial-payment tracking =====
do $$ begin
  if not exists (select 1 from information_schema.columns where table_name = 'deposits' and column_name = 'invoice_id') then
    alter table deposits add column invoice_id uuid references invoices(id) on delete set null;
  end if;
end $$;

-- ===== Removed "on hold" as a job status — folding any existing on-hold jobs into
-- Active so they don't vanish from every filter now that the option is gone. =====
update jobs set status = 'active' where status = 'on_hold';

-- ===== Added: parse receipt PDF attachments (amount, GST, PO#), store the actual PDF,
-- and build a monthly receipts bundle for the accountant. =====

do $$ begin
  if not exists (select 1 from information_schema.columns where table_name = 'gmail_receipts' and column_name = 'attachment_path') then
    alter table gmail_receipts add column attachment_path text;
  end if;
  if not exists (select 1 from information_schema.columns where table_name = 'gmail_receipts' and column_name = 'extracted_gst') then
    alter table gmail_receipts add column extracted_gst numeric;
  end if;
  if not exists (select 1 from information_schema.columns where table_name = 'job_expenses' and column_name = 'receipt_pdf_path') then
    alter table job_expenses add column receipt_pdf_path text;
  end if;
  if not exists (select 1 from information_schema.columns where table_name = 'job_expenses' and column_name = 'gst_amount') then
    alter table job_expenses add column gst_amount numeric;
  end if;
end $$;

-- ===== Added: photo "date taken" from EXIF metadata, used for weekly report grouping
-- instead of upload time (a batch upload days later would otherwise land in the wrong week) =====
do $$ begin
  if not exists (select 1 from information_schema.columns where table_name = 'job_photos' and column_name = 'taken_at') then
    alter table job_photos add column taken_at timestamptz;
  end if;
end $$;

-- ===== Added: editable Today page (ad-hoc daily tasks, check off job checklist items
-- directly), and shared team messaging =====

create table if not exists daily_tasks (
  id uuid primary key default gen_random_uuid(),
  date date not null,
  description text not null,
  done_at timestamptz,
  created_by uuid references profiles(id),
  created_at timestamptz default now()
);
alter table daily_tasks enable row level security;

do $$ begin
  if not exists (select 1 from pg_policies where tablename = 'daily_tasks' and policyname = 'authenticated full access daily_tasks') then
    create policy "authenticated full access daily_tasks" on daily_tasks for all using (auth.role() = 'authenticated') with check (auth.role() = 'authenticated');
  end if;
end $$;

create table if not exists team_messages (
  id uuid primary key default gen_random_uuid(),
  author_id uuid references profiles(id),
  author_name text,
  message text not null,
  created_at timestamptz default now()
);
alter table team_messages enable row level security;

do $$ begin
  if not exists (select 1 from pg_policies where tablename = 'team_messages' and policyname = 'read team_messages') then
    create policy "read team_messages" on team_messages for select using (auth.role() = 'authenticated');
  end if;
  if not exists (select 1 from pg_policies where tablename = 'team_messages' and policyname = 'insert team_messages') then
    create policy "insert team_messages" on team_messages for insert with check (auth.role() = 'authenticated');
  end if;
  if not exists (select 1 from pg_policies where tablename = 'team_messages' and policyname = 'admin delete team_messages') then
    create policy "admin delete team_messages" on team_messages for delete using (is_admin());
  end if;
end $$;

-- Enables live updates for team chat — without this, new messages from someone
-- else wouldn't show up until the page is manually refreshed.
do $$ begin
  if not exists (
    select 1 from pg_publication_tables where pubname = 'supabase_realtime' and tablename = 'team_messages'
  ) then
    alter publication supabase_realtime add table team_messages;
  end if;
end $$;

-- ===== CRITICAL SECURITY FIX =====
-- Nearly every policy in this app only checked "is this a valid logged-in session"
-- (auth.role() = 'authenticated') — NOT whether that person's account is still
-- active. Deleting someone's row from `profiles` never revoked their actual login
-- access (that lives separately in Supabase Auth), and even a fully-deleted
-- profile row didn't stop an already-issued session from reading/writing almost
-- everything in the app. This closes that gap everywhere at once.

alter table profiles add column if not exists is_active boolean not null default true;

-- Returns true only if the signed-in user has a profile row AND it's marked
-- active. A missing profile (deleted) or a deactivated one both correctly
-- return false here — this is what every policy below now checks instead of
-- just "are you logged in at all".
create or replace function is_active() returns boolean as $$
  select exists (
    select 1 from profiles where id = auth.uid() and is_active = true
  );
$$ language sql security definer stable;

drop policy if exists "read profiles" on profiles;
create policy "read profiles" on profiles for select using (is_active());

drop policy if exists "authenticated full access" on contacts;
create policy "active full access" on contacts for all using (is_active()) with check (is_active());
drop policy if exists "read contacts" on contacts;
drop policy if exists "insert contacts" on contacts;
drop policy if exists "update contacts" on contacts;

drop policy if exists "authenticated full access" on jobs;
create policy "active full access" on jobs for all using (is_active()) with check (is_active());
drop policy if exists "read jobs" on jobs;
drop policy if exists "insert jobs" on jobs;
drop policy if exists "update jobs" on jobs;

drop policy if exists "authenticated full access" on job_hours;
create policy "active full access" on job_hours for all using (is_active()) with check (is_active());
drop policy if exists "read job_hours" on job_hours;
drop policy if exists "insert job_hours" on job_hours;
drop policy if exists "update job_hours" on job_hours;

drop policy if exists "authenticated full access" on job_expenses;
create policy "active full access" on job_expenses for all using (is_active()) with check (is_active());
drop policy if exists "read job_expenses" on job_expenses;
drop policy if exists "insert job_expenses" on job_expenses;
drop policy if exists "update job_expenses" on job_expenses;

drop policy if exists "authenticated full access" on job_photos;
create policy "active full access" on job_photos for all using (is_active()) with check (is_active());
drop policy if exists "read job_photos" on job_photos;
drop policy if exists "insert job_photos" on job_photos;
drop policy if exists "update job_photos" on job_photos;

drop policy if exists "authenticated full access" on work_orders;
create policy "active full access" on work_orders for all using (is_active()) with check (is_active());
drop policy if exists "read work_orders" on work_orders;
drop policy if exists "insert work_orders" on work_orders;
drop policy if exists "update work_orders" on work_orders;

drop policy if exists "authenticated full access" on work_order_items;
create policy "active full access" on work_order_items for all using (is_active()) with check (is_active());
drop policy if exists "read work_order_items" on work_order_items;
drop policy if exists "insert work_order_items" on work_order_items;
drop policy if exists "update work_order_items" on work_order_items;

drop policy if exists "authenticated full access" on work_order_materials;
create policy "active full access" on work_order_materials for all using (is_active()) with check (is_active());
drop policy if exists "read work_order_materials" on work_order_materials;
drop policy if exists "insert work_order_materials" on work_order_materials;
drop policy if exists "update work_order_materials" on work_order_materials;

drop policy if exists "authenticated full access" on work_order_resources;
create policy "active full access" on work_order_resources for all using (is_active()) with check (is_active());
drop policy if exists "read work_order_resources" on work_order_resources;
drop policy if exists "insert work_order_resources" on work_order_resources;
drop policy if exists "update work_order_resources" on work_order_resources;

drop policy if exists "read price book" on price_book;
create policy "active read price book" on price_book for select using (is_active());

drop policy if exists "read stat_holidays" on stat_holidays;
create policy "active read stat_holidays" on stat_holidays for select using (is_active());

drop policy if exists "read company_settings" on company_settings;
create policy "active read company_settings" on company_settings for select using (is_active());

drop policy if exists "read tax_rates" on tax_rates;
create policy "active read tax_rates" on tax_rates for select using (is_active());

drop policy if exists "read job_mileage" on job_mileage;
drop policy if exists "insert job_mileage" on job_mileage;
drop policy if exists "update job_mileage" on job_mileage;
create policy "active full access job_mileage" on job_mileage for all using (is_active()) with check (is_active());

drop policy if exists "read job_notes" on job_notes;
drop policy if exists "insert job_notes" on job_notes;
create policy "active full access job_notes" on job_notes for all using (is_active()) with check (is_active());

drop policy if exists "authenticated full access daily_tasks" on daily_tasks;
create policy "active full access daily_tasks" on daily_tasks for all using (is_active()) with check (is_active());

drop policy if exists "read team_messages" on team_messages;
drop policy if exists "insert team_messages" on team_messages;
create policy "active full access team_messages" on team_messages for select using (is_active());
create policy "active insert team_messages" on team_messages for insert with check (is_active());

drop policy if exists "authenticated upload job photos" on storage.objects;
drop policy if exists "authenticated upload job-photos" on storage.objects;
create policy "active upload job-photos" on storage.objects for insert to authenticated
  with check (bucket_id = 'job-photos' and is_active());

-- ---------------------------------------------------------------------------
-- Instance branding (2026-07-29)
-- Moves company-specific values out of the source and into settings, so a second
-- company can run this app from the same repo without editing code. Every column
-- is nullable on purpose: null falls through to the NEXT_PUBLIC_* env vars in
-- lib/brand.js, so an existing deployment is unaffected until an admin fills these
-- in under Admin > Company.
-- ---------------------------------------------------------------------------
alter table company_settings add column if not exists company_name text;
alter table company_settings add column if not exists app_name text;
alter table company_settings add column if not exists company_slug text;
alter table company_settings add column if not exists logo_url text;
alter table company_settings add column if not exists from_email text;
alter table company_settings add column if not exists accountant_email text;
alter table company_settings add column if not exists push_contact_email text;
alter table company_settings add column if not exists default_city text;
alter table company_settings add column if not exists default_province text;

-- ---------------------------------------------------------------------------
-- Receipt duplicate detection (2026-07-29)
-- gmail_message_id already prevents scanning the same email twice. These columns
-- cover the cases it can't: the same purchase emailed twice by the vendor, and a
-- receipt that was already keyed in by hand. Advisory only — flagged receipts stay
-- in the review queue rather than being hidden, so a false positive can't silently
-- lose a legitimate expense.
-- ---------------------------------------------------------------------------
alter table gmail_receipts add column if not exists duplicate_of_receipt_id uuid references gmail_receipts(id) on delete set null;
alter table gmail_receipts add column if not exists duplicate_of_expense_id uuid references job_expenses(id) on delete set null;
alter table gmail_receipts add column if not exists duplicate_reason text;

-- Detection scans recent receipts by amount and by date; both are indexed because
-- this now runs once per message on every sync.
create index if not exists gmail_receipts_amount_idx on gmail_receipts (extracted_amount);
create index if not exists gmail_receipts_received_at_idx on gmail_receipts (received_at desc);
create index if not exists job_expenses_date_amount_idx on job_expenses (date, amount);

-- ---------------------------------------------------------------------------
-- Foreign currency on receipts and expenses (2026-07-29)
-- job_expenses.amount stays in CAD, always — every total, GST figure, job cost
-- rollup, and accountant export already assumes that, and changing it would silently
-- alter the meaning of existing rows. A USD receipt instead records what was actually
-- charged (original_currency + original_amount) alongside the rate used and the
-- business day it came from, so the CAD figure can be reproduced and defended later.
-- ---------------------------------------------------------------------------
alter table gmail_receipts add column if not exists extracted_currency text;

alter table job_expenses add column if not exists original_currency text;
alter table job_expenses add column if not exists original_amount numeric;
alter table job_expenses add column if not exists fx_rate numeric;
alter table job_expenses add column if not exists fx_rate_date date;
alter table job_expenses add column if not exists fx_rate_source text;

-- ---------------------------------------------------------------------------
-- Week planning for daily tasks (2026-07-29)
-- Tasks can now be placed on any day of the week, and anything still unchecked when
-- its day has passed is moved forward. original_date keeps the day it was first
-- planned for and carried_over_count records how many times it has slipped, so a task
-- that keeps getting pushed is visible as such rather than looking freshly added.
-- ---------------------------------------------------------------------------
alter table daily_tasks add column if not exists original_date date;
alter table daily_tasks add column if not exists carried_over_count integer default 0;
alter table daily_tasks add column if not exists assigned_to uuid references profiles(id) on delete set null;

-- Backfill so existing tasks report a sensible origin rather than null.
update daily_tasks set original_date = date where original_date is null;

create index if not exists daily_tasks_date_idx on daily_tasks (date);

-- ---------------------------------------------------------------------------
-- Manual follow-up flags from the Receipts page (2026-07-29)
-- email_action_items was previously populated only by the scan-actionable cron, so it
-- had no insert policy. Flagging a receipt by hand writes the same kind of row, which
-- means it lands in the existing "Needs a reply" list on the week page rather than
-- creating a second inbox to check.
-- ---------------------------------------------------------------------------
do $$ begin
  if not exists (select 1 from pg_policies where tablename = 'email_action_items' and policyname = 'admin insert email_action_items') then
    create policy "admin insert email_action_items" on email_action_items for insert with check (is_admin());
  end if;
end $$;

-- Distinguishes a hand-flagged item from a heuristic one, so the week page can say
-- which is which and the keyword caveat only shows on the guesses.
alter table email_action_items add column if not exists flagged_manually boolean default false;

-- ---------------------------------------------------------------------------
-- Per-client weekly report preference (2026-07-29)
-- Whether a client's weekly report includes labour hours or photos only. Stored on the
-- contact so it's decided once per client rather than at every export: an insurance
-- adjuster generally wants hours documented, a homeowner generally wants progress
-- photos. Defaults to false (photos only), the safer default for a client who hasn't
-- been thought about yet.
-- ---------------------------------------------------------------------------
alter table contacts add column if not exists report_include_hours boolean default false;

-- ---------------------------------------------------------------------------
-- Photo EXIF backfill support (2026-07-29)
-- Photos uploaded before EXIF reading existed have a null taken_at and fall back to
-- their upload date, which puts them in the wrong week on reports. The originals still
-- carry their metadata, so it's recoverable via /api/photos/backfill-exif.
-- exif_checked records that a file has been downloaded and inspected, so photos that
-- genuinely have no EXIF aren't re-downloaded on every subsequent run.
-- ---------------------------------------------------------------------------
alter table job_photos add column if not exists exif_checked boolean default false;

-- Photos that already have a date don't need inspecting.
update job_photos set exif_checked = true where taken_at is not null and exif_checked = false;

create index if not exists job_photos_backfill_idx on job_photos (exif_checked) where taken_at is null;

-- ---------------------------------------------------------------------------
-- Photo thumbnails (2026-07-29)
-- Supabase image transformation is a paid add-on that isn't enabled here, so every view
-- of a job's photos was downloading full-size originals — several hundred MB for a busy
-- week, which is what made photos fail to load and print previews stall. The app now
-- generates a ~1400px rendition at upload time and stores its path here. The original is
-- untouched: it stays the archival copy and is what the EXIF backfill reads.
-- ---------------------------------------------------------------------------
alter table job_photos add column if not exists thumb_path text;

-- Marks a photo as having been through the thumbnail backfill, so repeat runs skip the
-- ones already done (including any that couldn't be processed).
alter table job_photos add column if not exists thumb_checked boolean default false;

create index if not exists job_photos_thumb_backfill_idx on job_photos (thumb_checked) where thumb_path is null;

-- ---------------------------------------------------------------------------
-- Storage update policy for job-photos (2026-07-29)
-- The bucket had insert and delete policies but no update policy. Any upload sent with
-- upsert enabled is an insert-or-update, so it was rejected outright — which is what
-- blocked the thumbnail backfill from writing anything. Thumbnails are normally new
-- objects, but a re-run after a partial write needs to be able to overwrite.
-- ---------------------------------------------------------------------------
do $$ begin
  if not exists (select 1 from pg_policies where tablename = 'objects' and policyname = 'active update job-photos') then
    create policy "active update job-photos" on storage.objects for update to authenticated
      using (bucket_id = 'job-photos' and is_active())
      with check (bucket_id = 'job-photos' and is_active());
  end if;
end $$;

-- ---------------------------------------------------------------------------
-- Scheduled work orders (2026-07-29)
-- Work orders used to be created automatically from every saved invoice, and the week
-- page showed the checklist of any work order attached to a job scheduled that day.
-- The result was that invoicing a job dumped its line items onto the crew's day with no
-- say over timing and no way to remove them. Work orders are now created deliberately
-- and carry the day they go out; one with no date set never appears on the week page.
-- ---------------------------------------------------------------------------
alter table work_orders add column if not exists scheduled_date date;

create index if not exists work_orders_scheduled_idx on work_orders (scheduled_date);

-- ---------------------------------------------------------------------------
-- Keep pricing out of work order titles (2026-07-29)
-- Work orders generated from an invoice were titled "Invoice <date> — $12,450.00", and
-- the Work Orders tab is visible to every crew member (only Financials is restricted).
-- That put the job's price in front of the whole crew. The figure now lives in its own
-- column and is rendered only for admins.
-- ---------------------------------------------------------------------------
alter table work_orders add column if not exists source_amount numeric;

-- Recover the amount from existing titles before stripping it out, so nothing is lost.
update work_orders
set source_amount = nullif(regexp_replace(substring(title from '\$[0-9,]+\.?[0-9]*$'), '[^0-9.]', '', 'g'), '')::numeric
where source_amount is null and title ~ '\$[0-9,]+\.?[0-9]*$';

update work_orders
set title = regexp_replace(title, '\s*—\s*\$[0-9,]+\.?[0-9]*$', '')
where title ~ '\$[0-9,]+\.?[0-9]*$';

-- Deliberately no column-level revoke here: Postgres errors on `select *` when any
-- column is unreadable, which would break the Work Orders tab for the crew entirely.
-- The client asks for an explicit column list instead, so source_amount is only ever
-- requested by an admin session and never reaches a crew member's browser.

-- ---------------------------------------------------------------------------
-- Client view tracking for estimates and invoices (2026-07-29)
-- Records when a client actually opens the link they were sent. One row per view, so
-- repeat opens are visible — a client who opened an estimate four times is a different
-- signal from one who opened it once. Summary columns on the document itself avoid an
-- aggregate query every time the job page lists its documents.
-- ---------------------------------------------------------------------------
create table if not exists document_views (
  id uuid primary key default gen_random_uuid(),
  parent_type text not null check (parent_type in ('estimate', 'invoice')),
  parent_id uuid not null,
  viewed_at timestamptz default now(),
  -- Coarse only: enough to tell a phone from a desktop, and to spot a link forwarded to
  -- someone else. No attempt to identify the individual.
  user_agent text,
  referrer text
);

create index if not exists document_views_parent_idx on document_views (parent_type, parent_id, viewed_at desc);

alter table document_views enable row level security;

do $$ begin
  if not exists (select 1 from pg_policies where tablename = 'document_views' and policyname = 'admin read document_views') then
    create policy "admin read document_views" on document_views for select using (is_admin());
  end if;
end $$;

-- Denormalised summary, written by the public document route via the service role.
alter table estimates add column if not exists first_viewed_at timestamptz;
alter table estimates add column if not exists last_viewed_at timestamptz;
alter table estimates add column if not exists view_count integer default 0;

alter table invoices add column if not exists first_viewed_at timestamptz;
alter table invoices add column if not exists last_viewed_at timestamptz;
alter table invoices add column if not exists view_count integer default 0;

-- ---------------------------------------------------------------------------
-- Attachments on estimates and invoices (2026-07-31)
-- Photos and PDFs a client can look at alongside the document — completion photos,
-- a WCB clearance letter, a spec sheet, a warranty. Shown on the pay page rather than
-- sent as email attachments: it keeps invoice emails light and out of spam filters, and
-- lets a file be added or swapped after the email has gone out.
--
-- An attachment either points at a file uploaded for this purpose (documents bucket) or
-- reuses a photo already on the job (job-photos bucket), which is why the bucket is
-- stored rather than assumed. Nothing is copied — reusing a job photo references the
-- original file.
-- ---------------------------------------------------------------------------
create table if not exists document_attachments (
  id uuid primary key default gen_random_uuid(),
  parent_type text not null check (parent_type in ('estimate', 'invoice')),
  parent_id uuid not null,
  bucket text not null default 'documents' check (bucket in ('documents', 'job-photos')),
  storage_path text not null,
  filename text,
  mime_type text,
  caption text,
  sort_order int default 0,
  -- Set when the attachment reuses an existing job photo, so deleting the attachment
  -- knows not to remove the underlying file.
  job_photo_id uuid references job_photos(id) on delete set null,
  created_at timestamptz default now(),
  created_by uuid references profiles(id) on delete set null
);

create index if not exists document_attachments_parent_idx
  on document_attachments (parent_type, parent_id, sort_order);

alter table document_attachments enable row level security;

-- Only admins manage them in-app. Clients see them through the public document route,
-- which reads with the service role and returns short-lived signed URLs — the bucket
-- policies stay closed.
do $$ begin
  if not exists (select 1 from pg_policies where tablename = 'document_attachments' and policyname = 'admin manage document_attachments') then
    create policy "admin manage document_attachments" on document_attachments for all
      using (is_admin()) with check (is_admin());
  end if;
end $$;

-- ---------------------------------------------------------------------------
-- Photos attached to individual line items (2026-07-31)
-- Editing a document deletes and re-inserts all of its line items, so a foreign key to
-- line_items.id would drop every attached photo on each save. line_key is generated once
-- in the browser when a row is created and carried through every subsequent save, giving
-- a line a stable identity that survives being rewritten.
-- ---------------------------------------------------------------------------
alter table line_items add column if not exists line_key uuid;

-- Existing rows get their current id as a key, so photos can be attached to work that
-- was quoted before this existed.
update line_items set line_key = id where line_key is null;

create index if not exists line_items_line_key_idx on line_items (line_key);

-- Null line_key on an attachment means it belongs to the document as a whole.
alter table document_attachments add column if not exists line_key uuid;

create index if not exists document_attachments_line_key_idx on document_attachments (line_key);

-- ---------------------------------------------------------------------------
-- Auto-create a profile for every auth user (2026-07-31)
-- Profiles were only created by the invite route, so any account created another way —
-- or one whose profile row was deleted — left a person able to sign in with no role and
-- no way for the app to place them. A trigger on auth.users guarantees the row exists.
-- Always 'employee': an admin promotes deliberately from Admin > Team.
-- ---------------------------------------------------------------------------
create or replace function handle_new_auth_user() returns trigger as $$
begin
  insert into public.profiles (id, full_name, role)
  values (
    new.id,
    coalesce(new.raw_user_meta_data->>'full_name', split_part(new.email, '@', 1)),
    'employee'
  )
  on conflict (id) do nothing;
  return new;
end;
$$ language plpgsql security definer set search_path = public;

drop trigger if exists on_auth_user_created on auth.users;
create trigger on_auth_user_created
  after insert on auth.users
  for each row execute function handle_new_auth_user();

-- Backfill anyone who signed in while this was missing, including profiles deleted by
-- hand. Existing rows are left exactly as they are.
insert into public.profiles (id, full_name, role)
select u.id, coalesce(u.raw_user_meta_data->>'full_name', split_part(u.email, '@', 1)), 'employee'
from auth.users u
left join public.profiles p on p.id = u.id
where p.id is null;
