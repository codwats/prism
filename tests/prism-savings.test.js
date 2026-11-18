import test from 'node:test';
import assert from 'node:assert/strict';
// The endpoint is TypeScript, so it runs only on a Node with native type stripping.
const mod = process.features.typescript
  ? await import('../netlify/edge-functions/prism-savings-edge.ts')
  : null;
const endpointTest = (name, fn) => test(name, { skip: !mod && 'Needs Node with native TypeScript support' }, fn);

const env = { SUPABASE_URL: 'https://db.example', SUPABASE_SERVICE_ROLE_KEY: 'test-service-key' };
const originalDeno = globalThis.Deno;

async function get(t, { rows, cards = [], scryStatus = 200, dbStatus = 200, environment = env }) {
  const requests = [];
  t.mock.method(globalThis, 'fetch', async (input, options = {}) => {
    const url = String(input);
    requests.push({ url, options });
    if (url.startsWith('https://db.example/rest/v1/rpc/site_card_savings')) return Response.json(rows, { status: dbStatus });
    if (url === 'https://api.scryfall.com/cards/collection') {
      const wanted = new Set(JSON.parse(options.body).identifiers.map(i => i.name.toLowerCase()));
      const data = cards.filter(c => wanted.has((c.card_faces?.[0]?.name ?? c.name).toLowerCase()));
      return Response.json({ data }, { status: scryStatus });
    }
    throw new Error(`Unexpected request: ${url}`);
  });
  globalThis.Deno = { env: { get: key => environment[key] } };
  t.after(() => { globalThis.Deno = originalDeno; });
  const response = await mod.default(new Request('https://prism.example/api/prism-savings'));
  return { status: response.status, body: response.status === 200 ? await response.json() : null, headers: response.headers, requests };
}

endpointTest('prices each saved copy at its Scryfall USD price and counts every copy', async t => {
  const res = await get(t, {
    rows: [
      { card_name: 'Sol Ring', saved_copies: 10 },
      { card_name: 'Delver of Secrets', saved_copies: 2 }, // stored by front face only
      { card_name: 'Unpriced Card', saved_copies: 3 },
      { card_name: 'Fable of the Mirror-Breaker // Reflection of Kiki-Jiki', saved_copies: 1 } // stored by full name
    ],
    cards: [
      { name: 'Sol Ring', prices: { usd: '1.50' } },
      { name: 'Delver of Secrets // Insectile Aberration', card_faces: [{ name: 'Delver of Secrets' }], prices: { usd: null, usd_foil: '4.00' } },
      { name: 'Unpriced Card', prices: { usd: null } },
      { name: 'Fable of the Mirror-Breaker // Reflection of Kiki-Jiki', card_faces: [{ name: 'Fable of the Mirror-Breaker' }], prices: { usd: '10.00' } }
    ]
  });
  assert.equal(res.status, 200);
  assert.deepEqual(res.body, { usd: 33, copies: 16 });
  // Scryfall only matches a double-faced card by its front face.
  assert.ok(JSON.parse(res.requests[1].options.body).identifiers.some(i => i.name === 'Fable of the Mirror-Breaker'));
  assert.match(res.headers.get('netlify-cdn-cache-control'), /durable/);
  assert.match(res.requests[0].url, /order=saved_copies\.desc/);
});

endpointTest('a Scryfall failure counts copies but leaves them unpriced', async t => {
  const res = await get(t, { rows: [{ card_name: 'Sol Ring', saved_copies: 4 }], cards: [{ name: 'Sol Ring', prices: { usd: '1' } }], scryStatus: 500 });
  assert.deepEqual(res.body, { usd: 0, copies: 4 });
});

endpointTest('batches 75 names per Scryfall request', async t => {
  const rows = Array.from({ length: 80 }, (_, i) => ({ card_name: `Card ${i}`, saved_copies: 1 }));
  const res = await get(t, { rows });
  const scry = res.requests.filter(r => r.url.includes('scryfall'));
  assert.deepEqual(scry.map(r => JSON.parse(r.options.body).identifiers.length), [75, 5]);
});

endpointTest('a database failure is a 502 and missing env is a 503, never cached', async t => {
  assert.equal((await get(t, { rows: {}, dbStatus: 500 })).status, 502);
  assert.equal((await get(t, { rows: [], environment: {} })).status, 503);
});
