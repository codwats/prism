/**
 * PRISM Storage Module
 * Handles localStorage persistence with Supabase sync when authenticated
 */

import { DEFAULT_COLORS } from './processor.js';
import { getSupabase, isConfigured } from './supabase-client.js';
import { getCurrentUser } from './auth.js';

const STORAGE_KEY = 'prism_data';
const CURRENT_VERSION = 2;

/**
 * Get the default storage structure
 * @returns {Object} Default storage object
 */
function getDefaultStorage() {
  return {
    version: CURRENT_VERSION,
    currentPrismId: null,
    prisms: {},
    preferences: {
      colorScheme: 'auto',
      defaultColors: [...DEFAULT_COLORS],
      stripeStartCorner: 'top-right'
    },
    syncState: {
      prismBaselines: {},
      deletedPrisms: {}
    }
  };
}

/**
 * Load data from localStorage
 * @returns {Object} The stored data or default structure
 */
export function loadStorage() {
  try {
    const raw = localStorage.getItem(STORAGE_KEY);
    if (!raw) {
      return getDefaultStorage();
    }

    const data = JSON.parse(raw);

    // Handle version migrations
    if (data.version !== CURRENT_VERSION) {
      return migrateStorage(data);
    }

    ensureSyncState(data);
    return data;
  } catch (error) {
    console.error('Error loading PRISM data:', error);
    return getDefaultStorage();
  }
}

/**
 * Save data to localStorage
 * @param {Object} data - The data to save
 */
export function saveStorage(data) {
  try {
    localStorage.setItem(STORAGE_KEY, JSON.stringify(data));
  } catch (error) {
    console.error('Error saving PRISM data:', error);
    throw new Error('Failed to save data. LocalStorage may be full.');
  }
}

/**
 * Migrate storage from older versions
 * @param {Object} data - The old data
 * @returns {Object} Migrated data
 */
function migrateStorage(data) {
  const migrated = {
    ...getDefaultStorage(),
    ...data,
    syncState: {
      ...getDefaultStorage().syncState,
      ...(data.syncState || {})
    },
    version: CURRENT_VERSION
  };

  saveStorage(migrated);
  return migrated;
}

function ensureSyncState(storage) {
  if (!storage.syncState) {
    storage.syncState = getDefaultStorage().syncState;
  }

  storage.syncState.prismBaselines = storage.syncState.prismBaselines || {};
  storage.syncState.deletedPrisms = storage.syncState.deletedPrisms || {};

  return storage.syncState;
}

function getPrismBaseline(storage, prismId) {
  const syncState = ensureSyncState(storage);

  if (!syncState.prismBaselines[prismId]) {
    syncState.prismBaselines[prismId] = {
      updatedAt: null,
      deckUpdatedAts: {},
      splitGroupUpdatedAts: {},
      deletedDecks: {},
      deletedSplitGroups: {}
    };
  }

  const baseline = syncState.prismBaselines[prismId];
  baseline.deckUpdatedAts = baseline.deckUpdatedAts || {};
  baseline.splitGroupUpdatedAts = baseline.splitGroupUpdatedAts || {};
  baseline.deletedDecks = baseline.deletedDecks || {};
  baseline.deletedSplitGroups = baseline.deletedSplitGroups || {};

  return baseline;
}

function getTimestampMs(value) {
  const ms = value ? new Date(value).getTime() : 0;
  return Number.isFinite(ms) ? ms : 0;
}

function getEntityUpdatedAt(entity, fallback = null) {
  return entity?.updatedAt || fallback || null;
}

function uniqueById(items = []) {
  const map = new Map();

  for (const item of items) {
    if (item?.id) {
      map.set(item.id, item);
    }
  }

  return [...map.values()];
}

function normalizeSplitGroups(prism, splitGroups, decks) {
  const groupChildDeckIds = new Map();

  for (const deck of decks || []) {
    if (!deck?.splitGroupId) continue;

    if (!groupChildDeckIds.has(deck.splitGroupId)) {
      groupChildDeckIds.set(deck.splitGroupId, []);
    }

    groupChildDeckIds.get(deck.splitGroupId).push(deck.id);
  }

  return uniqueById(splitGroups)
    .map(group => ({
      ...group,
      childDeckIds: (() => {
        const stored = Array.isArray(group.childDeckIds) ? group.childDeckIds : [];
        const derived = groupChildDeckIds.get(group.id) || [];
        const filtered = stored.filter(id => derived.includes(id));
        const filteredSet = new Set(filtered);
        return [...filtered, ...derived.filter(id => !filteredSet.has(id))];
      })(),
      updatedAt: group.updatedAt || prism.updatedAt || prism.createdAt || null
    }))
    .filter(group => group.childDeckIds.length > 0);
}

