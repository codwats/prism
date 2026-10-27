import test from 'node:test';
import assert from 'node:assert/strict';

// An anonymous visitor's page-load init finds no SDK and must not cache that
// answer: the login click has to get a fresh init, or SIGNED_IN fires with
// no listener and the nav stays on Log In until a refresh.
test('anonymous visitor who signs in gets the nav flipped without a refresh', async () => {
  globalThis.localStorage = { getItem: () => null, setItem() {}, removeItem() {} };
  const head = { children: [], querySelector: () => null, appendChild: c => c };
  globalThis.document = { head, getElementById: () => null, querySelectorAll: () => [], createElement: () => ({ addEventListener() {} }) };
  globalThis.window = { location: { hash: '', origin: 'http://localhost', reload() {} }, addEventListener() {} };

  const { startAuth, ensureAuthReady, signIn, onAuthChange } = await import('../js/modules/auth.js');
  const published = [];
  onAuthChange(user => published.push(user?.id ?? null));
  await startAuth();

  // The SDK lands after page load, as the login click requests it.
  let callback = null;
  const user = { id: 'u1', email: 'a@b.c' };
  const rpcResult = Promise.resolve({ data: true, error: null });
  rpcResult.abortSignal = () => rpcResult;
  const client = {
    auth: {
      getSession: async () => ({ data: { session: null } }),
      onAuthStateChange: cb => { callback = cb; },
      signInWithPassword: async () => { callback?.('SIGNED_IN', { user }); return { data: { user }, error: null }; },
    },
    rpc: () => rpcResult,
  };
  window.supabase = { createClient: () => client };

  ensureAuthReady();
  await signIn('a@b.c', 'pw');
  await new Promise(resolve => setTimeout(resolve, 20));
  assert.equal(typeof callback, 'function', 'sign-in must be listened for');
  assert.ok(published.includes('u1'), `published: ${JSON.stringify(published)}`);
});
