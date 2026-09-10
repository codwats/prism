import test from 'node:test';
import assert from 'node:assert/strict';

test('sign-out during the startup claim cannot publish the restored account', async () => {
  let callback;
  let completeClaim;
  globalThis.localStorage = { getItem: () => null };
  globalThis.document = { getElementById: () => null };
  let session = { user: { id: 'departing-backer' } };
  const client = {
    auth: {
      getSession: async () => ({ data: { session } }),
      onAuthStateChange: cb => { callback = cb; },
    },
    rpc(name) {
      assert.equal(name, 'claim_backer_membership');
      const result = new Promise(resolve => { completeClaim = resolve; });
      result.abortSignal = () => result;
      return result;
    },
  };
  globalThis.window = {
    supabase: { createClient: () => client },
    location: { hash: '' },
    addEventListener() {},
  };
  const { startAuth, onAuthChange, getCurrentUser } = await import('../js/modules/auth.js');
  const published = [];
  onAuthChange(user => published.push(user));
  const boot = startAuth();
  await new Promise(resolve => setImmediate(resolve));
  assert.equal(typeof callback, 'function', 'auth must listen while claiming');
  session = null;
  callback('SIGNED_OUT', null);
  completeClaim({ data: true, error: null });
  await boot;
  await new Promise(resolve => setTimeout(resolve, 20));
  assert.equal(getCurrentUser(), null);
  assert.deepEqual(published, [null]);
});