function pickNewerEntity(localEntity, cloudEntity, localFallback, cloudFallback) {
  const localUpdatedAt = getEntityUpdatedAt(localEntity, localFallback);
  const cloudUpdatedAt = getEntityUpdatedAt(cloudEntity, cloudFallback);

  return getTimestampMs(localUpdatedAt) >= getTimestampMs(cloudUpdatedAt)
    ? localEntity
    : cloudEntity;
}

function mergeEntityCollection({
  localItems = [],
  cloudItems = [],
  baselineUpdatedAts = {},
  deletedLocally = {},
  localFallback = null,
  cloudFallback = null
}) {
  const localMap = new Map(localItems.filter(item => item?.id).map(item => [item.id, item]));
  const cloudMap = new Map(cloudItems.filter(item => item?.id).map(item => [item.id, item]));
  const ids = new Set([...localMap.keys(), ...cloudMap.keys()]);
  const merged = [];

  for (const id of ids) {
    const localItem = localMap.get(id);
    const cloudItem = cloudMap.get(id);

    if (localItem && cloudItem) {
      const baselineUpdatedAt = baselineUpdatedAts[id];
      const localUpdatedAt = getEntityUpdatedAt(localItem, localFallback);
      // Local was edited since last known-good sync → prefer local.
      // Guards against server-clock-ahead skew where the server trigger stamps
      // updated_at = now() (server time), making cloud.updatedAt > local.updatedAt
      // even though local has newer user changes.
      if (baselineUpdatedAt && getTimestampMs(localUpdatedAt) > getTimestampMs(baselineUpdatedAt)) {
        merged.push(localItem);
      } else {
        merged.push(pickNewerEntity(localItem, cloudItem, localFallback, cloudFallback));
      }
      continue;
    }

    if (localItem) {
      const baselineUpdatedAt = baselineUpdatedAts[id];
      const localUpdatedAt = getEntityUpdatedAt(localItem, localFallback);

      if (!baselineUpdatedAt || getTimestampMs(localUpdatedAt) > getTimestampMs(baselineUpdatedAt)) {
        merged.push(localItem);
      }

      continue;
    }

    const deletedAt = deletedLocally[id];
    const cloudUpdatedAt = getEntityUpdatedAt(cloudItem, cloudFallback);

    if (!deletedAt || getTimestampMs(cloudUpdatedAt) > getTimestampMs(deletedAt)) {
      merged.push(cloudItem);
    }
  }

  return uniqueById(merged);
}

function recordLocalPrismChanges(storage, previousPrism, nextPrism) {
  const syncState = ensureSyncState(storage);
  delete syncState.deletedPrisms[nextPrism.id];

  const baseline = getPrismBaseline(storage, nextPrism.id);
  const previousDeckIds = new Set((previousPrism?.decks || []).map(deck => deck.id));
  const nextDeckIds = new Set((nextPrism.decks || []).map(deck => deck.id));
  const previousGroupIds = new Set((previousPrism?.splitGroups || []).map(group => group.id));
  const nextGroupIds = new Set((nextPrism.splitGroups || []).map(group => group.id));
  const deletedAt = nextPrism.updatedAt || new Date().toISOString();

  for (const deckId of previousDeckIds) {
    if (!nextDeckIds.has(deckId)) {
      baseline.deletedDecks[deckId] = deletedAt;
    }
  }

  for (const deckId of nextDeckIds) {
    delete baseline.deletedDecks[deckId];
  }

  for (const groupId of previousGroupIds) {
    if (!nextGroupIds.has(groupId)) {
      baseline.deletedSplitGroups[groupId] = deletedAt;
    }
  }

  for (const groupId of nextGroupIds) {
    delete baseline.deletedSplitGroups[groupId];
  }
}

