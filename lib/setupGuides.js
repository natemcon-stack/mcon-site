// Setup guides for the outside accounts a company needs to connect.
//
// Written as one source used by both the in-app panel and the emailed copy. Two
// audiences, same words — a guide that differs between the screen and the inbox is how
// people end up half-configured.
//
// Deliberately plain: these are read by contractors mid-job, not by developers. No
// jargon that isn't explained, and every step says what it's for as well as what to do.

export const GUIDES = {
  paypal: {
    key: "paypal",
    title: "Taking card payments with PayPal",
    summary:
      "Lets clients pay an invoice online by card. Payments go straight into your own " +
      "PayPal account — the app never holds your money.",
    time: "About 15 minutes",
    needed: "A PayPal Business account. Free to open; PayPal charges a fee per payment.",
    steps: [
      {
        title: "Open a PayPal Business account",
        detail:
          "Go to paypal.com and choose Business, not Personal. A personal account can't " +
          "issue the credentials this needs. If you already take PayPal for the business, " +
          "use that account.",
      },
      {
        title: "Go to the developer dashboard",
        detail:
          "Visit developer.paypal.com and sign in with the same account. This is PayPal's " +
          "separate site for connecting other software — it looks different from the main " +
          "PayPal site, which throws people.",
      },
      {
        title: "Create an app",
        detail:
          "Apps & Credentials → make sure the toggle at the top says Live, not Sandbox → " +
          "Create App. Name it whatever you like; the name is only for your own reference.",
      },
      {
        title: "Copy the two values",
        detail:
          "The app page shows a Client ID and a Secret. The Secret is hidden until you " +
          "click Show. Copy both. The Secret is shown to you but is not recoverable later " +
          "in plain form — if you lose it, generate a new one rather than hunting for it.",
      },
      {
        title: "Paste them into the app",
        detail:
          "Admin → Company → Online payments. Set the mode to Live, paste both values and " +
          "save. The app checks them with PayPal before saving, so a wrong value is caught " +
          "now rather than when a client tries to pay.",
      },
      {
        title: "Send yourself a test invoice",
        detail:
          "Create a small invoice to your own email, open the client link and check the " +
          "PayPal button appears. Worth doing before a real client sees it.",
      },
    ],
    notes: [
      "Sandbox mode is for testing with fake money. Use Live for real invoices — the " +
      "credentials are different for each, and mixing them is the usual mistake.",
      "Your Secret is stored encrypted and can't be read back out of the app, only replaced.",
    ],
  },

  resend: {
    key: "resend",
    title: "Sending email from your own domain",
    summary:
      "Sends invoices and estimates from your own address instead of a generic one, so " +
      "they look like they came from you and are less likely to land in spam.",
    time: "About 30 minutes, plus waiting for DNS",
    needed: "Your own domain name, and access to wherever its DNS is managed.",
    steps: [
      {
        title: "Create a Resend account",
        detail:
          "Go to resend.com and sign up. The free tier is enough for normal invoicing " +
          "volumes.",
      },
      {
        title: "Add your domain",
        detail:
          "Domains → Add Domain → enter your domain (for example yourcompany.ca). Resend " +
          "then shows a list of DNS records.",
      },
      {
        title: "Add those records where your DNS lives",
        detail:
          "That's usually your domain registrar — GoDaddy, Namecheap, Cloudflare and so " +
          "on. Copy each record exactly. The long DKIM value is one unbroken line; a line " +
          "break pasted into it is the most common reason verification fails.",
      },
      {
        title: "Wait, then verify",
        detail:
          "DNS changes take anywhere from minutes to a couple of hours. Click Verify in " +
          "Resend until the domain shows as verified. If it fails the first time, wait " +
          "rather than re-entering the records.",
      },
      {
        title: "Create an API key",
        detail:
          "API Keys → Create. Give it Sending access. Copy it immediately — Resend shows " +
          "it once and never again.",
      },
      {
        title: "Send it to us",
        detail:
          "Reply to this email with the API key and the address you want invoices to come " +
          "from, and we'll connect it.",
      },
    ],
    notes: [
      "Until this is set up, your invoices still send — just from a shared address rather " +
      "than your own domain.",
      "A sending address doesn't automatically receive mail. If you want replies to reach " +
      "you, see the email forwarding guide.",
    ],
  },

  forwarding: {
    key: "forwarding",
    title: "Receiving email at your domain",
    summary:
      "Makes an address like office@yourcompany.ca actually reach your inbox. Sending " +
      "from an address and receiving at it are two different things.",
    time: "About 15 minutes",
    needed: "Your own domain, and access to its DNS.",
    steps: [
      {
        title: "Understand what this fixes",
        detail:
          "If invoices go out from office@yourcompany.ca but nothing receives mail at that " +
          "address, every client reply bounces. Worse, repeated bounces can get the address " +
          "blocked, which then silently stops your invoices being delivered at all.",
      },
      {
        title: "Create a free forwarding account",
        detail:
          "improvmx.com is free and does one job well. Sign up and enter your domain.",
      },
      {
        title: "Create your aliases",
        detail:
          "Add each address you want to receive at — office@, your own name@, whatever you " +
          "use — and point them at the inbox you actually read, such as your Gmail.",
      },
      {
        title: "Add the two MX records",
        detail:
          "ImprovMX shows two MX records. Add them where your DNS is managed, with " +
          "priorities 10 and 20. Do this after creating the aliases, not before — mail " +
          "arriving with no alias set up will bounce.",
      },
      {
        title: "Test it",
        detail:
          "From your phone, email the new address and check it arrives. That's the whole " +
          "test.",
      },
    ],
    notes: [
      "Don't add the SPF record ImprovMX suggests if you've already set one up for Resend. " +
      "A domain can only have one SPF record and a second one breaks sending.",
      "Forwarding brings mail in. Replies you send still go out from your normal inbox " +
      "unless you also set up 'Send mail as' in Gmail.",
    ],
  },
};

