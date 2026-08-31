---
name: PRISM
description: Sleeve marking tool for MTG Commander players who share cards across decks.
colors:
  primary: "#4d4169"
  primary-hover: "#3a2e55"
  primary-subtle: "#eadeff"
  primary-quiet: "#f6eeff"
  primary-stroke: "#7d719c"
  neutral-text: "#34353c"
  neutral-text-subtle: "#5a5a62"
  surface-default: "#ffffff"
  surface-2: "#f2f2fc"
  surface-3: "#e5e5ef"
  surface-border: "#c9c9d3"
  success-text: "#216802"
  success-fill: "#42882e"
  success-surface: "#aef89b"
  warning-text: "#795300"
  warning-fill: "#9c7100"
  warning-surface: "#ffdc7a"
  danger-text: "#a22e31"
  danger-fill: "#c64f4e"
  danger-surface: "#ffd7d3"
  wubrg-w: "#EEB41B"
  wubrg-u: "#3995D9"
  wubrg-b: "#8662D2"
  wubrg-r: "#E2484B"
  wubrg-g: "#4FAB33"
typography:
  display:
    fontFamily: "adobe-aldine, Georgia, serif"
    fontSize: "4rem"
    fontWeight: 600
    lineHeight: 1.2
  h1:
    fontFamily: "adobe-aldine, Georgia, serif"
    fontSize: "3rem"
    fontWeight: 600
    lineHeight: 1.2
    letterSpacing: "-0.02em"
  h2:
    fontFamily: "adobe-aldine, Georgia, serif"
    fontSize: "2.25rem"
    fontWeight: 600
    lineHeight: 1.2
  h3:
    fontFamily: "adobe-aldine, Georgia, serif"
    fontSize: "1.75rem"
    fontWeight: 600
    lineHeight: 1.2
  h4:
    fontFamily: "adobe-aldine, Georgia, serif"
    fontSize: "1.375rem"
    fontWeight: 600
    lineHeight: 1.2
  sectionLabel:
    fontFamily: "adobe-aldine, Georgia, serif"
    fontSize: "1.125rem"
    fontWeight: 600
    lineHeight: 1.5
  body:
    fontFamily: "halyard-micro, system-ui, sans-serif"
    fontSize: "1rem"
    fontWeight: 400
    lineHeight: 1.5
  bodySmall:
    fontFamily: "halyard-micro, system-ui, sans-serif"
    fontSize: "0.875rem"
    fontWeight: 400
    lineHeight: 1.5
  caption:
    fontFamily: "halyard-micro, system-ui, sans-serif"
    fontSize: "0.75rem"
    fontWeight: 400
    lineHeight: 1.5
  eyebrow:
    fontFamily: "halyard-micro, system-ui, sans-serif"
    fontSize: "0.875rem"
    fontWeight: 500
    lineHeight: 1.5
    letterSpacing: "0.05em"
  longform:
    fontFamily: "adobe-aldine, Georgia, serif"
    fontSize: "1.125rem"
    fontWeight: 400
    lineHeight: 1.75
  code:
    fontFamily: "Geist Mono, ui-monospace, monospace"
    fontSize: "0.75rem"
    fontWeight: 400
    lineHeight: 1.6
rounded:
  s: "3px"
  m: "4px"
  l: "6px"
  xl: "8px"
  pill: "9999px"
  sleeve: "12px"
spacing:
  3xs: "1.75px"
  2xs: "3.5px"
  xs: "7px"
  s: "10.5px"
  m: "14px"
  l: "21px"
  xl: "28px"
  2xl: "42px"
  3xl: "56px"
  4xl: "84px"
components:
  button-primary:
    backgroundColor: "{colors.primary}"
    textColor: "#ffffff"
    rounded: "{rounded.m}"
    padding: "0 1rem"
    height: "2.5rem"
  button-primary-hover:
    backgroundColor: "{colors.primary-hover}"
  button-secondary:
    backgroundColor: "{colors.primary-subtle}"
    textColor: "{colors.primary}"
    rounded: "{rounded.m}"
    height: "2.5rem"
  button-outlined:
    backgroundColor: "{colors.surface-default}"
    textColor: "{colors.neutral-text}"
    rounded: "{rounded.m}"
    height: "2.5rem"
  card:
    backgroundColor: "{colors.surface-default}"
    rounded: "{rounded.l}"
    padding: "21px"
  input:
    backgroundColor: "{colors.surface-default}"
    rounded: "{rounded.m}"
    height: "2.5rem"
    padding: "0 0.75rem"
  tag:
    backgroundColor: "{colors.primary-subtle}"
    textColor: "{colors.primary}"
    rounded: "{rounded.pill}"
    padding: "0.35em 0.7em"
  dialog:
    backgroundColor: "{colors.surface-default}"
    rounded: "{rounded.l}"
    width: "min(31rem, 92vw)"
