<h3 align="center">
	<img src="https://raw.githubusercontent.com/codwats/prism/refs/heads/main/assets/prismicon.png" width="100" alt="Logo"/><br/>
	<!-- <img src="https://raw.githubusercontent.com/codwats/prism/refs/heads/main/assets/PrismWebLogoSmall.png" width="146" alt="Wordmark"/><br/> -->
PRISM<br/>
<i>Personal Reference Index &amp; Sleeve Marking</i>
</h3>
Share Magic: The Gathering Commander cards across multiple decks without buying duplicates!

---

## What is PRISM?

PRISM is a tool that helps MTG Commander players manage shared cards across multiple decks using a physical sleeve marking system.

**The Problem:** You have 5 Commander decks. Sol Ring appears in all 5. That's 5 copies to buy and track.

**The Solution:** Buy ONE Sol Ring, mark its sleeve with 5 colored lines (one per deck), and swap it between decks as needed. Sell your extra 4 copies!

PRISM analyzes your decklists and generates:
- **CSV file** with sleeve marking instructions (which card gets which color marks)
- **JSON file** for future re-import and programmatic use
- **Terminal summary** showing statistics and most-shared cards

---

## Features

- ✅ Parse decklists in MTGO/Moxfield/Archidekt export format
- ✅ Deduplicate cards across 1-10 decks
- ✅ Assign unique colors to each deck (from 10-color palette)
- ✅ Generate actionable CSV output with marking instructions
- ✅ Export JSON for future re-import
- ✅ Track Commander bracket levels (1-4)
- ✅ Handle special characters in card names
- ✅ Ignore SIDEBOARD sections
- ✅ Comprehensive error handling and validation

---

## Installation

### Prerequisites

- **Node.js** 18.0.0 or higher
- **npm** or **yarn**

### Setup

```bash
# Clone the repository
git clone https://github.com/codwats/prism.git
cd prism

# Install dependencies
npm install

# Build the project
npm run build

# Run PRISM
npm start
```

### Optional: Install globally

```bash
npm install -g .
prism
```

---

## Usage

### Quick Start

```bash
npm start
```

PRISM supports two workflows: **creating a new collection** or **loading an existing one**.

### Workflow 1: New Collection

1. **Choose:** "Start new collection"
2. **How many decks?** Enter 1-10
3. **For each deck:**
   - Enter deck name (e.g., "Spellslinger Izzet")
   - Enter commander name (e.g., "Alania, Divergent Storm")
   - Enter bracket level (1-4)
   - Choose input method:
     - **Paste decklist:** Opens your default editor
     - **Load from file:** Provide file path
4. **Output paths:** Confirm or change file locations
5. **Done!** You get:
   - `prism-output.csv` - Full reference with all cards
   - `prism-output.json` - Save this to load later!

### Workflow 2: Load & Edit Existing Collection

1. **Choose:** "Load existing collection"
2. **Provide path:** to your `prism-output.json` file
3. **Menu options:**
   - **Add more decks** - Expand your collection
   - **Edit existing deck** - Update a deck's list
   - **Remove a deck** - Delete from collection
   - **Done** - Regenerate outputs
4. **Done!** You get:
   - `prism-output.csv` - Updated full reference
   - `prism-changes.csv` - **Only what changed!** 🎯
   - `prism-output.json` - Updated state

### Using Example Decks

```bash
npm start
```

When prompted for decklist input, choose "Load from file" and use:
- `examples/deck1-spellslinger.txt`
- `examples/deck2-energy.txt`
- `examples/deck3-stompy.txt`

**Try this workflow:**
1. Start new collection with decks 1 & 2
2. Save the JSON
3. Run PRISM again, load the JSON
4. Add deck 3
5. Check `prism-changes.csv` - only shows what to mark on deck 3!

---

## Decklist Format

PRISM accepts standard MTGO/Moxfield/Archidekt export format:

```
1 Sol Ring
1 Arcane Signet
12 Island
15 Mountain
1 Niv-Mizzet, Parun
```

**Parsing Rules:**
- Each line: `quantity cardname`
- Card names can contain special characters: `An Offer You Can't Refuse`, `Niv-Mizzet, Parun`
- Empty lines are ignored
- Lines starting with `//` are treated as comments
- Everything after `SIDEBOARD:` is ignored
- Duplicate cards within a deck trigger warnings (Commander is singleton)

