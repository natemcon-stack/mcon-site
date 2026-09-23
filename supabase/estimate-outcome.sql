-- ===========================================================================
-- Estimate outcomes — 2026-08-11
-- Run once. Idempotent.
--
-- The app could only tell whether an estimate had been digitally signed, which misses
-- how most work is actually won: a phone call, a handshake, a text saying go ahead.
-- Everything unsigned looked identical, so there was no way to tell a live quote from
-- one the client turned down six weeks ago.
-- ===========================================================================

alter table estimates add column if not exists outcome text not null default 'open'
  check (outcome in ('open', 'accepted', 'declined', 'expired'));

alter table estimates add column if not exists outcome_at timestamptz;
alter table estimates add column if not exists outcome_note text;

create index if not exists estimates_outcome_idx on estimates (outcome) where outcome = 'open';

-- Anything already signed was accepted — the client put their name to it.
update estimates
set outcome = 'accepted',
    outcome_at = coalesce(signed_at, now())
where signed_at is not null and outcome = 'open';

-- So was anything that produced an invoice.
update estimates e
set outcome = 'accepted',
    outcome_at = coalesce(e.outcome_at, i.created_at)
from invoices i
where i.from_estimate_id = e.id and e.outcome = 'open';

-- Signing marks it accepted from now on, so the two can't drift apart.
create or replace function mark_estimate_accepted_on_sign() returns trigger as $$
begin
  if new.signature_name is distinct from old.signature_name
     and new.signature_name is not null
     and new.outcome = 'open' then
    new.outcome := 'accepted';
    new.outcome_at := now();
  end if;
  return new;
end;
$$ language plpgsql security definer;

drop trigger if exists mark_estimate_accepted on estimates;
create trigger mark_estimate_accepted before update on estimates
  for each row execute function mark_estimate_accepted_on_sign();

-- Verification: how the back catalogue now breaks down.
select outcome, count(*) from estimates group by outcome order by count(*) desc;
