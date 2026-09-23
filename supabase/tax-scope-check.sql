-- ===========================================================================
-- Tax rates per company — diagnostic, 2026-08-11
--
-- The public pay page, the invoice email and the PayPal order route all read tax_rates
-- with the service role, which bypasses RLS. None of them filtered by company, so an
-- invoice was taxed with every company's rates added together — three GST lines on a
-- two-company install, and the client charged 15% instead of 5%.
--
-- Code is fixed. Run this to confirm the data underneath is sane.
-- ===========================================================================

-- 1. Who has what. Expect one GST row per company, not several against one.
select c.name as company,
       t.name as tax,
       t.rate,
       t.enabled
from tax_rates t
left join companies c on c.id = t.company_id
order by c.created_at, t.sort_order;

-- 2. Any tax rate with no company belongs to nobody and will be missed by the
-- scoped queries. Expect zero rows.
select id, name, rate from tax_rates where company_id is null;

-- 3. Duplicates within a single company — a real double-charge if any exist.
select company_id, upper(name) as tax, count(*)
from tax_rates
group by company_id, upper(name)
having count(*) > 1;
