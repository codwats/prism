# MPC Stripe Compositor — Plan & Implementation Prompt

Print PRISM stripe/dot marks directly onto MakePlayingCards (MPC) card images, positioned
like the card preview in build.html's results pane / SCRY view, so cards ordered through
[MPC-Autofill](https://github.com/chilli-axe/mpc-autofill) come back pre-marked in the same
spots the physical Spirit Guide jig would place them on sleeves.

Status: **implemented** — `mpc-stripes.html` + `js/features/mpc-stripes.js` (see Part 2
for the design it follows). Part 3's prompt was executed and is kept for reference.
Exact mm offsets still need calibration after test prints (Part 4).

---

## Part 1 — Approach, workflow & decisions

### Why no fork of MPC-Autofill

MPC-Autofill's desktop tool downloads every image in the order XML into a local `cards/`
folder next to the executable — and **skips downloading any file that already exists
there** (the `file_exists()` check in `desktop-tool/src/order.py`; it even supports
explicit `LOCAL_FILE` sources). That means: if we composite stripes onto the images in
`cards/` while keeping the exact same filenames, the desktop tool uploads the striped
versions with **zero changes to MPC-Autofill**.

Forking was considered and rejected — mpc-autofill is a Django backend + Next.js frontend
+ Python/Selenium desktop tool, and a fork would carry merge burden on every upstream
release for something we can do entirely from outside.

### The tool: an unlisted page inside PRISM

A new page in this repo (working name `mpc-stripes.html`) that:

1. Reads the current PRISM straight from localStorage (no JSON round-trip needed; JSON
   import kept as a secondary source).
2. Lets the user pick their MPC-Autofill `cards/` folder via the File System Access API.
3. Matches image filenames to PRISM cards, with a manual-fix table for misses.
4. Shows a live calibration preview (all offsets in mm, adjustable, persisted).
5. Backs up originals to `cards/originals/`, then overwrites each image in place with the
   striped version.

**Legal/brand posture:** the page is client-side only — it never hosts, indexes, links to,
or transmits card imagery (unlike mpcfill.com, whose exposure comes from indexing community
image drives; this tool just draws colored rectangles on files the user already has).
Mitigations anyway: unlisted URL, `<meta name="robots" content="noindex,nofollow">`, no nav
links. And since PRISM has no build step, deploying the page is optional — it runs fine
from `npx http-server` locally, and could later move to a separate repo/domain cheaply
because the module is self-contained.

### End-to-end print workflow (once built)

1. Build the order on mpcfill.com as usual → download the order XML.
2. Run the MPC-Autofill desktop tool once so it downloads all images into `cards/`, then
   quit before the browser-upload phase starts.
3. Open the PRISM compositor page → pick the `cards/` folder → review matches → calibrate
   (first time only) → **Process all**. Originals are backed up to `cards/originals/`;
   striped versions overwrite in place under the same filenames.
4. Re-run the desktop tool with the same XML. Every file already exists locally, so it
   skips downloading and uploads the striped images.

Re-running the compositor is safe: it always composites from `originals/`, never from an
already-striped file (no double-striping).

---

## Part 2 — Implementation design

### New files

- `mpc-stripes.html` — unlisted page. Standard static head block (WA CSS, autoloader,
  fonts, `custom.css` — copy from build.html and keep in sync per CLAUDE.md), plus
  `<meta name="robots" content="noindex,nofollow">`. Calls `initLayout(...)` for the
  shared chrome but is **not** added to the nav in `js/layout.js`.
- `js/features/mpc-stripes.js` — page logic (entry module, imported by the page).
- `css/custom.css` additions — `.mpc-*` classes; reuse `.card-preview-*` patterns where
  sensible.

### Data source

- **Primary:** current PRISM from localStorage via the existing storage module (storage
  supports multiple prisms under `currentPrismId` — default to the current one, but offer
  a prism selector); run `processCards(prism)` (`js/modules/processor.js`) to get per-card
  `stripes`. **Filter out `markType === 'membership'`** — those are deck-filter anchors,
  never rendered.
- **Secondary:** "Import PRISM JSON" file input consuming the `exportToJSON` shape
  (`prism.cards[].stripes`). Prerequisite: add `preferences.stripeStartCorner` to
  `exportToJSON` in `js/modules/export.js` (currently absent) so imported JSON carries
  corner orientation.
- Corner orientation comes from `getPreferences().stripeStartCorner`, applied with the
  same `sideARight` / `topDown` logic as `getCornerConfig()` / `getStripeEdge()` in
  `js/modules/card-preview.js:26-53`.

### Folder access & filename → card matching

- "Choose cards folder" → `window.showDirectoryPicker({ mode: 'readwrite' })`. Chrome/Edge
  only; show a graceful unsupported-browser notice elsewhere.
- Enumerate `.png` / `.jpg` / `.jpeg` files. Derive a card name per file:
  strip extension → strip trailing ` (driveId)` parens (the desktop tool appends these on
  name collisions) → strip bracketed set/artist decorations → strip DFC back-face after
  `//` (reuse the front-face logic already in `card-preview.js`) → `normalizeCardName`
  (`js/modules/parser.js`) → match against the processed-cards list (compare on the
  `normalizedName` field `processCards()` already returns).
- Quantity never matters to compositing: one image file serves all copies of a card
  (including basic lands, which appear in many decks with quantities) — every copy gets
  the same marks because marks are per card name, not per copy.
- Match-review table: auto-matched rows, plus ambiguous/unmatched rows with a manual
  `<wa-select>` of card names and a "skip this image" option. Card backs / tokens
  naturally land in "skip".

### Geometry (the core of the feature)

All constants live in **mm relative to the cut line**, in one exported `MPC_GEOMETRY`
config object, editable in the calibration panel and persisted to localStorage.

- **Image model:** assume MPC full-bleed aspect — 69.09 × 93.98 mm (2.72″ × 3.7″); cut
  size 63 × 88 mm; bleed ≈ **3.05 mm horizontal / 2.99 mm vertical per side**. Compute
  `pxPerMm = imageWidth / 69.09` per image (source resolutions vary); warn when an image's
  aspect ratio deviates > ~2% from full-bleed.
- **Slot Y:** `y = cutTopPx + (FIRST_SLOT_OFFSET_MM + slotIndex * SLOT_PITCH_MM) * pxPerMm`
  where `cutTopPx = VERTICAL_BLEED_MM * pxPerMm` (the y of the top cut line),
  flipped when `topDown` is false. Defaults derived from the preview's proportions
  (preview: 340 px ↔ 88 mm ⇒ `STRIPE_START_Y` 28 px ≈ **7.25 mm**, 12 px pitch ≈
  **3.1 mm**) — these are starting points; **calibrate against the Spirit Guide after a
  test print**.
- **Stripe X:** drawn **from the image edge (x = 0 or x = imageWidth), through the bleed,
  extending `STRIPE_VISIBLE_MM` (default ~4 mm) past the cut line** onto the visible card
  face — i.e., the line goes over the bleed and onto the visible part, so it survives any
  cut-position variance. Thickness default **1.3 mm** (preview: 5 px).
- **Dots:** same slot Y as the group's Side A position; inset from the edge
  `DOT_INSET_MM + localIndex * DOT_SPACING_MM`; diameter default ~1.6 mm. `localIndex` is
  computed at render time per `groupId` exactly like `card-preview.js:95-118` —
  `dotIndex` is never stored.
- **Side A/B edge selection:** identical to `getStripeEdge` (slots 1–24 on the primary
  edge, 25–48 on the opposite edge, corner preference decides primary edge + direction).
  Factor `getStripeEdge` and `getCornerConfig` into small exported helpers in
  `card-preview.js` rather than duplicating them.

### Preview & calibration UI

- Live canvas preview of one selected matched image with marks, plus optional overlay
  guides: cut line, bleed box, slot ruler numbers (mirror `appendRulerGuides` anchors:
  5, 10, 15, 20, 29, 34, 39, 44).
- Calibration inputs (mm, step 0.05): first-slot offset, pitch, stripe thickness, visible
  extent, dot diameter/inset/spacing. "Reset to defaults" button.
- Calibration procedure note in the UI: process ONE test card, order a cheap test print,
  hold it against the Spirit Guide, adjust the constants, reprocess.

### Processing pipeline

For each matched file:

1. If `originals/<name>` exists, read source bytes from there (**re-run safety — never
   double-stripe**); otherwise copy the current file's bytes into `originals/` first.
2. `createImageBitmap(file, { imageOrientation: 'from-image' })` → canvas/OffscreenCanvas
   at native resolution → `drawImage` → draw the card's marks. Both edges (Side A and
   Side B) go on the **front image only**; DFC back images are untouched in v1.