function recordPrismBaseline(storage, prism) {
  const syncState = ensureSyncState(storage);
  delete syncState.deletedPrisms[prism.id];

  const baseline = getPrismBaseline(storage, prism.id);
  baseline.updatedAt = prism.updatedAt || prism.createdAt || null;
  baseline.deckUpdatedAts = Object.fromEntries(
    (prism.decks || []).map(deck => [deck.id, getEntityUpdatedAt(deck, baseline.updatedAt)])
  );
  baseline.splitGroupUpdatedAts = Object.fromEntries(
    (prism.splitGroups || []).map(group => [group.id, getEntityUpdatedAt(group, baseline.updatedAt)])
  );

  for (const deckId of Object.keys(baseline.deletedDecks)) {
    if (baseline.deckUpdatedAts[deckId]) {
      delete baseline.deletedDecks[deckId];
    }
  }

  for (const groupId of Object.keys(baseline.deletedSplitGroups)) {
    if (baseline.splitGroupUpdatedAts[groupId]) {
      delete baseline.deletedSplitGroups[groupId];
    }
  }
}

function pruneSyncState(storage) {
  const syncState = ensureSyncState(storage);

  for (const prismId of Object.keys(syncState.prismBaselines)) {
    if (!storage.prisms[prismId]) {
      delete syncState.prismBaselines[prismId];
    }
  }
}

function buildPrismFromRow(prism) {
  return {
    id: prism.id,
    name: prism.name,
    createdAt: prism.created_at,
    updatedAt: prism.updated_at,
    markedCards: prism.marked_cards || [],
    removedCards: prism.removed_cards || [],
    splitGroups: (prism.split_groups || []).map(group => ({
      ...group,
      updatedAt: group.updatedAt || prism.updated_at
    })),
    decks: (prism.decks || []).map(deck => ({
      id: deck.id,
      name: deck.name,
      color: deck.color,
      bracket: deck.bracket,
      stripePosition: deck.stripe_position,
      splitGroupId: deck.split_group_id || null,
      commander: deck.deck_cards?.find(c => c.is_commander)?.card_name || null,
      createdAt: deck.created_at,
      updatedAt: deck.updated_at,
      cards: (deck.deck_cards || []).map(card => ({
        name: card.card_name,
        quantity: card.quantity,
        isCommander: card.is_commander,
        isBasicLand: card.is_basic_land
      }))
    })).sort((a, b) => a.stripePosition - b.stripePosition)
  };
}

function mergePrismVersions(localPrism, cloudPrism, prismBaseline) {
  const baseline = prismBaseline || {
    updatedAt: null,
    deckUpdatedAts: {},
    splitGroupUpdatedAts: {},
    deletedDecks: {},
    deletedSplitGroups: {}
  };
  const localUpdatedAt = localPrism.updatedAt || localPrism.createdAt || null;
  const cloudUpdatedAt = cloudPrism.updatedAt || cloudPrism.createdAt || null;
  const basePrism = getTimestampMs(localUpdatedAt) >= getTimestampMs(cloudUpdatedAt)
    ? localPrism
    : cloudPrism;

  const mergedDecks = mergeEntityCollection({
    localItems: localPrism.decks || [],
    cloudItems: cloudPrism.decks || [],
    baselineUpdatedAts: baseline.deckUpdatedAts || {},
    deletedLocally: baseline.deletedDecks || {},
    localFallback: localUpdatedAt,
    cloudFallback: cloudUpdatedAt
  }).sort((a, b) => a.stripePosition - b.stripePosition);

  const mergedSplitGroups = normalizeSplitGroups(
    basePrism,
    mergeEntityCollection({
      localItems: localPrism.splitGroups || [],
      cloudItems: cloudPrism.splitGroups || [],
      baselineUpdatedAts: baseline.splitGroupUpdatedAts || {},
      deletedLocally: baseline.deletedSplitGroups || {},
      localFallback: localUpdatedAt,
      cloudFallback: cloudUpdatedAt
    }),
    mergedDecks
  );

  return {
    ...basePrism,
    markedCards: mergeMarkedCards(
      localPrism.markedCards || [],
      cloudPrism.markedCards || []
    ),
    removedCards: mergeRemovedCards(
      localPrism.removedCards || [],
      cloudPrism.removedCards || []
    ),
    decks: mergedDecks,
    splitGroups: mergedSplitGroups,
    updatedAt: getTimestampMs(localUpdatedAt) >= getTimestampMs(cloudUpdatedAt)
      ? localUpdatedAt
      : cloudUpdatedAt
  };
}

