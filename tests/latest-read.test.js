import test from 'node:test';
import assert from 'node:assert/strict';
import { latestRead } from '../js/modules/membership.js';

test('a slow read overtaken by a later one resolves null, so it cannot paint over it', async () => {
  const read = latestRead();
  let finishSlow;
  const slow = read(() => new Promise(resolve => { finishSlow = resolve; }));
  const fast = read(async () => 'fresh');
  assert.deepEqual(await fast, { user: null, value: 'fresh' });
  finishSlow('stale');
  assert.equal(await slow, null);
});

test('separate render targets do not supersede each other', async () => {
  const [pitch, gate] = [latestRead(), latestRead()];
  const first = pitch(async () => 1);
  await gate(async () => 2);
  assert.deepEqual(await first, { user: null, value: 1 });
});
