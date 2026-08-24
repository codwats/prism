# TO-DO

Open work carried out of the `/impeccable critique` runs. Snapshots live in
`.impeccable/critique/`. Two runs so far, one section each:

- **`index.html`, `guide.html`, `tools.html`** (2026-08-16)
- **`build.html`** (2026-08-17)

---

## Static pages (critique run 2026-08-16)

Everything that critique tagged P0 or P1 is fixed on branch
`fix/static-page-font-loading` (PR #178), along with the site-wide CDN-resilience
work, the `CONTEXT.md` label correction, the guide calibration step, and
`--wa-color-text-quiet`. What follows is what was deliberately left.

Scores at the time of the critique: `index.html` 22/40, `guide.html` 27/40,
`tools.html` 22/40. Re-run `/impeccable critique` to see them move.

---

### Shared chrome (`js/layout.js`)

These render on all nine pages, so each one is a sitewide defect.

- [ ] **Em-dashes in shipped copy.** `js/layout.js:449` and `:505` both read
  "PRISM is in open beta — …". DESIGN.md §7 bans em-dashes in copy. The nine
  pages themselves are clean; only the injected chrome violates it.
- [ ] **Active nav link fails the project's own contrast rule.**
  `js/layout.js:360` colors the current-page link `--wa-color-brand-60`
  (`#9c90bd`), roughly 2.9:1 on white. DESIGN.md §2.6 is explicit that text on
  white is never lighter than step 40. Use `brand-30` or `brand-40`. Note the
  link also carries a `wa-body-m` weight bump, so location is not conveyed by
  color alone, but the color is still below the floor.
- [ ] **Spacing scale contradicts DESIGN.md.** `js/layout.js:242` sets
  `--wa-space-scale: 1.125`; DESIGN.md §5 specifies "Web Awesome base × 0.875"
  and a "compact and data-heavy" mood. The shipped scale is 1.29× the documented
  one and the changelog does not record a change. Decide which is right and make
  the other match. This is a judgment call about the product's density, not a
  bug to silently patch.

### Accessibility

- [x] **`build.html` renders a bare `*` above the decklist textarea.** Confirmed
  as diagnosed: both `wa-textarea`s were `required` with no `label`, so WA
  rendered the asterisk into an empty label slot and the accessible name was
  empty. Fixed in `1dd614b`; the name is now "Decklist *".
- [ ] **The guide's marking procedure is two lists.** `guide.html` splits the
  steps into `<ol>` (1-5) and `<ol start="6">` around the dry-time callout.
  Screen readers announce "list of 5 items" then "list of 2 items", and the
  numbering depends on the hardcoded `start="6"` staying in sync if a step is
  ever inserted. Consider one list with the callout inside an `<li>`.
- [ ] **No image carries `width`/`height` or `loading="lazy"`.** 13 images across
  the three static pages, none with intrinsic dimensions (layout shift) or lazy
  loading. `guide.html` has five well below the fold.

### `tools.html` content (all P2 in the critique)

- [ ] **Pen cards mix pros and cons in one undifferentiated list.** "Easy to wipe
  off if you make a mistake" and "Can rub off on frequently moved cards" sit
  adjacent in the same bullet style; the second one means marks disappear from
  cards you shuffle, which defeats the system. Split into labelled pros/cons, or
  promote the defect into a `wa-callout variant="warning"` on that card.
- [ ] **State colors used as a quality ladder.** Tags run `success` / `neutral` /
  `warning` / `brand` across the four pens. DESIGN.md §2 reserves state ramps for
  state, and amber on "Budget" reads as caution rather than price. Keep
  `success` on the one recommendation and make the rest `neutral`.
- [ ] **The buying links have no affordance.** Each product name is an `<a>`
  styled `color: inherit; text-decoration: none`, so the four links the page
  exists to offer look like plain text.
- [ ] **Affiliate disclosure sits below the links it discloses.** It is in the
  Sleeves section, under four undisclosed `amzn.to` links in Paint Pens. Move it
  above the pen grid.
- [ ] **Four products × four attributes is a comparison table wearing a card
  grid.** Consider the results-table treatment DESIGN.md §4 already specifies.

### Cross-page consistency

- [ ] **Feature names do not match the app.** `index.html` says "Overlap View";
  `build.html` calls it the Deck Overlap Matrix. "Deck Variants" is a "split
  group" everywhere else in the product and the codebase.
- [ ] **Heading casing diverges.** `index.html` and `tools.html` use Title Case
  section headings, `guide.html` uses sentence case. Each is defensible alone;
  together they read as drift. DESIGN.md §3 does not currently rule on section
  headings, so decide and write it down.
- [ ] **`index.html`'s "Mark Your Sleeves" step never links to `guide.html`.**
  The step that describes the physical work does not point at the page that
  explains it.
- [ ] **`theme-color` is an undocumented hex.** `#281645` on all three static
  pages matches no `--wa-color-brand-*` step (nearest are brand-05 `#180a2e` and
  brand-10 `#23173b`). It must be a literal because browser chrome reads it
  before CSS, but it should still correspond to a documented value.

### Code cleanup

- [ ] **`.impact-table caption` duplicates the `.visually-hidden` utility.**
  `css/custom.css:292` inlines the visually-hidden pattern that
  `css/custom.css:13` now provides. Use the utility class on the caption and
  drop the duplicate rule.

### Bigger questions (design direction, not defects)

These came out of the critique's design-specificity verdict, which scored 2/5:
the copy is unmistakably this product, the composition is not. `css/custom.css`
carries no rules for these pages beyond the logo swap, and none of the PRISM
primitives DESIGN.md §4 defines as mandatory — ColorSwatch, StripeIndicator,
SleeveSlot, DeckColorIndicator, the counting numeral, the 12px Sleeve — appear
on any of them. Nor do the WUBRG colors. A product about colored marks at fixed
positions has three public pages with no color and no positions.

- [ ] **Should the `index.html` hero be a live marked sleeve?** The primitives
  already exist. A hero where a visitor clicks four deck names and watches four
  WUBRG stripes land on a sleeve edge would teach the whole mental model in
  three seconds and could not be pasted onto another product.
- [ ] **Should the guide's marking session be a print card rather than a web
  page?** DESIGN.md §8 already specifies a print mode. The procedure is read at a
  table, one-handed, with wet paint on the reader's hands, and the page currently
  has no print affordance, no back-to-top, and nothing collapsible.
- [ ] **The site states neither side of the trade.** The payoff is now on
  `index.html`, but the cost is not: no time per card, no session length, no pen
  count, no sleeve count. A reader needs one pen per deck color, which at 20
  decks means 20 colors, and that fact lives only in `DEFAULT_COLORS`.
- [ ] **`guide.html` never uses the `longform` type role.** DESIGN.md §3 defines
  it as adobe-aldine 18px/1.75 and annotates it "Guide pages, editorial". The one
  page it was written for sets every paragraph in 16px body sans.

---

## `build.html` (critique run 2026-08-17)

Scored **24/40**, cognitive load HIGH (5 of 8 checks fail). Snapshot in
`.impeccable/critique/2026-08-17T00-30-00Z__build-html.md`.

Fixed on `fix/static-page-font-loading` in `1dd614b`, `7cf854e`, and `db8bbe0`:
the P0 PRISM strand, the unconfirmed stale-mark wipe, the missing heading spine,
the unlabeled decklist textareas, keyboard access to the slot picker,
`title`-only deck identity in the Stripes column, the undersized mark checkbox,
and marked-row legibility.

**Every P0 and P1 from this critique is now closed.** What follows is the P2 and
below, plus four design questions.

### Marked rows (P1, WCAG AA) — done

- [x] **Marked rows fell to roughly 2.6:1.** `.marked-row` used `opacity: 0.45`,
  computing body text to about `#a3a3a7` on white and failing AA in what becomes
  the majority state of the table. Replaced with a quiet token colour on the name
  cell, leaving the swatches and checkbox at full strength. Measured against the
  warning-tinted Pool row, the worst-case background: **5.80:1** light, **10.29:1**
  dark. Fixed in `db8bbe0`.
- [x] **The strikethrough was on the wrong cell.** It applied to `td:first-child`,
  the checkbox cell, where DESIGN.md §"Results table" specifies the card name.
  Moved to `.card-name-cell` and `.batch-subrow-label`. Fixed in `db8bbe0`.

### Settings and vocabulary

- [ ] **The `Position Numbers` preference does nothing.** It defaults to `none`
  and its hint reads "None hides numbers", but `positionNumHtml` renders whenever
  `exact || showNums`, and `exact` is true for any card with ≤5 visible marks
  regardless of the preference (`js/features/results.js:333`). Most cards have
  1-3 marks, so setting it to None is visibly inert. Gate `exact` on
  `numbersMode !== 'none'`. A setting that ignores its own value is the fastest
  way to teach a user that settings do not work here.
- [ ] **Pool/Core ships in four casings on one page.** `CONTEXT.md:34-41` says
  always capitalized and lists `POOL` and `pool` under *Avoid*. Shipped:
  "Pool+Core" (`build.html`, correct), `${pool} pool • ${core} core`
  (`js/features/deck-list.js:883`), "Cards become CORE"
  (`js/features/analysis.js:171` and `:191`), and literal `pool`/`core`/
  `dedicated` in batch sub-row labels (`js/features/results.js`).
- [ ] **A dialog title uses the term `CONTEXT.md` bans.** `build.html` labels the
  slot picker "Move Stripe Position"; `CONTEXT.md:56-59` bans "stripe position"
  in prose in favour of "slot". `js/layout.js` likewise labels a setting
  "Position Numbers".
- [ ] **DESIGN.md and CONTEXT.md contradict each other.** DESIGN.md §7 says to
  write "Perfect Fit inner sleeve"; `CONTEXT.md:61-63` lists that exact phrase
  under *Avoid* in favour of "Perfect Fit inner". One document has to yield.

### Copy rules in JS-rendered strings

The static HTML is clean; every violation below is in a template literal, which
is why a scan of the `.html` files misses them.

- [ ] **Em-dashes.** `js/features/init.js:367` ("Sync failed — Retry"),
  `js/features/scry-mode.js:61` and `:62`, `js/features/analysis.js:195` and
  `:210`, `js/features/deck-form.js:145`, and the batch sub-row label in
  `js/features/results.js`. DESIGN.md §7 bans them.
- [ ] **An exclamation point.** `js/features/scry-mode.js:105` reads "All cards
  reviewed!". DESIGN.md §7 is explicit, and this is the last line a user sees at
  the end of a marking session.

### Design-system drift

- [ ] **Caption text ships at line-height 1.2 against a documented 1.5.**
  Measured across `.wa-caption-s/m/xs` in eleven places (three visible on load,
  eight inside closed dialogs). DESIGN.md §3 specifies 1.5 for both "Body small /
  UI" and "Caption / meta".
- [ ] **Nine Web Awesome deprecation warnings on every load.**
  `size="large"/"medium"/"small"` should be `"l"/"m"/"s"` across `wa-input`,
  `wa-button`, `wa-switch`, `wa-tag`, `wa-radio`, `wa-radio-group`,
  `wa-file-input`, and `wa-select`.
- [ ] **Three color-input treatments, three names, one concept.** A native
  `<input type="color">` at 40×32 with a dashed border, another at 60×40 with
  `border: none`, and a `<wa-color-picker>` — labelled "Current Marker",
  "Marker Color", and "Shared Stripe Color". None is DESIGN.md's "deck color",
  and both native inputs are under 44px.
- [ ] **`--flank-size` is set on the child, not the flank container.**
  `build.html:210` puts it on the `.wa-stack` inside `.wa-flank`, so the intended
  175px column never applies.
- [ ] **A `<wa-divider vertical>` with nothing on its far side.**
  `build.html:224`. Vestigial.
- [ ] **Dead zebra striping.** `css/custom.css:119` paints
  `rgba(255, 255, 255, 0.015)` on even rows — a white overlay on a white surface.
  It does nothing in light mode and almost nothing in dark.
- [ ] **First paint is a different table shape than every later one.** The static
  `<thead>` declares three columns and the skeletons use `colspan="3"`
  (`build.html:452`, `:459-462`), but `renderResultsHeader()` injects four.
- [ ] **Docs describe a page that does not exist.** `CLAUDE.md` documents Web
  Awesome 3.10.0 while the kit serves 3.11.0, and DESIGN.md §4 documents four
  tabs (Decks / Results / Export / Import) where the page ships two. Two is the
  better IA, but the consequence is that export and import are scattered across
  three separate menus with no home.

### First-run and flow (P2, from the persona walk)

- [ ] **The first control a beginner meets is the most advanced one.**
  "Dedicated commander copies" sits at the top of the Decks tab. It is a
  per-PRISM setting that changes the whole batch derivation and that nobody on
  run one can evaluate.
- [ ] **The Decks empty state offers no next step.** `js/features/deck-list.js`
  renders "No decks yet." with no call to action, while the Results empty state
  does have an Add Deck button.
- [ ] **Bracket is collected on equal footing with Deck Name and Commander and
  affects nothing.** `bracket` never reaches stripe assignment, Pool/Core
  classification, or any count — it is display-and-export metadata only. Either
  make it drive something real or stop making it one of the first five decisions.
- [ ] **The SCRY-Mode keyboard shortcuts are documented nowhere in the UI.**
  `d` / `s` / Enter / → (`js/features/scry-mode.js`). Flagged in the 2026-06 beta
  review and still true.
- [ ] **The Add Deck form sits below the entire deck list.** At 20 decks that is a
  long scroll to the primary creation action, with no Add Deck affordance in the
  header.
- [ ] **Sorting is single-column only.** You cannot sort by copies within deck
  count, which is the natural batching order for a long marking session.

### Bigger questions (`build.html`)

The engine is unmistakably this product — the stripe-signature sort, the to-scale
slot picker, the batch model's refusal of a false parent checkbox. The chrome is
not: the three stat cards are the stock SaaS metric tile and the Results toolbar
would lift into a CRM unchanged. Leaving the chrome as-is was an explicit
decision on 2026-08-17, so these are recorded as questions, not defects.

- [ ] **If the pen is the real bottleneck, why is the table organized by card
  instead of by pen?** SCRY-Mode is one card at a time and the sort already
  clusters by identical stripe signature. "One pen at a time" — pick up violet,
  here are all 34 marks it makes across every card, put it down — is the actual
  physical workflow, and `batches` / `marksForParticipants` already support the
  projection.
- [ ] **None of the three stat cards reports the number the user came for.**
  Total Cards, Pool Cards, and Marked are internal quantities. People open PRISM
  to learn how many copies they do not have to buy.
- [ ] **Marking is irreversible, but Done is the cheapest control HTML offers.**
  The batch model already refuses a false parent checkbox because over-marking
  cannot be undone, yet an individual mark is an 18px checkbox with no
  confirmation, no undo window, and a fade as its only feedback. Relatedly, the
  message "3 cards unchecked (new stripes added)" — which means paint already on
  sleeves is now incomplete — ships as an auto-dismissing toast
  (`js/features/deck-list.js`), the lowest-weight surface available.
- [ ] **The Decks and Results tabs hold two halves of one mapping.** Colour→deck
  lives on one, mark→card on the other, and the user carries the join in working
  memory across a tab switch, on a phone, at a table. What would have to be cut
  to make the legend a permanent rail?

---
