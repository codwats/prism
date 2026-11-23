import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { fetchMoxfieldDeck } from '../js/modules/moxfield.js';
import { fetchArchidektDeck } from '../js/modules/archidekt.js';
import { fetchDeckCheckDeck } from '../js/modules/deckcheck.js';
import { importFromCommanderTemplate } from '../js/modules/commandertemplate.js';

const fetchers = { moxfield: fetchMoxfieldDeck, archidekt: fetchArchidektDeck, deckcheck: fetchDeckCheckDeck, commandertemplate: importFromCommanderTemplate };

for (const [name, fn] of Object.entries(fetchers)) {
	test(`${name} 429 reads as busy, not not-found`, async () => {
		const real = globalThis.fetch;
		globalThis.fetch = async () => new Response('Too many requests', { status: 429 });
		try {
			await assert.rejects(() => fn('https://commandertemplate.com/decks/6491b290-a75f-4668-bf4d-2af564d15258'), { message: 'Import is busy, try again in a moment.' });
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
