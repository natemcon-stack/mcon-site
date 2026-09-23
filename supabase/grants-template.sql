-- ===========================================================================
-- Grants for a newly created table — from 30 October 2026
--
-- Supabase no longer grants Data API access automatically to new tables in the public
-- schema. Existing tables are unaffected. Copy this alongside any create table.
--
-- Grants are not RLS. These say the API may reach the table at all; the policies still
-- decide which rows. A granted table with no policies returns nothing, which is the
-- safe way round.
-- ===========================================================================

-- Replace my_new_table throughout.

-- Only where a signed-out visitor must read it — the public document/pay page, for
-- instance. Most tables in this app should NOT have this line.
-- grant select on public.my_new_table to anon;

grant select, insert, update, delete on public.my_new_table to authenticated;
grant select, insert, update, delete on public.my_new_table to service_role;
