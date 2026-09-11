import test from 'node:test';
import assert from 'node:assert/strict';

// Mock only browser and Supabase boundaries; auth, billing and sync stay real.
const store = new Map();
globalThis.localStorage = {
  getItem: key => store.get(key) ?? null,
  setItem: (key, value) => store.set(key, String(value)),
  removeItem: key => store.delete(key),
};
globalThis.document = { getElementById: () => null, querySelectorAll: () => [] };
globalThis.CustomEvent = class { constructor(type) { this.type = type; } };

let session = { user: { id: 'backer', email: 'backer@example.com' } };
let authCallback;
let entitled = false;
let reloaded = false;
let insideAuthCallback = false;
let finishClaim;
let claim = () => new Promise(resolve => {
  finishClaim = () => { entitled = true; resolve({ data: true, error: null }); };
});
const client = {
  auth: {
    getSession: async () => ({ data: { session } }),
    onAuthStateChange: callback => { authCallback = callback; },
  },
  rpc(name, args) {
    assert.equal(insideAuthCallback, false, 'Supabase requests must run outside the auth callback');
    if (name === 'claim_backer_membership') {
      assert.equal(args, undefined, 'the client must not supply an email');
      const result = claim();
      result.abortSignal = () => result;
      return result;
    }
    assert.equal(name, 'is_entitled');
    return Promise.resolve({ data: entitled, error: null });
  },
  from() {
    const query = {
      select: () => query, eq: () => query, in: () => query,
      order: () => query, insert: () => query,
      then: (resolve, reject) => Promise.resolve({ data: [], error: null }).then(resolve, reject),
    };
    return query;
  },
};
globalThis.window = {
  supabase: { createClient: () => client },
  location: { hash: '', reload() { reloaded = true; } },
  dispatchEvent() {}, addEventListener() {},
};

const { startAuth, onAuthChange, getCurrentUser } = await import('../js/modules/auth.js');
const { isEntitled } = await import('../js/modules/billing.js');

test('a restored backer session claims Membership before publishing entitlement', async () => {
  assert.equal(await isEntitled(), false, 'prime a stale pre-claim answer');
  let observed;
  const unsubscribe = onAuthChange(() => { observed = isEntitled(); });
  let ready = false;
  const boot = startAuth().then(() => { ready = true; });
  await new Promise(resolve => setImmediate(resolve));
  assert.equal(ready, false, 'auth startup must wait for the claim');
  assert.equal(observed, undefined, 'listeners must not see pre-claim entitlement');
  assert.equal(typeof finishClaim, 'function', 'startup must attempt the claim');
  finishClaim();
  await boot;
  assert.equal(await observed, true);
  assert.equal(getCurrentUser().id, 'backer');
  unsubscribe();
});

function emit(event, nextSession) {
  session = nextSession;
  insideAuthCallback = true;
  try {
    assert.equal(authCallback(event, session), undefined, 'auth callback must return synchronously');
  } finally {
    insideAuthCallback = false;
  }
}

const tick = () => new Promise(resolve => setTimeout(resolve, 20));

test('fresh sign-in claims before notifying listeners and reloading synced data', async () => {
  emit('SIGNED_OUT', null);
  await tick();
  entitled = false;
  finishClaim = undefined;
  let observed;
  const unsubscribe = onAuthChange(user => { if (user) observed = isEntitled(); });
  emit('SIGNED_IN', { user: { id: 'new-backer' } });
  await tick();
  assert.equal(observed, undefined);
  assert.equal(reloaded, false);
  assert.equal(typeof finishClaim, 'function');
  finishClaim();
  await tick();
  assert.equal(await observed, true);
  assert.equal(reloaded, true);
  unsubscribe();
});

test('signing out during a claim cannot restore the old user or reload', async () => {
  emit('SIGNED_OUT', null);
  await tick();
  reloaded = false;
  emit('SIGNED_IN', { user: { id: 'leaving-backer' } });
  await tick();
  const completeOldClaim = finishClaim;
  emit('SIGNED_OUT', null);
  await tick();
  completeOldClaim();
  await tick();
  assert.equal(getCurrentUser(), null);
  assert.equal(reloaded, false);
});

test('a failed claim preserves login and retries on the next auth event', async () => {
  entitled = false;
  claim = async () => ({ error: { message: 'temporarily unavailable' } });
  const user = { id: 'retrying-backer' };
  emit('SIGNED_IN', { user });
  await tick();
  assert.equal(getCurrentUser(), user);
  assert.equal(await isEntitled(), false);

  claim = async () => { entitled = true; return { data: true, error: null }; };
  emit('SIGNED_IN', { user });
  await tick();
  assert.equal(await isEntitled(), true);
});

test('a non-backer remains signed in without Membership and sign-out makes no claim', async () => {
  entitled = false;
  claim = async () => ({ data: false, error: null });
  const user = { id: 'ordinary-account' };
  emit('USER_UPDATED', { user });
  await tick();
  assert.equal(getCurrentUser(), user);
  assert.equal(await isEntitled(), false);
  let attempted = false;
  claim = async () => { attempted = true; throw new Error('must not claim when signed out'); };
  emit('SIGNED_OUT', null);
  await tick();
  assert.equal(getCurrentUser(), null);
  assert.equal(attempted, false);
});

test('a token refresh during the claim preserves fresh sign-in sync and reload', async () => {
  reloaded = false;
  entitled = false;
  const completions = [];
  claim = () => new Promise(resolve => {
    completions.push(() => { entitled = true; resolve({ data: true, error: null }); });
  });
  const signedIn = { user: { id: 'refreshing-backer' } };
  emit('SIGNED_IN', signedIn);
  await tick();
  emit('TOKEN_REFRESHED', signedIn);
  await tick();
  for (const complete of completions) complete();
  await tick();
  assert.equal(reloaded, true);
  assert.equal(await isEntitled(), true);
});

test('an updated user is not rolled back when the older claim lands last', async () => {
  emit('SIGNED_OUT', null);
  await tick();
  entitled = false;
  const completions = [];
  claim = () => new Promise(resolve => {
    completions.push(() => { entitled = true; resolve({ data: true, error: null }); });
  });
  const published = [];
  const unsubscribe = onAuthChange(user => published.push(user?.email ?? null));
  const id = 'renaming-backer';
  emit('SIGNED_IN', { user: { id, email: 'old@example.com' } });
  await tick();
  emit('USER_UPDATED', { user: { id, email: 'new@example.com' } });
  await tick();
  assert.equal(completions.length, 2, 'both events claim');

  completions[1]();  // the updated user's claim finishes first
  await tick();
  assert.equal(getCurrentUser().email, 'new@example.com');

  completions[0]();  // the sign-in's slower claim lands after it
  await tick();
  assert.equal(getCurrentUser().email, 'new@example.com', 'the stale user must not be republished');
  assert.ok(!published.includes('old@example.com'), 'listeners must never see the stale user');
  unsubscribe();
});
