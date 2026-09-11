import test from 'node:test';
import assert from 'node:assert/strict';
import { membershipContent } from '../js/modules/membership.js';

test('an entitled Member sees only Extras, with no Membership price, checkout or Patreon content', () => {
  const html = membershipContent({ entitled: true, signedIn: true });
  assert.match(html, /Membership is included/);
  assert.match(html, /MPC Stripe Compositor/);
  assert.doesNotMatch(html, /\$|\bUSD\b|wa-radio|data-membership-checkout|Patreon/);
});

test('the free drawer names the three benefits and both prices', () => {
  const html = membershipContent({ entitled: false, signedIn: true });
  assert.match(html, /\$3/);
  assert.match(html, /\$30/);
  assert.equal((html.match(/<li>/g) || []).length, 3);
  assert.doesNotMatch(html, /<img/);
});

test('opening Membership over an existing PRISM does not claim it was just created', () => {
  assert.doesNotMatch(membershipContent({ entitled: false, signedIn: true }), /stays on this device/);
});

test('the free drawer follows the spec order: notice, price, benefits, where to pay, button, Extras', () => {
  const html = membershipContent({ entitled: false, signedIn: true });
  const noticeAt = html.indexOf('Keep creating, marking and exporting');
  const priceAt = html.indexOf('membership-price');
  const benefitsAt = html.indexOf('<li>');
  const whereToPayAt = html.indexOf('Where would you like to pay?');
  const buttonAt = html.indexOf('data-membership-checkout');
  const extrasAt = html.indexOf('id="membership-extras-heading"');
  for (const at of [noticeAt, priceAt, benefitsAt, whereToPayAt, buttonAt, extrasAt]) {
    assert.notEqual(at, -1);
  }
  assert.ok(noticeAt < priceAt);
  assert.ok(priceAt < benefitsAt);
  assert.ok(benefitsAt < whereToPayAt);
  assert.ok(whereToPayAt < buttonAt);
  assert.ok(buttonAt < extrasAt, 'Extras must be last');
});
