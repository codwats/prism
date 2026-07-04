// MPC Stripe Compositor — composites PRISM stripe/dot marks onto MakePlayingCards
// full-bleed card images downloaded by the MPC-Autofill desktop tool.
//
// Workflow: the desktop tool downloads order images into a local cards/ folder and
// skips downloading any file that already exists there. We back each original up to
// cards/originals/, overwrite the image in place (same filename) with the marks
// composited on, and the desktop tool then uploads the striped versions untouched.
// Re-runs always composite from originals/ so images are never double-striped.
//
// All geometry constants are millimetres relative to the cut line, mirroring the
// display-scale preview in card-preview.js. Defaults derive from that preview's
// proportions and are meant to be calibrated against the Spirit Guide after a
// test print (values persist in localStorage until then).

import { getAllPrisms, getCurrentPrism, getPreferences } from '../modules/storage.js';
import { processCards } from '../modules/processor.js';
import { normalizeCardName } from '../modules/parser.js';
import { cornerToConfig, getStripeEdge, RULER_ANCHORS } from '../modules/card-preview.js';
import { showError, showSuccess } from '../core/notifications.js';
import { debugLog, escapeHtml, slotNumberLabel, countVisibleMarks } from '../core/utils.js';

// ============================================
// PHYSICAL MODEL (MakePlayingCards full bleed)
// ============================================

const CARD_FULL_WIDTH_MM = 69.09;   // 2.72" MPC full-bleed width
const CARD_FULL_HEIGHT_MM = 93.98;  // 3.7"  MPC full-bleed height
const CARD_CUT_WIDTH_MM = 63;       // 2.48" cut card width
const CARD_CUT_HEIGHT_MM = 88;      // 3.46" cut card height
const BLEED_X_MM = (CARD_FULL_WIDTH_MM - CARD_CUT_WIDTH_MM) / 2;   // ≈3.05
const BLEED_Y_MM = (CARD_FULL_HEIGHT_MM - CARD_CUT_HEIGHT_MM) / 2; // ≈2.99
const FULL_BLEED_ASPECT = CARD_FULL_HEIGHT_MM / CARD_FULL_WIDTH_MM;
const ASPECT_TOLERANCE = 0.02; // warn when an image deviates >2% from full-bleed aspect
const SLOTS_PER_SIDE = 24;

// Calibration defaults, mm relative to the cut line. Derived from the 244×340
// display preview (340px ↔ 88mm): STRIPE_START_Y 28px ≈ 7.25mm, 12px pitch ≈ 3.1mm,
// 5px thickness ≈ 1.3mm, dot insetBase 28px ≈ 7.2mm, 10px spacing ≈ 2.6mm.
export const MPC_GEOMETRY_DEFAULTS = Object.freeze({
  firstSlotOffsetMm: 7.25,  // top cut line → top edge of slot 1's stripe
  slotPitchMm: 3.1,         // vertical distance between consecutive slots
  stripeThicknessMm: 1.3,   // stripe height
  stripeVisibleMm: 4,       // stripe extent past the cut line onto the visible face
  dotDiameterMm: 1.6,       // dot-variant dot diameter
  dotInsetMm: 7.2,          // cut line → first dot centre (inward)
  dotSpacingMm: 2.6,        // spacing between multiple dots in a group
});

const GEOMETRY_STORAGE_KEY = 'prism_mpc_geometry';
const IMAGE_FILE_RE = /\.(png|jpe?g)$/i;
const ORIGINALS_DIR = 'originals';

// ============================================
// STATE
// ============================================

const state = {
  sourceLabel: '',      // human description of the active source
  corner: 'top-right',  // stripeStartCorner in effect for the active source
  cards: [],            // [{ name, normalizedName, stripes }] with membership filtered out
  cardsByNorm: new Map(),
  dirHandle: null,
  entries: [],          // [{ name, handle, guessedName, matchNorm, skipped }]
  geometry: { ...MPC_GEOMETRY_DEFAULTS },
  previewName: null,    // filename currently shown in the preview
  processing: false,
};

