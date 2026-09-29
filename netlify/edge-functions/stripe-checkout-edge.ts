/**
 * Netlify Edge Function: Stripe Checkout session creation
 * Runs on Deno at the edge.
 *
 * POST { returnUrl, period?: 'month' | 'year' } with a Supabase access token.
 * Creates (or reuses) a Stripe customer for the user, starts a subscription-
 * mode Checkout session, and returns { url } for the client to redirect to.
 *
 * Env (Netlify dashboard): STRIPE_SECRET_KEY, STRIPE_PRICE_ID, STRIPE_ANNUAL_PRICE_ID,
 * SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY.
 */

import { isMissingCustomer, missingEnv, safeReturnPath } from './lib/stripe-helpers.js';

function getCorsHeaders(request: Request): Record<string, string> {
  const origin = request.headers.get('origin') || 'https://prismmtg.com';
  const allowedOrigin = Deno.env.get('CONTEXT') === 'production'
    ? 'https://prismmtg.com'
    : origin;
  return {
    'Access-Control-Allow-Origin': allowedOrigin,
    'Access-Control-Allow-Headers': 'Content-Type, Authorization',
    'Access-Control-Allow-Methods': 'POST, OPTIONS',
    'Vary': 'Origin',
  };
}

function jsonResponse(request: Request, status: number, body: unknown): Response {
  return new Response(JSON.stringify(body), {
    status,
    headers: { ...getCorsHeaders(request), 'Content-Type': 'application/json' }
  });
}

function serviceHeaders(): Record<string, string> {
  const key = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY') || '';
  return {
    'apikey': key,
    'Authorization': `Bearer ${key}`,
    'Content-Type': 'application/json',
  };
}

async function stripePost(path: string, params: Record<string, string>): Promise<Record<string, unknown>> {
  const res = await fetch(`https://api.stripe.com/v1/${path}`, {
    method: 'POST',
    headers: {
      'Authorization': `Bearer ${Deno.env.get('STRIPE_SECRET_KEY')}`,
      'Content-Type': 'application/x-www-form-urlencoded',
    },
    body: new URLSearchParams(params),
  });
  const data = await res.json();
  if (!res.ok) {
    console.error(`Stripe ${path} error:`, res.status, JSON.stringify(data?.error || data));
    // Keep Stripe's error object so callers can branch on code/param.
    throw Object.assign(new Error(data?.error?.message || `Stripe API error ${res.status}`), { stripeError: data?.error });
  }
  return data;
}

// Create a Stripe customer for the user and store its id. With staleId, the
// row is swapped only while it still holds staleId: if a concurrent checkout
// already replaced it, that winner's id is returned instead, so every
// session lands on the customer the webhook will resolve. Returns null when
// the id could not be stored or read back.
async function createCustomer(
  supabaseUrl: string,
  user: { id: string; email?: string },
  staleId?: string
): Promise<string | null> {
  const customer = await stripePost('customers', {
    'email': user.email || '',
    'metadata[supabase_user_id]': user.id,
  });
  const customerId = customer.id as string;
  const storeRes = staleId
    ? await fetch(
        `${supabaseUrl}/rest/v1/stripe_customers?user_id=eq.${user.id}&stripe_customer_id=eq.${encodeURIComponent(staleId)}`,
        {
          method: 'PATCH',
          headers: { ...serviceHeaders(), 'Prefer': 'return=representation' },
          body: JSON.stringify({ stripe_customer_id: customerId }),
        }
      )
    : await fetch(`${supabaseUrl}/rest/v1/stripe_customers`, {
        method: 'POST',
        headers: { ...serviceHeaders(), 'Prefer': 'resolution=merge-duplicates' },
        body: JSON.stringify({ user_id: user.id, stripe_customer_id: customerId }),
      });
  if (!storeRes.ok) {
    console.error('Failed to store stripe customer:', storeRes.status, await storeRes.text());
    return null;
  }
  if (!staleId || (await storeRes.json()).length > 0) return customerId;

  // Lost the swap. The customer just created has nothing attached.
  const winnerRes = await fetch(
    `${supabaseUrl}/rest/v1/stripe_customers?user_id=eq.${user.id}&select=stripe_customer_id`,
    { headers: serviceHeaders() }
  );
  if (!winnerRes.ok) {
    console.error('Failed to look up stripe customer:', winnerRes.status, await winnerRes.text());
    return null;
  }
  return (await winnerRes.json())[0]?.stripe_customer_id ?? null;
}

