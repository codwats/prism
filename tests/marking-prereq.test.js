// The pre-marking warning (#476): dismissed per PRISM on this device, and
// retired for good once that PRISM has a mark. Device-only: never in the PRISM.
import test from 'node:test';
import assert from 'node:assert/strict';

const store = new Map();
globalThis.localStorage = {
	getItem: (k) => (store.has(k) ? store.get(k) : null),
	setItem: (k, v) => store.set(k, String(v)),
	removeItem: (k) => store.delete(k),
};
const { markingPrereqVisible, dismissMarkingPrereq } = await import('../js/core/marking-prereq.js');

const prism = (id, markedCards = []) => ({ id, markedCards });

test('shows for a PRISM with no marks and no dismissal', () => {
	store.clear();
	assert.equal(markingPrereqVisible(prism('a')), true);
});

test('dismissal sticks across reloads and stays per PRISM', () => {
	store.clear();
	dismissMarkingPrereq('a');
	assert.equal(markingPrereqVisible(prism('a')), false);
	assert.equal(markingPrereqVisible(prism('b')), true, 'a new PRISM shows it again');
});

test('first mark retires it, even after the marks are cleared', () => {
	store.clear();
	assert.equal(markingPrereqVisible(prism('a', ['Sol Ring'])), false);
	assert.equal(markingPrereqVisible(prism('a', [])), false);
});

test('blocked storage does not throw', () => {
	const real = globalThis.localStorage;
	globalThis.localStorage = {
		getItem() { throw new Error('blocked'); },
		setItem() { throw new Error('blocked'); },
	};
	assert.equal(markingPrereqVisible(prism('a', ['x'])), false);
	assert.equal(markingPrereqVisible(prism('a')), true);
	dismissMarkingPrereq('a');
	globalThis.localStorage = real;
});

test('does not touch the PRISM', () => {
	store.clear();
	const p = prism('a', ['x']);
	markingPrereqVisible(p);
	assert.deepEqual(p, { id: 'a', markedCards: ['x'] });
});
