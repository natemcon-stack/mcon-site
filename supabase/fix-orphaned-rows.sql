-- ===========================================================================
-- Server-side writes were landing with no company — 2026-08-06
--
-- The tenancy trigger fills company_id from current_company_id(), which reads the
-- caller's profile. Server routes run with the service role and have no auth.uid(),
-- so that returns null — and a row with a null company_id satisfies no policy, so it
-- exists but is invisible to everyone.
--
-- That is why PayPal payments recorded nothing: the deposit row was written and then
-- hidden. The same applies to every webhook, cron and public-page write made since
-- tenancy went in.
--
-- Fixed here rather than in ten route files, because the next route someone writes
-- would have the same bug. Where a row has a parent — a job, an estimate, an invoice —
-- the company is derivable from it, and the database is the right place to derive it.
--
-- Run once. Idempotent. Includes a backfill for rows already orphaned.
-- ===========================================================================


-- ---------------------------------------------------------------------------
-- 1. Derive company_id from the parent row when the caller has no company.
-- ---------------------------------------------------------------------------
create or replace function set_company_id() returns trigger as $$
declare
  derived uuid;
begin
  if tg_op = 'INSERT' then
    if new.company_id is null then
      derived := current_company_id();

      -- Service role (webhooks, cron, public pages): no session, so no company to read.
      -- Take it from whatever this row belongs to instead.
      if derived is null then
        -- Anything hanging off a job.
        if to_jsonb(new) ? 'job_id' and (to_jsonb(new)->>'job_id') is not null then
          select company_id into derived from jobs where id = (to_jsonb(new)->>'job_id')::uuid;
        end if;

        -- Anything hanging off an estimate or invoice: line items, activity, views,
        -- attachments. parent_type says which table to look in.
        if derived is null
           and to_jsonb(new) ? 'parent_id' and (to_jsonb(new)->>'parent_id') is not null then
          if (to_jsonb(new)->>'parent_type') = 'estimate' then
            select company_id into derived from estimates where id = (to_jsonb(new)->>'parent_id')::uuid;
          elsif (to_jsonb(new)->>'parent_type') = 'invoice' then
            select company_id into derived from invoices where id = (to_jsonb(new)->>'parent_id')::uuid;
          end if;
        end if;

        -- Work order children.
        if derived is null
           and to_jsonb(new) ? 'work_order_id' and (to_jsonb(new)->>'work_order_id') is not null then
          select company_id into derived from work_orders where id = (to_jsonb(new)->>'work_order_id')::uuid;
        end if;

        -- Anything recorded against a person.
        if derived is null
           and to_jsonb(new) ? 'user_id' and (to_jsonb(new)->>'user_id') is not null then
          select company_id into derived from profiles where id = (to_jsonb(new)->>'user_id')::uuid;
        end if;
      end if;

      new.company_id := derived;

    elsif auth.uid() is not null and new.company_id is distinct from current_company_id() then
      raise exception 'Cannot create records for another company';
    end if;

    return new;
  end if;

  -- Filling in a blank is not moving a record. Without this exception the backfill
  -- below can't run — assigning a company to a row that never had one trips the very
  -- rule meant to stop rows crossing between companies.
  if old.company_id is null then
    return new;
  end if;

  if new.company_id is distinct from old.company_id then
    raise exception 'Records cannot be moved between companies';
  end if;
  return new;
end;
$$ language plpgsql security definer;


-- ---------------------------------------------------------------------------
-- 2. Rescue rows already orphaned.
--
-- Every one of these is a record that exists and cannot be seen — payments, activity,
-- line items. Worth checking the counts before and after.
-- ---------------------------------------------------------------------------
update deposits d set company_id = j.company_id
from jobs j where d.job_id = j.id and d.company_id is null;

update job_hours h set company_id = j.company_id
from jobs j where h.job_id = j.id and h.company_id is null;

update job_expenses e set company_id = j.company_id
from jobs j where e.job_id = j.id and e.company_id is null;

