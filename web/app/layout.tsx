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
    <html lang="en">
      <head>
        <script src="https://kit.webawesome.com/da021fed1e5141f2.js" crossOrigin="anonymous" async />
      </head>
      <body className="font-sans antialiased">{children}</body>
    </html>
  )
}