let els = null;

// ============================================
// GEOMETRY PERSISTENCE
// ============================================

function loadGeometry() {
  try {
    const raw = localStorage.getItem(GEOMETRY_STORAGE_KEY);
    const saved = raw ? JSON.parse(raw) : {};
    const geometry = { ...MPC_GEOMETRY_DEFAULTS };
    for (const key of Object.keys(MPC_GEOMETRY_DEFAULTS)) {
      const value = Number(saved[key]);
      if (Number.isFinite(value) && value >= 0) geometry[key] = value;
    }
    return geometry;
  } catch (err) {
    console.warn('Failed to load MPC geometry, using defaults:', err);
    return { ...MPC_GEOMETRY_DEFAULTS };
  }
}

function saveGeometry() {
  localStorage.setItem(GEOMETRY_STORAGE_KEY, JSON.stringify(state.geometry));
}

// ============================================
// CARD SOURCE (local prism or imported JSON)
// ============================================

// Normalize either source into [{ name, normalizedName, stripes }] with
// invisible 'membership' anchors removed (they carry no physical mark).
function setCards(cards, sourceLabel, corner) {
  state.cards = cards;
  state.sourceLabel = sourceLabel;
  state.corner = corner;
  state.cardsByNorm = new Map(cards.map(c => [c.normalizedName, c]));
  rematchEntries();
  renderSourceSummary();
  refreshEntryViews();
}

// Re-render everything derived from entries/matches after they change
function refreshEntryViews() {
  renderMatchTable();
  renderPreviewControls();
  updateProcessButton();
  drawPreview();
}

function loadPrismSource(prism) {
  if (!prism) return;
  const processed = processCards(prism);
  const cards = processed.map(card => ({
    name: card.name,
    normalizedName: card.normalizedName || normalizeCardName(card.name),
    stripes: card.stripes.filter(s => s.markType !== 'membership'),
  }));
  const corner = getPreferences().stripeStartCorner || 'top-right';
  setCards(cards, `PRISM "${prism.name}"`, corner);
  debugLog('MPC: loaded prism source', prism.name, cards.length, 'cards');
}

function loadJsonSource(data, filename) {
  const prism = data?.prism;
  if (!prism || !Array.isArray(prism.cards)) {
    throw new Error('Not a PRISM JSON export (missing prism.cards)');
  }
  const cards = prism.cards.map(card => ({
    name: card.name,
    normalizedName: normalizeCardName(card.name),
    stripes: card.stripes || [],
  }));
  // Exports carry the corner preference; older exports fall back to the local one.
  const corner = prism.preferences?.stripeStartCorner
    || getPreferences().stripeStartCorner || 'top-right';
  setCards(cards, `Imported "${filename}" (${prism.name || 'unnamed'})`, corner);
  debugLog('MPC: loaded JSON source', filename, cards.length, 'cards');
}

// ============================================
// FILENAME → CARD MATCHING
// ============================================

// "Lightning Bolt (1AbC...).png" → "Lightning Bolt"
// Strips extension, [set]/{artist} decorations, and trailing (…) groups —
// the desktop tool appends "(driveId)" on filename collisions, and community
// drives often suffix set/artist in parens. MTG card names contain none of these.
function cardNameFromFilename(filename) {
  let base = filename.replace(IMAGE_FILE_RE, '');
  base = base.replace(/\s*\[[^\]]*\]/g, ' ').replace(/\s*\{[^}]*\}/g, ' ');
  while (/\s*\([^()]*\)\s*$/.test(base)) {
    base = base.replace(/\s*\([^()]*\)\s*$/, '');
  }
  return base.replace(/\s+/g, ' ').trim();
}

function rematchEntries() {
  for (const entry of state.entries) {
    // Preserve manual assignments that still resolve against the new source
    if (entry.matchNorm && state.cardsByNorm.has(entry.matchNorm)) continue;
    const norm = normalizeCardName(entry.guessedName);
    entry.matchNorm = state.cardsByNorm.has(norm) ? norm : null;
  }
}

