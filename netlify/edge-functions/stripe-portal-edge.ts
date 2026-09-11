/**
 * Netlify Edge Function: Stripe billing portal session
 * Runs on Deno at the edge.
 *
 * POST { returnUrl } with a Supabase access token in the Authorization header.
 * Looks up the caller's existing Stripe customer and returns { url } for the
 * hosted billing portal (update card, switch period, cancel). Unlike checkout
 * this never creates a customer — no customer means nothing to manage.
 *
 * Env (Netlify dashboard): STRIPE_SECRET_KEY, SUPABASE_URL,
 * SUPABASE_SERVICE_ROLE_KEY, and optionally STRIPE_PORTAL_CONFIGURATION_ID
 * (bpc_...) to pin a specific portal configuration instead of the account
 * default.
 */

import { safeReturnPath } from './lib/stripe-helpers.js';

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

export default async function handler(request: Request): Promise<Response> {
  if (request.method === 'OPTIONS') {
    return new Response(null, { status: 204, headers: getCorsHeaders(request) });
  }
  if (request.method !== 'POST') {
    return jsonResponse(request, 405, { error: 'Method not allowed' });
  }

  const supabaseUrl = Deno.env.get('SUPABASE_URL');
  const serviceKey = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY');
  if (!supabaseUrl || !serviceKey || !Deno.env.get('STRIPE_SECRET_KEY')) {
    console.error('Stripe portal: missing required env vars');
    return jsonResponse(request, 500, { error: 'Payments are not configured' });
  }

  try {
    const token = request.headers.get('authorization')?.replace(/^Bearer\s+/i, '');
    if (!token) {
      return jsonResponse(request, 401, { error: 'Not signed in' });
    }
    const userRes = await fetch(`${supabaseUrl}/auth/v1/user`, {
      headers: { 'apikey': serviceKey, 'Authorization': `Bearer ${token}` }
    });
    if (!userRes.ok) {
      return jsonResponse(request, 401, { error: 'Invalid session' });
    }
    const user = await userRes.json();

    const body = await request.json().catch(() => ({}));
    const returnPath = safeReturnPath(body.returnUrl) || '/profile.html';
    const siteOrigin = new URL(request.url).origin;

    const lookupRes = await fetch(
      `${supabaseUrl}/rest/v1/stripe_customers?user_id=eq.${user.id}&select=stripe_customer_id`,
      { headers: { 'apikey': serviceKey, 'Authorization': `Bearer ${serviceKey}` } }
    );
    if (!lookupRes.ok) {
      console.error('Failed to look up stripe customer:', lookupRes.status, await lookupRes.text());
      return jsonResponse(request, 500, { error: 'Could not open the billing portal' });
    }
    const rows = await lookupRes.json();
    const customerId = rows[0]?.stripe_customer_id;
    if (!customerId) {
      // Patreon members and never-subscribed users land here — nothing to manage.
      return jsonResponse(request, 404, { error: 'No Stripe billing account found for this user.' });
    }

    const portalConfigId = Deno.env.get('STRIPE_PORTAL_CONFIGURATION_ID');
    const res = await fetch('https://api.stripe.com/v1/billing_portal/sessions', {
      method: 'POST',
      headers: {
        'Authorization': `Bearer ${Deno.env.get('STRIPE_SECRET_KEY')}`,
        'Content-Type': 'application/x-www-form-urlencoded',
      },
      body: new URLSearchParams({
        'customer': customerId,
        'return_url': `${siteOrigin}${returnPath}`,
        // Omitted when unset so Stripe falls back to the account's default
        // configuration — sending an empty string is an error.
        ...(portalConfigId ? { 'configuration': portalConfigId } : {}),
      }),
    });
    const session = await res.json();
    if (!res.ok) {
      console.error('Stripe billing_portal error:', res.status, JSON.stringify(session?.error || session));
      return jsonResponse(request, 500, { error: 'Could not open the billing portal' });
    }

    return jsonResponse(request, 200, { url: session.url });
  } catch (error) {
    console.error('Stripe portal error:', error);
    return jsonResponse(request, 500, { error: 'Could not open the billing portal' });
  }
}

export const config = {
  path: '/api/stripe-portal'
};
