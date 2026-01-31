'use client'

import Link from 'next/link'

export default function Home() {
  return (
    <main className="min-h-screen bg-gradient-to-b from-gray-900 via-purple-900 to-gray-900">
      <div className="container mx-auto px-4 py-16">
        {/* Hero Section */}
        <div className="text-center mb-16">
          <h1 className="text-6xl font-bold text-white mb-4">
            🔮 <span className="bg-gradient-to-r from-purple-400 to-pink-600 text-transparent bg-clip-text">PRISM</span>
          </h1>
          <p className="text-2xl text-gray-300 mb-2">
            Personal Reference Index & Sleeve Marking
          </p>
          <p className="text-xl text-gray-400">
            Share MTG Commander cards across multiple decks without buying duplicates
          </p>
        </div>

        {/* Value Proposition */}
        <div className="max-w-4xl mx-auto mb-16">
          <div className="bg-gray-800/50 backdrop-blur-sm rounded-lg p-8 border border-purple-500/30">
            <h2 className="text-3xl font-bold text-white mb-6 text-center">
              The Problem
            </h2>
            <p className="text-lg text-gray-300 mb-4">
              You have 5 Commander decks. Sol Ring appears in all 5. That's 5 copies to buy and track—expensive and wasteful.
            </p>
            <h2 className="text-3xl font-bold text-white mb-6 text-center mt-8">
              The Solution
            </h2>
            <p className="text-lg text-gray-300 mb-4">
              Buy <strong className="text-purple-400">ONE</strong> Sol Ring, mark its sleeve with 5 colored lines (one per deck), and swap it between decks as needed.
              Sell your extra 4 copies!
            </p>
          </div>
        </div>

        {/* Features */}
        <div className="grid md:grid-cols-3 gap-8 mb-16 max-w-6xl mx-auto">
          <div className="bg-gray-800/50 backdrop-blur-sm rounded-lg p-6 border border-blue-500/30">
            <div className="text-4xl mb-4">📥</div>
            <h3 className="text-xl font-bold text-white mb-2">Import Decks</h3>
            <p className="text-gray-400">
              Paste decklists or import from Moxfield. Supports MTGO/Archidekt formats.
            </p>
          </div>

          <div className="bg-gray-800/50 backdrop-blur-sm rounded-lg p-6 border border-green-500/30">
            <div className="text-4xl mb-4">🎨</div>
            <h3 className="text-xl font-bold text-white mb-2">Smart Marking</h3>
            <p className="text-gray-400">
              Each deck gets a unique color and fixed position. Fan your cards to instantly find what you need.
            </p>
          </div>

          <div className="bg-gray-800/50 backdrop-blur-sm rounded-lg p-6 border border-pink-500/30">
            <div className="text-4xl mb-4">📊</div>
            <h3 className="text-xl font-bold text-white mb-2">Track Changes</h3>
            <p className="text-gray-400">
              Add new decks later? Only mark what changed—no need to re-mark hundreds of cards!
            </p>
          </div>
        </div>

        {/* CTA */}
        <div className="text-center">
          <Link
            href="/process"
            className="inline-block bg-gradient-to-r from-purple-600 to-pink-600 text-white text-xl font-bold px-12 py-4 rounded-lg hover:from-purple-700 hover:to-pink-700 transition-all transform hover:scale-105 shadow-lg"
          >
            Start Processing Decks →
          </Link>
          <p className="text-gray-400 mt-4">
            Free to use • No account required • Privacy-first
          </p>
        </div>

        {/* How It Works */}
        <div className="max-w-4xl mx-auto mt-24">
          <h2 className="text-3xl font-bold text-white mb-8 text-center">How It Works</h2>
          <div className="space-y-6">
            <div className="flex items-start gap-4 bg-gray-800/50 backdrop-blur-sm rounded-lg p-6 border border-purple-500/20">
              <div className="flex-shrink-0 w-8 h-8 bg-purple-600 rounded-full flex items-center justify-center font-bold text-white">1</div>
              <div>
                <h3 className="text-xl font-bold text-white mb-2">Import Your Decks</h3>
                <p className="text-gray-400">
                  Add 1-10 Commander decks by pasting decklists or importing from Moxfield. PRISM analyzes card overlap instantly.
                </p>
              </div>
            </div>

            <div className="flex items-start gap-4 bg-gray-800/50 backdrop-blur-sm rounded-lg p-6 border border-blue-500/20">
              <div className="flex-shrink-0 w-8 h-8 bg-blue-600 rounded-full flex items-center justify-center font-bold text-white">2</div>
              <div>
                <h3 className="text-xl font-bold text-white mb-2">Get Marking Instructions</h3>
                <p className="text-gray-400">
                  Download a CSV showing exactly what to mark on each sleeve. Each deck gets a unique color and position.
                </p>
              </div>
            </div>

            <div className="flex items-start gap-4 bg-gray-800/50 backdrop-blur-sm rounded-lg p-6 border border-green-500/20">
              <div className="flex-shrink-0 w-8 h-8 bg-green-600 rounded-full flex items-center justify-center font-bold text-white">3</div>
              <div>
                <h3 className="text-xl font-bold text-white mb-2">Mark Your Sleeves</h3>
                <p className="text-gray-400">
                  Use paint pens or markers to add colored stripes to your sleeves. Each deck has a fixed position—easy to scan!
                </p>
              </div>
            </div>

            <div className="flex items-start gap-4 bg-gray-800/50 backdrop-blur-sm rounded-lg p-6 border border-pink-500/20">
              <div className="flex-shrink-0 w-8 h-8 bg-pink-600 rounded-full flex items-center justify-center font-bold text-white">4</div>
              <div>
                <h3 className="text-xl font-bold text-white mb-2">Add More Decks Anytime</h3>
                <p className="text-gray-400">
                  Load your saved collection, add new decks, and get a "changes only" CSV. No re-marking everything!
                </p>
              </div>
            </div>
          </div>
        </div>

        {/* Footer */}
        <footer className="text-center text-gray-500 mt-24 pt-8 border-t border-gray-800">
          <p>PRISM - Built with ❤️ for the Commander community</p>
          <p className="mt-2 text-sm">
            <a href="https://github.com/codwats/prism" className="hover:text-purple-400 transition-colors">
              Open Source on GitHub
            </a>
          </p>
        </footer>
      </div>
    </main>
  )
}
