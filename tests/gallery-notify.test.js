import test from 'node:test';
import assert from 'node:assert/strict';
// Same posture as commission-relay.test.js: the endpoint is TypeScript, so it
// runs only on a Node with native type stripping.
const handler = process.features.typescript
  ? (await import('../netlify/edge-functions/gallery-notify-edge.ts')).default
  : null;
const endpointTest = (name, fn) => test(name, { skip: !handler && 'Needs Node with native TypeScript support' }, fn);

const USER = '44444444-4444-4444-8444-444444444444';
const OTHER_USER = '55555555-5555-4555-8555-555555555555';
const ARTWORK = '33333333-3333-4333-8333-333333333333';
const CLAIM = '66666666-6666-4666-8666-666666666666';
const ADMINS = ['a1111111-1111-4111-8111-111111111111', 'a2222222-2222-4222-8222-222222222222'];
const ADMIN_EMAILS = { [ADMINS[0]]: 'admin-one@example.invalid', [ADMINS[1]]: 'admin-two@example.invalid' };
const USER_EMAIL = 'uploader@example.invalid';

const env = { SUPABASE_URL: 'https://db.example', SUPABASE_SERVICE_ROLE_KEY: 'test-service-key', RESEND_API_KEY: 'test-resend-key' };
const minutesAgo = n => new Date(Date.now() - n * 60 * 1000).toISOString();

function world(overrides = {}) {
  return {
    user: { id: USER, email: USER_EMAIL },
    artwork: { id: ARTWORK, title: 'Sol Ring — Night Market', type: 'alter', uploader_id: USER, status: 'pending', created_at: minutesAgo(1) },
    claim: { id: CLAIM, user_id: USER, status: 'pending', created_at: minutesAgo(1), artist: { name: 'Lu Ink' } },
    notices: [],
    admins: ADMINS,
    resendOk: true,
    env,
    ...overrides
  };
}

// A row matches a PostgREST query when every eq./gte. filter in the URL holds for it.
function matches(row, url) {
  if (!row) return false;
  for (const [key, value] of new URL(url).searchParams) {
    if (key === 'select') continue;
    const [op, ...rest] = value.split('.');
    const want = rest.join('.');
    if (op === 'eq' && String(row[key]) !== want) return false;
    if (op === 'gte' && !(row[key] >= want)) return false;
  }
  return true;
}

const originalDeno = globalThis.Deno;

async function send(t, body, w = world(), { method = 'POST', token = 'user-token' } = {}) {
  const requests = [];
  const claimed = [];
  t.mock.method(globalThis, 'fetch', async (input, options = {}) => {
    const url = String(input);
    requests.push({ url, options });
    if (url === 'https://db.example/auth/v1/user') return w.user ? Response.json(w.user) : new Response('{}', { status: 401 });
    if (url.startsWith('https://db.example/auth/v1/admin/users/')) {
      const email = ADMIN_EMAILS[url.split('/').pop()];
      return email ? Response.json({ email }) : new Response('{}', { status: 404 });
    }
    if (url.startsWith('https://db.example/rest/v1/gallery_artworks?')) return Response.json(matches(w.artwork, url) ? [w.artwork] : []);
    if (url.startsWith('https://db.example/rest/v1/gallery_artist_claims?')) return Response.json(matches(w.claim, url) ? [w.claim] : []);
    if (url.startsWith('https://db.example/rest/v1/gallery_review_notices?') && !options.method) return Response.json(w.notices.filter(n => matches(n, url)));
    // The ledger claim: a unique-key conflict (another request already claimed it) returns no row.
    if (url === 'https://db.example/rest/v1/gallery_review_notices') {
      const row = JSON.parse(options.body);
      if (w.ledgerTaken || w.notices.some(n => n.kind === row.kind && n.item_id === row.item_id)) return Response.json([], { status: 201 });
      claimed.push(row);
      return Response.json([row], { status: 201 });
    }
    if (url.startsWith('https://db.example/rest/v1/gallery_review_notices?') && options.method === 'DELETE') return new Response(null, { status: 204 });
    if (url.startsWith('https://db.example/rest/v1/gallery_admins?')) return Response.json(w.admins.map(user_id => ({ user_id })));
    if (url === 'https://api.resend.com/emails/batch') return w.resendOk ? Response.json({ id: 'em_1' }) : new Response('{"message":"nope"}', { status: 500 });
    throw new Error(`Unexpected request: ${url}`);
  });
  globalThis.Deno = { env: { get: key => w.env[key] } };
  t.after(() => { globalThis.Deno = originalDeno; });
  const headers = token ? { authorization: `Bearer ${token}` } : {};
  const response = await handler(new Request('https://prism.example/api/gallery-notify', {
    method, headers, body: method === 'POST' ? JSON.stringify(body) : undefined
  }));
  const text = await response.text();
  // Every path, success or refusal: no address may reach the browser.
  for (const email of [USER_EMAIL, ...Object.values(ADMIN_EMAILS)]) assert.ok(!text.includes(email), `${email} leaked`);
  return {
    status: response.status, text, requests, claimed,
    resend: requests.filter(r => r.url === 'https://api.resend.com/emails/batch'),
    ledgerWrites: requests.filter(r => r.url === 'https://db.example/rest/v1/gallery_review_notices' && r.options.method === 'POST'),
    ledgerDeletes: requests.filter(r => r.url.startsWith('https://db.example/rest/v1/gallery_review_notices?') && r.options.method === 'DELETE')
  };
}

