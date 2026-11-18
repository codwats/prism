import test from 'node:test';
import assert from 'node:assert/strict';
// The endpoint is TypeScript, so it runs only on a Node with native type stripping.
const mod = process.features.typescript
  ? await import('../netlify/edge-functions/prism-savings-edge.ts')
  : null;
const endpointTest = (name, fn) => test(name, { skip: !mod && 'Needs Node with native TypeScript support' }, fn);

const env = { SUPABASE_URL: 'https://db.example', SUPABASE_SERVICE_ROLE_KEY: 'test-service-key' };
const originalDeno = globalThis.Deno;

async function get(t, { rows, cards = [], scryStatus = 200, dbStatus = 200, environment = env, stored, waitUntil }) {
  const requests = [];
  const db = { row: stored };
  t.mock.method(globalThis, 'fetch', async (input, options = {}) => {
    const url = String(input);
    requests.push({ url, options });
    if (url.startsWith('https://db.example/rest/v1/rpc/site_card_savings')) return Response.json(rows, { status: dbStatus });
    if (url.startsWith('https://db.example/rest/v1/app_config?') && !options.method) return Response.json(db.row ? [{ value: db.row }] : []);
    if (url === 'https://db.example/rest/v1/app_config' && options.method === 'POST') { db.row = JSON.parse(options.body).value; return new Response(null, { status: 201 }); }
    if (url.startsWith('https://db.example/rest/v1/app_config?') && options.method === 'DELETE') { db.row = undefined; return new Response(null, { status: 204 }); }
    if (url === 'https://api.scryfall.com/cards/collection') {
      const wanted = new Set(JSON.parse(options.body).identifiers.map(i => i.name.toLowerCase()));
      const data = cards.filter(c => wanted.has((c.card_faces?.[0]?.name ?? c.name).toLowerCase()));
      return Response.json({ data }, { status: scryStatus });
    }
    throw new Error(`Unexpected request: ${url}`);
  });
  globalThis.Deno = { env: { get: key => environment[key] } };
  t.after(() => { globalThis.Deno = originalDeno; });
  const pending = [];
  const context = waitUntil ? { waitUntil: p => pending.push(p) } : undefined;
  const response = await mod.default(new Request('https://prism.example/api/prism-savings'), context);
  const body = response.status === 200 ? await response.json() : null;
  await Promise.all(pending);
  return { status: response.status, body, headers: response.headers, requests, db, pending };
}

const hoursAgo = n => new Date(Date.now() - n * 3600 * 1000).toISOString();
const scryCalls = res => res.requests.filter(r => r.url.includes('scryfall'));

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
  assert.equal(res.db.row.usd, 33, 'the fresh total is stored for the next visitor');
  // Scryfall only matches a double-faced card by its front face.
  assert.ok(JSON.parse(scryCalls(res)[0].options.body).identifiers.some(i => i.name === 'Fable of the Mirror-Breaker'));
  assert.ok(res.requests.some(r => /rpc\/site_card_savings\?order=saved_copies\.desc/.test(r.url)));
});

endpointTest('a Scryfall failure counts copies but leaves them unpriced', async t => {
  const res = await get(t, { rows: [{ card_name: 'Sol Ring', saved_copies: 4 }], cards: [{ name: 'Sol Ring', prices: { usd: '1' } }], scryStatus: 500 });
  assert.deepEqual(res.body, { usd: 0, copies: 4 });
});

endpointTest('batches 75 names per Scryfall request', async t => {
  const rows = Array.from({ length: 80 }, (_, i) => ({ card_name: `Card ${i}`, saved_copies: 1 }));
  const res = await get(t, { rows });
  assert.deepEqual(scryCalls(res).map(r => JSON.parse(r.options.body).identifiers.length), [75, 5]);
});

endpointTest('a stored total under a day old is served without touching Scryfall or the aggregate', async t => {
  const res = await get(t, { rows: [], stored: { usd: 500, copies: 40, computed_at: hoursAgo(3) } });
  assert.deepEqual(res.body, { usd: 500, copies: 40 });
  assert.equal(res.requests.length, 1);
});

endpointTest('a stale total is served at once and rebuilt in the background', async t => {
  const res = await get(t, {
    rows: [{ card_name: 'Sol Ring', saved_copies: 4 }], cards: [{ name: 'Sol Ring', prices: { usd: '2' } }],
    stored: { usd: 500, copies: 40, computed_at: hoursAgo(30) }, waitUntil: true,
  });
  assert.deepEqual(res.body, { usd: 500, copies: 40 });
  assert.equal(res.pending.length, 1);
  assert.equal(res.db.row.usd, 8, 'background rebuild stored the new total');
  // The old total was re-stamped before the rebuild, so concurrent visitors don't start another.
  const writes = res.requests.filter(r => r.options.method === 'POST' && r.url.endsWith('/app_config'));
  assert.equal(JSON.parse(writes[0].options.body).value.usd, 500);
});

endpointTest('a failed rebuild puts the old total back so the next request retries', async t => {
  const stored = { usd: 500, copies: 40, computed_at: hoursAgo(30) };
  const res = await get(t, { rows: {}, dbStatus: 500, stored: { ...stored } });
  assert.equal(res.status, 502);
  assert.deepEqual(res.db.row, stored);
});

endpointTest('a failed first build stores nothing; missing env is a 503', async t => {
  const res = await get(t, { rows: {}, dbStatus: 500 });
  assert.equal(res.status, 502);
  assert.equal(res.db.row, undefined);
  assert.equal((await get(t, { rows: [], environment: {} })).status, 503);
});
