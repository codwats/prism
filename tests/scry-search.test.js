import test from 'node:test';
import assert from 'node:assert/strict';
import { createScrySession, scryMatches, scryJump, scryAct, scryAnswer, scryClearSearch, scryTally } from '../js/features/scry-mode.js';

const rows = [
  { name: 'Sol Ring' },
  { name: 'Arcane Signet' },
  { name: 'Forest', batchKey: 'Forest|#b|d1,d2|4', copyCount: 4, stripes: [
    { markType: 'stripe', deckName: 'Atraxa' }, { markType: 'stripe', deckName: 'Edgar' }, { markType: 'membership', deckName: 'X' }] },
  { name: 'Forest', batchKey: 'Forest|#b|d1|2', copyCount: 2, stripes: [{ markType: 'stripe', deckName: 'Atraxa' }] },
  { isPassRow: true, displayName: 'Island', deckName: 'Atraxa' },
  { name: 'Command Tower' },
];

test('search lists every screen of a matching card, case-insensitive, with a label to pick by', () => {
  const s = createScrySession(rows);
  const m = scryMatches(s, 'fOR');
  assert.deepEqual(m.map((x) => x.index), [2, 3]);
  assert.equal(m[0].label, 'Forest, 4 copies, Atraxa + Edgar');
  assert.equal(m[1].label, 'Forest, 2 copies, Atraxa');
  assert.equal(scryMatches(s, 'isl')[0].label, 'Island, Atraxa');
  assert.equal(scryMatches(s, 'zzz').length, 0);
  assert.equal(scryMatches(s, '  ').length, 0);
});

test('jump, answer, return: the found card is answered once and the walk resumes where it was', () => {
  const s = createScrySession(rows);
  const done = [];
  const opts = { onDone: (key) => done.push(key), onSkip: null };
  const act = () => scryAnswer(s, opts, 'done');

  act(); // Sol Ring in sequence
  assert.equal(s.index, 1);

  scryJump(s, scryMatches(s, 'forest')[1].index);
  assert.equal(s.rows[s.index].batchKey, 'Forest|#b|d1|2');
  act(); // Done on the found batch writes its own key
  assert.deepEqual(done, ['Sol Ring', 'Forest|#b|d1|2']);
  assert.equal(s.index, 1, 'back on Arcane Signet');

  assert.deepEqual(scryMatches(s, 'forest').map((x) => x.index), [2]);
  act(); act(); act();
  assert.deepEqual(done.slice(2), ['Arcane Signet', 'Forest|#b|d1,d2|4', 'Island|Atraxa']);
  assert.equal(s.index, 5);
  act();
  assert.equal(s.index, rows.length, 'session ends');
  assert.equal(s.rows, rows, 'order and membership unchanged');
});

test('Skip leaves the card findable; Skip on a found card returns to the walk', () => {
  const s = createScrySession(rows);
  const opts = { onDone() {}, onSkip() {} };
  scryAnswer(s, opts, 'skip');
  assert.equal(s.index, 1);
  assert.equal(scryMatches(s, 'sol')[0].index, 0, 'skipped card still searchable');
  scryJump(s, 5);
  scryAnswer(s, opts, 'skip');
  assert.equal(s.index, 1, 'back on the walk');
  assert.equal(scryMatches(s, 'command').length, 1, 'found card still in the walk');
});

test('Audit: skipAnswers makes Wrong an answer', () => {
  const s = createScrySession(rows);
  scryAnswer(s, { onDone() {}, onSkip() {}, skipAnswers: true }, 'skip');
  assert.equal(scryMatches(s, 'sol').length, 0);
});

test('clearing the search without acting returns to the card the player was on', () => {
  const s = createScrySession(rows);
  scryAct(s);
  scryJump(s, 4);
  scryJump(s, 3); // a second pick keeps the first return point
  scryClearSearch(s);
  assert.equal(s.index, 1);
  scryClearSearch(s); // no search open: stays put
  assert.equal(s.index, 1);
});

test('acting on the card the player was already on moves on to the next open one', () => {
  const s = createScrySession(rows);
  scryJump(s, 0);
  scryAct(s);
  assert.equal(s.index, 1);
});

test('tally counts a card answered by search, and Skip does not (#491)', () => {
  const s = createScrySession(rows);
  assert.equal(scryTally(s), 0);
  scryJump(s, 5);
  scryAnswer(s, { onDone() {}, onSkip() {} }, 'skip');
  assert.equal(scryTally(s), 0, 'plain skip is not an answer');
  scryJump(s, 5);
  scryAnswer(s, { onDone() {}, onSkip() {} }, 'done');
  assert.equal(scryTally(s), 1);
  assert.equal(s.index, 0, 'walk position unchanged');
});

test('tally counts Audit Wrong via skipAnswers (#491)', () => {
  const s = createScrySession(rows);
  scryJump(s, 5);
  scryAnswer(s, { onDone() {}, onSkip() {}, skipAnswers: true }, 'skip');
  assert.equal(scryTally(s), 1);
});
