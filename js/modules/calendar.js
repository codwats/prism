/**
 * Release calendar model (#529). Pure: dates in, plain objects out, no DOM.
 *
 * Dates are ISO `YYYY-MM-DD` strings throughout, compared as strings and
 * stepped in UTC, so no time zone or DST shift can move a day.
 *
 * A Spotlight (CONTEXT.md) is never stored: it runs from one Premier set's
 * release (inclusive) to the next one's (exclusive).
 */

const DAY_MS = 864e5;
const toDate = iso => new Date(`${iso}T00:00:00Z`);
const toIso = d => d.toISOString().slice(0, 10);

export function addDays(iso, n) {
  const d = toDate(iso);
  d.setUTCDate(d.getUTCDate() + n);
  return toIso(d);
}

export const daysBetween = (a, b) => Math.round((toDate(b) - toDate(a)) / DAY_MS);

/**
 * @param {Array<{premier: boolean, released: string}>} sets
 * @returns {Array<{set, start, end: string|null, weeks: number|null, next: object|null}>}
 *   in release order. The last Spotlight is open: `end` and `weeks` are null.
 */
export function getSpotlights(sets) {
  const premier = sets.filter(s => s.premier).sort((a, b) => a.released.localeCompare(b.released));
  return premier.map((set, i) => {
    const next = premier[i + 1] || null;
    const end = next ? next.released : null;
    return { set, start: set.released, end, weeks: end ? Math.round(daysBetween(set.released, end) / 7) : null, next };
  });
}

/** The Sunday that starts the week holding `iso`. */
export const weekOf = iso => addDays(iso, -toDate(iso).getUTCDay());

export const spotlightOn = (spotlights, iso) =>
  spotlights.find(s => iso >= s.start && (!s.end || iso < s.end)) || null;

// Weeks shown past the last date in the data, so an open Spotlight still has rows.
const PAD_WEEKS = 4;

/**
 * The whole calendar: continuous Sunday-start weeks from the start of the
 * year before `today` to a few weeks past the last date in the data.
 *
 * @param {{sets: object[], events: object[]}} data
 * @param {string} today ISO date in the viewer's zone
 * @returns {{spotlights, weeks: Array<{start, days: Array<{date, spotlight, begins}>}>, first: string, last: string}}
 */
export function buildCalendar(data, today) {
  const spotlights = getSpotlights(data.sets);
  const dataEnd = [...data.sets.map(s => s.released), ...data.events.map(e => e.end || e.start)]
    .reduce((m, d) => (d > m ? d : m), today);
  const first = weekOf(`${Number(today.slice(0, 4)) - 1}-01-01`);
  const last = addDays(weekOf(addDays(dataEnd, PAD_WEEKS * 7)), 6);

  const weeks = [];
  for (let start = first; start <= last; start = addDays(start, 7)) {
    const days = Array.from({ length: 7 }, (_, i) => {
      const date = addDays(start, i);
      const spotlight = spotlightOn(spotlights, date);
      return { date, spotlight, begins: spotlight?.start === date };
    });
    weeks.push({ start, days, chapter: majoritySpotlight(days) });
  }

  // Ribbon rows: each run of weeks sharing a chapter
  const chapters = [];
  weeks.forEach((w, i) => {
    if (!w.chapter) return;
    const prev = chapters.at(-1);
    if (prev?.spotlight === w.chapter && prev.lastWeek === i - 1) prev.lastWeek = i;
    else chapters.push({ spotlight: w.chapter, firstWeek: i, lastWeek: i });
  });
  return { spotlights, weeks, chapters, first, last };
}

const clamp = (n, lo, hi) => Math.min(hi, Math.max(lo, n));
const weekIndex = (cal, iso) => clamp(Math.floor(daysBetween(cal.first, iso) / 7), 0, cal.weeks.length - 1);

/** Index of the week the scroll box opens on: the week before today's. */
export const openingWeek = (cal, today) => weekIndex(cal, addDays(today, -7));

/** `YYYY-MM` a week reads as in the toolbar: the month its Saturday falls in. */
export const monthOfWeek = (cal, i) => addDays(cal.weeks[i].start, 6).slice(0, 7);

/** Index of the week holding the 1st of `ym`. */
export const weekOfMonth = (cal, ym) => weekIndex(cal, `${ym}-01`);

/** `ym` moved by `n` months, kept between the first and last months shown. */
export function stepMonth(cal, ym, n) {
  const d = toDate(`${ym}-01`);
  d.setUTCMonth(d.getUTCMonth() + n);
  const target = toIso(d).slice(0, 7);
  const lo = monthOfWeek(cal, 0), hi = cal.last.slice(0, 7);
  return target < lo ? lo : target > hi ? hi : target;
}

/** Format an ISO date in UTC so the day never shifts; `opts` as for toLocaleDateString. */
export const formatDate = (iso, opts = { month: 'short', day: 'numeric' }) =>
  toDate(iso).toLocaleDateString('en-US', { timeZone: 'UTC', ...opts });

/** A Spotlight's dates and length, stated as a fact: "Nov 13 – Feb 5, 12 weeks". */
export const spotlightSpan = s => s.end
  ? `${formatDate(s.start)} – ${formatDate(s.end)}, ${s.weeks} weeks`
  : `From ${formatDate(s.start)}, next Premier set not announced`;

// How long the strip draws an open Spotlight, which has no end date yet
const OPEN_STRIP_DAYS = 56;

/**
 * The Spotlight on `today`, its week number, and the proportional strip:
 * up to `before` Spotlights before it and `after` after it, each segment's
 * `left`/`width` and Today's position as percentages of the strip.
 * Null before the first Premier set.
 */
export function spotlightHero(spotlights, today, { before = 2, after = 1 } = {}) {
  const current = spotlightOn(spotlights, today);
  if (!current) return null;
  const i = spotlights.indexOf(current);
  const shown = spotlights.slice(Math.max(0, i - before), i + after + 1);
  const from = shown[0].start;
  const endOf = s => s.end || addDays(s.start, OPEN_STRIP_DAYS);
  const span = daysBetween(from, endOf(shown.at(-1)));
  const pct = iso => (daysBetween(from, iso) / span) * 100;
  return {
    current,
    week: Math.floor(daysBetween(current.start, today) / 7) + 1,
    strip: {
      from,
      to: endOf(shown.at(-1)),
      segments: shown.map(s => ({ spotlight: s, left: pct(s.start), width: pct(endOf(s)) - pct(s.start) })),
      today: pct(today),
    },
  };
}

// A release week belongs to the chapter holding most of its 7 days, so a
// Thursday-to-Saturday release keeps the week in the old chapter.
function majoritySpotlight(days) {
  const count = new Map();
  for (const d of days) count.set(d.spotlight, (count.get(d.spotlight) || 0) + 1);
  let best = null, most = 0;
  for (const [spotlight, n] of count) if (n > most) [best, most] = [spotlight, n];
  return best;
}
