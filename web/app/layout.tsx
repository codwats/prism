import type { Metadata } from 'next'
import { Inter } from 'next/font/google'
import './globals.css'

const inter = Inter({ subsets: ['latin'] })

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
      <body className={inter.className}>{children}</body>
    </html>
  )
}
