import test from 'node:test';
import assert from 'node:assert/strict';
import { membershipPitch } from '../js/modules/membership.js';

test('an entitled visitor sees no price, no benefits pitch and no join button on the landing page', () => {
  const html = membershipPitch({ entitled: true });
  assert.match(html, /Membership is included/);
  assert.doesNotMatch(html, /\$|\bUSD\b|Membership adds|build\.html#membership/);
});

test('everyone else sees the benefits, the price line once and a priced join button handing off to the drawer', () => {
  const html = membershipPitch({ entitled: false });
  assert.match(html, /A free account adds gallery participation/);
  assert.equal((html.match(/class="membership-price"/g) || []).length, 1);
  assert.match(html, /<strong>\$3<\/strong> a month or <strong>\$30<\/strong> a year\. USD\./);
  assert.doesNotMatch(html, /months? free/, 'no offer framing (PRODUCT.md money pattern 2)');
  assert.match(html, /Same price on Stripe or Patreon\. Paying on Patreon is not available yet\./);
  assert.match(html, /<wa-button href="build\.html#membership"[^>]*>Join for \$3 a month<\/wa-button>/);
});
