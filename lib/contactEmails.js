// Every address a contact should be emailed at.
//
// The primary address stays in contacts.email; anything extra lives in
// additional_emails. Kept in one function so a new send path can't quietly go
// back to emailing only the first person — which is how a review request came
// to fail for a client who needed two addresses.
export function contactEmails(contact) {
  if (!contact) return [];
  const all = [contact.email, ...(contact.additional_emails || [])];
  const seen = new Set();
  return all
    .map((e) => (e || "").trim())
    .filter((e) => {
      if (!e) return false;
      const key = e.toLowerCase();
      if (seen.has(key)) return false;   // same address typed twice
      seen.add(key);
      return true;
    });
}

// For display: "jo@example.com and 1 other"
export function describeRecipients(contact) {
  const list = contactEmails(contact);
  if (list.length === 0) return "no email on file";
  if (list.length === 1) return list[0];
  return `${list[0]} and ${list.length - 1} other${list.length > 2 ? "s" : ""}`;
}
