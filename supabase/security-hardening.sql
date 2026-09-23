-- ===========================================================================
-- Security hardening — 2026-07-29
--
-- Run this in the Supabase SQL editor. Every statement is idempotent and safe to
-- re-run. Ordered most serious first.
-- ===========================================================================


-- ---------------------------------------------------------------------------
-- 1. CRITICAL — privilege escalation via the profiles table.
--
-- The "update own profile" policy allowed any signed-in user to update their own
-- profiles row, and `role` lives on that row. Nothing stopped an employee from
-- setting their own role to 'admin' with a single call from the browser, which would
-- hand them invoices, estimates, payroll, and the price book. The same hole let a
-- deactivated account set is_active back to true.
--
-- RLS can't express "you may edit this row but not these columns", so the guard is a
-- trigger: role, is_active and employment_type may only be changed by an admin.
-- ---------------------------------------------------------------------------
create or replace function guard_profile_privileges() returns trigger as $$
begin
  -- The service role (server-side routes, the invite flow) bypasses this deliberately.
  if auth.uid() is null then
    return new;
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

  return new;
end;
$$ language plpgsql security definer;

drop trigger if exists guard_profile_privileges_trigger on profiles;
create trigger guard_profile_privileges_trigger
  before update on profiles
  for each row execute function guard_profile_privileges();

-- Belt and braces: an employee has no reason to insert a profile row at all, and the
-- old insert policy let them create one with any role they liked.
drop policy if exists "insert profile" on profiles;
create policy "insert profile" on profiles for insert
  with check ((auth.uid() = id and role = 'employee') or is_admin());


-- ---------------------------------------------------------------------------
-- 2. HIGH — client documents were readable by anyone, and writable by any user.
--
-- "public read documents" applied to the public role, so anyone holding the app's
-- anon key (which ships in the browser bundle by design) could read anything in the
-- documents bucket given a path — that bucket holds invoice and estimate PDFs.
-- "authenticated upload documents" let any signed-in user write into it.
--
-- The pay page doesn't serve files from this bucket, so nothing legitimate breaks.
-- ---------------------------------------------------------------------------
drop policy if exists "public read documents" on storage.objects;
drop policy if exists "anyone view documents" on storage.objects;
drop policy if exists "authenticated upload documents" on storage.objects;

do $$ begin
  if not exists (select 1 from pg_policies where tablename = 'objects' and policyname = 'admin read documents') then
    create policy "admin read documents" on storage.objects for select to authenticated
      using (bucket_id = 'documents' and is_admin());
  end if;
end $$;

do $$ begin
  if not exists (select 1 from pg_policies where tablename = 'objects' and policyname = 'admin write documents') then
    create policy "admin write documents" on storage.objects for insert to authenticated
      with check (bucket_id = 'documents' and is_admin());
  end if;
end $$;


-- ---------------------------------------------------------------------------
-- 3. HIGH — job photos were readable by the public role.
--
-- Same shape as above: "anyone view job-photos" had no role restriction, so the anon
-- key plus a path was enough to read any site photo. Photos are served through signed
-- URLs generated server-side, so restricting this doesn't affect the app.
-- ---------------------------------------------------------------------------
drop policy if exists "anyone view job-photos" on storage.objects;

do $$ begin
  if not exists (select 1 from pg_policies where tablename = 'objects' and policyname = 'active read job-photos') then
    create policy "active read job-photos" on storage.objects for select to authenticated
      using (bucket_id = 'job-photos' and is_active());
  end if;
end $$;

-- The older unrestricted upload policy is superseded by the is_active() one added
-- with the crew access changes.
drop policy if exists "authenticated upload job-photos" on storage.objects;


-- ---------------------------------------------------------------------------
-- 4. MEDIUM — the price book exposed cost and markup to the whole crew.
--
-- Every active user could read price_book, which carries unit costs and markup
-- percentages — i.e. the margin on everything. Restricted to admins until the foreman
-- role exists, at which point foremen get it back deliberately.
-- ---------------------------------------------------------------------------
drop policy if exists "read price book" on price_book;
drop policy if exists "active read price book" on price_book;

do $$ begin
  if not exists (select 1 from pg_policies where tablename = 'price_book' and policyname = 'admin read price book') then
    create policy "admin read price book" on price_book for select using (is_admin());
  end if;
end $$;


-- ---------------------------------------------------------------------------
-- 5. LOW — cap the referral field written from the public pay page.
--
-- That endpoint takes an unauthenticated string from anyone holding a document link.
-- React escapes it on display so it isn't an injection risk, but nothing stopped a
-- multi-megabyte value being stored.
-- ---------------------------------------------------------------------------
do $$ begin
  if not exists (
    select 1 from information_schema.constraint_column_usage
    where table_name = 'estimates' and constraint_name = 'estimates_referral_source_length'
  ) then
    alter table estimates add constraint estimates_referral_source_length
      check (referral_source is null or length(referral_source) <= 200);
  end if;
end $$;


-- ---------------------------------------------------------------------------
-- 6. Attachments bucket note (added 2026-07-31 with the attachments feature).
--
-- Attachments live in the documents bucket, which section 2 above restricted to
-- admins. Clients never read that bucket directly — the public document route signs
-- short-lived URLs with the service role — so no additional policy is needed, and
-- the bucket must NOT be reopened to the public role.
-- ---------------------------------------------------------------------------