---

# PRISM — DESIGN.md

> Design system document for AI agents. Drop in the repo root; agents read this before writing UI.
> Product: **PRISM — Personal Reference Index & Sleeve Marking.** "One card. Every deck."™
> Stack: vanilla JS ES modules + **Web Awesome 3.8.0** (Matter theme, mild palette) with PRISM token overrides.
> Source of truth for tokens: `css/custom.css` + the theme overrides in `js/layout.js`. Brand rules: `PRISM-Brand-Guidelines-v2.0.md`.
> Building UI: load the `/webawesome-design` skill before laying out any page, panel, or component. Use a Web Awesome component whenever one exists for the job — never hand-roll a custom button, input, dialog, tab set, etc. Reach for raw HTML/CSS only for what WA has no component for (PRISM primitives: ColorSwatch, StripeIndicator, SleeveSlot, and similar — see §4).

---

## 1. Visual Theme & Atmosphere

**Minimal structure, maximal color.** The layout is quiet so the color can talk. PRISM is a tool for marking Perfect Fit inner sleeves with colored stripes, so every color in the UI is functional: it either identifies a deck, signals a state, or it does not belong.

- **Mood:** clever, clean, confident, direct. A precise workshop instrument, not a toy and not a luxury object.
- **Density:** compact and data-heavy. Spacing scale is 0.875× of Web Awesome's base; card lists and result tables are meant to be scanned, not admired.
- **Decoration budget:** near zero. No gradients, no textures, no patterns, no blur, no glass. Flat surfaces, 1px borders, one violet accent. Photography is limited to the physical products themselves.
- **The only imagery:** the logo, the gem icon, MTG card previews, stripe/swatch color blocks, and plain photographs of the physical products.
- **Light and dark are both first-class** (auto / light / dark). Light is white-on-white with `neutral-95` sunken panels; dark uses `neutral-10` surfaces. Marketing heroes and footers may go violet-dark (`brand-05` / `brand-10`).
- **Feeling to produce:** "why didn't this exist already?" The user should feel smart, not sold to.

---

## 2. Color Palette & Roles

Three layers: **ramps** (raw), **semantic tokens** (what UI code uses), **WUBRG accents** (identity only).
In app UI, never hand-pick a ramp step. Use the semantic token. Hand-picking steps is allowed only in marketing pages and static collateral.

### 2.1 Brand ramp — violet

| Token | Hex | Role |
|---|---|---|
| `--wa-color-brand-05` | `#180a2e` | Darkest surfaces, hero backgrounds |
| `--wa-color-brand-10` | `#23173b` | Dark surfaces, footer backgrounds |
| `--wa-color-brand-20` | `#3a2e55` | Elevated dark surfaces, headings on light |
| `--wa-color-brand-30` | `#4d4169` | Body text on light, strong borders, solid brand buttons |
| `--wa-color-brand-40` | `#60547e` | Smallest text on white (AA), icon accents |
| `--wa-color-brand-50` | `#7d719c` | Large text only on white, focus ring, mid accents |
| `--wa-color-brand-60` | `#9c90bd` | Decorative on light; text on dark |
| `--wa-color-brand-70` | `#b5a9d7` | Borders and dividers on dark |
| `--wa-color-brand-80` | `#cec2f2` | Subtle accents, hover fills on dark, brand text on dark |
| `--wa-color-brand-90` | `#eadeff` | Tinted backgrounds, text on dark |
| `--wa-color-brand-95` | `#f6eeff` | Faintest tint, section backgrounds |

### 2.2 Neutral ramp — cool, violet-biased

