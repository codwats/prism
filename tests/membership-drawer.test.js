import test from 'node:test';
import assert from 'node:assert/strict';
import { membershipContent, joinLabel } from '../js/modules/membership.js';

test('an entitled Member sees only Extras, with no Membership price, checkout or Patreon content', () => {
  const html = membershipContent({ entitled: true, signedIn: true });
  assert.match(html, /Membership is included/);
  assert.match(html, /MPC Stripe Compositor/);
  assert.doesNotMatch(html, /\$|\bUSD\b|wa-radio|data-membership-checkout|Patreon/);
});

test('the free drawer names the three benefits and both billing periods it can check out', () => {
  const html = membershipContent({ entitled: false, signedIn: true });
  assert.match(html, /\$3<\/strong> a month/);
  assert.match(html, /\$30<\/strong> a year/);
  assert.doesNotMatch(html, /week|\bday\b/, 'no anchoring below the billing period');
  assert.equal((html.match(/<li>/g) || []).length, 3);
  assert.doesNotMatch(html, /<img/);
});

test('the free drawer offers monthly and yearly billing, monthly by default', () => {
  const html = membershipContent({ entitled: false, signedIn: true });
  assert.match(html, /<wa-radio-group[^>]*name="membership-period"[^>]*value="month"/);
  assert.match(html, /<wa-radio value="month">/);
  assert.match(html, /<wa-radio value="year">/);
  assert.match(html, /data-membership-checkout>Join for \$3 a month</);
});

test('the join button names the chosen period and price', () => {
  assert.equal(joinLabel('month', true), 'Join for $3 a month');
  assert.equal(joinLabel('year', true), 'Join for $30 a year');
  assert.equal(joinLabel('month', false), 'Sign in to join for $3 a month');
  assert.equal(joinLabel('year', false), 'Sign in to join for $30 a year');
});

test('a re-render keeps the chosen period, so signing in does not drop a yearly choice', () => {
  const html = membershipContent({ entitled: false, signedIn: true, period: 'year' });
  assert.match(html, /<wa-radio-group[^>]*name="membership-period"[^>]*value="year"/);
  assert.match(html, /data-membership-checkout>Join for \$30 a year</);
});

test('opening Membership over an existing PRISM does not claim it was just created', () => {
  assert.doesNotMatch(membershipContent({ entitled: false, signedIn: true }), /stays on this device/);
});

test('the free drawer follows the spec order: notice, price, benefits, billing period, where to pay, button, Extras', () => {
  const html = membershipContent({ entitled: false, signedIn: true });
  const noticeAt = html.indexOf('Keep creating, marking and exporting');
  const priceAt = html.indexOf('membership-price');
  const benefitsAt = html.indexOf('<li>');
  const periodAt = html.indexOf('name="membership-period"');
  const whereToPayAt = html.indexOf('Where would you like to pay?');
  const buttonAt = html.indexOf('data-membership-checkout');
  const extrasAt = html.indexOf('id="membership-extras-heading"');
  for (const at of [noticeAt, priceAt, benefitsAt, periodAt, whereToPayAt, buttonAt, extrasAt]) {
    assert.notEqual(at, -1);
  }
  assert.ok(noticeAt < priceAt);
  assert.ok(priceAt < benefitsAt);
  assert.ok(benefitsAt < periodAt);
  assert.ok(periodAt < whereToPayAt);
  assert.ok(whereToPayAt < buttonAt);
  assert.ok(buttonAt < extrasAt, 'Extras must be last');
});
