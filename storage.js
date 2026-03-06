/**
 * PRISM Storage Module
 * Handles localStorage persistence with Supabase sync when authenticated
 */

import { DEFAULT_COLORS } from './processor.js';
import { getSupabase, isConfigured } from './supabase-client.js';
import { getCurrentUser } from './auth.js';

const STORAGE_KEY = 'prism_data';
const CURRENT_VERSION = 1;

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
      defaultColors: [...DEFAULT_COLORS]
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
    version: CURRENT_VERSION
  };

  saveStorage(migrated);
  return migrated;
}

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
  if (!supabase || !user) return;

  try {
    // Upsert the prism (including split groups as JSONB)
    const { data: prismData, error: prismError } = await supabase
      .from('prisms')
      .upsert({
        id: prism.id,
        user_id: user.id,
        name: prism.name,
        split_groups: prism.splitGroups || [],
        updated_at: new Date().toISOString()
      }, { onConflict: 'id' })
      .select()
      .single();

    if (prismError) {
      console.error('Error saving prism to Supabase:', prismError);
      return;
    }

    // Delete existing decks and cards (we'll re-insert them)
    await supabase.from('decks').delete().eq('prism_id', prism.id);

    // Insert decks and their cards
    for (const deck of prism.decks || []) {
      const { data: deckData, error: deckError } = await supabase
        .from('decks')
        .insert({
          id: deck.id,
          prism_id: prism.id,
          name: deck.name,
          color: deck.color,
          bracket: deck.bracket,
          stripe_position: deck.stripePosition,
          sort_order: deck.stripePosition,
          split_group_id: deck.splitGroupId || null
        })
        .select()
        .single();

      if (deckError) {
        console.error('Error saving deck to Supabase:', deckError);
        continue;
      }

      // Insert cards for this deck
      if (deck.cards && deck.cards.length > 0) {
        const cardsToInsert = deck.cards.map(card => ({
          deck_id: deck.id,
          card_name: card.name,
          quantity: card.quantity || 1,
          is_commander: card.isCommander || false,
          is_basic_land: card.isBasicLand || false
        }));

        const { error: cardsError } = await supabase
          .from('deck_cards')
          .insert(cardsToInsert);

        if (cardsError) {
          console.error('Error saving cards to Supabase:', cardsError);
        }
      }
    }

    console.log('PRISM saved to Supabase:', prism.name);
  } catch (err) {
    console.error('Error syncing to Supabase:', err);
  }
}

/**
 * Delete a PRISM from Supabase
 * @param {string} prismId - The PRISM ID to delete
 */
async function deletePrismFromSupabase(prismId) {
  const supabase = getSupabase();
  const user = getCurrentUser();
  if (!supabase || !user) return;

  try {
    const { error } = await supabase
      .from('prisms')
      .delete()
      .eq('id', prismId)
      .eq('user_id', user.id);

    if (error) {
      console.error('Error deleting prism from Supabase:', error);
    }
  } catch (err) {
    console.error('Error deleting from Supabase:', err);
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
      .select(`
        id,
        name,
        split_groups,
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
      `)
      .eq('user_id', user.id)
      .order('updated_at', { ascending: false });

    if (prismsError) {
      console.error('Error loading prisms from Supabase:', prismsError);
      return null;
    }

    // Transform to app format
    const prismMap = {};
    for (const prism of prisms || []) {
      prismMap[prism.id] = {
        id: prism.id,
        name: prism.name,
        createdAt: prism.created_at,
        updatedAt: prism.updated_at,
        markedCards: [],
        removedCards: [],
        splitGroups: prism.split_groups || [],
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

    console.log('Loaded', Object.keys(prismMap).length, 'prisms from Supabase');
    return prismMap;
  } catch (err) {
    console.error('Error loading from Supabase:', err);
    return null;
  }
}

/**
 * Sync localStorage with Supabase (called on login)
 */
export async function syncWithSupabase() {
  if (!shouldSyncToSupabase()) return;

  const cloudPrisms = await loadPrismsFromSupabase();
  if (cloudPrisms === null) return;

  const storage = loadStorage();

  // Merge: cloud prisms take precedence, but keep local-only prisms
  const merged = { ...storage.prisms };
  for (const [id, prism] of Object.entries(cloudPrisms)) {
    merged[id] = prism;
  }

  storage.prisms = merged;
  saveStorage(storage);

  // Push any local-only prisms to cloud
  for (const [id, prism] of Object.entries(storage.prisms)) {
    if (!cloudPrisms[id]) {
      await savePrismToSupabase(prism);
    }
  }

  console.log('Synced with Supabase');
}

// ============================================
// SYNC DEBOUNCE
// ============================================

let syncTimeout = null;

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
  storage.prisms[prism.id] = prism;
  saveStorage(storage);

  // Sync to Supabase if logged in (debounced to avoid race conditions on rapid saves)
  if (shouldSyncToSupabase()) {
    clearTimeout(syncTimeout);
    syncTimeout = setTimeout(() => {
      savePrismToSupabase(prism).catch(err => {
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
  delete storage.prisms[prismId];

  // Clear current if it was the deleted one
  if (storage.currentPrismId === prismId) {
    storage.currentPrismId = null;
  }

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
  return storage.preferences;
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
    saveStorage(data);

    // Sync imported data to Supabase
    if (shouldSyncToSupabase()) {
      for (const prism of Object.values(data.prisms)) {
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
