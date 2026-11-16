# Usability pass — November 2026

A read of every page's markup and the build-page feature modules, then a look at build.html and guide.html in Chrome with a seeded 10-deck PRISM (desktop, dark scheme, logged out, viewport about 1085 by 1270). Mobile was checked in a second pass through a 390px-wide frame (375px of layout after the scrollbar), with every control measured. That frame has a mouse pointer, so the one `@media (pointer: coarse)` rule in `custom.css` did not apply; see the note in the mobile section. Profile, gallery, the home page and the logged-in states were read, not rendered.

Items already fixed since `docs/beta-review-2026-06.md` are not repeated.

Each item has a size: **S** (an hour or two, no design needed), **M** (a day, one decision to make), **L** (needs a mockup first).

## Decide first: three changes that need a mockup

These three change how build.html is laid out. Nothing below depends on them, but they should be designed together because they share the same strip of screen.

### 1. One account menu, one PRISM menu (L)

Today build.html has three unlabelled places for "things about me and my stuff":

| Control | Where | Holds |
| --- | --- | --- |
| Gear | header, top right | colour scheme, starting corner, slot numbers, and the per-PRISM "Dedicated commander copies" switch |
| `…` | PRISM name row, directly under the gear | switch PRISM, New PRISM, backup download and import, CubeCobra import, Membership |
| Profile | bottom of the sidebar | PRISM list again, email, password, backup download and import again, Membership again |

The three overlap (backup is in two, Membership in two, the PRISM list in two) and none says what it scopes to. Proposal:

- **Header, every page: one account button** in place of the gear. Logged in it shows the avatar initial, logged out a `circle-user` icon. It opens a dropdown: Profile, Settings, Membership, Log out (or Log in, Settings). The sidebar's account block goes away, which also gives the nav its full height back on mobile.
- **build.html: the PRISM name becomes the PRISM menu.** Name plus a caret is the trigger, in place of the bare `…`. It holds only PRISM-scoped actions: switch, New PRISM, rename, this PRISM's settings (Dedicated commander copies), backup, imports. A player looking for "the other PRISM" clicks the name of this one, which is where they will look first.
- **Settings drawer keeps device-level preferences only**, which is what #398 already says it should hold. The per-PRISM switch moving to the PRISM menu removes the need for `mountPrismSettings()`.

Open question for the mockup: whether Settings stays a drawer opened from the account menu, or becomes a section on profile.html. A drawer is better while marking, because the starting corner and slot numbers change what the Results table shows.

### 2. Add a deck in a dialog, URL first (L)

`#add-deck-card` sits under the deck list (`build.html:201`). With 20 decks the form is several screens down, and there is no button that takes you to it. Editing uses a dialog, so the two halves of the same job behave differently.

- Put an **Add deck** button (brand, filled) at the top of the Decks tab, in the same row as the tab strip or just under it, and open the form in a `wa-dialog` like Edit. Keep the inline form only for the empty state, where it is the whole page.
- **Lead with the URL.** Most players have a Moxfield or Archidekt link. Today the URL import is a collapsed `wa-details` *below* a required textarea and a required Commander field, so the fastest path is the best hidden one. Order should be: URL field and Import button, then "or paste a list", then name, commander, bracket and colour, which the import fills in.
- **Build Add and Edit from one form.** They have already drifted: Add has the 22 pen-colour swatches, Edit has only a bare native colour input (`build.html:626`), so a player editing a deck cannot pick a pen they own by name. Add shows a slot nowhere, Edit shows it nowhere either; the slot is set by a third control, Move. One form with a mode flag fixes the drift for good.
- Small things to carry over: the stray `<wa-divider vertical>` after the swatches (`build.html:261`) has nothing on its far side; "Current Marker" and "Select a Color" are two labels for one choice.

### 3. Results toolbar: separate "what am I looking at" from "what do I do" (L)

One wrapping row (`build.html:410-481`) holds a Filters dropdown, a four-way segmented control, search, Legend, Export and SCRY-Mode. On a phone that is four or five rows before the first card. Three of the four segments are filters but the fourth, Marks to Clear, is a different list with different rows, and One Mark at a Time is a different way of working, not a filter.

Suggested shape:

- Row 1, the view: `All cards | Pool | Marks to clear (n)`, then search.
- Row 2, the tools: Filters (decks, Undone only, All slots, and One Mark at a Time as a switch), Legend, Export, and the primary action.
- "SCRY-Mode" tells a new player nothing. Keep the name, add what it does: button label "Start marking", dialog title "SCRY-Mode". Same for the tab: "Results" is the marking checklist; "Mark sleeves" or "Marking" says so. Check `CONTEXT.md` before renaming either.

## What the rendered pages showed

Seen on screen, in rough order of how much they hurt.

