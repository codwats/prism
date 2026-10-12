import test from 'node:test';
import assert from 'node:assert/strict';
import { linkIcon } from '../js/modules/gallery-links.js';
// Same posture as commission-relay.test.js: the endpoint is TypeScript, so it
// runs only on a Node with native type stripping.
const handler = process.features.typescript
  ? (await import('../netlify/edge-functions/gallery-artist-edge.ts')).default
  : null;
const endpointTest = (name, fn) => test(name, { skip: !handler && 'Needs Node with native TypeScript support' }, fn);

const ADMIN = '44444444-4444-4444-8444-444444444444';
const NEW_ARTIST = '11111111-1111-4111-8111-111111111111';

const env = { SUPABASE_URL: 'https://db.example', SUPABASE_SERVICE_ROLE_KEY: 'test-service-key' };

function world(overrides = {}) {
  return {
    user: { id: ADMIN, email: 'admin@example.invalid' }, isAdmin: true, insertOk: true, contactsOk: true,
    invite: { status: 200, body: { id: 'new-user' } },
    stored: { artist: { id: NEW_ARTIST, user_id: null }, invitedEmail: 'kay@example.invalid' },
    env, ...overrides
  };
}

const originalDeno = globalThis.Deno;

async function send(t, body, w = world(), { method = 'POST', token = 'admin-token' } = {}) {
  const requests = [];
  t.mock.method(globalThis, 'fetch', async (input, options = {}) => {
    const url = String(input);
    requests.push({ url, options });
    if (url === 'https://db.example/auth/v1/user') return w.user ? Response.json(w.user) : new Response('{}', { status: 401 });
    if (url === 'https://db.example/rest/v1/rpc/is_gallery_admin') return Response.json(w.isAdmin);
    if (url.startsWith('https://db.example/auth/v1/invite')) return Response.json(w.invite.body, { status: w.invite.status });
    if (url.startsWith('https://db.example/rest/v1/gallery_artist_contacts')) {
      if (options.method === 'POST') return new Response(null, { status: w.contactsOk ? 201 : 500 });
      return Response.json(w.stored.invitedEmail === undefined ? [] : [{ invited_email: w.stored.invitedEmail }]);
    }
    if (url.startsWith('https://db.example/rest/v1/gallery_artists') && (options.method || 'GET') === 'GET') {
      return Response.json(w.stored.artist ? [w.stored.artist] : []);
    }
    if (url.startsWith('https://db.example/rest/v1/gallery_artists')) {
      return w.insertOk ? Response.json([{ id: NEW_ARTIST }], { status: 201 }) : new Response('{"message":"nope"}', { status: 500 });
    }
    throw new Error(`Unexpected request: ${url}`);
  });
  globalThis.Deno = { env: { get: key => w.env[key] } };
  t.after(() => { globalThis.Deno = originalDeno; });
  const headers = token ? { authorization: `Bearer ${token}` } : {};
  const response = await handler(new Request('https://prism.example/api/gallery-artist', {
    method, headers, body: method === 'POST' ? JSON.stringify(body) : undefined
  }));
  const text = await response.text();
  return {
    status: response.status, json: text ? JSON.parse(text) : null, text, requests,
    inserts: requests.filter(r => r.url.startsWith('https://db.example/rest/v1/gallery_artists?') && r.options.method === 'POST'),
    invites: requests.filter(r => r.url.startsWith('https://db.example/auth/v1/invite'))
  };
}

