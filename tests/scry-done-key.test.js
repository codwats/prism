import test from 'node:test';
import assert from 'node:assert/strict';
import { getScryCardKey, scryLegend } from '../js/features/scry-mode.js';

test('Done key: single card is its name, batch screen its batch key, pass row name|deck', () => {
  assert.equal(getScryCardKey({ name: 'Sol Ring' }), 'Sol Ring');
  assert.equal(getScryCardKey({ name: 'Sol Ring', batchKey: 'Sol Ring|#b|d1,d2|2' }), 'Sol Ring|#b|d1,d2|2');
  assert.equal(getScryCardKey({ isPassRow: true, displayName: 'Forest', deckName: 'Atraxa' }), 'Forest|Atraxa');
});

test('legend skips membership marks and sorts by slot', () => {
  const lines = scryLegend([
    { markType: 'stripe', position: 5, color: '#FF0000', deckName: 'B' },
    { markType: 'membership', position: 1, color: '#00FF00', deckName: 'X' },
    { markType: 'dot', position: 2, color: '#FF0000', deckName: 'A' },
  ]);
  assert.equal(lines.length, 2);
  assert.match(lines[0].text, /dot, A, Side A - Slot 2$/);
  assert.match(lines[1].text, /, B, Side A - Slot 5$/);
});
