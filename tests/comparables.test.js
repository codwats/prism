import test from 'node:test';
import assert from 'node:assert/strict';

const store = new Map();
globalThis.localStorage = {
	getItem: (k) => (store.has(k) ? store.get(k) : null),
	setItem: (k, v) => store.set(k, String(v)),
	removeItem: (k) => store.delete(k),
	clear: () => store.clear(),
};

const { createPrism, createDeck } = await import('../js/modules/processor.js');
const { rankComparables, mainType } = await import('../js/modules/comparables.js');

// name → [colorIdentity, typeLine, cmc, jobs, landFamilies]
const CARDS = {
	'Omnath, Locus of Mana': [['G'], 'Legendary Creature — Elemental', 3, ['land-ramp', 'tutor-land']],
	'Meren of Clan Nel Toth': [['B', 'G'], 'Legendary Creature — Human Shaman', 4],
	'Talrand, Sky Summoner': [['U'], 'Legendary Creature — Merfolk Wizard', 4],
	'Skyshroud Claim': [['G'], 'Sorcery', 4, ['land-ramp', 'tutor-land']],
	'Explosive Vegetation': [['G'], 'Sorcery', 4, ['land-ramp', 'tutor-land']],
	'Cultivate': [['G'], 'Sorcery', 3, ['land-ramp', 'tutor-land']],
	"Kodama's Reach": [['G'], 'Sorcery — Arcane', 3, ['land-ramp', 'tutor-land']],
	'Rampant Growth': [['G'], 'Sorcery', 2, ['land-ramp', 'tutor-land']],
	'Gamble': [['R'], 'Sorcery', 1, ['tutor-card']],
	'Harrow': [['G'], 'Instant', 3, ['land-ramp', 'tutor-land']],
	'Sakura-Tribe Elder': [['G'], 'Creature — Snake Shaman', 2, ['land-ramp', 'tutor-land', 'sacrifice-outlet']],
	'Llanowar Elves': [['G'], 'Creature — Elf Druid', 1, ['mana-dork']],
	'Dryad Arbor': [['G'], 'Land Creature — Forest Dryad', 0],
	'Overgrown Tomb': [['B', 'G'], 'Land — Swamp Forest', 0, [], ['shockland', 'conditional-tapland']],
	'Woodland Cemetery': [['B', 'G'], 'Land', 0, [], ['conditional-tapland']],
	'Llanowar Wastes': [['B', 'G'], 'Land', 0, [], ['painland']],
	'Command Tower': [[], 'Land', 0, [], ['rainbow-land']],
};

const attrs = (name) => {
	const [colorIdentity, typeLine, cmc] = CARDS[name];
	return { colorIdentity, typeLine, cmc, oracleId: `o-${name}` };
};
const attributes = new Map([...Object.keys(CARDS).map((n) => [n, attrs(n)]), ['Unknown Commander', null], ['Mystery Card', null]]);
const JOB_INDEX = { jobs: {}, landFamilies: {} };
for (const [name, [, , , jobs = [], families = []]] of Object.entries(CARDS)) {
	if (jobs.length) JOB_INDEX.jobs[`o-${name}`] = jobs;
	if (families.length) JOB_INDEX.landFamilies[`o-${name}`] = families;
}

const c = (name, quantity = 1, isCommander = false) => ({ name, quantity, isCommander, isBasicLand: name === 'Forest' });
const deck = (name, pos, cards) => createDeck({ name, bracket: 3, color: '#00FF00', stripePosition: pos, cards });

function fixture({ claimDeck = false } = {}) {
	const prism = createPrism('T');
	const G = deck('G', 1, [
		c('Omnath, Locus of Mana', 1, true), c('Explosive Vegetation'), c('Cultivate'), c("Kodama's Reach"),
		c('Rampant Growth'), c('Gamble'), c('Harrow'), c('Sakura-Tribe Elder'), c('Llanowar Elves'),
		c('Dryad Arbor'), c('Forest', 30), c('Mystery Card'),
	]);
	const BG = deck('BG', 2, [
		c('Meren of Clan Nel Toth', 1, true), c('Cultivate'), c('Rampant Growth', 2),
		c('Woodland Cemetery'), c('Llanowar Wastes'), c('Command Tower'),
	]);
	const U = deck('U', 3, [c('Talrand, Sky Summoner', 1, true), c("Kodama's Reach")]);
	const unknown = deck('?', 4, [c('Unknown Commander', 1, true), c('Harrow')]);
	const hasClaim = deck('Claim', 5, [c('Omnath, Locus of Mana', 1, true), c('Skyshroud Claim')]);
	prism.decks = [G, BG, U, unknown, ...(claimDeck ? [hasClaim] : [])];
	return { prism, G, BG, U, unknown };
}

const names = (rows) => rows.map((r) => r.name);

