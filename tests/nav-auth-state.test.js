/**
 * #199 — the nav account section must settle on the branch that matches the
 * real session, on every page-load ordering.
 *
 * Each scenario runs in its own process (see helpers/nav-auth-scenario.mjs);
 * the runner drives startAuth() — the real sequence every page boots auth
 * through — then reports which branch the nav actually painted.
 */
import test from 'node:test';
import assert from 'node:assert/strict';
import { execFile, execFileSync } from 'node:child_process';
import { promisify } from 'node:util';
import { fileURLToPath } from 'node:url';

const RUNNER = fileURLToPath(new URL('./helpers/nav-auth-scenario.mjs', import.meta.url));
const run = promisify(execFile);

// The slowest scenario waits out the full SDK retry budget; this only has to be
// generous enough that a hang is reported as a failure rather than stalling the
// suite forever.
const SCENARIO_TIMEOUT_MS = 60_000;

// process.execPath, not "node": run the scenarios under the same interpreter as
// the test process rather than whatever a PATH lookup happens to find.
const names = JSON.parse(
  execFileSync(process.execPath, [RUNNER, '--list'], { encoding: 'utf8' })
);

// Scenarios are independent processes, so run them concurrently — the slowest
// spends seconds inside the SDK retry budget and would dominate a serial run.
//
// Every failure mode is captured as a result rather than thrown: a rejection
// here happens during module evaluation, before a single test is defined, so
// one broken scenario would take the whole file down and hide the other 15.
const results = await Promise.all(names.map(async (name) => {
  try {
    const { stdout } = await run(process.execPath, [RUNNER, name], {
      encoding: 'utf8',
      timeout: SCENARIO_TIMEOUT_MS,
    });
    const lastLine = stdout.trim().split('\n').pop() ?? '';
    try {
      return { name, ...JSON.parse(lastLine) };
    } catch {
      return { name, runnerError: `runner printed no JSON result. Last line: ${JSON.stringify(lastLine)}` };
    }
  } catch (err) {
    const timedOut = err.killed || err.signal;
    return {
      name,
      runnerError: timedOut
        ? `runner did not finish within ${SCENARIO_TIMEOUT_MS}ms (signal ${err.signal})`
        : `runner failed: ${err.message}`,
    };
  }
}));

for (const r of results) {
  if (r.runnerError) {
    test(`scenario runs — ${r.name}`, () => assert.fail(r.runnerError));
    continue;
  }

  // startAuth() swallows initAuth failures by design; a rejection escaping it
  // would mean the nav never got its listeners attached.
  test(`startAuth() settles without throwing — ${r.name}`, () => {
    assert.equal(r.threw, null, `startAuth() rejected with: ${r.threw}`);
  });

  // profile.js gates its own initial render on the same predicate, so it has to
  // agree with what the nav painted: paint iff we reached a verdict.
  test(`canPaintAuthState agrees with the paint — ${r.name}`, () => {
    assert.equal(r.canPaint, r.expected !== 'skeleton');
  });

  test(`nav paints ${r.expected} — ${r.name}`, () => {
    assert.equal(
      r.painted,
      r.expected,
      `nav painted "${r.painted}" but the session says "${r.expected}" ` +
      `(display: ${JSON.stringify(r.display)})`
    );
  });
}
