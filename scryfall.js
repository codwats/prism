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