export function getGuide(key) {
  return GUIDES[key] || null;
}

// Plain-text rendering for the emailed copy, so it stays readable in any mail client.
export function guideAsText(guide, appUrl) {
  const lines = [
    guide.title.toUpperCase(),
    "",
    guide.summary,
    "",
    `Time needed: ${guide.time}`,
    `What you'll need: ${guide.needed}`,
    "",
    "STEPS",
    "",
  ];
  guide.steps.forEach((s, i) => {
    lines.push(`${i + 1}. ${s.title}`);
    lines.push(`   ${s.detail}`);
    lines.push("");
  });
  if (guide.notes?.length) {
    lines.push("WORTH KNOWING");
    lines.push("");
    guide.notes.forEach((n) => {
      lines.push(`- ${n}`);
      lines.push("");
    });
  }
  if (appUrl) {
    lines.push(`Settings are under Admin > Company: ${appUrl}/admin/company`);
  }
  return lines.join("\n");
}

export function guideAsHtml(guide, appUrl) {
  const esc = (t) => String(t || "")
    .replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;");

  return `
  <div style="font-family:system-ui,-apple-system,sans-serif;max-width:600px;color:#1B2430;line-height:1.5;">
    <h1 style="font-size:20px;margin:0 0 8px 0;">${esc(guide.title)}</h1>
    <p style="margin:0 0 16px 0;color:#4b5563;">${esc(guide.summary)}</p>
    <table style="border-collapse:collapse;font-size:14px;margin-bottom:20px;color:#6b7280;">
      <tr><td style="padding:2px 12px 2px 0;">Time needed</td><td style="color:#1B2430;">${esc(guide.time)}</td></tr>
      <tr><td style="padding:2px 12px 2px 0;">You'll need</td><td style="color:#1B2430;">${esc(guide.needed)}</td></tr>
    </table>
    <ol style="padding-left:20px;margin:0 0 20px 0;">
      ${guide.steps.map((s) => `
        <li style="margin-bottom:14px;">
          <strong>${esc(s.title)}</strong><br/>
          <span style="color:#4b5563;">${esc(s.detail)}</span>
        </li>`).join("")}
    </ol>
    ${guide.notes?.length ? `
      <div style="background:#F4F5F7;border-radius:6px;padding:14px;margin-bottom:20px;">
        <div style="font-size:12px;text-transform:uppercase;letter-spacing:0.05em;color:#6b7280;margin-bottom:8px;">Worth knowing</div>
        ${guide.notes.map((n) => `<p style="margin:0 0 8px 0;font-size:14px;color:#4b5563;">${esc(n)}</p>`).join("")}
      </div>` : ""}
    ${appUrl ? `<a href="${appUrl}/admin/company" style="display:inline-block;background:#E85D2A;color:#fff;text-decoration:none;padding:10px 18px;border-radius:6px;font-weight:bold;">Open your settings</a>` : ""}
  </div>`;
}
