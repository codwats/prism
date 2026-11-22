// Compare PRISMs (#446): what to add, remove and re-mark to turn the sleeves
// painted for one PRISM (From) into the sleeves another (To) needs. A
// Members-only Extra (ADR 0003). The checklist ticks stay on this device.

import { initLayout } from './layout.js';
import { initExtraGate } from './modules/membership.js';
import { getAllPrisms, getCurrentPrism, getPrism, savePrism, recordUnmarkedCards } from './modules/storage.js';
import { buildPrismFromJson } from './modules/prism-import.js';
import { processCards } from './modules/processor.js';
import { comparePrisms, carryDone, markLabel, rowFingerprint } from './modules/compare-prisms.js';
import { wireCardPreview } from './modules/card-preview.js';
import { escapeHtml } from './core/utils.js';
import { showError, showSuccess } from './core/notifications.js';

const FILE = '__file';
const $ = (id) => document.getElementById(id);
const plural = (n, word) => `${n} ${word}${n === 1 ? '' : 's'}`;

let fileFrom = null;
let stripesByName = new Map();
let ticks = new Set();

initLayout({ activePage: '', headerCta: { href: 'build.html', label: 'Build PRISM', icon: 'wand-magic-sparkles' } });
initExtraGate(() => {
  fillPickers();
  render();
});

wireCardPreview($('compare-lists'), (name) => stripesByName.get(name) || []);
$('compare-from').addEventListener('change', onFromChange);
$('compare-to').addEventListener('change', render);
$('compare-file-btn').addEventListener('click', () => $('compare-file').click());
$('compare-file').addEventListener('change', onFile);
$('compare-carry').addEventListener('click', onCarryDone);
$('compare-clear').addEventListener('click', () => {
  ticks = new Set();
  saveTicks();
  render();
});
$('compare-lists').addEventListener('change', (e) => {
  const key = e.target.closest?.('[data-tick]')?.dataset.tick;
  if (!key) return;
  if (e.target.checked) ticks.add(key);
  else ticks.delete(key);
  saveTicks();
});

function fillPickers() {
  const options = getAllPrisms()
    .map((p) => `<wa-option value="${escapeHtml(p.id)}">${escapeHtml(p.name || 'Untitled PRISM')}</wa-option>`).join('');
  $('compare-from').innerHTML = `${options}<wa-option value="${FILE}">Backup file (.json)…</wa-option>`;
  $('compare-to').innerHTML = options;
  $('compare-to').value = getCurrentPrism()?.id || '';
  $('compare-from').value = '';
}

function onFromChange() {
  $('compare-file-row').hidden = $('compare-from').value !== FILE;
  render();
}

function onFile() {
  const file = $('compare-file').files?.[0];
  if (!file) return;
  const reader = new FileReader();
  reader.onload = (event) => {
    try {
      fileFrom = buildPrismFromJson(JSON.parse(event.target.result));
      $('compare-file-name').textContent = file.name;
    } catch (err) {
      fileFrom = null;
      $('compare-file-name').textContent = '';
      showError(`Could not read that backup: ${err.message}`);
    }
    render();
  };
  reader.readAsText(file);
}

// The From PRISM and its checklist key, or null until one is chosen.
function fromSide() {
  const value = $('compare-from').value;
  if (value === FILE) return fileFrom && { prism: fileFrom, key: `file:${fileFrom.id}` };
  const prism = value && getPrism(value);
  return prism && { prism, key: `prism:${prism.id}` };
}

const ticksKey = () => `prism_compare_ticks:${fromSide()?.key}>${$('compare-to').value}`;

function loadTicks() {
  try {
    ticks = new Set(JSON.parse(localStorage.getItem(ticksKey()) || '[]'));
  } catch {
    ticks = new Set();
  }
}

function saveTicks() {
  try {
    if (ticks.size) localStorage.setItem(ticksKey(), JSON.stringify([...ticks]));
    else localStorage.removeItem(ticksKey());
  } catch { /* device-only convenience: lost ticks are fine */ }
}

