import test from 'node:test';
import assert from 'node:assert/strict';

// An invite link (#332) lands with `#access_token=…&type=invite`. The SDK
// consumes and clears that hash while it starts, so the landing must be read
// before the client exists — then open the set-new-password view.
test('an invite link opens the set-new-password view, even after the SDK clears the hash', async t => {
  t.mock.method(console, 'error', () => {}); // the cloud sync after landing has no tables here
  const el = () => ({ style: {}, attrs: {}, hidden: true, setAttribute(k, v) { this.attrs[k] = v; } });
  const els = { 'auth-dialog': el(), 'auth-recovery-view': el(), 'auth-login-view': el(), 'auth-dialog-title': el(), 'recovery-intro': el() };
  globalThis.localStorage = { getItem: () => null };
  globalThis.document = { getElementById: id => els[id] || null, querySelectorAll: () => [] };
  const session = { user: { id: 'invited-artist', email: 'kay@example.invalid' } };
  const client = {
    auth: { getSession: async () => ({ data: { session } }), onAuthStateChange() {} },
    rpc() { const r = Promise.resolve({ data: false, error: null }); r.abortSignal = () => r; return r; },
    from() { throw new Error('no tables in this test'); },
  };
  globalThis.window = {
    supabase: { createClient: () => { globalThis.window.location.hash = ''; return client; } },
    location: { hash: '#access_token=abc&refresh_token=def&type=invite' },
    addEventListener() {},
  };
  const { startAuth } = await import('../js/modules/auth.js');
  await startAuth();
  assert.equal(els['auth-dialog'].attrs.open, '');
  assert.equal(els['auth-recovery-view'].style.display, '');
  assert.match(els['recovery-intro'].textContent, /invited/i);
});
