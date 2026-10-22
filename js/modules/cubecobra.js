/**
 * PRISM CubeCobra Integration (#196)
 * Imports a cube as one deck per pack, where a pack is a card tag.
 * The API sends `access-control-allow-origin: *`, so no edge proxy.
 */

import { isBasicLand } from './parser.js';
import { DEFAULT_COLORS, MAX_STRIPE_SLOTS } from './processor.js';

/**
 * Extract a cube id from a CubeCobra URL or a bare slug/UUID
 * @param {string} input
 * @returns {string|null}
 */
export function extractCubeCobraId(input) {
  if (!input || typeof input !== 'string') return null;
  const trimmed = input.trim();

  // https://cubecobra.com/cube/overview/<id> (also list, about, playtest, ...)
  const urlMatch = trimmed.match(/cubecobra\.com\/cube\/[a-z]+\/([A-Za-z0-9_-]+)/i);
  if (urlMatch) return urlMatch[1];

  if (/^[A-Za-z0-9_-]+$/.test(trimmed)) return trimmed;
  return null;
}

/**
 * Fetch a cube's JSON straight from CubeCobra
 * @param {string} cubeId
 * @returns {Promise<Object>}
 */
export async function fetchCube(cubeId) {
  const response = await fetch(`https://cubecobra.com/cube/api/cubeJSON/${encodeURIComponent(cubeId)}`);
  if (response.status === 404) throw new Error('Cube not found or private.');
  if (response.status === 429) throw new Error('CubeCobra is rate limiting, try again in a minute.');
  if (!response.ok) throw new Error(`Failed to fetch cube: ${response.status}`);
  return response.json();
}

function mainboard(cubeJson) {
  const rows = cubeJson?.cards?.mainboard;
  return Array.isArray(rows) ? rows : [];
}

/**
 * Every tag on the mainboard with its row count, in first-seen order
 * @param {Object} cubeJson
 * @returns {{ tag: string, count: number }[]}
 */
export function cubeTags(cubeJson) {
  const counts = new Map();
  for (const row of mainboard(cubeJson)) {
    for (const tag of row.tags || []) counts.set(tag, (counts.get(tag) || 0) + 1);
  }
  return [...counts].map(([tag, count]) => ({ tag, count }));
}

/**
 * Group mainboard rows into packs, one per ticked tag. A row with several
 * ticked tags goes in each of those packs; a row with none is skipped.
 * @param {Object} cubeJson
 * @param {string[]} packTags
 * @returns {{ packs: { name: string, cards: Object[] }[], skipped: number }}
 */
export function cubeToPacks(cubeJson, packTags) {
  const packs = new Map(packTags.map(tag => [tag, new Map()]));
  let skipped = 0;

  for (const row of mainboard(cubeJson)) {
    // details.name is already the canonical Scryfall name; there is no row.name
    const name = row.details?.name;
    const tags = (row.tags || []).filter(tag => packs.has(tag));
    if (!name || tags.length === 0) {
      skipped++;
      continue;
    }
    // One row per physical card, so quantity is the row count
    for (const tag of tags) {
      const cards = packs.get(tag);
      const existing = cards.get(name);
      if (existing) existing.quantity++;
      else cards.set(name, { name, quantity: 1, isCommander: false, isBasicLand: isBasicLand(name) });
    }
  }

  return {
    packs: [...packs].map(([tag, cards]) => ({ name: tag, cards: [...cards.values()] })),
    skipped,
  };
}

/**
 * Build PRISM-JSON (the backup shape buildPrismFromJson reads) from packs
 * @param {string} cubeName
 * @param {{ name: string, cards: Object[] }[]} packs
 * @returns {Object}
 */
export function packsToPrismJson(cubeName, packs) {
  if (packs.length === 0) throw new Error('Tick at least one tag to import.');
  if (packs.length > MAX_STRIPE_SLOTS) {
    throw new Error(`This cube has ${packs.length} packs; a PRISM holds ${MAX_STRIPE_SLOTS}.`);
  }
  return {
    name: cubeName || 'CubeCobra cube',
    decks: packs.map((pack, i) => ({
      name: pack.name,
      bracket: 2, // meaningless for packs
      color: DEFAULT_COLORS[i % DEFAULT_COLORS.length],
      stripePosition: i + 1,
      cards: pack.cards,
    })),
  };
}