3. Encode preserving the original extension (`image/png`, or `image/jpeg` at quality
   ≈ 0.95) → `FileSystemFileHandle.createWritable()` → overwrite in place under the
   **same filename** (required so the desktop tool's exists-check picks it up).
4. Progress bar + per-file status; final summary with counts (striped / skipped /
   unmatched / errors).

No CORS/tainted-canvas issues — all inputs are local files.

Note: the MPC-Autofill desktop tool downscales images above 800 DPI (MPC's max print
resolution) at upload time by default (`--max-dpi` flag). That scaling is uniform, so
composited marks keep their relative positions — no action needed, just don't be surprised
that very-high-resolution sources get resized during upload.

### Reuse pointers

- `js/modules/processor.js` — `processCards`, `MAX_STRIPE_SLOTS`, `formatSlotLabel`,
  `remapSlot` (the physical 2-edge × 24-row model).
- `js/modules/card-preview.js:15-53, 83-160` — the display geometry to factor out and
  mirror at print scale.
- `js/modules/parser.js` — `normalizeCardName`.
- `js/modules/export.js` — `exportToJSON` shape (lines 130–196), `downloadFile`
  (lines 204–216).
- `js/core/notifications.js` — `showError` / `showSuccess`; `js/core/utils.js` — `debugLog`.
- Conventions: `<wa-dialog>` open/close via `setAttribute('open','')` /
  `removeAttribute('open')`; static WA head block in the page `<head>`; `debugLog` instead
  of bare `console.log`.

### Out of scope for v1 (noted follow-ups)

- Marks on DFC back-face images.
- Auto-downloading images from the mpcfill XML in-browser (Google Drive CORS; the desktop
  tool already handles downloads).
- Moving the page to a separate repo/domain for brand distance — keep the module
  self-contained so this stays cheap.

---

## Part 3 — Ready-to-paste prompt for the implementation session

Copy everything inside the block below into a fresh Claude Code session opened on the
`codwats/prism` repo.

```text
Implement the MPC Stripe Compositor described in docs/mpc-stripe-compositor-plan.md
(read that file first — it is the spec; Part 2 is the implementation design).

Summary: build an UNLISTED page in this repo (mpc-stripes.html + js/features/mpc-stripes.js
+ .mpc-* CSS in css/custom.css) that composites PRISM stripe/dot marks onto MakePlayingCards
full-bleed card images downloaded by the MPC-Autofill desktop tool, so the printed cards
arrive pre-marked.

Hard requirements:
1. Unlisted: <meta name="robots" content="noindex,nofollow">, NOT added to the nav in
   js/layout.js. Page uses the same static WA head block as build.html and calls initLayout.
2. Data source: current PRISM from localStorage (default currentPrismId, with a selector
   if multiple prisms exist); run processCards(prism) from
   js/modules/processor.js; filter OUT stripes with markType === 'membership'. Also support
   importing a PRISM JSON export as a fallback source — and first add
   preferences.stripeStartCorner to exportToJSON in js/modules/export.js so the export
   carries corner orientation.
3. Folder: window.showDirectoryPicker({ mode: 'readwrite' }) on the MPC-Autofill cards/
   folder (Chrome/Edge; show a friendly notice on unsupported browsers). Enumerate
   .png/.jpg/.jpeg. Match filenames to cards: strip extension, trailing " (driveId)"
   parens, bracketed set/artist decorations, and DFC back-face names after "//" (reuse the
   front-face stripping already in js/modules/card-preview.js), then normalizeCardName from
   js/modules/parser.js, and compare against the normalizedName field processCards()
   returns. One image serves all copies of a card (quantity is irrelevant to compositing).
   Show a match-review table with manual <wa-select> fixes and a per-image "skip".
4. Geometry: one exported MPC_GEOMETRY config, all values in mm relative to the cut line,
   editable in a calibration panel and persisted to localStorage. Image model: MPC full
   bleed 69.09 x 93.98 mm, cut 63 x 88 mm, bleed ~3.05 mm horiz / ~2.99 mm vert per side;
   pxPerMm = imageWidth / 69.09 computed per image; warn if aspect deviates >2%.
   Slot Y: y = cutTopPx + (FIRST_SLOT_OFFSET_MM + slotIndex * SLOT_PITCH_MM) * pxPerMm
   where cutTopPx = VERTICAL_BLEED_MM * pxPerMm, flipped when the corner preference is
   bottom-first. Defaults: FIRST_SLOT_OFFSET_MM 7.25,
   SLOT_PITCH_MM 3.1, thickness 1.3 mm (these mirror the 244x340 preview in
   card-preview.js and WILL be recalibrated after test prints — keep them in one place).
   Stripe X: draw from the image edge THROUGH the bleed and STRIPE_VISIBLE_MM (default
   4 mm) past the cut line onto the visible face. Dots: same Y as the group's Side A slot,
   inset DOT_INSET_MM + localIndex * DOT_SPACING_MM from the edge, ~1.6 mm diameter,
   localIndex computed per groupId at render time exactly like card-preview.js:95-118.
   Edge selection (Side A slots 1-24 on the primary edge, Side B 25-48 opposite, honoring
   preferences.stripeStartCorner): refactor getStripeEdge + getCornerConfig in
   js/modules/card-preview.js into exported helpers and use them — do not duplicate.
5. Preview/calibration UI: live canvas preview of a selected matched image with marks and
   toggleable guides (cut line, bleed box, ruler numbers at slots 5,10,15,20,29,34,39,44),
   mm inputs (step 0.05) for every MPC_GEOMETRY value, and a reset-to-defaults button.
6. Processing ("Process all"): for each matched file — if originals/<name> exists in the
   picked folder, composite from THAT file (re-run safety: never double-stripe); otherwise
   copy the original bytes into originals/ first. Then
   createImageBitmap(file, { imageOrientation: 'from-image' }) -> canvas at native
   resolution -> drawImage -> draw marks (both edges on the front image only; DFC backs
   untouched) -> encode keeping the original extension (jpeg quality ~0.95) -> overwrite in
   place via createWritable() under the SAME filename (the MPC-Autofill desktop tool skips
   downloading files that already exist, so same-name overwrite is what makes it upload the
   striped versions). Progress bar + summary (striped/skipped/unmatched/errors).
7. Follow repo conventions (see CLAUDE.md): no build step, ES modules, wa-dialog via
   setAttribute('open',''), debugLog not console.log, showError/showSuccess from
   js/core/notifications.js.

Verify before pushing:
- npx http-server -p 3456, open /mpc-stripes.html in Chrome at >=1280px.
- Seed a PRISM with 2+ standalone decks, one stripes-style split group, one dots-style
  split group, and a non-default stripeStartCorner; confirm the page preview matches the
  build.html results-pane hover preview for the same card (same edges, same slot order,
  dots on the correct side of the stripe).
- Test against a folder of sample full-bleed images (include 816x1110 and one odd
  resolution): originals/ gets created, files are overwritten in place, marks cross the
  cut line by STRIPE_VISIBLE_MM, and a second "Process all" run produces identical output
  (no double-striping).
- Confirm build.html still works (card-preview.js refactor must not change its behavior).
```

---

## Part 4 — What you (the human) do

### One-time setup

1. **No fork. No new repo.** Everything lives in `codwats/prism` — already implemented
   on this branch.
2. Review + merge the branch, or just run it locally (`npx http-server -p 3456` →
   `/mpc-stripes.html`) if you'd rather not deploy the page to prismmtg.com.

### Calibration (first print only)

1. Run the workflow below for a single cheap test card (or a small test order).
2. Hold the printed card against the Spirit Guide and note how far off the marks are.
3. Adjust the mm values in the page's calibration panel (they persist), reprocess, reprint
   if needed. After this, the constants are set — consider baking the final numbers into
   `MPC_GEOMETRY`'s defaults in a follow-up commit.

### Every print order

1. Build the order on mpcfill.com → download the XML.
2. Run the MPC-Autofill desktop tool so it downloads images into `cards/`, then quit
   before the upload phase.
3. Open the compositor page → pick `cards/` → fix any unmatched filenames → Process all.
4. Re-run the desktop tool with the same XML — it skips re-downloading (files exist) and
   uploads the striped images.
