/**
 * Runs ONE nav-auth page-load scenario in this process and prints the result
 * as JSON. Spawned per scenario by tests/nav-auth-state.test.js because
 * supabase-client.js caches its client in module scope — only a fresh process
 * gives each scenario a clean module graph.
 *
 * Regression harness for #199: the nav account section must settle on the
 * branch that matches the real session under every page-load ordering.
 *
 * The fake DOM models script tags the way a browser does: appending a
 * <script src="...supabase..."> to <head> schedules that tag's own load/error
 * outcome. That fidelity matters — the bug turns on who is listening when the
 * event fires, and on whether a failed load is ever retried.
 */

const SESSION = { user: { id: 'u1', email: 'user@example.com' } };

class FakeEl {
  constructor(id = null, tag = 'div') {
    this.id = id;
    this.tagName = tag.toUpperCase();
    this.style = {};
    this.hidden = false;
    this._listeners = {};
    this.children = [];
  }
  addEventListener(ev, cb) { (this._listeners[ev] ||= []).push(cb); }
  removeEventListener() {}
  dispatch(ev) { (this._listeners[ev] || []).slice().forEach((cb) => cb({ type: ev })); }
  setAttribute() {}
  removeAttribute() {}
  remove() { this.parent?.children.splice(this.parent.children.indexOf(this), 1); }
  appendChild(c) { this.children.push(c); c.parent = this; return c; }
}

/**
 * `outcome` is what the browser would do with each injected SDK <script>:
 *   'load'  — executes, defines window.supabase
 *   'error' — blocked / DNS failure / offline
 *   'hang'  — request never settles (slow CDN); only initAuth's timeout ends it
 * An array applies one outcome per successive attempt, last value repeating.
 */
function installDom({ sdkScriptPresent, outcome, sdkArrivalDelay, sdkFactory }) {
  const byId = new Map();
  for (const id of ['auth-loading', 'auth-logged-out', 'auth-logged-in']) {
    byId.set(id, new FakeEl(id));
  }
  const outcomes = Array.isArray(outcome) ? outcome : [outcome];
  let attempt = 0;

  const head = new FakeEl(null, 'head');
  const isSdkScript = (el) => el.tagName === 'SCRIPT' && String(el.src || '').includes('supabase');
  const findScript = (sel) =>
    (sel.includes('supabase') ? head.children.find(isSdkScript) || null : null);
  head.querySelector = findScript;

  const scheduleOutcome = (script) => {
    const verdict = outcomes[Math.min(attempt++, outcomes.length - 1)];
    if (verdict === 'hang') return;
    setTimeout(() => {
      if (script.parent !== head) return; // tag was removed before it settled
      if (verdict === 'load') globalThis.window.supabase = sdkFactory();
      script.dispatch(verdict === 'load' ? 'load' : 'error');
    }, sdkArrivalDelay);
  };

  const realAppend = head.appendChild.bind(head);
  head.appendChild = (child) => {
    realAppend(child);
    if (isSdkScript(child)) scheduleOutcome(child);
    return child;
  };

  if (sdkScriptPresent) {
    const s = new FakeEl(null, 'script');
    s.src = 'https://cdn.jsdelivr.net/npm/@supabase/supabase-js@2';
    head.appendChild(s);
  }

  globalThis.document = {
    head,
    getElementById: (id) => byId.get(id) || null,
    querySelector: findScript,
    querySelectorAll: () => [],
    createElement: (tag) => new FakeEl(null, tag),
    addEventListener: () => {},
  };

  const store = new Map();
  globalThis.localStorage = {
    getItem: (k) => (store.has(k) ? store.get(k) : null),
    setItem: (k, v) => store.set(k, String(v)),
    removeItem: (k) => store.delete(k),
  };

  globalThis.window = {
    location: { hash: '', origin: 'http://localhost:3456', reload() { globalThis.window._reloaded = true; } },
    supabase: undefined,
    localStorage: globalThis.localStorage,
    addEventListener: () => {},
    dispatchEvent: () => {},
  };

  return { byId, store };
}

function makeSdk({ session, getSessionDelay, emitInitialSession, initialSessionDelay, getSessionReturnsNull }) {
  const noRows = { data: null, error: null };
  const chain = () => {
    const obj = {
      select: () => obj, eq: () => obj, in: () => obj, order: () => obj,
      maybeSingle: () => Promise.resolve(noRows),
      insert: () => Promise.resolve(noRows),
      upsert: () => Promise.resolve(noRows),
      delete: () => obj,
      then: (...a) => Promise.resolve(noRows).then(...a),
    };
    return obj;
  };
  return {
    createClient: () => ({
      auth: {
        getSession: async () => {
          if (getSessionDelay) await new Promise((r) => setTimeout(r, getSessionDelay));
          return { data: { session: getSessionReturnsNull ? null : session } };
        },
        onAuthStateChange: (cb) => {
          if (emitInitialSession) setTimeout(() => cb('INITIAL_SESSION', session), initialSessionDelay);
          return { data: { subscription: { unsubscribe() {} } } };
        },
      },
      from: () => chain(),
      rpc: () => Promise.resolve(noRows),
    }),
  };
}

