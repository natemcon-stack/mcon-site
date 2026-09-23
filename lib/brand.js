// Instance-level branding and locale defaults.
//
// Everything a *different* company would have to change to run their own copy of
// this app lives here, read from NEXT_PUBLIC_* environment variables. They are
// deliberately public-prefixed (none of them are secrets) so the same values work
// in server routes, client components, and pre-auth surfaces like the login page
// and PWA manifest, where an authenticated read of company_settings isn't possible.
//
// Precedence throughout the app is: company_settings row -> these env vars ->
// the generic fallbacks below. That means an instance runs correctly with nothing
// configured, and an admin can override any of it in Admin > Company without a
// code change or redeploy.

export const brand = {
  // Legal name used on invoices, estimates, PDFs, and email signatures.
  companyName: process.env.NEXT_PUBLIC_COMPANY_NAME || "Your Company Inc.",

  // Short trading name for the app shell — the plain half of the nav/login wordmark.
  // Defaults to the full legal name, which is fine but long; set it explicitly to
  // a short trading name to keep the header tight.
  shortName: process.env.NEXT_PUBLIC_COMPANY_SHORT_NAME
    || process.env.NEXT_PUBLIC_COMPANY_NAME
    || "Your Company",

  // Product name for the crew-facing app shell (nav, login, PWA, notifications) —
  // the accented half of the wordmark.
  appName: process.env.NEXT_PUBLIC_APP_NAME || "Job Board",

  // One-line description for PWA metadata and install prompts.
  appDescription: process.env.NEXT_PUBLIC_APP_DESCRIPTION
    || "Job, contact, and crew management",

  // Gmail label the receipt scanner files processed messages under. Kept configurable
  // because renaming it orphans every message already labelled under the old name.
  gmailReceiptLabel: process.env.NEXT_PUBLIC_GMAIL_RECEIPT_LABEL || "Receipts/Processed",

  // Sending domain, used for calendar feed UIDs and as a base for default addresses.
  domain: process.env.NEXT_PUBLIC_COMPANY_DOMAIN || "example.com",

  // Verified Resend sender. Must be on a domain verified in Resend or sends will fail.
  fromEmail: process.env.NEXT_PUBLIC_FROM_EMAIL
    || `office@${process.env.NEXT_PUBLIC_COMPANY_DOMAIN || "example.com"}`,

  // Where client replies land. Overridden by company_settings.reply_to_email.
  replyToEmail: process.env.NEXT_PUBLIC_REPLY_TO_EMAIL
    || `office@${process.env.NEXT_PUBLIC_COMPANY_DOMAIN || "example.com"}`,

  // Bookkeeper/accountant recipient for the payroll hours report.
  accountantEmail: process.env.NEXT_PUBLIC_ACCOUNTANT_EMAIL || "",

  // Contact address required by the web-push spec as the VAPID subject.
  pushContactEmail: process.env.NEXT_PUBLIC_PUSH_CONTACT_EMAIL
    || `admin@${process.env.NEXT_PUBLIC_COMPANY_DOMAIN || "example.com"}`,

  // Logo shown in the nav, on client-facing documents, and in emails.
  logoUrl: process.env.NEXT_PUBLIC_LOGO_URL || "/logo.png",

  // Lowercase, filesystem-safe tag for export filenames and the Gmail receipt label.
  slug: process.env.NEXT_PUBLIC_COMPANY_SLUG || "company",

  // Locale defaults: prefill new job/contact addresses and centre the map before
  // a job has coordinates of its own.
  defaultCity: process.env.NEXT_PUBLIC_DEFAULT_CITY || "",
  defaultProvince: process.env.NEXT_PUBLIC_DEFAULT_PROVINCE || "BC",
  defaultCountry: process.env.NEXT_PUBLIC_DEFAULT_COUNTRY || "Canada",
  defaultLat: Number(process.env.NEXT_PUBLIC_DEFAULT_LAT || 53.7267),
  defaultLng: Number(process.env.NEXT_PUBLIC_DEFAULT_LNG || -127.6476),
};

// Merges a company_settings row over the env-var defaults and exposes the derived
// values (a From header, a display name) that callers would otherwise rebuild.
// Pure and client-safe — usable after either a server or a browser read of the row.
export function withBrandDefaults(settings) {
  const s = settings || {};
  const companyName = s.company_name || brand.companyName;
  const fromEmail = s.from_email || brand.fromEmail;
  return {
    ...s,
    companyName,
    appName: s.app_name || brand.appName,
    fromEmail,
    fromHeader: `${companyName} <${fromEmail}>`,
    replyTo: s.reply_to_email || brand.replyToEmail,
    accountantEmail: s.accountant_email || brand.accountantEmail,
    pushContactEmail: s.push_contact_email || brand.pushContactEmail,
    logoUrl: s.logo_url || brand.logoUrl,
    slug: s.company_slug || brand.slug,
  };
}
