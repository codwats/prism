// Scryfall API client with caching and rate limiting
import { logToSupabase } from './supabase-client.js';

const CACHE_KEY = 'scryfall_card_cache';
const CACHE_TTL = 24 * 60 * 60 * 1000; // 24 hours
// Every request on the chain below is /cards/named or /cards/collection,
// which Scryfall limits to 2 per second (#279). Autocomplete (10/s) stays
// off the chain.
const REQUEST_DELAY = 500; // ms between requests
const API_BASE = 'https://api.scryfall.com';

// Rate limiting state
const requestQueue = [];
let isProcessing = false;

// Sleep utility
function sleep(ms) {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

// Every Scryfall request — the single-card queue and the batched
// /cards/collection POSTs — awaits this one promise chain. A bare shared
// timestamp is not a lock: two loops read it, sleep to the same deadline and
// fire in the same tick, doubling the effective rate. The chain serializes
// them; `lastRelease` is only touched inside it, so it cannot be raced, and it
// keeps naturally-spaced requests (the first one, or one after a slow fetch)
// from paying a delay they don't owe.
let gate = Promise.resolve();
let lastRelease = 0;
function rateLimit(ms = REQUEST_DELAY) {
  gate = gate.then(async () => {
    const owed = ms - (Date.now() - lastRelease);
    if (owed > 0) await sleep(owed);
    lastRelease = Date.now();
  });
  return gate;
}

// Load cache from localStorage
function loadCache() {
  try {
    const cached = localStorage.getItem(CACHE_KEY);
    return cached ? JSON.parse(cached) : {};
  } catch {
    return {};
  }
}

// Save cache to localStorage
function saveCache(cache) {
  try {
    localStorage.setItem(CACHE_KEY, JSON.stringify(cache));
  } catch {
    // localStorage full — evict and retry once. Must not re-enter saveCache:
    // if nothing is expired, saveCache → clearExpiredCache → saveCache would
    // recurse until the stack overflows.
    console.warn('Scryfall cache full, evicting entries');
    const now = Date.now();
    let entries = Object.entries(cache).filter(([, v]) => now - v.cached_at < CACHE_TTL);
    // Still too big? Keep only the newest half.
    entries.sort((a, b) => b[1].cached_at - a[1].cached_at);
    for (let keep = entries.length; ; keep = Math.floor(keep / 2)) {
      try {
        localStorage.setItem(CACHE_KEY, JSON.stringify(Object.fromEntries(entries.slice(0, keep))));
        return;
      } catch {
        if (keep === 0) {
          // Even an empty cache won't fit (quota consumed elsewhere) — give up.
          localStorage.removeItem(CACHE_KEY);
          return;
        }
      }
    }
  }
}

// Fetched cards not yet written to localStorage. Writing re-serializes the
// whole cache, so the queue saves once when it drains instead of per card (#282).
let pendingCards = {};

// Get cached card if still fresh
function getCachedCard(cardName) {
  const normalizedName = cardName.toLowerCase().trim();
  const entry = pendingCards[normalizedName] || loadCache()[normalizedName];

  if (entry && Date.now() - entry.cached_at < CACHE_TTL) {
    return entry;
  }

  return null;
}

// Cache a card (in memory until flushCards)
function cacheCard(cardName, data) {
  pendingCards[cardName.toLowerCase().trim()] = {
    ...data,
    cached_at: Date.now(),
  };
}

// Write pending cards in one save. Reloads first so entries another tab
// wrote in the meantime survive.
function flushCards() {
  if (!Object.keys(pendingCards).length) return;
  saveCache({ ...loadCache(), ...pendingCards });
  pendingCards = {};
}

// A 429 locks the client out for 30 s (Scryfall's documented penalty), so a
// retry inside that window fails too (#280). Nothing is retried: the request
// that hit the 429 fails, and every request until the lockout ends fails
// without reaching Scryfall. Every request path goes through here.
const LOCKOUT_MS = 30_000;
let lockedUntil = 0;
async function scryfallFetch(url, options) {
  // Checked before the gate so a locked-out request doesn't hold a 500 ms
  // slot just to fail, and after it for requests already waiting at the 429.
  const lockedOut = () => Date.now() < lockedUntil;
  if (lockedOut()) throw new Error('Rate limited by Scryfall');
  await rateLimit();
  if (lockedOut()) throw new Error('Rate limited by Scryfall');
  let response;
  try {
    response = await fetch(url, options);
  } catch (error) {
    // Scryfall's 429 carries no CORS headers, so a browser sees a network
    // error, never status 429. Lock out on it too, or the queue keeps firing.
    lockedUntil = Date.now() + LOCKOUT_MS;
    throw error;
  }
  if (response.status === 429) {
    lockedUntil = Date.now() + LOCKOUT_MS;
    logToSupabase('warn', 'scryfall_rate_limited', { url }).catch(() => {});
    throw new Error('Rate limited by Scryfall');
  }
  return response;
}

// Fetch from Scryfall API
async function fetchFromScryfall(cardName) {
  const encodedName = encodeURIComponent(cardName);
  const url = `${API_BASE}/cards/named?exact=${encodedName}`;

  const response = await scryfallFetch(url);

  if (response.status === 404) {
    const fuzzyUrl = `${API_BASE}/cards/named?fuzzy=${encodedName}`;
    const fuzzyResponse = await scryfallFetch(fuzzyUrl);

    if (!fuzzyResponse.ok) {
      throw new Error(`Card not found: ${cardName}`);
    }

    return fuzzyResponse.json();
  }

  if (!response.ok) {
    throw new Error(`Scryfall API error: ${response.status}`);
  }

  return response.json();
}

// Process the request queue with rate limiting
async function processQueue() {
  if (isProcessing || requestQueue.length === 0) return;
  isProcessing = true;

  while (requestQueue.length > 0) {
    const { cardName, resolve, reject } = requestQueue.shift();

    try {
      const scryfallData = await fetchFromScryfall(cardName);
      const result = extractCardData(scryfallData);
      if (result.image_uri) {
        cacheCard(cardName, result);
        // Also cache under Oracle name if different (e.g. front-face lookup → full DFC name)
        if (result.name && result.name.toLowerCase().trim() !== cardName.toLowerCase().trim()) {
          cacheCard(result.name, result);
        }
      }
      resolve(result);
    } catch (error) {
      reject(error);
    }
  }

  flushCards();
  isProcessing = false;
}

// Extract relevant data from Scryfall response
function extractCardData(data) {
  // Handle double-faced cards
  let imageUri = null;
  if (data.image_uris) {
    imageUri = data.image_uris.normal;
  } else if (data.card_faces && data.card_faces[0].image_uris) {
    // Use front face for double-faced cards
    imageUri = data.card_faces[0].image_uris.normal;
  }

  return {
    name: data.name,
    image_uri: imageUri,
    scryfall_uri: data.scryfall_uri,
    type_line: data.type_line,
    // Transform cards and MDFCs carry their cost on the faces.
    mana_cost: data.mana_cost || data.card_faces?.[0]?.mana_cost,
  };
}

// Fetch a single card (with caching and rate limiting)
export function fetchCard(cardName) {
  return new Promise((resolve, reject) => {
    // Check cache first
    const cached = getCachedCard(cardName);
    if (cached) {
      resolve(cached);
      return;
    }

    // Add to queue
    requestQueue.push({ cardName, resolve, reject });
    processQueue();
  });
}

// Prefetch multiple cards (for batch loading)
export async function prefetchCards(cardNames) {
  const uncached = cardNames.filter((name) => !getCachedCard(name));

  // Queue them all at once so the queue drains, and saves, once.
  await Promise.all(uncached.map((cardName) => fetchCard(cardName).catch((error) => {
    console.warn(`Failed to prefetch ${cardName}:`, error.message);
  })));
}

// Canonicalize card names via Scryfall's /cards/collection endpoint.
// Corrects spelling/capitalization and normalizes multi-face names to the
// Oracle name ("fire" → "Fire // Ice").
// Mutates the cards array in place, setting each card's name to the Oracle name.
const COLLECTION_BATCH_SIZE = 75; // Scryfall's max per request

// Separate cache for canonical name lookups
const CANONICAL_CACHE_KEY = 'scryfall_canonical_cache';

function loadCanonicalCache() {
  try {
    const cached = localStorage.getItem(CANONICAL_CACHE_KEY);
    return cached ? JSON.parse(cached) : {};
  } catch {
    return {};
  }
}

function saveCanonicalCache(cache) {
  try {
    localStorage.setItem(CANONICAL_CACHE_KEY, JSON.stringify(cache));
  } catch {
    console.warn('Canonical name cache full');
  }
}

export async function canonicalizeCards(cards) {
  if (!cards || cards.length === 0) return cards;

  const canonCache = loadCanonicalCache();
  const uncachedCards = [];
  const uncachedIndices = [];

  // Check cache first
  for (let i = 0; i < cards.length; i++) {
    const key = cards[i].name.toLowerCase().trim();
    if (canonCache[key]) {
      cards[i].name = canonCache[key];
    } else {
      uncachedCards.push(cards[i]);
      uncachedIndices.push(i);
    }
  }

  if (uncachedCards.length === 0) return cards;

  // Batch lookup uncached cards
  for (let batch = 0; batch < uncachedCards.length; batch += COLLECTION_BATCH_SIZE) {
    const chunk = uncachedCards.slice(batch, batch + COLLECTION_BATCH_SIZE);
    // Name identifiers match face names only, so a full "A // B" name always
    // comes back not_found — send the front face (#281).
    const identifiers = chunk.map(c => ({ name: c.name.split(' // ')[0] }));

    try {
      const response = await scryfallFetch(`${API_BASE}/cards/collection`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ identifiers }),
      });

      if (!response.ok) {
        console.warn(`Scryfall collection lookup failed: ${response.status}`);
        continue;
      }

      const data = await response.json();

      // Build a lookup from the response: input name → Oracle name
      // Scryfall returns results in data.data (found) and data.not_found (misses)
      const oracleMap = new Map();
      for (const card of (data.data || [])) {
        // Map the card's full name and front face name to the Oracle name
        const oracleName = card.name; // Scryfall always returns the Oracle name
        oracleMap.set(card.name.toLowerCase().trim(), oracleName);

        // Also map front face only for DFCs
        if (card.name.includes(' // ')) {
          const frontFace = card.name.split(' // ')[0].toLowerCase().trim();
          oracleMap.set(frontFace, oracleName);
        }
      }

      // Apply Oracle names to the chunk and update cache
      for (let j = 0; j < chunk.length; j++) {
        const originalKey = chunk[j].name.toLowerCase().trim();
        const frontKey = chunk[j].name.split(' // ')[0].toLowerCase().trim();
        const oracleName = oracleMap.get(originalKey) || oracleMap.get(frontKey);

        if (oracleName) {
          const globalIndex = uncachedIndices[batch + j];
          cards[globalIndex].name = oracleName;
          canonCache[originalKey] = oracleName;
          if (frontKey !== originalKey) {
            canonCache[frontKey] = oracleName;
          }
        }
      }
    } catch (err) {
      console.warn('Scryfall canonicalization batch failed:', err.message);
    }
  }

  saveCanonicalCache(canonCache);
  return cards;
}