- **The Results table starts at 1035px.** On a 1270px-tall window the first card row is at the bottom edge; on a laptop it is below the fold. Above it sit the PRISM row, its explainer line, the tabs, the warning callout with its own second paragraph and Dismiss button, three stat cards, the Overlap Matrix bar and a two-row toolbar. This is the screen people mark from, so it is the strongest case for change 3. The stat cards also wrap two and one, leaving an empty cell.
- **Add a Deck starts at 1755px with ten decks** and is 1129px tall. Each deck adds about 120 to 170px, so at 25 decks the form is three to four screens down. Inside it, the file drop zone and the textarea come before "Import from URL", which is the last thing above the submit button.
- **Deck cards are ragged.** When the name, two tags and the pool and core line fit, the seven icons sit on the right. When they do not, the whole icon row drops underneath and starts at the left edge. In a list of ten, four cards had one layout and six the other, so the Edit and Delete icons are in a different place from card to card. The copy button is also a split button with a caret, which makes seven targets, not six.
- **Add and Edit put the same fields in a different order.** Edit: colour, URL import, file, list. Add: colour, file, list, URL import. Edit has no pen swatches, as the code read said.
- **The PRISM name looks like a form field.** It is a bordered input at heading size next to a small logo, so the page has no visible title, and the green "10 decks" tag beside the `…` reads as a status light. Making the name the PRISM menu (change 1) fixes both.
- **The main column is about 735px wide in a 1085px window**, with the sidebar holding five words. The Results table has room for a wider column, or for the stats to sit beside it.
- **Guide step bar:** confirmed. A grey scrollbar runs under the chips for the full page width, the chevron's dark patch cuts the sixth chip mid-word ("Mark a spli"), and the bar spans across the top of the sidebar while the content it controls does not.
- **SCRY-Mode shows the marks only as paint on the card art.** There is no text saying which deck, colour name and slot each mark is, and the marks are small at that size. For a screen whose job is "paint exactly this", add the legend lines the Results row already has behind its stripe toggle. The dialog is also a boxed panel with the table visible behind it, though it asks for the full viewport.
- **Settings drawer:** the disabled Apply button is a full-width bar that looks like a section divider. Size it to its label.
- **Copies column is blank for single copies**, so most of the column is empty. Fold the count into the card name ("×3") and give the width to the marks.

## Mobile pass: button sizes

A user reported buttons too small on a phone. Measured at 375px, against a 44 by 44px target.

**The marks are off screen.** The Results table is 430px wide in a 375px viewport, and the Stripes column is the one cut off. A phone shows Done, Card Name and an empty Copies column; the colours to paint are a sideways scroll away on every row. This is worse than any button size and is a small fix: drop the Copies column on mobile (put "×3" after the name) and the marks fit.

**The table starts 1528px down**, close to two full screens, and Add a Deck starts 2167px down with six decks.

| Control | Size | Count | Note |
| --- | --- | --- | --- |
| Slot in the Move dialog | 44 × 14 | 48 | Stacked with no gap. The worst target on the site; a thumb covers three slots. |
| Pen colour swatch (Add a Deck) | 36 × 28 | 22 | Two rows, tight gaps. |
| Batch expand toggle (Results) | 22 × 38 | per multi-batch card | |
| Batch parent checkbox | 18 × 18 | per multi-batch card | Not clickable, but looks it. |
| Every `size="s"` button | 38 high | all of them | Menu, gear, `…`, deck kebab, Filters, Legend, Export, SCRY-Mode, Dismiss. |
| Deck kebab menu items | 222 × 38 | 7 | No gap between rows, and Delete deck sits directly under Edit deck. |
| Results view switch | 38 high | 4 | |
| Marks toggle on each row | 78 × 38 | per row | |
| "Two commanders" switch | 18 high | 1 | |
| Home link in the header | 9 × 24 | 1 | The wordmark is hidden on mobile and the link shrinks to a sliver of the logo. |
| SCRY-Mode Skip and Done | 71 × 43, 79 × 43 | 2 | Tall enough, but small and at opposite corners for the two buttons pressed hundreds of times a session. |
| Done checkbox | 31 × 24 here | per row | `custom.css:171` raises this to 44 × 44 on touch devices. Not verified: the test frame has a mouse pointer. |

Fixes, cheapest first:

1. **One rule lifts most of the table.** Under `@media (pointer: coarse)`, give `wa-button[size="s"]`, the radio segments and the kebab items a 44px minimum block size, the same way the Done checkbox already gets it. Add a gap or divider above Delete deck.
2. **Swatches:** 44px squares in a wrapping grid on touch. 22 of them is four rows at 375px, which is fine in a dialog.
3. **Header home link:** set a minimum width on the anchor.
4. **SCRY-Mode on a phone:** full screen, with Skip and Done as two full-width halves at the bottom edge. This is in the design brief.
5. **Slot picker:** 14px rows cannot be fixed with padding, as the comment at `custom.css:1101` already says. On touch, tap a side to zoom it, or replace the picture with a list of free slots ("Side A - Slot 7") and keep the picture as a preview. Needs a mockup; add it to the brief if you want it designed with the rest.

Other things seen at this width: each deck card stacks into five rows (colour square alone on a row, name, slot tag, bracket tag, commander line, kebab) and is about 270px tall, so six decks fill more than two screens. The 390px brief item 3 covers it.

## Your list

### guide.html step bar (M)

The bar is eight long pills in one sideways-scrolling row with a chevron pinned on an opaque patch, and a visible scrollbar on Windows and Linux. What makes it look untidy is the scrollbar, the chevron's background block cutting through a pill, and labels long enough that only three fit.

- **Desktop:** move the list into `wa-page`'s `aside` slot as a sticky vertical "On this page" list. The main column is capped at 800px, so the room is already there. The existing `IntersectionObserver` highlight carries over unchanged.
- **Mobile:** keep the bar. Hide the scrollbar (`scrollbar-width: none`), replace the chevron patch with a fade on the trailing edge (`mask-image`), number the chips and shorten the labels ("1 Read a sleeve", "2 Pool and Core"), and scroll the active chip into view when the highlight moves. Right now the highlighted chip can be off screen.

### Check all, uncheck all, and an audit pass (M, then L)

Two different needs are hiding in this one.

**Bulk mark (M).** "Mark all shown as done" and "Clear marks on all shown", acting on the rows the current filter and search leave visible. The real use is a player who painted sleeves before they found PRISM, or who filters to one deck after a marking night.

Sync is not the hard part. A mark is a key in `markedCards` and an unmark is a tombstone written by `recordUnmarkedCards`; a bulk action is the same two calls with more keys. The rules that matter:

