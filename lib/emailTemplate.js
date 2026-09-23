// Shared HTML email builder — used for both the manual "Email client" send and the
// automatic overdue reminder, so every client email looks consistent and professional
// rather than a bare paragraph + link.
//
// Deliberately contains NO pricing: no line items, no subtotal, no tax breakdown, no
// total. Email is forwarded, quoted, and left open on screens, and a breakdown sitting
// in an inbox is a breakdown outside anyone's control. The figures live behind the link,
// where the document can be revised, where opening it is recorded, and where the client
// can pay. The email's only job is to get them to that link.

// Every value here can originate from something a person typed (a client/job name, a
// line item description, a custom message) — escape before dropping it into raw HTML
// so none of it can break out into actual markup or a script tag.
function escapeHtml(str) {
  return String(str ?? "")
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;")
    .replace(/'/g, "&#39;");
}

// Callers still pass pricing (lineItems, subtotal, taxes, total, depositAmount) because
// the same data builds the PDF and the pay page. It is accepted and ignored here on
// purpose, so a future caller can't accidentally reintroduce a breakdown into the email
// by passing one.
export function buildDocumentEmailHtml({
  logoUrl,
  companyName,
  companyPhone,
  companyEmail,
  companyAddress,
  label, // "Estimate" | "Invoice"
  docNumber,
  clientName,
  introMessage,
  ctaLabel,
  ctaUrl,
  serviceDate,
}) {
  const safeIntro = escapeHtml(introMessage).replace(/\n/g, "<br/>");

  return `
  <div style="font-family: Arial, sans-serif; max-width: 560px; margin: 0 auto; background: #ffffff;">
    <div style="background:#F4F5F7; border-bottom:3px solid #E85D2A; padding:20px 24px;">
      <table><tr>
        <td><img src="${logoUrl}" alt="${companyName}" height="40" style="display:block;" /></td>
        <td style="padding-left:12px; color:#1B2430; font-size:16px; font-weight:bold;">${companyName}</td>
      </tr></table>
    </div>

    <div style="padding: 24px;">
      <p style="color:#1B2430; font-size:14px;">Hi ${escapeHtml(clientName)},</p>
      <p style="color:#1B2430; font-size:14px;">${safeIntro}</p>

      <div style="text-align:center; margin: 24px 0;">
        <a href="${ctaUrl}" style="background:#E85D2A; color:#ffffff; text-decoration:none; padding:14px 32px; border-radius:6px; font-weight:bold; font-size:15px; display:inline-block;">
          ${ctaLabel}
        </a>
      </div>

      <div style="border:1px solid #DADDE1; border-radius:8px; padding:16px; margin-bottom:16px;">
        <table style="width:100%; border-collapse:collapse; font-size:14px;">
          ${docNumber ? `<tr><td style="padding:4px 0; color:#6b7280;">${label}</td><td style="padding:4px 0; text-align:right; color:#1B2430;">#${escapeHtml(docNumber)}</td></tr>` : ""}
          ${serviceDate ? `<tr><td style="padding:4px 0; color:#6b7280;">Date</td><td style="padding:4px 0; text-align:right; color:#1B2430;">${escapeHtml(serviceDate)}</td></tr>` : ""}
        </table>
        <p style="font-size:13px; color:#6b7280; margin:12px 0 0 0;">
          The full breakdown${label === "Invoice" ? ", the amount due and payment options are" : " is"}
          on the ${label.toLowerCase()} itself — use the button above to open it.
        </p>
      </div>

      <p style="font-size:12px; color:#6b7280; border-top:1px solid #DADDE1; padding-top:16px;">
        <strong>${companyName}</strong><br/>
        ${companyPhone ? `P: <a href="tel:${escapeHtml(companyPhone)}" style="color:#2B5C77;">${escapeHtml(companyPhone)}</a><br/>` : ""}
        ${companyEmail ? `<a href="mailto:${companyEmail}" style="color:#2B5C77;">${companyEmail}</a><br/>` : ""}
        ${escapeHtml(companyAddress)}
      </p>
    </div>
  </div>`;
}