---

## Output

### Full Reference CSV (`prism-output.csv`)

The complete database for marking your sleeves. Contains:

| Column | Description |
|--------|-------------|
| Card Name | The card's name |
| Quantity | Always 1 (shared system) |
| Total Decks | How many decks use this card |
| Mark Summary | Quick reference (e.g., "Red, Blue, Green") |
| Slot 1 Color | Color for mark position 1 |
| Slot 1 Deck | Deck name for slot 1 |
| Slot 1 Bracket | Bracket level for slot 1's deck |
| Slot 2... | (Continues for up to 10 slots) |

**Sorting:** Cards are sorted by:
1. Most shared first (cards in 5 decks before cards in 2 decks)
2. Then alphabetically by name

**Example row:**
```csv
Sol Ring,1,3,"Red, Blue, Green",Red,Spellslinger Izzet,2,Blue,Energy Aggro,3,Green,Mono-G Stompy,1
```

### Changes CSV (`prism-changes.csv`)

**Generated only when loading an existing collection.** This file shows ONLY what changed, so you don't have to re-mark hundreds of cards!

| Column | Description |
|--------|-------------|
| Card Name | The card's name |
| Action | NEW, UPDATE, or REMOVE |
| Old Marks | Previous marking (before change) |
| New Marks | New marking (after change) |
| What to Do | Human-readable instruction |

**Example rows:**
```csv
Card Name,Action,Old Marks,New Marks,What to Do
Sol Ring,UPDATE,"Red, Blue","Red, Blue, Green","Add: Green in slot 3"
New Card,NEW,(none),Green,"Mark new sleeve with: Green"
Old Card,REMOVE,"Red, Blue",(none),"Card no longer in any deck - remove from collection"
```

**Why this is useful:**
- When you add a 4th deck to your collection of 3 decks
- You only need to mark NEW cards and UPDATE existing cards
- Don't have to re-mark the 200+ cards that didn't change!

### JSON File

Structured data for future re-import and programmatic use:

```json
{
  "version": "1.0",
  "generatedAt": "2026-01-10T...",
  "decks": [
    {
      "id": "uuid",
      "name": "Spellslinger Izzet",
      "commander": "Alania, Divergent Storm",
      "bracket": 2,
      "assignedColor": "Red",
      "cardCount": 100
    }
  ],
  "cards": [
    {
      "name": "Sol Ring",
      "totalDecks": 3,
      "deckIds": ["uuid1", "uuid2", "uuid3"],
      "markSlots": [
        {
          "position": 1,
          "color": "Red",
          "deckName": "Spellslinger Izzet",
          "bracket": 2
        }
      ]
    }
  ],
  "colorPalette": {
    "uuid1": "Red",
    "uuid2": "Blue"
  }
}
```

### Terminal Summary

After processing, you'll see:
- Each deck's name, commander, bracket, assigned color
- Total unique cards vs. total card slots
- How many physical cards you actually need
- Top 5 most-shared cards

---

## Color Palette

PRISM assigns colors to decks in entry order:

1. Red
2. Blue
3. Green
4. Yellow
5. Purple
6. Orange
7. Pink
8. Black
9. White
10. Brown

Match these to your available paint pens or markers when marking sleeves.

---

## Commander Brackets

Bracket levels (1-4) indicate power level:

| Bracket | Description |
|---------|-------------|
| 1 | Casual/precon level |
| 2 | Focused but not optimized |
| 3 | Optimized, powerful |
| 4 | Competitive/cEDH |

Brackets are stored as metadata and displayed in output, but don't affect marking logic.

---

## Project Structure

```
prism/
├── src/
│   ├── index.ts              # CLI entry point
│   ├── core/
│   │   ├── types.ts          # TypeScript interfaces
│   │   ├── parser.ts         # Decklist parsing
│   │   ├── processor.ts      # Card deduplication & analysis
│   ├── output/
│   │   ├── csv.ts            # CSV generation
│   │   ├── json.ts           # JSON generation
│   │   └── summary.ts        # Terminal summary display
│   └── utils/
│       ├── normalizer.ts     # Card name normalization
│       └── validator.ts      # Input validation
├── examples/                  # Example decklists
├── dist/                      # Compiled JavaScript (generated)
├── package.json
├── tsconfig.json
└── README.md
```

