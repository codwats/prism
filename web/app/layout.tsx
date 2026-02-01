import type { Metadata } from 'next'
import './globals.css'

export const metadata: Metadata = {
  title: 'PRISM - Personal Reference Index & Sleeve Marking',
  description: 'Share MTG Commander cards across multiple decks without buying duplicates',
  keywords: ['MTG', 'Magic the Gathering', 'Commander', 'EDH', 'Deck Management', 'Sleeve Marking'],
}

export default function RootLayout({
  children,
}: {
  children: React.ReactNode
}) {
  return (
    <html lang="en" className="dark">
      <head>
        <link rel="icon" type="image/png" href="/favicon.png" />
        <link href="//cdn.jsdelivr.net/npm/mana-font@latest/css/mana.css" rel="stylesheet" type="text/css" />
        <script src="https://kit.webawesome.com/da021fed1e5141f2.js" crossOrigin="anonymous" async />
      </head>
      <body>{children}</body>
    </html>
  )
}
