# Product

<!-- impeccable:product-schema 1 -->

## Platform

web

## Users

Magic: The Gathering Commander players who own 5–30+ decks and share high-value staples (Sol Ring, Mana Crypt, Command Tower, etc.) across most of them. Their job: stop buying duplicate copies of the same card for every deck, without resorting to proxies (not tournament legal) or constant re-sleeving (slow, annoying). They own physical paint pens and are willing to hand-mark sleeve edges as a one-time setup cost per card.

## Product Purpose

PRISM ("Personal Reference Index & Sleeve Marking") assigns each deck a unique color and stripe position, so a single physical card copy can visibly belong to — and be pulled into — multiple decks. The user imports decklists, PRISM computes which cards are shared and how many physical copies are actually needed (Pool vs Core), and exports a marking guide the user follows with paint pens on sleeve edges. Success is a fully-marked collection where "which decks does this card belong to" is answerable by fanning the cards, with no duplicate purchases for shared staples.

## Positioning

The mechanism a spreadsheet or generic label system can't replicate: PRISM encodes deck membership as a physical stripe-position system (up to 48 slots, 96 with dot splits) with a marking-batch engine that deduplicates shared cards into minimal physical copy counts (Pool/Core/Dedicated classification) and stays tournament-legal (marks don't change a card's identifiable profile — MTR 3.12). It is not deck-building or collection-tracking software; it exists specifically to make physical card-sharing across decks fast to execute and safe to trust.

## Operating Context

- Import: paste decklists (MTGO/Moxfield text format) or pull directly from Moxfield/Archidekt URLs.
- The tool computes stripe/dot assignments and a printable/exportable marking guide (CSV, JSON, printable).
- The user physically paints Perfect Fit inner sleeves with colored paint pens per the guide, then double-sleeves for protection.
- Ongoing use: decks change over time: cards get added/removed, decks get added — PRISM tracks stale marks and lets the user mark only what's new rather than re-deriving everything.
- 100% client-side by default (localStorage, no account required); optional Supabase account sync across devices for users who create an account.

## Capabilities and Constraints

- Hard physical constraint: 48 stripe slots per PRISM (24 Side A + 24 Side B); dot-split groups let a Side A slot serve up to 8 stripe-style variants or 2 dot-style variants, raising effective capacity to 96 decks.
- Tournament legality is a hard requirement, not a nice-to-have (MTR 3.12 compliance is why marks are edge stripes/dots, not face alterations).
- Community-built and free to use; a Stripe billing pipe exists in the codebase for a possible future paid tier, but **no gating model or timeline is committed** — do not design around a paywall or plan limits.
- No formal accessibility standard is a binding commitment; real a11y defects (touch targets, aria-labels, etc.) are handled as bugs, not against a stated WCAG level.
- Terminology is a controlled vocabulary (see `CONTEXT.md`) — e.g. Pool/Core/Dedicated, Slot, Marking batch/pass, Stale mark, Perfect Fit inner. Future copy work should read `CONTEXT.md` before introducing new terms.

## Brand Commitments

- Name: PRISM ("Personal Reference Index & Sleeve Marking"). Tagline: "Share MTG Commander cards across multiple decks without buying duplicates."
- Voice: no exclamation points in UI copy (an explicit house rule; violations are tracked as bugs in beta review).
- UI palette (`js/layout.js` theme overrides): a violet brand ramp anchored on `#4d4169` (brand-30, primary accent) running `#180a2e` (brand-05, darkest) to `#f6eeff` (brand-95, faintest tint), paired with a cool violet-biased neutral ramp from `#121218` (neutral-05) to `#f2f2fc` (neutral-95). Success/warning/danger ramps are separately defined for state, not brand.
- Palette is additionally WUBRG-derived for deck identity only (Magic's five colors mapped to the first five default deck colors): W `#EEB41B`, U `#3995D9`, B `#8662D2`, R `#E2484B`, G `#4FAB33` — used for stripes and deck swatches, never as UI chrome; a real identity constraint tying the product visually to Magic's own color system, not an arbitrary brand palette.
- Typography (`js/layout.js` theme overrides): **halyard-micro** is the main UI typeface (body copy, labels, buttons, tables, navigation, form fields, weight 400). **adobe-aldine** is the contrasting serif for all headings (weight 600) and longform/editorial copy (weight 400) — it is also the brand's logo lock-up type, so headings carry the same voice as the wordmark. **Geist Mono** covers code, decklists, and data exports. Both fonts load via Adobe Fonts (Typekit, `use.typekit.net/gbw6ibc.css`).
- Existing mark assets: logo set (`assets/Prism-Logo-*.svg`, `Prism-Icon-Main.svg`), the "Spirit Guide" marking jig concept/asset (`assets/spiritguide.avif`, `Spririt-Guide.svg`).

## Evidence on Hand

- README "Real World Impact" table (sellable-duplicate counts and resale value by collection size) is real, computed from average EDHREC decklists for top commanders — confirmed reusable in future marketing/landing work, not placeholder math.
- `CONTEXT.md` is an authoritative, actively maintained domain-language glossary — treat it as the terminology source of truth over inferring meaning from code alone.
- `docs/beta-review-2026-06.md` is a recent comprehensive UX/code/onboarding/beta-readiness audit — useful ground truth for known rough edges (e.g. guide.html's dot-variant explanation is currently wrong, touch targets are undersized, several copy inconsistencies exist) that future design work should not reintroduce or should proactively fix.
- No testimonials, customer logos, press mentions, or third-party benchmarks exist — do not fabricate any for future landing/marketing surfaces.

## Product Principles

- Trust the physical contract above all: a marking guide that leads to a mis-marked sleeve is the worst possible failure — accuracy and unambiguous instructions outrank visual polish on marking-facing surfaces (guide.html, printable export, Results/SCRY mode).
- Tournament legality (MTR 3.12) constrains every marking mechanism — never design a mark that could be read as altering a card's identifiable profile.
- Minimize physical copies, not just organize them: Pool/Core/Dedicated classification exists to save the user real money — copy and UI should keep that payoff legible, not bury it under mechanism detail.
- Local-first, account-optional: the tool must remain fully usable with zero signup; account sync is a convenience layer, never a requirement communicated as one.
- No committed monetization pressure yet — do not introduce paywalls, upsell moments, or plan-limit framing into design work; billing exists for future optionality only.
