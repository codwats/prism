import test from 'node:test';
import assert from 'node:assert/strict';
import { getSpotlights, buildCalendar, eventsOn, eventRange, openingWeek, monthOfWeek, stepMonth, weekOfMonth, spotlightHero, spotlightSpan, agenda, eventTime, localizeEvents, isEventTime } from '../js/modules/calendar.js';

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

// Events (#530). Nauctis's prerelease runs Fri Jan 29 to Thu Feb 4 2027.
const EVENTS = [
  { id: 'nau-pre', kind: 'prerelease', title: 'NAU Prerelease', start: '2027-01-29', end: '2027-02-04', set: 'nau', url: 'https://example.com', source: 'https://example.com' },
  { id: 'cmd', kind: 'supplemental', title: 'CMD', start: '2026-10-20', set: 'cmd', url: 'https://example.com', source: 'https://example.com' },
];
const evCal = buildCalendar({ sets: SETS, events: EVENTS }, '2026-11-24');
const evWeek = iso => evCal.weeks.find(w => w.start === iso);

test('a multi-day prerelease shows on every day it spans, across a month boundary', () => {
  for (const d of ['2027-01-29', '2027-01-31', '2027-02-01', '2027-02-04']) assert.deepEqual(eventsOn(EVENTS, d).map(e => e.id), ['nau-pre'], d);
  assert.deepEqual(eventsOn(EVENTS, '2027-01-28'), []);
  assert.deepEqual(eventsOn(EVENTS, '2027-02-05'), []);
});

test('a prerelease spanning two weeks is one bar per week, clipped at the week edge', () => {
  // Week of Jan 24: Fri-Sat (cols 6-7), runs on. Week of Jan 31: Sun-Thu (cols 1-5), began earlier.
  const [a] = evWeek('2027-01-24').events;
  assert.deepEqual([a.event.id, a.col, a.span, a.clipStart, a.clipEnd], ['nau-pre', 6, 2, false, true]);
  const [b] = evWeek('2027-01-31').events;
  assert.deepEqual([b.event.id, b.col, b.span, b.clipStart, b.clipEnd], ['nau-pre', 1, 5, true, false]);
});

test('a supplemental release adds a chip on its day but no Spotlight', () => {
  const [p] = evWeek('2026-10-18').events;
  assert.deepEqual([p.event.id, p.col, p.span], ['cmd', 3, 1]);
  assert.equal(evCal.spotlights.some(s => s.set.code === 'cmd'), false);
  assert.equal(evCal.weeks.flatMap(w => w.days).find(d => d.date === '2026-10-20').spotlight.set.code, 'rf');
});

test('the week a Spotlight begins keeps the first lane free for "<Set> begins"', () => {
  // Nauctis begins Fri Feb 5, in the week of Jan 31, which also holds its prerelease
  assert.equal(evWeek('2027-01-31').events[0].lane, 1);
  assert.equal(evWeek('2027-01-24').events[0].lane, 0);
});

test('events past the lanes are counted as "+N more" on each day they cover', () => {
  const many = Array.from({ length: 5 }, (_, i) => ({ id: `e${i}`, kind: 'supplemental', title: 'X', start: '2026-12-02', url: 'u', source: 's' }));
  const w = buildCalendar({ sets: SETS, events: many }, '2026-11-24').weeks.find(x => x.start === '2026-11-29');
  assert.equal(w.events.length, 3);
  assert.deepEqual(w.more, { '2026-12-02': 2 });
});

test('event dates read as plain dates', () => {
  assert.equal(eventRange(EVENTS[0]), 'Fri, Jan 29 – Thu, Feb 4');
  assert.equal(eventRange(EVENTS[1]), 'Tue, Oct 20');
});

// Timed events (#531). A Secret Lair drop's `time` is ISO with its PT offset.
const drop = (id, time) => ({ id, kind: 'secret-lair', title: id, start: time.slice(0, 10), time, url: 'https://example.com', source: 'https://example.com' });

test('9am PT reads in the viewer zone, across a daylight saving change', () => {
  // US clocks change Mar 8 2026, the UK's on Mar 29, so London is an hour closer for three weeks
  assert.equal(eventTime(drop('a', '2026-03-02T09:00:00-08:00'), 'America/Toronto'), '12:00 PM EST');
  assert.equal(eventTime(drop('b', '2026-03-09T09:00:00-07:00'), 'America/Toronto'), '12:00 PM EDT');
  // The zone name for London varies by ICU build ("GMT" or "GMT+0"); the hour is the point
  assert.match(eventTime(drop('c', '2026-03-02T09:00:00-08:00'), 'Europe/London'), /^5:00 PM GMT/);
  assert.match(eventTime(drop('d', '2026-03-16T09:00:00-07:00'), 'Europe/London'), /^4:00 PM GMT/);
  assert.equal(eventTime(EVENTS[1], 'Europe/London'), null);
});