| Token | Hex | Role |
|---|---|---|
| `--wa-color-neutral-05` | `#121218` | Near-black text, dark-mode base |
| `--wa-color-neutral-10` | `#1e1e25` | Dark surfaces |
| `--wa-color-neutral-20` | `#34353c` | Headings, strong text |
| `--wa-color-neutral-30` | `#47474f` | Body text on light |
| `--wa-color-neutral-40` | `#5a5a62` | Secondary text (AA) |
| `--wa-color-neutral-50` | `#76767f` | Placeholder, large text only on white |
| `--wa-color-neutral-60` | `#9797a0` | Disabled, decorative |
| `--wa-color-neutral-70` | `#b0b0b9` | Borders, input strokes |
| `--wa-color-neutral-80` | `#c9c9d3` | Dividers, subtle borders |
| `--wa-color-neutral-90` | `#e5e5ef` | Surface tints, table header fills |
| `--wa-color-neutral-95` | `#f2f2fc` | Page and panel backgrounds |

### 2.3 State ramps (abbreviated — full 11 steps exist for each)

| Ramp | Text (40) | Fill (50) | Surface (90) | Surface subtle (95) | Border (70) |
|---|---|---|---|---|---|
| Success | `#216802` | `#42882e` | `#aef89b` | `#bbffa8` | `#79c066` |
| Warning | `#795300` | `#9c7100` | `#ffdc7a` | `#ffeca9` | `#d5a843` |
| Danger | `#a22e31` | `#c64f4e` | `#ffd7d3` | `#ffeae7` | `#ff8883` |

### 2.4 WUBRG — the accent system

The five Magic color-identity accents. **Identity only:** stripes, deck swatches, the logo gem. Never text color, never a state color, never a button fill.

| Color | Token | Hex |
|---|---|---|
| W — Gold | `--prism-wubrg-w` | `#EEB41B` |
| U — Blue | `--prism-wubrg-u` | `#3995D9` |
| B — Purple | `--prism-wubrg-b` | `#8662D2` |
| R — Red | `--prism-wubrg-r` | `#E2484B` |
| G — Green | `--prism-wubrg-g` | `#4FAB33` |

Extended deck colors continue past WUBRG when a PRISM holds more than five decks (up to 48 slots, 96 with dot splits).

### 2.5 Semantic tokens (build against these)

WA 3.11 renamed or dropped its own versions of most of these (`neutral-text` → `text-normal`, `neutral-text-subtle` → `text-quiet`, no bare `brand-fill`, no `surface-2`/`surface-3`, no state `-surface`/`-text` roles, etc.). PRISM now defines every token below itself, in `js/layout.js`'s injected `:root` block — do not rely on the CDN theme to provide them.

```css
/* Surfaces */
--wa-color-surface-default: #ffffff;      /* page + cards (light) — WA-native */
--wa-color-surface-1:  var(--wa-color-surface-default);  /* raised/bordered popovers (tooltips, previews) */
--wa-color-surface-2:  var(--wa-color-neutral-95);  /* sunken panels, table heads */
--wa-color-surface-3:  var(--wa-color-neutral-90);  /* deepest sunken */
--wa-color-surface-border: var(--wa-color-neutral-80);  /* WA-native */
--wa-color-neutral-stroke: var(--wa-color-neutral-80);  /* borders, ColorSwatch ring on light colors */

/* Text */
--wa-color-neutral-text:        var(--wa-color-neutral-20);
--wa-color-neutral-text-subtle: var(--wa-color-neutral-40);  /* step 40, not 50 — see §2.6 */

/* Brand */
--wa-color-brand-text:         var(--wa-color-brand-30);
--wa-color-brand-fill:         var(--wa-color-brand-40);  /* icons, selection */
--wa-color-brand-fill-loud:    var(--wa-color-brand-30);  /* solid buttons — WA-native */
--wa-color-brand-fill-subtle:  var(--wa-color-brand-90);
--wa-color-brand-fill-quiet:   var(--wa-color-brand-95);  /* WA-native */
--wa-color-brand-on-loud:      #ffffff;                   /* WA-native */
--wa-color-brand-stroke:       var(--wa-color-brand-50);
--wa-color-brand-stroke-subtle: var(--wa-color-brand-70);  /* split-group card borders */

/* State (success/warning/danger — same pattern for each) */
--wa-color-warning-text:            var(--wa-color-warning-40);
--wa-color-warning-fill:            var(--wa-color-warning-50);  /* WA-native as -fill-loud/-normal/-quiet */
--wa-color-warning-surface:         var(--wa-color-warning-90);
--wa-color-warning-surface-subtle:  var(--wa-color-warning-95);
--wa-color-warning-stroke-subtle:   var(--wa-color-warning-70);
```

