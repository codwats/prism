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
let entitlementCache = null;

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

/**
 * Whether the signed-in user is entitled to Membership. One source-blind read:
 * the RPC folds in Founder rows, subscription status and the enforcement flag,
 * so the client never assembles the answer itself. A Founder has no
 * subscriptions row at all — deriving entitlement from that row told a
 * permanently-entitled user they were not a member.
 *
 * Fails OPEN — a wrong "no" walls a paying member, a wrong "yes" costs one
 * confusing refusal from the server, which is the real gate either way. The
 * open answer is deliberately not cached, so a transient failure does not pin
 * the answer for the page's lifetime (isPaymentEnforced() caches its default
 * because it reads global config, not per-user state).
 */
export async function isEntitled() {
  if (entitlementCache !== null) return entitlementCache;
  try {
    const client = getSupabase();
    if (!client) return true;
    const { data, error } = await client.rpc('is_entitled');
    if (error) return true;
    // `!== false` and not `=== true`: an RPC that resolves with null/undefined
    // and no error is an absent answer, not a "no". Reading it as a "no" would
    // fail closed — and now that a "no" pauses cloud writes (#212), closed
    // means a silent write freeze for an entitled member.
    entitlementCache = data !== false;
  } catch {
    return true;
  }
  return entitlementCache;
}

/**
 * Entitlement is per-user, so a sign-in or sign-out inside one page would
 * otherwise serve the previous user's answer. Called from notifyAuthChange().
 */
export function clearEntitlementCache() {
  entitlementCache = null;
}

/**
 * Open Stripe's hosted billing portal (update card, switch period, cancel).
 * Throws with a user-facing message on failure.
 */
export async function openBillingPortal() {
  return redirectToStripe('/api/stripe-portal', 'Could not open the billing portal. Please try again.');
}

/**
 * Start a Stripe Checkout session and redirect to Stripe's hosted page.
 * Throws with a user-facing message on failure.
 */
export async function startCheckout() {
  return redirectToStripe('/api/stripe-checkout', 'Could not start checkout. Please try again.');
}

// Both Stripe entry points are the same request: POST with the access token,
// get back a hosted URL, navigate there.
async function redirectToStripe(endpoint, failureMessage) {
  const client = getSupabase();
  const { data: { session } = {} } = await client?.auth.getSession() || { data: {} };
  if (!session) {
    throw new Error('Please sign in first.');
  }

  let response;
  try {
    response = await fetch(endpoint, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'Authorization': `Bearer ${session.access_token}`
      },
      body: JSON.stringify({ returnUrl: '/profile.html' }),
      // Without this the button can sit in its loading state indefinitely if
      // the request never settles.
      signal: AbortSignal.timeout(15000)
    });
  } catch {
    throw new Error(failureMessage);
  }
  const data = await response.json().catch(() => ({}));
  if (!response.ok || !data.url) {
    throw new Error(data.error || failureMessage);
  }
  window.location.href = data.url;
}