async function scanFolder(dirHandle) {
  const entries = [];
  for await (const [name, handle] of dirHandle.entries()) {
    if (handle.kind !== 'file' || !IMAGE_FILE_RE.test(name)) continue;
    const guessedName = cardNameFromFilename(name);
    const norm = normalizeCardName(guessedName);
    entries.push({
      name,
      handle,
      guessedName,
      matchNorm: state.cardsByNorm.has(norm) ? norm : null,
      skipped: false,
    });
  }
  entries.sort((a, b) => a.name.localeCompare(b.name));
  return entries;
}

function matchedEntries() {
  return state.entries.filter(e => !e.skipped && e.matchNorm);
}

// ============================================
// MARK RENDERING (canvas, native image resolution)
// ============================================

// Per-image pixel layout: everything derives from pxPerMm so any source
// resolution works. Width drives the scale; aspect deviations get flagged.
function computeLayout(imgW, imgH) {
  const pxPerMm = imgW / CARD_FULL_WIDTH_MM;
  const aspectOff =
    Math.abs(imgH / imgW - FULL_BLEED_ASPECT) / FULL_BLEED_ASPECT > ASPECT_TOLERANCE;
  return {
    pxPerMm,
    cutLeft: BLEED_X_MM * pxPerMm,
    cutRight: imgW - BLEED_X_MM * pxPerMm,
    cutTop: BLEED_Y_MM * pxPerMm,
    cutBottom: imgH - BLEED_Y_MM * pxPerMm,
    aspectOff,
  };
}

function slotIndex(position) {
  return position <= SLOTS_PER_SIDE ? position - 1 : position - SLOTS_PER_SIDE - 1;
}

// Y of a slot's stripe top edge. topDown mirrors around the card centre exactly
// like the physical jig being flipped (slot 1 measured from the bottom cut line).
function slotTopY(position, layout, geometry, topDown) {
  const offsetMm = geometry.firstSlotOffsetMm + slotIndex(position) * geometry.slotPitchMm;
  return topDown
    ? layout.cutTop + offsetMm * layout.pxPerMm
    : layout.cutBottom - offsetMm * layout.pxPerMm - geometry.stripeThicknessMm * layout.pxPerMm;
}

// Draw a card's marks onto a full-bleed image context. Returns the layout so
// callers can surface aspect warnings.
function drawMarks(ctx, imgW, imgH, stripes, geometry, cornerConfig) {
  const layout = computeLayout(imgW, imgH);
  const { sideARight, topDown } = cornerConfig;
  const thicknessPx = geometry.stripeThicknessMm * layout.pxPerMm;
  // Stripes run from the image edge, through the bleed, onto the visible face.
  const stripeLenPx = (BLEED_X_MM + geometry.stripeVisibleMm) * layout.pxPerMm;

  // Dot order is computed at render time per group (dotIndex is never stored),
  // matching createStripeOverlay in card-preview.js.
  const groupDotCounters = new Map();
  for (const stripe of stripes) {
    if (stripe.markType === 'dot' && !groupDotCounters.has(stripe.groupId)) {
      groupDotCounters.set(stripe.groupId, 0);
    }
  }

  for (const stripe of stripes) {
    if (stripe.markType === 'membership') continue;
    const { onRight } = getStripeEdge(stripe.position, sideARight);
    const yTop = slotTopY(stripe.position, layout, geometry, topDown);

    if (stripe.markType === 'dot') {
      const localIndex = groupDotCounters.get(stripe.groupId);
      groupDotCounters.set(stripe.groupId, localIndex + 1);
      const insetMm = geometry.dotInsetMm + localIndex * geometry.dotSpacingMm;
      const cx = onRight
        ? layout.cutRight - insetMm * layout.pxPerMm
        : layout.cutLeft + insetMm * layout.pxPerMm;
      const cy = yTop + thicknessPx / 2;
      ctx.beginPath();
      ctx.arc(cx, cy, (geometry.dotDiameterMm * layout.pxPerMm) / 2, 0, Math.PI * 2);
      ctx.fillStyle = stripe.color;
      ctx.fill();
      continue;
    }

    ctx.fillStyle = stripe.color;
    ctx.fillRect(onRight ? imgW - stripeLenPx : 0, yTop, stripeLenPx, thicknessPx);
  }

  return layout;
}