test('a drop late in PT lands on the next day where it is already tomorrow', () => {
  const late = drop('late', '2026-03-16T18:00:00-07:00');
  assert.equal(localizeEvents([late], 'Asia/Tokyo')[0].start, '2026-03-17');
  assert.equal(localizeEvents([late], 'America/Los_Angeles')[0].start, '2026-03-16');
  assert.equal(late.start, '2026-03-16', 'the source event is not changed');
  assert.equal(localizeEvents([EVENTS[0]], 'Asia/Tokyo')[0], EVENTS[0], 'untimed events keep their dates');
});

test('a MagicCon spans its days', () => {
  const con = { id: 'con', kind: 'magiccon', title: 'MagicCon: Las Vegas', city: 'Las Vegas', start: '2027-08-27', end: '2027-08-29', url: 'https://example.com', source: 'https://example.com' };
  const [bar] = buildCalendar({ sets: SETS, events: [con] }, '2026-11-24').weeks.find(w => w.start === '2027-08-22').events;
  assert.deepEqual([bar.col, bar.span, bar.clipStart, bar.clipEnd], [6, 2, false, true]);
  assert.deepEqual(['2027-08-27', '2027-08-28', '2027-08-29', '2027-08-30'].map(d => eventsOn([con], d).length), [1, 1, 1, 0]);
});

test('filtering events keeps the same weeks and lays out only the shown events', () => {
  const con = { id: 'con', kind: 'magiccon', title: 'C', city: 'X', start: '2027-08-27', end: '2027-08-29', url: 'u', source: 's' };
  const data = { sets: SETS, events: [...EVENTS, con] };
  const all = buildCalendar(data, '2026-11-24');
  const some = buildCalendar(data, '2026-11-24', EVENTS.filter(e => e.kind === 'prerelease'));
  assert.equal(some.last, all.last);
  assert.equal(some.weeks.length, all.weeks.length);
  assert.deepEqual([...new Set(some.weeks.flatMap(w => w.events.map(p => p.event.id)))], ['nau-pre']);
});

test('an event time must be ISO with a UTC offset', () => {
  for (const t of ['2026-03-16T09:00:00-07:00', '2026-03-16T09:00-08:00']) assert.equal(isEventTime(t), true, t);
  for (const t of ['2026-03-16T09:00:00', '2026-03-16 09:00-07:00', '2026-03-16T25:00:00-07:00', '9am PT', '2026-02-30T09:00:00-08:00', 42]) {
    assert.equal(isEventTime(t), false, String(t));
  }
});

// Mobile agenda (#532): the same events and Spotlights as the weeks it replaces.
test('the agenda for a range lists the events and Spotlights of the weeks covering it', () => {
  const from = '2026-10-18', to = '2027-02-06'; // Sun of CMD's week to Sat of Nauctis's
  const groups = agenda(evCal, EVENTS, from, to);
  const inWeeks = evCal.weeks.filter(w => w.start >= from && w.start <= to);
  const weekIds = [...new Set(inWeeks.flatMap(w => w.events.map(p => p.event.id)))];
  assert.deepEqual(groups.flatMap(g => g.events.map(e => e.id)), weekIds);
  const dayOfEv = id => inWeeks.flatMap(w => w.days).find(d => d.date === EVENTS.find(e => e.id === id).start);
  for (const g of groups) for (const e of g.events) assert.equal(g.spotlight, dayOfEv(e.id).spotlight, e.id);
  assert.deepEqual(groups.map(g => g.spotlight.set.code), ['rf', 'stk']);
});

test('the agenda keeps an event that started before the range, in date order', () => {
  const groups = agenda(evCal, EVENTS, '2027-02-01');
  assert.deepEqual(groups.map(g => [g.spotlight.set.code, g.events.map(e => e.id)]), [['stk', ['nau-pre']]]);
  assert.deepEqual(agenda(evCal, EVENTS, '2027-02-05'), []);
});

test('agenda events before the first Premier set fall in a group with no Spotlight', () => {
  const early = [{ id: 'old', kind: 'supplemental', title: 'OLD', start: '2026-01-10', url: 'u', source: 's' }, ...EVENTS];
  const groups = agenda(evCal, early, '2026-01-01');
  assert.deepEqual(groups.map(g => g.spotlight?.set.code ?? null), [null, 'rf', 'stk']);
});