endpointTest('an admin creates an artist page and gets its link back, with no invite', async t => {
  const res = await send(t, {
    name: '  Kay Brush  ', bio: 'Paints tokens.', avatarUrl: 'https://img.example/k.png', isPartner: true,
    links: [{ label: 'Site', href: 'https://kay.example' }, { label: '', href: 'https://www.instagram.com/kay' }]
  });
  assert.equal(res.status, 200);
  assert.deepEqual(res.json, { artistId: NEW_ARTIST, url: `https://prismmtg.com/gallery.html?artist=${NEW_ARTIST}`, invite: 'none' });
  assert.equal(res.inserts.length, 1);
  const insert = res.inserts[0];
  assert.equal(insert.options.method, 'POST');
  assert.equal(insert.options.headers.Authorization, 'Bearer test-service-key');
  assert.deepEqual(JSON.parse(insert.options.body), {
    name: 'Kay Brush', bio: 'Paints tokens.', avatar_url: 'https://img.example/k.png', is_partner: true,
    links: [
      { label: 'Site', icon: 'globe', href: 'https://kay.example' },
      { label: 'instagram.com', icon: 'instagram', family: 'brands', href: 'https://www.instagram.com/kay' }
    ]
  });
});

endpointTest('only a name is required; the rest defaults to empty', async t => {
  const res = await send(t, { name: 'Lu Ink' }, world({ env: { ...env, SITE_URL: 'http://localhost:3456' } }));
  assert.equal(res.status, 200);
  assert.equal(res.json.url, `http://localhost:3456/gallery.html?artist=${NEW_ARTIST}`);
  assert.deepEqual(JSON.parse(res.inserts[0].options.body), { name: 'Lu Ink', bio: '', avatar_url: null, is_partner: false, links: [] });
});

endpointTest('the admin check runs as the caller, with their token', async t => {
  const res = await send(t, { name: 'Lu Ink' });
  const rpc = res.requests.find(r => r.url === 'https://db.example/rest/v1/rpc/is_gallery_admin');
  assert.equal(rpc.options.headers.Authorization, 'Bearer admin-token');
});

endpointTest('a signed-in non-admin is a 403 that inserts nothing', async t => {
  const res = await send(t, { name: 'Lu Ink' }, world({ isAdmin: false }));
  assert.equal(res.status, 403);
  assert.equal(res.inserts.length, 0);
});

endpointTest('no token or an invalid session is a 401 that inserts nothing', async t => {
  for (const [w, opts] of [[world(), { token: null }], [world({ user: null }), {}]]) {
    const res = await send(t, { name: 'Lu Ink' }, w, opts);
    assert.equal(res.status, 401);
    assert.equal(res.inserts.length, 0);
    t.mock.restoreAll();
  }
});

for (const [name, body] of [
  ['no name', { bio: 'x' }],
  ['a blank name', { name: '   ' }],
  ['a name over 80 characters', { name: 'x'.repeat(81) }],
  ['a non-string bio', { name: 'Lu', bio: 5 }],
  ['links that are not an array', { name: 'Lu', links: 'https://lu.example' }],
  ['an http link', { name: 'Lu', links: [{ label: 'Lu', href: 'http://lu.example' }] }],
  ['a javascript: link', { name: 'Lu', links: [{ label: 'Lu', href: 'javascript:alert(1)' }] }],
  ['a link with no href', { name: 'Lu', links: [{ label: 'Lu' }] }],
  ['an http avatar', { name: 'Lu', avatarUrl: 'http://img.example/a.png' }],
  ['a non-boolean partner flag', { name: 'Lu', isPartner: 'yes' }],
  ['a non-object body', 'Lu'],
]) {
  endpointTest(`${name} is a 400 that inserts nothing`, async t => {
    const res = await send(t, body);
    assert.equal(res.status, 400);
    assert.equal(res.inserts.length, 0);
  });
}

const EMAIL = 'kay@example.invalid';