export default async function handler(request: Request): Promise<Response> {
  if (request.method === 'OPTIONS') {
    return new Response(null, { status: 204, headers: getCorsHeaders(request) });
  }
  if (request.method !== 'POST') {
    return jsonResponse(request, 405, { error: 'Method not allowed' });
  }

  const missing = missingEnv(
    ['SUPABASE_URL', 'STRIPE_PRICE_ID', 'STRIPE_SECRET_KEY', 'SUPABASE_SERVICE_ROLE_KEY'],
    (name) => Deno.env.get(name)
  );
  if (missing.length > 0) {
    console.error(`Stripe checkout: missing env vars: ${missing.join(', ')}`);
    return jsonResponse(request, 500, { error: 'Payments are not configured' });
  }
  const supabaseUrl = Deno.env.get('SUPABASE_URL') as string;
  const priceId = Deno.env.get('STRIPE_PRICE_ID') as string;

  try {
    // Verify the caller's Supabase session
    const token = request.headers.get('authorization')?.replace(/^Bearer\s+/i, '');
    if (!token) {
      return jsonResponse(request, 401, { error: 'Not signed in' });
    }
    const userRes = await fetch(`${supabaseUrl}/auth/v1/user`, {
      headers: { 'apikey': Deno.env.get('SUPABASE_SERVICE_ROLE_KEY') || '', 'Authorization': `Bearer ${token}` }
    });
    if (!userRes.ok) {
      return jsonResponse(request, 401, { error: 'Invalid session' });
    }
    const user = await userRes.json();

    const body = await request.json().catch(() => ({}));
    const period = body?.period ?? 'month';
    if (!['month', 'year'].includes(period)) {
      return jsonResponse(request, 400, { error: 'Choose monthly or yearly billing.' });
    }
    const selectedPriceId = period === 'year' ? Deno.env.get('STRIPE_ANNUAL_PRICE_ID') : priceId;
    if (!selectedPriceId) {
      return jsonResponse(request, 503, { error: 'Yearly billing is not available yet. Please choose monthly billing.' });
    }
    const returnPath = safeReturnPath(body?.returnUrl) || '/profile.html';
    const siteOrigin = new URL(request.url).origin;

    // Reuse the user's Stripe customer, or create one
    const lookupRes = await fetch(
      `${supabaseUrl}/rest/v1/stripe_customers?user_id=eq.${user.id}&select=stripe_customer_id`,
      { headers: serviceHeaders() }
    );
    if (!lookupRes.ok) {
      // Must not fall through to "no customer": that would create a second
      // Stripe customer and overwrite the stored id, orphaning the original
      // (and any subscription attached to it).
      console.error('Failed to look up stripe customer:', lookupRes.status, await lookupRes.text());
      return jsonResponse(request, 500, { error: 'Failed to start checkout' });
    }
    const rows = await lookupRes.json();
    let customerId = rows[0]?.stripe_customer_id;

    if (!customerId) {
      customerId = await createCustomer(supabaseUrl, user);
      if (!customerId) return jsonResponse(request, 500, { error: 'Failed to start checkout' });
    }

    const startSession = (customer: string) => stripePost('checkout/sessions', {
      'mode': 'subscription',
      'customer': customer,
      'client_reference_id': user.id,
      'line_items[0][price]': selectedPriceId,
      'line_items[0][quantity]': '1',
      'success_url': `${siteOrigin}${returnPath}?checkout=success`,
      'cancel_url': `${siteOrigin}${returnPath}?checkout=cancel`,
    });

    let session;
    try {
      session = await startSession(customerId);
    } catch (error) {
      if (!isMissingCustomer((error as { stripeError?: unknown }).stripeError)) throw error;
      // The stored id does not exist under this key (#258), so overwriting it
      // orphans nothing — unlike the lookup failure above. Retry once only.
      const staleId = customerId;
      customerId = await createCustomer(supabaseUrl, user, staleId);
      if (!customerId) return jsonResponse(request, 500, { error: 'Failed to start checkout' });
      console.warn(`Replaced stale stripe customer ${staleId} with ${customerId} for user ${user.id}`);
      session = await startSession(customerId);
    }

    return jsonResponse(request, 200, { url: session.url });
  } catch (error) {
    console.error('Stripe checkout error:', error);
    return jsonResponse(request, 500, { error: 'Failed to start checkout' });
  }
}

export const config = {
  path: '/api/stripe-checkout'
};