Dark mode (`.wa-dark`) remaps the ramp-derived tokens above: surfaces to `neutral-10/20/30`, `neutral-text` to `neutral-95`, `neutral-text-subtle` to `neutral-80`, `neutral-stroke` to `neutral-30`, `brand-text`/`brand-stroke` to `brand-80`/`brand-70`, state text to the 80 step, state surface to the 20 step (surface-subtle one step further, the 10 step). Tokens that resolve through a WA-native token (`surface-1` via `surface-default`, `brand-fill-loud`, etc.) don't need a PRISM-authored dark remap — WA already themes those itself.

### 2.6 Contrast rules (non-negotiable)

- On white, text is never lighter than **step 40**. Step 50 is large text only (≥18px or ≥14px bold).
- On dark, text is never darker than **step 80**.
- WUBRG hexes are never used as text on white — several fail AA.
- Every color choice must be validated against WCAG AA before shipping.

---

## 3. Typography Rules

Three families, loaded from **Adobe Fonts (Typekit)** plus Bunny Fonts for the mono.

```html
<link rel="stylesheet" href="https://use.typekit.net/gbw6ibc.css">
```

```css
--wa-font-family-body:     "halyard-micro", system-ui, -apple-system, sans-serif;
--wa-font-family-heading:  "adobe-aldine", Georgia, serif;
--wa-font-family-longform: "adobe-aldine", Georgia, serif;
--wa-font-family-code:     "Geist Mono", ui-monospace, "SF Mono", monospace;

--wa-font-weight-body:     400;
--wa-font-weight-heading:  600;
--wa-font-weight-longform: 400;
--wa-font-weight-code:     400;
```

- **halyard-micro** — all UI: body copy, labels, buttons, tables, navigation, form fields. A small-text-optimized grotesque; it stays legible at 11–14px, which is where most of the tool lives.
- **adobe-aldine** — all headings and all longform/editorial copy. This is the logo's own DNA (Aldine-tradition serif), so headings now carry the brand mark's voice instead of borrowing a neutral sans.
- **Geist Mono** — code, decklist textareas, exported marking guides, any column of data that must align.

The serif-heading / sans-body pairing is the system's signature contrast: **editorial headline, instrument body.** Do not invert it (never a sans heading over serif body), and never introduce a fourth family.

### Hierarchy

| Style | Family | Size | Weight | Line height | Notes |
|---|---|---|---|---|---|
| Display / hero | adobe-aldine | 4rem (64px) | 600 | 1.2 | Marketing heroes only |
| H1 | adobe-aldine | 3rem (48px) | 600 | 1.2 | `letter-spacing: -0.02em` |
| H2 | adobe-aldine | 2.25rem (36px) | 600 | 1.2 | |
| H3 | adobe-aldine | 1.75rem (28px) | 600 | 1.2 | |
| H4 / card title | adobe-aldine | 1.375rem (22px) | 600 | 1.2 | |
| Section label | adobe-aldine | 1.125rem (18px) | 600 | 1.5 | |
| Body | halyard-micro | 1rem (16px) | 400 | 1.5 | Default UI text |
| Body small / UI | halyard-micro | 0.875rem (14px) | 400 | 1.5 | Buttons, inputs, table cells |
| Caption / meta | halyard-micro | 0.75rem (12px) | 400 | 1.5 | Tags, hints, table headers |
| Micro | halyard-micro | 0.6875rem (11px) | 500 | 1.5 | Counting numerals, badges |
| Eyebrow | halyard-micro | 0.875rem | 500 | 1.5 | `letter-spacing: 0.05em` — the "One card. Every deck.™" line |
| Longform | adobe-aldine | 1.125rem (18px) | 400 | 1.75 | Guide pages, editorial |
| Code / data | Geist Mono | 0.75rem (12px) | 400 | 1.6 | Decklists, exports |

