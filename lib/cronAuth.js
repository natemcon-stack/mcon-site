import crypto from "crypto";

// Verifies that a request came from Vercel Cron.
//
// Two problems with comparing `authHeader !== \`Bearer ${process.env.CRON_SECRET}\``
// directly: if CRON_SECRET is unset the expected value becomes the literal string
// "Bearer undefined", which anyone can send — so a misconfigured deployment silently
// exposes every scheduled job to the internet. And a plain string comparison exits at
// the first differing byte, which leaks the secret's length and prefix to anyone
// willing to measure. This fails closed and compares in constant time.
export function isCronRequest(request) {
  const expected = process.env.CRON_SECRET;
  if (!expected) return false;

  const header = request.headers.get("authorization") || "";
  const provided = header.startsWith("Bearer ") ? header.slice(7) : "";
  if (!provided) return false;

  const a = Buffer.from(provided);
  const b = Buffer.from(expected);
  if (a.length !== b.length) return false;
  return crypto.timingSafeEqual(a, b);
}
