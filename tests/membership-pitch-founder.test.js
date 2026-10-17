import test from 'node:test';
import assert from 'node:assert/strict';

// Own file: auth.js and billing.js keep module-level state, so this boot must
// not share a module graph with other tests.
test('a signed-in Founder on index.html gets the included notice, never a price or the join button', async () => {
  const container = { innerHTML: '', querySelector: () => null };
  globalThis.localStorage = { getItem: key => (key.endsWith('-auth-token') ? '{}' : null), setItem() {}, removeItem() {} };
  globalThis.document = {
    getElementById: () => null,
    querySelector: selector => (selector === '[data-membership-pitch]' ? container : null),
    querySelectorAll: () => [],
  };
  const query = {
    select: () => query,
    eq: () => query,
    order: async () => ({ data: [], error: null }),
    maybeSingle: async () => ({ data: { value: true }, error: null }),
  };
  const client = {
    auth: {
      getSession: async () => ({ data: { session: { user: { id: 'founder' } } } }),
      onAuthStateChange() {},
    },
    rpc(name) {
      const answers = { claim_backer_membership: false, is_entitled: true };
      assert.ok(name in answers, `unexpected rpc ${name}`);
      const result = Promise.resolve({ data: answers[name], error: null });
      result.abortSignal = () => result;
      return result;
    },
    from: () => query,
  };
  globalThis.window = {
    supabase: { createClient: () => client },
    location: { hash: '' },
    addEventListener() {},
  };

  const { startAuth } = await import('../js/modules/auth.js');
  const { initMembershipPitch } = await import('../js/modules/membership.js');
  initMembershipPitch();
  assert.equal(container.innerHTML, '', 'nothing paints before auth resolves');
  await startAuth();
  await new Promise(resolve => setTimeout(resolve, 20));

  assert.match(container.innerHTML, /Membership is included/);
  assert.doesNotMatch(container.innerHTML, /\$|\bUSD\b|Membership adds|Join for|build\.html#membership/);
});