// Preview-only overlay: cut line + slot ruler. Never part of processed output.
function drawGuides(ctx, imgW, imgH, geometry, cornerConfig, { cutLine, ruler }) {
  const layout = computeLayout(imgW, imgH);
  const { sideARight, topDown } = cornerConfig;

  if (cutLine) {
    ctx.save();
    ctx.strokeStyle = 'rgba(255, 0, 128, 0.9)';
    ctx.lineWidth = Math.max(1, layout.pxPerMm * 0.15);
    ctx.setLineDash([layout.pxPerMm * 2, layout.pxPerMm * 1.5]);
    ctx.strokeRect(
      layout.cutLeft, layout.cutTop,
      layout.cutRight - layout.cutLeft, layout.cutBottom - layout.cutTop
    );
    ctx.restore();
  }

  if (ruler) {
    ctx.save();
    const tickLenPx = 2.5 * layout.pxPerMm;
    const fontPx = Math.max(10, 2.4 * layout.pxPerMm);
    ctx.font = `700 ${fontPx}px system-ui, sans-serif`;
    ctx.textBaseline = 'middle';
    for (const pos of RULER_ANCHORS) {
      const { onRight } = getStripeEdge(pos, sideARight);
      const y = slotTopY(pos, layout, geometry, topDown)
        + (geometry.stripeThicknessMm * layout.pxPerMm) / 2;
      ctx.strokeStyle = 'rgba(255, 255, 255, 0.9)';
      ctx.lineWidth = Math.max(1, layout.pxPerMm * 0.1);
      ctx.beginPath();
      ctx.moveTo(onRight ? imgW - tickLenPx : 0, y);
      ctx.lineTo(onRight ? imgW : tickLenPx, y);
      ctx.stroke();

      const label = slotNumberLabel(pos);
      ctx.fillStyle = 'rgba(255, 255, 255, 0.95)';
      ctx.shadowColor = 'rgba(0, 0, 0, 0.9)';
      ctx.shadowBlur = 3;
      ctx.textAlign = onRight ? 'right' : 'left';
      const inset = tickLenPx + 1.2 * layout.pxPerMm;
      ctx.fillText(label, onRight ? imgW - inset : inset, y);
    }
    ctx.restore();
  }
}

// ============================================
// FILE ACCESS
// ============================================

async function getOriginalsDir(create) {
  return state.dirHandle.getDirectoryHandle(ORIGINALS_DIR, { create });
}

// Clean source bytes for an entry: the backup in originals/ when present,
// otherwise the file itself (which is only clean before its first processing).
async function readCleanFile(entry) {
  try {
    const dir = await getOriginalsDir(false);
    const backup = await dir.getFileHandle(entry.name);
    return await backup.getFile();
  } catch {
    return entry.handle.getFile();
  }
}

// Same, but ensures the backup exists first — used by processing so the
// original bytes are safe before we overwrite the file in place. Only a
// missing backup may trigger the create-and-copy path: any other failure
// must propagate rather than overwrite a valid backup with possibly
// already-striped bytes.
async function backupAndReadCleanFile(entry, originalsDir) {
  let backup = null;
  try {
    backup = await originalsDir.getFileHandle(entry.name);
  } catch (err) {
    if (err.name !== 'NotFoundError') throw err;
  }
  if (backup) return backup.getFile();

  const file = await entry.handle.getFile();
  const created = await originalsDir.getFileHandle(entry.name, { create: true });
  const writable = await created.createWritable();
  await writable.write(await file.arrayBuffer());
  await writable.close();
  return file;
}