test('main type picks the most specific type of the front face', () => {
	assert.equal(mainType('Artifact Creature — Golem'), 'Creature');
	assert.equal(mainType('Land Creature — Forest Dryad'), 'Land');
	assert.equal(mainType('Kindred Instant — Elf'), 'Instant');
	assert.equal(mainType('Sorcery // Instant'), 'Sorcery');
	assert.equal(mainType('Legendary Enchantment — Saga'), 'Enchantment');
});

test('a basic land is not an incoming card', () => {
	const { prism } = fixture();
	const result = rankComparables(prism, { name: 'Forest', colorIdentity: ['G'], typeLine: 'Basic Land — Forest', cmc: 0 }, attributes, JOB_INDEX);
	assert.equal(result.reason, 'basic-land');
});

test('eligible decks: identity fits, not already running it; unknown identity listed', () => {
	const { prism, G, BG, unknown } = fixture({ claimDeck: true });
	const result = rankComparables(prism, { name: 'Skyshroud Claim', ...attrs('Skyshroud Claim') }, attributes, JOB_INDEX);
	assert.deepEqual(result.eligibleDecks, [
		{ deckId: G.id, identityUnknown: false },
		{ deckId: BG.id, identityUnknown: false },
		{ deckId: unknown.id, identityUnknown: true },
	]);
	assert.equal(result.unmatched, 1, 'Mystery Card');
});

test('same type: Sleeve swaps first, ranked by job overlap then mana value', () => {
	const { prism, G, BG } = fixture();
	const { sameType, differentJob, lookBeyond } = rankComparables(prism, { name: 'Skyshroud Claim', ...attrs('Skyshroud Claim') }, attributes, JOB_INDEX);

	// Explosive Vegetation (G only) and Cultivate (G + BG) each fill a whole batch.
	assert.deepEqual(names(sameType.noNewMarks), ['Explosive Vegetation', 'Cultivate']);
	assert.deepEqual(sameType.noNewMarks[1].deckIds, [G.id, BG.id].sort());
	assert.equal(sameType.noNewMarks[1].copyCount, 1);

	// Kodama's Reach shares its batch with U (not eligible); Rampant Growth's
	// batch includes BG's second copy. Both are plain Swaps in G only.
	assert.deepEqual(names(sameType.otherSwaps), ["Kodama's Reach", 'Rampant Growth']);
	assert.deepEqual(sameType.otherSwaps.map((r) => r.deckIds), [[G.id], [G.id]]);

	assert.deepEqual(names(differentJob.noNewMarks), ['Gamble']);

	// Every job of the incoming card; the commander never; Llanowar Elves lacks a job.
	assert.deepEqual(names([...lookBeyond.noNewMarks, ...lookBeyond.otherSwaps]), ['Harrow', 'Sakura-Tribe Elder']);
	assert.ok(!JSON.stringify({ sameType, lookBeyond }).includes('land-ramp'), 'no job name leaves ranking');
});

test('an incoming card already in the PRISM still gets its Sleeve swap rows (#309)', () => {
	const incoming = { name: 'Skyshroud Claim', ...attrs('Skyshroud Claim') };
	const withClaim = rankComparables(fixture({ claimDeck: true }).prism, incoming, attributes, JOB_INDEX).sameType;
	const without = rankComparables(fixture().prism, incoming, attributes, JOB_INDEX).sameType;
	assert.ok(withClaim.noNewMarks.length > 0);
	assert.deepEqual(names(withClaim.noNewMarks), names(without.noNewMarks));
	assert.deepEqual(names(withClaim.otherSwaps), names(without.otherSwaps), 'no duplicate "add a mark" rows');
});

test('no jobs (or no index): type + mana value only, Look beyond hidden', () => {
	const { prism } = fixture();
	const result = rankComparables(prism, { name: 'Skyshroud Claim', ...attrs('Skyshroud Claim') }, attributes, null);
	const all = names([...result.sameType.noNewMarks, ...result.sameType.otherSwaps]);
	assert.ok(all.includes('Gamble'), 'no job filter without an index');
	assert.equal(result.lookBeyond, null);
	assert.deepEqual(result.differentJob, { noNewMarks: [], otherSwaps: [] });
});

test('lands: color identity, then land family; never other types', () => {
	const { prism } = fixture();
	const result = rankComparables(prism, { name: 'Overgrown Tomb', ...attrs('Overgrown Tomb') }, attributes, JOB_INDEX);
	const rows = [...result.sameType.noNewMarks, ...result.sameType.otherSwaps];
	assert.deepEqual(names(result.sameType.noNewMarks), ['Woodland Cemetery', 'Llanowar Wastes', 'Command Tower']);
	assert.ok(!names(rows).includes('Cultivate'));
	assert.equal(result.lookBeyond, null);
});
