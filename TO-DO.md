# TO-DO

Open work carried out of the `/impeccable critique` of `index.html`, `guide.html`,
and `tools.html` (snapshots in `.impeccable/critique/`, run 2026-08-16).

Everything the critique tagged P0 or P1 is fixed on branch
`fix/static-page-font-loading` (PR #178), along with the site-wide CDN-resilience
work, the `CONTEXT.md` label correction, the guide calibration step, and
`--wa-color-text-quiet`. What follows is what was deliberately left.

Scores at the time of the critique: `index.html` 22/40, `guide.html` 27/40,
`tools.html` 22/40. Re-run `/impeccable critique` to see them move.

---

## Shared chrome (`js/layout.js`)

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

## Accessibility

- [ ] **`build.html` renders a bare `*` above the decklist textarea.** Spotted
  while rendering the app to verify a `layout.js` change. Looks like a
  required-field marker whose label text is missing, which would leave the
  textarea without an accessible name. Unrelated to this branch; worth its own
  look.
- [ ] **The guide's marking procedure is two lists.** `guide.html` splits the
  steps into `<ol>` (1-5) and `<ol start="6">` around the dry-time callout.
  Screen readers announce "list of 5 items" then "list of 2 items", and the
  numbering depends on the hardcoded `start="6"` staying in sync if a step is
  ever inserted. Consider one list with the callout inside an `<li>`.
- [ ] **No image carries `width`/`height` or `loading="lazy"`.** 13 images across
  the three static pages, none with intrinsic dimensions (layout shift) or lazy
  loading. `guide.html` has five well below the fold.

## `tools.html` content (all P2 in the critique)

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
- [ ] **"Coming Soon" STL button.** A disabled brand button under a heading
  reading "Print Settings (v1)", above five concrete print settings for a file
  that does not exist. The 2026-06 beta review asked for this to be softened and
  it is unchanged. Either give it a date or state plainly that the file is not
  released yet.
- [ ] **Four products × four attributes is a comparison table wearing a card
  grid.** Consider the results-table treatment DESIGN.md §4 already specifies.

## Cross-page consistency

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

## Code cleanup

- [ ] **`.impact-table caption` duplicates the `.visually-hidden` utility.**
  `css/custom.css:292` inlines the visually-hidden pattern that
  `css/custom.css:13` now provides. Use the utility class on the caption and
  drop the duplicate rule.

## Bigger questions (design direction, not defects)

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