async function compositeEntry(entry, originalsDir, cornerConfig) {
  const card = state.cardsByNorm.get(entry.matchNorm);
  const file = await backupAndReadCleanFile(entry, originalsDir);
  const bitmap = await createImageBitmap(file, { imageOrientation: 'from-image' });

  const canvas = document.createElement('canvas');
  canvas.width = bitmap.width;
  canvas.height = bitmap.height;
  const ctx = canvas.getContext('2d');
  ctx.drawImage(bitmap, 0, 0);
  const layout = drawMarks(ctx, bitmap.width, bitmap.height, card.stripes, state.geometry, cornerConfig);
  bitmap.close();

  const type = /\.png$/i.test(entry.name) ? 'image/png' : 'image/jpeg';
  const blob = await new Promise((resolve, reject) => {
    canvas.toBlob(b => (b ? resolve(b) : reject(new Error('Image encoding failed'))), type, 0.95);
  });

  // Same filename is load-bearing: the desktop tool skips downloading files
  // that already exist, which is what makes it upload the striped versions.
  const writable = await entry.handle.createWritable();
  await writable.write(blob);
  await writable.close();
  return layout.aspectOff;
}

// ============================================
// UI — rendering
// ============================================

function getElements() {
  const byId = id => document.getElementById(id);
  return {
    unsupported: byId('mpc-unsupported'),
    prismSelect: byId('mpc-prism-select'),
    importJsonBtn: byId('btn-mpc-import-json'),
    jsonFileInput: byId('mpc-json-file'),
    sourceSummary: byId('mpc-source-summary'),
    chooseFolderBtn: byId('btn-mpc-choose-folder'),
    folderSummary: byId('mpc-folder-summary'),
    matchSection: byId('mpc-match-section'),
    matchSummary: byId('mpc-match-summary'),
    matchTbody: byId('mpc-match-tbody'),
    previewSection: byId('mpc-preview-section'),
    previewSelect: byId('mpc-preview-select'),
    previewCanvas: byId('mpc-preview-canvas'),
    previewNote: byId('mpc-preview-note'),
    guideCut: byId('mpc-guide-cut'),
    guideRuler: byId('mpc-guide-ruler'),
    geomInputs: Array.from(document.querySelectorAll('.mpc-geom-input')),
    geomResetBtn: byId('btn-mpc-geom-reset'),
    processSection: byId('mpc-process-section'),
    processBtn: byId('btn-mpc-process'),
    progress: byId('mpc-progress'),
    processLog: byId('mpc-process-log'),
  };
}

// Web Awesome inputs store values in shadow DOM; fall back when .value is empty
function readInputValue(el) {
  const direct = el.value;
  if (direct !== undefined && direct !== null && direct !== '') return direct;
  return el.shadowRoot?.querySelector('input, select')?.value ?? '';
}

// Set a WA form control's value whether or not the element has upgraded yet.
// Pre-upgrade, a property assignment would shadow the class accessor, so write
// the attribute (initial value); post-upgrade the property is what updates UI.
function setInputValue(el, value) {
  el.setAttribute('value', String(value));
  if (customElements.get(el.localName)) el.value = String(value);
}

function renderSourceSummary() {
  const cardCount = state.cards.length;
  const markCount = state.cards.reduce((n, c) => n + countVisibleMarks(c.stripes), 0);
  els.sourceSummary.textContent = cardCount
    ? `${state.sourceLabel} — ${cardCount} unique cards, ${markCount} marks, corner: ${state.corner}`
    : 'No decks in this PRISM yet — add decks in the builder first.';
}

function renderPrismSelect() {
  const prisms = getAllPrisms();
  const current = getCurrentPrism();
  els.prismSelect.innerHTML = prisms
    .map(p => `<wa-option value="${escapeHtml(p.id)}">${escapeHtml(p.name)} (${(p.decks || []).length} decks)</wa-option>`)
    .join('');
  const selected = current || prisms[0];
  if (selected) setInputValue(els.prismSelect, selected.id);
}

