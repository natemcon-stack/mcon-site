// Rate limiting for endpoints reachable with nothing but a document link.
//
// Those endpoints take a UUID token, so guessing one isn't realistic. The exposure is
// the opposite direction: someone who legitimately has a link, or who scraped one from
// a forwarded email, can hammer these as often as they like. Referral text, activity
// events and signature attempts all write rows, so an unthrottled caller can fill the
// database at no cost to themselves.
//
// This is deliberately a simple in-memory counter rather than a shared store. On
// serverless each instance keeps its own tally, so the real ceiling is the limit times
// however many instances are warm — enough to stop a script hitting an endpoint
// thousands of times a minute, not a substitute for a real WAF. It costs nothing and
// needs no extra infrastructure, which is the right trade at this size.

const buckets = new Map();

// Keeps the map from growing without bound on a long-lived instance.
function sweep(now) {
  if (buckets.size < 500) return;
  for (const [key, entry] of buckets) {
    if (entry.resetAt < now) buckets.delete(key);
  }
}

// Identifies the caller as well as is possible behind a proxy. Spoofable, which is
// why this is a speed bump rather than a security control.
export function callerKey(request) {
  const forwarded = request.headers.get("x-forwarded-for") || "";
  return forwarded.split(",")[0].trim() || request.headers.get("x-real-ip") || "unknown";
}

// Returns null when the request may proceed, or a Response to return immediately.
export function rateLimit(request, { name, limit = 20, windowMs = 60000 }) {
  const now = Date.now();
  sweep(now);

  const key = `${name}:${callerKey(request)}`;
  const entry = buckets.get(key);

  if (!entry || entry.resetAt < now) {
    buckets.set(key, { count: 1, resetAt: now + windowMs });
    return null;
  }

  entry.count += 1;
  if (entry.count > limit) {
    return new Response("Too many requests — slow down and try again shortly.", {
      status: 429,
      headers: { "Retry-After": String(Math.ceil((entry.resetAt - now) / 1000)) },
    });
  }
  return null;
}
