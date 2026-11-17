import { test } from 'node:test';
import assert from 'node:assert/strict';
import { computeScale } from '../js/features/scry-mode.js';

test('fallback: desktop card fills most of 1280x800 and leaves the 240px reserve', () => {
  const card = 340 * computeScale(1280, 800);
  assert.ok(card >= 0.65 * 800 && card + 240 <= 800, `card ${card}px`);
});

test('measured space wins: a landscape phone (844x390) with 200px free gets a card that fits', () => {
  const card = 340 * computeScale(844, 390, 200);
  assert.ok(card <= 200, `card ${card}px`);
});

test('phone scale unchanged at 375x667', () => {
  assert.equal(computeScale(375, 667), (307 / 340) * 0.85);
});

test('measured space below the 0.4 floor still fits: the floor never overflows the card area', () => {
  const card = 340 * computeScale(1280, 800, 100);
  assert.ok(card <= 100, `card ${card}px`);
});
