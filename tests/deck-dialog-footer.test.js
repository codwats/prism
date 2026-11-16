/**
 * #472: the deck form's actions sit in the dialog footer while the form is
 * in the dialog, and go back inside the form for the inline empty state.
 */
import test from 'node:test';
import assert from 'node:assert/strict';

globalThis.localStorage = { getItem: () => null, setItem() {}, removeItem() {} };
globalThis.document = { activeElement: null, getElementById: () => null, querySelector: () => null, querySelectorAll: () => [] };
globalThis.window = { location: { hash: '' }, addEventListener() {}, removeEventListener() {} };

function node() {
	const n = {
		parentElement: null, attrs: {}, style: {}, hidden: false, value: '', textContent: '',
		append(c) { c.parentElement = n; },
		contains: () => false,
		setAttribute(k, v) { n.attrs[k] = v; },
		removeAttribute(k) { delete n.attrs[k]; },
		focus() {}, reset() {}, querySelector: () => null, querySelectorAll: () => []
	};
	Object.defineProperty(n, 'slot', { get: () => n.attrs.slot ?? '', set(v) { n.attrs.slot = v; } });
	return n;
}

const { state } = await import('../js/core/state.js');
const { createPrism } = await import('../js/modules/processor.js');
const { placeDeckForm } = await import('../js/features/deck-form.js');

test('actions are the dialog footer once the PRISM has a deck, and return to the form when it empties', () => {
	const real = { deckForm: node(), deckFormActions: node(), deckFormInlineHost: node(), deckDialog: node(), addDeckCard: node(), addDeckBar: node(), btnCancelDeckForm: node() };
	// Other form fields only need to exist
	const els = new Proxy(real, { get: (t, k) => (k in t ? t[k] : (t[k] = node())) });
	state.elements = els;
	state.currentPrism = createPrism('T');

	placeDeckForm();
	assert.equal(els.deckForm.parentElement, els.deckFormInlineHost);
	assert.equal(els.deckFormActions.parentElement, els.deckForm, 'inline: actions end the form');
	assert.equal(els.deckFormActions.slot, '');

	state.currentPrism.decks.push({ id: 'd1', name: 'A', stripePosition: 1, cards: [] });
	placeDeckForm();
	assert.equal(els.deckForm.parentElement, els.deckDialog);
	assert.equal(els.deckFormActions.parentElement, els.deckDialog, 'dialog: actions are a dialog child');
	assert.equal(els.deckFormActions.slot, 'footer');

	state.currentPrism.decks.length = 0;
	placeDeckForm();
	assert.equal(els.deckFormActions.parentElement, els.deckForm);
	assert.equal(els.deckFormActions.slot, '');
});