Weights available: 400 / 500 / 600 / 700. Stick to those.
Line heights: `--wa-line-height-condensed: 1.2`, `normal: 1.5`, `expanded: 1.75`.
Letter spacing: `tight: -0.02em` (large headings), `normal: 0`, `loud: 0.05em` (eyebrows only).

### Casing

- Sentence case for body copy and most UI.
- Title Case for nav items, buttons, and card headers in the app: "Build Your PRISM", "Add a Deck", "Track Changes".
- ALL CAPS for feature names only: POOL, CORE, SCRY-Mode.

---

## 4. Component Stylings

All components are Web Awesome 3.8.0 elements (`<wa-button>`, `<wa-card>`, `<wa-tab-group>`, `<wa-details>`, `<wa-dialog>`, `<wa-input>`, `<wa-switch>`, `<wa-radio-group>`, `<wa-callout>`, `<wa-tag>`, `<wa-icon>`) themed by the tokens above. Do not rebuild them from raw HTML.

### Button

- Height 2.5rem (small 2rem, large 3rem); padding `0 1rem`; radius 4px; font-size 14px; weight 500; `gap: 0.55em` between icon and label.
- Transition: `background-color / border-color / color / box-shadow 0.15s ease`.
- Focus: `box-shadow: 0 0 0 3px var(--wa-color-brand-fill-subtle)`, no outline.
- Variants:
  - **Brand (primary):** `brand-fill-loud` bg, white text; hover `brand-20`.
  - **Brand filled (secondary):** `brand-fill-subtle` bg, `brand-text`; hover `brand-80`.
  - **Outlined:** white bg, `neutral-stroke` border; hover `surface-2`.
  - **Plain:** transparent; hover `surface-2`.
  - **Danger / Success:** loud fill, white text; hover the 30 step.
- Disabled: `opacity: 0.5`, `cursor: not-allowed`. No press/shrink effect.

### Card

- White (`surface-raised`) fill, 1px `surface-border`, radius 6px, flat by default, `overflow: hidden`.
- Optional hover lift: `box-shadow: var(--wa-shadow-m)` over `box-shadow .15s ease`. Nothing else moves.
- Header: `14px 21px`, bottom border, flex row with `gap: 10.5px`. Body: `21px`. Footer: `14px 21px`, top border.

### Input / Select / Textarea

- Height 2.5rem, radius 4px, 1px `neutral-stroke`, white fill, 14px text, `padding: 0 0.75rem`.
- Placeholder `neutral-50`. Focus: border `brand-stroke` + brand focus ring.
- Textarea is monospace (Geist Mono, 12px, `line-height: 1.6`) — it holds decklists.
- Select uses a custom 10×6 chevron SVG at `right 0.75rem center`, `padding-right: 2rem`.

### Tag / Badge

- 12px, weight 500, `padding: 0.35em 0.7em`, `line-height: 1`. Pill radius for tags and badges; 3px radius for square variants.
- Tones: neutral (`neutral-fill`), brand (`brand-fill-subtle` / `brand-text`), success, warning, danger — each surface + matching text token. Outlined variants swap fill for a 1px tone border.

### Tabs

- Nav row with 21px gap and a 1px bottom border. Tab: 14px, weight 500, `neutral-text-subtle`, `padding: 0.75rem 0.25rem`, 2px transparent bottom border.
- Active: `brand-text` + `brand-fill-loud` bottom border. Hover: `neutral-text`.
- Panel padding-top 21px. The app's four tabs: Decks / Results / Export / Import.

### Details (accordion)

- Card shell (1px border, radius 6px, white). Summary: 16px, weight 500, space-between, chevron in `neutral-text-subtle` rotating 90° on open. Body: 14px, `neutral-30`, `line-height: 1.6`.

### Dialog

- Overlay `rgba(18, 18, 24, 0.45)`, no blur. Panel: `min(31rem, 92vw)`, radius 6px, `--wa-shadow-xl`, `max-height: 86vh`.
- Footer actions right-aligned with 10.5px gap.

### Callout

- Flex row, 14px gap, `padding: 14px 21px`, radius 4px, 1px border, 14px text at `line-height: 1.55`.
- Tones use `*-surface-subtle` fill + `*-stroke-subtle` border + tone-colored icon.

### PRISM primitives (product-specific — always use these, never invent new stripe visuals)

