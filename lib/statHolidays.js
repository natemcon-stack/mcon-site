// Canadian provinces, their statutory holidays, and how to calculate each year's dates.
//
// Holidays are computed rather than stored as a fixed list, so a company doesn't need a
// new import every January. Rules are expressed the way the legislation does — "third
// Monday in February", "Monday on or before 24 May" — which is also how they stay right
// when a date shifts.
//
// Federally regulated employers observe a different set again; this is the provincial
// list, which is what a construction company works to.

export const PROVINCES = [
  { code: "AB", name: "Alberta" },
  { code: "BC", name: "British Columbia" },
  { code: "MB", name: "Manitoba" },
  { code: "NB", name: "New Brunswick" },
  { code: "NL", name: "Newfoundland and Labrador" },
  { code: "NS", name: "Nova Scotia" },
  { code: "NT", name: "Northwest Territories" },
  { code: "NU", name: "Nunavut" },
  { code: "ON", name: "Ontario" },
  { code: "PE", name: "Prince Edward Island" },
  { code: "QC", name: "Quebec" },
  { code: "SK", name: "Saskatchewan" },
  { code: "YT", name: "Yukon" },
];

// --- date helpers ----------------------------------------------------------

// Built in UTC throughout. A local-time Date near midnight can land on the previous
// day depending on the timezone, which is exactly the kind of bug that shows up once a
// year and is never reproducible.
function d(year, month, day) {
  return new Date(Date.UTC(year, month - 1, day));
}

// The nth given weekday of a month. weekday: 0 = Sunday.
function nthWeekday(year, month, weekday, n) {
  const first = d(year, month, 1);
  const offset = (weekday - first.getUTCDay() + 7) % 7;
  return d(year, month, 1 + offset + (n - 1) * 7);
}

function lastWeekday(year, month, weekday) {
  const last = new Date(Date.UTC(year, month, 0));
  const offset = (last.getUTCDay() - weekday + 7) % 7;
  return d(year, month, last.getUTCDate() - offset);
}

// The given weekday on or before a date — how Victoria Day is actually defined.
function weekdayOnOrBefore(year, month, day, weekday) {
  const target = d(year, month, day);
  const offset = (target.getUTCDay() - weekday + 7) % 7;
  return d(year, month, day - offset);
}

// Easter, by the anonymous Gregorian algorithm. Good Friday is two days earlier.
function easter(year) {
  const a = year % 19;
  const b = Math.floor(year / 100);
  const c = year % 100;
  const e = Math.floor(b / 4);
  const f = b % 4;
  const g = Math.floor((b + 8) / 25);
  const h = Math.floor((b - g + 1) / 3);
  const i = (19 * a + b - e - h + 15) % 30;
  const k = Math.floor(c / 4);
  const l = c % 4;
  const m = (32 + 2 * f + 2 * k - i - l) % 7;
  const n = Math.floor((a + 11 * i + 22 * m) / 451);
  const month = Math.floor((i + m - 7 * n + 114) / 31);
  const day = ((i + m - 7 * n + 114) % 31) + 1;
  return d(year, month, day);
}

function goodFriday(year) {
  const e = easter(year);
  return new Date(e.getTime() - 2 * 86400000);
}

const iso = (date) => date.toISOString().slice(0, 10);

// --- the holidays themselves ----------------------------------------------

// Each entry: which provinces observe it, and how to find its date in a given year.
const HOLIDAYS = [
  { name: "New Year's Day", all: true, on: (y) => d(y, 1, 1) },
  { name: "Family Day", provinces: ["AB", "BC", "ON", "SK", "NB"], on: (y) => nthWeekday(y, 2, 1, 3) },
  // BC moved Family Day from the second to the third Monday in 2019.
  { name: "Louis Riel Day", provinces: ["MB"], on: (y) => nthWeekday(y, 2, 1, 3) },
  { name: "Islander Day", provinces: ["PE"], on: (y) => nthWeekday(y, 2, 1, 3) },
  { name: "Heritage Day", provinces: ["NS"], on: (y) => nthWeekday(y, 2, 1, 3) },
  { name: "St. Patrick's Day", provinces: ["NL"], on: (y) => nthWeekday(y, 3, 1, 3) },
  { name: "Good Friday", all: true, on: goodFriday },
  { name: "Victoria Day", provinces: ["AB", "BC", "MB", "NT", "NU", "ON", "QC", "SK", "YT"], on: (y) => weekdayOnOrBefore(y, 5, 24, 1) },
  { name: "National Patriots' Day", provinces: ["QC"], on: (y) => weekdayOnOrBefore(y, 5, 24, 1) },
  { name: "National Indigenous Peoples Day", provinces: ["NT", "YT"], on: (y) => d(y, 6, 21) },
  { name: "Saint-Jean-Baptiste Day", provinces: ["QC"], on: (y) => d(y, 6, 24) },
  { name: "Memorial Day", provinces: ["NL"], on: (y) => d(y, 7, 1) },
  { name: "Canada Day", all: true, on: (y) => d(y, 7, 1) },
  { name: "Nunavut Day", provinces: ["NU"], on: (y) => d(y, 7, 9) },
  { name: "Civic Holiday", provinces: ["AB", "BC", "NB", "NT", "NU", "ON", "SK"], on: (y) => nthWeekday(y, 8, 1, 1) },
  { name: "Discovery Day", provinces: ["YT"], on: (y) => nthWeekday(y, 8, 1, 3) },
  { name: "Labour Day", all: true, on: (y) => nthWeekday(y, 9, 1, 1) },
  { name: "National Day for Truth and Reconciliation", provinces: ["BC", "MB", "NT", "NU", "PE", "YT"], on: (y) => d(y, 9, 30) },
  { name: "Thanksgiving", provinces: ["AB", "BC", "MB", "NT", "NU", "ON", "QC", "SK", "YT", "NB", "NL", "NS", "PE"], on: (y) => nthWeekday(y, 10, 1, 2) },
  { name: "Remembrance Day", provinces: ["AB", "BC", "NB", "NL", "NS", "NT", "NU", "PE", "SK", "YT"], on: (y) => d(y, 11, 11) },
  { name: "Christmas Day", all: true, on: (y) => d(y, 12, 25) },
  { name: "Boxing Day", provinces: ["ON", "NL"], on: (y) => d(y, 12, 26) },
];

// Every statutory holiday for a province in a given year, oldest first.
export function statHolidaysFor(province, year) {
  return HOLIDAYS
    .filter((h) => h.all || (h.provinces || []).includes(province))
    .map((h) => ({ date: iso(h.on(year)), name: h.name }))
    .sort((a, b) => (a.date < b.date ? -1 : 1));
}

export function provinceName(code) {
  return PROVINCES.find((p) => p.code === code)?.name || code;
}

// Kept deliberately vague on purpose — pay rules for a holiday falling on a weekend
// differ by province and by whether the employee normally works that day, and getting
// that wrong in software is worse than leaving it to a person.
export const HOLIDAY_CAVEAT =
  "Dates follow provincial legislation. Whether a holiday falling on a weekend is " +
  "observed on the following Monday depends on your province and the employee's " +
  "normal schedule — check anything that lands on a Saturday or Sunday.";
