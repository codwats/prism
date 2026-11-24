import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync, existsSync } from 'node:fs';
import { isEventTime } from '../js/modules/calendar.js';

const root = new URL('../', import.meta.url);
const data = JSON.parse(readFileSync(new URL('assets/calendar.json', root), 'utf8'));
const isDate = s => /^\d{4}-\d{2}-\d{2}$/.test(s) && new Date(`${s}T00:00:00Z`).toISOString().startsWith(s);

test('every set has its required fields and a real release date', () => {
  assert.ok(data.sets.length > 0 && Array.isArray(data.events));
  for (const s of data.sets) {
    assert.match(s.code, /^[a-z0-9]+$/, s.code);
    assert.ok(s.name && typeof s.premier === 'boolean' && /^https:\/\//.test(s.url), s.code);
    assert.ok(isDate(s.released), `${s.code} released ${s.released}`);
    assert.ok(s.color === null || /^#[0-9a-f]{6}$/i.test(s.color), `${s.code} color ${s.color}`);
  }
});

test('set codes are unique', () => {
  const codes = data.sets.map(s => s.code);
  assert.equal(new Set(codes).size, codes.length);
});

const KINDS = ['release', 'prerelease', 'supplemental', 'secret-lair', 'magiccon'];
const setOf = Object.fromEntries(data.sets.map(s => [s.code, s]));

test('every event has an id, a known kind, a title, real dates and https url and source', () => {
  assert.ok(data.events.length > 0);
  for (const e of data.events) {
    assert.match(e.id, /^[a-z0-9-]+$/, e.id);
    assert.ok(KINDS.includes(e.kind) && e.title, e.id);
    assert.ok(isDate(e.start) && (e.end === undefined || isDate(e.end)), e.id);
    assert.match(e.url, /^https:\/\//, `${e.id} url`);
    assert.match(e.source, /^https:\/\//, `${e.id} source`);
  }
});

test('event ids are unique', () => {
  const ids = data.events.map(e => e.id);
  assert.equal(new Set(ids).size, ids.length);
});

test('an end date is on or after the start', () => {
  for (const e of data.events.filter(x => x.end)) assert.ok(e.end >= e.start, `${e.id} ${e.start}..${e.end}`);
});

test('every set code an event uses is in the sets list', () => {
  for (const e of data.events.filter(x => x.set)) assert.ok(setOf[e.set], `${e.id} uses ${e.set}`);
});

test('every set has one release event on its release date: release if Premier, else supplemental', () => {
  for (const s of data.sets) {
    const rel = data.events.filter(e => e.set === s.code && (e.kind === 'release' || e.kind === 'supplemental'));
    assert.equal(rel.length, 1, s.code);
    assert.deepEqual([rel[0].kind, rel[0].start], [s.premier ? 'release' : 'supplemental', s.released], s.code);
  }
});

test('a prerelease is the week before its Premier set releases', () => {
  for (const e of data.events.filter(x => x.kind === 'prerelease')) {
    const s = setOf[e.set];
    assert.ok(s?.premier && e.end && e.end < s.released && e.start >= '2025-01-01', e.id);
  }
});

test('a timed event has an ISO time with offset on its start date', () => {
  // `start` is the Pacific date; the page moves the chip to the viewer's day
  const timed = data.events.filter(e => e.time !== undefined);
  assert.ok(timed.length > 0);
  for (const e of timed) {
    assert.ok(isEventTime(e.time), `${e.id} time ${e.time}`);
    assert.match(e.time, /-0[78]:00$/, `${e.id} time is Pacific`);
    assert.equal(e.time.slice(0, 10), e.start, e.id);
  }
});

test('Secret Lair drops are one day and MagicCons have a city, from 2025 on', () => {
  // A drop's time is optional: a few announcements give only the date
  for (const e of data.events.filter(x => x.kind === 'secret-lair')) assert.ok(!e.end && e.start >= '2025-01-01', e.id);
  for (const e of data.events.filter(x => x.kind === 'magiccon')) assert.ok(e.city && e.end && e.start >= '2025-01-01', e.id);
  assert.ok(data.events.some(e => e.kind === 'magiccon'));
});

test('every set symbol is a local file at assets/sets/<code>.svg', () => {
  for (const s of data.sets) {
    if (s.symbol === null) continue;
    assert.equal(s.symbol, `assets/sets/${s.code}.svg`);
    assert.ok(existsSync(new URL(s.symbol, root)), `missing ${s.symbol}`);
  }
});