endpointTest('with an email: artist, then contacts, then the invite to their page, as the service role', async t => {
  const res = await send(t, { name: 'Kay Brush', email: `  ${EMAIL} ` });
  assert.equal(res.status, 200);
  assert.deepEqual(res.json, { artistId: NEW_ARTIST, url: `https://prismmtg.com/gallery.html?artist=${NEW_ARTIST}`, invite: 'sent' });
  const order = res.requests.map(r => r.url).filter(u => !u.includes('/auth/v1/user') && !u.includes('is_gallery_admin'));
  assert.equal(order.length, 3);
  assert.ok(order[0].startsWith('https://db.example/rest/v1/gallery_artists?'));
  assert.ok(order[1].startsWith('https://db.example/rest/v1/gallery_artist_contacts'));
  assert.ok(order[2].startsWith('https://db.example/auth/v1/invite'));
  const contacts = res.requests.find(r => r.url.startsWith('https://db.example/rest/v1/gallery_artist_contacts'));
  assert.equal(contacts.options.headers.Authorization, 'Bearer test-service-key');
  assert.deepEqual(JSON.parse(contacts.options.body), { artist_id: NEW_ARTIST, invited_email: EMAIL, commission_email: EMAIL });
  const invite = res.invites[0];
  assert.equal(invite.options.method, 'POST');
  assert.equal(invite.options.headers.Authorization, 'Bearer test-service-key');
  assert.equal(invite.options.headers.apikey, 'test-service-key');
  assert.equal(JSON.parse(invite.options.body).email, EMAIL);
  assert.equal(new URL(invite.url).searchParams.get('redirect_to'), `https://prismmtg.com/gallery.html?artist=${NEW_ARTIST}`);
  assert.ok(!res.text.includes(EMAIL));
});

endpointTest('the invite redirects to SITE_URL when it is set', async t => {
  const res = await send(t, { name: 'Kay', email: EMAIL }, world({ env: { ...env, SITE_URL: 'http://localhost:3456' } }));
  assert.equal(new URL(res.invites[0].url).searchParams.get('redirect_to'), `http://localhost:3456/gallery.html?artist=${NEW_ARTIST}`);
});

for (const [shape, body] of [
  ['error_code', { code: 422, error_code: 'email_exists', msg: 'A user with this email address has already been registered' }],
  ['code', { code: 'email_exists', message: 'Email address already exists' }],
  ['msg only', { code: 422, msg: 'A user with this email address has already been registered' }],
]) {
  endpointTest(`an email that already has an account is 'existing_account' (${shape}), artist kept`, async t => {
    const res = await send(t, { name: 'Kay', email: EMAIL }, world({ invite: { status: 422, body } }));
    assert.equal(res.status, 200);
    assert.equal(res.json.invite, 'existing_account');
    assert.equal(res.json.artistId, NEW_ARTIST);
    assert.ok(!res.text.includes(EMAIL));
  });
}

endpointTest("any other invite error is 'failed', logged by status only, artist kept", async t => {
  const errors = [];
  t.mock.method(console, 'error', (...args) => errors.push(args.join(' ')));
  const res = await send(t, { name: 'Kay', email: EMAIL }, world({ invite: { status: 500, body: { msg: `smtp down for ${EMAIL}` } } }));
  assert.equal(res.status, 200);
  assert.equal(res.json.invite, 'failed');
  assert.equal(res.json.artistId, NEW_ARTIST);
  assert.ok(errors.some(e => e.includes('500')));
  assert.ok(!errors.some(e => e.includes(EMAIL)));
  assert.ok(!res.text.includes(EMAIL));
});

// Not 'failed': Resend needs the stored email, so 'failed' would point the admin at a button that can't work.
endpointTest("a failed contacts insert is 'email_not_saved' and sends no invite, artist kept", async t => {
  t.mock.method(console, 'error', () => {});
  const res = await send(t, { name: 'Kay', email: EMAIL }, world({ contactsOk: false }));
  assert.equal(res.status, 200);
  assert.equal(res.json.invite, 'email_not_saved');
  assert.equal(res.json.artistId, NEW_ARTIST);
  assert.equal(res.invites.length, 0);
  assert.ok(!res.text.includes(EMAIL));
});

endpointTest('no email: no contacts row and no invite', async t => {
  const res = await send(t, { name: 'Kay' });
  assert.equal(res.json.invite, 'none');
  assert.equal(res.invites.length, 0);
  assert.ok(!res.requests.some(r => r.url.includes('gallery_artist_contacts')));
});

for (const email of ['not-an-email', 'a@b', 5, 'a b@c.d']) {
  endpointTest(`a bad email (${email}) is a 400 that inserts nothing`, async t => {
    const res = await send(t, { name: 'Kay', email });
    assert.equal(res.status, 400);
    assert.equal(res.inserts.length, 0);
  });
}

