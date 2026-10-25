import test from 'node:test';
import assert from 'node:assert/strict';
// Same posture as stripe-checkout.test.js: the endpoint is TypeScript, so it
// runs only on a Node with native type stripping.
const handler = process.features.typescript
  ? (await import('../netlify/edge-functions/commission-edge.ts')).default
  : null;
const endpointTest = (name, fn) => test(name, { skip: !handler && 'Needs Node with native TypeScript support' }, fn);

const ARTIST = '11111111-1111-4111-8111-111111111111';
const OTHER_ARTIST = '22222222-2222-4222-8222-222222222222';
const ARTWORK = '33333333-3333-4333-8333-333333333333';
const USER = '44444444-4444-4444-8444-444444444444';
const ARTIST_EMAIL = 'artist-private@example.invalid';
const REQUESTER_EMAIL = 'requester@example.invalid';
const MESSAGE = 'I would love a Sol Ring alter in your night-market style.';

const env = {
  SUPABASE_URL: 'https://db.example', SUPABASE_SERVICE_ROLE_KEY: 'test-service-key',
  RESEND_API_KEY: 'test-resend-key', TURNSTILE_SECRET_KEY: 'test-turnstile-secret'
};

function world(overrides = {}) {
  return {
    turnstile: true,
    user: { id: USER, email: REQUESTER_EMAIL, email_confirmed_at: '2026-01-01T00:00:00Z' },
    artist: { id: ARTIST, name: 'A. Okafor', user_id: '55555555-5555-4555-8555-555555555555', commissions_open: true },
    contact: { commission_email: ARTIST_EMAIL },
    artwork: { id: ARTWORK, title: 'Sol Ring — Night Market', image_path: 'u1/sol.png', artist_id: ARTIST, status: 'approved' },
    claimId: 'cs-1', // the claim RPC's answer: a ledger row id, or null at a limit
    resendOk: true,
    env,
    ...overrides
  };
}

async function send(t, body, w = world(), { method = 'POST', token = 'user-token' } = {}) {
  const requests = [];
  t.mock.method(globalThis, 'fetch', async (input, options = {}) => {
    const url = String(input);
    requests.push({ url, options });
    if (url === 'https://challenges.cloudflare.com/turnstile/v0/siteverify') return Response.json({ success: w.turnstile });
    if (url === 'https://db.example/auth/v1/user') return w.user ? Response.json(w.user) : new Response('{}', { status: 401 });
    if (url.startsWith('https://db.example/rest/v1/gallery_artists?')) return Response.json(w.artist && url.includes(`id=eq.${w.artist.id}`) ? [w.artist] : []);
    if (url.startsWith('https://db.example/rest/v1/gallery_artist_contacts?')) return Response.json(w.contact ? [w.contact] : []);
    if (url.startsWith('https://db.example/rest/v1/gallery_artworks?')) {
      const a = w.artwork;
      const match = a && url.includes(`id=eq.${a.id}`) && url.includes(`artist_id=eq.${a.artist_id}`) && a.status === 'approved';
      return Response.json(match ? [a] : []);
    }
    if (url === 'https://db.example/rest/v1/rpc/claim_gallery_commission_send') return Response.json(w.claimId);
    if (url.startsWith('https://db.example/rest/v1/gallery_commission_sends?')) return new Response(null, { status: 204 });
    if (url === 'https://api.resend.com/emails') {
      if (w.resendThrows) throw new TypeError('network down');
      return w.resendOk ? Response.json({ id: 'em_1' }) : new Response('{"message":"nope"}', { status: 500 });
    }
    throw new Error(`Unexpected request: ${url}`);
  });
  globalThis.Deno = { env: { get: key => w.env[key] } };
  t.after(() => { globalThis.Deno = originalDeno; });
  const headers = token ? { authorization: `Bearer ${token}` } : {};
  const response = await handler(new Request('https://prism.example/api/commission', {
    method, headers, body: method === 'POST' ? JSON.stringify(body) : undefined
  }));
  const text = await response.text();
  // Every path, success or error: neither address may reach the browser.
  assert.ok(!text.includes(ARTIST_EMAIL), 'artist address leaked');
  assert.ok(!text.includes(REQUESTER_EMAIL), 'requester address leaked');
  const called = prefix => requests.filter(r => r.url.startsWith(prefix));
  return {
    status: response.status, text, json: text ? JSON.parse(text) : null, requests,
    resend: called('https://api.resend.com/'),
    claims: called('https://db.example/rest/v1/rpc/claim_gallery_commission_send'),
    releases: requests.filter(r => r.url.startsWith('https://db.example/rest/v1/gallery_commission_sends?') && r.options.method === 'DELETE'),
    index: prefix => requests.findIndex(r => r.url.startsWith(prefix))
  };
}