// One batch call, one email per admin; `email` is the first.
const emails = res => JSON.parse(res.resend[0].options.body);
const email = res => emails(res)[0];

endpointTest('a new upload emails every admin once and writes the ledger', async t => {
  const res = await send(t, { kind: 'upload', id: ARTWORK });
  assert.equal(res.status, 204);
  assert.equal(res.resend.length, 1);
  const sent = email(res);
  assert.equal(sent.from, 'PRISM Gallery <gallery@relay.prismmtg.com>');
  assert.deepEqual(emails(res).map(e => e.to).sort(), Object.values(ADMIN_EMAILS).map(a => [a]).sort());
  assert.equal(sent.subject, 'New gallery upload to review');
  assert.equal(res.resend[0].options.headers.Authorization, 'Bearer test-resend-key');
  for (const body of [sent.text, sent.html]) {
    assert.ok(body.includes('alter'));
    assert.ok(body.includes('https://prismmtg.com/gallery.html?view=admin'));
  }
  assert.ok(sent.text.includes('Sol Ring — Night Market'));
  assert.equal(res.ledgerWrites.length, 1);
  assert.deepEqual(JSON.parse(res.ledgerWrites[0].options.body), { kind: 'upload', item_id: ARTWORK });
});

endpointTest('no admin sees another admin\'s address', async t => {
  const res = await send(t, { kind: 'upload', id: ARTWORK });
  for (const sent of emails(res)) {
    const others = Object.values(ADMIN_EMAILS).filter(a => !sent.to.includes(a));
    assert.equal(sent.to.length, 1);
    assert.equal(sent.cc, undefined);
    for (const other of others) assert.ok(!JSON.stringify(sent).includes(other), `${other} visible to ${sent.to}`);
  }
});

endpointTest('the ledger row is claimed before any email goes out', async t => {
  const res = await send(t, { kind: 'claim', id: CLAIM });
  const ledgerAt = res.requests.indexOf(res.ledgerWrites[0]);
  const sendAt = res.requests.indexOf(res.resend[0]);
  assert.ok(ledgerAt >= 0 && ledgerAt < sendAt);
  assert.match(res.ledgerWrites[0].options.headers.Prefer, /resolution=ignore-duplicates/);
  assert.match(res.ledgerWrites[0].options.headers.Prefer, /return=representation/);
});

endpointTest('a request that loses the ledger race is a 204 with no email', async t => {
  const res = await send(t, { kind: 'upload', id: ARTWORK }, world({ ledgerTaken: true }));
  assert.equal(res.status, 204);
  assert.equal(res.resend.length, 0);
});

endpointTest('a pending claim emails every admin with the artist name', async t => {
  const res = await send(t, { kind: 'claim', id: CLAIM });
  assert.equal(res.status, 204);
  const sent = email(res);
  assert.equal(sent.subject, 'New artist claim to review');
  assert.ok(sent.text.includes('Lu Ink'));
  assert.ok(sent.html.includes('Lu Ink'));
  assert.deepEqual(JSON.parse(res.ledgerWrites[0].options.body), { kind: 'claim', item_id: CLAIM });
});

