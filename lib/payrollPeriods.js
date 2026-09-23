// Pay period calculation, driven by each company's own schedule.
//
// This was hardcoded to one company's cycle: periods running 26th–10th and 11th–25th,
// reminders on the 11th and 26th. Every schedule below produces the same shape — the
// period that just closed, and the day it's due to be paid — so the payroll route
// doesn't need to know which one a company uses.

const iso = (d) => d.toISOString().slice(0, 10);
const addDays = (d, n) => new Date(d.getTime() + n * 86400000);

// Returns { start, end, payDate } for the period ending on or just before `today`, or
// null when today isn't a run day for this schedule.
export function periodEndingOn(today, settings) {
  const schedule = settings?.payroll_schedule || "semi_monthly";
  const d = new Date(`${iso(today)}T00:00:00Z`);

  if (schedule === "semi_monthly") {
    // Two configurable run days. The period runs from the day after the previous run
    // day up to the day before this one, which is what "the fortnight just gone" means
    // when the boundaries are calendar dates rather than weeks.
    const day1 = Number(settings?.payroll_day_1 ?? 11);
    const day2 = Number(settings?.payroll_day_2 ?? 26);
    const day = d.getUTCDate();
    if (day !== day1 && day !== day2) return null;

    const [first, second] = day1 <= day2 ? [day1, day2] : [day2, day1];
    if (day === second) {
      return {
        start: iso(new Date(Date.UTC(d.getUTCFullYear(), d.getUTCMonth(), first))),
        end: iso(addDays(d, -1)),
        payDate: iso(addDays(d, 6)),
      };
    }
    // The first run day of the month closes a period that began in the previous month.
    const prev = new Date(Date.UTC(d.getUTCFullYear(), d.getUTCMonth() - 1, second));
    return { start: iso(prev), end: iso(addDays(d, -1)), payDate: iso(addDays(d, 6)) };
  }

  if (schedule === "monthly") {
    // Runs on the 1st, covering the whole month just ended.
    if (d.getUTCDate() !== 1) return null;
    const start = new Date(Date.UTC(d.getUTCFullYear(), d.getUTCMonth() - 1, 1));
    return { start: iso(start), end: iso(addDays(d, -1)), payDate: iso(addDays(d, 4)) };
  }

  const weekday = Number(settings?.payroll_weekday ?? 5);
  if (d.getUTCDay() !== weekday) return null;

  if (schedule === "weekly") {
    return { start: iso(addDays(d, -7)), end: iso(addDays(d, -1)), payDate: iso(addDays(d, 4)) };
  }

  if (schedule === "biweekly") {
    // Which fortnight we're in is counted from a known good period start. Without an
    // anchor, "every second Friday" doesn't say which Friday.
    const anchor = settings?.payroll_anchor_date
      ? new Date(`${settings.payroll_anchor_date}T00:00:00Z`)
      : null;
    if (!anchor) return null;
    const weeks = Math.round((d - anchor) / (7 * 86400000));
    if (weeks % 2 !== 0) return null;
    return { start: iso(addDays(d, -14)), end: iso(addDays(d, -1)), payDate: iso(addDays(d, 4)) };
  }

  return null;
}

export const SCHEDULE_LABELS = {
  weekly: "Weekly",
  biweekly: "Every two weeks",
  semi_monthly: "Twice a month",
  monthly: "Monthly",
};

export const WEEKDAYS = [
  { value: 0, label: "Sunday" }, { value: 1, label: "Monday" }, { value: 2, label: "Tuesday" },
  { value: 3, label: "Wednesday" }, { value: 4, label: "Thursday" }, { value: 5, label: "Friday" },
  { value: 6, label: "Saturday" },
];
