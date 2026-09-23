# Contractor Job Board (CRM)

Job, contact and crew management for contractors. Multi-company: each company
sees only its own data.

## What's built
- Employee login, two access levels: **admin** (management) and **employee**
  - Employees cannot see or reach the Financials tab (estimates/invoices/deposits) —
    this is blocked both in the UI and at the database level (RLS), so it can't be
    accessed by guessing a URL either.
- Jobs list + job detail: Overview, Hours, Expenses, Photos, Work Orders, Financials (admin only), Weekly Report
- Work orders: create from an estimate/invoice with one click, or manually. Each has a
  checklist where checking an item stamps who checked it and when.
- Weekly report per job: hours by worker, expenses, photos — printable/savable as PDF
- Push notifications: crew gets a "clock in" reminder in the morning and a "clock out"
  reminder in the evening (weekdays), via browser push
- Google Calendar: a subscribable calendar feed of jobs by start/end date
- Import clients and invoices from a Joist CSV export

## Not built yet (next phases, per our plan)
- Website + public contact form feeding leads into this CRM
- Permit-based lead generation
- Social media posting

---

## 1. Set up Supabase (database + logins)

1. SQL Editor -> New query -> paste in `supabase/schema.sql` -> run it.
2. **Storage** -> new bucket named `job-photos`, set to **Public**.
3. **Authentication -> Users** -> add a login for yourself and each crew member.
4. **Table Editor -> profiles** -> for each person you just added, insert a row with
   their `id` (copy from the Users page), a `full_name`, and `role` set to either
   `admin` or `employee`. This is what controls who sees Financials — make sure at
   least one person is `admin`.
   - Note: if someone logs in before you've added their profile row, the app
     creates one automatically defaulted to `employee` — you can just edit the
     role afterward in the Table Editor.
5. **Project Settings -> API** -> copy the **Project URL**, **anon public key**, and
   **service_role key** (keep this last one secret — it bypasses all access rules).

## 2. Generate push notification keys

Run this once on your own computer (needs Node.js installed):
```
npx web-push generate-vapid-keys
```
This prints a public and private key — you'll paste these into Vercel in step 4.

## 3. Push this project to GitHub

```
git init
git add .
git commit -m "Initial CRM"
git remote add origin https://github.com/YOUR-USERNAME/mcon-crm.git
git push -u origin main
```

## 4. Deploy on Vercel

1. **Add New -> Project** -> import the GitHub repo.
2. Add these **Environment Variables** before deploying:
   - `NEXT_PUBLIC_SUPABASE_URL`
   - `NEXT_PUBLIC_SUPABASE_ANON_KEY`
   - `SUPABASE_SERVICE_ROLE_KEY`
   - `NEXT_PUBLIC_VAPID_PUBLIC_KEY` / `VAPID_PRIVATE_KEY` (from step 2)
   - `CRON_SECRET` — make up any long random string
   - `CALENDAR_FEED_TOKEN` — make up another long random string
3. Deploy.
4. Open `vercel.json` in your repo and replace `REPLACE_WITH_CRON_SECRET` in both
   cron lines with the actual `CRON_SECRET` value you set, then commit and push
   again (Vercel needs the real secret baked into the cron URL). The two times
   (14:00 and 00:00 UTC, weekdays) are set for roughly 7am/5pm Pacific — adjust
   the `schedule` values in `vercel.json` if your crew's hours are different, or
   when daylight saving shifts.
5. Once deployed, each crew member should open the site and tap "Allow" when
   prompted for notifications — this registers them for the daily reminders.

## 5. Connect Google Calendar

1. Your feed URL is: `https://your-app.vercel.app/calendar.ics?token=YOUR_CALENDAR_FEED_TOKEN`
2. In Google Calendar (on the shared company account): **Other calendars -> +
   -> From URL** -> paste that link.
3. This is one-way (jobs -> calendar) and Google refreshes subscribed calendars
   every several hours, not instantly. If you need instant two-way sync (edit
   in Google Calendar and have it update a job) later, that's a bigger step —
   full Google OAuth — that I can build if this isn't enough.

## 6. Import from Joist

1. In Joist, export your **clients** as CSV, and your **invoices** as CSV.
2. Sign in as an admin account -> **Import** in the nav.
3. Upload the clients CSV first, check the column mapping, import.
4. Then upload the invoices CSV — invoices are matched to a contact by name, so
   contacts need to exist first. Unmatched rows are reported so you can fix
   names and re-run.
5. Imported invoices land under a job called "Imported from Joist" per client,
   since Joist invoices aren't necessarily tied to one job in this system.

---