---

## Architecture

### Design Principles

1. **Functional Core, Imperative Shell**
   - Core logic (`parser.ts`, `processor.ts`) consists of pure functions
   - I/O operations isolated to edges (`index.ts`, output modules)

2. **Type Safety**
   - Strict TypeScript mode enabled
   - All data structures fully typed
   - No `any` types

3. **Stateless Processing**
   - Functions take input, return output, no side effects
   - Easy to test and reason about

4. **Modular Architecture**
   - Core logic independent of CLI interface
   - Can be imported into Next.js or other frameworks
   - Ready for future web UI integration

### Data Flow

```
User Input (CLI prompts)
    ↓
Deck Collection (index.ts)
    ↓
Parser (parser.ts) → Card[]
    ↓
Processor (processor.ts) → ProcessedData
    ↓
Output Generators (csv.ts, json.ts)
    ↓
Files Written to Disk
```

---

## Future Enhancements

PRISM is designed to evolve. Planned features:

- [ ] **Moxfield API integration** — Fetch decklists by URL or username
- [ ] **JSON re-import** — Add more decks to existing PRISM output
- [ ] **Web UI** — Next.js page with drag-drop upload, live preview
- [ ] **Scryfall integration** — Card name validation, autocomplete
- [ ] **Visual marking guide** — Generate printable PDF showing mark positions
- [ ] **Deck comparison** — Side-by-side diff of two decks
- [ ] **Collection tracking** — Mark cards you own vs. need to acquire
- [ ] **Multiple marking styles** — Dots, lines, symbols

---

## Integration with Next.js / Web

PRISM's core logic is **framework-agnostic** and ready for web integration:

### Example Next.js API Route

```typescript
// app/api/prism/route.ts
import { parseDecklist } from '@/prism/core/parser';
import { processDecks } from '@/prism/core/processor';
import { generateCSV } from '@/prism/output/csv';

export async function POST(request: Request) {
  const { decks } = await request.json();

  // Parse and process
  const parsedDecks = decks.map(/* ... */);
  const processed = processDecks(parsedDecks);

  // Generate output
  const csv = generateCSV(processed);

  return new Response(csv, {
    headers: {
      'Content-Type': 'text/csv',
      'Content-Disposition': 'attachment; filename="prism-output.csv"'
    }
  });
}
```

### Example React Component

```tsx
import { processDecks } from '@/prism/core/processor';
import { useState } from 'react';

export function PrismUI() {
  const [processedData, setProcessedData] = useState(null);

  const handleProcess = () => {
    const result = processDecks(decks);
    setProcessedData(result);
  };

  return (
    <div>
      {/* UI for deck input */}
      {processedData && <ResultsDisplay data={processedData} />}
    </div>
  );
}
```

---

## Development

### Scripts

```bash
# Build TypeScript
npm run build

# Run the CLI
npm start

# Run in dev mode (build + run)
npm run dev

# Clean build artifacts
npm run clean
```

### Testing with Example Decks

Three example decklists are provided in `examples/`:

1. **Spellslinger Izzet** (Alania, Divergent Storm) — Bracket 2
2. **Energy Aggro** (Chandra, Hope's Beacon) — Bracket 3
3. **Mono-G Stompy** (Ghalta, Primal Hunger) — Bracket 2

These decks have intentional overlaps (Sol Ring, Arcane Signet, Command Tower, etc.) to demonstrate the marking system.

---

## Contributing

Contributions welcome! Please:

1. Fork the repository
2. Create a feature branch (`git checkout -b feature/amazing-feature`)
3. Commit your changes (`git commit -m 'Add amazing feature'`)
4. Push to the branch (`git push origin feature/amazing-feature`)
5. Open a Pull Request

---

## License

This project is licensed under the MIT License - see the [LICENSE](LICENSE) file for details.

---

## Acknowledgments

- Inspired by the MTG Commander community's desire to share expensive staples
- Built with the same stack as [defcatmtg.com](https://defcatmtg.com) for future integration
- Thanks to Wizards of the Coast for Magic: The Gathering

---

## Support

Have questions or issues? Please open an issue on GitHub.

**Happy deck building! 🎨🔮**
