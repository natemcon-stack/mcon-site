// Week planning helpers for daily_tasks.
//
// Dates are handled as local YYYY-MM-DD strings throughout, never as Date objects
// crossing a timezone boundary. `new Date("2026-07-29")` parses as UTC midnight, which
// in BC is the evening of the 28th — enough to put a task on the wrong day, so all
// arithmetic here is done on local components.

export function toISO(d) {
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}-${String(d.getDate()).padStart(2, "0")}`;
}

export function todayISO() {
  return toISO(new Date());
}

// Parses a YYYY-MM-DD as local midnight, avoiding the UTC-shift trap above.
export function fromISO(iso) {
  const [y, m, d] = iso.split("-").map(Number);
  return new Date(y, m - 1, d);
}

export function addDays(iso, n) {
  const d = fromISO(iso);
  d.setDate(d.getDate() + n);
  return toISO(d);
}

// Monday-start weeks: the crew works Mon-Fri, so a Sunday-start grid would push Friday
// to the far edge and split the working week across two views.
export function weekStart(iso) {
  const d = fromISO(iso);
  const dow = d.getDay(); // 0 = Sunday
  const offset = dow === 0 ? -6 : 1 - dow;
  d.setDate(d.getDate() + offset);
  return toISO(d);
}

export function weekDays(anchorIso) {
  const start = weekStart(anchorIso);
  return Array.from({ length: 7 }, (_, i) => addDays(start, i));
}

export function dayLabel(iso) {
  return fromISO(iso).toLocaleDateString(undefined, { weekday: "short", month: "short", day: "numeric" });
}

export function dayName(iso) {
  return fromISO(iso).toLocaleDateString(undefined, { weekday: "long" });
}

// Moves every unchecked task whose day has passed onto today.
//
// A task from Monday, unfinished, seen on Wednesday lands on Wednesday rather than
// hopping to Tuesday first — cascading one day at a time arrives at the same place, and
// doing it in a single statement means the result doesn't depend on how often the page
// was opened in between. Completed tasks stay put: their day is the record of when the
// work was actually done.
//
// Safe to call repeatedly. Once tasks are on today, the `lt` filter matches nothing.
export async function bumpOverdueTasks(client) {
  const today = todayISO();
  try {
    const { data: overdue } = await client
      .from("daily_tasks")
      .select("id, carried_over_count")
      .is("done_at", null)
      .lt("date", today);

    if (!overdue || !overdue.length) return 0;

    // Updated one at a time because carried_over_count increments from its own current
    // value; PostgREST can't express a column-relative update in a bulk patch.
    await Promise.all(overdue.map((t) => client
      .from("daily_tasks")
      .update({ date: today, carried_over_count: (t.carried_over_count || 0) + 1 })
      .eq("id", t.id)));

    return overdue.length;
  } catch (e) {
    // Bumping is a convenience, not a correctness requirement — a failure here should
    // never stop the week from rendering.
    return 0;
  }
}