## Notes on cost
- Supabase free tier + Vercel Pro (~$20/mo) cover this at your current volume.
- Push notifications and the calendar feed don't add cost.
- Job photos are the main thing that can grow storage use over time.

## 7. Price book & building estimates/invoices

- **Price Book** (nav, admin only): add standard items with unit cost and markup.
  Update costs here as they change — each row shows when it was last updated and
  a "Check Rona" shortcut that opens a pre-filled search on rona.ca so checking
  the current price is one tap. This is manual by design: Rona doesn't offer a
  public pricing API, and scraping their site isn't something I built in, since
  it's fragile and against their terms. If the company gets a Rona trade account with
  a bulk pricing export later, tell me and I'll wire that in properly.
- **New Estimate / New Invoice** (from a job's Financials tab): pull items from
  the price book or add blank lines. Client-facing line items compute the total
  automatically (qty × cost × markup). The separate "Internal materials list"
  section is never shown to the client — it's for your own costing, and can be
  exported as a CSV to send to Rona for an official quote, or copied straight
  into a work order when you export the estimate/invoice to one.

## 8. Accountant export (Accounting page, admin only)

- Every expense needs a **tax category** (a set of common contractor expense
  lines) before it's included cleanly — anything missing one is flagged in a
  list at the top of the page so you can assign it in a click.
- **This categorization is a starting point, not tax advice** — have your
  accountant confirm categories (especially tools vs. capital equipment, and
  meals & entertainment) before filing.
- "Download CSV" exports the selected month, ready to hand to your accountant.

## 9. Gmail receipt scanning

This needs your own Google Cloud OAuth app — a heavier setup than anything else
here, because Google requires review before a business app can request read
access to Gmail.

1. Go to console.cloud.google.com → create a project.
2. **APIs & Services → Library** → enable the **Gmail API**.
3. **APIs & Services → OAuth consent screen** → set up as an "Internal" app if
   everyone using this is on the same Google Workspace domain (skips Google's
   review entirely), or "External" + submit for verification if not — external
   verification for the Gmail readonly scope can take some time, so start this
   early if you want it live soon.
4. **APIs & Services → Credentials** → Create Credentials → OAuth client ID →
   type "Web application" → add this as an authorized redirect URI:
   `https://your-app.vercel.app/api/gmail/callback`
5. Copy the **Client ID** and **Client secret** into Vercel as
   `GOOGLE_CLIENT_ID` and `GOOGLE_CLIENT_SECRET`, redeploy.
6. In the app, go to **Receipts** (admin only) → **Connect Gmail** → sign in
   with the inbox you want scanned.
7. Receipts sync automatically twice a day (see `vercel.json`), or hit "Sync
   now" any time. Nothing becomes an expense automatically — every email lands
   as "pending" and needs a job + tax category confirmed by you before it's
   saved. The amount extraction is a rough guess from the email text; always
   double-check it.

## 10. Lead generation (Leads page, admin only)

- **Bollard removal / bollard painting / roll-out work**: automated. Scans the
  Government of Canada's official CanadaBuys open-data tender feed twice daily
  and files matches as leads for review — nothing gets contacted automatically,
  you decide what to pursue.
  - Coverage: this feed is **federal tenders only**. Provincial (BC Bid) and
    municipal (MERX, Biddingo) postings — where a lot of bollard/facility work
    actually gets tendered — aren't available as open data the same way, so
    those are saved-search links on the Leads page you check periodically
    instead of a background scan. If you find you're missing real jobs there,
    tell me and I'll look at what each of those platforms actually allows.
  - "Roll-out work" matching is a broad keyword guess ("rollout," "multi-site,"
    etc.) — if you know specific facility-management companies or program
    names that post this kind of work, give me those and I can search for them
    by name too, which will be far more precise.
- **Deck builds / insurance rebuilds (local)**: not built yet. These aren't
  publicly tendered — they come from building permits (the original "Phase 3"
  from our early plan) and, for insurance rebuilds especially, from adjuster
  and restoration-network relationships that no automated tool replaces.
  Tell me when you want to pick this back up and I'll scope the permit side
  properly (it needs per-city research — each town in the service area
  may publish permits differently or not at all online).

- **Vendor network targets**: some companies (e.g. facility maintenance firms
  doing rollout work) source subcontractors through a direct application
  rather than public bids. Tracked separately at the top of the Leads page —
  Lane Valente Industries and OCC Solutions are pre-loaded from our
  conversation; add more as you find them, and update status as you apply.

## 11. Branding, payments, and client-facing invoices

**Logo** — now used as your app icon, in the app header, and on every invoice/estimate
letterhead. If you want it swapped for a different version later, just send me the file.

**Client-facing invoices/estimates** — each one now has a public link (no login needed)
that you can email to a client. Find it via **Email client** on the Financials tab, or
copy the link from **View / Print**. This is a separate, safe view — it only shows
client-facing pricing, never your internal materials list or costs.

**Setup required — Resend (for sending client emails):**
1. Sign up at resend.com (free tier is plenty for this).
2. Verify your sending domain (Resend walks you through adding a
   few DNS records — this proves to email providers the mail is really from you, and
   without it, sent emails are likely to land in spam or get rejected).
3. Create an API key, add it to Vercel as `RESEND_API_KEY`.
4. Set who replies land with in **Company** page in the app (defaults to
   your own address) — since Reply-To is set on every email, replies go straight
   there, not into some no-reply void.

**Setup required — PayPal (for deposit payments):**
1. Go to developer.paypal.com → log in with your PayPal Business account → Apps & Credentials.
2. Create an app — this gives you a **Client ID** and **Client Secret**.
3. Start with the **Sandbox** credentials while testing (fake money, real flow) — add
   them as `NEXT_PUBLIC_PAYPAL_CLIENT_ID` and `PAYPAL_CLIENT_SECRET` in Vercel, and set
   `PAYPAL_API_BASE` to `https://api-m.sandbox.paypal.com`.
4. Once you've tested a payment end-to-end, switch to **Live** credentials from the same
   dashboard and change `PAYPAL_API_BASE` to `https://api-m.paypal.com`.
5. Payments are captured server-side and only recorded as a deposit once PayPal itself
   confirms the money moved — nothing in the browser can fake a successful payment.

**Company info (WCB / insurance)** — set these once on the new **Company** page. They'll
appear on every invoice and estimate automatically. The format is a clean standard
layout — if you want it to visually match your old Joist invoices exactly, send me a
screenshot of one and I'll replicate the format precisely.

**Payment tracking** — deposits now record a payment method (cash, cheque, e-transfer,
PayPal, credit card, other). Invoices can be marked **Paid** (with date + method) right
from the Financials tab, and show an Unpaid/Partial/Paid badge.

**Overdue reminders** — each invoice has a **Due date** field and an **Auto-remind if
overdue** checkbox. When both are set, if the invoice is still unpaid past its due date,
an automatic reminder email goes out (checked daily, sent at most once a week per invoice)
until it's marked paid.

**One manual step in Supabase:** create a Storage bucket named `documents` (set to
**Public**), the same way you created `job-photos` — this is where the insurance
certificate upload lives.

## 12. Payroll reminders and accountant hours report

On the **1st and 16th of every month** — right after each pay period closes —
every crew member with notifications enabled gets a push reminder to make sure
their hours are logged. That's the only automatic part.

Sending the actual hours report to your accountant is a deliberate manual step —
go to **Admin → Payroll** any time, where you'll see hours grouped by employee for
the pay period (defaults to the one that just finished — **1st–15th**, or
**16th–end of month** — adjustable to any date range). Review the numbers, then hit **Send to accountant**
to email the bookkeeper set in Admin > Company a summary plus a full CSV. Nothing goes
out until you click that button.

Uses the same Resend setup as client invoice emails (section 11) — no extra account
needed, just the same `RESEND_API_KEY`.

## 13. Joist-parity additions (PO numbers, taxes, deposits, activity, reports)

- **PO Number** and **sequential document numbers** (Estimate #1001, Invoice #1001, etc.) now show on every document.
- **Configurable taxes** — manage a list (GST, PST, etc.) on the **Company** page instead of a hardcoded 5%. Applied automatically to every total.
- **Request a Deposit**, **Discount**, and **overall Markup %** are now available per estimate/invoice — set them when building the document; the client sees a separate deposit-only PayPal button if a deposit is requested.
- **Auto-generate invoice on approval** — a per-estimate toggle; when the client signs, a matching invoice is created automatically.
- **Activity log** — every document tracks when it's viewed, emailed, signed, or paid; shown at the bottom of the internal document view.
- **Reports** page (Admin menu) — Total Revenue, Grand Total Invoices, Grand Total Estimates, Deposits Received, for any date range.
- **Email templates** — customize the subject/message for estimate and invoice emails from the Company page.
- **Contact quick actions** — Call, Text, and Map links next to phone/address on a contact's page.
- **QR code** on the public document page (visible on printed copies) linking back to the online version.

Skipped on purpose (Joist-specific monetization features, not relevant to running your own app): their PRO/ELITE upsell gating, and the built-in "Collect Google Reviews" marketing tool — happy to build a version of the latter later if you want it.

## Notes on access
- `admin` = full access including Financials, Price Book, Accounting, Receipts,
  Leads, and Import. `employee` = everything except those. There's no
  self-signup — only accounts you create in Supabase can log in.
