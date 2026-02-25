/**
 * PRISM Storage Module
 * Handles localStorage persistence with versioning for future migrations
 */

import { DEFAULT_COLORS } from './processor.js';

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
  // Future: handle migrations between versions
  // For now, just update version and fill in missing fields
  const migrated = {
    ...getDefaultStorage(),
    ...data,
    version: CURRENT_VERSION
  };
  
  saveStorage(migrated);
  return migrated;
}

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
    return true;
  } catch (error) {
    console.error('Error importing data:', error);
    return false;
  }
}
