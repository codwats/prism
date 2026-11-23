// The audit pass (#457) is device-only: its verdicts live under
// `prism_audit_<prismId>` and nothing it writes may reach prism_data,
// markedCards, the mark times or the PRISM a cloud save would upload.
import test from 'node:test';
import assert from 'node:assert/strict';

const store = new Map();
const realStorage = {
	getItem: (k) => (store.has(k) ? store.get(k) : null),
	setItem: (k, v) => store.set(k, String(v)),
	removeItem: (k) => store.delete(k),
	clear: () => store.clear(),
};
globalThis.localStorage = realStorage;
// renderResults reaches for the table header; no tbody, so it stops after filtering.
globalThis.document = { querySelector: () => null, getElementById: () => null };

const { createPrism, createDeck } = await import('../js/modules/processor.js');
const { state } = await import('../js/core/state.js');
const { setCardMarked } = await import('../js/features/deck-list.js');
const { renderResults } = await import('../js/features/results.js');
const { getScryCardKey } = await import('../js/features/scry-mode.js');
const { auditRows, auditOptions, wrongRows, loadAudit, auditStorageKey } = await import('../js/features/audit.js');

const card = (name, quantity = 1) => ({ name, quantity, isCommander: false, isBasicLand: false });

function setup({ oneMark = false } = {}) {
	store.clear();
	globalThis.localStorage = realStorage;
	const prism = createPrism('Audit');
	prism.decks = [
		createDeck({ id: 'A', name: 'Alpha', bracket: 3, color: '#FF0000', stripePosition: 1, cards: [
			card('Sol Ring'), card('Lightning Bolt'), card('Forest', 5), card('Island', 3),
		] }),
		createDeck({ id: 'B', name: 'Beta', bracket: 3, color: '#0000FF', stripePosition: 2, cards: [
			card('Sol Ring'), card('Forest', 2), card('Island', 3),
		] }),
	];
	state.currentPrism = prism;
	state.elements = { resultsFilter: { value: 'all' }, oneMarkFilter: { checked: oneMark }, resultsSearch: { value: '' } };
	renderResults();
	const keys = state.resultsView.map(getScryCardKey);
	// Every shown row but Lightning Bolt is Done; Lightning Bolt was ticked then
	// unticked, so an un-mark time exists for the audit to leave alone.
	for (const k of keys) setCardMarked(k, true);
	if (!oneMark) setCardMarked('Lightning Bolt', false);
	renderResults();
	return prism;
}

// Walk the rows the way the card-by-card screen does: onSkip for Wrong, onDone for Matches.
function runAudit(prism, wrongKeys) {
	const rows = auditRows(state.resultsView, prism.markedCards);
	const opts = auditOptions(prism.id, rows);
	for (const row of rows) {
		const key = getScryCardKey(row);
		(wrongKeys.includes(key) ? opts.onSkip : opts.onDone)(key, row);
	}
	return { rows, opts };
}

const snapshot = (prism) => ({
	storage: new Map(store),
	prism: JSON.stringify(prism),
	marked: [...prism.markedCards],
});

test('an audit with Matches and Wrong leaves markedCards, mark times and prism_data byte-identical', () => {
	const prism = setup();
	const forest = state.processedCards.find((c) => c.name === 'Forest');
	assert.equal(forest.batches.length, 2, 'Forest is multi-batch');
	const dataBefore = localStorage.getItem('prism_data');
	assert.ok(JSON.parse(dataBefore).prisms[prism.id].markTimes['Lightning Bolt'], 'an un-mark time exists');
	const before = snapshot(prism);

	const { rows } = runAudit(prism, ['Sol Ring', forest.batches[1].key]);
	assert.ok(rows.length >= 3 && !rows.some((r) => getScryCardKey(r) === 'Lightning Bolt'), 'only done rows are audited');

	assert.equal(localStorage.getItem('prism_data'), dataBefore);
	assert.equal(JSON.stringify(prism), before.prism, 'the PRISM a cloud save uploads is unchanged');
	assert.deepEqual(prism.markedCards, before.marked);

	// Every storage key but the audit key is untouched; the audit key is new.
	const auditKey = auditStorageKey(prism.id);
	assert.equal(before.storage.has(auditKey), false);
	for (const [k, v] of before.storage) assert.equal(store.get(k), v, k);
	assert.deepEqual([...store.keys()].filter((k) => !before.storage.has(k)), [auditKey]);
	assert.doesNotMatch(dataBefore, /prism_audit_|"wrong"|"match"/);
});