const originalDeno = globalThis.Deno;
const valid = (extra = {}) => ({ artistId: ARTIST, message: MESSAGE, turnstileToken: 'ts-token', ...extra });


endpointTest('a valid request claims a ledger row, then relays once with reply_to the requester', async t => {
  const res = await send(t, valid());
  assert.equal(res.status, 200);
  assert.deepEqual(res.json, { ok: true });
  assert.equal(res.resend.length, 1);
  const email = JSON.parse(res.resend[0].options.body);
  assert.equal(email.from, 'PRISM Commissions <commissions@relay.prismmtg.com>');
  assert.deepEqual(email.to, [ARTIST_EMAIL]);
  assert.equal(email.reply_to, REQUESTER_EMAIL);
  assert.equal(email.subject, 'Commission request via PRISM');
  assert.ok(email.text.includes(MESSAGE));
  assert.equal(res.resend[0].options.headers.Authorization, 'Bearer test-resend-key');
  assert.equal(res.claims.length, 1);
  assert.deepEqual(JSON.parse(res.claims[0].options.body), { p_user_id: USER, p_artist_id: ARTIST, p_artwork_id: null });
  assert.ok(res.index('https://db.example/rest/v1/rpc/claim_gallery_commission_send') < res.index('https://api.resend.com/'),
    'the send must be claimed before it is emailed');
  assert.equal(res.releases.length, 0);
});

endpointTest('an artwork reference adds its database title, thumbnail and gallery link', async t => {
  const res = await send(t, valid({ artworkId: ARTWORK, subject: 'FREE MONEY', title: 'Injected' }));
  assert.equal(res.status, 200);
  const email = JSON.parse(res.resend[0].options.body);
  assert.equal(email.subject, 'Commission request via PRISM — Regarding: Sol Ring — Night Market');
  for (const body of [email.text, email.html]) {
    assert.ok(body.includes('https://db.example/storage/v1/object/public/gallery-art/u1/sol.png'));
    assert.ok(body.includes(`https://prismmtg.com/gallery.html?art=${ARTWORK}`));
  }
  assert.equal(JSON.parse(res.claims[0].options.body).p_artwork_id, ARTWORK);
});

endpointTest('requester text is HTML-escaped in the HTML body', async t => {
  const res = await send(t, valid({ message: '<script>alert(1)</script> & a long enough message "here"' }));
  assert.equal(res.status, 200);
  const email = JSON.parse(res.resend[0].options.body);
  assert.ok(!email.html.includes('<script>'));
  assert.ok(email.html.includes('&lt;script&gt;alert(1)&lt;/script&gt; &amp; a long enough message &quot;here&quot;'));
});

for (const [name, body] of [
  ['a short message', valid({ message: '   too short         ' })],
  ['a long message', valid({ message: 'x'.repeat(2001) })],
  ['a non-uuid artist id', valid({ artistId: 'okafor' })],
  ['a non-uuid artwork id', valid({ artworkId: '1 OR 1=1' })],
  ['no Turnstile token', valid({ turnstileToken: '' })],
  ['a non-string message', valid({ message: 12345 })]
]) {
  endpointTest(`${name} is a 400 that reaches nothing upstream`, async t => {
    const res = await send(t, body);
    assert.equal(res.status, 400);
    assert.equal(res.requests.length, 0);
  });
}

