/**
 * Pure helpers shared by the Stripe edge functions.
 *
 * Plain .js in a subdirectory on purpose: Deno imports it directly, Node's
 * test runner imports it without type-stripping (so `npm test` still works on
 * the declared node >=18 floor), and Netlify only registers edge functions
 * from the top level of netlify/edge-functions.
 */

// Only same-site paths are allowed as checkout return targets — a full URL
// (or protocol-relative //host) could bounce the user to a foreign site
// after payment.
export function safeReturnPath(returnUrl) {
  if (typeof returnUrl !== 'string') return null;
  if (!returnUrl.startsWith('/') || returnUrl.startsWith('//')) return null;
  return returnUrl;
}

// Flatten a Stripe subscription object into a subscriptions table row.
// current_period_end lives on the subscription pre-Basil and on the first
// subscription item from API version 2025-03-31.basil onward — accept both.
export function subscriptionRow(sub, userId, eventCreated) {
  const periodEnd = sub.current_period_end ?? sub.items?.data?.[0]?.current_period_end ?? null;
  return {
    user_id: userId,
    stripe_subscription_id: sub.id,
    status: sub.status,
    price_id: sub.items?.data?.[0]?.price?.id ?? null,
    current_period_end: periodEnd ? new Date(periodEnd * 1000).toISOString() : null,
    updated_at: new Date(eventCreated * 1000).toISOString(),
  };
}
