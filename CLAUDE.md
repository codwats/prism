# PRISM — MTG Commander Sleeve Marking Tool

PRISM helps Magic: The Gathering Commander players who share cards across multiple decks mark their card sleeves with colored stripes so they can quickly identify which sleeve goes in which deck.

## Tech Stack

- **Frontend:** Vanilla JavaScript with ES modules (no bundler, no build step)
- **UI Components:** [Web Awesome 3.10.0](https://www.webawesome.com/) loaded via CDN kit. WA CSS, the autoloader, fonts, and `custom.css` are **static tags in every page's `<head>`** (so the browser preload scanner starts them at byte 0); `injectHeadResources` in layout.js skips tags already present and remains only as a fallback. Keep the static blocks and layout.js URLs in sync when bumping versions.
- **Styling:** `css/custom.css` + Web Awesome design tokens (`--wa-color-*`, `--wa-space-*`)
- **Persistence:** localStorage-first (`prism_data` key), optional Supabase sync when authenticated with merge-before-write conflict handling
- **Auth:** Supabase Auth (email/password), idempotent init via cached `authInitPromise` so concurrent callers share one awaitable sync; `initAuth()` waits for the Supabase CDN script `load` event before proceeding so slow CDN loads don't break auth. The SDK is **lazy**: layout.js eager-loads it only when `hasStoredSession()` (sync localStorage check for `sb-<ref>-auth-token`) or an `access_token` URL hash exists; anonymous visitors get it on demand via `ensureAuthReady()` (login-button click, or top of `signUp`/`signIn`/`resetPassword`)
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
│   │   └── utils.js        escapeHtml, getLogicalDeckCount, stripePositionLabel, debugLog
│   ├── features/           Build page feature modules
│   │   ├── init.js         getElements, init(), renderAll(), renderPrismHeader, setupSyncStatus
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
│       ├── storage.js      localStorage + Supabase sync, version migrations, per-entity merge logic
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
├── supabase-schema.sql     Database schema (prisms, decks, deck_cards, app_logs, replace_deck_cards RPC)
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

localStorage key: `prism_data`. Structure: `{ version, currentPrismId, prisms: { [id]: prismData }, preferences, syncState }`. `syncState` stores per-prism sync baselines plus local deletion tombstones and un-mark tombstones so multi-device merges can distinguish local edits from local deletes and intentional un-marks. Version migrations supported. Supabase sync happens optionally on auth state changes and on debounced saves while authenticated. `getPreferences()` merges with defaults so new preference keys auto-populate for existing users.

Sync behavior is merge-first, not whole-PRISM last-write-wins:

- On login/session restore, local and cloud PRISMs are merged per prism, per deck, and per split group.
- `markedCards` merge by union minus any keys with an `unmarkedCards` tombstone newer than the last sync baseline — this ensures intentional un-marks (manual checkbox or auto-unmark when a new deck shares a card) are not reverted by the cloud copy.
- `removedCards` merge by `(cardName, deckId)` with latest `removedAt`.
- Background saves fetch the latest cloud copy, merge it with local using the stored baseline, then write the merged result back to Supabase.
- Deck and split-group `updatedAt` timestamps are important for conflict resolution and should be preserved on mutation.
- Split-group child ordering should be preserved from `group.childDeckIds` during merge; only orphaned child IDs should be dropped, with deck-derived order used as a fallback when the stored ordering is missing.
- Auto-created empty PRISMs (no decks, no cards, no prior baseline) are **not** uploaded to Supabase during the login sync — they exist only as a pre-login UI placeholder and are discarded when real cloud data is available.
- `syncWithSupabase` tracks which prisms have genuine local changes (`needsCloudWrite` set) and only writes those. Cloud-only prisms (fresh device load) have their baseline recorded without re-uploading, preventing redundant `replace_deck_cards` calls.
- `savePrismToSupabase` continues past per-deck RPC failures so one failing deck does not leave all subsequent decks without cards. It returns `false` when any deck fails so the baseline is not recorded and the sync retries.

### PRISM Data Model

```
Prism: { id, name, decks[], splitGroups[], markedCards[], removedCards[], createdAt, updatedAt }
Deck:  { id, name, commander, bracket (1-5), color (hex), stripePosition (1-48), cards[], splitGroupId? }
SplitGroup: { id, name, sideAPosition, sideAColor, childDeckIds[], splitStyle ('stripes'|'dots'), createdAt?, updatedAt? }
Card:  { name, quantity, isCommander, isBasicLand }
Preferences: { colorScheme, defaultColors, stripeStartCorner ('top-right'|'top-left'|'bottom-right'|'bottom-left') }
```

- **Stripe positions** 1–24 (Side A) and 25–48 (Side B) — 48 physical slots, the real capacity limit (`MAX_STRIPE_SLOTS` in `processor.js`). Stripe-only decks/variants each consume one slot (up to 48 decks); dot variants share a Side A slot (up to 96 decks). There is no fixed "logical deck" cap — adding a standalone deck is gated on slot availability (`getUsedPositions(prism).size >= MAX_STRIPE_SLOTS`).
- **Split groups** let one deck slot have 2–8 (stripes) or exactly 2 (dots) variants sharing a Side A position. The group itself holds `name`, `sideAColor`, and `sideAPosition` — editable via the ✎ button on the group card header (`handleEditGroupClick`/`handleEditGroupConfirm` in `deck-list.js`, `updateSplitGroupInPrism` in `processor.js`).
- **Split styles** — `'stripes'` (Side B marks on opposite edge) or `'dots'` (one colored dot next to the Side A stripe square). Dots groups are capped at 2 variants (physical 1-hole limit). Child variant marks are determined in a **post-loop pass** using shared-vs-subset analysis:
  - Card in **all** children → parent Side A stripe only; membership anchors emitted per variant for deck-filter (not rendered)
  - Card in **subset**, stripes-style → child Side B stripe per matching variant
  - Card in **subset**, dots-style, exactly 1 variant → dot in that variant's color
  - Card in **subset**, dots-style, 2+ variants → dot conflict; membership anchors only, parent stripe only
- **Stripe starting corner** — global preference controlling which card corner stripes originate from. Applying it runs `remapPrismForCorner` (processor.js), which rewrites every stored `stripePosition`/`sideAPosition` so physical mark locations are preserved under the new numbering — slot numbers change and are saved/synced; the marks on sleeves don't move.
- **markedCards** tracks which cards the user has physically marked (checkbox state)
- **removedCards** tracks cards removed from decks that still need physical marks cleared
- **syncState** is local-only metadata used for Supabase merge reconciliation; it is not part of the PRISM domain model. Baseline shape per prism: `{ updatedAt, deckUpdatedAts, splitGroupUpdatedAts, deletedDecks, deletedSplitGroups, unmarkedCards: { [cardKey]: isoTimestamp } }`

### Card Processing

`processCards(prism)` deduplicates cards across all decks and assigns stripe indicators. Basic lands use **max quantity** across decks (not sum). Card names are canonicalized via Scryfall API before storage. Child variant marks for split groups are emitted in a **post-loop pass** — the main loop only emits the group's Side A stripe. The post-loop determines shared vs subset membership for the full group before emitting any child marks (see split styles above). `markType` values: `'stripe'` (rendered Side B stripe), `'dot'` (rendered dot), `'membership'` (not rendered; carries `deckId` for deck-filter matching). `dotIndex` is not stored — renderers compute local dot order from the stripes array at render time. Results table and printable guide both use ö-style rendering (dot row above the stripe square).

### Display Counts

- **Decks tab** — Each deck card shows **pool** (cards in 2+ *logical* decks) and **core** (cards unique to one logical deck) counts. Both include full basic land quantities per deck. Computed via `getDeckPoolCoreCounts()` in `deck-list.js`.
- **Results tab** — Stats cards show **Total Cards** (sum of `totalQuantity` across all processed cards, including basic-land and any-number card copies — `totalQuantity` is the max quantity across decks for every card) and **Pool Cards** (same sum but only cards in 2+ logical decks). These numbers help users plan sleeve purchases and storage.

### Logical vs Physical Deck Count

`processCards()` returns two count fields per card:
- `deckCount` — raw count of individual deck IDs (includes each split variant separately). Used for sorting and display of "N decks" in the Stripes column.
- `logicalDeckCount` — standalone decks + split groups, where all variants of the same split group count as 1. Used for all pool/shared/core classification. A card shared only among variants of the same split group has `logicalDeckCount: 1` and is treated as **core**, not pool.

### Split Position Assignment

`getNextVariantPosition(prism)` scans slots 48→25 (Side B, far end) then 1→24 (Side A) and returns the first unused position. Returns **`null`** — not a fallback index — when all 48 slots are occupied.

`splitDeck` and `addSplitToGroup` check for `null` and **throw** before mutating any deck or assigning any `stripePosition`/`sideAPosition`. Callers in `deck-list.js` (`handleSplitConfirm`, `handleAddSplit`) wrap these in try/catch and surface the error via `showError`, leaving `state.currentPrism` unchanged.

## Common Debugging

### Web Awesome Components

- Components load from CDN (`kit.webawesome.com`). The `wa-menu` and `wa-menu-item` components sometimes fail to autoload — this is a known CDN issue, not our bug.
- Web Awesome inputs store values in shadow DOM. Use `element.shadowRoot?.querySelector('input')?.value` as fallback when `.value` is empty.
- `<wa-page mobile-breakpoint="768">` controls layout. Desktop shows sidebar nav; mobile shows hamburger.
- FOUC prevention: all HTML pages include `<style>wa-page:not(:defined){visibility:hidden}</style>`.
- **Dialog open/close:** Use `dialog.setAttribute('open', '')` / `dialog.removeAttribute('open')` — NOT `dialog.open = true/false`. The property setter only works after WA upgrades the element; the attribute is observed via `attributeChangedCallback` and works before upgrade too.
- **`<wa-button href>` navigation:** WA button href-navigation only works after the element is upgraded. Add a `click` listener fallback (`window.location.href = ...`) for any nav `<wa-button href>` that must work immediately on page load.

### Auth Double-Init

`initAuth()` caches its async body as `authInitPromise`. Both `layout.js` and page scripts can call it safely and will await the same Promise — including the initial `syncWithSupabase()` — so cloud merge always completes before any caller proceeds. `setupAuthListeners()` is separate and handles UI updates. It calls `updateAuthUI(currentUser)` at the end so the nav reflects auth state immediately, since `INITIAL_SESSION` from Supabase can fire before listeners are registered when the session is already in memory.

If the Supabase CDN hasn't loaded when `initAuth()` runs, it awaits the script's `load` event (5s timeout fallback). If `getSupabase()` still returns null after the wait (CDN error/timeout), `authInitPromise` is reset to `null` so callers can retry — without this reset, a resolved-null promise would permanently block re-initialization.

### Supabase Card Sync

`savePrismToSupabase()` replaces all cards for each deck via the `replace_deck_cards(p_deck_id, p_cards, p_created_at)` RPC defined in `supabase-schema.sql`. The RPC runs DELETE + INSERT in a single transaction, preventing a partial-failure window where a deck could be left with no cards. Pass an empty array to clear cards safely. Uses `SECURITY INVOKER` so existing RLS on `deck_cards` applies — users cannot replace cards in decks they don't own. Run `supabase-schema.sql` in the Supabase SQL editor after any schema changes.

The deck-card loop uses **continue-on-error**: a failing RPC for one deck is logged but does not abort the loop. All decks are attempted. If any deck failed, `savePrismToSupabase` returns `false` so `recordPrismBaseline` is not called and the next debounced save retries.

**No `updated_at` triggers on `prisms` or `decks`.** The client always supplies `updated_at` on upsert. A server-side trigger that overwrites it with `now()` (server clock) causes clock-skew bugs: `cloud.updated_at` ends up ahead of `local.updatedAt`, so `mergeEntityCollection` in `syncPrismToSupabase` silently picks the stale cloud deck and reverts user edits on the next page load. The schema includes an idempotent `BEGIN/COMMIT` migration block to drop those triggers on existing deployments.

### Merge Conflict Resolution

`mergeEntityCollection` handles three cases per entity ID:
- **Both local and cloud present:** if `local.updatedAt > baseline.updatedAt` for that entity, local wins (user edited since last sync — guards against server-clock-ahead skew). Otherwise, `pickNewerEntity` compares timestamps.
- **Local only:** kept if `local.updatedAt > baseline.updatedAt`, otherwise treated as deleted on another device.
- **Cloud only:** kept unless locally deleted after the cloud's `updatedAt`.

**markedCards tombstones:** `mergeMarkedCards(local, cloud, unmarkedTombstones, baselineUpdatedAt)` starts from the union of local+cloud marks, then removes any key whose tombstone timestamp is strictly greater than `baselineUpdatedAt`. `recordPrismBaseline` prunes tombstones with `unmarkedAt <= newBaseline.updatedAt` after each successful sync (they've been baked in). `recordUnmarkedCards(prismId, cardKeys)` writes the tombstones; call it immediately before `savePrism()` whenever cards are removed from `markedCards` — in `handleMarkToggle` (un-check), `unmarkSharedCards` (new deck shares a card), and `unmarkCardsWithNewStripes` (deck edit adds stripes). `unmarkSharedCards` and `unmarkCardsWithNewStripes` now return the array of removed keys (was: count); callers compute `.length` for the success message.

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
- When removing cards from `markedCards`, call `recordUnmarkedCards(prismId, keys)` **before** `savePrism()` to record tombstones that survive the next cloud merge
- Feature modules import from `../core/`, `../modules/`, and sibling `./` files
- Developer trace logs go through `debugLog(...)` (core/utils.js), which no-ops unless the `PRISM_DEBUG` localStorage flag is set — do not use bare `console.log("PRISM: ...")`. Genuine `console.error`/`console.warn` are left ungated
- Dialogs (`<wa-dialog>`) are opened/closed with `setAttribute('open','')` / `removeAttribute('open')`, never `dialog.open = true/false` (see Common Debugging). `<wa-details>` accordions still use the `.open` property
- URL deck imports (add + edit) share `resolveDeckSource(urlOrId)` in deck-import.js for Moxfield/Archidekt detection — extend that one helper rather than duplicating detection logic
- First-run onboarding callout on build.html persists its dismissal in the `prism_onboarding_dismissed` localStorage flag
- Loading skeletons (`<wa-skeleton effect="pulse">`): the nav account section renders `#auth-loading` (sized via `hasStoredSession()` — one bar logged-out, two bars logged-in) hidden by `updateAuthUI`; build.html ships static skeleton markup in `#decks-list`/`#results-tbody` destroyed by the first render; profile.html has `#profile-loading` hidden by `handleAuthChange`. Skeleton CSS lives in custom.css (`.skeleton-*`, `.nav-auth-skeleton*`). Skeletons only cover the post-`wa-cloak` wait (auth/sync) — anything under the cloak is invisible
- 22 paint pen colors in `DEFAULT_COLORS` (processor.js) — matched to real products
- Bracket values 1–5 represent Commander power level
- `formatSlotLabel(position, side?)` renders "Side A - Slot 1" style labels
- Stripe Settings in the Decks tab is a `<wa-details>` accordion (collapsed by default)
- The Stripe Positions reorder card was removed from the Decks tab — use the Move button (⊕) on each deck card to open the visual slot-picker dialog, or use the Export tab's dropdown list for bulk reordering
- `build.html` has a sync status indicator (`#sync-status`) and a Sync Now button (`#btn-sync-now`) near the PRISM name; both are hidden until the user is logged in. `setupSyncStatus()` in `init.js` wires these to `onSyncStatusChange` / `forceSyncCurrentPrism` from `storage.js`. Storage exports: `onSyncStatusChange(cb)` (returns unsubscribe fn), `forceSyncCurrentPrism()`, `recordUnmarkedCards(prismId, keys)`

### Gallery

`gallery.html` + `js/gallery.js` — community artwork gallery (proxies/tokens/showcase). One page, query-param views: grid (default), `?art=<id>` detail, `?artist=<id>` artist page, `?view=upload|uploads|admin`. Tables `gallery_artists`, `gallery_artworks`, `gallery_likes`, `gallery_admins` in `supabase-schema.sql` (GALLERY section):

- **Public reads** (approved artworks + artists) use plain PostgREST `fetch` with the anon key (`SUPABASE_URL`/`SUPABASE_ANON_KEY` exported from supabase-client.js) so anonymous visitors never load the SDK. Authed actions (likes, uploads, moderation) use the SDK.
- **Admin role** = row in `gallery_admins`; `is_gallery_admin()` (SECURITY DEFINER) is used in RLS policies and callable via RPC to gate the admin UI. Add admins with `INSERT INTO gallery_admins (user_id) VALUES ('<uuid>')`.
- **Moderation**: uploads INSERT as `pending` only (RLS WITH CHECK blocks self-approve/highlight/store_url/artist_id). Admins approve/reject via UPDATE; owners may resubmit `rejected → pending` and delete own pending/rejected rows.
- **Likes**: one row per user per artwork; `likes_count` on artworks is trigger-maintained (SECURITY DEFINER) so most-liked sorting never aggregates. `increment_gallery_download` RPC (authenticated) bumps download counts.
- **Storage**: single public bucket `gallery-art`, paths `<uid>/<uuid>.<ext>` (10 MB, png/jpg/webp). No SELECT policy on storage.objects → bucket can't be listed; pending art is undiscoverable via table RLS. Download gating is UI-level (soft) by design.
- **Demo fallback**: if the gallery tables aren't reachable (schema not deployed), gallery.js falls back to read-only `DEMO_*` sample data — remove once real partner art is seeded.

## Agent skills

### Issue tracker

Issues live in GitHub Issues (codwats/prism), via the `gh` CLI. See `docs/agents/issue-tracker.md`.

### Domain docs

Single-context layout — `CONTEXT.md` + `docs/adr/` at the repo root. See `docs/agents/domain.md`.
