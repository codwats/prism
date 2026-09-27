import test from 'node:test';
import assert from 'node:assert/strict';
import { gzipSync } from 'node:zlib';

// The fixture pins only a few tags; the rest warn as missing.
console.warn = () => {};

const { buildJobIndex, loadJobIndex } = await import('../js/modules/oracle-tags.js');

const TUTOR_LAND = 'cc2644e4-57c6-46f7-a69c-0cd82dbf2e9d';
const INITIATIVE = 'f3cdad26-6def-42eb-80c7-1f15f130b111';
const SHOCKLAND = '1b645961-104e-48c9-813d-317fb21c24e2';

const tag = (id, oracleIds, childIds = [], slug = id) => ({
	id, slug, child_ids: childIds, taggings: oracleIds.map((oracle_id) => ({ oracle_id, weight: 'median' })),
});

// tutor-land → [tutor-land-basic → [grandchild], take-the-initiative → [under-initiative]]
const FIXTURE = [
	tag(TUTOR_LAND, ['o-harrow'], ['child', INITIATIVE]),
	tag('child', ['o-cultivate'], ['grandchild']),
	tag('grandchild', ['o-claim']),
	tag(INITIATIVE, ['o-undercity'], ['under-initiative']),
	tag('under-initiative', ['o-dungeon']),
	tag(SHOCKLAND, [], ['cycle-rav-shockland']),
	tag('cycle-rav-shockland', ['o-breeding-pool']),
	tag('meme', ['o-claim']),
];

test('a job rolls up its whole subtree and drops pruned subtrees', () => {
	const { jobs, landFamilies } = buildJobIndex(FIXTURE);
	for (const id of ['o-harrow', 'o-cultivate', 'o-claim']) assert.deepEqual(jobs[id], ['tutor-land']);
	assert.equal(jobs['o-undercity'], undefined, 'take-the-initiative is pruned from tutor-land');
	assert.equal(jobs['o-dungeon'], undefined, 'and so is everything under it');
	assert.deepEqual(landFamilies['o-breeding-pool'], ['shockland'], 'families roll up their cycle tags');
	assert.ok(!Object.values(jobs).flat().includes('meme'), 'unlisted tags never enter');
});

test('pinned tags missing from the file are skipped, not fatal', () => {
	const { jobs } = buildJobIndex([]);
	assert.deepEqual(jobs, {});
});

function memoryStore(initial = null) {
	let value = initial;
	return { get: async () => value, set: async (v) => { value = v; }, peek: () => value };
}

function fakeFetch() {
	const calls = [];
	const gz = gzipSync(FIXTURE.map((t) => JSON.stringify(t)).join('\n') + '\n');
	const impl = async (url) => {
		calls.push(url);
		if (url.endsWith('/bulk-data')) {
			return { ok: true, json: async () => ({ data: [{ type: 'oracle_tags', jsonl_download_uri: 'https://data.scryfall.io/t.jsonl.gz' }] }) };
		}
		return new Response(gz, { headers: { 'content-type': 'application/gzip' } });
	};
	return { impl, calls };
}

test('downloads, gunzips and stores the index; the same day reuses it', async () => {
	const store = memoryStore();
	const { impl, calls } = fakeFetch();
	const now = new Date('2026-09-27T10:00:00Z');

	const first = await loadJobIndex({ store, fetchImpl: impl, now });
	assert.deepEqual(first.jobs['o-claim'], ['tutor-land']);
	assert.equal(store.peek().day, '2026-09-27');
	assert.equal(calls.length, 2);

	await loadJobIndex({ store, fetchImpl: impl, now: new Date('2026-09-27T23:59:00Z') });
	assert.equal(calls.length, 2, 'no second download the same day');

	await loadJobIndex({ store, fetchImpl: impl, now: new Date('2026-09-28T00:01:00Z') });
	assert.equal(calls.length, 4, 'a new day refreshes');
});

test('a failed download falls back to the stored index, else null', async () => {
	const failing = async () => { throw new Error('offline'); };
	const stale = { day: '2026-09-01', jobs: { x: ['tutor-land'] }, landFamilies: {} };

	assert.equal(await loadJobIndex({ store: memoryStore(stale), fetchImpl: failing }), stale);
	assert.equal(await loadJobIndex({ store: memoryStore(), fetchImpl: failing }), null);
});
