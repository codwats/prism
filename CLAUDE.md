# PRISM — MTG Commander Sleeve Marking Tool

Helps MTG Commander players who share cards across decks mark sleeves with colored stripes, so each sleeve's deck is identifiable at a glance.

## Read before touching

- **Storage, cloud sync, auth init** (`storage.js`, `auth.js`, `syncState`, build.html sync UI) → `docs/agents/sync.md`
- **Billing, Membership, entitlement** (`billing.js`, `stripe-*-edge.ts`, `founders`/`subscriptions`/`app_config`, `isEntitled()`) → `docs/agents/billing.md`
- **Deck export / `sourceUrl`** (`deck-export.js`, Copy for Moxfield/Archidekt) → `docs/agents/deck-export.md`
- **Gallery** (`gallery.html`, `js/gallery.js`, `gallery_*` tables/RPCs, `gallery-artist`/`gallery-notify`/`commission` edge functions) → `docs/agents/gallery.md`
- **Domain terms** → `CONTEXT.md`; product policy → `PRODUCT.md`; decisions → `docs/adr/`
- **Reviewing a diff** → `CODING_STANDARDS.md` (judgement calls; mechanical rules are in lint and `tests/schema-rules.test.js`)

New domain facts go in the matching `docs/agents/*.md`, not here.

## Tech Stack

