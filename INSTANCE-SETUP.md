# Standing up an instance for another company

Nothing company-specific lives in the source any more. A new deployment needs a new
database, a new Vercel project, and its own environment variables — no code edits.

## 1. Database

Create a new Supabase project, open the SQL editor, and run `supabase/schema.sql`
in full. It's idempotent, so re-running it after a code update is safe.

Then create two storage buckets, both **Private**:

- `documents`
- `job-photos`

## 2. Vercel project

Create a new project pointed at **this same GitHub repo**. Every instance builds from
the same source, so a fix pushed once deploys everywhere.

## 3. Environment variables

Copy `.env.local.example`. The branding block at the bottom is what makes the instance
theirs — company name, sending address, default city, map centre. Everything above it
is per-instance infrastructure (Supabase keys, Resend key, VAPID keys, Google OAuth,
PayPal, `CRON_SECRET`).

`CRON_SECRET` must be set or all eight scheduled jobs return 401 and fail silently.

## 4. Their own external accounts

Each instance needs its own:

- **Resend** domain verification, and a sending address on that domain
- **Google Cloud OAuth** client (for Gmail receipt scanning), with this deployment's
  callback URL added as an authorized redirect
- **PayPal** app credentials
- **VAPID keypair** — `npx web-push generate-vapid-keys`

## 5. Assets

Replace `public/logo.png`, `public/icon-192.png`, `public/icon-512.png`, and
`public/apple-touch-icon.png`. These are the only per-company files still in the repo;
if you'd rather not fork for them, point `NEXT_PUBLIC_LOGO_URL` at a hosted image and
leave the file alone.

## 6. Final pass in the app

Sign in as an admin and fill in **Admin > Company**. Settings entered there override
the environment variables, so an owner can correct their own details without a redeploy.
Placeholders in that form show what the deployment currently falls back to.

## Precedence

`company_settings` row → `NEXT_PUBLIC_*` env vars → generic defaults in `lib/brand.js`.

An instance with nothing configured still runs and still sends valid email; it just
says "Your Company Inc." until someone tells it otherwise.

## Receipt duplicate detection

Scanning flags, but never hides, receipts that look like money already accounted for:

- same PO number and total as a receipt already scanned
- same sender and total within 4 days
- same sender and subject within 14 days (for when amount extraction failed)
- same total as an existing expense dated within 5 days, whether that expense came
  from an earlier scan or was keyed in by hand

Flagged receipts stay in the review queue with an amber note explaining the match.
Confirming one still works — the flag is advice, not a block — and a second check runs
at save time against the amount as edited, since an expense entered after the last sync
is invisible to the scan-time check.

## Foreign currency on receipts

Receipts can be filed in USD. `job_expenses.amount` stays in CAD always — every total,
GST figure, and job cost rollup assumes one currency — so a USD receipt is converted on
save and the original is preserved beside it: `original_currency`, `original_amount`,
`fx_rate`, `fx_rate_date`, `fx_rate_source`.

Rates come from the Bank of Canada Valet API (free, no key, the source the CRA points
to). Rates publish once per business day, so weekends and holidays fall back to the most
recent prior business day, and the date actually used is stored. The rate is editable
per receipt for when a card was charged at a different rate.

The scanner guesses currency from the receipt text and only claims USD on an explicit
marker (`USD`, `US$`), since a bare `$` is ambiguous. Anything unmarked is treated as CAD.

The accountant CSV carries the CAD figures plus all five currency columns.

## Week planning

The crew page at `/today` shows the whole Monday-to-Sunday week. Each day has its own
task list and add box, an optional assignee, and the jobs scheduled that day. Work order
checklists render only on today's card — showing every item for all seven days makes the
page unusable on a phone.

Anything still unchecked when its day passes is moved forward to today, with
`carried_over_count` incremented and `original_date` preserved so a task that keeps
slipping is visibly a repeat rather than looking newly added. Completed tasks stay on the
day they were finished. The bump runs on page load for the current week and again in the
morning `/api/notify?type=start` cron, so it happens whether or not anyone opens the app.