- Go through the same per-row code the checkbox uses, so batch and pass keys come out in the right shape. Do not write plain names for multi-batch cards.
- Call `recordUnmarkedCards` before `savePrism`, as everywhere else.
- Clearing is the risk, and it is a product risk: tombstones win over older marks, so clearing on one device wipes that progress on every device. Confirm with the count ("Clear 412 marks?") and never offer an unscoped "uncheck everything" without that dialog.

**Audit pass (L).** Do not build the audit by unchecking everything. That destroys the record you are auditing against. An audit is a second, separate tick: "I looked at this sleeve and its marks match."

- Store it on the device only, per PRISM, outside `markedCards` and outside sync. Use the same key shapes as `markedCards`, so a card whose marks change after the audit reads as unverified by itself, with no invalidation code.
- Reuse SCRY-Mode's card-by-card screen with two buttons, "Matches" and "Wrong", and a list of the wrong ones at the end. That list is the thing you wanted the night you found one card marked twice.
- This should be free. `PRODUCT.md` puts trust in the physical marks above everything, and a check that the marks are right is that principle, not an add-on.

**Game night check (Extra).** Pick the decks you are taking. PRISM lists, per deck, the cards to pull, and flags every Pool copy two of tonight's decks both need. That flag matters most when you lend a deck: two decks on the table at once cannot share one copy. This is working-out over data the player already has, prints nothing from Scryfall, and gets more useful the more decks someone owns, which makes it a fair Extra.

### More Extras

All four sell the working-out and print no Scryfall field that is not already free.

1. **Game night check** — above.
2. **Refresh every deck from its saved link.** One button, then a summary per deck of cards in, cards out and marks to add or clear, with a confirm before anything is written. Today it is one deck at a time inside the Edit dialog. Players with 15 linked decks will feel this most.
3. **What if I add this deck.** Paste a list or a URL and see, before committing a slot, how many cards are already Pool copies you own, how many new sleeves it needs and how many marks it adds. The Decks tab already answers the reverse question with the flask button.
4. **Deck box legend cards.** A printable card-sized legend per deck (colour, slot, corner, commander) to sleeve and drop in the box. Mostly layout over data the free legend already shows, so the Extra is the print sheet, not the information.

