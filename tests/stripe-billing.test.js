import test from 'node:test';
import assert from 'node:assert/strict';

// Node 22+ strips types from local .ts imports; both edge modules keep Deno
// and network access inside functions so the pure helpers are testable here.
import { safeReturnPath } from '../netlify/edge-functions/stripe-checkout-edge.ts';
import { subscriptionRow } from '../netlify/edge-functions/stripe-webhook-edge.ts';

test('safeReturnPath allows same-site paths only', () => {
	assert.equal(safeReturnPath('/profile.html'), '/profile.html');
	assert.equal(safeReturnPath('/profile.html?tab=sub'), '/profile.html?tab=sub');
	assert.equal(safeReturnPath('https://evil.example/phish'), null);
	assert.equal(safeReturnPath('//evil.example/phish'), null);
	assert.equal(safeReturnPath('profile.html'), null);
	assert.equal(safeReturnPath(null), null);
	assert.equal(safeReturnPath(42), null);
});

test('subscriptionRow maps a pre-Basil subscription', () => {
	const sub = {
		id: 'sub_123',
		status: 'active',
		current_period_end: 1767225600, // 2026-01-01T00:00:00Z
		items: { data: [{ price: { id: 'price_abc' } }] }
	};
	const row = subscriptionRow(sub, 'user-1', 1751760000); // 2025-07-06
	assert.deepEqual(row, {
		user_id: 'user-1',
		stripe_subscription_id: 'sub_123',
		status: 'active',
		price_id: 'price_abc',
		current_period_end: '2026-01-01T00:00:00.000Z',
		updated_at: '2025-07-06T00:00:00.000Z'
	});
});

test('subscriptionRow reads current_period_end from items on Basil API', () => {
	const sub = {
		id: 'sub_456',
		status: 'canceled',
		items: { data: [{ price: { id: 'price_abc' }, current_period_end: 1767225600 }] }
	};
	const row = subscriptionRow(sub, 'user-1', 1751760000);
	assert.equal(row.status, 'canceled');
	assert.equal(row.current_period_end, '2026-01-01T00:00:00.000Z');
});

test('subscriptionRow tolerates missing items and period end', () => {
	const row = subscriptionRow({ id: 'sub_789', status: 'active' }, 'user-1', 1751760000);
	assert.equal(row.price_id, null);
	assert.equal(row.current_period_end, null);
});
