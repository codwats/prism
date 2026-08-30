/**
 * #199 — the nav account section must settle on the branch that matches the
 * real session, on every page-load ordering.
 *
 * Each scenario runs in its own process (see helpers/nav-auth-scenario.mjs);
 * the runner drives the real initAuth() + setupAuthListeners() sequence that
 * layout.js's initAuthModule() performs, then reports which branch the nav
 * actually painted.
 */
import test from 'node:test';
import assert from 'node:assert/strict';
import { execFileSync } from 'node:child_process';
import { fileURLToPath } from 'node:url';

const RUNNER = fileURLToPath(new URL('./helpers/nav-auth-scenario.mjs', import.meta.url));

const names = JSON.parse(execFileSync('node', [RUNNER, '--list'], { encoding: 'utf8' }));

// Scenarios are independent processes, so run them concurrently — the slowest
// spends 5s inside initAuth's CDN timeout and would dominate a serial run.
const results = await Promise.all(names.map(async (name) => {
  const { execFile } = await import('node:child_process');
  const { promisify } = await import('node:util');
  const { stdout } = await promisify(execFile)('node', [RUNNER, name], { encoding: 'utf8' });
  return JSON.parse(stdout.trim().split('\n').pop());
}));

for (const r of results) {
  // profile.js gates its own initial render on the same predicate, so it has to
  // agree with what the nav painted: paint iff we reached a verdict.
  test(`canPaintAuthState agrees with the paint — ${r.scenario}`, () => {
    assert.equal(r.canPaint, r.expected !== 'skeleton');
  });

  test(`nav paints ${r.expected} — ${r.scenario}`, () => {
    assert.equal(
      r.painted,
      r.expected,
      `nav painted "${r.painted}" but the session says "${r.expected}" ` +
      `(display: ${JSON.stringify(r.display)})`
    );
  });
}
