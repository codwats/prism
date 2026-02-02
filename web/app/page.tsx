'use client'

import Link from 'next/link'
import ThemeToggle from '@/components/ThemeToggle'

export default function Home() {
  return (
    <wa-page>
      <div slot="main" className="container mx-auto px-4 py-12 max-w-4xl">
        <ThemeToggle />
          {/* Hero Section */}
          <div className="text-center mb-12">
            <h1 className="text-5xl font-bold mb-3">
              <wa-icon name="loyalty-colorless" library="ms" style={{ fontSize: '2.5rem' }}></wa-icon> PRISM
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
            <wa-card>
              <div slot="header" className="flex items-center gap-3">
                <wa-icon name="upload" library="fa" style={{ fontSize: '2rem' }}></wa-icon>
                <strong>Import Decks</strong>
              </div>
              <p>Paste decklists or import from Moxfield. Supports MTGO/Archidekt formats.</p>
            </wa-card>

            <wa-card>
              <div slot="header" className="flex items-center gap-3">
                <wa-icon name="paint-brush" library="fa" style={{ fontSize: '2rem' }}></wa-icon>
                <strong>Smart Marking</strong>
              </div>
              <p>Each deck gets a unique color and fixed position. Fan your cards to instantly find what you need.</p>
            </wa-card>

            <wa-card>
              <div slot="header" className="flex items-center gap-3">
                <wa-icon name="chart-bar" library="fa" style={{ fontSize: '2rem' }}></wa-icon>
                <strong>Track Changes</strong>
              </div>
              <p>Add new decks later? Only mark what changed—no need to re-mark hundreds of cards!</p>
            </wa-card>
          </div>

          {/* CTA */}
          <div className="text-center mb-16">
            <wa-button href="/process" appearance="filled" variant="brand" size="large">
              Start Processing Decks
              <wa-icon slot="suffix" name="arrow-right" library="fa"></wa-icon>
            </wa-button>
            <p className="text-sm mt-3 opacity-70">
              Free to use • No account required • Privacy-first
            </p>
          </div>

          {/* How It Works */}
          <div className="mb-16">
            <h2 className="text-2xl font-bold mb-6 text-center">How It Works</h2>
            <div className="space-y-4">
              <wa-card>
                <div className="flex items-start gap-3">
                  <div className="flex-shrink-0 w-8 h-8 bg-blue-600 text-white rounded-full flex items-center justify-center font-bold">1</div>
                  <div>
                    <h3 className="font-bold mb-1">Import Your Decks</h3>
                    <p className="opacity-80">
                      Add 1-10 Commander decks by pasting decklists or importing from Moxfield.
                    </p>
                  </div>
                </div>
              </wa-card>

              <wa-card>
                <div className="flex items-start gap-3">
                  <div className="flex-shrink-0 w-8 h-8 bg-blue-600 text-white rounded-full flex items-center justify-center font-bold">2</div>
                  <div>
                    <h3 className="font-bold mb-1">Get Marking Instructions</h3>
                    <p className="opacity-80">
                      Download a CSV showing exactly what to mark on each sleeve.
                    </p>
                  </div>
                </div>
              </wa-card>

              <wa-card>
                <div className="flex items-start gap-3">
                  <div className="flex-shrink-0 w-8 h-8 bg-blue-600 text-white rounded-full flex items-center justify-center font-bold">3</div>
                  <div>
                    <h3 className="font-bold mb-1">Mark Your Sleeves</h3>
                    <p className="opacity-80">
                      Use paint pens or markers to add colored stripes to your sleeves.
                    </p>
                  </div>
                </div>
              </wa-card>

              <wa-card>
                <div className="flex items-start gap-3">
                  <div className="flex-shrink-0 w-8 h-8 bg-blue-600 text-white rounded-full flex items-center justify-center font-bold">4</div>
                  <div>
                    <h3 className="font-bold mb-1">Add More Decks Anytime</h3>
                    <p className="opacity-80">
                      Load your saved collection, add new decks, and get a "changes only" CSV.
                    </p>
                  </div>
                </div>
              </wa-card>
            </div>
          </div>

          {/* FAQ */}
          <div className="mb-16">
            <h2 className="text-2xl font-bold mb-6 text-center">Frequently Asked Questions</h2>
            <div className="space-y-2">
              <wa-details summary="How does sleeve marking work?">
                <p>
                  Mark the top edge of your sleeves with colored stripes using paint pens. Each deck gets a unique color at a fixed position.
                  When you fan your cards out, you can quickly see which decks contain each card by looking at the marks.
                </p>
              </wa-details>

              <wa-details summary="Can I add more decks later without re-marking everything?">
                <p>
                  Yes! PRISM tracks your previous configuration. When you add new decks, it generates a "changes only" CSV showing
                  exactly which cards need new marks. You only mark what's changed.
                </p>
              </wa-details>

              <wa-details summary="What if I don't have paint pens?">
                <p>
                  Any permanent marker works! Paint pens (like Sharpie Oil-Based Paint Markers) are popular because they show up
                  clearly on dark sleeves, but regular Sharpies or other markers work fine on lighter sleeves.
                </p>
              </wa-details>

              <wa-details summary="Is my data stored anywhere?">
                <p>
                  No! Everything runs in your browser using localStorage. Your deck lists never leave your computer.
                  No account, no server, no tracking.
                </p>
              </wa-details>

              <wa-details summary="Can I use this for formats other than Commander?">
                <p>
                  While PRISM is designed for Commander (with bracket levels and singleton validation), you can use it for
                  any format where you share cards across multiple decks. Just ignore the Commander-specific features.
                </p>
              </wa-details>
            </div>
          </div>

          {/* Footer */}
          <footer className="text-center text-sm border-t pt-6 opacity-70">
            <p>PRISM - Built for the Commander community</p>
            <p className="mt-2">
              <a href="https://github.com/codwats/prism" className="hover:underline">
                <wa-icon name="github" library="fa-brands"></wa-icon> Open Source on GitHub
              </a>
            </p>
          </footer>
        </div>
      </wa-page>
  )
}