| Primitive | Geometry | Rules |
|---|---|---|
| **ColorSwatch** | 28×28, radius 3px, 2px transparent border | Hover `scale(1.1)`; selected gets `brand-fill` border + 2px `brand-fill-subtle` glow; light colors get a `neutral-stroke` border so they read on white |
| **DeckColorIndicator** | 24×24 (small 18, dot 10) radius 3px, 1px `neutral-stroke` | Non-interactive; identifies a deck everywhere its name appears |
| **StripeIndicator** | 18×18, radius 3px, 1px stroke | Empty = dashed `surface-border`; Side B = 2px dashed; dot variant = 10px circle |
| **Counting numeral** | Overlaid on every 5th slot | 10px, weight 700, white with `text-shadow: 0 0 2px #000, 0 0 2px #000` |
| **SleeveSlot** | 28×10, radius 3px | Empty = 1.5px dashed `neutral-40`; occupied = 1.5px `rgba(0,0,0,0.25)`; hover = warning-70 ring; active = 2px success-70 ring |
| **Sleeve / SleeveEdge** | 2px `neutral-stroke`, radius 12px | The one place a larger radius is allowed — it represents a physical sleeve |

### Results table

- Full width, collapsed borders, 14px text. Cells `10.5px 14px`, 1px bottom border.
- Header: `surface-2` fill, 12px, weight 600, `nowrap`.
- Row states: hover `surface-2`; **shared** rows `warning-surface-subtle` (hover `warning-surface`); **removed** rows `danger-surface-subtle`; **marked** rows drop to `opacity: 0.45` with the card name struck through; basic lands italic.
- Mark checkbox: 18×18, `accent-color: var(--wa-color-brand-fill)`.

### Icons

Web Awesome's Font Awesome set via `<wa-icon name="...">`, outline-first FA6 names: `wand-magic-sparkles`, `layer-group`, `table`, `download`, `upload`, `plus`, `xmark`, `filter`, `search`, `palette`, `paintbrush`, `file-import`, `file-csv`, `print`, `clipboard`, `arrows-rotate`, `circle-info`, `triangle-exclamation`, `right-to-bracket`, `circle-user`, `bars`, `expand`, `inbox`, `box-open`, `object-group`, `code-branch`, plus `github` / `discord` from the brands family.
No emoji. No unicode-as-icons. Oversized numerals (1/2/3) act as step markers on the marketing site.

---

## 5. Layout Principles

### Spacing scale (Web Awesome base × 0.875)

| Token | Value | Typical use |
|---|---|---|
| `--wa-space-3xs` | 1.75px | Hairline nudges |
| `--wa-space-2xs` | 3.5px | Stripe row gaps, label-to-field |
| `--wa-space-xs` | 7px | Icon-to-text, chip gaps |
| `--wa-space-s` | 10.5px | Button clusters, table cell padding |
| `--wa-space-m` | 14px | Card header padding, list gaps |
| `--wa-space-l` | 21px | Card body padding, tab nav gap |
| `--wa-space-xl` | 28px | Between cards |
| `--wa-space-2xl` | 42px | Section padding |
| `--wa-space-3xl` | 56px | Page section rhythm |
| `--wa-space-4xl` | 84px | Marketing section rhythm |

- **Primitives before custom CSS:** stack (vertical flow), cluster (wrapping row), grid (equal columns), split (two-up) — all with token gaps. Never space siblings with per-element margins where a `gap` works.
- **Container:** app content maxes around 1200px; marketing prose columns cap near 65ch.
- **Whitespace philosophy:** generous vertically between sections, tight inside components. The tool should show a lot at once — that is the point of fanning a deck and reading marks.
- **Corners:** radius scale 0.5 → 3px (`s`), 4px (`m`), 6px (`l`), 8px (`xl`), pill for tags. Sharp and precise. The 12px sleeve is the only exception.
- **Borders:** 1px, `neutral-80` on light, `neutral-30` on dark. Lines never compete with stripes.

---

## 6. Depth & Elevation

Shadows are violet-tinted (`rgba(24, 10, 46, …)`) and restrained. Elevation is carried by borders and surface steps first, shadow second.

