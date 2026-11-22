import test from 'node:test';
import assert from 'node:assert/strict';

// Pins each edge function's CORS preflight headers so the shared helper
// cannot drift from what each function sent before it was shared (#442).
const AUTH = 'Content-Type, Authorization';
const expected = {
  'moxfield-edge': ['Content-Type', 'GET, POST, OPTIONS'],
  'archidekt-edge': ['Content-Type', 'GET, POST, OPTIONS'],
  'deckcheck-edge': ['Content-Type', 'POST, OPTIONS'],
  'commandertemplate-edge': ['Content-Type', 'POST, OPTIONS'],
  'stripe-checkout-edge': [AUTH, 'POST, OPTIONS'],
  'stripe-portal-edge': [AUTH, 'POST, OPTIONS'],
  'commission-edge': [AUTH, 'POST, OPTIONS'],
  'gallery-artist-edge': [AUTH, 'POST, OPTIONS'],
  'gallery-notify-edge': [AUTH, 'POST, OPTIONS'],
};
const canRun = process.features.typescript;

for (const [name, [allowHeaders, allowMethods]] of Object.entries(expected)) {
  test(`${name} preflight CORS headers`, { skip: !canRun && 'Needs Node with native TypeScript support' }, async t => {
    const handler = (await import(`../netlify/edge-functions/${name}.ts`)).default;
    const previous = globalThis.Deno;
    t.after(() => { globalThis.Deno = previous; });
    for (const [context, origin, allowed] of [
      ['production', 'https://evil.example', 'https://prismmtg.com'],
      ['deploy-preview', 'https://preview.example', 'https://preview.example'],
    ]) {
      globalThis.Deno = { env: { get: key => (key === 'CONTEXT' ? context : undefined) } };
      const res = await handler(new Request('https://prism.example/api/x', { method: 'OPTIONS', headers: { origin } }));
      assert.equal(res.status, 204);
      assert.deepEqual(Object.fromEntries(res.headers), {
        'access-control-allow-origin': allowed,
        'access-control-allow-headers': allowHeaders,
        'access-control-allow-methods': allowMethods,
        vary: 'Origin',
      });
    }
  });
}
