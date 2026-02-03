# 🔮 PRISM - Personal Reference Index & Sleeve Marking

Share MTG Commander cards across multiple decks without buying duplicates.

## What is PRISM?

PRISM helps Magic: The Gathering Commander players share a single copy of expensive staples (like Sol Ring, Mana Crypt, fetch lands) across multiple decks by creating a systematic sleeve marking system.

**How it works:**
1. Import your decklists (up to 15 decks)
2. Each deck gets a unique color and stripe position
3. PRISM identifies shared cards and generates marking instructions
4. Mark your sleeves once, then swap cards between decks in seconds

## Features

- **Deck Import**: Paste decklists in standard MTGO/Moxfield format
- **Smart Deduplication**: Automatically finds cards shared across decks
- **Basic Land Handling**: Tracks quantities correctly (basics aren't singleton)
- **Export Options**: CSV, JSON, and printable marking guide
- **Stripe Reordering**: Adjust stripe positions after import
- **Auto-Save**: Data persists in browser localStorage
- **Dark Mode**: Toggle with the button or press `\`

## Local Development

### Quick Start

1. Clone or download this repository
2. Open `index.html` in your browser (or use a local server)

### Using a Local Server

For best results, use a local development server:

```bash
# Using Python
python -m http.server 8000

# Using Node.js (npx)
npx serve .

# Using PHP
php -S localhost:8000
```

Then open `http://localhost:8000` in your browser.

### File Structure

```
prism/
├── index.html          # Landing page
├── build.html          # PRISM builder application
├── css/
│   └── custom.css      # Minimal custom styles
├── js/
│   ├── app.js          # Main application logic
│   ├── parser.js       # Decklist parsing
│   ├── processor.js    # Card deduplication & stripe assignment
│   ├── storage.js      # localStorage persistence
│   └── export.js       # CSV/JSON/Print export
└── README.md
```

## Deploying to Netlify

### Option 1: Drag & Drop

1. Go to [Netlify Drop](https://app.netlify.com/drop)
2. Drag the entire `prism` folder onto the page
3. Done! You'll get a URL like `random-name-123.netlify.app`

### Option 2: Git Deployment

1. Push this repository to GitHub/GitLab/Bitbucket
2. Connect Netlify to your repository
3. Set build settings:
   - **Build command**: (leave empty)
   - **Publish directory**: `.` or `/`
4. Deploy!

### Custom Domain

1. In Netlify, go to Site Settings → Domain Management
2. Add your custom domain
3. Follow DNS configuration instructions

## Data Format

### Decklist Input Format

Standard MTGO/Moxfield format:
```
1 Sol Ring
1 Arcane Signet
1 Command Tower
12 Island
11 Mountain
1 Alania, Divergent Storm
```

**Rules:**
- Each line: `<quantity> <card name>`
- Comments start with `//`
- Parsing stops at `SIDEBOARD:` line
- Basic lands can have any quantity

### localStorage Schema

```javascript
{
  "version": 1,
  "currentPrismId": "uuid-here",
  "prisms": {
    "uuid-here": {
      "id": "uuid",
      "name": "My PRISM",
      "decks": [...],
      "createdAt": "ISO timestamp",
      "updatedAt": "ISO timestamp"
    }
  },
  "preferences": {
    "colorScheme": "auto",
    "defaultColors": [...]
  }
}
```

### Export Formats

#### CSV

Columns: Card Name, Is Basic Land, Copies Needed, Total Decks, Stripe Summary, plus 15 sets of (Slot N Color, Slot N Deck, Slot N Bracket) columns.

#### JSON

```json
{
  "prism": {
    "id": "uuid",
    "name": "My PRISM",
    "exportedAt": "ISO timestamp",
    "decks": [...],
    "cards": [
      {
        "name": "Sol Ring",
        "isBasicLand": false,
        "copiesNeeded": 1,
        "deckCount": 5,
        "stripes": [
          {
            "position": 1,
            "color": "#FF0000",
            "colorName": "Red",
            "deckName": "Izzet Spellslinger",
            "bracket": 2
          }
        ]
      }
    ],
    "statistics": {
      "totalUniqueCards": 450,
      "sharedCards": 75,
      "uniqueCards": 375
    }
  }
}
```

## Default Color Palette

PRISM uses colors that match standard paint pen sets:

| Color   | Hex Code |
|---------|----------|
| Red     | #FF0000  |
| Blue    | #0000FF  |
| Green   | #008000  |
| Yellow  | #FFFF00  |
| Orange  | #FFA500  |
| Purple  | #800080  |
| Pink    | #FFC0CB  |
| Cyan    | #00FFFF  |
| White   | #FFFFFF  |
| Brown   | #A52A2A  |
| Black   | #000000  |
| Silver  | #C0C0C0  |
| Gold    | #FFD700  |
| Lime    | #00FF00  |
| Magenta | #FF00FF  |

## Recommended Marking Supplies

- **Fine-tip paint pens** (Posca, Sharpie Oil-Based, etc.)
- **Inner sleeves** for double-sleeving (mark the inner sleeve)
- Mark on the **right edge** of the sleeve, top-to-bottom for positions 1-15

## Future Enhancements

Planned but not yet implemented:

- Scryfall API integration for card images
- Visual stripe preview on card image
- Moxfield URL import (requires API authorization)
- Supabase backend for cloud sync
- User accounts and shareable PRISMs

## Browser Support

PRISM uses Web Awesome components and modern JavaScript (ES modules). Supported browsers:

- Chrome/Edge 80+
- Firefox 80+
- Safari 14+

## License

MIT License - feel free to use, modify, and share!

---

Built with [Web Awesome](https://webawesome.com) 💎
