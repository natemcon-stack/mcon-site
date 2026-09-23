// USD -> CAD conversion for receipts, using the Bank of Canada's daily exchange rate.
//
// The Bank of Canada Valet API is free, needs no key, and is the rate the CRA points
// to for converting foreign-currency amounts, which makes it the defensible choice for
// something that ends up in a tax filing. Rates are published once per business day
// (late afternoon Eastern), so there is no observation for weekends, holidays, or the
// current day before publication — those fall back to the most recent prior business
// day, which is the conventional treatment.
//
// Anything that fails here returns a null rate rather than a guess. A wrong rate
// silently baked into an expense is worse than an unconverted one sitting in the queue
// waiting for a number to be typed in by hand.

const VALET_SERIES = "FXUSDCAD";

// Look back far enough to clear a long weekend plus a stat holiday.
const LOOKBACK_DAYS = 10;

function isoDate(d) {
  return new Date(d).toISOString().slice(0, 10);
}

// Returns { rate, rateDate, source } or { rate: null, ... } with a reason.
// rateDate is the business day the rate actually came from, which may be earlier than
// the date asked for — it's stored alongside the expense so the conversion can be
// reproduced later rather than taken on faith.
export async function getUsdCadRate(dateStr) {
  const target = isoDate(dateStr || new Date());
  const start = isoDate(new Date(new Date(target).getTime() - LOOKBACK_DAYS * 86400000));

  try {
    const url = `https://www.bankofcanada.ca/valet/observations/${VALET_SERIES}/json`
      + `?start_date=${start}&end_date=${target}`;
    const res = await fetch(url, { signal: AbortSignal.timeout(8000) });
    if (!res.ok) {
      return { rate: null, rateDate: null, source: null, error: `Bank of Canada returned ${res.status}` };
    }
    const data = await res.json();
    const observations = (data?.observations || [])
      .map((o) => ({ date: o.d, value: Number(o?.[VALET_SERIES]?.v) }))
      .filter((o) => o.date && Number.isFinite(o.value) && o.value > 0);

    if (!observations.length) {
      return { rate: null, rateDate: null, source: null, error: "No published rate in range" };
    }

    // Observations come back oldest first; the last one at or before the target date
    // is the rate in effect.
    const usable = observations.filter((o) => o.date <= target);
    const chosen = (usable.length ? usable : observations)[usable.length ? usable.length - 1 : 0];

    return {
      rate: chosen.value,
      rateDate: chosen.date,
      source: "Bank of Canada",
      error: null,
    };
  } catch (e) {
    return { rate: null, rateDate: null, source: null, error: "Couldn't reach the Bank of Canada rate service" };
  }
}

// Converts and rounds to cents. Kept separate from the lookup so the receipts UI can
// re-run the arithmetic when the user edits the USD amount without re-fetching a rate.
export function convertUsdToCad(usdAmount, rate) {
  if (usdAmount == null || rate == null) return null;
  return Math.round(Number(usdAmount) * Number(rate) * 100) / 100;
}