test('verdicts use the markedCards row keys: plain, batch and pass', () => {
	let prism = setup();
	const forest = state.processedCards.find((c) => c.name === 'Forest');
	runAudit(prism, ['Sol Ring']);
	const verdicts = loadAudit(prism.id);
	assert.equal(verdicts['Sol Ring'], 'wrong');
	for (const b of forest.batches) assert.equal(verdicts[b.key], 'match', b.key);
	assert.ok(Object.keys(verdicts).every((k) => prism.markedCards.includes(k)));

	prism = setup({ oneMark: true });
	runAudit(prism, ['Island|Beta']);
	assert.deepEqual(loadAudit(prism.id), {
		'Forest|Alpha': 'match', 'Forest|Beta': 'match', 'Island|Alpha': 'match', 'Island|Beta': 'wrong',
	});
});

test('wrong list: single-batch, multi-batch and pass rows, with their legend', () => {
	let prism = setup();
	const forest = state.processedCards.find((c) => c.name === 'Forest');
	const aOnly = forest.batches.find((b) => b.participantIds.length === 1);
	let { rows, opts } = runAudit(prism, ['Sol Ring', aOnly.key]);
	let wrong = wrongRows(rows, loadAudit(prism.id));
	assert.deepEqual(wrong.map((w) => [w.key, w.name, w.copies]), [
		...rows.filter((r) => ['Sol Ring', aOnly.key].includes(getScryCardKey(r))).map((r) => [getScryCardKey(r), r.name, r.copyCount || 1]),
	]);
	const legend = (key) => wrong.find((w) => w.key === key).legend.map((l) => l.text.replace(/^[^,]+, /, ''));
	assert.deepEqual(legend(aOnly.key), ['Alpha, Side A - Slot 1']);
	assert.deepEqual(legend('Sol Ring'), ['Alpha, Side A - Slot 1', 'Beta, Side A - Slot 2']);
	assert.equal(wrong.find((w) => w.key === aOnly.key).copies, 3);

	// A later run that finds the row matches drops it from the list.
	({ rows } = runAudit(prism, ['Sol Ring']));
	assert.deepEqual(wrongRows(rows, loadAudit(prism.id)).map((w) => w.key), ['Sol Ring']);

	prism = setup({ oneMark: true });
	({ rows, opts } = runAudit(prism, ['Island|Beta']));
	wrong = wrongRows(rows, loadAudit(prism.id));
	assert.deepEqual(wrong.map((w) => [w.key, w.name, w.copies]), [['Island|Beta', 'Island', 3]]);
	assert.deepEqual(wrong[0].legend.map((l) => l.text.replace(/^[^,]+, /, '')), ['Beta, Side A - Slot 2']);
	assert.equal(opts.title, 'Audit');
});

test('storage that throws: the audit still runs and lists its wrong rows', () => {
	const prism = setup();
	const dataBefore = localStorage.getItem('prism_data');
	const boom = () => { throw new Error('blocked'); };
	globalThis.localStorage = { getItem: boom, setItem: boom, removeItem: boom, clear: boom };
	try {
		const rows = auditRows(state.resultsView, prism.markedCards);
		const opts = auditOptions(prism.id, rows);
		for (const row of rows) {
			const key = getScryCardKey(row);
			(key === 'Sol Ring' ? opts.onSkip : opts.onDone)(key, row);
		}
		// escapeHtml goes through a DOM node; a pass-through stub is enough here.
		globalThis.document.createElement = () => ({ set textContent(v) { this.innerHTML = v; } });
		const el = { innerHTML: '' };
		opts.renderEnd(el);
		assert.match(el.innerHTML, /1 row to fix/);
		assert.match(el.innerHTML, /Sol Ring/);
		assert.deepEqual(loadAudit(prism.id), {});
	} finally {
		globalThis.localStorage = realStorage;
	}
	assert.equal(localStorage.getItem('prism_data'), dataBefore);
});
