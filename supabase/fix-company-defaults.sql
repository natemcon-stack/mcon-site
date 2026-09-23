-- ===========================================================================
-- URGENT — new companies were created carrying M-CON's details — 2026-08-12
--
-- company_settings columns were originally created with M-CON's own values as column
-- DEFAULTS. The schema file was cleaned up later, but `add column if not exists` does
-- nothing to a column that already exists — so the live database kept the defaults, and
-- every company created since has started life with M-CON's reply-to address and email
-- templates.
--
-- Cool Comfort HVAC saw "Estimate from M-CON Enterprises Inc." and natemcon@gmail.com
-- in their own settings. Worse than cosmetic: an unedited template would have sent a
-- client email under the wrong company's name, with replies going to the wrong inbox.
--
-- Run this now. Idempotent.
-- ===========================================================================

-- 1. Stop it happening again.
alter table company_settings alter column reply_to_email drop default;
alter table company_settings alter column estimate_email_subject drop default;
alter table company_settings alter column invoice_email_subject drop default;
alter table company_settings alter column review_email_body drop default;
alter table company_settings alter column review_email_subject drop default;

-- Anything else that might carry a value belonging to one company.
alter table company_settings alter column estimate_email_body drop default;
alter table company_settings alter column invoice_email_body drop default;

-- 2. Clear what's already been copied into other companies.
--
-- Scoped to companies OTHER than the original, and only where the value still matches
-- what the default would have written. Anything a company has edited for itself is left
-- alone — clearing that would be a second, self-inflicted version of the same problem.
do $$
declare original uuid;
begin
  select id into original from companies order by created_at limit 1;

  update company_settings
  set reply_to_email = null
  where company_id is distinct from original
    and reply_to_email = 'natemcon@gmail.com';

  update company_settings
  set estimate_email_subject = null
  where company_id is distinct from original
    and estimate_email_subject ilike '%m-con%';

  update company_settings
  set invoice_email_subject = null
  where company_id is distinct from original
    and invoice_email_subject ilike '%m-con%';

  update company_settings
  set review_email_body = null
  where company_id is distinct from original
    and review_email_body ilike '%m-con%';

  update company_settings
  set estimate_email_body = null
  where company_id is distinct from original
    and estimate_email_body ilike '%m-con%';

  update company_settings
  set invoice_email_body = null
  where company_id is distinct from original
    and invoice_email_body ilike '%m-con%';
end $$;

-- 3. Any column still carrying a default that could leak one company's data into
-- another's. Read the output — anything listed needs the same treatment.
select column_name, column_default
from information_schema.columns
where table_schema = 'public'
  and table_name = 'company_settings'
  and column_default is not null
  and column_default not in ('now()', 'gen_random_uuid()', 'true', 'false', '0')
order by column_name;

-- 4. What each company is left with. Nobody but the original should show M-CON
-- anything, and blanks are correct — the code falls back to that company's own name.
select c.name as company,
       s.reply_to_email,
       s.estimate_email_subject,
       s.invoice_email_subject
from company_settings s
join companies c on c.id = s.company_id
order by c.created_at;