const PRISM_SELECT = `
  id,
  name,
  split_groups,
  marked_cards,
  removed_cards,
  created_at,
  updated_at,
  decks (
    id,
    name,
    color,
    bracket,
    stripe_position,
    sort_order,
    split_group_id,
    created_at,
    updated_at,
    deck_cards (
      id,
      card_name,
      quantity,
      is_commander,
      is_basic_land
    )
  )
`;

// ============================================
// SUPABASE SYNC FUNCTIONS
// ============================================

/**
 * Check if we should sync with Supabase
 * @returns {boolean}
 */
function shouldSyncToSupabase() {
  return isConfigured() && getCurrentUser() !== null;
}

/**
 * Save a PRISM to Supabase
 * @param {Object} prism - The PRISM to save
 */
async function savePrismToSupabase(prism) {
  const supabase = getSupabase();
  const user = getCurrentUser();
  if (!supabase || !user) return false;

  try {
    const prismUpdatedAt = prism.updatedAt || new Date().toISOString();

    // Upsert the prism (including split groups as JSONB)
    const { error: prismError } = await supabase
      .from('prisms')
      .upsert({
        id: prism.id,
        user_id: user.id,
        name: prism.name,
        split_groups: prism.splitGroups || [],
        marked_cards: prism.markedCards || [],
        removed_cards: prism.removedCards || [],
        created_at: prism.createdAt || prismUpdatedAt,
        updated_at: prismUpdatedAt
      }, { onConflict: 'id' });

    if (prismError) {
      console.error('Error saving prism to Supabase:', prismError);
      return false;
    }

    const { data: existingDeckRows, error: existingDecksError } = await supabase
      .from('decks')
      .select('id, created_at')
      .eq('prism_id', prism.id);

    if (existingDecksError) {
      console.error('Error loading existing decks before sync:', existingDecksError);
      return false;
    }

    const existingDeckMap = new Map((existingDeckRows || []).map(deck => [deck.id, deck]));
    const localDeckIds = (prism.decks || []).map(deck => deck.id);
    const localDeckIdSet = new Set(localDeckIds);

    if ((prism.decks || []).length > 0) {
      const decksToUpsert = (prism.decks || []).map(deck => {
        const deckUpdatedAt = deck.updatedAt || prismUpdatedAt;
        const existingDeck = existingDeckMap.get(deck.id);

        return {
          id: deck.id,
          prism_id: prism.id,
          name: deck.name,
          color: deck.color,
          bracket: deck.bracket,
          stripe_position: deck.stripePosition,
          sort_order: deck.stripePosition,
          split_group_id: deck.splitGroupId || null,
          created_at: deck.createdAt || existingDeck?.created_at || deckUpdatedAt,
          updated_at: deckUpdatedAt
        };
      });

      const { error: decksUpsertError } = await supabase
        .from('decks')
        .upsert(decksToUpsert, { onConflict: 'id' });

      if (decksUpsertError) {
        console.error('Error upserting decks to Supabase:', decksUpsertError);
        return false;
      }
    }

    // Replace all cards per deck atomically via RPC (single transaction:
    // DELETE + INSERT). Accepts empty array to clear cards safely.
    for (const deck of prism.decks || []) {
      const deckUpdatedAt = deck.updatedAt || prismUpdatedAt;
      const localCards = deck.cards || [];
      const { error: replaceCardsError } = await supabase.rpc('replace_deck_cards', {
        p_deck_id: deck.id,
        p_cards: localCards.map(card => ({
          card_name: card.name,
          quantity: card.quantity || 1,
          is_commander: card.isCommander || false,
          is_basic_land: card.isBasicLand || false
        })),
        p_created_at: deckUpdatedAt
      });

      if (replaceCardsError) {
        console.error('Error replacing deck cards:', replaceCardsError);
        return false;
      }
    }

    const staleDeckIds = (existingDeckRows || [])
      .filter(deck => !localDeckIdSet.has(deck.id))
      .map(deck => deck.id);

    if (staleDeckIds.length > 0) {
      const { error: deleteDecksError } = await supabase
        .from('decks')
        .delete()
        .in('id', staleDeckIds);

      if (deleteDecksError) {
        console.error('Error deleting removed decks from Supabase:', deleteDecksError);
        return false;
      }
    }

    console.log('PRISM saved to Supabase:', prism.name);
    return true;
  } catch (err) {
    console.error('Error syncing to Supabase:', err);
    return false;
  }
}

