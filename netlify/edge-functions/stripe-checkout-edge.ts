/**
 * Netlify Edge Function: Stripe Checkout session creation
 * Runs on Deno at the edge.
 *
 * POST { returnUrl } with a Supabase access token in the Authorization header.
 * Creates (or reuses) a Stripe customer for the user, starts a subscription-
 * mode Checkout session, and returns { url } for the client to redirect to.
 *
 * Env (Netlify dashboard): STRIPE_SECRET_KEY, STRIPE_PRICE_ID,
 * SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY.
 */

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

// Only same-site paths are allowed as checkout return targets — a full URL
// (or protocol-relative //host) could bounce the user to a foreign site
// after payment.
export function safeReturnPath(returnUrl: unknown): string | null {
  if (typeof returnUrl !== 'string') return null;
  if (!returnUrl.startsWith('/') || returnUrl.startsWith('//')) return null;
  return returnUrl;
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
    throw new Error(data?.error?.message || `Stripe API error ${res.status}`);
  }
  return data;
}

export default async function handler(request: Request): Promise<Response> {
  if (request.method === 'OPTIONS') {
    return new Response(null, { status: 204, headers: getCorsHeaders(request) });
  }
  if (request.method !== 'POST') {
    return jsonResponse(request, 405, { error: 'Method not allowed' });
  }

  const supabaseUrl = Deno.env.get('SUPABASE_URL');
  const priceId = Deno.env.get('STRIPE_PRICE_ID');
  if (!supabaseUrl || !priceId || !Deno.env.get('STRIPE_SECRET_KEY') || !Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')) {
    console.error('Stripe checkout: missing required env vars');
    return jsonResponse(request, 500, { error: 'Payments are not configured' });
  }

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
    const returnPath = safeReturnPath(body.returnUrl) || '/profile.html';
    const siteOrigin = new URL(request.url).origin;

    // Reuse the user's Stripe customer, or create one
    const lookupRes = await fetch(
      `${supabaseUrl}/rest/v1/stripe_customers?user_id=eq.${user.id}&select=stripe_customer_id`,
      { headers: serviceHeaders() }
    );
    const rows = lookupRes.ok ? await lookupRes.json() : [];
    let customerId = rows[0]?.stripe_customer_id;

    if (!customerId) {
      const customer = await stripePost('customers', {
        'email': user.email || '',
        'metadata[supabase_user_id]': user.id,
      });
      customerId = customer.id as string;
      const insertRes = await fetch(`${supabaseUrl}/rest/v1/stripe_customers`, {
        method: 'POST',
        headers: { ...serviceHeaders(), 'Prefer': 'resolution=merge-duplicates' },
        body: JSON.stringify({ user_id: user.id, stripe_customer_id: customerId }),
      });
      if (!insertRes.ok) {
        console.error('Failed to store stripe customer:', insertRes.status, await insertRes.text());
        return jsonResponse(request, 500, { error: 'Failed to start checkout' });
      }
    }

    const session = await stripePost('checkout/sessions', {
      'mode': 'subscription',
      'customer': customerId,
      'client_reference_id': user.id,
      'line_items[0][price]': priceId,
      'line_items[0][quantity]': '1',
      'success_url': `${siteOrigin}${returnPath}?checkout=success`,
      'cancel_url': `${siteOrigin}${returnPath}?checkout=cancel`,
    });

    return jsonResponse(request, 200, { url: session.url });
  } catch (error) {
    console.error('Stripe checkout error:', error);
    return jsonResponse(request, 500, { error: 'Failed to start checkout' });
  }
}

export const config = {
  path: '/api/stripe-checkout'
};