update job_photos p set company_id = j.company_id
from jobs j where p.job_id = j.id and p.company_id is null;

update job_notes n set company_id = j.company_id
from jobs j where n.job_id = j.id and n.company_id is null;

update job_mileage m set company_id = j.company_id
from jobs j where m.job_id = j.id and m.company_id is null;

update estimates e set company_id = j.company_id
from jobs j where e.job_id = j.id and e.company_id is null;

update invoices i set company_id = j.company_id
from jobs j where i.job_id = j.id and i.company_id is null;

update line_items l set company_id = e.company_id
from estimates e where l.parent_type = 'estimate' and l.parent_id = e.id and l.company_id is null;

update line_items l set company_id = i.company_id
from invoices i where l.parent_type = 'invoice' and l.parent_id = i.id and l.company_id is null;

update document_activity a set company_id = e.company_id
from estimates e where a.parent_type = 'estimate' and a.parent_id = e.id and a.company_id is null;

update document_activity a set company_id = i.company_id
from invoices i where a.parent_type = 'invoice' and a.parent_id = i.id and a.company_id is null;

update document_views v set company_id = e.company_id
from estimates e where v.parent_type = 'estimate' and v.parent_id = e.id and v.company_id is null;

update document_views v set company_id = i.company_id
from invoices i where v.parent_type = 'invoice' and v.parent_id = i.id and v.company_id is null;

update document_attachments t set company_id = e.company_id
from estimates e where t.parent_type = 'estimate' and t.parent_id = e.id and t.company_id is null;

update document_attachments t set company_id = i.company_id
from invoices i where t.parent_type = 'invoice' and t.parent_id = i.id and t.company_id is null;

update work_orders w set company_id = j.company_id
from jobs j where w.job_id = j.id and w.company_id is null;

update work_order_items wi set company_id = w.company_id
from work_orders w where wi.work_order_id = w.id and wi.company_id is null;

update work_order_materials wm set company_id = w.company_id
from work_orders w where wm.work_order_id = w.id and wm.company_id is null;

update work_order_resources wr set company_id = w.company_id
from work_orders w where wr.work_order_id = w.id and wr.company_id is null;

-- Tables with no parent to derive from belong to whoever's connection or cron created
-- them. With one company on the platform that's unambiguous; revisit if that changes.
do $$
declare only_company uuid;
begin
  if (select count(*) from companies) = 1 then
    select id into only_company from companies;
    update gmail_receipts set company_id = only_company where company_id is null;
    update email_action_items set company_id = only_company where company_id is null;
    update leads set company_id = only_company where company_id is null;
    update gmail_connections set company_id = only_company where company_id is null;
    update social_connections set company_id = only_company where company_id is null;
    update daily_tasks set company_id = only_company where company_id is null;
    update contacts set company_id = only_company where company_id is null;
  end if;
end $$;


-- ---------------------------------------------------------------------------
-- 3. Verification — any row here is still invisible to the app.
-- ---------------------------------------------------------------------------
select 'deposits' as table, count(*) as orphaned from deposits where company_id is null
union all select 'invoices', count(*) from invoices where company_id is null
union all select 'estimates', count(*) from estimates where company_id is null
union all select 'line_items', count(*) from line_items where company_id is null
union all select 'document_activity', count(*) from document_activity where company_id is null
union all select 'job_hours', count(*) from job_hours where company_id is null
union all select 'job_photos', count(*) from job_photos where company_id is null
union all select 'contacts', count(*) from contacts where company_id is null
order by orphaned desc;


-- ---------------------------------------------------------------------------
-- 4. Link an invoice back to the estimate that produced it.
--
-- Without this there's no way to tell whether an estimate has already been converted,
-- so signing and then paying a deposit would raise two invoices for the same work.
-- ---------------------------------------------------------------------------
alter table invoices add column if not exists from_estimate_id uuid references estimates(id) on delete set null;

create unique index if not exists invoices_from_estimate_key
  on invoices (from_estimate_id) where from_estimate_id is not null;