function renderMatchTable() {
  if (state.entries.length === 0) {
    els.matchSection.hidden = true;
    return;
  }
  els.matchSection.hidden = false;

  const matched = matchedEntries().length;
  const skipped = state.entries.filter(e => e.skipped).length;
  const unmatched = state.entries.length - matched - skipped;
  els.matchSummary.textContent =
    `${state.entries.length} images — ${matched} matched, ${unmatched} unmatched, ${skipped} skipped`;

  const cardOptions = state.cards
    .slice()
    .sort((a, b) => a.name.localeCompare(b.name))
    .map(c => `<option value="${escapeHtml(c.normalizedName)}">${escapeHtml(c.name)}</option>`)
    .join('');

  els.matchTbody.innerHTML = state.entries.map((entry, i) => {
    const card = entry.matchNorm ? state.cardsByNorm.get(entry.matchNorm) : null;
    let matchCell;
    if (card) {
      matchCell = `<span class="mpc-match-ok">${escapeHtml(card.name)}</span>
        <span class="mpc-match-marks">${countVisibleMarks(card.stripes)} marks</span>`;
    } else {
      // Native select: unmatched rows can number in the dozens and each carries
      // the full card list — wa-select at that scale is too heavy.
      matchCell = `<select class="mpc-match-select" data-index="${i}">
        <option value="">— select card —</option>${cardOptions}</select>`;
    }
    return `<tr class="${entry.skipped ? 'mpc-row-skipped' : card ? '' : 'mpc-row-unmatched'}">
      <td class="mpc-filename">${escapeHtml(entry.name)}</td>
      <td>${matchCell}</td>
      <td><wa-checkbox class="mpc-skip-checkbox" data-index="${i}" ${entry.skipped ? 'checked' : ''}>Skip</wa-checkbox></td>
    </tr>`;
  }).join('');
}

function renderPreviewControls() {
  const matched = matchedEntries();
  els.previewSection.hidden = matched.length === 0;
  els.processSection.hidden = matched.length === 0;
  if (matched.length === 0) return;

  if (!matched.some(e => e.name === state.previewName)) {
    state.previewName = matched[0].name;
  }
  // Option values must not contain spaces (filenames do) — use entry indices
  els.previewSelect.innerHTML = matched
    .map(e => `<wa-option value="${state.entries.indexOf(e)}">${escapeHtml(e.name)}</wa-option>`)
    .join('');
  const previewEntry = matched.find(e => e.name === state.previewName);
  setInputValue(els.previewSelect, state.entries.indexOf(previewEntry));
}

function renderGeometryInputs() {
  for (const input of els.geomInputs) {
    const key = input.dataset.key;
    if (key in state.geometry) setInputValue(input, state.geometry[key]);
  }
}

function updateProcessButton() {
  // Attribute toggle works before and after the WA element upgrades
  els.processBtn.toggleAttribute('disabled', state.processing || matchedEntries().length === 0);
}

let previewToken = 0;
async function drawPreview() {
  const entry = state.entries.find(e => e.name === state.previewName && !e.skipped && e.matchNorm);
  if (!entry || !state.dirHandle) return;
  const token = ++previewToken;

  try {
    const file = await readCleanFile(entry);
    const bitmap = await createImageBitmap(file, { imageOrientation: 'from-image' });
    if (token !== previewToken) { bitmap.close(); return; }

    const canvas = els.previewCanvas;
    canvas.width = bitmap.width;
    canvas.height = bitmap.height;
    const ctx = canvas.getContext('2d');
    ctx.drawImage(bitmap, 0, 0);
    bitmap.close();

    const card = state.cardsByNorm.get(entry.matchNorm);
    const cornerConfig = cornerToConfig(state.corner);
    const layout = drawMarks(ctx, canvas.width, canvas.height, card.stripes, state.geometry, cornerConfig);
    // Fall back to the attribute while the WA switch hasn't upgraded yet
    const isOn = el => el.checked ?? el.hasAttribute('checked');
    drawGuides(ctx, canvas.width, canvas.height, state.geometry, cornerConfig, {
      cutLine: !!isOn(els.guideCut),
      ruler: !!isOn(els.guideRuler),
    });

    els.previewNote.textContent = layout.aspectOff
      ? `⚠ ${canvas.width}×${canvas.height}px — aspect ratio deviates from MPC full-bleed (2.72″×3.7″); mark placement may be off for this image.`
      : `${canvas.width}×${canvas.height}px · ${(canvas.width / CARD_FULL_WIDTH_MM * 25.4).toFixed(0)} DPI · guides are preview-only`;
  } catch (err) {
    console.error('Preview render failed:', err);
    els.previewNote.textContent = `Preview failed: ${err.message}`;
  }
}