endpointTest('resend re-sends to the stored invited email', async t => {
  const res = await send(t, { artistId: NEW_ARTIST, resend: true });
  assert.equal(res.status, 200);
  assert.equal(res.json.invite, 'sent');
  assert.equal(res.inserts.length, 0);
  assert.equal(JSON.parse(res.invites[0].options.body).email, EMAIL);
  assert.equal(new URL(res.invites[0].url).searchParams.get('redirect_to'), `https://prismmtg.com/gallery.html?artist=${NEW_ARTIST}`);
  assert.ok(!res.text.includes(EMAIL));
});

endpointTest('resend for an unknown artist is a 404', async t => {
  for (const artistId of [NEW_ARTIST, 'not-a-uuid']) {
    const res = await send(t, { artistId, resend: true }, world({ stored: { artist: null } }));
    assert.equal(res.status, 404);
    assert.equal(res.invites.length, 0);
    t.mock.restoreAll();
  }
});

endpointTest('resend for a claimed artist, or one with no invited email, is a 409', async t => {
  for (const stored of [{ artist: { id: NEW_ARTIST, user_id: ADMIN }, invitedEmail: EMAIL }, { artist: { id: NEW_ARTIST, user_id: null } }, { artist: { id: NEW_ARTIST, user_id: null }, invitedEmail: null }]) {
    const res = await send(t, { artistId: NEW_ARTIST, resend: true }, world({ stored }));
    assert.equal(res.status, 409);
    assert.equal(res.invites.length, 0);
    assert.ok(!res.text.includes(EMAIL));
    t.mock.restoreAll();
  }
});

endpointTest('resend by a non-admin is a 403', async t => {
  const res = await send(t, { artistId: NEW_ARTIST, resend: true }, world({ isAdmin: false }));
  assert.equal(res.status, 403);
  assert.equal(res.invites.length, 0);
});

endpointTest('a failed insert is a 500', async t => {
  t.mock.method(console, 'error', () => {});
  const res = await send(t, { name: 'Lu Ink' }, world({ insertOk: false }));
  assert.equal(res.status, 500);
});

endpointTest('a failed read during resend is a 500 that talks about the invite, not creating the page', async t => {
  t.mock.method(console, 'error', () => {});
  const w = world();
  const res = await send(t, { artistId: NEW_ARTIST, resend: true }, { ...w, stored: { get artist() { throw new Error('db down'); } } });
  assert.equal(res.status, 500);
  assert.match(res.json.error, /invite/i);
  assert.doesNotMatch(res.json.error, /created/i);
});

endpointTest('a non-POST method is refused', async t => {
  const res = await send(t, null, world(), { method: 'GET' });
  assert.equal(res.status, 405);
  assert.equal(res.requests.length, 0);
});

endpointTest('missing env is a 503 that names the variables in the log only', async t => {
  const errors = [];
  t.mock.method(console, 'error', (...args) => errors.push(args.join(' ')));
  const res = await send(t, { name: 'Lu Ink' }, world({ env: { SUPABASE_URL: 'https://db.example' } }));
  assert.equal(res.status, 503);
  assert.equal(res.requests.length, 0);
  assert.ok(errors.some(e => e.includes('SUPABASE_SERVICE_ROLE_KEY')));
  assert.ok(!JSON.stringify(res.json).includes('SUPABASE_SERVICE_ROLE_KEY'));
});

test('link icons: brand icons for known hosts, globe otherwise', () => {
  assert.deepEqual(linkIcon('https://www.instagram.com/kay'), { icon: 'instagram', family: 'brands' });
  assert.deepEqual(linkIcon('https://x.com/kay'), { icon: 'x-twitter', family: 'brands' });
  assert.deepEqual(linkIcon('https://kay.artstation.com'), { icon: 'artstation', family: 'brands' });
  assert.deepEqual(linkIcon('https://kay.example'), { icon: 'globe' });
  assert.deepEqual(linkIcon('https://notinstagram.com'), { icon: 'globe' });
});
