'use client'

import Link from 'next/link'
import ThemeToggle from '@/components/ThemeToggle'

export default function Home() {
  return (
    <>
      <ThemeToggle />
      <main className="min-h-screen">
        <div className="container mx-auto px-4 py-12 max-w-4xl">
          {/* Hero Section */}
          <div className="text-center mb-12">
            <h1 className="text-5xl font-bold mb-3">
              <i className="ms ms-loyalty-colorless ms-2x"></i> PRISM
            </h1>
            <p className="text-xl mb-2">
              Personal Reference Index & Sleeve Marking
            </p>
            <p className="text-lg">
              Share MTG Commander cards across multiple decks without buying duplicates
            </p>
          </div>

          {/* Value Proposition */}
          <div className="mb-12 p-6 border rounded">
            <h2 className="text-2xl font-bold mb-3">
              The Problem
            </h2>
            <p className="mb-4">
              You have 5 Commander decks. Sol Ring appears in all 5. That's 5 copies to buy and track—expensive and wasteful.
            </p>
            <h2 className="text-2xl font-bold mb-3">
              The Solution
            </h2>
            <p>
              Buy <strong>ONE</strong> Sol Ring, mark its sleeve with 5 colored lines (one per deck), and swap it between decks as needed.
              Sell your extra 4 copies!
            </p>
          </div>

          {/* Features */}
          <div className="grid md:grid-cols-3 gap-6 mb-12">
            <div className="p-5 border rounded">
              <div className="text-3xl mb-3"><i className="fa-solid fa-file-import"></i></div>
              <h3 className="text-lg font-bold mb-2">Import Decks</h3>
              <p className="text-sm">
                Paste decklists or import from Moxfield. Supports MTGO/Archidekt formats.
              </p>
            </div>

            <div className="p-5 border rounded">
              <div className="text-3xl mb-3"><i className="fa-solid fa-palette"></i></div>
              <h3 className="text-lg font-bold mb-2">Smart Marking</h3>
              <p className="text-sm">
                Each deck gets a unique color and fixed position. Fan your cards to instantly find what you need.
              </p>
            </div>

            <div className="p-5 border rounded">
              <div className="text-3xl mb-3"><i className="fa-solid fa-chart-line"></i></div>
              <h3 className="text-lg font-bold mb-2">Track Changes</h3>
              <p className="text-sm">
                Add new decks later? Only mark what changed—no need to re-mark hundreds of cards!
              </p>
            </div>
          </div>

          {/* CTA */}
          <div className="text-center mb-16">
            <Link
              href="/process"
              className="inline-block px-8 py-3 rounded text-lg font-semibold bg-blue-600 text-white hover:bg-blue-700"
            >
              Start Processing Decks <i className="fa-solid fa-arrow-right"></i>
            </Link>
            <p className="text-sm mt-3 opacity-70">
              Free to use • No account required • Privacy-first
            </p>
          </div>

          {/* How It Works */}
          <div className="mb-16">
            <h2 className="text-2xl font-bold mb-6 text-center">How It Works</h2>
            <div className="space-y-4">
              <div className="p-5 border rounded">
                <div className="flex items-start gap-3">
                  <div className="flex-shrink-0 w-8 h-8 bg-blue-600 text-white rounded-full flex items-center justify-center font-bold">1</div>
                  <div>
                    <h3 className="font-bold mb-1">Import Your Decks</h3>
                    <p className="text-sm opacity-80">
                      Add 1-10 Commander decks by pasting decklists or importing from Moxfield.
                    </p>
                  </div>
                </div>
              </div>

              <div className="p-5 border rounded">
                <div className="flex items-start gap-3">
                  <div className="flex-shrink-0 w-8 h-8 bg-blue-600 text-white rounded-full flex items-center justify-center font-bold">2</div>
                  <div>
                    <h3 className="font-bold mb-1">Get Marking Instructions</h3>
                    <p className="text-sm opacity-80">
                      Download a CSV showing exactly what to mark on each sleeve.
                    </p>
                  </div>
                </div>
              </div>

              <div className="p-5 border rounded">
                <div className="flex items-start gap-3">
                  <div className="flex-shrink-0 w-8 h-8 bg-blue-600 text-white rounded-full flex items-center justify-center font-bold">3</div>
                  <div>
                    <h3 className="font-bold mb-1">Mark Your Sleeves</h3>
                    <p className="text-sm opacity-80">
                      Use paint pens or markers to add colored stripes to your sleeves.
                    </p>
                  </div>
                </div>
              </div>

              <div className="p-5 border rounded">
                <div className="flex items-start gap-3">
                  <div className="flex-shrink-0 w-8 h-8 bg-blue-600 text-white rounded-full flex items-center justify-center font-bold">4</div>
                  <div>
                    <h3 className="font-bold mb-1">Add More Decks Anytime</h3>
                    <p className="text-sm opacity-80">
                      Load your saved collection, add new decks, and get a "changes only" CSV.
                    </p>
                  </div>
                </div>
              </div>
            </div>
          </div>

          {/* Footer */}
          <footer className="text-center text-sm border-t pt-6 opacity-70">
            <p>PRISM - Built for the Commander community</p>
            <p className="mt-2">
              <a href="https://github.com/codwats/prism" className="hover:underline">
                <i className="fa-brands fa-github"></i> Open Source on GitHub
              </a>
            </p>
          </footer>
        </div>
      </main>
    </>
  )
}