for (const [name, body, w, opts] of [
  ['an unknown kind', { kind: 'like', id: ARTWORK }],
  ['a non-uuid id', { kind: 'upload', id: '1 OR 1=1' }],
  ['no body', null],
  ['no token', { kind: 'upload', id: ARTWORK }, world(), { token: '' }],
  ['an invalid session', { kind: 'upload', id: ARTWORK }, world({ user: null })],
  ['an upload that does not exist', { kind: 'upload', id: CLAIM }],
  ['an upload that is not the caller\'s', { kind: 'upload', id: ARTWORK }, world({ user: { id: OTHER_USER, email: USER_EMAIL } })],
  ['an upload that is no longer pending', { kind: 'upload', id: ARTWORK }, world({ artwork: { ...world().artwork, status: 'approved' } })],
  ['an upload older than 10 minutes', { kind: 'upload', id: ARTWORK }, world({ artwork: { ...world().artwork, created_at: minutesAgo(11) } })],
  ['an upload already notified', { kind: 'upload', id: ARTWORK }, world({ notices: [{ kind: 'upload', item_id: ARTWORK }] })],
  ['a claim that is not the caller\'s', { kind: 'claim', id: CLAIM }, world({ claim: { ...world().claim, user_id: OTHER_USER } })],
  ['a claim approved automatically', { kind: 'claim', id: CLAIM }, world({ claim: { ...world().claim, status: 'approved' } })],
  ['a stale claim', { kind: 'claim', id: CLAIM }, world({ claim: { ...world().claim, created_at: minutesAgo(11) } })],
  ['a claim already notified', { kind: 'claim', id: CLAIM }, world({ notices: [{ kind: 'claim', item_id: CLAIM }] })],
  ['no admins', { kind: 'upload', id: ARTWORK }, world({ admins: [] })],
]) {
  endpointTest(`${name} is a silent 204 with no email`, async t => {
    const res = await send(t, body, w, opts);
    assert.equal(res.status, 204);
    assert.equal(res.text, '');
    assert.equal(res.resend.length, 0);
    assert.equal(res.claimed.length, 0);
  });
}

endpointTest('the upload id and the claim id are checked against their own tables', async t => {
  // A claim id sent as an upload must not match the claim row.
  const res = await send(t, { kind: 'upload', id: CLAIM });
  assert.equal(res.resend.length, 0);
  assert.ok(res.requests.every(r => !r.url.includes('gallery_artist_claims')));
});

endpointTest('a Resend failure is a 502 and deletes the ledger row it claimed', async t => {
  t.mock.method(console, 'error', () => {});
  const res = await send(t, { kind: 'upload', id: ARTWORK }, world({ resendOk: false }));
  assert.equal(res.status, 502);
  assert.equal(res.resend.length, 1);
  assert.equal(res.ledgerDeletes.length, 1);
  const q = new URL(res.ledgerDeletes[0].url).searchParams;
  assert.equal(q.get('kind'), 'eq.upload');
  assert.equal(q.get('item_id'), `eq.${ARTWORK}`);
});

endpointTest('the subject is fixed by kind, so request fields cannot inject into it', async t => {
  const res = await send(t, { kind: 'upload', id: ARTWORK, subject: 'FREE MONEY', title: 'Injected' },
    world({ artwork: { ...world().artwork, title: 'Evil\r\nBcc: victim@example.invalid' } }));
  const sent = email(res);
  assert.equal(sent.subject, 'New gallery upload to review');
  assert.ok(!JSON.stringify(sent).includes('FREE MONEY'));
  assert.equal(sent.bcc, undefined);
});

endpointTest('the title and artist name are HTML-escaped', async t => {
  const res = await send(t, { kind: 'upload', id: ARTWORK },
    world({ artwork: { ...world().artwork, title: '<script>alert(1)</script> & "co"' } }));
  const sent = email(res);
  assert.ok(!sent.html.includes('<script>'));
  assert.ok(sent.html.includes('&lt;script&gt;alert(1)&lt;/script&gt; &amp; &quot;co&quot;'));

  const claim = await send(t, { kind: 'claim', id: CLAIM },
    world({ claim: { ...world().claim, artist: { name: '<img src=x onerror=alert(1)>' } } }));
  assert.ok(!email(claim).html.includes('<img'));
});

endpointTest('a non-POST method is refused upstream-free', async t => {
  const res = await send(t, null, world(), { method: 'GET' });
  assert.equal(res.status, 405);
  assert.equal(res.requests.length, 0);
});

endpointTest('missing env vars are a 503 that names them only in the log', async t => {
  const errors = [];
  t.mock.method(console, 'error', (...args) => errors.push(args.join(' ')));
  const res = await send(t, { kind: 'upload', id: ARTWORK }, world({ env: { ...env, RESEND_API_KEY: '' } }));
  assert.equal(res.status, 503);
  assert.equal(res.requests.length, 0);
  assert.ok(errors.some(e => e.includes('RESEND_API_KEY')));
  assert.ok(!res.text.includes('RESEND_API_KEY'));
});
