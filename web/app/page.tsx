'use client'

import Link from 'next/link'

export default function Home() {
  return (
    <main className="min-h-screen bg-gray-50">
      <div className="container mx-auto px-4 py-12 max-w-5xl">
        {/* Hero Section */}
        <div className="text-center mb-12">
          <h1 className="text-5xl font-bold text-gray-900 mb-3">
            🔮 PRISM
          </h1>
          <p className="text-xl text-gray-600 mb-2">
            Personal Reference Index & Sleeve Marking
          </p>
          <p className="text-lg text-gray-500">
            Share MTG Commander cards across multiple decks without buying duplicates
          </p>
        </div>

        {/* Value Proposition */}
        <div className="mb-12 bg-white border border-gray-200 rounded p-6">
          <h2 className="text-2xl font-bold text-gray-900 mb-3">
            The Problem
          </h2>
          <p className="text-gray-700 mb-4">
            You have 5 Commander decks. Sol Ring appears in all 5. That's 5 copies to buy and track—expensive and wasteful.
          </p>
          <h2 className="text-2xl font-bold text-gray-900 mb-3">
            The Solution
          </h2>
          <p className="text-gray-700">
            Buy <strong>ONE</strong> Sol Ring, mark its sleeve with 5 colored lines (one per deck), and swap it between decks as needed.
            Sell your extra 4 copies!
          </p>
        </div>

        {/* Features */}
        <div className="grid md:grid-cols-3 gap-6 mb-12">
          <div className="bg-white border border-gray-200 rounded p-5">
            <div className="text-3xl mb-3">📥</div>
            <h3 className="text-lg font-bold text-gray-900 mb-2">Import Decks</h3>
            <p className="text-gray-600 text-sm">
              Paste decklists or import from Moxfield. Supports MTGO/Archidekt formats.
            </p>
          </div>

          <div className="bg-white border border-gray-200 rounded p-5">
            <div className="text-3xl mb-3">🎨</div>
            <h3 className="text-lg font-bold text-gray-900 mb-2">Smart Marking</h3>
            <p className="text-gray-600 text-sm">
              Each deck gets a unique color and fixed position. Fan your cards to instantly find what you need.
            </p>
          </div>

          <div className="bg-white border border-gray-200 rounded p-5">
            <div className="text-3xl mb-3">📊</div>
            <h3 className="text-lg font-bold text-gray-900 mb-2">Track Changes</h3>
            <p className="text-gray-600 text-sm">
              Add new decks later? Only mark what changed—no need to re-mark hundreds of cards!
            </p>
          </div>
        </div>

        {/* CTA */}
        <div className="text-center mb-16">
          <Link
            href="/process"
            className="inline-block bg-blue-600 text-white text-lg font-semibold px-8 py-3 rounded hover:bg-blue-700"
          >
            Start Processing Decks →
          </Link>
          <p className="text-gray-500 text-sm mt-3">
            Free to use • No account required • Privacy-first
          </p>
        </div>

        {/* How It Works */}
        <div className="mb-16">
          <h2 className="text-2xl font-bold text-gray-900 mb-6 text-center">How It Works</h2>
          <div className="space-y-4">
            <div className="bg-white border border-gray-200 rounded p-5">
              <div className="flex items-start gap-3">
                <div className="flex-shrink-0 w-7 h-7 bg-blue-600 text-white rounded-full flex items-center justify-center text-sm font-bold">1</div>
                <div>
                  <h3 className="font-bold text-gray-900 mb-1">Import Your Decks</h3>
                  <p className="text-gray-600 text-sm">
                    Add 1-10 Commander decks by pasting decklists or importing from Moxfield.
                  </p>
                </div>
              </div>
            </div>

            <div className="bg-white border border-gray-200 rounded p-5">
              <div className="flex items-start gap-3">
                <div className="flex-shrink-0 w-7 h-7 bg-blue-600 text-white rounded-full flex items-center justify-center text-sm font-bold">2</div>
                <div>
                  <h3 className="font-bold text-gray-900 mb-1">Get Marking Instructions</h3>
                  <p className="text-gray-600 text-sm">
                    Download a CSV showing exactly what to mark on each sleeve.
                  </p>
                </div>
              </div>
            </div>

            <div className="bg-white border border-gray-200 rounded p-5">
              <div className="flex items-start gap-3">
                <div className="flex-shrink-0 w-7 h-7 bg-blue-600 text-white rounded-full flex items-center justify-center text-sm font-bold">3</div>
                <div>
                  <h3 className="font-bold text-gray-900 mb-1">Mark Your Sleeves</h3>
                  <p className="text-gray-600 text-sm">
                    Use paint pens or markers to add colored stripes to your sleeves.
                  </p>
                </div>
              </div>
            </div>

            <div className="bg-white border border-gray-200 rounded p-5">
              <div className="flex items-start gap-3">
                <div className="flex-shrink-0 w-7 h-7 bg-blue-600 text-white rounded-full flex items-center justify-center text-sm font-bold">4</div>
                <div>
                  <h3 className="font-bold text-gray-900 mb-1">Add More Decks Anytime</h3>
                  <p className="text-gray-600 text-sm">
                    Load your saved collection, add new decks, and get a "changes only" CSV.
                  </p>
                </div>
              </div>
            </div>
          </div>
        </div>

        {/* Footer */}
        <footer className="text-center text-gray-500 text-sm border-t border-gray-200 pt-6">
          <p>PRISM - Built for the Commander community</p>
          <p className="mt-2">
            <a href="https://github.com/codwats/prism" className="text-blue-600 hover:underline">
              Open Source on GitHub
            </a>
          </p>
        </footer>
      </div>
    </main>
  )
}