function markText(m) {
  const dot = m.markType === 'dot';
  return `<span class="wa-cluster wa-gap-2xs wa-align-items-center"><span class="stripe-detail-swatch${dot ? ' stripe-detail-swatch-dot' : ''}" style="background:${escapeHtml(m.color)}"></span>${escapeHtml(markLabel(m))}</span>`;
}

const batchText = (b) => `<span class="wa-cluster wa-gap-xs wa-align-items-center">${b.copies}×
  ${b.marks.length ? b.marks.map(markText).join('<span>+</span>') : '<span>no marks</span>'}</span>`;
const batchesText = (batches) => batches.map(batchText).join('<span>and</span>');

function row(baseKey, fingerprintOf, title, detail) {
  const key = `${baseKey}#${rowFingerprint(fingerprintOf)}`;
  return `<li class="queue-swap wa-stack wa-gap-xs">
    <wa-checkbox data-tick="${escapeHtml(key)}" ${ticks.has(key) ? 'checked' : ''}>${title}</wa-checkbox>
    <div class="wa-cluster wa-gap-xs wa-align-items-center wa-caption-s">${detail}</div>
  </li>`;
}

const nameCell = (name) => `<span class="card-name-cell" data-card-name="${escapeHtml(name)}">${escapeHtml(name)}</span>`;

function renderList(id, rows) {
  $(`${id}-list`).innerHTML = rows.join('');
  $(id).hidden = rows.length === 0;
}

function render() {
  const from = fromSide();
  const to = getPrism($('compare-to').value);
  $('compare-result').hidden = !(from && to);
  if (!from || !to) return;

  loadTicks();
  const result = comparePrisms(from.prism, to);
  stripesByName = new Map([...processCards(from.prism), ...processCards(to)].map((c) => [c.name, c.stripes]));

  renderList('compare-add', result.add.map((r) => row(`add|${r.name}`, r.batches,
    `${r.copies}× ${nameCell(r.name)}`, `Paint: ${batchesText(r.batches)}`)));
  renderList('compare-remove', result.remove.map((r) => (r.stillPainted
    ? row(`remove|${r.name}|${r.deckName}`, r.batches, `${r.copies}× ${nameCell(r.name)}`,
      `Clear: ${batchesText(r.batches)} <span class="wa-color-text-quiet">(${escapeHtml(r.deckName || '')}, still painted from an earlier edit)</span>`)
    : row(`remove|${r.name}`, r.batches, `${r.copies}× ${nameCell(r.name)}`, `Clear from: ${batchesText(r.batches)}`))));
  renderList('compare-remark', result.remark.map((r) => row(`remark|${r.name}`, [r.from, r.to],
    `${r.copies}× ${nameCell(r.name)}`,
    `${batchesText(r.from)}<wa-icon name="arrow-right" label="becomes"></wa-icon>${batchesText(r.to)}`)));

  const changes = result.add.length + result.remove.length + result.remark.length;
  $('compare-summary').textContent = `${plural(result.unchangedCount, 'card')} need${result.unchangedCount === 1 ? 's' : ''} nothing.`
    + (changes ? '' : ' Every sleeve already matches.');
  $('compare-carry').disabled = result.unchangedCount === 0;
}

function onCarryDone() {
  const from = fromSide();
  const to = getPrism($('compare-to').value);
  if (!from || !to) return;
  const { unchanged } = comparePrisms(from.prism, to);
  const { markedCards, unmarkedKeys, count } = carryDone(to, unchanged);
  if (count === 0) {
    showSuccess(`Every matching card is already done in ${to.name || 'To'}.`);
    return;
  }
  recordUnmarkedCards(to.id, unmarkedKeys);
  const now = new Date().toISOString();
  to.markedCards = markedCards;
  to.updatedAt = now;
  to.markedCardsUpdatedAt = now;
  savePrism(to);
  showSuccess(`Marked ${plural(count, 'card')} done in ${to.name || 'To'}.`);
}
