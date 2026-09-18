# mconenterprisesinc.ca

The M-CON Enterprises Inc. website. Next.js 14, static except the contact form.

## Deploying

1. Push this to a **new** GitHub repo — keep it separate from `mcon-crm` so a website
   change can never take the CRM down.
2. Import the repo as a new Vercel project. It's covered by the existing Pro plan, so
   there's no extra hosting cost.
3. Set the environment variables below.
4. Point the domain at it in Vercel: `mconenterprisesinc.ca` and `www`.

## Environment variables

The site works without any of these — the form just can't send. Set them to make it live.

| Variable | What it's for |
|---|---|
| `NEXT_PUBLIC_SUPABASE_URL` | Same value as the CRM |
| `SUPABASE_SERVICE_ROLE_KEY` | Same value as the CRM. Server-side only, never exposed |
| `LEAD_COMPANY_ID` | M-CON's `companies.id`, so enquiries land under the right company |
| `RESEND_API_KEY` | Same value as the CRM |
| `LEAD_NOTIFY_EMAIL` | Where enquiry notifications go |
| `LEAD_FROM_EMAIL` | Sending address, e.g. `website@mconenterprisesinc.ca` |

Find `LEAD_COMPANY_ID` with:

```sql
select id, name from companies order by created_at;
```

## Photos

Photos are spread through the service pages rather than collected in a gallery. Each
page names the files it expects — drop them into `public/images/` with these names and
they appear. **Images only render when the file exists**, so the site deploys fine
without them and you can add them as you go.

| File | Page |
|---|---|
| `renovations-1.jpg`, `renovations-2.jpg` | Renovations |
| `framing-1.jpg`, `framing-2.jpg` | Framing and carpentry |
| `new-build-1.jpg`, `new-build-2.jpg` | New builds |
| `deck-1.jpg`, `siding-1.jpg` | Decks, siding and exterior |
| `icf-1.jpg`, `concrete-1.jpg` | Concrete and ICF |
| `roofing-1.jpg` | Roofing |
| `restoration-1.jpg` | Insurance and restoration |
| `commercial-1.jpg` | Commercial |
| `rollout-1.jpg` | Rollout projects |
| `home-1.jpg`, `home-2.jpg`, `home-3.jpg` | Home page — your three best |

## Logo

Put the logo at `public/logo.png`. It appears in the header and the footer at 44px tall,
so a transparent PNG around 400px wide is plenty. Without it, both fall back to the
company name set in type — which looks deliberate rather than broken, so there's no
rush.

The CRM already has a copy at `public/logo.png` in the mcon-crm repo if you want the
same file.

Resize to about 1600px wide before adding them. Phone photos are 4000px and will make
the pages slow on a hotspot for no visible gain.

Alt text is set per image in each page file — worth editing to describe the actual photo
once you've chosen it.

## Content

All copy lives in the page files. Rates, services, phone and email are in
`lib/services.js`, so changing a rate is one edit in one place.

## Redirects

`next.config.mjs` maps every old LinkNow URL to its new page, including a wildcard for
the 95 `/areas-of-service/*` location pages. Don't remove these — they're what stops the
old site's search ranking being thrown away.
