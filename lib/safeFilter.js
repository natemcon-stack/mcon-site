// Guards for values that get interpolated into PostgREST filter strings.
//
// The app has no raw SQL — every query goes through the Supabase client, which sends
// values as PostgREST parameters, so classic SQL injection isn't reachable. But `.or()`
// takes a *filter expression* as a string, and anything interpolated into it is parsed
// as part of that expression rather than treated as a value. A comma, a dot or a closing
// paren in the wrong place doesn't reach the database as text — it changes which rows
// come back.
//
// That's a narrower problem than SQL injection (PostgREST can't be talked into dropping
// a table) but it's the same shape: data being read as syntax. These validate before
// interpolation rather than trying to escape after.

// Dates are the only thing this app ever puts in a filter string. Anything that isn't
// exactly YYYY-MM-DD is rejected outright rather than sanitised — there's no legitimate
// input that needs cleaning up, so a mismatch means something is wrong.
export function safeDate(value, fallback = null) {
  const str = String(value ?? "");
  if (!/^\d{4}-\d{2}-\d{2}$/.test(str)) return fallback;
  // Rejects 2026-02-31 and similar: well-formed but not a real date.
  const parsed = new Date(`${str}T00:00:00Z`);
  if (Number.isNaN(parsed.getTime())) return fallback;
  if (parsed.toISOString().slice(0, 10) !== str) return fallback;
  return str;
}

// PostgREST's like/ilike treat % and _ as wildcards. A value carrying either matches
// more than intended — which on a lookup like "has this payment already been recorded?"
// means a false positive, and a real payment silently skipped.
export function escapeLikeValue(value) {
  return String(value ?? "").replace(/[\\%_]/g, "\\$&");
}
