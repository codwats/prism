'use client'

import { useState, useEffect, useRef } from 'react'
import Link from 'next/link'
import { v4 as uuidv4 } from 'uuid'
import { parseDecklist } from '@/lib/prism/core/parser'
import { processDecks } from '@/lib/prism/core/processor'
import { calculateDelta } from '@/lib/prism/core/delta'
import { generateCSV } from '@/lib/prism/output/csv'
import { generateJSON } from '@/lib/prism/output/json'
import { generateChangesCSV } from '@/lib/prism/output/changes'
import { fetchMoxfieldDeck, convertMoxfieldToPrismFormat, extractMoxfieldId, getCommanderName } from '@/lib/moxfield'
import {
  getSavedCollections,
  saveCollection,
  loadCollection,
  deleteCollection,
  autoSaveCollection,
  importCollectionFromJSON,
  exportCollectionAsJSON,
  type SavedCollection
} from '@/lib/storage'
import type { Deck, ProcessedData } from '@/lib/prism/core/types'

export default function ProcessPage() {
  const [decks, setDecks] = useState<Deck[]>([])
  const [processedData, setProcessedData] = useState<ProcessedData | null>(null)
  const [oldProcessedData, setOldProcessedData] = useState<ProcessedData | null>(null)
  const [showAddForm, setShowAddForm] = useState(false)
  const [isProcessing, setIsProcessing] = useState(false)

  // Collection state
  const [currentCollectionId, setCurrentCollectionId] = useState<string>(`collection-${Date.now()}`)
  const [collectionName, setCollectionName] = useState('My Collection')
  const [savedCollections, setSavedCollections] = useState<SavedCollection[]>([])
  const [showLoadMenu, setShowLoadMenu] = useState(false)
  const fileInputRef = useRef<HTMLInputElement>(null)

  // Form state
  const [deckName, setDeckName] = useState('')
  const [commander, setCommander] = useState('')
  const [bracket, setBracket] = useState(2)
  const [inputMethod, setInputMethod] = useState<'paste' | 'moxfield'>('paste')
  const [decklist, setDecklist] = useState('')
  const [moxfieldUrl, setMoxfieldUrl] = useState('')
  const [loading, setLoading] = useState(false)

  // Load saved collections on mount
  useEffect(() => {
    const collections = getSavedCollections()
    setSavedCollections(collections)

    // Load most recent collection if exists
    if (collections.length > 0) {
      const latest = collections.sort((a, b) =>
        new Date(b.updatedAt).getTime() - new Date(a.updatedAt).getTime()
      )[0]

      if (latest.decks.length > 0) {
        const shouldLoad = confirm(
          `Found saved collection "${latest.name}" with ${latest.decks.length} deck(s). Load it?`
        )
        if (shouldLoad) {
          handleLoadCollection(latest)
        }
      }
    }
  }, [])

  // Auto-save when decks or processedData changes
  useEffect(() => {
    if (decks.length > 0) {
      autoSaveCollection(decks, processedData, currentCollectionId, collectionName)
    }
  }, [decks, processedData, currentCollectionId, collectionName])

  const handleLoadCollection = (collection: SavedCollection) => {
    setDecks(collection.decks)
    setCollectionName(collection.name)
    setCurrentCollectionId(collection.id)

    if (collection.processedData) {
      setOldProcessedData(collection.processedData)
      setProcessedData(collection.processedData)
    }

    setShowLoadMenu(false)

    // Refresh saved collections list
    setSavedCollections(getSavedCollections())
  }

  const handleDeleteCollection = (id: string) => {
    if (confirm('Delete this collection?')) {
      deleteCollection(id)
      setSavedCollections(getSavedCollections())
    }
  }

  const handleImportJSON = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0]
    if (!file) return

    try {
      const collection = await importCollectionFromJSON(file)

      // Generate new ID to avoid conflicts
      collection.id = `imported-${Date.now()}`
      collection.name = `${collection.name} (Imported)`

      saveCollection(collection)
      setSavedCollections(getSavedCollections())

      alert(`Imported collection "${collection.name}" with ${collection.decks.length} deck(s)`)
    } catch (error) {
      alert(`Import failed: ${error}`)
    }

    // Reset file input
    if (fileInputRef.current) {
      fileInputRef.current.value = ''
    }
  }

  const handleExportCollection = () => {
    const collection: SavedCollection = {
      id: currentCollectionId,
      name: collectionName,
      createdAt: new Date().toISOString(),
      updatedAt: new Date().toISOString(),
      decks,
      processedData: processedData || undefined,
    }

    exportCollectionAsJSON(collection)
  }

  const handleNewCollection = () => {
    if (decks.length > 0) {
      const shouldSave = confirm('Save current collection before starting new one?')
      if (shouldSave) {
        const collection: SavedCollection = {
          id: currentCollectionId,
          name: collectionName,
          createdAt: new Date().toISOString(),
          updatedAt: new Date().toISOString(),
          decks,
          processedData: processedData || undefined,
        }
        saveCollection(collection)
        setSavedCollections(getSavedCollections())
      }
    }

    // Reset to new collection
    setDecks([])
    setProcessedData(null)
    setOldProcessedData(null)
    setCurrentCollectionId(`collection-${Date.now()}`)
    setCollectionName('My Collection')
  }

  const handleAddDeck = async () => {
    if (!deckName || !commander) {
      alert('Please enter deck name and commander')
      return
    }

    setLoading(true)

    try {
      let finalDecklist = decklist

      // If Moxfield, fetch it first
      if (inputMethod === 'moxfield' && moxfieldUrl) {
        const deckId = extractMoxfieldId(moxfieldUrl)
        const moxfieldDeck = await fetchMoxfieldDeck(deckId)
        finalDecklist = convertMoxfieldToPrismFormat(moxfieldDeck)

        // Auto-fill commander if not set
        if (!commander || commander === '') {
          setCommander(getCommanderName(moxfieldDeck))
        }

        // Auto-fill deck name if not set
        if (!deckName || deckName === '') {
          setDeckName(moxfieldDeck.name)
        }
      }

      if (!finalDecklist) {
        alert('Please enter a decklist or Moxfield URL')
        setLoading(false)
        return
      }

      // Parse the decklist
      const parseResult = parseDecklist(finalDecklist)

      if (parseResult.cards.length === 0) {
        alert('No valid cards found in decklist')
        setLoading(false)
        return
      }

      // Create deck object
      const newDeck: Deck = {
        id: uuidv4(),
        name: deckName,
        commander: commander,
        bracket: bracket,
        cards: parseResult.cards,
        assignedColor: '', // Will be assigned during processing
      }

      setDecks([...decks, newDeck])

      // Reset form
      setDeckName('')
      setCommander('')
      setBracket(2)
      setDecklist('')
      setMoxfieldUrl('')
      setShowAddForm(false)
    } catch (error) {
      alert(`Error: ${error}`)
    } finally {
      setLoading(false)
    }
  }

  const handleRemoveDeck = (id: string) => {
    setDecks(decks.filter(d => d.id !== id))
    setProcessedData(null) // Clear results when decks change
  }

  const handleProcess = () => {
    if (decks.length === 0) {
      alert('Please add at least one deck')
      return
    }

    setIsProcessing(true)

    try {
      // Save old state for delta calculation
      if (processedData) {
        setOldProcessedData(processedData)
      }

      // Process decks
      const processed = processDecks(decks)
      setProcessedData(processed)
    } catch (error) {
      alert(`Processing error: ${error}`)
    } finally {
      setIsProcessing(false)
    }
  }

  const handleDownloadCSV = () => {
    if (!processedData) return

    const csv = generateCSV(processedData)
    const blob = new Blob([csv], { type: 'text/csv' })
    const url = URL.createObjectURL(blob)
    const a = document.createElement('a')
    a.href = url
    a.download = 'prism-output.csv'
    a.click()
    URL.revokeObjectURL(url)
  }

  const handleDownloadJSON = () => {
    if (!processedData) return

    const jsonData = generateJSON(processedData)
    const blob = new Blob([JSON.stringify(jsonData, null, 2)], { type: 'application/json' })
    const url = URL.createObjectURL(blob)
    const a = document.createElement('a')
    a.href = url
    a.download = 'prism-output.json'
    a.click()
    URL.revokeObjectURL(url)
  }

  const handleDownloadChanges = () => {
    if (!processedData || !oldProcessedData) return

    const delta = calculateDelta(oldProcessedData, processedData)
    const csv = generateChangesCSV(delta)
    const blob = new Blob([csv], { type: 'text/csv' })
    const url = URL.createObjectURL(blob)
    const a = document.createElement('a')
    a.href = url
    a.download = 'prism-changes.csv'
    a.click()
    URL.revokeObjectURL(url)
  }

  return (
    <main className="min-h-screen bg-gradient-to-b from-gray-900 via-purple-900 to-gray-900">
      <div className="container mx-auto px-4 py-8">
        {/* Header */}
        <div className="flex items-center justify-between mb-8">
          <div>
            <Link href="/" className="text-purple-400 hover:text-purple-300 mb-2 inline-block">
              ← Back to Home
            </Link>
            <div className="flex items-center gap-4">
              <h1 className="text-4xl font-bold text-white">
                🔮 {collectionName}
              </h1>
              <button
                onClick={() => {
                  const newName = prompt('Collection name:', collectionName)
                  if (newName) setCollectionName(newName)
                }}
                className="text-sm text-purple-400 hover:text-purple-300"
              >
                ✏️ Rename
              </button>
            </div>
            <p className="text-gray-400 mt-2">
              {decks.length === 0 ? 'Start by adding decks' : `${decks.length} deck${decks.length > 1 ? 's' : ''} • Auto-saved`}
            </p>
          </div>

          {/* Collection Actions */}
          <div className="flex gap-2">
            <button
              onClick={() => setShowLoadMenu(!showLoadMenu)}
              className="bg-gray-700 hover:bg-gray-600 text-white px-4 py-2 rounded-lg transition-colors"
            >
              📂 Load
            </button>
            <button
              onClick={handleNewCollection}
              className="bg-gray-700 hover:bg-gray-600 text-white px-4 py-2 rounded-lg transition-colors"
            >
              + New
            </button>
            <button
              onClick={handleExportCollection}
              disabled={decks.length === 0}
              className="bg-blue-600 hover:bg-blue-700 text-white px-4 py-2 rounded-lg transition-colors disabled:opacity-50"
            >
              💾 Export
            </button>
          </div>
        </div>

        {/* Load Menu */}
        {showLoadMenu && (
          <div className="bg-gray-800/90 backdrop-blur-sm rounded-lg p-6 border border-purple-500/30 mb-6">
            <div className="flex items-center justify-between mb-4">
              <h3 className="text-xl font-bold text-white">Saved Collections</h3>
              <button
                onClick={() => setShowLoadMenu(false)}
                className="text-gray-400 hover:text-white"
              >
                ✕
              </button>
            </div>

            {savedCollections.length === 0 ? (
              <p className="text-gray-400 text-center py-4">No saved collections yet</p>
            ) : (
              <div className="space-y-2 mb-4">
                {savedCollections.map((collection) => (
                  <div
                    key={collection.id}
                    className="flex items-center justify-between bg-gray-900/50 rounded-lg p-3 border border-gray-700"
                  >
                    <div className="flex-1">
                      <div className="font-semibold text-white">{collection.name}</div>
                      <div className="text-sm text-gray-400">
                        {collection.decks.length} deck{collection.decks.length > 1 ? 's' : ''} •
                        Updated {new Date(collection.updatedAt).toLocaleDateString()}
                      </div>
                    </div>
                    <div className="flex gap-2">
                      <button
                        onClick={() => handleLoadCollection(collection)}
                        className="bg-purple-600 hover:bg-purple-700 text-white px-3 py-1 rounded transition-colors text-sm"
                      >
                        Load
                      </button>
                      <button
                        onClick={() => handleDeleteCollection(collection.id)}
                        className="bg-red-600 hover:bg-red-700 text-white px-3 py-1 rounded transition-colors text-sm"
                      >
                        Delete
                      </button>
                    </div>
                  </div>
                ))}
              </div>
            )}

            <div className="border-t border-gray-700 pt-4">
              <input
                ref={fileInputRef}
                type="file"
                accept=".json"
                onChange={handleImportJSON}
                className="hidden"
              />
              <button
                onClick={() => fileInputRef.current?.click()}
                className="w-full bg-gray-700 hover:bg-gray-600 text-white px-4 py-2 rounded-lg transition-colors"
              >
                📤 Import JSON File
              </button>
            </div>
          </div>
        )}

        <div className="grid lg:grid-cols-2 gap-8">
          {/* Left Column: Deck Management */}
          <div>
            <div className="bg-gray-800/50 backdrop-blur-sm rounded-lg p-6 border border-purple-500/30 mb-6">
              <div className="flex items-center justify-between mb-4">
                <h2 className="text-2xl font-bold text-white">Your Decks ({decks.length}/10)</h2>
                {!showAddForm && (
                  <button
                    onClick={() => setShowAddForm(true)}
                    className="bg-purple-600 hover:bg-purple-700 text-white px-4 py-2 rounded-lg transition-colors"
                    disabled={decks.length >= 10}
                  >
                    + Add Deck
                  </button>
                )}
              </div>

              {/* Add Deck Form */}
              {showAddForm && (
                <div className="bg-gray-900/50 rounded-lg p-4 mb-4 border border-purple-500/20">
                  <h3 className="text-lg font-bold text-white mb-3">Add New Deck</h3>

                  <div className="space-y-3">
                    <div>
                      <label className="block text-sm text-gray-300 mb-1">Deck Name</label>
                      <input
                        type="text"
                        value={deckName}
                        onChange={(e) => setDeckName(e.target.value)}
                        className="w-full bg-gray-800 text-white rounded px-3 py-2 border border-gray-700 focus:border-purple-500 focus:outline-none"
                        placeholder="e.g., Spellslinger Izzet"
                      />
                    </div>

                    <div>
                      <label className="block text-sm text-gray-300 mb-1">Commander</label>
                      <input
                        type="text"
                        value={commander}
                        onChange={(e) => setCommander(e.target.value)}
                        className="w-full bg-gray-800 text-white rounded px-3 py-2 border border-gray-700 focus:border-purple-500 focus:outline-none"
                        placeholder="e.g., Alania, Divergent Storm"
                      />
                    </div>

                    <div>
                      <label className="block text-sm text-gray-300 mb-1">Bracket (1-4)</label>
                      <input
                        type="number"
                        min="1"
                        max="4"
                        value={bracket}
                        onChange={(e) => setBracket(parseInt(e.target.value))}
                        className="w-full bg-gray-800 text-white rounded px-3 py-2 border border-gray-700 focus:border-purple-500 focus:outline-none"
                      />
                    </div>

                    <div>
                      <label className="block text-sm text-gray-300 mb-2">Input Method</label>
                      <div className="flex gap-4">
                        <label className="flex items-center text-white">
                          <input
                            type="radio"
                            checked={inputMethod === 'paste'}
                            onChange={() => setInputMethod('paste')}
                            className="mr-2"
                          />
                          Paste Decklist
                        </label>
                        <label className="flex items-center text-white">
                          <input
                            type="radio"
                            checked={inputMethod === 'moxfield'}
                            onChange={() => setInputMethod('moxfield')}
                            className="mr-2"
                          />
                          Moxfield URL
                        </label>
                      </div>
                    </div>

                    {inputMethod === 'paste' ? (
                      <div>
                        <label className="block text-sm text-gray-300 mb-1">Decklist</label>
                        <textarea
                          value={decklist}
                          onChange={(e) => setDecklist(e.target.value)}
                          className="w-full bg-gray-800 text-white rounded px-3 py-2 border border-gray-700 focus:border-purple-500 focus:outline-none font-mono text-sm"
                          rows={8}
                          placeholder="1 Sol Ring&#10;1 Arcane Signet&#10;12 Island&#10;..."
                        />
                      </div>
                    ) : (
                      <div>
                        <label className="block text-sm text-gray-300 mb-1">Moxfield URL or ID</label>
                        <input
                          type="text"
                          value={moxfieldUrl}
                          onChange={(e) => setMoxfieldUrl(e.target.value)}
                          className="w-full bg-gray-800 text-white rounded px-3 py-2 border border-gray-700 focus:border-purple-500 focus:outline-none"
                          placeholder="https://www.moxfield.com/decks/abc123 or abc123"
                        />
                      </div>
                    )}

                    <div className="flex gap-2 pt-2">
                      <button
                        onClick={handleAddDeck}
                        disabled={loading}
                        className="bg-purple-600 hover:bg-purple-700 text-white px-4 py-2 rounded-lg transition-colors disabled:opacity-50"
                      >
                        {loading ? 'Loading...' : 'Add Deck'}
                      </button>
                      <button
                        onClick={() => setShowAddForm(false)}
                        className="bg-gray-700 hover:bg-gray-600 text-white px-4 py-2 rounded-lg transition-colors"
                      >
                        Cancel
                      </button>
                    </div>
                  </div>
                </div>
              )}

              {/* Deck List */}
              {decks.length === 0 ? (
                <div className="text-center py-8 text-gray-400">
                  <p className="mb-2">No decks added yet</p>
                  <p className="text-sm">Click "Add Deck" to get started</p>
                </div>
              ) : (
                <div className="space-y-3">
                  {decks.map((deck, index) => (
                    <div
                      key={deck.id}
                      className="bg-gray-900/50 rounded-lg p-4 border border-gray-700"
                    >
                      <div className="flex items-start justify-between">
                        <div className="flex-1">
                          <div className="flex items-center gap-2 mb-1">
                            <span className="text-lg font-bold text-white">{deck.name}</span>
                            {deck.assignedColor && (
                              <span className="text-sm px-2 py-0.5 rounded bg-purple-600/30 text-purple-300">
                                {deck.assignedColor}
                              </span>
                            )}
                          </div>
                          <p className="text-sm text-gray-400">Commander: {deck.commander}</p>
                          <p className="text-sm text-gray-400">
                            Bracket {deck.bracket} • {deck.cards.reduce((sum, c) => sum + c.quantity, 0)} cards
                          </p>
                        </div>
                        <button
                          onClick={() => handleRemoveDeck(deck.id)}
                          className="text-red-400 hover:text-red-300 transition-colors"
                        >
                          ✕
                        </button>
                      </div>
                    </div>
                  ))}
                </div>
              )}

              {decks.length > 0 && (
                <button
                  onClick={handleProcess}
                  disabled={isProcessing}
                  className="w-full mt-4 bg-gradient-to-r from-purple-600 to-pink-600 hover:from-purple-700 hover:to-pink-700 text-white font-bold py-3 rounded-lg transition-all disabled:opacity-50"
                >
                  {isProcessing ? 'Processing...' : `Process ${decks.length} Deck${decks.length > 1 ? 's' : ''}`}
                </button>
              )}
            </div>
          </div>

          {/* Right Column: Results */}
          <div>
            {processedData ? (
              <div className="bg-gray-800/50 backdrop-blur-sm rounded-lg p-6 border border-green-500/30">
                <h2 className="text-2xl font-bold text-white mb-4">✨ Results</h2>

                {/* Statistics */}
                <div className="grid grid-cols-2 gap-4 mb-6">
                  <div className="bg-gray-900/50 rounded-lg p-4">
                    <div className="text-3xl font-bold text-green-400">{processedData.stats.totalUniqueCards}</div>
                    <div className="text-sm text-gray-400">Unique Cards</div>
                  </div>
                  <div className="bg-gray-900/50 rounded-lg p-4">
                    <div className="text-3xl font-bold text-blue-400">{processedData.stats.sharedCards}</div>
                    <div className="text-sm text-gray-400">Shared Cards</div>
                  </div>
                  <div className="bg-gray-900/50 rounded-lg p-4">
                    <div className="text-3xl font-bold text-purple-400">{processedData.stats.totalCardSlots}</div>
                    <div className="text-sm text-gray-400">Total Slots</div>
                  </div>
                  <div className="bg-gray-900/50 rounded-lg p-4">
                    <div className="text-3xl font-bold text-pink-400">
                      {processedData.stats.totalCardSlots - processedData.stats.totalUniqueCards}
                    </div>
                    <div className="text-sm text-gray-400">Cards Saved!</div>
                  </div>
                </div>

                {/* Most Shared */}
                {processedData.stats.mostSharedCards.length > 0 && (
                  <div className="mb-6">
                    <h3 className="text-lg font-bold text-white mb-2">Most Shared Cards</h3>
                    <div className="space-y-1">
                      {processedData.stats.mostSharedCards.map((card) => (
                        <div key={card.name} className="text-sm text-gray-300">
                          <span className="font-semibold">{card.name}</span>
                          <span className="text-gray-500"> — {card.count} decks</span>
                        </div>
                      ))}
                    </div>
                  </div>
                )}

                {/* Download Buttons */}
                <div className="space-y-2">
                  <button
                    onClick={handleDownloadCSV}
                    className="w-full bg-green-600 hover:bg-green-700 text-white font-bold py-3 rounded-lg transition-colors"
                  >
                    📥 Download Full CSV ({processedData.cards.length} cards)
                  </button>

                  <button
                    onClick={handleDownloadJSON}
                    className="w-full bg-blue-600 hover:bg-blue-700 text-white font-bold py-3 rounded-lg transition-colors"
                  >
                    📥 Download JSON (Save for Later)
                  </button>

                  {oldProcessedData && (
                    <button
                      onClick={handleDownloadChanges}
                      className="w-full bg-yellow-600 hover:bg-yellow-700 text-white font-bold py-3 rounded-lg transition-colors"
                    >
                      📥 Download Changes Only
                    </button>
                  )}
                </div>

                <div className="mt-4 p-4 bg-purple-900/30 rounded-lg border border-purple-500/30">
                  <p className="text-sm text-purple-200">
                    💡 <strong>Tip:</strong> Your collection is auto-saved! Close and come back anytime.
                    Export to JSON for backup or sharing.
                  </p>
                </div>
              </div>
            ) : (
              <div className="bg-gray-800/50 backdrop-blur-sm rounded-lg p-6 border border-gray-700">
                <div className="text-center py-12 text-gray-400">
                  <div className="text-6xl mb-4">🎯</div>
                  <p className="text-lg mb-2">No Results Yet</p>
                  <p className="text-sm">Add decks and click "Process" to generate marking instructions</p>
                </div>
              </div>
            )}
          </div>
        </div>
      </div>
    </main>
  )
}