Paging back to a previous week does not bump anything — rewriting history on view would
be wrong.

## Maintenance tools

**Deep receipt scan** — the Receipts page has a window selector (7 days to 2 years).
The scheduled sync only covers the last 7 days; a deep scan pages through up to 500
messages to pull in mail that predates the Gmail connection. Already-scanned messages
are skipped, so re-running is free apart from time.

**Fix photo dates** — under Admin > Import. Photos uploaded before EXIF reading existed
are filed by upload date, which misfiles them on weekly reports. This re-reads the
original files from storage and corrects them. Runs in batches; "Check first" reports
without writing.

## Weekly report

Prints the report alone — no nav, no controls — with the company letterhead from
Admin > Company. Whether hours are included is a per-client setting on the contact
record, defaulting to photos only.

## Security notes

`supabase/security-hardening.sql` must be run alongside `schema.sql` on every instance.
It closes issues found in a July 2026 review:

- profiles could be self-edited to grant admin — now blocked by a trigger
- the documents and job-photos buckets were readable by the public role
- the price book (unit costs and markup) was readable by the whole crew
- Gmail OAuth took the user id from a query parameter, so a crafted link could bind
  one person's mailbox to another person's account — state is now signed and expires
- cron auth failed open when CRON_SECRET was unset

Set `OAUTH_STATE_SECRET` if you'd rather not reuse `CRON_SECRET` for signing OAuth state.

## Sign-in and passwords

Invites and password resets land on `/set-password`. Add that URL to the Supabase
redirect allowlist (Authentication → URL Configuration → Redirect URLs), or the links
will bounce.

Supabase's built-in mail service is rate-limited to a few messages an hour and drops the
rest, which strands invited users. Configure SMTP (Project Settings → Authentication →
SMTP) — Resend is already set up for this app's own email. Until then, Admin → Team has
a **Password link** button per person that returns the link directly so it can be sent
by text.

## Roles

Three roles, set in Admin > Team.

**Employee** — this week, jobs, contacts, map, team chat, time off, clock in/out.

**Foreman** — everything above, plus job financials, the price book (read-only),
estimates and invoices, leads, receipts, and all staff hours. Anything they write for a
client is held: it can't be emailed, its link 404s, and it appears in Admin > Approvals
for an admin to approve or send back. They can archive but not delete.

**Admin** — everything, and the only role that can approve a document, see Reports
(company-wide revenue), run payroll, or change company settings.

Run `supabase/foreman-role.sql` to install the role, the approval columns, and the
triggers that keep approval admin-only at the database level.

## Account settings

`/account` — reachable by tapping the role badge in the nav. Display name and password
change. Matters because it's the only password route that doesn't depend on an email
link surviving a corporate mail scanner.

## Security migrations

Run all three, in order:

1. `supabase/security-hardening.sql`
2. `supabase/foreman-role.sql`
3. `supabase/security-sweep-2.sql`

The third one closes an important gap: `is_admin()` originally checked the role but not
`is_active`, so deactivating an admin or foreman revoked nothing. It ends with a
verification query — an empty result means no policy grants access without checking
that the account is still active.

## Email delivery tracking

Resend dashboard → **Webhooks** → add `https://<your-domain>/api/webhooks/resend`,
subscribe to `email.delivered`, `email.opened`, `email.bounced` and `email.complained`,
and put the signing secret in `RESEND_WEBHOOK_SECRET`. Open tracking also has to be
switched on in Resend or `email.opened` never fires.

Each estimate and invoice then shows its delivery state. Treat opens as soft evidence:
Gmail proxies images and Apple Mail Privacy Protection opens everything on the
recipient's behalf, so an open means "possibly read" and no open means very little. The
pay-page view tracking is the stronger signal, because that's a deliberate click.
Bounces are the reliable part and the reason this is worth having.

## Multi-company

`supabase/tenancy.sql` converts a single-company install into one that can hold many,
with no shared data. Run it once, in full, and read the verification block at the end.

