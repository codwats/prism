// Scryfall API client with caching and rate limiting

const CACHE_KEY = 'scryfall_card_cache';
const CACHE_TTL = 24 * 60 * 60 * 1000; // 24 hours
const REQUEST_DELAY = 100; // ms between requests
const API_BASE = 'https://api.scryfall.com';

// Rate limiting state
let lastRequestTime = 0;
const requestQueue = [];
let isProcessing = false;

// Sleep utility
function sleep(ms) {
  return new Promise((resolve) => setTimeout(resolve, ms));
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
  } catch (e) {
    // localStorage full - clear old entries
    console.warn('Scryfall cache full, clearing old entries');
    clearExpiredCache();
  }
}

// Get cached card if still fresh
function getCachedCard(cardName) {
  const cache = loadCache();
  const normalizedName = cardName.toLowerCase().trim();
  const entry = cache[normalizedName];

  if (entry && Date.now() - entry.cached_at < CACHE_TTL) {
    return entry;
  }

  return null;
}

// Cache a card
function cacheCard(cardName, data) {
  const cache = loadCache();
  const normalizedName = cardName.toLowerCase().trim();

  cache[normalizedName] = {
    ...data,
    cached_at: Date.now(),
  };

  saveCache(cache);
}

// Clear expired cache entries
function clearExpiredCache() {
  const cache = loadCache();
  const now = Date.now();

  for (const key of Object.keys(cache)) {
    if (now - cache[key].cached_at >= CACHE_TTL) {
      delete cache[key];
    }
  }

  saveCache(cache);
}

// Clear entire cache
export function clearCache() {
  localStorage.removeItem(CACHE_KEY);
}

// Fetch from Scryfall API
async function fetchFromScryfall(cardName) {
  const encodedName = encodeURIComponent(cardName);
  const url = `${API_BASE}/cards/named?exact=${encodedName}`;

  const response = await fetch(url);

  if (response.status === 404) {
    // Card not found - try fuzzy search
    const fuzzyUrl = `${API_BASE}/cards/named?fuzzy=${encodedName}`;
    const fuzzyResponse = await fetch(fuzzyUrl);

    if (!fuzzyResponse.ok) {
      throw new Error(`Card not found: ${cardName}`);
    }

    return fuzzyResponse.json();
  }

  if (response.status === 429) {
    throw new Error('Rate limited by Scryfall');
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
    const now = Date.now();
    const timeSinceLastRequest = now - lastRequestTime;

    if (timeSinceLastRequest < REQUEST_DELAY) {
      await sleep(REQUEST_DELAY - timeSinceLastRequest);
    }

    try {
      const scryfallData = await fetchFromScryfall(cardName);
      const result = extractCardData(scryfallData);
      cacheCard(cardName, result);
      resolve(result);
    } catch (error) {
      reject(error);
    }

    lastRequestTime = Date.now();
  }

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
    mana_cost: data.mana_cost,
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

  // Fetch uncached cards in batches
  for (const cardName of uncached) {
    try {
      await fetchCard(cardName);
    } catch (error) {
      console.warn(`Failed to prefetch ${cardName}:`, error.message);
    }
  }
}

// Canonicalize card names via Scryfall's /cards/collection endpoint.
// Resolves UB reprints (e.g., "Dwight Schrute, Hay King" → "Heliod, Sun-Crowned")
// and normalizes DFC names to the Oracle name.
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
    const identifiers = chunk.map(c => ({ name: c.name }));

    try {
      // Rate limit
      const now = Date.now();
      if (now - lastRequestTime < REQUEST_DELAY) {
        await sleep(REQUEST_DELAY - (now - lastRequestTime));
      }

      const response = await fetch(`${API_BASE}/cards/collection`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ identifiers }),
      });

      lastRequestTime = Date.now();

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

// Get cache stats (for debugging)
export function getCacheStats() {
  const cache = loadCache();
  const entries = Object.keys(cache).length;
  const now = Date.now();
  const expired = Object.values(cache).filter(
    (e) => now - e.cached_at >= CACHE_TTL
  ).length;

  return {
    total: entries,
    valid: entries - expired,
    expired,
  };
}