/**
 * Delete a PRISM from Supabase
 * @param {string} prismId - The PRISM ID to delete
 */
async function deletePrismFromSupabase(prismId) {
  const supabase = getSupabase();
  const user = getCurrentUser();
  if (!supabase || !user) return false;

  try {
    const { error } = await supabase
      .from('prisms')
      .delete()
      .eq('id', prismId)
      .eq('user_id', user.id);

    if (error) {
      console.error('Error deleting prism from Supabase:', error);
      return false;
    }
    return true;
  } catch (err) {
    console.error('Error deleting from Supabase:', err);
    return false;
  }
}

async function loadPrismFromSupabase(prismId) {
  const supabase = getSupabase();
  const user = getCurrentUser();
  if (!supabase || !user) return null;

  try {
    const { data: prism, error } = await supabase
      .from('prisms')
      .select(PRISM_SELECT)
      .eq('id', prismId)
      .eq('user_id', user.id)
      .maybeSingle();

    if (error) {
      console.error('Error loading prism from Supabase:', error);
      return null;
    }

    return prism ? buildPrismFromRow(prism) : null;
  } catch (err) {
    console.error('Error loading prism from Supabase:', err);
    return null;
  }
}

/**
 * Load all PRISMs from Supabase
 * @returns {Object} Map of prism id -> prism object
 */
export async function loadPrismsFromSupabase() {
  const supabase = getSupabase();
  const user = getCurrentUser();
  if (!supabase || !user) return null;

  try {
    // Fetch prisms with decks and cards
    const { data: prisms, error: prismsError } = await supabase
      .from('prisms')
      .select(PRISM_SELECT)
      .eq('user_id', user.id)
      .order('updated_at', { ascending: false });

    if (prismsError) {
      console.error('Error loading prisms from Supabase:', prismsError);
      return null;
    }

    // Transform to app format
    const prismMap = {};
    for (const prism of prisms || []) {
      prismMap[prism.id] = buildPrismFromRow(prism);
    }

    console.log('Loaded', Object.keys(prismMap).length, 'prisms from Supabase');
    return prismMap;
  } catch (err) {
    console.error('Error loading from Supabase:', err);
    return null;
  }
}

/**
 * Merge markedCards arrays via set-union (deduplicated).
 * If either device says a card is marked, keep it marked.
 */
function mergeMarkedCards(localArr, cloudArr) {
  const set = new Set([...localArr, ...cloudArr]);
  return [...set];
}

/**
 * Merge removedCards arrays via union, deduplicated by (cardName, deckId).
 * When both contain the same entry, keep the one with the later removedAt.
 */
function mergeRemovedCards(localArr, cloudArr) {
  const map = new Map();

  for (const entry of localArr) {
    const key = `${entry.cardName.toLowerCase()}|${entry.deckId}`;
    map.set(key, entry);
  }

  for (const entry of cloudArr) {
    const key = `${entry.cardName.toLowerCase()}|${entry.deckId}`;
    const existing = map.get(key);
    if (!existing || new Date(entry.removedAt) > new Date(existing.removedAt)) {
      map.set(key, entry);
    }
  }

  return [...map.values()];
}

/**
 * Sync localStorage with Supabase (called on login)
 */
