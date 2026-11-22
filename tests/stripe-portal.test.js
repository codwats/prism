import test from 'node:test';
import assert from 'node:assert/strict';
const handler = process.features.typescript
  ? (await import('../netlify/edge-functions/stripe-portal-edge.ts')).default
  : null;
const endpointTest = (name, fn) => test(name, { skip: !handler && 'Needs Node with native TypeScript support' }, fn);

const env = { SUPABASE_URL: 'https://db.example', SUPABASE_SERVICE_ROLE_KEY: 'test-service-key', STRIPE_SECRET_KEY: 'test-stripe-key' };

async function portal(t, headers, customerRows) {
  const requests = [];
  t.mock.method(globalThis, 'fetch', async (url) => {
    requests.push(String(url));
    if (String(url).endsWith('/auth/v1/user')) return Response.json({ id: 'u1' });
    if (String(url).includes('/stripe_customers?')) return Response.json(customerRows);
    throw new Error(`Unexpected request: ${url}`);
  });
  const previous = globalThis.Deno;
  globalThis.Deno = { env: { get: key => env[key] } };
  t.after(() => { globalThis.Deno = previous; });
  const response = await handler(new Request('https://prism.example/api/stripe-portal', { method: 'POST', headers, body: '{}' }));
  return { response, requests };
}

endpointTest('the portal answers 401 without a token and reaches nothing', async t => {
  const { response, requests } = await portal(t, {}, []);
  assert.equal(response.status, 401);
  assert.equal(requests.length, 0);
});

endpointTest('the portal answers 404 when the caller has no Stripe customer, without calling Stripe', async t => {
  const { response, requests } = await portal(t, { authorization: 'Bearer test-user-token' }, []);
  assert.equal(response.status, 404);
  assert.equal(requests.some(u => u.startsWith('https://api.stripe.com')), false);
});