How isolation works, so it can be reasoned about rather than trusted:

- every tenant table has a `company_id`, filled in by a database trigger from the
  caller's own membership — application code never sets it, so it can't be forgotten
- every policy is `(company_id = current_company_id() AND <role check>)`; the role tiers
  are unchanged, company scope is added on top
- `company_id` can't be altered after insert, so a row can't be moved between companies
- storage paths are prefixed with the company id and the bucket policies check it
- billing state can only be changed by the server, never from a browser session

### Signup and billing

`/signup` creates a company, its first admin, and a two-month trial. No card, no email
confirmation. `/billing` shows subscription state and takes promo codes; it stays
reachable when a subscription lapses, because a paywall that also withholds someone's
own records is a different thing entirely.

Promo codes are rows in `promo_codes`. `comped` grants indefinite free access;
`trial_extension` adds `months` to the trial. Add one with:

```sql
insert into promo_codes (code, kind, months, max_uses, note)
values ('EARLYBIRD', 'trial_extension', 6, 25, 'first 25 contractors');
```

Card payment isn't wired up — `/billing` points people at you instead. The columns for
Stripe are already there for when it is.

### Bug reports

`/report-bug`, linked in the nav. Stored in `bug_reports` and emailed to
`BUG_REPORT_EMAIL`, with reply-to set to the reporter.

## Connecting outside accounts (per company)

Each company connects its own PayPal, Resend and email forwarding under
Admin > Company. Guides for all three are on that page and can be emailed to whoever
handles it for them.

PayPal credentials live on the company row, not in environment variables — the secret
encrypted with `SECRET_ENCRYPTION_KEY` and verified against PayPal before saving.
A company with no PayPal connected simply gets no payment button on its client pay
pages.

`SECRET_ENCRYPTION_KEY` must be set (32 bytes, base64). Changing it later makes every
stored secret unreadable, so companies would have to reconnect PayPal.

## Tax summary

Admin > Tax Summary. Tax collected on sales, tax paid on purchases, the GST position,
and expenses by category for any period — with quarter presets and a cash/accrual
toggle. The CSV export includes every invoice and expense behind the totals.

It reports what's been entered, so it flags how many expenses have no GST recorded
rather than quietly understating the input tax credits.

Totals come from `lib/documentTotals.js`, which is now the single place document
arithmetic happens. That calculation was previously duplicated across five files, which
is how the triple-GST bug survived three separate fixes.

## Importing historical invoices

Admin > Import > Invoices. Drop in Joist PDFs; each is parsed for client name, address,
email, phone, invoice number, date, subtotal, tax and total, then shown for review
before saving. Matching clients are linked, new ones created from the PDF.

Two things that matter for the tax report:

- imported documents keep the tax that was actually charged (`imported_tax_amount`)
  rather than being recalculated at today's rates, so a filed period isn't restated
- invoices must be marked paid with a date, or they appear in no cash-basis period

Re-importing the same invoice number is refused by a unique index on
(company, source_system, source_ref), so a repeated import can't double-count revenue.

## Working without signal

The service worker caches the app shell and recent data, so it opens and shows the last
known schedule with no connection. Writes are never retried silently in the background —
they queue in IndexedDB and a bar at the top of every page shows what hasn't sent.

- **Clock in/out** works offline. Time and location are recorded when the button is
  pressed, not when it eventually sends.
- **Quotes** built offline are kept as drafts on the phone and submitted deliberately
  once back in range — pricing worked out on site usually gets revised first.
- **Money is never queued.** Invoices, payments and estimates are not replayed from a
  queue days later against figures that may have moved.

Clock reminders carry a button, so clocking in is one tap from the lock screen. The
action opens the app rather than acting in the background — it needs the phone's
location and the person's session, and a silent failure would leave someone believing
they were on the clock.

## Service-role queries must be scoped by hand

Any route using `SUPABASE_SERVICE_ROLE_KEY` bypasses row-level security. RLS is what
keeps companies apart everywhere else, so in these routes the `company_id` filter has to
be written explicitly on every read.