// Card attributes for the Swap Planner (#273/#293): color identity, type
// line, mana cost, mana value and oracle id. Scryfall data, not user data — kept in its
// own localStorage key, never synced, no expiry (stale data only skews a
// ranking, never a mark). Misses are not cached so a later name fix heals.
const ATTRIBUTES_KEY = 'prism_card_attributes';
const attributeKey = (name) => name.toLowerCase().trim();

// The never-expiring Scryfall caches: card attributes and Token types (#412).
function loadScryfallCache(key) {
  try {
    return JSON.parse(localStorage.getItem(key)) || {};
  } catch {
    return {};
  }
}

function saveScryfallCache(cache, key) {
  try {
    localStorage.setItem(key, JSON.stringify(cache));
  } catch {
    // Out of space: this cache gives way, never prism_data.
    localStorage.removeItem(key);
  }
}

/**
 * Look up attributes for card names, fetching only uncached ones through
 * /cards/collection (75 per request, on the shared rate chain). Multi-face
 * names are sent as their front face.
 * @param {string[]} names
 * @returns {Promise<Map<string, {colorIdentity: string[], typeLine: string, manaCost: string, cmc: number, oracleId: string, usd: number|null, tokens: Array<{id: string, name: string}>}|null>>}
 *   keyed by the input name; null = Scryfall couldn't match it
 * @throws when a request fails (network, 429, 5xx), so a failure never reads as a miss
 */
