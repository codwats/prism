import type { Config } from 'tailwindcss'

const config: Config = {
  content: [
    './pages/**/*.{js,ts,jsx,tsx,mdx}',
    './components/**/*.{js,ts,jsx,tsx,mdx}',
    './app/**/*.{js,ts,jsx,tsx,mdx}',
  ],
  theme: {
    extend: {
      colors: {
        // PRISM brand colors based on the palette
        'prism-red': '#ef4444',
        'prism-blue': '#3b82f6',
        'prism-green': '#22c55e',
        'prism-yellow': '#eab308',
        'prism-purple': '#a855f7',
        'prism-orange': '#f97316',
        'prism-pink': '#ec4899',
      },
    },
  },
  plugins: [],
}

export default config
