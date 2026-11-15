# Usability pass — November 2026

A read of every page's markup and the build-page feature modules, then a look at build.html and guide.html in Chrome with a seeded 10-deck PRISM (desktop, dark scheme, logged out, viewport about 1085 by 1270). The browser window would not resize, so **mobile was not looked at**; mobile claims below come from the CSS. Profile, gallery, the home page and the logged-in states were read, not rendered.

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

Constraints: nothing may be removed, only moved. Every destructive action keeps a confirm. Touch targets at least 44px. The marks on a card must stay accurate and unambiguous; that matters more than polish.
```