export async function getCardAttributes(names) {
  const cache = loadScryfallCache(ATTRIBUTES_KEY);
  const asWritten = new Map(names.map((n) => [attributeKey(n), n]));
  // Entries cached before manaCost or usd joined the record, or before it fell back
  // to the front face (a nonland multi-face card with no cost), are fetched again once.
  const stale = (a) => !('manaCost' in a) || !('usd' in a) || !('tokens' in a)
    || (!a.manaCost && a.typeLine.includes(' // ') && !a.typeLine.split(' // ')[0].includes('Land'));
  const uncached = [...asWritten.keys()].filter((k) => !cache[k] || stale(cache[k]));

  try {
    for (let i = 0; i < uncached.length; i += COLLECTION_BATCH_SIZE) {
      const chunk = uncached.slice(i, i + COLLECTION_BATCH_SIZE);
      const response = await scryfallFetch(`${API_BASE}/cards/collection`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ identifiers: chunk.map((k) => ({ name: asWritten.get(k).split(' // ')[0].trim() })) }),
      });
      if (!response.ok) throw new Error(`Scryfall attribute lookup failed: ${response.status}`);
      const found = new Map();
      for (const card of (await response.json()).data || []) {
        const attrs = {
          colorIdentity: card.color_identity || [],
          typeLine: card.type_line || '',
          // Front face when the card carries its cost on the faces, like the
          // free card hover: the Planner prints nothing the hover doesn't.
          manaCost: card.mana_cost || card.card_faces?.[0]?.mana_cost || '',
          cmc: card.cmc ?? 0,
          oracleId: card.oracle_id,
          // Default printing's price, for the Saved stat; null when Scryfall has none.
          // shortcut: cached forever like the rest, so it drifts; add a TTL if it matters.
          usd: Number(card.prices?.usd ?? card.prices?.usd_foil ?? card.prices?.usd_etched) || null,
          // Token printings the card creates (#412). Emblems, dungeons and the
          // like are token parts too; only a Token type line is a token.
          tokens: (card.all_parts || [])
            .filter((p) => p.component === 'token' && p.type_line?.startsWith('Token'))
            .map((p) => ({ id: p.id, name: p.name })),
        };
        found.set(attributeKey(card.name), attrs);
        found.set(attributeKey(card.name.split(' // ')[0]), attrs);
      }
      for (const k of chunk) {
        const attrs = found.get(k) || found.get(attributeKey(k.split(' // ')[0]));
        if (attrs) cache[k] = attrs;
      }
    }
  } finally {
    // Chunks that answered stay cached even when a later one fails.
    if (uncached.length) saveScryfallCache(cache, ATTRIBUTES_KEY);
  }
  return new Map(names.map((n) => [n, cache[attributeKey(n)] || null]));
}