Already filed and still good: compare two PRISMs (#446), token pack (#412).

## Other things found

### Finding your way around

- **"Tools" is supplies** (S). `tools.html` is pens, sleeves and storage boxes. The software tools are called Extras. A player looking for the Swap Planner will open Tools. Rename the nav entry "Supplies".
- **"My PRISM" is last in the nav** (S). It is the product. Put it first or second, and mark the active entry with more than a colour change (`js/layout.js:402`): colour alone fails for colour-blind players and is easy to miss. `aria-current="page"` is also missing on the main links, though the Extras links have it.
- **Non-members cannot see that Extras exist** (M). The nav group ships hidden until entitlement shows it, and the overflow entry "Membership and Extras" also ships hidden (I did not trace when `membership.js` shows it). That follows the "no nag in the working surfaces" rule, and it should stay that way on build.html, but a plain Extras section on index.html and one line in the guide's "Swap a card" step are both allowed by the same rule.
- **Logged-out players have no Profile and no PRISM list** (M). The only route to another PRISM is the `…` menu, and only once two PRISMs exist. Change 1 fixes this by making the PRISM name the menu.
- **Nothing points from Decks to Results** (S). After adding a deck the toast says "Added…" and the player is left on the form. From the second deck on, the toast or a quiet line above the deck list should say how many Pool copies were found and link to the marking tab. That number is the payoff the home page promised.

### Decks tab

- **Six icon-only buttons per deck** (M): flask, move, split, copy, edit, delete (`js/features/deck-list.js:880-912`). They use `title`, which shows late on desktop and never on touch. Keep Edit and Move inline with `wa-tooltip`, and put What-if, Split, Copy and Delete in the kebab that mobile already has. Delete sitting one click-width from Edit is a slip waiting to happen.
- **Delete deck says only "This action cannot be undone"** (S). Say what happens to the paint: "Its marks move to Marks to Clear."
- **The one-line PRISM explainer shows forever** (S) (`build.html:130`). Show it until the first deck is added.

### Results tab

- **Stat badges restate the label in jargon** (S): "Total Cards · Pool+Core", "Marked · Sleeves Done". Use the badge for the payoff: "Total cards 412 · 188 fewer than separate decks".
- **The pre-marking warning returns every session** (S). It is kept in `sessionStorage`. Show it until the first mark is made in this PRISM, then stop.
- **Starting corner uses a native `confirm()`** (S) (`js/layout.js`, marked as a shortcut in the code). Every other destructive choice on the page is a `wa-dialog`.

### Backup import says two different things (S, check behaviour first)

The build-page dialog says "This replaces the current PRISM" (`build.html:523`). The profile page says "Import an exported .json as a new PRISM". The build path calls `buildPrismFromJson(jsonData)` and saves, the profile path passes `preserveId: false`. One of the two sentences is wrong about what the player's data is about to do. I did not trace `buildPrismFromJson`'s default, so confirm which before changing copy.

## Suggested order

1. The S items: nav rename and order, delete-dialog copy, explainer, Decks-to-Results pointer, backup copy, Edit dialog swatches as a stopgap.
2. Bulk mark, scoped to shown rows.
3. Mock up changes 1, 2 and 3 together, then build Add-deck-in-a-dialog first. It is the one new players hit.
4. Guide step bar.
5. Audit pass, then Game night check on top of the same screen.

## Prompt for Claude Design

Paste this as the brief. Attach screenshots of build.html (Decks tab, Results tab, the `…` menu, the settings drawer, the Edit dialog) and guide.html.

```text
Redesign the working page of PRISM, a web tool for Magic: The Gathering Commander players who share one physical copy of a card across many decks. Each deck gets a paint-pen colour and a slot along the sleeve edge; PRISM works out which sleeves need which marks, and the player ticks cards off as they paint them. Users own 5 to 30+ decks. They use the page two ways: at a desk managing decklists, and at a table with a wet paint pen in one hand, ticking cards off on a phone or laptop.

Design system: Web Awesome 3 components (wa-page with a left sidebar on desktop and a drawer under 768px, wa-dialog, wa-drawer, wa-dropdown, wa-tab-group, wa-card, wa-tag, wa-button). Keep to its components and tokens. Dark and light schemes. Brand is a violet ramp anchored on #4d4169 with cool violet-grey neutrals. Headings in a serif (adobe-aldine, weight 600), UI text in halyard-micro, decklists in Geist Mono. Deck colours (yellow, blue, purple, red, green and 17 more pen colours) are for deck identity only, never for interface chrome. No exclamation points in copy. No upsell badges, banners or nags on this page.

Give me desktop (1280px) and mobile (390px) for each of these four problems. They share the same top strip of the page, so solve them together.

1. Three overlapping menus. Today: a gear icon in the header (colour scheme, stripe starting corner, slot numbers, and one per-PRISM switch), a "..." button beside the PRISM name (switch PRISM, new PRISM, backup download and import, cube import, membership), and a Profile button at the bottom of the sidebar (PRISM list, email, password, backup, membership). I want two: one account button in the header on every page (Profile, Settings, Membership, Log in or out), and the PRISM name itself as a menu for everything scoped to this PRISM (switch, new, rename, this PRISM's settings, backup, imports). Show the name as a page title that is also editable and also a menu trigger, without looking like a form field. Show logged-out and logged-in states.

2. Adding a deck. Today the form is a tall card under the deck list, three screens down once someone has ten decks, while editing a deck opens a dialog. Design one Add deck button at the top of the Decks tab that opens the same dialog as Edit. Order inside: a deck URL field with an Import button first (Moxfield, Archidekt, DeckCheck), then "or paste a list" and file upload, then name, commander (with an optional second commander), bracket 1 to 5, and colour picked from 22 named pen swatches plus a custom colour. Show the slot the deck will get. Show the empty state too, where the form is the page.

3. The deck list. Each deck row shows a colour square, name, slot ("Side A - Slot 3"), bracket, commander, and pool and core counts, then seven icon-only actions: what-if-I-remove-this, move slot, split into variants, copy for Moxfield or Archidekt, edit, delete. The icons wrap under the text on some rows and not others. Design a row that keeps its actions in one place at every width: two visible actions (Edit, Move) and the rest in a menu. Include a split group: one parent row with 2 to 8 variant rows nested under it.

4. The marking screen (currently the "Results" tab). Today the first card row is 1035px down the page, under a warning callout, three stat cards, an overlap-matrix bar and a two-row toolbar. Get the first card row above the fold on a 13-inch laptop and within the first screen on a phone. Contents to place: progress (marked 0 of 235 sleeves, total cards, pool cards), a view switch (All cards, Pool, Marks to clear with a count), search, filters (by deck, undone only, one mark at a time), a legend of deck colours and slots, export, and one primary action that starts a card-by-card marking mode. Each table row has a done checkbox, the card name with a copy count, and its marks as coloured squares in slot order; rows with several batches expand. Add bulk actions that apply to the rows currently shown: mark all shown, clear all shown (with a confirm that states the count).

Also design the card-by-card marking mode as a true full-screen view: the card image with its marks drawn on the sleeve edge, a text legend under it (colour name, deck name, slot) for each mark, progress (1 of 170), and large Skip and Done buttons reachable with one thumb. Then show the same screen as an audit variant with "Matches" and "Wrong" in place of Skip and Done.

On mobile the marks column must be visible without sideways scrolling; today it is cut off at 375px. Also design a touch-friendly way to pick one of 48 slots (24 per side of the sleeve) on a phone, where each slot is currently a 14px-tall row.

Constraints: nothing may be removed, only moved. Every destructive action keeps a confirm. Touch targets at least 44px. The marks on a card must stay accurate and unambiguous; that matters more than polish.
```

## Implementation handoff

The mockups are reviewed. Nine steps, one GitHub issue and one PR each, tracked under the `usability-pass` label. Every step's session reads this section first, then its own issue.

### Branching

Steps 1, 7 and 8 merged straight to `main`. Every later step branches off `usability-pass` and opens its PR against `usability-pass`, never `main`. `main` stays as it is until the whole pass is tested; then one PR merges `usability-pass` into `main`. Test the combined work on that PR's deploy preview.

### Before starting a step

- Read `CLAUDE.md`, `PRODUCT.md`, `CONTEXT.md`, `DESIGN.md`. CONTEXT.md is the controlled vocabulary; do not invent terms.
- Read this file's findings above, but ignore "Prompt for Claude Design".
- Read the **Decisions** section below, including what earlier steps appended.
- Open the mockups through the claude_design MCP (`https://api.anthropic.com/v1/design/mcp`, auth via `/design-login`): project `https://claude.ai/design/p/7d231f59-fa22-4020-97cc-419f4de2f589`. Boards: `Marking screen.dc.html` (1a to 1y), `Deck list.dc.html` (2a to 2p), `Top strip.dc.html` (3a to 3v), `Slot picker.dc.html` (4a to 4m). Each board opens with a "Calls made" list; read it before the frames. Design system files are under `_ds/prism-system-5d834954-f82f-44e5-91bd-a7ec92064bd8/`.

### Rules

- Mockups show intent, not a pixel spec. Repo rules win where they disagree.
- Web Awesome components and existing tokens, at the version the repo loads. No new colors, fonts, hardcoded hex or px. Deck colors are for deck identity only.
- Nothing is removed from the page, only moved. Every destructive action keeps its confirm.
- No data model, sync, key shape or copy-rule change unless the step says so.
- Marks on a card stay accurate and unambiguous; that beats polish. Slot labels come from `formatSlotLabel` (Side A 1 to 24, Side B 25 to 48).
- Touch targets at least 44px on touch devices. Check 375px first, then 1280px, dark and light.
- Copy: sentence case, no exclamation points, no em-dashes, the player is the actor.
- `mock.css` is scaffolding and never ships. Its `.touch` rules stand in for `@media (pointer: coarse)`.
- Run `npm run lint && npm test`; add tests for any logic touched.

### Not drawn in the mockups

A 25-mark row on phone (wraps to three lines), the full 25-row deck list, the desktop kebab, Rename on desktop, Marks to Clear on desktop, moving a split group. Follow the nearest drawn frame and flag what does not carry over.

### When a step is done

Append to **Decisions** below: what you decided that the mockup or issue did not, what you could not follow and why, anything you built that a later step should reuse (component, class, helper), and what you left untested. Keep it to a few lines per step. Put the same in the PR body with how you checked 375px and 1280px in both schemes.

### Decisions

Owner answers, 2026-11-16:

- **Tab and column names (step 4).** Tab "Mark sleeves", column "Marks" (a Mark is a stripe or a dot, so "Stripes" was wrong for dot variants). Button "Start marking"; dialog title stays SCRY-Mode. Add "Mark sleeves" to CONTEXT.md as the tab name.
- **Phone tools (step 4).** Legend and Export live in the "Totals and tools" sheet, two taps away. Accepted.
- **Slot picker (step 8).** Choose a slot, then press Move, even for an empty slot. Accepted.
- **Moving a marked deck (step 8).** When the deck has marked cards, the Move dialog shows one line that painted marks do not move. Copy only, no logic change.
- **Slot in the Add form (step 2).** No logic change: the deck takes the next free slot on add; Change opens the Move dialog after the deck exists.
- **Settings copy (step 7).** The footer line that PRISMs "live on your Profile" now points to the PRISM menu. The two sentences that lost a dash in the mockup use a comma or colon, no em-dash.
- **Backup import copy (step 7).** Both sentences are accurate and stay: build.html keeps the backup's id and replaces the current PRISM; profile uses `preserveId: false` and imports as a new PRISM (`js/modules/prism-import.js`).

Step notes (appended by each step's session):

- **Step 1, touch sizes (#458).** The claude_design frames were not opened; built from the issue text. The coarse-pointer block now covers all `wa-radio[appearance="button"]`, `wa-input`/`wa-select` and `wa-switch` (via parts, 44px `min-block-size`); small buttons and kebab items were already covered by #449, and `.header-home` already had a 44px `min-inline-size` from #449, left as is. Copies column removed: count is now a `.card-copies` span ("×14", shown only above one) inside the name cell; `copies` sort case, header, and `.copies-cell` CSS deleted; detail and empty-state colspans are 3. Multi-batch sub-rows keep their "N copies, label" text as the batch count. Later steps: reuse `.card-copies`. Untested: no browser check at 375px or 1280px, light or dark; no unit test (results rendering has no DOM test harness). `wa-input::part(base)` and `wa-select::part(combobox)` part names are unverified against WA 3.14.0 in a real browser.

- **Step 2, one deck form (#450).** Mockups not reachable from this session (no claude_design tool), so built from the issue text. One `#deck-form` with `state.deckFormMode` ('add' | 'edit'). `placeDeckForm()` (run by `renderAll`) keeps it in `#add-deck-card` while the PRISM has no deck and moves it into `#deck-dialog` otherwise. A PRISM that empties out (last deck deleted, sync, switch) gets a fresh add form inline. The Edit dialog is gone: `handleEditClick` puts the same form into edit mode and still saves through `handleEditConfirm`. Element ids are unified on the old add names (`deckName`, `deckList`, `deckColor`, ...); the URL field is now `deckUrl` / `btnImportDeckUrl`. One import handler, `handleDeckUrlImport`, writes `addSourceUrl` or `editSourceUrl` by mode, behind one generation guard, so the Add import now drops stale responses too. `endDeckFormSession` (Cancel, the dialog's `wa-hide`, after a save) clears both pending URLs, the mode and `deckToEdit`. Slot decision: Add shows the next free slot with Change disabled and the line "The deck takes the next free slot. You can change it after you add the deck." Edit's Change opens `openStripeReorderDialog`, or `openGroupReorderDialog` for a dot variant: it owns no slot, so it shows the group's slot and Change moves the group. That differs from the deck card, where Move is disabled for dot variants. Also decided: file upload is a button over a hidden native input (no drag and drop now); the Add deck button is hidden in the empty state; the "No decks yet" placeholder is gone, since the inline form is the empty state; the onboarding card moved under the form; Add opens in a fresh form each time, so closing the dialog drops a draft; Open Add is gated on 48 used slots, like the submit. Sticky dialog actions apply at 640px and up only. For step 3: deck rows still call `handleEditClick(deckId)` and `openStripeReorderDialog`; a 44px coarse-pointer rule now covers `.color-swatch`. Reuse `deckFormSlot(prism, mode, deckId)` (pure, tested) for any slot label plus Move target. Untested: a real touch device, a screen reader, the real Moxfield edge proxy (stubbed in page), drag and drop (removed).

- **Step 3, deck row (#451).** Mockups not reachable from this session (no claude_design tool), so built from the issue text. One layout at every width: Edit and Move inline at the right edge with `wa-tooltip`, then a kebab (`wa-dropdown` of `wa-dropdown-item`, wrapped in `clickItemsOnKeyboardSelect`): What if, Split, Copy for Moxfield / Archidekt (one item for a deck with a source URL, as before), then a divider and Delete deck (still confirms). The inline desktop cluster, the old mobile kebab of plain `wa-button`s and the Copy split button are gone. Split group header: Edit and Move inline; Add variant and Merge back live in its kebab. Variants stay nested and indented under the parent card. Decided: Move on a dot variant now opens `openGroupReorderDialog(groupId)` (no longer disabled), matching the Edit form's Change. Reuse `iconButton(...)` (button plus tooltip) in deck-list.js. Untested: a real touch device (44px rule is `.deck-actions-kebab wa-dropdown-item` and `wa-button[size="s"]` under `pointer: coarse`), a dot-variant group in the browser, a screen reader. Checked: kebab by keyboard (Enter opens, arrows move, Enter on What if runs it) at 1110px dark, and a 375px iframe in light (actions stay at the right edge, no horizontal overflow).

- **Step 4, marking toolbar and layout (#452).** Mockups not reachable (no claude_design tool in this session), so built from the issue text. Tab "Mark sleeves", column "Marks", button "Start marking"; the panel, `#results` deep link and `results.js` keep their names (recorded in CONTEXT.md). Decided: One Mark at a Time is a `wa-dropdown-item type="checkbox"` in Filters, not a `wa-switch`, for the reason step 7 found (a switch in a menu can't be reached by keyboard); Undone only, All slots and every deck item became checkbox items too, all handled by one `wa-select` listener in events.js, so the Filters menu now works from the keyboard. One Mark at a Time with Pool selected shows passes for Pool cards only (with All Cards it is exactly the old view). Export uses `clickItemsOnKeyboardSelect`; the Legend is no longer a dropdown but a card in the rail. The Deck Overlap Matrix stays above the layout on desktop. "Clear All Filters" became "Clear deck filters" (it only ever cleared decks). Row tap: pointer only (keyboard keeps the marks button and the batch chevron); a multi-batch parent's row tap expands it. Legend lines read "Yellow, Atraxa, Side A - Slot 1"; custom colors show their hex. On phone, result name cells carry `data-preview="hover"` so the tap opens the legend, and Show card (`.card-show-btn`) opens the preview; `wireCardPreview` gained both hooks plus Escape to close, other pages unchanged. DESIGN.md's "never reflow" rule is rewritten for the phone stack. Hooks for later steps: **sheet entries (6, 9)**: put the element at its desktop home in build.html with `data-phone-slot="sheet"` and `data-phone-order` (Totals 10, Legend 20, Export 30, Matrix 40; pick 50, 60), and `js/features/marking-layout.js` moves the live node into `#marking-sheet` under 768px and back above it; `data-phone-slot="bar"` puts it in the bottom bar. **Rail (5)**: `aside.marking-rail` beside `.marking-main` at 1024px and up. **Tally**: `batchTally(card, markedSet)` in `core/utils.js`. Untested: a real touch device and a screen reader; 375px was checked in a 375px iframe (Chrome viewport 1130px at "1280"), both schemes by swapping `wa-dark`/`wa-light` on the root, not through the Settings preference; printing the guide and the CSV/txt downloads were not clicked (Copy undone list was, by keyboard).

- **Step 5, card by card (#453).** Mockups not reachable (no claude_design tool in this session), so built from the issue text. The dialog is still `#scry-dialog`, title SCRY-Mode, opened by "Start marking". Each screen shows a progress bar, "N of M: name", the card with its marks, a bold "Mark N copies" line (above one copy), and a legend list (`scryLegend(stripes)`: color name, deck, `formatSlotLabel`, same wording as step 4, membership marks skipped; reuses the `.stripe-detail` list styles). Phone stacks card over legend; 768px and up puts them side by side. Skip and Done are two 56px halves in the footer (`.scry-actions`). Screens and their order are unchanged (`state.resultsView`). Done still calls `setCardMarked(getScryCardKey(card), true)` then `updateMarkedProgress()`, so keys, `recordUnmarkedCards` and `savePrism` are untouched. **Step 9 call:** `openScryMode({ skipLabel: 'Wrong', doneLabel: 'Matches', title: 'Audit', onDone: (key, card) => ..., onSkip: (key, card) => ... })`; `key` is the same string Done writes today (name, batch key, or `name|deck`). Passing options replaces the default `onDone`, so nothing touches `markedCards` unless step 9 asks. `onSkip` defaults to none (Skip only advances). Keyboard: s/ArrowRight skip, d/Enter done. Untested: no browser run at 375px or 1280px, light or dark, no touch device; the 360px phone height reserve in `computeScale` is a guess.

- **Step 6, bulk mark (#454).** Mockups not reachable from this session (no claude_design tool), so built from the issue text. A "Shown rows" dropdown sits in the toolbar after Export (sheet entry, `data-phone-order` 50 on phone) with "Mark all shown as done" and "Clear marks on all shown"; it hides in Marks to Clear like Start marking. Decided: a collapsed multi-batch parent does **not** count as its batches. Its batch rows are hidden, the parent is derived, and #149 makes marking a multi-batch card a per-batch choice, so bulk acts only on expanded batch rows; the toast names how many collapsed cards stayed as is. Each action flips only shown rows whose tick differs, so it writes what ticking those rows one by one writes. Clear confirms in `#clear-shown-dialog` with the row count ("Clear the Done tick on 12 rows?") and says that sync carries it to other devices; it clears the rows it counted, not whatever is shown at confirm. Mark all has no confirm. Write path: `setCardMarked(key, marked)` is now `setCardsMarked([key], marked)` (deck-list.js), which loops the old per-row code, records every removed key in one `recordUnmarkedCards` before one `savePrism`, bumps `updatedAt` and `markedCardsUpdatedAt` together, and fires `card_marked` once per action. Reuse: `shownMarkRows()` in results.js (keys of the checkbox rows the last render left, plus the collapsed count), `toggleCardExpanded(name)`, `bulkMarkTargets`/`applyBulkMark` in `js/features/bulk-mark.js`. Tested (`tests/bulk-mark.test.js`): bulk vs row by row give identical `markedCards` and tombstones over a search, with a single-batch card, an expanded and a collapsed multi-batch card, One Mark at a Time pass rows, and a hidden row. Checked in a browser at 1110px and in a 375px iframe, dark and light (class swap), search on. Untested: a real touch device (44px items are behind `pointer: coarse`), a screen reader, a signed-in sync round trip.

- **Step 7, top strip (#455).** Mockups not reachable from this session (no claude_design MCP), so built from the issue text. Decided: the account trigger shows the email's first letter in a `wa-avatar`, else `circle-user`; the `#auth-loading` skeleton and the "couldn't reach" note plus Retry sit inside the account menu, with Settings always reachable; Membership is a logged-in item (the old `…` menu showed it logged out too), linking to `profile.html#membership` on pages with no Membership drawer. Dedicated commander copies is a `wa-dropdown-item type="checkbox"` (a `wa-switch` in a menu can't be reached by keyboard; Tab closes it), and its click keeps the menu open. The page h1 is the PRISM menu, named by `aria-labelledby="prism-title-text"` so menu items never join the heading name. Settings footer now reads "Your PRISMs are in the PRISM menu on My PRISM. Email and password live on your Profile." Reuse: `clickItemsOnKeyboardSelect(dropdown)` in `core/utils.js` (WA dropdowns fire only `wa-select` on a keyboard choice, so click-listener items did nothing from the keyboard; the other menus on build.html still have this bug), `--auto-size-available-width` on `::part(menu)` to cap a menu's width (WA pins `max-width` to it with `!important`), `.prism-menu-note` for captions inside a menu. Untested: a real signed-in session (logged-in menu checked by calling `updateAuthUI` with a fake user), a stored session's eager SDK load in a browser (covered by the nav-auth harness), `(pointer: coarse)` 44px items (no touch device). The guide.html header wraps the CTA and account button onto a second row at 375px, the same as the gear did before.

- **Step 8, slot picker (#456).** Open it for any deck with `openStripeReorderDialog(deckId)` from `js/features/stripe-reorder-dialog.js` (groups: `openGroupReorderDialog(groupId)`); step 2's Change button can call it once the deck exists. Mockups were not reachable from this session (no claude_design tool), so it follows the issue text. Decided: the current slot always shows in the list, disabled, even with "Free slots only" on; both the list and the picture only select, and Move commits; the picture is kept tappable but its 44 x 14 phone sizing is removed (the rows are the touch targets); the swap bar now sits at the top of the dialog and scrolls into view, since on phone the old bottom spot is below the list. The marked-deck line uses `isCardDone` plus marked batch keys over `processCards` (`decksHaveMarks`), because no deck-level helper exists. Split groups: unchanged behaviour (the group moves by its Side A slot, a group in the target slot swaps), not drawn in the mockups, so the list simply shows the group's slot as current. Reusable and tested: `freeSlotCounts`, `slotRows`, `decksHaveMarks`, `buildSlotMap`. Untested: a real touch device (the 52px rule is behind `pointer: coarse`), 375px exactly (the browser viewport could not go narrower than 456px), and a screen reader.

- **Step 9, audit (#457).** Mockups not reachable (no claude_design tool in this session), so built from the issue text. "Audit marks" is a `wa-button` in the toolbar before Start marking, and in the sheet on phone (`data-phone-order` 60); it hides in Marks to Clear and closes the sheet when it opens. Decided: it audits the **done rows shown**, not every done row, the same scope as Start marking and Shown rows, so a deck filter or search narrows it; One Mark at a Time audits pass rows. A done row is one whose own key is in `markedCards` (what its checkbox shows). It calls `openScryMode` with `rows`, title "Audit", Wrong/Matches; `openScryMode` gained `rows`, `endLabel` and `renderEnd` options (defaults unchanged). Verdicts: `{ [rowKey]: 'match' | 'wrong' }` under `prism_audit_<prismId>`, try/catch on every read and write, kept in memory for the run so a throwing storage still gives the end list. Every run re-walks every done shown row and overwrites verdicts; stored verdicts have no reader outside the run yet (a later step could show them on rows). The end screen lists the run's Wrong rows with their legend (`scryLegend`), or "Every mark matches". "Audit" is in CONTEXT.md. Reuse: `auditRows`, `wrongRows`, `auditOptions` in `js/features/audit.js`. Tested (`tests/audit.test.js`): a run with Matches and Wrong leaves `prism_data`, `markedCards`, tombstones and the PRISM object byte-identical and adds only the audit key; verdict keys are plain, `|#b|` and pass keys; the wrong list for single-batch, multi-batch and pass rows; storage that throws. Checked in a browser at 1110px (window max) and a 375px iframe, dark and light (class swap), one Wrong each run, `prism_data` string-equal afterwards; Start marking afterwards still reads SCRY-Mode, Skip, Done. Untested: a real touch device, a screen reader, a signed-in sync round trip. Deleting a PRISM leaves its audit key behind (small, device-only).

- **Step 10, phone legends (#470).** CSS only: the phone `tr { display: grid }` rule now has a `.results-table tr[hidden] { display: none }` override, so the legend and batch rows close. Tap and toggle wiring already existed (results.js row tap clicks `.stripe-cell-toggle`). Untested: no browser check at 375px or 1280px, light or dark (no data set up); no unit test (CSS only).

### Final pass (before merging `usability-pass` into `main`)

Done on `usability-final-pass`:

- Deck row at 375px: Edit, Move and the kebab drop to their own line, still at the right edge, so the name block gets the full width (owner to confirm; the brief said inline at every width). No leading "•" when a deck or group has no commander.
- Keyboard focus after the first inline add moves to Add deck.
- Delete deck, Split, Copy and What if open from the kebab; cancelling Delete keeps the deck.
- Printable guide renders the legend (split variants included) and every card, with no auto print.
- Color scheme set through Settings applies and survives a reload.
- Dialog titles and buttons in sentence case (Delete deck, Split deck, Create new PRISM, Edit group, Group name, Import file).

Still open, needs the owner:

- Real touch device for the 44px and 52px coarse-pointer rules; a screen reader pass.
- Signed-in session: account menu, a sync round trip with bulk mark, clear and an audit.
- Printable guide copy still has an em-dash and Title Case headings ("Deck Legend", "Card Marking Guide"); outside the mockups, left as is.

- **Card by card on desktop (#474).** SCRY-Mode and Audit share one dialog, so both change. From 768px up: `computeScale` (now exported, tested) fits the card to the height (cap 3, factor 0.95, 240px reserved for chrome and footer so the card ends above Skip and Done; phone math untouched), the legend is a column at body size with 16px swatches, and Skip and Done sit side by side, centred (10 to 14rem each, 56px tall). Keyboard shortcuts untouched. Untested: no browser run at 375px or 1280px, light or dark, no touch device; the card and legend centring relies on the existing `.scry-content` flex rules.

Deck dialog footer (#472): `#deck-form-actions` (Add deck or Save changes, Reset, Cancel) is a child of `#deck-dialog` with `slot="footer"` while the form is in the dialog, and goes back to the end of the form for the inline empty state; `placeDeckForm` moves it. The submit button carries `form="deck-form"`, so it submits from outside the form (WA copies the attribute to the light-DOM button it clicks, and `form.elements` then holds it for Enter in a field). The sticky rule at 640px and up is gone. Untested in a browser (extension not connected): 375px and 1280px, dark and light, Enter in a field, tab order, WA's footer layout of the buttons. Covered by `tests/deck-dialog-footer.test.js` (placement only).

- **Guide step bar (#475).** Not checked in a browser (extension not connected), so layout is unverified at 375px and 1280px. Two navs, one source: the phone and tablet bar (`#step-bar`, still the `wa-page` subheader) and a sticky "On this page" list (`#step-list`) in a right column at 1024px and up, built by script from the chips so labels live once. The bar hides its scrollbar, ends in a mask fade instead of the chevron patch, and scrolls itself (not the page) to center the active chip. Labels are shortened and numbered. Section ids and `scroll-margin-top` are unchanged. Open: the subheader slot may still reserve space when its nav is `display: none` on desktop; the sticky list's `top: 6rem` is a guess at the header height.

**Step (#473, slot picker on phone).** At 768px and below the slot list leads and the sleeve picture follows it (CSS `order`, same DOM, so it still reflects the chosen slot); the side switch is forced to one row with `::part(form-control-input)` `flex-wrap: nowrap`. Desktop untouched. Not checked in a browser (none available): the part selector and the four-rows-at-375x844 criterion are unverified.
- **Sheet tools first (#471).** Phone sheet order is now Export 10, Shown rows 20, Audit 30, Totals 40, Legend 50, Matrix 60 (`data-phone-order` in build.html). Desktop untouched. Not checked in a browser: the 375x844 fit is by construction (three tool controls open the sheet).

- **First card row on the first screen (#476).** The warning is one callout line (bold text, "Run a marking session" link, icon-only dismiss inline); its two other sentences live on guide.html#mark-a-session. Dismissal is device-only: `prism_marking_prereq_dismissed` in localStorage holds PRISM ids (`js/core/marking-prereq.js`), nothing in the PRISM or sync. A PRISM with any mark is added to it too, so clearing every mark later does not bring the warning back. `syncMarkingPrereq()` runs from `renderResults`. Filters moved into the search row (all widths); on phone the emptied actions row (`#marking-actions`) hides. The Deck Overlap Matrix now sits under the table on desktop (still in the sheet on phone). Measured (headless, 8 decks, warning showing): first row bottom 775 at 375x844, 668 at 1280x800, light and dark. On phone the sticky bottom bar starts at 726, so the first row is visible but its lower 49px sits under the bar. Untested: a real touch device, a reload in a browser (covered by `tests/marking-prereq.test.js`).

- **Toolbar, tabs, header, labels (#477).** Start marking now leads the tools row, which moved above the view switch, search and Filters, so it shares a row with Export at every width (1280: all four tools on one row; 1024 and 769 to 800: Start marking and Export first, Audit wraps). Phone tab icons hide (`.tab-icon`), no scroll arrows at 375. The phone table header is one line (Done, Card name, Marks side by side; inline `width:60px` on Done overridden on phone). The tab panel's top padding is smaller on phone, so at 375x844 with the warning the first card row ends at y 721, above the bar at 726. Sentence case: All cards, Total cards, Pool cards, Card name (also the printable guide's table), Deck overlap matrix, Sleeves done, Copies in 2+ decks; CLAUDE.md, TO-DO.md, guide.html and code comments follow. Left as is: the CSV header "Card Name" (data file, next to other Title Case columns), Marks to Clear (CONTEXT.md term), and this doc's earlier quotes. Untested: a real touch device, sorting by the header in the browser.