// ============================================
// UI — event handlers
// ============================================

async function handleChooseFolder() {
  try {
    state.dirHandle = await window.showDirectoryPicker({ mode: 'readwrite' });
  } catch (err) {
    if (err.name !== 'AbortError') showError(`Could not open folder: ${err.message}`);
    return;
  }

  try {
    state.entries = await scanFolder(state.dirHandle);
  } catch (err) {
    showError(`Could not read folder: ${err.message}`);
    return;
  }

  els.folderSummary.textContent = state.entries.length
    ? `"${state.dirHandle.name}" — ${state.entries.length} image files found`
    : `"${state.dirHandle.name}" — no .png/.jpg images found in this folder`;
  debugLog('MPC: scanned folder', state.dirHandle.name, state.entries.length, 'images');

  refreshEntryViews();
}

function handleMatchTableInput(event) {
  const select = event.target.closest('.mpc-match-select');
  if (!select) return;
  const entry = state.entries[Number(select.dataset.index)];
  if (!entry) return;
  entry.matchNorm = select.value || null;
  refreshEntryViews();
}

function handleSkipToggle(event) {
  const checkbox = event.target.closest('.mpc-skip-checkbox');
  if (!checkbox) return;
  const entry = state.entries[Number(checkbox.dataset.index)];
  if (!entry) return;
  entry.skipped = !!checkbox.checked;
  refreshEntryViews();
}

function handleGeometryInput(event) {
  const input = event.target.closest('.mpc-geom-input');
  if (!input) return;
  const key = input.dataset.key;
  const value = parseFloat(readInputValue(input));
  if (!(key in state.geometry) || !Number.isFinite(value) || value < 0) return;
  state.geometry[key] = value;
  saveGeometry();
  drawPreview();
}

function handleGeometryReset() {
  state.geometry = { ...MPC_GEOMETRY_DEFAULTS };
  saveGeometry();
  renderGeometryInputs();
  drawPreview();
  showSuccess('Calibration reset to defaults');
}

async function handleProcessAll() {
  const entries = matchedEntries();
  if (entries.length === 0 || state.processing) return;

  state.processing = true;
  updateProcessButton();
  els.progress.hidden = false;
  els.progress.setAttribute('value', '0');
  els.processLog.innerHTML = '';

  const cornerConfig = cornerToConfig(state.corner);
  const log = [];
  let done = 0;
  let failed = 0;
  let aspectWarnings = 0;

  let originalsDir;
  try {
    originalsDir = await getOriginalsDir(true);
  } catch (err) {
    showError(`Could not create originals/ backup folder: ${err.message}`);
    state.processing = false;
    updateProcessButton();
    els.progress.hidden = true;
    return;
  }

  for (let i = 0; i < entries.length; i++) {
    const entry = entries[i];
    try {
      const aspectOff = await compositeEntry(entry, originalsDir, cornerConfig);
      done++;
      if (aspectOff) {
        aspectWarnings++;
        log.push(`<li class="mpc-log-warn">⚠ ${escapeHtml(entry.name)} — striped, but aspect ratio deviates from MPC full-bleed</li>`);
      }
    } catch (err) {
      failed++;
      console.error(`Failed to process ${entry.name}:`, err);
      log.push(`<li class="mpc-log-error">✕ ${escapeHtml(entry.name)} — ${escapeHtml(err.message)}</li>`);
    }
    els.progress.setAttribute('value', String(Math.round(((i + 1) / entries.length) * 100)));
    // Yield so the progress bar actually repaints between images
    await new Promise(resolve => setTimeout(resolve, 0));
  }

  const skipped = state.entries.filter(e => e.skipped).length;
  const unmatched = state.entries.filter(e => !e.skipped && !e.matchNorm).length;
  log.unshift(`<li class="mpc-log-summary"><strong>${done} striped</strong>${failed ? `, ${failed} failed` : ''}${aspectWarnings ? `, ${aspectWarnings} aspect warnings` : ''}, ${unmatched} unmatched, ${skipped} skipped. Originals backed up to ${ORIGINALS_DIR}/.</li>`);
  els.processLog.innerHTML = log.join('');

  state.processing = false;
  updateProcessButton();
  if (failed === 0) {
    showSuccess(`${done} images striped — run the MPC-Autofill desktop tool to upload them`);
  } else {
    showError(`${failed} of ${entries.length} images failed — see the log below the progress bar`);
  }
  drawPreview();
}

