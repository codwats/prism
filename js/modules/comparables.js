/**
 * Swap Planner ranking (#295): which decks an incoming card fits, and which
 * cards already in those decks are comparable — could be the outgoing card of
 * a Swap. Pure: attributes and the job index are passed in.
 *
 * Rules (#274, #276, #287): same main type with any shared job, ranked by job
 * overlap then closest mana value; "Look beyond" takes other types that do
 * every job of the incoming card; lands compare by color identity then land
 * family and never cross types. Tags rank only — no job name leaves here.
 */

import { processCards } from "./processor.js";
import { isBasicLand, normalizeCardName } from "./parser.js";
import { deckColorIdentity } from "./scryfall.js";
import { canSleeveSwap } from "./swap.js";

// A card's main type, most specific first: an Artifact Creature is a creature,
// an Artifact Land a land. Multi-face cards use the front face.
const MAIN_TYPES = ['Land', 'Creature', 'Planeswalker', 'Battle', 'Instant', 'Sorcery', 'Artifact', 'Enchantment'];
export function mainType(typeLine = '') {
  const types = typeLine.split(' // ')[0].split('—')[0];
  return MAIN_TYPES.find((t) => types.includes(t)) || null;
}

// |A ∩ B| / |A ∪ B|; two empty sets (colorless vs colorless) are identical.
function overlap(a, b) {
  const setB = new Set(b);
  const shared = a.filter((x) => setB.has(x)).length;
  const union = new Set([...a, ...b]).size;
  return union === 0 ? 1 : shared / union;
}

const sameName = (a, b) => normalizeCardName(a) === normalizeCardName(b);

/**
 * @param {Object} prism
 * @param {{ name: string, colorIdentity: string[], typeLine: string, cmc: number, oracleId: string }} incoming
 * @param {Map} attributes - getCardAttributes result covering the commanders and
 *   every card in the eligible decks
 * @param {{ jobs: Object, landFamilies: Object }|null} jobIndex - loadJobIndex result
 * @returns {{
 *   reason: 'basic-land'|null,
 *   eligibleDecks: { deckId: string, identityUnknown: boolean }[],
 *   sameType: { noNewMarks: Row[], otherSwaps: Row[] },
 *   differentJob: { noNewMarks: Row[], otherSwaps: Row[] },
 *   lookBeyond: { noNewMarks: Row[], otherSwaps: Row[] }|null,
 *   unmatched: number,
 * }}
 * Row: { name, typeLine, cmc, deckIds } — in noNewMarks, deckIds are one
 * marking batch's participants and `copyCount` is its size.
 */
export function rankComparables(prism, incoming, attributes, jobIndex) {
  const empty = { reason: null, eligibleDecks: [], sameType: { noNewMarks: [], otherSwaps: [] }, differentJob: { noNewMarks: [], otherSwaps: [] }, lookBeyond: null, unmatched: 0 };
  if (isBasicLand(incoming.name)) return { ...empty, reason: 'basic-land' };

  // Decks the incoming card fits and doesn't already run. An unknown identity
  // is listed, not filtered.
  const eligibleDecks = [];
  for (const deck of prism.decks) {
    if (deck.cards.some((c) => sameName(c.name, incoming.name))) continue;
    const identity = deckColorIdentity(deck, attributes);
    if (identity && !incoming.colorIdentity.every((c) => identity.includes(c))) continue;
    eligibleDecks.push({ deckId: deck.id, identityUnknown: !identity });
  }

  // Outgoing candidates: a single, non-basic, non-commander copy in an
  // eligible deck (#274). name → deck ids.
  const eligibleIds = new Set(eligibleDecks.map((d) => d.deckId));
  const candidates = new Map();
  for (const deck of prism.decks) {
    if (!eligibleIds.has(deck.id)) continue;
    for (const card of deck.cards) {
      if (card.isCommander || card.isBasicLand || card.quantity !== 1) continue;
      if (!candidates.has(card.name)) candidates.set(card.name, new Set());
      candidates.get(card.name).add(deck.id);
    }
  }

  const processed = new Map(processCards(prism).map((c) => [c.name, c]));
  const jobsOf = (attrs) => (attrs && jobIndex?.jobs[attrs.oracleId]) || [];
  const familiesOf = (attrs) => (attrs && jobIndex?.landFamilies[attrs.oracleId]) || [];

  // A comparable card's rows: a Sleeve swap per marking batch it fills
  // entirely, then a plain-Swap row for the decks left over.
  const rowsFor = (name, attrs, deckIds, sections) => {
    const base = { name, typeLine: attrs.typeLine, cmc: attrs.cmc };
    const left = new Set(deckIds);
    for (const batch of processed.get(name)?.batches || []) {
      if (!batch.participantIds.every((id) => left.has(id))) continue;
      if (!canSleeveSwap(prism, batch, { outgoing: name, incoming: incoming.name })) continue;
      sections.noNewMarks.push({ ...base, deckIds: batch.participantIds, copyCount: batch.copyCount });
      batch.participantIds.forEach((id) => left.delete(id));
    }
    if (left.size) sections.otherSwaps.push({ ...base, deckIds: [...left] });
  };

  const type = mainType(incoming.typeLine);
  const incomingJobs = type === 'Land' ? [] : jobsOf(incoming);
  const incomingFamilies = familiesOf(incoming);
  const cmcGap = (attrs) => Math.abs(attrs.cmc - incoming.cmc);

  let unmatched = 0;
  const sameType = [];
  const differentJob = [];
  const beyond = [];
  for (const [name, deckIds] of candidates) {
    const attrs = attributes.get(name);
    if (!attrs) {
      unmatched++;
      continue;
    }
    const candidateType = mainType(attrs.typeLine);
    const entry = { name, attrs, deckIds };
    if (type === 'Land') {
      if (candidateType !== 'Land') continue;
      entry.keys = [-overlap(incoming.colorIdentity, attrs.colorIdentity), -overlap(incomingFamilies, familiesOf(attrs)), cmcGap(attrs)];
      sameType.push(entry);
      continue;
    }
    if (candidateType === 'Land') continue;
    const jobs = jobsOf(attrs);
    const jobOverlap = incomingJobs.length ? overlap(incomingJobs, jobs) : 0;
    entry.keys = [-jobOverlap, cmcGap(attrs)];
    if (candidateType === type) {
      (incomingJobs.length && jobOverlap === 0 ? differentJob : sameType).push(entry);
    } else if (incomingJobs.length && incomingJobs.every((j) => jobs.includes(j))) {
      beyond.push(entry);
    }
  }

  const byKeys = (a, b) => {
    for (let i = 0; i < a.keys.length; i++) if (a.keys[i] !== b.keys[i]) return a.keys[i] - b.keys[i];
    return a.name.localeCompare(b.name);
  };
  const toSections = (entries) => {
    const sections = { noNewMarks: [], otherSwaps: [] };
    for (const e of entries.sort(byKeys)) rowsFor(e.name, e.attrs, e.deckIds, sections);
    return sections;
  };

  return {
    reason: null,
    eligibleDecks,
    sameType: toSections(sameType),
    differentJob: toSections(differentJob),
    lookBeyond: incomingJobs.length ? toSections(beyond) : null,
    unmatched,
  };
}
