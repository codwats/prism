// #477: Start marking leads the first toolbar row, and the stat and column
// labels are sentence case.
import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';

const html = readFileSync(new URL('../build.html', import.meta.url), 'utf8');

test('Start marking leads the first toolbar row, above the view switch', () => {
	const scry = html.indexOf('id="btn-scry"');
	const filter = html.indexOf('id="results-filter"');
	const actions = html.indexOf('id="marking-actions"');
	assert.ok(scry > 0 && scry < filter, 'Start marking comes before the view switch');
	assert.ok(actions < scry && actions < filter, 'the tools row comes first and holds Start marking');
});

test('stat and column labels are sentence case', () => {
	for (const bad of ['All Cards', 'Total Cards', 'Pool Cards', 'Card Name', 'Deck Overlap Matrix', 'Sleeves Done', 'Copies in 2+ Decks']) {
		assert.ok(!html.includes(bad), `${bad} still in build.html`);
	}
});
