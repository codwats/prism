import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';

// Phone sheet order (#471): tools first, then totals, legend, matrix.
test('Totals and tools sheet lists tools before totals and legend', () => {
  const html = readFileSync(new URL('../build.html', import.meta.url), 'utf8');
  const order = {};
  for (const m of html.matchAll(/<[a-z][^>]*data-phone-slot="sheet"[^>]*>/g)) {
    const tag = m[0];
    const key = /id="([^"]+)"/.exec(tag)?.[1] ?? 'legend';
    order[key] = Number(/data-phone-order="(\d+)"/.exec(tag)[1]);
  }
  const ids = Object.entries(order).sort((a, b) => a[1] - b[1]).map(e => e[0]);
  assert.deepEqual(ids, [
    'export-dropdown', 'bulk-mark-dropdown', 'btn-audit',
    'results-stats', 'legend', 'overlap-matrix-container',
  ]);
});
