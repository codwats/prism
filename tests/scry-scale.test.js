import { test } from 'node:test';
import assert from 'node:assert/strict';
import { computeScale } from '../js/features/scry-mode.js';

test('desktop card fills most of 1280x800 height', () => {
  const card = 340 * computeScale(1280, 800);
  assert.ok(card >= 0.7 * 800, `card ${card}px`);
});

test('phone scale unchanged at 375x667', () => {
  assert.equal(computeScale(375, 667), (307 / 340) * 0.85);
});
