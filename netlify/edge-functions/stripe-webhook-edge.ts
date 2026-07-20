/**
 * Netlify Edge Function: Stripe webhook handler
 * Runs on Deno at the edge.
 *
 * Verifies the Stripe signature on the raw body, dedupes via
 * processed_stripe_events, and writes subscription state into Supabase with
 * the service role key. updated_at on subscriptions is the Stripe event's
 * created timestamp, so out-of-order deliveries never overwrite newer state.
 *
 * Env (Netlify dashboard): STRIPE_SECRET_KEY, STRIPE_WEBHOOK_SECRET,
 * SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY.
 */

// deno-lint-ignore no-explicit-any
type StripeObject = Record<string, any>;

// Flatten a Stripe subscription object into a subscriptions table row.
// current_period_end lives on the subscription pre-Basil and on the first
// subscription item from API version 2025-03-31.basil onward — accept both.
export function subscriptionRow(sub: StripeObject, userId: string, eventCreated: number): StripeObject {
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

function serviceHeaders(): Record<string, string> {
  const key = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY') || '';
  return {
    'apikey': key,
    'Authorization': `Bearer ${key}`,
    'Content-Type': 'application/json',
  };
}

function restUrl(path: string): string {
  return `${Deno.env.get('SUPABASE_URL')}/rest/v1/${path}`;
}

async function restFetch(path: string, init: RequestInit = {}): Promise<Response> {
  const res = await fetch(restUrl(path), {
    ...init,
    headers: { ...serviceHeaders(), ...(init.headers || {}) },
  });
  if (!res.ok) {
    throw new Error(`Supabase ${init.method || 'GET'} ${path}: ${res.status} ${await res.text()}`);
  }
  return res;
}

// Insert-if-missing, then update-only-if-older. An event older than the
// stored row matches neither branch, so late deliveries are no-ops.
async function upsertSubscription(row: StripeObject): Promise<void> {
  await restFetch('subscriptions', {
    method: 'POST',
    headers: { 'Prefer': 'resolution=ignore-duplicates' },
    body: JSON.stringify(row),
  });
  await restFetch(
    `subscriptions?user_id=eq.${row.user_id}&updated_at=lt.${encodeURIComponent(row.updated_at)}`,
    { method: 'PATCH', body: JSON.stringify(row) }
  );
}

async function findUserByCustomer(customerId: string): Promise<string | null> {
  const res = await restFetch(`stripe_customers?stripe_customer_id=eq.${encodeURIComponent(customerId)}&select=user_id`);
  const rows = await res.json();
  return rows[0]?.user_id ?? null;
}

async function handleEvent(event: StripeObject): Promise<void> {
  const obj: StripeObject = event.data.object;

  switch (event.type) {
    case 'checkout.session.completed': {
      const userId = obj.client_reference_id;
      const customerId = obj.customer;
      if (!userId || !customerId) {
        console.error('checkout.session.completed missing client_reference_id or customer:', event.id);
        return;
      }
      await restFetch('stripe_customers', {
        method: 'POST',
        headers: { 'Prefer': 'resolution=merge-duplicates' },
        body: JSON.stringify({ user_id: userId, stripe_customer_id: customerId }),
      });
      if (obj.subscription) {
        // Fetch the live subscription — the session object doesn't carry
        // status/price/period, and this also makes the write order-proof.
        const subRes = await fetch(`https://api.stripe.com/v1/subscriptions/${obj.subscription}`, {
          headers: { 'Authorization': `Bearer ${Deno.env.get('STRIPE_SECRET_KEY')}` },
        });
        if (!subRes.ok) {
          throw new Error(`Stripe subscription fetch failed: ${subRes.status}`);
        }
        const sub = await subRes.json();
        await upsertSubscription(subscriptionRow(sub, userId, event.created));
      }
      return;
    }

    case 'customer.subscription.updated':
    case 'customer.subscription.deleted': {
      // Stripe sets status to 'canceled' on the deleted event's object.
      const userId = await findUserByCustomer(obj.customer);
      if (!userId) {
        console.error(`No stripe_customers row for ${obj.customer} (event ${event.id}) — skipping`);
        return;
      }
      await upsertSubscription(subscriptionRow(obj, userId, event.created));
      return;
    }

    case 'invoice.payment_failed': {
      const userId = await findUserByCustomer(obj.customer);
      if (!userId) {
        console.error(`No stripe_customers row for ${obj.customer} (event ${event.id}) — skipping`);
        return;
      }
      const updatedAt = new Date(event.created * 1000).toISOString();
      await restFetch(
        `subscriptions?user_id=eq.${userId}&updated_at=lt.${encodeURIComponent(updatedAt)}`,
        { method: 'PATCH', body: JSON.stringify({ status: 'past_due', updated_at: updatedAt }) }
      );
      return;
    }

    default:
      // Not subscribed to anything else, but Stripe may send it anyway.
      console.log('Unhandled Stripe event type:', event.type);
  }
}

export default async function handler(request: Request): Promise<Response> {
  if (request.method !== 'POST') {
    return new Response('Method not allowed', { status: 405 });
  }

  const webhookSecret = Deno.env.get('STRIPE_WEBHOOK_SECRET');
  if (!webhookSecret || !Deno.env.get('STRIPE_SECRET_KEY') || !Deno.env.get('SUPABASE_URL') || !Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')) {
    console.error('Stripe webhook: missing required env vars');
    return new Response('Not configured', { status: 500 });
  }

  // Signature verification on the raw body, before anything else.
  const signature = request.headers.get('stripe-signature');
  const rawBody = await request.text();
  let event: StripeObject;
  try {
    // Dynamic import keeps this module loadable outside Deno (unit tests).
    const { default: Stripe } = await import('https://esm.sh/stripe@18.5.0?target=denonext');
    const stripe = new Stripe(Deno.env.get('STRIPE_SECRET_KEY') as string);
    event = await stripe.webhooks.constructEventAsync(
      rawBody,
      signature || '',
      webhookSecret,
      undefined,
      Stripe.createSubtleCryptoProvider()
    );
  } catch (err) {
    console.error('Stripe webhook signature verification failed:', err);
    return new Response('Invalid signature', { status: 400 });
  }

  try {
    // Idempotency: exit early on a redelivered event id.
    const dupRes = await restFetch(`processed_stripe_events?event_id=eq.${encodeURIComponent(event.id)}&select=event_id`);
    if ((await dupRes.json()).length > 0) {
      return new Response(JSON.stringify({ received: true, duplicate: true }), { status: 200 });
    }

    await handleEvent(event);

    // Record only after successful processing — a failure returns non-2xx,
    // Stripe retries, and the retry is not treated as a duplicate.
    await restFetch('processed_stripe_events', {
      method: 'POST',
      headers: { 'Prefer': 'resolution=ignore-duplicates' },
      body: JSON.stringify({ event_id: event.id }),
    });

    return new Response(JSON.stringify({ received: true }), { status: 200 });
  } catch (err) {
    console.error(`Stripe webhook processing failed (event ${event.id}):`, err);
    return new Response('Processing failed', { status: 500 });
  }
}

export const config = {
  path: '/api/stripe-webhook'
};
