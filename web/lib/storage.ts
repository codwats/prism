/**
 * Browser Storage Utilities
 * Save and load PRISM collections from localStorage
 */

import type { Deck, ProcessedData } from './prism/core/types'

const STORAGE_KEY = 'prism_collections'
const CURRENT_COLLECTION_KEY = 'prism_current_collection'

export interface SavedCollection {
  id: string
  name: string
  createdAt: string
  updatedAt: string
  decks: Deck[]
  processedData?: ProcessedData
}

/**
 * Get all saved collections from localStorage
 */
export function getSavedCollections(): SavedCollection[] {
  if (typeof window === 'undefined') return []

  try {
    const data = localStorage.getItem(STORAGE_KEY)
    return data ? JSON.parse(data) : []
  } catch (error) {
    console.error('Error loading collections:', error)
    return []
  }
}

/**
 * Save a collection to localStorage
 */
export function saveCollection(collection: SavedCollection): void {
  if (typeof window === 'undefined') return

  try {
    const collections = getSavedCollections()
    const existingIndex = collections.findIndex(c => c.id === collection.id)

    if (existingIndex >= 0) {
      // Update existing
      collections[existingIndex] = {
        ...collection,
        updatedAt: new Date().toISOString(),
      }
    } else {
      // Add new
      collections.push(collection)
    }

    localStorage.setItem(STORAGE_KEY, JSON.stringify(collections))
    localStorage.setItem(CURRENT_COLLECTION_KEY, collection.id)
  } catch (error) {
    console.error('Error saving collection:', error)
    throw new Error('Failed to save collection to browser storage')
  }
}

/**
 * Load a specific collection by ID
 */
export function loadCollection(id: string): SavedCollection | null {
  const collections = getSavedCollections()
  return collections.find(c => c.id === id) || null
}

/**
 * Delete a collection by ID
 */
export function deleteCollection(id: string): void {
  if (typeof window === 'undefined') return

  try {
    const collections = getSavedCollections()
    const filtered = collections.filter(c => c.id !== id)
    localStorage.setItem(STORAGE_KEY, JSON.stringify(filtered))

    // Clear current if deleted
    if (localStorage.getItem(CURRENT_COLLECTION_KEY) === id) {
      localStorage.removeItem(CURRENT_COLLECTION_KEY)
    }
  } catch (error) {
    console.error('Error deleting collection:', error)
  }
}

/**
 * Get the currently active collection ID
 */
export function getCurrentCollectionId(): string | null {
  if (typeof window === 'undefined') return null
  return localStorage.getItem(CURRENT_COLLECTION_KEY)
}

/**
 * Export collection as JSON file (download)
 */
export function exportCollectionAsJSON(collection: SavedCollection): void {
  const json = JSON.stringify(collection, null, 2)
  const blob = new Blob([json], { type: 'application/json' })
  const url = URL.createObjectURL(blob)
  const a = document.createElement('a')
  a.href = url
  a.download = `prism-${collection.name.toLowerCase().replace(/\s+/g, '-')}-${Date.now()}.json`
  a.click()
  URL.revokeObjectURL(url)
}

/**
 * Import collection from JSON file
 */
export async function importCollectionFromJSON(file: File): Promise<SavedCollection> {
  return new Promise((resolve, reject) => {
    const reader = new FileReader()

    reader.onload = (e) => {
      try {
        const json = e.target?.result as string
        const collection = JSON.parse(json) as SavedCollection

        // Validate basic structure
        if (!collection.decks || !Array.isArray(collection.decks)) {
          throw new Error('Invalid collection format')
        }

        resolve(collection)
      } catch (error) {
        reject(new Error('Failed to parse JSON file'))
      }
    }

    reader.onerror = () => reject(new Error('Failed to read file'))
    reader.readAsText(file)
  })
}

/**
 * Auto-save current session (debounced)
 */
let autoSaveTimeout: NodeJS.Timeout | null = null

export function autoSaveCollection(
  decks: Deck[],
  processedData: ProcessedData | null,
  collectionId?: string,
  collectionName?: string
): void {
  if (typeof window === 'undefined') return

  // Clear previous timeout
  if (autoSaveTimeout) {
    clearTimeout(autoSaveTimeout)
  }

  // Debounce auto-save by 1 second
  autoSaveTimeout = setTimeout(() => {
    try {
      const id = collectionId || getCurrentCollectionId() || `collection-${Date.now()}`
      const name = collectionName || 'Untitled Collection'

      const collection: SavedCollection = {
        id,
        name,
        createdAt: new Date().toISOString(),
        updatedAt: new Date().toISOString(),
        decks,
        processedData: processedData || undefined,
      }

      saveCollection(collection)
    } catch (error) {
      console.error('Auto-save failed:', error)
    }
  }, 1000)
}
