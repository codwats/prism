# PRISM — MTG Commander Sleeve Marking Tool

PRISM helps Magic: The Gathering Commander players who share cards across multiple decks mark their card sleeves with colored stripes so they can quickly identify which sleeve goes in which deck.

## Tech Stack

- **Frontend:** Vanilla JavaScript with ES modules (no bundler, no build step)
- **UI Components:** [Web Awesome 3.5.0](https://www.webawesome.com/) loaded via CDN kit
- **Styling:** `css/custom.css` + Web Awesome design tokens (`--wa-color-*`, `--wa-space-*`)
- **Persistence:** localStorage-first (`prism_data` key), optional Supabase sync when authenticated
- **Auth:** Supabase Auth (email/password), idempotent init pattern (`authInitialized` flag)
- **APIs:** Scryfall (card data, no key needed), Moxfield & Archidekt (deck import via edge proxies)
- **Hosting:** Netlify — `publish = "."` (root), edge functions in Deno/TypeScript
- **Dev server:** `http-server` on port 3456, configured in `.claude/launch.json`

## Project Structure

```
prism/
├── index.html              Landing page
├── build.html              Main PRISM builder (the core app)
├── guide.html              Marking guide
├── tools.html              Paint pen recommendations
├── profile.html            User account management
├── privacy.html / terms.html
├── css/custom.css          Styles beyond Web Awesome
├── js/
│   ├── app.js              Entry point for build.html (~12 lines, imports init)
│   ├── profile.js          Entry point for profile.html
│   ├── layout.js           Shared layout injection (nav, header, footer, auth dialog)
│   ├── core/
│   │   ├── state.js        Singleton mutable state (ES module = same reference everywhere)
│   │   ├── notifications.js  showError, showSuccess, showToast
│   │   └── utils.js        escapeHtml, getLogicalDeckCount
│   ├── features/           Build page feature modules
│   │   ├── init.js         getElements, init(), renderAll(), renderPrismHeader
│   │   ├── events.js       setupEventListeners, card preview handlers
│   │   ├── deck-form.js    Add deck form, color swatches, validation
│   │   ├── deck-import.js  Moxfield/Archidekt URL import, file upload, JSON import
│   │   ├── deck-list.js    Deck card rendering, edit/delete/split/mark handlers
│   │   ├── stripe-reorder-dialog.js  Visual slot-picker dialog for moving deck stripe positions
│   │   ├── results.js      Results table, sorting, filtering, deck filter menu
│   │   ├── analysis.js     Overlap matrix, what-if analysis
│   │   └── export-view.js  Deck legend, stripe reorder list (export tab)
│   └── modules/            Reusable business logic (shared across pages)
│       ├── processor.js    Core engine: processCards, createPrism, stripe assignment, split logic
│       ├── parser.js       Decklist parsing (MTGO/Moxfield format), basic land detection
│       ├── storage.js      localStorage + Supabase sync, version migrations
│       ├── auth.js         Supabase auth init, listeners, idempotent guard
│       ├── supabase-client.js  Supabase client singleton (public anon key)
│       ├── scryfall.js     Scryfall API with localStorage cache (24h TTL) + rate limiting
│       ├── moxfield.js     Moxfield deck import (via /api/moxfield-edge proxy)
│       ├── archidekt.js    Archidekt deck import (via /api/archidekt-edge proxy)
│       ├── export.js       CSV/JSON/printable guide export
│       └── card-preview.js Hover tooltip showing card image
├── netlify/
│   └── edge-functions/     Deno TypeScript, deployed to Netlify Edge
│       ├── moxfield-edge.ts   POST proxy → api2.moxfield.com
│       └── archidekt-edge.ts  POST proxy → archidekt.com/api
├── netlify.toml            Deployment config (publish ".", edge function routes)
├── supabase-schema.sql     Database schema (prisms, decks, deck_cards, app_logs)
└── package.json            Minimal (no deps, node >=18)
```

## Key Architecture Patterns

### State Management

`js/core/state.js` exports a singleton object. All feature modules `import { state }` and get the same reference. State fields:

- `currentPrism` — the active PRISM object (decks, cards, splitGroups, markedCards, removedCards)
- `deckToDelete` / `deckToEdit` — temp IDs for dialog workflows
- `elements` — cached DOM references (set during init)
- `sortState` — `{ column, direction }` for results table
- `selectedDeckIds` — `Set` for deck filter dropdown
- `processedCards` — cached result of last `processCards()` call (used by hover preview)

### Layout Injection

`js/layout.js` exports `initLayout({ activePage, headerCta })`. Every HTML page calls it to inject shared nav, header (with CTA button), footer, and auth dialog. Pages only contain their `<main>` content.

The nav uses `<wa-page mobile-breakpoint="768">` for desktop sidebar / mobile hamburger switching.

### Module Dependency Flow

```
app.js → features/init.js → all feature modules
                           → all core/ modules
                           → all modules/ business logic
```

Feature modules have circular imports (e.g., `deck-form ↔ deck-list`, `deck-list → init → deck-list`). This works because all exports are function declarations (hoisted) and only called at runtime, never during module evaluation.

### Storage

localStorage key: `prism_data`. Structure: `{ version, currentPrismId, prisms: { [id]: prismData }, preferences }`. Version migrations supported. Supabase sync happens optionally on auth state changes. `getPreferences()` merges with defaults so new preference keys auto-populate for existing users.

### PRISM Data Model

```
Prism: { id, name, decks[], splitGroups[], markedCards[], removedCards[], createdAt, updatedAt }
Deck:  { id, name, commander, bracket (1-5), color (hex), stripePosition (1-32), cards[], splitGroupId? }
SplitGroup: { id, name, sideAPosition, sideAColor, childDeckIds[], splitStyle ('stripes'|'dots') }
Card:  { name, quantity, isCommander, isBasicLand }
Preferences: { colorScheme, defaultColors, stripeStartCorner ('top-right'|'top-left'|'bottom-right'|'bottom-left') }
```

- **Stripe positions** 1–24 (Side A) and 25–48 (Side B), max 32 logical decks per PRISM
- **Split groups** let one deck slot have 2–8 variants sharing a Side A position
- **Split styles** — `'stripes'` (Side B marks on opposite edge) or `'dots'` (colored dots next to Side A stripe). Dot variant 1 has no dot; variant 2+ get colored dots.
- **Stripe starting corner** — global preference controlling which card corner stripes originate from. Affects card preview, not stored data.
- **markedCards** tracks which cards the user has physically marked (checkbox state)
- **removedCards** tracks cards removed from decks that still need physical marks cleared

### Card Processing

`processCards(prism)` deduplicates cards across all decks and assigns stripe indicators. Basic lands use **max quantity** across decks (not sum). Card names are canonicalized via Scryfall API before storage. For dot-style split groups, Side B entries include `markType: 'dot'` and `dotIndex` (0 = no dot, 1+ = colored dot).

### Display Counts

- **Decks tab** — Each deck card shows **pool** (cards in 2+ decks) and **core** (cards unique to that deck) counts. Both include full basic land quantities per deck. Computed via `getDeckPoolCoreCounts()` in `deck-list.js`.
- **Results tab** — Stats cards show **Total Cards** (sum of `totalQuantity` across all processed cards, including basic land copies) and **Pool Cards** (same sum but only cards in 2+ decks). These numbers help users plan sleeve purchases and storage.

## Common Debugging

### Web Awesome Components

- Components load from CDN (`kit.webawesome.com`). The `wa-menu` and `wa-menu-item` components sometimes fail to autoload — this is a known CDN issue, not our bug.
- Web Awesome inputs store values in shadow DOM. Use `element.shadowRoot?.querySelector('input')?.value` as fallback when `.value` is empty.
- `<wa-page mobile-breakpoint="768">` controls layout. Desktop shows sidebar nav; mobile shows hamburger.
- FOUC prevention: all HTML pages include `<style>wa-page:not(:defined){visibility:hidden}</style>`.

### Auth Double-Init

`initAuth()` is idempotent via `authInitialized` flag. Both `layout.js` and page scripts can call it safely. `setupAuthListeners()` is separate and handles UI updates.

### Circular Dependencies

Feature modules have circular imports. This is safe because:

1. ES module `export function` declarations are hoisted during evaluation
2. All cross-module function calls happen at runtime (user interactions), never at import time
3. By the time any function runs, all modules have fully evaluated

### Scryfall Rate Limiting

`scryfall.js` implements 100ms delay between requests, localStorage cache with 24h TTL, and request queuing. `canonicalizeCards()` corrects card name spelling/capitalization. Fuzzy fallback (on 404) is also rate-limited. 429 responses trigger a single retry with backoff. Entries with null `image_uri` are not cached (prevents 24h cache poisoning from transient errors). `card-preview.js` strips DFC back-face names before lookup and dual-caches under both the front-face and full Oracle name.

### Edge Function Proxies

Moxfield and Archidekt APIs don't allow direct browser requests (CORS). Edge functions at `/api/moxfield-edge` and `/api/archidekt-edge` act as POST proxies. They validate input format and forward to the upstream API.

## Development

```bash
# Dev server (defined in .claude/launch.json)
npx http-server -p 3456

# No build step — edit files and reload
# All JS is ES modules loaded directly by the browser
```

Preview viewport should be 1280px+ wide to see the desktop layout (sidebar nav). Below 768px triggers mobile layout.

## Conventions

- Use `state.elements.xxx` for cached DOM refs, never re-query by ID in hot paths
- Use `state.currentPrism` instead of a local variable — it's the single source of truth
- `renderAll()` is the safe way to re-render everything after state changes
- `savePrism(state.currentPrism)` persists to localStorage after mutations
- Feature modules import from `../core/`, `../modules/`, and sibling `./` files
- 22 paint pen colors in `DEFAULT_COLORS` (processor.js) — matched to real products
- Bracket values 1–5 represent Commander power level
- `formatSlotLabel(position, side?)` renders "Side A - Slot 1" style labels
- Stripe Settings in the Decks tab is a `<wa-details>` accordion (collapsed by default)
- The Stripe Positions reorder card was removed from the Decks tab — use the Move button (⊕) on each deck card to open the visual slot-picker dialog, or use the Export tab's dropdown list for bulk reordering
