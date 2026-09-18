// One-shot Stripe live setup for PRISM Membership (#253).
//
// Creates, in whichever account the key belongs to, only what is missing:
// the monthly and yearly prices (found again by lookup_key), the customer
// portal configuration, and the webhook endpoint for prismmtg.com. Prints
// the values to paste into Netlify's Production context.
//
// Run it in your own terminal, not through an AI session, because it prints
// the webhook signing secret:
//   read -rsp 'Stripe live secret key: ' STRIPE_SECRET_KEY; echo
//   STRIPE_SECRET_KEY="$STRIPE_SECRET_KEY" node scripts/stripe-live-setup.mjs

const key = process.env.STRIPE_SECRET_KEY || '';
if (!/^(sk|rk)_live_/.test(key)) {
  console.error('STRIPE_SECRET_KEY must be a live key (sk_live_… or rk_live_…).');
  process.exit(1);
}

const SITE = 'https://prismmtg.com';
const WEBHOOK_URL = `${SITE}/api/stripe-webhook`;
const EVENTS = [
  'checkout.session.completed',
  'customer.subscription.updated',
  'customer.subscription.deleted',
  'invoice.payment_failed',
];

async function stripe(method, path, params = {}) {
  const body = new URLSearchParams(params).toString();
  const url = `https://api.stripe.com/v1/${path}${method === 'GET' && body ? `?${body}` : ''}`;
  const res = await fetch(url, {
    method,
    headers: {
      Authorization: `Bearer ${key}`,
      'Content-Type': 'application/x-www-form-urlencoded',
    },
    body: method === 'GET' ? undefined : body,
  });
  const data = await res.json();
  if (!res.ok) throw new Error(`${method} ${path}: ${data?.error?.message || res.status}`);
  return data;
}

async function ensurePrices() {
  const lookup = { month: 'prism_membership_month', year: 'prism_membership_year' };
  const found = await stripe('GET', 'prices', {
    'lookup_keys[0]': lookup.month,
    'lookup_keys[1]': lookup.year,
    active: 'true',
  });
  const byKey = Object.fromEntries(found.data.map((p) => [p.lookup_key, p.id]));
  if (byKey[lookup.month] && byKey[lookup.year]) {
    console.log('✓ prices already exist');
    return { month: byKey[lookup.month], year: byKey[lookup.year] };
  }
  const product = await stripe('POST', 'products', { name: 'PRISM Membership' });
  const make = (amount, interval, lookupKey) => stripe('POST', 'prices', {
    product: product.id,
    currency: 'usd',
    unit_amount: String(amount),
    'recurring[interval]': interval,
    lookup_key: lookupKey,
    transfer_lookup_key: 'true',
  });
  const month = byKey[lookup.month] ?? (await make(300, 'month', lookup.month)).id;
  const year = byKey[lookup.year] ?? (await make(3000, 'year', lookup.year)).id;
  console.log('✓ created PRISM Membership product and prices');
  return { month, year };
}

// Cancel at period end, no retention offer, card updates on (runbook, #218).
async function ensurePortalConfig() {
  const list = await stripe('GET', 'billing_portal/configurations', { active: 'true', limit: '100' });
  const existing = list.data.find((c) => c.default_return_url === `${SITE}/profile.html`);
  if (existing) {
    console.log('✓ portal configuration already exists');
    return existing.id;
  }
  const config = await stripe('POST', 'billing_portal/configurations', {
    'business_profile[privacy_policy_url]': `${SITE}/privacy.html`,
    'business_profile[terms_of_service_url]': `${SITE}/terms.html`,
    default_return_url: `${SITE}/profile.html`,
    'features[subscription_cancel][enabled]': 'true',
    'features[subscription_cancel][mode]': 'at_period_end',
    'features[subscription_cancel][cancellation_reason][enabled]': 'false',
    'features[payment_method_update][enabled]': 'true',
    'features[invoice_history][enabled]': 'true',
  });
  console.log('✓ created portal configuration');
  return config.id;
}

// A signing secret is only returned at creation, so an existing endpoint
// for the same URL is reported rather than duplicated.
async function ensureWebhook() {
  const list = await stripe('GET', 'webhook_endpoints', { limit: '100' });
  const existing = list.data.find((e) => e.url === WEBHOOK_URL);
  if (existing) {
    console.log(`! webhook ${existing.id} already exists for ${WEBHOOK_URL}.`);
    console.log('  Its secret is in the dashboard: Webhooks → that endpoint → Signing secret.');
    return null;
  }
  const params = { url: WEBHOOK_URL, description: 'PRISM Membership (Netlify)' };
  EVENTS.forEach((event, i) => { params[`enabled_events[${i}]`] = event; });
  const endpoint = await stripe('POST', 'webhook_endpoints', params);
  console.log('✓ created webhook endpoint');
  return endpoint.secret;
}

const prices = await ensurePrices();
const portalId = await ensurePortalConfig();
const webhookSecret = await ensureWebhook();

console.log('\nPaste into Netlify → Environment variables → Production value:\n');
console.log(`  STRIPE_PRICE_ID                 ${prices.month}`);
console.log(`  STRIPE_ANNUAL_PRICE_ID          ${prices.year}`);
console.log(`  STRIPE_PORTAL_CONFIGURATION_ID  ${portalId}`);
if (webhookSecret) console.log(`  STRIPE_WEBHOOK_SECRET           ${webhookSecret}   (secret)`);
console.log('\nThen redeploy.');
