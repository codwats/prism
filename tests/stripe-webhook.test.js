import test from 'node:test';
import assert from 'node:assert/strict';
import { subscriptionRow } from '../netlify/edge-functions/lib/stripe-helpers.js';
// Skips without native TypeScript, like the checkout endpoint tests.
const handleEvent = process.features.typescript
  ? (await import('../netlify/edge-functions/stripe-webhook-edge.ts')).handleEvent
  : null;
const endpointTest = (name, fn) => test(name, { skip: !process.features.typescript &&'Needs Node with native TypeScript support' }, fn);

const env = {
  SUPABASE_URL: 'https://db.example', SUPABASE_SERVICE_ROLE_KEY: 'test-service-key', STRIPE_SECRET_KEY: 'test-stripe-key'
};
const CREATED = 1_700_000_000;
const sub = { id: 'sub_1', status: 'active', customer: 'cus_1', current_period_end: 1_800_000_000, cancel_at_period_end: false, items: { data: [{ price: { id: 'price_month' } }] } };

// customerRows: what stripe_customers returns; the Stripe fetch answers with `sub`.
async function deliver(t, event, customerRows = [{ user_id: 'u1' }]) {
  const requests = [];
  t.mock.method(globalThis, 'fetch', async (url, options = {}) => {
    requests.push({ url: String(url), options });
    if (String(url).includes('/stripe_customers?')) return Response.json(customerRows);
    if (String(url).startsWith('https://api.stripe.com/v1/subscriptions/')) return Response.json(sub);
    return new Response(null, { status: 201 });
  });
  t.mock.method(console, 'error', () => {});
  t.mock.method(console, 'log', () => {});
  const previous = globalThis.Deno;
  globalThis.Deno = { env: { get: key => env[key] } };
  t.after(() => { globalThis.Deno = previous; });
  await handleEvent({ id: 'evt_1', created: CREATED, ...event });
  return requests;
}

const writes = requests => requests.filter(r => r.options.method === 'POST' || r.options.method === 'PATCH');
const row = subscriptionRow(sub, 'u1', CREATED);

endpointTest('checkout.session.completed stores the customer, fetches the live subscription and upserts it', async t => {
  const requests = await deliver(t, { type: 'checkout.session.completed', data: { object: { client_reference_id: 'u1', customer: 'cus_1', subscription: 'sub_1' } } });
  assert.deepEqual(requests.map(r => `${r.options.method || 'GET'} ${r.url}`), [
    'POST https://db.example/rest/v1/stripe_customers',
    'GET https://api.stripe.com/v1/subscriptions/sub_1',
    'POST https://db.example/rest/v1/subscriptions',
    `PATCH https://db.example/rest/v1/subscriptions?user_id=eq.u1&updated_at=lt.${encodeURIComponent(row.updated_at)}`,
  ]);
  assert.deepEqual(JSON.parse(requests[0].options.body), { user_id: 'u1', stripe_customer_id: 'cus_1' });
  assert.equal(requests[1].options.headers.Authorization, 'Bearer test-stripe-key');
  assert.deepEqual(JSON.parse(requests[2].options.body), row);
});

for (const type of ['updated', 'deleted', 'paused', 'resumed']) {
  endpointTest(`customer.subscription.${type} upserts the row only if older than the event`, async t => {
    const requests = await deliver(t, { type: `customer.subscription.${type}`, data: { object: sub } });
    const [insert, update] = writes(requests);
    assert.deepEqual(JSON.parse(insert.options.body), row);
    assert.equal(update.options.method, 'PATCH');
    assert.match(update.url, new RegExp(`user_id=eq\\.u1&updated_at=lt\\.${encodeURIComponent(row.updated_at)}$`));
    assert.deepEqual(JSON.parse(update.options.body), row);
  });
}

endpointTest('a subscription event for an unknown customer writes nothing', async t => {
  const requests = await deliver(t, { type: 'customer.subscription.updated', data: { object: sub } }, []);
  assert.equal(writes(requests).length, 0);
});

endpointTest('an unhandled event type writes nothing', async t => {
  const requests = await deliver(t, { type: 'invoice.payment_failed', data: { object: {} } });
  assert.equal(requests.length, 0);
});
