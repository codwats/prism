# 🔮 PRISM Web App

Web version of PRISM (Personal Reference Index & Sleeve Marking) - an MTG Commander deck sleeve marking tool.

## Tech Stack

- **Next.js 14** (App Router, Static Export)
- **TypeScript** (Strict mode)
- **Tailwind CSS** (Styling)
- **Web Awesome 3.1.0** (UI Components)
- **Netlify** (Hosting)

## Features

- ✨ Import decks from Moxfield or paste decklists
- 🎨 Smart sleeve marking system with fixed positions
- 📊 Track changes between collection updates
- 💾 Save and load collections (browser storage)
- 📥 Download CSV marking instructions

## Getting Started

### Prerequisites

- Node.js 18.0.0 or higher
- npm or yarn

### Installation

```bash
cd web
npm install
```

### Development

```bash
npm run dev
```

Open [http://localhost:3000](http://localhost:3000) in your browser.

### Build for Production

```bash
npm run build
```

Generates a static site in the `out/` directory.

### Deploy to Netlify

1. Push to GitHub
2. Connect repository to Netlify
3. Netlify will auto-detect the configuration from `netlify.toml`
4. Deploy!

## Project Structure

```
web/
├── app/                    # Next.js App Router
│   ├── page.tsx           # Landing page
│   ├── process/           # Main processing tool (coming soon)
│   ├── layout.tsx         # Root layout
│   └── globals.css        # Global styles
├── components/            # React components (coming soon)
│   └── ui/                # Web Awesome UI components
├── lib/
│   ├── prism/             # Core PRISM logic (ported from CLI)
│   │   ├── core/          # Parser, processor, delta
│   │   ├── output/        # CSV, JSON generators
│   │   └── utils/         # Normalizer, validator, reorder
│   └── moxfield.ts        # Moxfield API integration
├── public/                # Static assets
├── netlify.toml           # Netlify configuration
├── next.config.js         # Next.js configuration
├── tailwind.config.ts     # Tailwind configuration
└── package.json
```

## Core Logic

The `lib/prism/` directory contains the core PRISM logic ported from the CLI tool:

- **Parser** - Parse MTGO/Moxfield/Archidekt format decklists
- **Processor** - Deduplicate cards, assign colors, generate mark slots
- **Delta** - Calculate changes between collection states
- **Output** - Generate CSV and JSON files

All logic is pure TypeScript functions that work in both Node.js (CLI) and browser (web app).

## Moxfield Integration

The web app can fetch decklists directly from Moxfield's public API:

```typescript
import { fetchMoxfieldDeck, convertMoxfieldToPrismFormat } from '@/lib/moxfield'

const deck = await fetchMoxfieldDeck('abc123')
const decklist = convertMoxfieldToPrismFormat(deck)
```

## Roadmap

- [ ] Processing page UI
- [ ] Deck input components
- [ ] Deck list management
- [ ] Download CSV/JSON/Changes
- [ ] Browser storage for collections
- [ ] Deck reordering UI
- [ ] Multi-user support (Supabase auth + DB)
- [ ] Share collections via URL

## License

MIT