const SCENARIOS = {
  // --- healthy orderings (must stay green) ---
  'sdk-already-global':       { sdkScriptPresent: true,  preloaded: true },
  'sdk-arrives-late':         { sdkScriptPresent: true,  outcome: 'load' },
  'slow-getsession':          { sdkScriptPresent: true,  preloaded: true, getSessionDelay: 40 },
  'no-layout-delay':          { sdkScriptPresent: true,  preloaded: true, layoutDelay: 0 },
  'no-initial-session':       { sdkScriptPresent: true,  preloaded: true, emitInitialSession: false },
  'session-only-via-event':   { sdkScriptPresent: true,  preloaded: true, getSessionReturnsNull: true, initialSessionDelay: 20 },
  'signed-out':               { sdkScriptPresent: true,  preloaded: true, signedOut: true },
  // Anonymous visitor: layout.js deliberately never injects the SDK. The nav
  // must still resolve to signed-out rather than sitting on the skeleton.
  'anonymous-no-sdk':         { sdkScriptPresent: false, outcome: 'error', signedOut: true, storedSession: false },

  // --- #199: the SDK is permanently unavailable ---
  // The session can never be verified, so "signed-in" is unknowable. The nav
  // must NOT claim signed-out — that is the bug. Holding the loading skeleton
  // is the only honest branch.
  //
  // Blocked by an ad blocker / DNS failure, error fires after initAuth listens.
  'sdk-script-errors':        { sdkScriptPresent: true,  outcome: 'error', sdkArrivalDelay: 130, expected: 'skeleton', trailingWait: 3000 },
  // Same, but the error fires inside layout.js's 100ms sleep, so a listener
  // attached afterwards would never see it.
  'sdk-error-before-listen':  { sdkScriptPresent: true,  outcome: 'error', sdkArrivalDelay: 30, expected: 'skeleton', trailingWait: 3000 },
  // Slow CDN: the request never settles.
  'sdk-hangs':                { sdkScriptPresent: true,  outcome: 'hang', expected: 'skeleton', trailingWait: 1000 },
  // hasStoredSession() true but no tag in the DOM yet when initAuth runs.
  'no-script-tag':            { sdkScriptPresent: false, outcome: 'error', expected: 'skeleton', trailingWait: 3000 },
  // Minimised: the only load-bearing element is that window.supabase is unset
  // when initAuth() reaches getSupabase(). No delays, no prior tag.
  'minimal-sdk-absent':       { sdkScriptPresent: false, outcome: 'error', layoutDelay: 0, expected: 'skeleton', trailingWait: 3000 },

  // --- #199: the SDK is late but does arrive ---
  // Green only if a failed/hung SDK load is retried and the nav then repainted.
  'sdk-recovers-after-hang':  { sdkScriptPresent: true,  outcome: ['hang', 'load'], trailingWait: 4000 },
  'sdk-recovers-after-error': { sdkScriptPresent: true,  outcome: ['error', 'load'], trailingWait: 2000 },
  // The SDK lands only AFTER initAuth stopped waiting and the page rendered.
  // Exercises the background continuation specifically, not the inline wait.
  'sdk-arrives-after-give-up': { sdkScriptPresent: true, outcome: ['hang', 'load'], sdkArrivalDelay: 2000, trailingWait: 5000 },
};

if (process.argv[2] === '--list') {
  console.log(JSON.stringify(Object.keys(SCENARIOS)));
  process.exit(0);
}

async function main() {
  // App-level console chatter would drown the one line the test parses.
  const emit = console.log.bind(console);
  console.log = () => {};

  const name = process.argv[2];
  const cfg = SCENARIOS[name];
  if (!cfg) throw new Error(`unknown scenario: ${name}`);

  const {
    sdkScriptPresent, outcome = 'hang', preloaded = false, signedOut = false,
    getSessionDelay = 0, layoutDelay = 100, sdkArrivalDelay = 30,
    emitInitialSession = true, initialSessionDelay = 0,
    getSessionReturnsNull = false, trailingWait = 150,
    storedSession = true, expected,
  } = cfg;

  const session = signedOut ? null : SESSION;
  const sdkOpts = { session, getSessionDelay, emitInitialSession, initialSessionDelay, getSessionReturnsNull };
  const { byId, store } = installDom({
    sdkScriptPresent, outcome, sdkArrivalDelay, sdkFactory: () => makeSdk(sdkOpts),
  });

  // hasStoredSession() probes this key; layout.js eager-loads the SDK off it.
  if (storedSession) store.set('sb-clqxysoimlsjfmnjbxsa-auth-token', '{"access_token":"x"}');
  if (preloaded) globalThis.window.supabase = makeSdk(sdkOpts);

  const auth = await import('../../js/modules/auth.js');

  // Drives the real boot sequence rather than a copy of it: startAuth() is what
  // every page calls, so the test cannot drift away from production.
  // layoutDelay models a caller that waits before booting auth (features/init.js
  // and profile.js still do, for their own rendering).
  let threw = null;
  await new Promise((r) => setTimeout(r, layoutDelay));
  try {
    await auth.startAuth();
  } catch (err) {
    threw = err.message;
  }

  // Give any in-flight repaint (INITIAL_SESSION, SDK retry) a chance to land.
  await new Promise((r) => setTimeout(r, trailingWait));

  const disp = (id) => byId.get(id).style.display;
  const painted =
    disp('auth-logged-in') === '' ? 'signed-in'
    : disp('auth-logged-out') === '' ? 'signed-out'
    : 'skeleton';

  emit(JSON.stringify({
    scenario: name,
    canPaint: auth.canPaintAuthState(),
    expected: expected || (session ? 'signed-in' : 'signed-out'),
    painted,
    threw,
    display: { loading: disp('auth-loading') ?? null, out: disp('auth-logged-out') ?? null, in: disp('auth-logged-in') ?? null },
  }));
}

main().then(
  // initAuth's CDN-timeout timers stay pending on the failure paths and would
  // hold the event loop open long after the verdict is known.
  () => process.exit(0),
  (err) => { console.error(err); process.exit(1); }
);
