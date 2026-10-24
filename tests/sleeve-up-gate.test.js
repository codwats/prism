import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';

// The Extra gate (ADR 0003) reveals only [data-extra-tool] to Members, so the
// Sleeve up section is Members-only exactly when it sits inside that wrapper.
function extraToolHtml(html) {
  const start = html.indexOf('<div data-extra-tool');
  assert.ok(start >= 0, 'the page has an Extra tool wrapper');
  const tags = /<div\b|<\/div>/g;
  tags.lastIndex = start;
  let depth = 0;
  for (let m; (m = tags.exec(html));) {
    depth += m[0] === '</div>' ? -1 : 1;
    if (depth === 0) return html.slice(start, tags.lastIndex);
  }
  throw new Error('unclosed Extra tool wrapper');
}

test('non-Members do not get the Sleeve up section: it lives inside the Extra tool', () => {
  const html = readFileSync(new URL('../swap-planner.html', import.meta.url), 'utf8');
  assert.equal(html.split('id="sleeve-up"').length, 2, 'one Sleeve up section');
  assert.ok(extraToolHtml(html).includes('id="sleeve-up"'));
});
