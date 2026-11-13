import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { fetchMoxfieldDeck } from '../js/modules/moxfield.js';
import { fetchArchidektDeck } from '../js/modules/archidekt.js';
import { fetchDeckCheckDeck } from '../js/modules/deckcheck.js';

const fetchers = { moxfield: fetchMoxfieldDeck, archidekt: fetchArchidektDeck, deckcheck: fetchDeckCheckDeck };

for (const [name, fn] of Object.entries(fetchers)) {
	test(`${name} 429 reads as busy, not not-found`, async () => {
		const real = globalThis.fetch;
		globalThis.fetch = async () => new Response('Too many requests', { status: 429 });
		try {
			await assert.rejects(() => fn('https://deckcheck.co/x/1'), { message: 'Import is busy, try again in a moment.' });
		} finally {
			globalThis.fetch = real;
		}
	});

	test(`${name} proxy has rateLimit config and no Cache-Control`, () => {
		const src = readFileSync(new URL(`../netlify/edge-functions/${name}-edge.ts`, import.meta.url), 'utf8');
		assert.match(src, /rateLimit: \{ windowLimit: 30, windowSize: 60, aggregateBy: \['ip', 'domain'\] \}/);
		assert.doesNotMatch(src, /Cache-Control/);
	});
}
