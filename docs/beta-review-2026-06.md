# PRISM Open Beta Review — June 2026

Comprehensive pre-launch review across four domains: code quality, UX/UI, onboarding, and beta
readiness. Snapshot reviewed: `main@7500372`; `main@4d25ce2` (#113, sparse stripe numbering)
landed mid-review and is noted where relevant but was not separately audited.

Verification run: `npm test` 6/6 pass; `npx eslint js/` fails with 11 errors (see CQ findings).

Remediation PRs opened alongside this report are referenced as **[PR: …]**.

---

## Status of queued/deferred items (quick answers)

- **SCRY-Mode** — implemented (`js/features/scry-mode.js`), launched from the Results filter bar. Label reads "Scry-Mode" not "SCRY-Mode" (fixed in copy PR).
- **E1 (mobile)** — largely shipped: tap-to-open preview (`events.js`), action kebab (`deck-list.js`), responsive dialog widths (`min(...px, 92vw)`). Touch-target gaps remain (see 2.5).
- **E2 (a11y checkbox labels)** — already done: `aria-label="Mark X done"` on mark checkboxes (`results.js`).
- **P2 (write amplification)** — still deferred, no new triggering paths. Note: `syncWithSupabase` re-uploads *every* prism present both locally and in cloud on login (`storage.js:836` adds all merged prisms to `needsCloudWrite`), so the CLAUDE.md claim that only genuinely-changed prisms are written holds only for the cloud-only case.
- **Stripe variant movement** — was inconsistent (allowed on desktop, "coming soon" on mobile kebab). **Decision: allow everywhere** [PR: variant moves].
- **Proxy stripe tool** — absent, gracefully (no dangling UI).

---

## Domain 1 — Code Quality

[CODE] [HIGH] Malformed class attribute breaks add-deck form markup
file: build.html line 157
description: `<div class="wa-stack wa-gap-xs style="--flank-size:175px;">` — missing closing quote. The class becomes `wa-stack wa-gap-xs style=` and the flank-size style is silently dropped; layout of the color-picker block is luck-dependent across parsers.
fix: `<div class="wa-stack wa-gap-xs" style="--flank-size:175px;">`. [PR: copy & markup]

[CODE] [HIGH] Stripe-variant movement allowed on two surfaces, blocked on one
file: js/features/deck-list.js (getMoveButtonHtml vs getMoveKebabItemHtml); js/features/stripe-reorder-dialog.js; js/features/export-view.js
description: Desktop Move button and slot-picker treat stripes-style variants as fully moveable; the mobile kebab disables the same action with "coming in a future update." The app said both.
fix: Resolved — allow everywhere; kebab enabled, stale copy removed. Dot variants remain non-moveable (they own no slot). [PR: variant moves]

[CODE] [HIGH] Printable guide injects unescaped user content into a new document
file: js/modules/export.js (generatePrintableGuide)
description: `prism.name`, `deck.name`, `group.name`, and `card.name` are interpolated raw into HTML that is `document.write()`-en into a same-origin window. Deck/group/prism names are free-text user input; a name containing markup executes. Card names fall back to raw user text when Scryfall canonicalization fails.
fix: Escape every interpolated name with `escapeHtml`. [PR: security escaping]

[CODE] [MEDIUM] Attribute injection via group name in title attributes
file: js/features/deck-list.js (getMoveButtonHtml, getMoveKebabItemHtml)
description: `title="...Move &quot;${parentName}&quot; instead."` interpolates the raw group name inside a double-quoted attribute; a name containing `"` breaks out of the attribute.
fix: `escapeHtml(parentName)` in both helpers. [PR: security escaping]

[CODE] [MEDIUM] Duplicate-color warning can never show its message
file: build.html (#color-warning); js/features/deck-form.js showColorWarning
description: `showColorWarning` writes to `colorWarning.querySelector("span")` but the div contains only a `<wa-icon>` — the user sees a bare warning icon with no text.
fix: Add the missing `<span>`. [PR: copy & markup]

[CODE] [MEDIUM] Marked-progress, undone export, and basics-by-deck keys disagree
file: js/features/results.js (updateMarkedProgress); js/modules/export.js (exportUndoneTxt)
description: Marks made in the "Basics by Deck" view are stored as `Name|DeckName` keys, but progress/undone logic only tests `markedSet.has(card.name)`. Per-deck basic marks never count toward the Marked stat or drop out of the undone export; progress cannot reach 100% for users of that view.
fix: Pick one canonical done-rule for basics and apply it in all three places. (Tier 2)

[CODE] [MEDIUM] "Basics by Deck" emits wrong rows for split-group decks
file: js/features/results.js (basics-by-deck branch)
description: The view iterates `card.stripes` without filtering `markType`. For a basic in a split group this yields a row for the group's Side A stripe (deckId null → quantity falls back to 1, wrong) plus extra rows from invisible membership anchors.
fix: Filter `markType !== 'membership'` and skip `deckId == null` stripes (or resolve group rows to per-variant quantities). (Tier 2)

[CODE] [MEDIUM] CSV export leaks invisible membership marks and collapses stacked dot marks
file: js/modules/export.js (generateStripeSummary; per-slot Map)
description: The stripe summary includes `membership` entries (no physical mark — the user would paint marks that must not exist), and the per-slot `Map` is last-wins, so a slot holding a Side A stripe plus dots exports only one mark.
fix: Filter membership everywhere; emit dots distinctly. (Tier 2)

[CODE] [MEDIUM] "Slot null" labels for dot variants
file: js/features/export-view.js (legend + bulk list); js/features/deck-list.js (removedCards pushes)
description: Dot variants have `stripePosition: null`. The Export legend renders "Side A - Slot null"; deleting/editing a dot-variant deck records `stripePosition: null` into removedCards → "Remove from Side A - Slot null" in the Removed view; the bulk-reorder list includes slot-less decks. (Bulk-list exclusion shipped in [PR: variant moves]; legend/removedCards remain Tier 2.)
fix: Render "Dot variant" labels; record the group's `sideAPosition` in removedCards.

[CODE] [MEDIUM] `wa-menu-item` used for the deck-filter empty state
file: js/features/results.js (renderDeckFilterMenu empty branch)
description: The codebase deliberately avoids wa-menu (flaky CDN autoload), and the convention says no wa-menu anywhere — this one renders unstyled when the autoload fails.
fix: Replace with a disabled `wa-button` or plain div. (Tier 2)

[CODE] [MEDIUM] ESLint fails with 11 errors / dead code
file: run `npx eslint js/`
description: Unused imports (`getColorName` ×2), dead `renderLegend` (stripe-reorder-dialog.js — built, never appended), unused `SCALE`, `firstChild`, `cardName` ×3, unused catch binding + empty block. Unused exports: `isStripeVariantDeck`/`isDotVariantChild`, `importAllData`/`exportAllData`, `clearCache`/`getCacheStats`.
fix: Delete or wire up; make `npm run lint` green before beta. (Tier 2)

[CODE] [LOW] Bare `console.log` in production paths
file: js/modules/storage.js ×3; js/core/notifications.js showSuccess
fix: Route through `debugLog`.

[CODE] [LOW] `wa-input` + `input` double listener on PRISM name (events.js) → double save per keystroke; codebase also mixes `change` and `wa-change` — standardize.

[CODE] [LOW] Web Awesome version drift — layout.js pins 3.5.0, CLAUDE.md documents 3.7.0.

[CODE] [LOW] Invalid `size="s"` on results filter radio group (should be `small`). [PR: copy & markup]

[CODE] [LOW] Snow-Covered Wastes missing from all three basic-land lists (parser.js, moxfield.js, archidekt.js) → treated as singleton, quantity math wrong.

[CODE] [LOW] Overlap matrix heat color uses an undefined `--wa-color-brand-60-rgb` var → always falls back to hardcoded off-brand indigo.
fix: Use `color-mix(in oklch, var(--wa-color-brand-fill) N%, transparent)` per the OKLCH-for-declarative-colors rule. [PR: WUBRG + OKLCH]

[CODE] [LOW] `logToSupabase` makes a network `auth.getUser()` round-trip per log, and after the schema migration restricting `app_logs` INSERT to authenticated users, every anonymous log is a doomed insert erroring into the console.
fix: Skip when `getCurrentUser()` is null; reuse the cached user. (Tier 2)

**Confirmed-good (1.1/1.2):** dot-conflict fallback (2+ subset variants → membership only, parent stripe only) correct; card-in-all-variants → parent stripe + non-rendered membership anchors correct; `countVisibleStripes` excludes membership (regression-tested); pool cards never treated as duplicates (`totalQuantity` stays 1 for non-basics everywhere); split/`addSplitToGroup` slot-exhaustion throws before mutation (tested); JSON import clamps colors to strict hex; `replace_deck_cards` is SECURITY INVOKER with sound RLS; no secrets in client code (anon key intentionally public); no N+1 Supabase reads.

---

## Domain 2 — UX / UI

[UX] [HIGH] Anonymous users can strand their data: no way to switch PRISMs without an account
file: js/features/deck-list.js handleNewPrism; js/profile.js; guide.html
description: "New PRISM" (no login required) swaps to an empty PRISM, but the only PRISM list lives on profile.html behind login — and the Profile nav entry is itself hidden when logged out. A logged-out user who clicks New PRISM cannot reach their old PRISM from the UI. The guide claims "Switch between PRISMs from the header," which doesn't exist.
fix: Expose My PRISMs without login (it's all localStorage) and add an always-visible nav entry; fix the guide sentence. [PR: anon PRISM switching + copy & markup]

[UX] [HIGH] Marking-prerequisites callout never stays dismissed
file: build.html (#marking-prereq-callout + inline script)
description: The card has no default `display:none`; the script only ever *shows* it. After dismiss + reload it reappears (even same session). Also missing spaces render "marking.Mid-session" / "Remember:Marks".
fix: Default-hidden + reveal only when not dismissed; add the spaces. [PR: copy & markup]

[UX] [MEDIUM] First-run onboarding callout is gone but its script remains
file: build.html (inline script references #onboarding-callout — element absent)
description: The documented first-run orientation was lost in a UI cleanup; new users land on a bare Decks tab.
fix: Restore the callout or delete the dead script. (Tier 2)

[UX] [MEDIUM] No loading state on Add Deck / Save Changes while card names are canonicalized
file: js/features/deck-form.js; js/features/deck-list.js handleEditConfirm
description: Submit awaits Scryfall `/cards/collection`; the button gives no feedback for a network-bound wait that can exceed 300ms. (Tier 2)

[UX] [MEDIUM] Touch targets well below 44×44 on mobile
file: css/custom.css (28×10px slot-picker slots, 32×12 mobile; 18px mark checkbox)
description: The slot-picker is the primary mobile reorder surface; its tap targets are ~12px tall. (Tier 2)

[UX] [MEDIUM] basic-lands FAQ math error
file: index.html ("Deck B needs 5 … 8 of them also get Deck B's mark" — should be 5). [PR: copy & markup]

[UX] [LOW] POOL / CORE / SCRY-Mode capitalization inconsistent across surfaces; SCRY-Mode button reads "Scry-Mode". [PR: copy & markup, partial]

[UX] [LOW] Exclamation points in success copy (profile.js, auth.js, scry-mode.js, deck-list.js empty state) vs the no-exclamation tone rule. (Tier 3)

[UX] [LOW] SCRY button stays enabled on an empty view and errors with a toast — disable instead. (Tier 3)

**Empty states** — decks list, results, export legend, profile PRISM list, removed view all have helpful empty states with next-step CTAs.
**Error states** — imports and auth show inline errors near the field; sync failures surface with a Retry affordance; Scryfall canonicalization failure degrades to raw names (logged). Deck-form validation uses toasts rather than inline-near-field messages (acceptable, noted).
**Loading** — spinners used consistently (preview, SCRY, auth, imports, sync). No skeletons anywhere (consistent). Gap: Add Deck (above).

---

## Domain 3 — Onboarding

[ONBOARD] [HIGH] Guide's dot-variant explanation describes a system that no longer exists
file: guide.html (Split styles / Creating a split)
description: Guide says "Variant 1 gets no dot… Variant 2 one dot… Variant 3 two dots" with dots scaling to many variants. Implementation: dots groups cap at exactly 2 variants; a dot means "card is in this subset variant only" (variant's color, not a count); cards in all variants get no child mark; a 2-variant conflict falls back to parent-stripe-only. A user following the guide will mis-mark sleeves — this is the product's core physical contract.
fix: Rewrite to match processor behavior; note 2–8 applies to stripes style only. [PR: copy & markup]

[ONBOARD] [MEDIUM] Guide says the starting corner "affects the card preview display but not your stored data"
file: guide.html
description: Since the Apply-remap change, switching corners rewrites every stored slot number (`remapPrismForCorner`). Physical mark locations are preserved; slot numbers are renumbered and synced. (Same stale line exists in CLAUDE.md.) [PR: copy & markup]

[ONBOARD] [MEDIUM] Guide promises drag reordering and a downloadable Spirit Guide STL — neither exists
file: guide.html ("Drag decks up or down"); tools.html (disabled "Coming Soon" STL button)
fix: Reword bulk reorder (dropdown + up/down buttons); soften the STL reference until it ships. [PR: copy & markup]

[ONBOARD] [MEDIUM] Landing FAQ contradicts reality and the privacy policy on data storage
file: index.html ("Nothing is sent to any server.")
description: False for logged-in Supabase sync, GA, app_logs, and the deck-import proxies. The privacy page is accurate; the FAQ undermines it.
fix: Reword: local-first; optional account sync; analytics per privacy policy. [PR: copy & markup]

[ONBOARD] [LOW] "choose from 23 defaults" — there are 22. [PR: copy & markup]

[ONBOARD] [LOW] "Spirit Guide" first appears on the landing page unexplained — add "marking jig" clause. [PR: copy & markup]

**Confirmed-good:** "Perfect Fit inner sleeve" terminology consistent — zero "penny sleeve" occurrences. Double-sleeving communicated before marking (Results prereq callout + guide + landing step 3). Build flow is logical; advanced features (split, dots, what-if, corner remap) stay behind icons/accordions; the Spirit Guide is introduced at marking time, which is right.

---

## Domain 4 — Beta Readiness

[BETA] [HIGH] No beta indicator, and the feedback channel was a placeholder link
file: js/layout.js footer (`href="https://discord.com"`); no beta badge; no changelog
description: The footer Discord icon went to discord.com's homepage; no bug-report path or what's-new entry point existed.
fix: Real Discord invite (discord.gg/Jp84QUPSe), Beta badge, visible feedback line. [PR: feedback channel]

[BETA] [MEDIUM] Password recovery dead-ends on the landing page
file: js/modules/auth.js (resetPassword redirectTo origin; no PASSWORD_RECOVERY handling)
description: The reset email returns the user to `/` with a recovery session; nothing prompts for a new password. Most users will conclude reset is broken.
fix: Handle the PASSWORD_RECOVERY event with a set-new-password dialog, or redirect to profile.html. (Tier 2)

[BETA] [MEDIUM] No unhandled-error visibility and no funnel events
description: No `window.onerror`/`unhandledrejection` hook; app_logs INSERT is auth-only so anonymous sessions log nothing; GA has pageviews but no events, so onboarding drop-off (visit → first deck → first mark → export) can't be measured.
fix: Global error handler reporting via GA event (+ app_logs when authed); gtag events for key funnel steps. (Tier 2)

[BETA] [MEDIUM] Icon-only action buttons lack accessible names (beyond E2 scope)
file: js/features/deck-list.js (edit/delete/split/move/what-if/kebab trigger), results.js clear-removed, build.html btn-sync-now
fix: `aria-label` mirroring each title. (Tier 2)

[BETA] [LOW] JSON import silently overwrites an existing PRISM with the same id — confirm before replace (or mint a new id). (Tier 3)

[BETA] [LOW] Browser-compat notes: no Safari-problematic CSS spotted; `pagehide` sync-flush implemented (good) but the unload fetch isn't `keepalive: true`, which Safari doesn't guarantee — consider adding. Manual Safari/iOS pass recommended for wa-page/dialog behavior. (Tier 3)

[BETA] [LOW] netlify.toml leftovers: functions dir/esbuild/AWS runtime configured with no functions; dead `/.netlify/functions/*` header block; production CORS pinned to prismmtg.com while README advertises prismmtg.netlify.app (same-origin calls unaffected — document the canonical domain). (Tier 3)

[BETA] [RESOLVED] Brand/WUBRG palette
description: The Pantone-derived WUBRG values appeared nowhere in code; the first five `DEFAULT_COLORS` (Yellow/Blue/Purple/Red/Green) are the W/U/B/R/G slots. Updated web values supplied during review — W #EEB41B, U #3995D9, B #8662D2, R #E2484B, G #4FAB33 — applied in [PR: WUBRG + OKLCH]. Convention going forward: OKLCH for any declarative CSS color (stored deck colors remain hex — required by `<input type="color">` and the data model). Fonts and theme scales already match spec (Inter w600 headings, Crimson Pro longform, Geist Mono code; radius 0.25 / space 1.25 / border 1).

**Confirmed-good:** sessions persist; deck delete and PRISM delete are confirm-gated; RLS isolates per-user data on every table; merge-before-write protects multi-device edits; CSV formula-injection defense present; popup-blocked printable guide shows a helpful error.

---

## Prioritized remediation list

### Tier 1 — fix before open beta (critical + high), low effort first
1. build.html:157 quote fix — **[PR: copy & markup]**
2. index.html FAQ server-claim rewrite + 8→5 math fix — **[PR: copy & markup]**
3. Real Discord invite + Beta badge + feedback line — **[PR: feedback channel]**
4. Marking-prereq callout dismissal + spacing — **[PR: copy & markup]**
5. Printable-guide + title-attribute escaping — **[PR: security escaping]**
6. Guide dot-variant rewrite — **[PR: copy & markup]**
7. Stripe-variant movement consistency (allow everywhere) — **[PR: variant moves]**
8. Anonymous PRISM switching — **[PR: anon PRISM switching]**
9. WUBRG palette update + OKLCH convention — **[PR: WUBRG + OKLCH]**

### Tier 2 — first beta patch (medium), low effort first
1. Title/legend "Slot null" fixes for dot variants (removedCards, Export legend).
2. CSV: filter membership marks; fix per-slot last-wins.
3. Basics-by-deck: filter membership/group stripes.
4. Marked-key unification (progress stat, undone export/copy vs `Name|Deck` keys).
5. wa-menu-item → wa-button in deck-filter empty state.
6. Add Deck / Save Changes loading state.
7. Restore (or remove the dead script for) the first-run onboarding callout.
8. Password-recovery flow (PASSWORD_RECOVERY → set-password UI).
9. window.onerror + GA funnel events; gate logToSupabase on auth.
10. aria-labels on icon-only buttons.
11. Touch targets ≥44px (slot picker, checkboxes).
12. ESLint to green (delete dead code).
13. CLAUDE.md corner-remap note correction.

### Tier 3 — backlog (low)
1. console.log → debugLog (storage.js, notifications.js).
2. Duplicate prism-name listener; change/wa-change standardization.
3. Snow-Covered Wastes in three basic-land lists.
4. Exclamation-point sweep; remaining POOL/CORE capitalization sweep.
5. WA 3.5.0 vs 3.7.0 pin/doc alignment.
6. JSON-import same-id overwrite confirm.
7. netlify.toml dead-config cleanup; canonical-domain note; `keepalive: true` on unload sync.
8. Disable SCRY button on empty view; document SCRY keyboard shortcuts (d/s/Enter/→).