| Token | Value | Use |
|---|---|---|
| `--wa-shadow-s` | `0 1px 2px rgba(24,10,46,.08)` | Switch thumb, tiny lifts |
| `--wa-shadow-m` | `0 2px 6px rgba(24,10,46,.10), 0 1px 2px rgba(24,10,46,.06)` | Card hover |
| `--wa-shadow-l` | `0 6px 16px rgba(24,10,46,.12), 0 2px 4px rgba(24,10,46,.06)` | Dropdowns, menus |
| `--wa-shadow-xl` | `0 12px 32px rgba(24,10,46,.16), 0 4px 8px rgba(24,10,46,.08)` | Dialogs, card-preview popovers only |

Surface hierarchy (light): page white → `surface-2` (`neutral-95`) sunken panels → `surface-3` (`neutral-90`) deepest.
Dark: `neutral-10` base → `neutral-20` raised → `neutral-30` highest. No transparency, no backdrop blur anywhere.

### Motion

| Token | Value |
|---|---|
| `--wa-transition-fast` | `0.1s ease` |
| `--wa-transition-normal` | `0.15s ease` |
| `--wa-transition-slow` | `0.25s ease` |

Only functional transitions: color, border-color, box-shadow, and the 1.1 scale on small swatches. Loading uses a skeleton pulse (`1.6s ease-in-out infinite`, opacity 1 → 0.45). No bounces, no parallax, no decorative motion, no press-shrink.

---

## 7. Do's and Don'ts

**Do**

- Use semantic tokens (`--wa-color-brand-fill-loud`) in app UI; reserve raw ramp steps for marketing and collateral.
- Keep WUBRG strictly for stripes, deck swatches, and the gem.
- Let the accent be violet and the field be white. One accent, one job.
- Write in second person with the player as the actor: "Mark your sleeves."
- Say **Perfect Fit inner sleeve**, **outer sleeve**, **mark / stripe**, **Spirit Guide**, **deck color**.
- Treat double-sleeving as required, not optional.
- Compose Web Awesome components; extend with `css/custom.css` only for what WA cannot express.
- Load the `/webawesome-design` skill before building or restyling any page, panel, or layout. Prefer an existing `<wa-*>` component over a custom-built equivalent every time one is available.
- Photograph the physical products plainly, on a neutral ground. SVG illustration stays the default for anything explaining the tool itself.
- Validate every text/background pair against WCAG AA.

**Don't**

- No gradients, textures, patterns, glassmorphism, or blur. No lifestyle or stock photography, no photographic backgrounds or textures, and never a photo behind text.
- No new fonts. halyard-micro, adobe-aldine, Geist Mono. Nothing else.
- Never a sans heading over serif body — that inverts the system's signature.
- No WUBRG color as text, state color, or button fill.
- No emoji anywhere in product UI or marketing copy.
- No exclamation points and no em-dashes in copy. Use commas, periods, colons, parentheses.
- Never say "penny sleeve", "mark your cards", "stencil", or "jig".
- No hype words: "game-changing", "revolutionary", "seamless". No filler: "It's important to note that", "In order to", "When it comes to".
- No large radii (the sleeve graphic excepted), no heavy shadows on cards, no more than two background colors in one view.
- No decorative animation, and nothing that moves on scroll.

**The test for every line of copy:** does it help the player do something, understand something, or feel smart? If not, cut it.

---

## 8. Responsive Behavior

- **Breakpoints:** `640px` (small), `768px` (tablet), `1024px` (desktop), `1280px` (wide).
- **Mobile-first.** The tool must be usable at the table, one-handed, mid-game.
- **Touch targets:** minimum 44×44px. Small swatches and stripe indicators get an invisible padded hit area; do not shrink the visual block to fit.
- **Collapsing strategy:**
  - Deck grid: 3 columns (≥1024px) → 2 (≥640px) → 1.
  - Tabs stay horizontal and scroll rather than stacking. Tab labels keep their icons; text may drop below 640px.
  - Results table: horizontal scroll inside a bordered container. Never reflow rows into stacked cards — column alignment is the value.
  - Dialogs go full-width (`92vw`) with the same 6px radius.
  - Marketing hero display type steps 64 → 48 → 36px; section padding 84 → 42px.
- **Print** (marking guides, exports): white background, black text, Geist Mono for data, stripe colors preserved. Hide nav, tabs, and buttons.

---