// ============================================
// INIT
// ============================================

export function initMpcStripes() {
  els = getElements();
  state.geometry = loadGeometry();

  if (!window.showDirectoryPicker) {
    els.unsupported.hidden = false;
    els.chooseFolderBtn.setAttribute('disabled', '');
  }

  renderPrismSelect();
  renderGeometryInputs();

  const current = getCurrentPrism() || getAllPrisms()[0] || null;
  if (current) loadPrismSource(current);
  else els.sourceSummary.textContent = 'No PRISM found — build one first, or import a PRISM JSON export.';

  // wa-select emits 'wa-change'; native/other WA components emit 'change'.
  // Listening to both keeps this robust — handlers are idempotent re-renders.
  const onPrismChange = () => {
    const prisms = getAllPrisms();
    const selected = prisms.find(p => p.id === readInputValue(els.prismSelect));
    if (selected) loadPrismSource(selected);
  };
  els.prismSelect.addEventListener('change', onPrismChange);
  els.prismSelect.addEventListener('wa-change', onPrismChange);

  els.importJsonBtn.addEventListener('click', () => els.jsonFileInput.click());
  els.jsonFileInput.addEventListener('change', () => {
    const file = els.jsonFileInput.files?.[0];
    if (!file) return;
    const reader = new FileReader();
    reader.onload = () => {
      try {
        loadJsonSource(JSON.parse(reader.result), file.name);
        showSuccess(`Imported ${file.name}`);
      } catch (err) {
        showError(`Import failed: ${err.message}`);
      }
    };
    reader.readAsText(file);
    els.jsonFileInput.value = '';
  });

  els.chooseFolderBtn.addEventListener('click', handleChooseFolder);
  els.matchTbody.addEventListener('change', handleMatchTableInput);   // native <select>
  els.matchTbody.addEventListener('change', handleSkipToggle);
  els.matchTbody.addEventListener('wa-change', handleSkipToggle);     // wa-checkbox
  const onPreviewChange = () => {
    const entry = state.entries[Number(readInputValue(els.previewSelect))];
    if (!entry) return;
    state.previewName = entry.name;
    drawPreview();
  };
  els.previewSelect.addEventListener('change', onPreviewChange);
  els.previewSelect.addEventListener('wa-change', onPreviewChange);
  for (const guide of [els.guideCut, els.guideRuler]) {
    guide.addEventListener('change', drawPreview);
    guide.addEventListener('wa-change', drawPreview);
  }
  for (const input of els.geomInputs) {
    input.addEventListener('input', handleGeometryInput);
    input.addEventListener('wa-input', handleGeometryInput);
    input.addEventListener('change', handleGeometryInput);
  }
  els.geomResetBtn.addEventListener('click', handleGeometryReset);
  els.processBtn.addEventListener('click', handleProcessAll);

  debugLog('MPC: compositor initialized');
}