// Token types (#412): one identity per Scryfall oracle_id, cached forever like
// the attributes, so a device with no network still lists its Token pack.
// Keys: `id:<token printing id>` (from a card's token parts) and
// `oracle:<oracle_id>` (hand-added and searched). Misses are not cached.
const TOKEN_TYPES_KEY = 'prism_token_types';
const COLOR_WORDS = { W: 'white', U: 'blue', B: 'black', R: 'red', G: 'green' };

function tokenType(card) {
  const colors = card.colors || card.card_faces?.[0]?.colors || [];
  const colorWords = Object.keys(COLOR_WORDS).filter((c) => colors.includes(c)).map((c) => COLOR_WORDS[c]);
  return {
    oracleId: card.oracle_id,
    name: card.name,
    detail: [card.power != null && `${card.power}/${card.toughness}`, colorWords.join(' ') || 'colorless'].filter(Boolean).join(' '),
    typeLine: card.type_line || '',
    imageUri: card.image_uris?.normal || card.card_faces?.[0]?.image_uris?.normal || null,
  };
}

function cacheTokenType(cache, card) {
  if (!card?.oracle_id || !card.name) return null;
  const type = tokenType(card);
  cache[`oracle:${type.oracleId}`] = type;
  if (card.id) cache[`id:${card.id}`] = type;
  return type;
}