Three separate leaks have come from forgetting this: tax rates summed across all
companies (a client charged 15% instead of 5%), the pay page falling back to generic
letterhead because `maybeSingle()` returns null when several rows match, and a payroll
report emailing one company's employee hours to another company's accountant.

Crons that genuinely run for every company are the exception — they must group by
company and use each company's own settings inside the loop, never one shared lookup.

Rule of thumb: if a service-role query has no `.eq("company_id", ...)` and isn't keyed
by a unique id, it is returning every company's rows.

## Reading PDFs

`lib/pdfText.js` rebuilds a PDF's lines from pdf.js text items by grouping them on their
y-coordinate. Do not go back to `items.map(i => i.str).join(" ")` — that flattens a page
into one string and destroys the row structure every invoice parser depends on. With it
flattened, a Rona receipt reported the paintbrush list price as the invoice total.

Note also that pdf.js's legacy build is CommonJS, so a dynamic import puts its exports
under `.default`. Getting that wrong makes `getDocument` undefined, and since extraction
returns "" on failure it fails completely silently — which is how receipt scanning
appeared to be a parsing problem for weeks while nothing was being read at all.

## All expenses

Admin > All Expenses. Every filed receipt in one table, with duplicate detection (same
description and amount within a week), inline category editing, and bulk actions for
re-categorising or reassigning many at once. Flags nothing automatically — a contractor
genuinely can buy the same screws twice in a week.

## pdf.js on Vercel

`pdfjs-dist` must stay in `experimental.serverComponentsExternalPackages` in
next.config.mjs. Even with no worker thread, pdf.js loads its parsing engine by
requiring `./pdf.worker.js` at runtime; if Next bundles the library, that sibling file
isn't traced with it and every extraction fails with `Setting up fake worker failed`.

This is why receipt PDFs parsed perfectly in testing and not at all in production — the
failure only appears once bundled.

The Gmail sync is capped at 300s (Vercel Pro's maximum) and stops itself at 260s so a
long run saves what it found and says it was cut short, rather than being killed at the
limit with nothing written.

## Invoice payment status

`invoices.payment_status` is maintained by a database trigger on `deposits`
(`supabase/invoice-payment-status.sql`), not by application code. Payments arrive from
the deposits form, the edit panel, PayPal capture and the Joist import, and any one of
them could forget to update it — which is exactly what happened: invoices showed as
unpaid in the app while the client pay page correctly showed them settled.

That mattered beyond appearances. The tax summary's cash-basis view selects invoices
where `payment_status = 'paid'`, so paid invoices were missing from the tax report and
revenue was understated.

The trigger only ever promotes an invoice on the strength of real payment rows. It will
not undo a manual "mark paid" on an invoice settled some other way, such as by trade.

## Calendar connection

Separate from the Gmail connection on purpose: receipts often arrive at one Google
account while the calendar lives on another. Two connections means neither has to lose.

Read-only scope (`calendar.readonly`). The app never creates or deletes events — booking
a quote produces a prefilled Google Calendar link the person saves themselves.

Setup in Google Cloud:
1. Enable the **Google Calendar API** on the same project as the Gmail OAuth client
2. Add `https://<your-domain>/api/calendar/callback` as an authorized redirect URI

Then connect from the booking panel on Admin > Leads. If reading the calendar returns a
403, the account connected before the scope existed — reconnect it.

## New tables need explicit grants (from 30 October 2026)

Supabase stopped automatically granting Data API access to new tables in the `public`
schema. Existing tables are unaffected and keep their grants.

This matters only when a migration creates a table. Without grants the table exists but
the app can't reach it, and the error reads like an RLS problem rather than a missing
grant — so every `create table` in this project now ships with grants alongside it. See
`supabase/grants-template.sql`.

Grants are not a substitute for row level security. They say the API may reach the table
at all; the RLS policies still decide which rows. A granted table with no policies
returns nothing, which is the safe way round.