## 9. Agent Prompt Guide

### Quick reference

```
Fonts   heading/longform "adobe-aldine" (serif, 600/400) · body "halyard-micro" (400) · code "Geist Mono"
Load    https://use.typekit.net/gbw6ibc.css
Accent  violet #4d4169 (brand-30) · hover #3a2e55 · tint #f6eeff
Text    #34353c strong · #47474f body · #76767f subtle
Surface #ffffff page/card · #f2f2fc sunken · #c9c9d3 border
Dark    #1e1e25 base · #34353c raised · #f2f2fc text · #cec2f2 brand text
WUBRG   W #EEB41B · U #3995D9 · B #8662D2 · R #E2484B · G #4FAB33  (stripes only)
Radius  3 / 4 / 6 / 8px, pill for tags
Space   3.5 / 7 / 10.5 / 14 / 21 / 28 / 42 / 56 / 84px
Motion  0.1–0.15s ease, color + shadow only
```

### Ready-to-use prompts

**New app screen**
> Build this screen with Web Awesome 3.8.0 components themed by PRISM tokens. White page, white cards with 1px `#c9c9d3` borders and 6px radius, flat until hover. Headings in adobe-aldine 600, all UI text in halyard-micro 14px. Violet `#4d4169` for the single primary action; everything else outlined or plain. Compact 0.875 spacing. No gradients, no shadows except on hover.

**Deck / stripe UI**
> Use the PRISM primitives: 24px deck color indicators, 18px stripe indicators with 3px radius and 1px strokes, 28×10 sleeve slots. Dashed borders mean empty slots or Side B. Deck colors come from the WUBRG palette first (`#EEB41B #3995D9 #8662D2 #E2484B #4FAB33`), then extended colors. Overlay a white 10px bold numeral with a black text-shadow on every fifth slot.

**Marketing section**
> Flat background, either white or `#f6eeff`. adobe-aldine display heading up to 64px with `-0.02em` tracking, halyard-micro body at 16–18px, eyebrow at 14px with `0.05em` tracking. Section padding 84px desktop / 42px mobile. One violet CTA. No hero image, no gradient — the logo and color blocks are the only graphics.

**Copy pass**
> Rewrite in PRISM voice: second person, player as the actor, short sentences, dry humor allowed. No exclamation points, no em-dashes, no hype words, no emoji. Sentence case for body, Title Case for buttons and nav, ALL CAPS for feature names (POOL, CORE, SCRY-Mode). Say "Perfect Fit inner sleeve" and "mark your sleeves", never "penny sleeve" or "mark your cards".

### Reference copy

> "Own one copy of each card. Mark your sleeves to show which decks it belongs to. Fan, pull, play."
> "Stop buying duplicates. Start sharing cards across decks with confidence."
> "Add a new deck later? PRISM shows what changed so you only mark new cards."
> Footer: "Made for Commander players, by Commander players"

---

## Changelog

- **v2.3** — Semantic tokens are now PRISM-authored, not borrowed from the WA CDN theme. The 3.10→3.11 WA upgrade renamed or dropped ~22 token names this codebase relies on (`neutral-text`, `neutral-text-subtle`, `brand-fill`, `surface-2`/`-3`, every state `-text`/`-surface`/`-surface-subtle`, etc.) — every `var()` reference to them was silently resolving to nothing sitewide. `js/layout.js` now defines all of them explicitly, plus a `.wa-dark` remap block, with `neutral-text-subtle` corrected to step 40 (was 50, which §2.6 already forbade for anything but large text) in the same pass. See §2.5.
- **v2.2** — WUBRG accent hexes corrected to the shipped values (`js/modules/processor.js` `DEFAULT_COLORS`): W `#EEB41B`, U `#3995D9`, B `#8662D2`, R `#E2484B`, G `#4FAB33` — more vibrant/higher-pop than the prior draft values, matched to on-screen RGB rather than print-mixed intuition.
- **v2.1** — Typography moved to Adobe Fonts: **halyard-micro** replaces Inter for all UI, **adobe-aldine** replaces Crimson Pro and now carries headings as well as longform. Geist Mono unchanged. Weight roles: body 400, heading 600, longform 400, code 400.
- **v2.0** — 11-step ramps, semantic token layer, WUBRG restricted to identity use.
