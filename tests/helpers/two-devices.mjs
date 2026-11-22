// Two devices, one cloud (#416). Each device is its own localStorage; the cloud
// is an in-memory stand-in for the Supabase tables storage.js reads and writes
// (prisms, decks, deck_cards via replace_deck_cards, planned_swaps,
// token_choices), with the schema's cascades and no updated_at triggers. Each device's clock is the
// mocked Date, so a scenario sets the time each action happens at, skew included.
//
// Import this before js/modules/*: it installs the globals the real module
// graph reads at import. node:test runs each file in its own process.
import { mock } from 'node:test';

const stores = { A: new Map(), B: new Map() };
let active = stores.A;
globalThis.localStorage = {
	getItem: (k) => (active.has(k) ? active.get(k) : null),
	setItem: (k, v) => active.set(k, String(v)),
	removeItem: (k) => active.delete(k),
	clear: () => active.clear(),
};

const tables = { prisms: new Map(), decks: new Map(), deck_cards: new Map(), planned_swaps: new Map(), token_choices: new Map() };
// token_choices has a composite primary key; every other table has `id`.
const keyOf = (table, r) => (table === 'token_choices' ? `${r.prism_id}|${r.kind}|${r.oracle_id}|${r.deck_id}` : r.id);
// Deck ids whose next replace_deck_cards call fails, as a dropped request would.
export const failCardsOnce = new Set();

function nest(row) {
	const decks = [...tables.decks.values()]
		.filter((d) => d.prism_id === row.id)
		.map((d) => ({ ...d, deck_cards: tables.deck_cards.get(d.id) || [] }));
	const planned_swaps = [...tables.planned_swaps.values()].filter((s) => s.prism_id === row.id);
	const token_choices = [...tables.token_choices.values()].filter((c) => c.prism_id === row.id);
	return { ...row, decks, planned_swaps, token_choices };
}

function remove(table, id) {
	tables[table].delete(id);
	if (table === 'prisms') {
		for (const d of [...tables.decks.values()]) if (d.prism_id === id) remove('decks', d.id);
		for (const s of [...tables.planned_swaps.values()]) if (s.prism_id === id) tables.planned_swaps.delete(s.id);
		for (const [k, c] of [...tables.token_choices]) if (c.prism_id === id) tables.token_choices.delete(k);
	}
	if (table === 'decks') {
		tables.deck_cards.delete(id);
		for (const s of [...tables.planned_swaps.values()]) if (s.deck_id === id) tables.planned_swaps.delete(s.id);
	}
}

// PostgREST-shaped builder: filters collect, awaiting runs the statement.
function from(table) {
	const filters = [];
	let action = 'select';
	let rows = [];
	let one = false;
	const run = () => {
		const match = () => [...tables[table].values()].filter((r) => filters.every((f) => f(r)));
		if (action === 'upsert') {
			for (const r of rows) tables[table].set(keyOf(table, r), { ...tables[table].get(keyOf(table, r)), ...structuredClone(r) });
			return { data: null, error: null };
		}
		if (action === 'delete') {
			for (const r of match()) remove(table, keyOf(table, r));
			return { data: null, error: null };
		}
		const data = match().map((r) => structuredClone(table === 'prisms' ? nest(r) : r));
		return { data: one ? (data[0] ?? null) : data, error: null };
	};
	const q = {
		select: () => q,
		order: () => q,
		eq: (col, val) => { filters.push((r) => r[col] === val); return q; },
		in: (col, vals) => { filters.push((r) => vals.includes(r[col])); return q; },
		maybeSingle: () => { one = true; return q; },
		upsert: (r) => { action = 'upsert'; rows = [].concat(r); return q; },
		delete: () => { action = 'delete'; return q; },
		then: (ok, err) => Promise.resolve().then(run).then(ok, err),
	};
	return q;
}

function rpc(name, args) {
	let result = { data: name === 'is_entitled' ? true : null, error: null };
	if (name === 'replace_deck_cards') {
		if (failCardsOnce.delete(args.p_deck_id)) result = { data: null, error: { message: 'network error' } };
		else tables.deck_cards.set(args.p_deck_id, structuredClone(args.p_cards));
	}
	const p = Promise.resolve(result);
	p.abortSignal = () => p;
	return p;
}

const client = {
	from,
	rpc,
	auth: {
		getSession: async () => ({ data: { session: { user: { id: 'u1' } } } }),
		onAuthStateChange: () => ({ data: { subscription: { unsubscribe() {} } } }),
	},
};

// window.supabase present => auth skips the CDN wait.
globalThis.window = {
	supabase: { createClient: () => client },
	location: { hash: '', pathname: '/build.html' },
	addEventListener: () => {},
	removeEventListener: () => {},
};
globalThis.document = { head: { querySelector: () => null } };

// Debounced syncs never fire on their own; a scenario syncs explicitly.
mock.timers.enable({ apis: ['setTimeout', 'Date'], now: Date.parse('2026-11-01T10:00:00.000Z') });

/** Run `fn` on device `name` with its clock reading `iso`. */
export async function on(name, iso, fn) {
	active = stores[name];
	mock.timers.setTime(Date.parse(iso));
	return fn();
}

/** Wipe both devices and the cloud. */
export function reset() {
	stores.A.clear();
	stores.B.clear();
	for (const t of Object.values(tables)) t.clear();
	failCardsOnce.clear();
	active = stores.A;
}

/** The cloud's copy of one PRISM row, nested the way PRISM_SELECT reads it. */
export const cloudRow = (prismId) => (tables.prisms.has(prismId) ? nest(tables.prisms.get(prismId)) : null);