export async function syncWithSupabase() {
  if (!shouldSyncToSupabase()) return;

  const cloudPrisms = await loadPrismsFromSupabase();
  if (cloudPrisms === null) return;

  const storage = loadStorage();
  const syncState = ensureSyncState(storage);
  const merged = {};
  const prismIds = new Set([
    ...Object.keys(storage.prisms),
    ...Object.keys(cloudPrisms)
  ]);

  for (const prismId of prismIds) {
    const localPrism = storage.prisms[prismId];
    const cloudPrism = cloudPrisms[prismId];
    const baseline = syncState.prismBaselines[prismId];

    if (localPrism && cloudPrism) {
      merged[prismId] = mergePrismVersions(localPrism, cloudPrism, baseline);
      continue;
    }

    if (localPrism) {
      if (!baseline?.updatedAt || getTimestampMs(localPrism.updatedAt) > getTimestampMs(baseline.updatedAt)) {
        merged[prismId] = localPrism;
      }
      continue;
    }

    const deletedAt = syncState.deletedPrisms[prismId];
    if (!deletedAt || getTimestampMs(cloudPrism.updatedAt || cloudPrism.createdAt) > getTimestampMs(deletedAt)) {
      merged[prismId] = cloudPrism;
    }
  }

  storage.prisms = merged;
  pruneSyncState(storage);

  // Pick the best current PRISM after merge:
  // - If no current PRISM is set or it was deleted, pick most recent
  // - If current PRISM is empty (no decks) and cloud has data, switch to cloud PRISM
  const currentPrism = storage.currentPrismId ? storage.prisms[storage.currentPrismId] : null;
  const currentIsEmpty = !currentPrism || !currentPrism.decks || currentPrism.decks.length === 0;
  const cloudHasData = Object.keys(cloudPrisms).length > 0;

  if (!storage.currentPrismId || !storage.prisms[storage.currentPrismId] || (currentIsEmpty && cloudHasData)) {
    const prismEntries = Object.entries(storage.prisms);
    if (prismEntries.length > 0) {
      prismEntries.sort((a, b) =>
        new Date(b[1].updatedAt || b[1].createdAt) - new Date(a[1].updatedAt || a[1].createdAt)
      );
      storage.currentPrismId = prismEntries[0][0];
    }
  }

  saveStorage(storage);

  for (const [prismId, prism] of Object.entries(storage.prisms)) {
    const saved = await savePrismToSupabase(prism);
    if (saved) {
      recordPrismBaseline(storage, prism);
    }
  }

  for (const prismId of Object.keys(cloudPrisms)) {
    if (!storage.prisms[prismId] && syncState.deletedPrisms[prismId]) {
      await deletePrismFromSupabase(prismId);
    }
  }

  saveStorage(storage);
  console.log('Synced with Supabase');
}

async function syncPrismToSupabase(prismId) {
  if (!shouldSyncToSupabase()) return;

  const storage = loadStorage();
  const localPrism = storage.prisms[prismId];
  if (!localPrism) return;

  const cloudPrism = await loadPrismFromSupabase(prismId);
  const baseline = getPrismBaseline(storage, prismId);
  const mergedPrism = cloudPrism
    ? mergePrismVersions(localPrism, cloudPrism, baseline)
    : localPrism;

  storage.prisms[prismId] = mergedPrism;
  saveStorage(storage);

  const saved = await savePrismToSupabase(mergedPrism);
  if (saved) {
    recordPrismBaseline(storage, mergedPrism);
    saveStorage(storage);
  }
}

// ============================================
// SYNC DEBOUNCE
// ============================================

let syncTimeout = null;
let queuedPrismId = null;

// Flush a pending debounced sync on page unload so in-flight edits don't get
// stranded in localStorage. Listen to both beforeunload and pagehide — iOS
// Safari fires only pagehide. Fire-and-forget is acceptable because modern
// browsers keep in-flight fetch() POSTs alive through unload briefly.
if (typeof window !== 'undefined') {
  const flushPendingSync = () => {
    if (!syncTimeout) return;
    clearTimeout(syncTimeout);
    syncTimeout = null;
    const prismId = queuedPrismId;
    queuedPrismId = null;
    if (!prismId || !shouldSyncToSupabase()) return;
    syncPrismToSupabase(prismId).catch(() => {});
  };
  window.addEventListener('beforeunload', flushPendingSync);
  window.addEventListener('pagehide', flushPendingSync);
}

// ============================================
// PUBLIC API (unchanged interface)
// ============================================

/**
 * Get the current PRISM being edited
 * @returns {Object|null} The current PRISM or null
 */
export function getCurrentPrism() {
  const storage = loadStorage();
  if (!storage.currentPrismId) return null;
  return storage.prisms[storage.currentPrismId] || null;
}

/**
 * Set the current PRISM
 * @param {string} prismId - The PRISM ID to set as current
 */
export function setCurrentPrism(prismId) {
  const storage = loadStorage();
  storage.currentPrismId = prismId;
  saveStorage(storage);
}

/**
 * Save a PRISM (create or update)
 * @param {Object} prism - The PRISM to save
 */
