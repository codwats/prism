import test from 'node:test';
import assert from 'node:assert/strict';
import { getSpotlights, buildCalendar, openingWeek, monthOfWeek, stepMonth, weekOfMonth, spotlightHero, spotlightSpan } from '../js/modules/calendar.js';

// Made-up data: real 2026 dates, invented codes.
const set = (code, released, extra = {}) => ({ code, name: code.toUpperCase(), premier: true, released, color: null, symbol: null, url: 'https://example.com', ...extra });
const SETS = [
  set('stk', '2026-11-13'),
  set('cmd', '2026-10-20', { premier: false }),
  set('rf', '2026-10-02'),
  set('nau', '2027-02-05'),
];

test('Reality Fracture to Star Trek is a 6-week Spotlight', () => {
  const rf = getSpotlights(SETS).find(s => s.set.code === 'rf');
  assert.equal(rf.start, '2026-10-02');
  assert.equal(rf.end, '2026-11-13');
  assert.equal(rf.weeks, 6);
  assert.equal(rf.next.code, 'stk');
});

// Opened on 2026-11-24: the weeks run from the start of 2025 (previous year)
// to the Saturday four weeks past the last date in the data (Nauctis, Feb 5).
const cal = buildCalendar({ sets: SETS, events: [] }, '2026-11-24');
const allDays = cal.weeks.flatMap(w => w.days);
const dayOf = iso => allDays.find(d => d.date === iso);

test('weeks run Sunday to Saturday from the start of the previous year', () => {
  assert.equal(cal.weeks[0].start, '2024-12-29');
  assert.ok(cal.weeks.every(w => w.days.length === 7 && new Date(w.start).getUTCDay() === 0));
  assert.equal(allDays.at(-1).date, '2027-03-06');
});

test('the Spotlight is right on boundary days', () => {
  assert.equal(dayOf('2026-10-01').spotlight, null);
  assert.equal(dayOf('2026-10-02').spotlight.set.code, 'rf');
  assert.equal(dayOf('2026-10-02').begins, true);
  assert.equal(dayOf('2026-10-03').begins, false);
  assert.equal(dayOf('2026-11-12').spotlight.set.code, 'rf');
  assert.equal(dayOf('2026-11-13').spotlight.set.code, 'stk');
});

test('Spotlights never overlap', () => {
  const spots = cal.spotlights;
  for (let i = 1; i < spots.length; i++) assert.equal(spots[i - 1].end, spots[i].start);
  for (const d of allDays) assert.ok(spots.filter(s => d.date >= s.start && (!s.end || d.date < s.end)).length <= 1);
});

const weekStarting = iso => cal.weeks.find(w => w.start === iso);

test('a Friday release week stays in the old chapter', () => {
  // Star Trek releases Friday Nov 13: Sun-Thu are Reality Fracture's.
  assert.equal(weekStarting('2026-11-08').chapter.set.code, 'rf');
  assert.equal(weekStarting('2026-11-15').chapter.set.code, 'stk');
});

test('a midweek release week goes to the new chapter', () => {
  const wed = buildCalendar({ sets: [set('a', '2026-01-02'), set('b', '2026-03-04')], events: [] }, '2026-03-01');
  assert.equal(wed.weeks.find(w => w.start === '2026-03-01').chapter.set.code, 'b');
});

test('chapters are runs of weeks, one per Spotlight, with no chapter before the first set', () => {
  assert.equal(weekStarting('2026-09-27').chapter, null);
  const rf = cal.chapters.find(c => c.spotlight.set.code === 'rf');
  assert.deepEqual([cal.weeks[rf.firstWeek].start, cal.weeks[rf.lastWeek].start], ['2026-10-04', '2026-11-08']);
  assert.deepEqual(cal.chapters.map(c => c.spotlight.set.code), ['rf', 'stk', 'nau']);
  assert.equal(cal.chapters.at(-1).lastWeek, cal.weeks.length - 1);
});

test('the weeks open on the week before today', () => {
  assert.equal(cal.weeks[openingWeek(cal, '2026-11-24')].start, '2026-11-15');
  assert.equal(openingWeek(cal, '2025-01-01'), 0);
});

test('month navigation steps a month and stops at both ends', () => {
  assert.equal(monthOfWeek(cal, cal.weeks.findIndex(w => w.start === '2026-11-22')), '2026-11');
  assert.equal(stepMonth(cal, '2026-11', 1), '2026-12');
  assert.equal(stepMonth(cal, '2026-01', -1), '2025-12');
  assert.equal(stepMonth(cal, '2025-01', -1), '2025-01');
  assert.equal(stepMonth(cal, '2027-03', 1), '2027-03');
  assert.equal(cal.weeks[weekOfMonth(cal, '2026-12')].start, '2026-11-29');
  assert.equal(weekOfMonth(cal, '2025-01'), 0);
});

test('the hero reads the current Spotlight and its week', () => {
  const hero = spotlightHero(cal.spotlights, '2026-11-24');
  assert.equal(hero.current.set.code, 'stk');
  assert.deepEqual([hero.week, hero.current.weeks], [2, 12]);
  assert.equal(spotlightHero(cal.spotlights, '2026-11-13').week, 1);
  assert.equal(spotlightHero(cal.spotlights, '2026-11-20').week, 2);
});

test('the strip is proportional, up to 2 before and 1 after, with Today on it', () => {
  // Oct 2 to Apr 2 (an open Spotlight is drawn 8 weeks long): 182 days
  const { strip } = spotlightHero(cal.spotlights, '2026-11-24');
  assert.deepEqual(strip.segments.map(s => s.spotlight.set.code), ['rf', 'stk', 'nau']);
  assert.deepEqual(strip.segments.map(s => [s.left, s.width].map(n => +n.toFixed(2))), [[0, 23.08], [23.08, 46.15], [69.23, 30.77]]);
  assert.equal(+strip.today.toFixed(2), 29.12);
  assert.deepEqual(spotlightHero(cal.spotlights, '2026-11-24', { before: 0 }).strip.segments.map(s => s.spotlight.set.code), ['stk', 'nau']);
});

test('a Spotlight length reads as a fact', () => {
  const [rf, stk, nau] = cal.spotlights;
  assert.equal(spotlightSpan(rf), 'Oct 2 – Nov 13, 6 weeks');
  assert.equal(spotlightSpan(stk), 'Nov 13 – Feb 5, 12 weeks');
  assert.equal(spotlightSpan(nau), 'From Feb 5, next Premier set not announced');
});

test('before the first Premier set there is no hero', () => {
  assert.equal(spotlightHero(cal.spotlights, '2026-01-01'), null);
});

test('the last Spotlight is open and runs to the end of the data', () => {
  const last = cal.spotlights.at(-1);
  assert.equal(last.set.code, 'nau');
  assert.equal(last.end, null);
  assert.equal(allDays.at(-1).spotlight, last);
});
