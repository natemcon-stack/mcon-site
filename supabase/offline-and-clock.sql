-- ===========================================================================
-- Clock in/out with location, and offline support — 2026-08-12
-- Run once. Idempotent.
-- ===========================================================================

-- Actual clock in/out. Until now the app only reminded people to log hours by hand;
-- there was nothing to press. Hours still land in job_hours — this is what produces
-- them, so payroll and job costing are unchanged.
create table if not exists shifts (
  id uuid primary key default gen_random_uuid(),
  company_id uuid references companies(id) on delete cascade,
  user_id uuid references profiles(id) on delete set null,
  job_id uuid references jobs(id) on delete set null,

  clock_in_at timestamptz not null,
  clock_out_at timestamptz,

  -- Where the phone was when each end of the shift was recorded. Captured because a
  -- crew member clocking in from home instead of site is the thing this is for; it is
  -- not continuous tracking and nothing records location between the two.
  clock_in_lat numeric,
  clock_in_lng numeric,
  clock_out_lat numeric,
  clock_out_lng numeric,

  -- True when the entry was made with no signal and sent later. Worth seeing: an entry
  -- queued at 7am and sent at 4pm has a location and a time from 7am, but only the
  -- phone's word for it.
  recorded_offline boolean default false,

  note text,
  -- Set once the shift has been turned into a job_hours row, so a repeated sync can't
  -- bill the same hours twice.
  hours_entry_id uuid references job_hours(id) on delete set null,

  created_at timestamptz default now()
);

create index if not exists shifts_user_open_idx on shifts (user_id) where clock_out_at is null;
create index if not exists shifts_company_date_idx on shifts (company_id, clock_in_at desc);

alter table shifts enable row level security;

-- Everyone sees and records their own; management sees the crew's.
do $$ begin
  if not exists (select 1 from pg_policies where tablename = 'shifts' and policyname = 'own shifts') then
    create policy "own shifts" on shifts for all
      using (company_id = current_company_id() and (user_id = auth.uid() or is_management()))
      with check (company_id = current_company_id() and (user_id = auth.uid() or is_management()));
  end if;
end $$;

drop trigger if exists set_company_id_shifts on shifts;
create trigger set_company_id_shifts before insert or update on shifts
  for each row execute function set_company_id();

-- A shift sent from an offline queue could arrive twice if the phone retried before the
-- first attempt's response came back. The client id makes that harmless.
alter table shifts add column if not exists client_id uuid;
create unique index if not exists shifts_client_id_key on shifts (client_id) where client_id is not null;

-- Same protection for hours and photos written from the queue.
alter table job_hours add column if not exists client_id uuid;
create unique index if not exists job_hours_client_id_key on job_hours (client_id) where client_id is not null;

alter table job_photos add column if not exists client_id uuid;
create unique index if not exists job_photos_client_id_key on job_photos (client_id) where client_id is not null;

-- job_hours records who worked as free text. Linking it to the account means a shift
-- can produce hours without guessing at a name.
alter table job_hours add column if not exists user_id uuid references profiles(id) on delete set null;

-- Verification.
select 'shifts table' as check, count(*)::text as value from shifts
union all
select 'open shifts', count(*)::text from shifts where clock_out_at is null;