export function savePrism(prism) {
  const storage = loadStorage();
  const previousPrism = storage.prisms[prism.id] || null;
  recordLocalPrismChanges(storage, previousPrism, prism);
  storage.prisms[prism.id] = prism;
  pruneSyncState(storage);
  saveStorage(storage);

  // Sync to Supabase if logged in (debounced to avoid race conditions on rapid saves)
  if (shouldSyncToSupabase()) {
    clearTimeout(syncTimeout);
    queuedPrismId = prism.id;
    syncTimeout = setTimeout(() => {
      syncTimeout = null;
      queuedPrismId = null;
      syncPrismToSupabase(prism.id).catch(err => {
        console.error('Background sync failed:', err);
      });
    }, 2000);
  }
}

/**
 * Delete a PRISM
 * @param {string} prismId - The PRISM ID to delete
 */
export function deletePrism(prismId) {
  const storage = loadStorage();
  const syncState = ensureSyncState(storage);
  syncState.deletedPrisms[prismId] = new Date().toISOString();
  delete syncState.prismBaselines[prismId];
  delete storage.prisms[prismId];

  // Clear current if it was the deleted one
  if (storage.currentPrismId === prismId) {
    storage.currentPrismId = null;
  }

  pruneSyncState(storage);
  saveStorage(storage);

  // Sync deletion to Supabase if logged in
  if (shouldSyncToSupabase()) {
    deletePrismFromSupabase(prismId).catch(err => {
      console.error('Background delete failed:', err);
    });
  }
}

/**
 * Get all PRISMs
 * @returns {Array} Array of PRISM objects
 */
export function getAllPrisms() {
  const storage = loadStorage();
  return Object.values(storage.prisms).sort((a, b) =>
    new Date(b.updatedAt) - new Date(a.updatedAt)
  );
}

/**
 * Get a specific PRISM by ID
 * @param {string} prismId - The PRISM ID
 * @returns {Object|null} The PRISM or null
 */
export function getPrism(prismId) {
  const storage = loadStorage();
  return storage.prisms[prismId] || null;
}

/**
 * Get user preferences
 * @returns {Object} User preferences
 */
export function getPreferences() {
  const storage = loadStorage();
  const defaults = getDefaultStorage().preferences;
  return { ...defaults, ...storage.preferences };
}

/**
 * Update user preferences
 * @param {Object} updates - Preference updates
 */
export function updatePreferences(updates) {
  const storage = loadStorage();
  storage.preferences = {
    ...storage.preferences,
    ...updates
  };
  saveStorage(storage);
}

/**
 * Get the color scheme preference
 * @returns {string} 'light', 'dark', or 'auto'
 */
export function getColorScheme() {
  const prefs = getPreferences();
  return prefs.colorScheme || 'auto';
}

/**
 * Set the color scheme preference
 * @param {string} scheme - 'light', 'dark', or 'auto'
 */
export function setColorScheme(scheme) {
  updatePreferences({ colorScheme: scheme });
}

/**
 * Clear all PRISM data (for debugging/reset)
 */
export function clearAllData() {
  localStorage.removeItem(STORAGE_KEY);
}

/**
 * Export all data as JSON (for backup)
 * @returns {string} JSON string of all data
 */
export function exportAllData() {
  return localStorage.getItem(STORAGE_KEY) || JSON.stringify(getDefaultStorage());
}

/**
 * Import data from JSON (for restore)
 * @param {string} jsonString - The JSON data to import
 * @returns {boolean} Success status
 */
export function importAllData(jsonString) {
  try {
    const data = JSON.parse(jsonString);
    if (!data.version || !data.prisms) {
      throw new Error('Invalid data format');
    }
    const merged = {
      ...getDefaultStorage(),
      ...data,
      syncState: getDefaultStorage().syncState,
      version: CURRENT_VERSION
    };

    for (const prism of Object.values(merged.prisms)) {
      recordPrismBaseline(merged, prism);
    }

    saveStorage(merged);

    // Sync imported data to Supabase
    if (shouldSyncToSupabase()) {
      for (const prism of Object.values(merged.prisms)) {
        savePrismToSupabase(prism).catch(err => {
          console.error('Failed to sync imported prism:', err);
        });
      }
    }

    return true;
  } catch (error) {
    console.error('Error importing data:', error);
    return false;
  }
}