endpointTest('a non-POST method is refused', async t => {
  const res = await send(t, null, world(), { method: 'GET' });
  assert.equal(res.status, 405);
  assert.equal(res.requests.length, 0);
});

endpointTest('a failed Turnstile check is a 403 before auth or Resend', async t => {
  const res = await send(t, valid(), world({ turnstile: false }));
  assert.equal(res.status, 403);
  assert.equal(res.requests.length, 1);
  assert.equal(res.resend.length, 0);
});

endpointTest('a missing or invalid session is a 401 with no Resend call', async t => {
  for (const [w, opts] of [[world(), { token: null }], [world({ user: null }), {}]]) {
    const res = await send(t, valid(), w, opts);
    assert.equal(res.status, 401);
    assert.equal(res.resend.length, 0);
    t.mock.restoreAll();
  }
});

endpointTest('an unconfirmed requester email is a 401', async t => {
  const res = await send(t, valid(), world({ user: { id: USER, email: REQUESTER_EMAIL, email_confirmed_at: null } }));
  assert.equal(res.status, 401);
  assert.equal(res.resend.length, 0);
});

endpointTest('an unknown or unclaimed artist is a 404', async t => {
  for (const w of [world({ artist: null }), world({ artist: { ...world().artist, user_id: null } })]) {
    const res = await send(t, valid(), w);
    assert.equal(res.status, 404);
    assert.equal(res.resend.length, 0);
    t.mock.restoreAll();
  }
});

endpointTest('closed commissions or no contacts row is a 409', async t => {
  for (const w of [world({ artist: { ...world().artist, commissions_open: false } }), world({ contact: null })]) {
    const res = await send(t, valid(), w);
    assert.equal(res.status, 409);
    assert.equal(res.resend.length, 0);
    t.mock.restoreAll();
  }
});

endpointTest('an artwork belonging to another artist, or not approved, is rejected', async t => {
  for (const artwork of [{ ...world().artwork, artist_id: OTHER_ARTIST }, { ...world().artwork, status: 'pending' }]) {
    const res = await send(t, valid({ artworkId: ARTWORK }), world({ artwork }));
    assert.equal(res.status, 404);
    assert.equal(res.resend.length, 0);
    t.mock.restoreAll();
  }
});

endpointTest('a refused claim (a limit hit) is a 429 that sends no email', async t => {
  const res = await send(t, valid(), world({ claimId: null }));
  assert.equal(res.status, 429);
  assert.equal(res.json.error, 'You’ve reached today’s commission limit. Try again tomorrow.');
  assert.equal(res.resend.length, 0);
  assert.equal(res.releases.length, 0);
});

endpointTest('a Resend failure releases the claimed row and is a 502', async t => {
  const res = await send(t, valid(), world({ resendOk: false }));
  assert.equal(res.status, 502);
  assert.equal(res.releases.length, 1);
  assert.match(res.releases[0].url, /gallery_commission_sends\?id=eq\.cs-1$/);
});

endpointTest('a Resend fetch that throws still releases the claimed row and is a 502', async t => {
  t.mock.method(console, 'error', () => {});
  const res = await send(t, valid(), world({ resendThrows: true }));
  assert.equal(res.status, 502);
  assert.equal(res.releases.length, 1);
  assert.match(res.releases[0].url, /gallery_commission_sends\?id=eq\.cs-1$/);
});

endpointTest('missing env is a 503 that names the variables in the log only', async t => {
  const errors = [];
  t.mock.method(console, 'error', (...args) => errors.push(args.join(' ')));
  const res = await send(t, valid(), world({ env: { ...env, RESEND_API_KEY: '', TURNSTILE_SECRET_KEY: undefined } }));
  assert.equal(res.status, 503);
  assert.equal(res.requests.length, 0);
  assert.ok(errors.some(e => e.includes('RESEND_API_KEY') && e.includes('TURNSTILE_SECRET_KEY')));
  assert.ok(!res.text.includes('RESEND_API_KEY'));
});
