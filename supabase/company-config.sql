-- ===========================================================================
-- Per-company configuration — 2026-08-05
--
-- Removes the last assumptions that this app belongs to one company in one province.
-- Run after tenancy.sql. Idempotent.
-- ===========================================================================


-- ---------------------------------------------------------------------------
-- 1. Province, payroll schedule, and branding, on the company's own settings.
-- ---------------------------------------------------------------------------
alter table company_settings add column if not exists province text default 'BC';

-- Payroll ran on the 11th and 26th because that's one company's cycle. Semi-monthly
-- keeps those two days configurable; the other schedules ignore them.
alter table company_settings add column if not exists payroll_schedule text default 'semi_monthly'
  check (payroll_schedule in ('weekly', 'biweekly', 'semi_monthly', 'monthly'));
alter table company_settings add column if not exists payroll_day_1 integer default 11;
alter table company_settings add column if not exists payroll_day_2 integer default 26;
-- For weekly and biweekly: 0 = Sunday. Biweekly also needs a known good period start
-- to count fortnights from, otherwise "every second Friday" is ambiguous.
alter table company_settings add column if not exists payroll_weekday integer default 5;
alter table company_settings add column if not exists payroll_anchor_date date;

-- Uploaded logo, replacing the file that shipped in the repo.
alter table company_settings add column if not exists logo_path text;
-- What the crew-facing header reads. Defaults to the company name plus "Job Board".
alter table company_settings add column if not exists app_header text;


-- ---------------------------------------------------------------------------
-- 2. Stat holidays become per-company and per-province.
--
-- The table had a unique constraint on date alone, which across companies would mean
-- one company adding Family Day blocks every other company from having it.
-- ---------------------------------------------------------------------------
alter table stat_holidays add column if not exists province text default 'BC';
alter table stat_holidays add column if not exists is_custom boolean default false;

do $$ begin
  if exists (select 1 from pg_constraint where conname = 'stat_holidays_date_key') then
    alter table stat_holidays drop constraint stat_holidays_date_key;
  end if;
end $$;

create unique index if not exists stat_holidays_company_date_key
  on stat_holidays (company_id, date);


-- ---------------------------------------------------------------------------
-- 3. Canadian sales taxes, as presets a company switches on.
--
-- Every province's actual combination, so nobody has to look up whether they charge
-- GST plus PST or a single HST. A new company gets its province's set enabled and the
-- rest available but off.
-- ---------------------------------------------------------------------------
create table if not exists tax_presets (
  id uuid primary key default gen_random_uuid(),
  province text not null,
  name text not null,
  rate numeric not null,
  sort_order int default 0,
  unique (province, name)
);

alter table tax_presets enable row level security;
drop policy if exists "read tax_presets" on tax_presets;
-- Reference data, identical for everyone and containing nothing private.
create policy "read tax_presets" on tax_presets for select using (auth.uid() is not null);

insert into tax_presets (province, name, rate, sort_order) values
  ('AB', 'GST', 5, 0),
  ('BC', 'GST', 5, 0),
  ('BC', 'PST', 7, 1),
  ('MB', 'GST', 5, 0),
  ('MB', 'RST', 7, 1),
  ('NB', 'HST', 15, 0),
  ('NL', 'HST', 15, 0),
  ('NS', 'HST', 14, 0),
  ('NT', 'GST', 5, 0),
  ('NU', 'GST', 5, 0),
  ('ON', 'HST', 13, 0),
  ('PE', 'HST', 15, 0),
  ('QC', 'GST', 5, 0),
  ('QC', 'QST', 9.975, 1),
  ('SK', 'GST', 5, 0),
  ('SK', 'PST', 6, 1),
  ('YT', 'GST', 5, 0)
on conflict (province, name) do update set rate = excluded.rate;

-- Nova Scotia dropped to 14% on 1 April 2025; the update above corrects any instance
-- seeded before that.


-- ---------------------------------------------------------------------------
-- 4. Existing settings that carried one company's details as defaults.
--
-- These were seeded with real values back when there was only one company. On a
-- multi-company install they'd be someone else's reply address and subject lines.
-- Cleared only where they still hold the original values — anything edited is left
-- alone.
-- ---------------------------------------------------------------------------
update company_settings
set reply_to_email = null
where reply_to_email = 'natemcon@gmail.com'
  and company_id <> (select id from companies order by created_at limit 1);

update company_settings
set estimate_email_subject = null
where estimate_email_subject ilike '%m-con%';

update company_settings
set invoice_email_subject = null
where invoice_email_subject ilike '%m-con%';

update company_settings
set review_email_body = null
where review_email_body ilike '%m-con%';


-- ---------------------------------------------------------------------------
-- 5. Logos live in the documents bucket under the company's own prefix, so the
--    existing storage policies already cover them.
-- ---------------------------------------------------------------------------


-- ---------------------------------------------------------------------------
-- 6. Verification.
-- ---------------------------------------------------------------------------
select 'tax presets' as check, count(*)::text as value from tax_presets
union all
select 'provinces covered', count(distinct province)::text from tax_presets
union all
select 'companies without a province', count(*)::text from company_settings where province is null;
