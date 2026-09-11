import test from 'node:test';
import assert from 'node:assert/strict';
// Older supported Node versions run the JS suite; native TypeScript support
// additionally exercises the real Netlify endpoint without a transpiler.
const handler = process.features.typescript
  ? (await import('../netlify/edge-functions/stripe-checkout-edge.ts')).default
  : null;
const endpointTest = (name, fn) => test(name, { skip: !handler && 'Needs Node with native TypeScript support' }, fn);

const env = {
  SUPABASE_URL: 'https://db.example', SUPABASE_SERVICE_ROLE_KEY: 'test-service-key',
  STRIPE_SECRET_KEY: 'test-stripe-key', STRIPE_PRICE_ID: 'price_month', STRIPE_ANNUAL_PRICE_ID: 'price_year'
};

async function checkout(t, body, annualPrice = 'price_year') {
  const requests = [];
  t.mock.method(globalThis, 'fetch', async (url, options = {}) => {
    requests.push({ url: String(url), options });
    if (String(url).endsWith('/auth/v1/user')) return Response.json({ id: 'u1' });
    if (String(url).includes('/stripe_customers?')) return Response.json([{ stripe_customer_id: 'cus_existing' }]);
    if (String(url) === 'https://api.stripe.com/v1/checkout/sessions') return Response.json({ url: 'https://checkout.stripe.com/test-session' });
    throw new Error(`Unexpected request: ${url}`);
  });
  const previous = globalThis.Deno;
  globalThis.Deno = { env: { get: key => key === 'STRIPE_ANNUAL_PRICE_ID' ? annualPrice : env[key] } };
  t.after(() => { globalThis.Deno = previous; });
  const response = await handler(new Request('https://prism.example/api/stripe-checkout', {
    method: 'POST', headers: { authorization: 'Bearer test-user-token' }, body: JSON.stringify(body)
  }));
  return { response, requests };
}

for (const [period, price] of [['month', 'price_month'], ['year', 'price_year'], [undefined, 'price_month']]) {
  endpointTest(`checkout uses the configured ${price} for ${period ?? 'legacy'} requests`, async t => {
    const { response, requests } = await checkout(t, { period });
    assert.equal(response.status, 200);
    assert.equal((await response.json()).url, 'https://checkout.stripe.com/test-session');
    const sent = new URLSearchParams(requests.at(-1).options.body);
    assert.equal(sent.get('line_items[0][price]'), price);
    assert.equal(sent.get('customer'), 'cus_existing');
  });
}

endpointTest('an unavailable yearly price never silently charges monthly or creates a customer', async t => {
  const { response, requests } = await checkout(t, { period: 'year' }, null);
  assert.equal(response.status, 503);
  assert.match((await response.json()).error, /Yearly billing is not available/);
  assert.equal(requests.length, 1);
});

endpointTest('an unrecognized billing period never reaches Stripe', async t => {
  const { response, requests } = await checkout(t, { period: 'week' });
  assert.equal(response.status, 400);
  assert.equal(requests.length, 1);
});