async function lookupTokenTypes(keys) {
  const cache = loadScryfallCache(TOKEN_TYPES_KEY);
  const uncached = [...new Set(keys)].filter((k) => !cache[k]);
  try {
    for (let i = 0; i < uncached.length; i += COLLECTION_BATCH_SIZE) {
      const identifiers = uncached.slice(i, i + COLLECTION_BATCH_SIZE)
        .map((k) => (k.startsWith('id:') ? { id: k.slice(3) } : { oracle_id: k.slice(7) }));
      const response = await scryfallFetch(`${API_BASE}/cards/collection`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ identifiers }),
      });
      if (!response.ok) throw new Error(`Scryfall token lookup failed: ${response.status}`);
      for (const card of (await response.json()).data || []) cacheTokenType(cache, card);
    }
  } finally {
    if (uncached.length) saveScryfallCache(cache, TOKEN_TYPES_KEY);
  }
  return cache;
}

// The preview and SCRY fetch a token's image by the name token:<oracleId>.
function cacheTokenImages(types) {
  for (const t of types) {
    const name = `token:${t.oracleId}`;
    if (t.imageUri && !getCachedCard(name)) cacheCard(name, { name: t.name, image_uri: t.imageUri, type_line: t.typeLine });
  }
  flushCards();
}

/**
 * The Token types each card creates (its Scryfall token parts), and the
 * identity of each hand-added oracle id. On the shared rate chain; cached.
 * @param {string[]} cardNames
 * @param {string[]} [oracleIds]
 * @returns {Promise<{byCard: Map<string, Array<Object>|null>, byOracle: Map<string, Object|null>, incomplete: boolean}>}
 *   Token types are { oracleId, name, detail, typeLine, imageUri }; null = not known.
 *   Never throws: when a request fails it answers from the caches, `incomplete`.
 */
export async function getTokenTypes(cardNames, oracleIds = []) {
  let incomplete = false;
  const attributes = await getCardAttributes(cardNames).catch(() => {
    incomplete = true;
    const cached = loadScryfallCache(ATTRIBUTES_KEY);
    return new Map(cardNames.map((n) => [n, cached[attributeKey(n)] || null]));
  });
  const parts = [...attributes.values()].flatMap((a) => a?.tokens || []);
  const cache = await lookupTokenTypes([...parts.map((p) => `id:${p.id}`), ...oracleIds.map((id) => `oracle:${id}`)])
    .catch(() => {
      incomplete = true;
      return loadScryfallCache(TOKEN_TYPES_KEY);
    });
  const byCard = new Map(cardNames.map((n) => {
    const a = attributes.get(n);
    const types = (a?.tokens || []).map((p) => cache[`id:${p.id}`]).filter(Boolean);
    return [n, a ? [...new Map(types.map((t) => [t.oracleId, t])).values()] : null];
  }));
  const byOracle = new Map(oracleIds.map((id) => [id, cache[`oracle:${id}`] || null]));
  cacheTokenImages([...[...byCard.values()].flat(), ...byOracle.values()].filter(Boolean));
  return { byCard, byOracle, incomplete };
}

/**
 * Token types whose name matches `query`, for Add token: up to 8, one per
 * oracle identity. On the shared rate chain (search is a 2-per-second endpoint).
 * @returns {Promise<Array<Object>>} Token types, as getTokenTypes
 */
export async function searchTokens(query) {
  const q = `t:token ${query.replace(/"/g, '')}`;
  const response = await scryfallFetch(`${API_BASE}/cards/search?q=${encodeURIComponent(q)}&unique=cards&include_extras=true`);
  if (response.status === 404) return []; // Scryfall's "no cards found"
  if (!response.ok) throw new Error(`Scryfall token search failed: ${response.status}`);
  const cache = loadScryfallCache(TOKEN_TYPES_KEY);
  const types = ((await response.json()).data || []).slice(0, 8).map((card) => cacheTokenType(cache, card)).filter(Boolean);
  saveScryfallCache(cache, TOKEN_TYPES_KEY);
  cacheTokenImages(types);
  return types;
}

/**
 * A deck's color identity: the union of its commanders' (WUBRG order).
 * Null when the deck has no commander or one couldn't be matched — the
 * Planner shows that deck as "identity unknown" instead of filtering it.
 * @param {Object} deck
 * @param {Map} attributes - from getCardAttributes, covering the commanders
 */
export function deckColorIdentity(deck, attributes) {
  const commanders = deck.cards.filter((c) => c.isCommander);
  if (!commanders.length) return null;
  const colors = new Set();
  for (const c of commanders) {
    const attrs = attributes.get(c.name);
    if (!attrs) return null;
    attrs.colorIdentity.forEach((color) => colors.add(color));
  }
  return [...'WUBRG'].filter((color) => colors.has(color));
}
