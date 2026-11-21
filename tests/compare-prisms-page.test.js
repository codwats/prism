import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';

const html = readFileSync(new URL('../compare-prisms.html', import.meta.url), 'utf8');

test('Compare PRISMs is an unlisted Extra page: noindex, no share tags', () => {
  assert.ok(html.includes('<meta name="robots" content="noindex,nofollow" />'));
  assert.ok(!/og:|twitter:|rel="canonical"/.test(html));
});

test('the compare tool sits inside the Extra gate, after the pitch', () => {
  const tool = html.indexOf('<div data-extra-tool hidden>');
  assert.ok(html.indexOf('data-extra-pitch') >= 0 && tool > html.indexOf('data-extra-pitch'));
  assert.ok(html.indexOf('id="compare-from"') > tool);
});
