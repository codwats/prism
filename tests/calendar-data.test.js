import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync, existsSync } from 'node:fs';

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

test('every set symbol is a local file at assets/sets/<code>.svg', () => {
  for (const s of data.sets) {
    if (s.symbol === null) continue;
    assert.equal(s.symbol, `assets/sets/${s.code}.svg`);
    assert.ok(existsSync(new URL(s.symbol, root)), `missing ${s.symbol}`);
  }
});
