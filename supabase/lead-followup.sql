-- ===========================================================================
-- Working a lead: notes, and booking a quote — 2026-09-17
-- Run once. Idempotent.
--
-- The leads table was built for public tender listings, where a lead is something you
-- read and then either chase or dismiss. A website enquiry is different: it's a person
-- waiting for a callback, and the work of a lead is the conversation that follows.
-- ===========================================================================

-- What was said and when. Kept on the lead itself rather than in a separate table —
-- these are a handful of lines per lead, and a note that lives with the lead is a note
-- that gets read.
alter table leads add column if not exists notes text;

-- When the quote visit is booked for. A lead with a date on it is the thing that
-- actually needs doing this week.
alter table leads add column if not exists quote_at timestamptz;

-- What the lead became, so a won enquiry stops looking like an outstanding one.
alter table leads add column if not exists converted_contact_id uuid references contacts(id) on delete set null;
alter table leads add column if not exists converted_job_id uuid references jobs(id) on delete set null;

-- Website enquiries carry a phone and email that don't belong in "organization".
-- Stored properly so a lead can become a contact without retyping.
alter table leads add column if not exists contact_name text;
alter table leads add column if not exists contact_phone text;
alter table leads add column if not exists contact_email text;

create index if not exists leads_quote_at_idx on leads (quote_at) where quote_at is not null;

-- Verification.
select source, status, count(*) from leads group by source, status order by source;

-- ===========================================================================
-- Calendar connection — 2026-09-17
--
-- Separate from gmail_connections on purpose: receipts arrive at one Google account and
-- the calendar lives on another. Bundling both onto a single login would force one of
-- them to lose.
--
-- Read-only access. The app never creates or deletes calendar events — booking a quote
-- produces a prefilled link the person saves themselves.
-- ===========================================================================

create table if not exists calendar_connections (
  id uuid primary key default gen_random_uuid(),
  company_id uuid references companies(id) on delete cascade,
  user_id uuid references profiles(id) on delete cascade unique,
  email text,
  refresh_token text not null,
  -- Which calendar in that account. Google accepts "primary" as an alias, but an
  -- explicit id lets someone pick a work diary over a personal one.
  calendar_id text not null default 'primary',
  connected_at timestamptz default now()
);

alter table calendar_connections enable row level security;

-- Each person sees and manages only their own connection. A refresh token is a live
-- credential to someone's diary; no policy grants anyone else access to it.
do $$ begin
  if not exists (select 1 from pg_policies where tablename = 'calendar_connections' and policyname = 'own calendar connection') then
    create policy "own calendar connection" on calendar_connections for all
      using (user_id = auth.uid())
      with check (user_id = auth.uid());
  end if;
end $$;

drop trigger if exists set_company_id_calendar_connections on calendar_connections;
create trigger set_company_id_calendar_connections before insert or update on calendar_connections
  for each row execute function set_company_id();