- **Frontend:** Vanilla JS, ES modules, no bundler, no build step
- **UI:** [Web Awesome 3.14.0](https://www.webawesome.com/) via CDN kit. WA CSS, autoloader, fonts, `custom.css` are **static tags in every page's `<head>`** (preload scanner starts them at byte 0); `injectHeadResources` in layout.js skips present tags, fallback only. Bump versions in static blocks and layout.js URLs together.
- **Styling:** `css/custom.css` + WA tokens (`--wa-color-*`, `--wa-space-*`)
- **Persistence:** localStorage-first (`prism_data`), optional Supabase sync when authed, merge-before-write
- **Auth:** Supabase Auth (email/password). SDK is **lazy**: layout.js eager-loads only when `hasStoredSession()` (sync localStorage check for `sb-<ref>-auth-token`) or `access_token` URL hash; anonymous visitors get it on demand via `ensureAuthReady()` (login click, or top of `signUp`/`signIn`/`resetPassword`). Init details in `docs/agents/sync.md`.
- **APIs:** Scryfall (no key), Moxfield & Archidekt (deck import via edge proxies)
- **Hosting:** Netlify, `publish = "."` (root), edge functions Deno/TypeScript
- **Dev server:** `http-server` port 3456, in `.claude/launch.json`

## Layout notes

`js/core/` shared helpers, `js/features/` build.html modules, `js/modules/` business logic shared across pages, `netlify/edge-functions/` Deno proxies + Stripe/gallery endpoints. Non-obvious pages:

- `mpc-stripes.html`, `swap-planner.html` — paid Extras, Members-only via `initExtraGate()` in membership.js (soft gate, ADR 0003). Swap Planner's `initExtraGate(onTool)` starts Scryfall/tag fetches for Members only.
- `swap-planner.js`: search → `rankComparables` → rows; "Other swaps" costs fill in after render (`applySwap` per deck); confirm dialog previews and applies through same `applySwap` call, then `recordUnmarkedCards` → `savePrism`. `oracle-tags.js` builds 51 pinned Tagger jobs + land families from Oracle Tags bulk file, IndexedDB, daily.
- `card-preview.js`: `wireCardPreview(root, stripesFor)` wires hover tooltip / mobile tap-to-open on any page.
- `links.html` (#243) — standalone: no layout.js, no nav, own inlined tokens, so it moves domains unchanged.

## Key Architecture Patterns

### State Management

`js/core/state.js` exports singleton; every module `import { state }` gets same reference. Fields:

- `currentPrism` — active PRISM (decks, cards, splitGroups, markedCards, removedCards)
- `deckToDelete` / `deckToEdit` — temp IDs for dialog workflows
- `elements` — cached DOM refs (set during init)
- `sortState` — `{ column, direction }` for results table
- `selectedDeckIds` — `Set` for deck filter dropdown
- `processedCards` — cached last `processCards()` result (hover preview)
- `addSourceUrl` / `editSourceUrl` — deck `sourceUrl` from a URL import, pending until Add Deck / Save Changes (#377)

### Layout Injection

`js/layout.js` exports `initLayout({ activePage, headerCta })`. Every page calls it to inject nav, header (with CTA), footer, auth dialog. Pages hold only `<main>`. Nav uses `<wa-page mobile-breakpoint="768">`: desktop sidebar / mobile hamburger.

### Module Dependency Flow

```
app.js → features/init.js → all feature modules
                           → all core/ modules
                           → all modules/ business logic
```

Feature modules import circularly (`deck-form ↔ deck-list`, `deck-list → init → deck-list`). Safe: all exports are hoisted function declarations, called only at runtime (user interactions), never during module evaluation.

### PRISM Data Model

```
Prism: { id, name, decks[], splitGroups[], markedCards[], removedCards[], plannedSwaps[],
         useDedicatedCommanderCopies, useDedicatedCommanderCopiesUpdatedAt, createdAt, updatedAt }
Deck:  { id, name, bracket (1-5), color (hex), stripePosition (1-48), cards[], splitGroupId?, sourceUrl?, cardsUpdatedAt? }
SplitGroup: { id, name, sideAPosition, sideAColor, childDeckIds[], splitStyle ('stripes'|'dots'), createdAt?, updatedAt? }
Card:  { name, quantity, isCommander, isBasicLand, sleeve? }
Preferences: { colorScheme, defaultColors, stripeStartCorner ('top-right'|'top-left'|'bottom-right'|'bottom-left') }
```

- **Commander role** — per-card `isCommander` flags are sole source of truth (#147). No `deck.commander` field; read via `commanderNames(deck)` in `processor.js` (alphabetical, derived). Decklist textarea carries N flags losslessly through `Commander`/`Deck` section headers (`cardsToDecklistText`/`rewriteDecklistCommanders` in `parser.js`); parsed text is sole save-time authority, Add/Edit commander fields synced both ways (`syncCommanderFieldsFromText`/`applyCommanderFieldsToText` in `deck-form.js`). `parseDecklist(text)` takes no commander-name argument. Archidekt import flags only exact `Commander` category. Legacy scalar-only decks normalized once at build-page load (`applyCommanderFallback`).
- **useDedicatedCommanderCopies** (#145/#150) — synced per-PRISM boolean with own merge timestamp (never rides whole-prism LWW; mark-toggle bumps `prism.updatedAt` too often). Toggle on Decks tab; write path = flag + its timestamp + `prism.updatedAt` + `savePrism()`. When on, each (commander card, logical deck) pair emits **dedicated batch** at deck's full quantity and leaves shared threshold derivation (replace, not add on top). Split group dedicates as one batch when flagged in ≥1 variant, never per variant. Dedicated-ness derived at processing time (`isDedicated` on batch), never stored.
- **Separate sleeve** (#309) — optional `sleeve` id on card row (`deck_cards.sleeve`, written by `replace_deck_cards`). Rows of one card sharing an id = one batch (`isSeparateSleeve`) at highest quantity, removed from shared threshold derivation after dedication (dedication wins). Rides the deck, merges with deck's `updatedAt` — no `mergePrismVersions` branch. Decklist text can't hold it: `keepSeparateSleeves(oldCards, newCards)` in swap.js carries it by name in `handleEditConfirm`, which every card-replacing edit path (form, URL re-import, file upload) goes through. Sleeve swap (`applySwap(..., { sleeve: true })`) creates one when incoming card already in PRISM.
- **Stripe positions** 1–24 (Side A), 25–48 (Side B) — 48 physical slots, real capacity limit (`MAX_STRIPE_SLOTS` in `processor.js`). Stripe-only decks/variants consume one slot each (up to 48 decks); dot variants share a Side A slot (up to 96). No fixed "logical deck" cap — adding standalone deck gated on `getUsedPositions(prism).size >= MAX_STRIPE_SLOTS`.
- **Split groups** — one deck slot, 2–8 (stripes) or exactly 2 (dots) variants sharing Side A position. Group holds `name`, `sideAColor`, `sideAPosition`, editable via ✎ on group card header (`handleEditGroupClick`/`handleEditGroupConfirm` in `deck-list.js`, `updateSplitGroupInPrism` in `processor.js`).
- **Split styles** — `'stripes'` (Side B marks on opposite edge) or `'dots'` (one colored dot beside Side A stripe square). Dots capped at 2 variants (physical 1-hole limit). Child marks decided in **post-loop pass**, shared-vs-subset:
  - Card in **all** children → parent Side A stripe only; membership anchors per variant for deck-filter (not rendered)
  - Card in **subset**, stripes-style → child Side B stripe per matching variant
  - Card in **subset**, dots-style, exactly 1 variant → dot in that variant's color
  - Card in **subset**, dots-style, 2+ variants → dot conflict; membership anchors only, parent stripe only
- **Stripe starting corner** — global preference, pure presentation: slot numbers never change; render layer (`cornerToConfig` in card-preview.js and friends) maps slot → physical location, so Slot 1 always renders at chosen corner. No prism data mutated or synced. If any prism has `markedCards`, Apply shows native `confirm()` warning physical marks won't move.
- **markedCards** — copies user physically marked. Three key shapes (#151): plain `<name>` for single-batch cards, `<name>|#b|<sorted deck ids>|<copy count>` per batch of multi-batch card, `<name>|<deck name>` for one-mark-at-a-time pass rows. `isCardDone` in `core/utils.js` is sole done gate (plain key for single-batch only; every batch key for multi-batch — legacy plain marks on multi-batch cards deliberately read undone; every pass key via `passKeysForCard`). Participant/size changes re-key batches so Done retires with no invalidation code; dead keys never pruned, so reverted edits resurrect marks.
- **removedCards** — cards removed from decks whose physical marks still need clearing. Rows carry `previousQuantity`/`newQuantity` — quantity decrease = removal of copies (full removal = `newQuantity` 0). `clearedQuantity` (#376) = copies a Sleeve reuse already cleared; `sleeveSwappedQuantity` (#401) = copies a Sleeve swap moved out of the card while the row was open (added to every open row of the outgoing card), so `planSleeveReuse` doesn't count the sleeve the incoming card now holds as freed; row done when `removalOpenCopies` (swap.js) is 0, then hidden from Marks to Clear (`openRemovals`), never deleted. Split-variant rows also record `splitGroup` (group as painted) so Sleeve reuse can rebuild a deleted variant. Writers upsert by `(cardName, deckId)` via `trackRemovedCard` in swap.js (carries `clearedQuantity`); `autoClearRemovedCards` clears only once quantity fully restored; `mergeRemovedCards` keeps `max(previousQuantity)`, `max(clearedQuantity)` and `max(sleeveSwappedQuantity)` with latest row — all only go up. Card back in deck it left, at slot and color its row recorded, is `clearReturnedRemovals` (swap.js): mark still painted, so row clears and `unmarkCardsWithNewStripes` doesn't un-mark it (#307); skips partly cleared and Sleeve-swapped rows (that copy's sleeve went to another card). Plain Swaps and deck edits use it; Sleeve swap doesn't (incoming card goes in another sleeve).
- **syncState** — local-only merge metadata, not domain model. See `docs/agents/sync.md`.

### Card Processing

`processCards(prism)` dedupes cards across decks, assigns stripe indicators. Names canonicalized via Scryfall before storage. Split-group child marks emitted in **post-loop pass** — main loop emits only group's Side A stripe; post-loop decides shared vs subset over whole group first (see split styles). `markType`: `'stripe'` (rendered Side B stripe), `'dot'` (rendered dot), `'membership'` (not rendered; carries `deckId` for deck-filter). `dotIndex` not stored — renderers compute dot order from stripes array. Results table and printable guide both use ö-style rendering (dot row above stripe square).

**Marking batches (#146)** — every ProcessedCard carries `batches`: quantity-tier thresholds over distinct per-deck quantities, each `{ copyCount: ti−t(i−1), participantIds (sorted), key, logicalDeckCount, isPool, isDedicated?, stripes }`. Batch marks **re-derived from exact participant set** (`marksForParticipants`), never filtered from card's stripes — `processCards` decides shared-vs-subset over whole group, so an A5/B2 group emits no child indicator while the 5-tier batch needs one. `totalQuantity` = Σ batch copyCounts (dedicated batches + max across remaining participants; plain max when dedication off). Results renders multi-batch cards as expandable sub-rows with derived, non-clickable parent roll-up checkbox; parent never shows mark union (over-marking trap). SCRY consumes flattened `state.resultsView` snapshot — one screen per batch, stating copy count. "One Mark at a Time" (internal filter value still `basics-by-deck`) = per-mark projection of batches over every repeated card.

### Display Counts

Pool/core belongs to **batches**, not card names (#146): pool batch spans 2+ logical decks, core batch exactly one; dedicated batches core by construction.

- **Decks tab** — each deck card shows **pool**/**core**: Σ copyCount of pool/core batches deck participates in (`getDeckPoolCoreCounts()` in `deck-list.js`). Per-deck pool + core = deck's decklist quantity per card; not additive across decks.
- **Results tab** — **Total Cards** (Σ `totalQuantity`), **Pool Cards** (Σ pool-batch quantities). Marked progress counts copies: full `totalQuantity` for done cards + copyCounts of done batches on partially-done cards. Dedication on drains commanders from pool (Total rises, Pool drops) — correct, not a bug.

### Logical vs Physical Deck Count

`processCards()` returns per card:
- `deckCount` — raw count of deck IDs (each split variant separately). Sorting and "N decks" in Stripes column.
- `logicalDeckCount` — standalone decks + split groups (all variants of a group count 1). All pool/shared/core classification. Card shared only among one group's variants has `logicalDeckCount: 1` → **core**, not pool.

### Split Position Assignment

`getNextVariantPosition(prism)` scans 48→25 (Side B, far end) then 1→24 (Side A), returns first unused. Returns **`null`** — not fallback index — when all 48 occupied. `splitDeck` and `addSplitToGroup` check `null` and **throw** before mutating any deck or assigning `stripePosition`/`sideAPosition`. Callers in `deck-list.js` (`handleSplitConfirm`, `handleAddSplit`) try/catch → `showError`, `state.currentPrism` unchanged.

## Common Debugging

### Web Awesome Components

- `wa-menu`/`wa-menu-item` sometimes fail to autoload from `kit.webawesome.com` — known CDN issue, not ours.
- WA inputs hold values in shadow DOM. Fallback when `.value` empty: `element.shadowRoot?.querySelector('input')?.value`.
- FOUC prevention: every page includes `<style>wa-page:not(:defined){visibility:hidden}</style>`.
- **Dialog open/close:** `dialog.setAttribute('open', '')` / `dialog.removeAttribute('open')`. Property setter works only after WA upgrades element; attribute observed via `attributeChangedCallback`, works before upgrade. Lint enforces. `<wa-details>` accordions still use `.open` property.
- **`<wa-button href>` navigation** works only after upgrade. Add `click` fallback (`window.location.href = ...`) for nav `<wa-button href>` that must work at page load.

### Scryfall Rate Limiting

`scryfall.js`: 500ms between requests (every chained request is `/cards/named` or `/cards/collection`, limited 2/s — #279), localStorage cache 24h TTL, request queue. Spacing enforced by **one shared promise chain** (`rateLimit()`) every path awaits — single-name GET queue, fuzzy fallback (on 404), batched `/cards/collection` POSTs of `canonicalizeCards` and `getCardAttributes`. All go through `scryfallFetch`, which owns 429 lockout. Shared mutable timestamp not enough: two loops read it, sleep to same deadline, fire same tick (#194). `/cards/collection` is batched POST, deliberately not in `requestQueue` (single-name GETs) — gate it, don't queue it. `canonicalizeCards()` fixes name spelling/capitalization. 429 never retried (#280): Scryfall locks client out 30 s, so `scryfallFetch` fails that request and every request in next 30 s without fetching; `canonicalizeCards` leaves names as-is, `getCardAttributes` and `fetchCard` throw. Null `image_uri` entries not cached (prevents 24h cache poisoning). `card-preview.js` strips DFC back-face names before lookup, dual-caches under front-face and full Oracle name.

### Edge Function Proxies

Moxfield and Archidekt block browser requests (CORS). `/api/moxfield-edge` and `/api/archidekt-edge` are POST proxies: validate input format, forward upstream.

## Development

```bash
# Dev server (defined in .claude/launch.json)
npx http-server -p 3456

# Checks (CI runs all three; test:sql needs docker)
npm run lint && npm test && npm run test:sql

# No build step — edit files and reload
# All JS is ES modules loaded directly by the browser
```

Preview viewport 1280px+ for desktop layout (sidebar nav); below 768px = mobile.

## Conventions

- `state.elements.xxx` for cached DOM refs; never re-query by ID in hot paths
- `state.currentPrism`, not a local variable — single source of truth
- `renderAll()` = safe full re-render after state changes
- `savePrism(state.currentPrism)` persists to localStorage after mutations
- Removing cards from `markedCards`: call `recordUnmarkedCards(prismId, keys)` **before** `savePrism()` so tombstones survive next cloud merge
- Feature modules import from `../core/`, `../modules/`, sibling `./`
- Trace logs via `debugLog(...)` (core/utils.js), no-op unless `PRISM_DEBUG` localStorage flag set. Lint enforces; `console.error`/`console.warn` stay ungated
- `app_logs` rows expire after 30 days (#214): `prune_app_logs(p_retain_days DEFAULT 30)` scheduled nightly by `pg_cron` as `prune-app-logs`, EXECUTE revoked from `anon` and `authenticated`. Nothing needing >1 month goes in `app_logs`; `logToSupabase` writes only, nothing reads back
- URL deck imports (add + edit) and deck export share `resolveDeckSource(urlOrId)` / `deckSourceSite` in `modules/deck-source.js` — extend it, don't duplicate detection
- build.html onboarding callout dismissal persists in `prism_onboarding_dismissed` localStorage flag
- Share cards: every indexable page carries Open Graph + Twitter tags and `rel="canonical"`, anchored on `https://prismmtg.com` (absolute — scrapers resolve relative paths against themselves). One image, `assets/og-card.png`, rebuilt by `node scripts/build-og-card.mjs` from vector paths only (outlined logo + `DEFAULT_COLORS`), since adobe-aldine and halyard-micro are Typekit fonts a rasterizer can't resolve. `mpc-stripes.html` and `swap-planner.html` excluded (`noindex,nofollow`, no share tags). Add block to every new page
- Supabase Auth emails (#341): six templates in `docs/email-templates/`, generated from one layout by `node scripts/build-email-templates.mjs` (inline styles, table layout, Georgia/system-sans fallbacks, `{{ .Var }}` verbatim; `tests/email-templates.test.js` fails when stale). Pasted into Supabase dashboard by hand; Auth sends via Resend SMTP; `scripts/setup-auth-email.sh` walks both. Edit generator, never HTML
- `sitemap.xml`, `robots.txt` at publish root. Sitemap generated by `node scripts/build-sitemap.mjs`: globs root `*.html`, drops `noindex` pages and `profile.html` (account stub, keeps share tags). `<loc>` only: Google ignores `changefreq`/`priority`, stale `lastmod` worse than none. Regenerate after adding page. `robots.txt` does **not** `Disallow` noindexed page — disallowed URL never fetched, so its `noindex` never read
- Loading skeletons (`<wa-skeleton effect="pulse">`): nav renders `#auth-loading` (sized via `hasStoredSession()` — one bar logged-out, two logged-in), hidden by `updateAuthUI`; build.html ships static skeletons in `#decks-list`/`#results-tbody`, destroyed by first render; profile.html `#profile-loading` hidden by `handleAuthChange`. CSS in custom.css (`.skeleton-*`, `.nav-auth-skeleton*`). Skeletons cover only post-`wa-cloak` wait (auth/sync) — anything under cloak invisible
- 22 paint pen colors in `DEFAULT_COLORS` (processor.js), matched to real products
- Bracket 1–5 = Commander power level
- `formatSlotLabel(position, side?)` renders "Side A - Slot 1" labels
- Stripe display settings (starting corner, position numbers) live in global settings drawer injected by `layout.js`; per-PRISM "Dedicated commander copies" `wa-switch` lives on Decks tab (per-PRISM synced data doesn't belong in global drawer)
- Stripe Positions reorder card removed from Decks tab — Move button (⊕) on each deck card opens slot-picker dialog; Export tab dropdown for bulk reorder

## Agent skills

### Issue tracker

Issues live in GitHub Issues (codwats/prism), via the `gh` CLI. See `docs/agents/issue-tracker.md`.

### Triage labels

Triage uses the five default canonical labels. See `docs/agents/triage-labels.md`.

### Domain docs

Single-context layout — `CONTEXT.md` + `docs/adr/` at the repo root. See `docs/agents/domain.md`.
