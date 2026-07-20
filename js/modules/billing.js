/**
 * Billing — Stripe subscription plumbing.
 *
 * Reads subscription state that the stripe-webhook edge function writes into
 * Supabase (RLS scopes reads to the signed-in user's own row). Nothing here
 * restricts any feature yet: isPaymentEnforced() exists so that flipping the
 * app_config 'payment_enforcement' row to true is the only launch step.
 */

import { getSupabase } from './supabase-client.js';

let enforcementCache = null;

/**
 * Whether the app should enforce payment at all. Reads the app_config
 * 'payment_enforcement' row (publicly readable). Defaults to false on any
 * error so billing problems can never lock users out.
 */
export async function isPaymentEnforced() {
  if (enforcementCache !== null) return enforcementCache;
  try {
    const client = getSupabase();
    if (!client) return false;
    const { data } = await client
      .from('app_config')
      .select('value')
      .eq('key', 'payment_enforcement')
      .maybeSingle();
    enforcementCache = data?.value === true;
  } catch {
    enforcementCache = false;
  }
  return enforcementCache;
}

/**
 * The signed-in user's subscription row, or null. RLS returns only their own.
 */
export async function getSubscription() {
  try {
    const client = getSupabase();
    if (!client) return null;
    const { data } = await client.from('subscriptions').select('*').maybeSingle();
    return data || null;
  } catch {
    return null;
  }
}

export function hasActiveSubscription(subscription) {
  return ['active', 'trialing'].includes(subscription?.status);
}

/**
 * Start a Stripe Checkout session and redirect to Stripe's hosted page.
 * Throws with a user-facing message on failure.
 */
export async function startCheckout() {
  const client = getSupabase();
  const { data: { session } = {} } = await client?.auth.getSession() || { data: {} };
  if (!session) {
    throw new Error('Please sign in to subscribe.');
  }

  const response = await fetch('/api/stripe-checkout', {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      'Authorization': `Bearer ${session.access_token}`
    },
    body: JSON.stringify({ returnUrl: '/profile.html' })
  });
  const data = await response.json().catch(() => ({}));
  if (!response.ok || !data.url) {
    throw new Error(data.error || 'Could not start checkout. Please try again.');
  }
  window.location.href = data.url;
}
