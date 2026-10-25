/**
 * "Copy for Moxfield/Archidekt" UI (#377): the export panel, used inline by the
 * Swap Queue Apply deck result and inside a dialog on build.html deck cards.
 * Free on every page (ADR 0002).
 */

import { exportDeck, changesText, SITE_NAMES } from './deck-export.js';
import { deckSourceSite } from './deck-source.js';
import { commanderNames } from './processor.js';
import { escapeHtml } from '../core/utils.js';

let nextId = 0;

function pasteHint(deck, site) {
  if (site === 'archidekt') return 'Paste into Import cards on Archidekt. Import adds to a deck, so use it on a new or emptied deck.';
  const commanders = commanderNames(deck);
  const setCommander = commanders.length
    ? ` Commanders aren't in the list, since Bulk Edit has no commander board: if the Moxfield deck doesn't have ${commanders.join(' and ')} as ${commanders.length > 1 ? 'commanders' : 'commander'} yet, add ${commanders.length > 1 ? 'them' : 'it'} and use Set as Commander from the card menu.`
    : '';
  return `Paste into the Main Deck tab of the deck's Bulk Edit on Moxfield. It replaces the list there.${setCommander}`;
}

function listBlock(id, label, hint, copyLabel) {
  return `<div class="wa-stack wa-gap-xs">
      <wa-textarea id="${id}" label="${label}" hint="${escapeHtml(hint)}" rows="8" readonly></wa-textarea>
      <wa-copy-button from="${id}.value" copy-label="${copyLabel}"></wa-copy-button>
    </div>`;
}

function view(deck, result, sourced, uid) {
  const siteName = SITE_NAMES[result.site];
  const picker = sourced ? '' : `<wa-radio-group class="deck-export-site" label="Format for" orientation="horizontal" value="${result.site}">
      <wa-radio appearance="button" value="moxfield">Moxfield</wa-radio>
      <wa-radio appearance="button" value="archidekt">Archidekt</wa-radio>
    </wa-radio-group>`;
  const notice = result.notice
    ? `<wa-callout variant="warning" size="s"><wa-icon slot="icon" name="triangle-exclamation"></wa-icon>${escapeHtml(result.notice)}</wa-callout>`
    : '';
  const full = listBlock(`${uid}-full`, 'Full list', pasteHint(deck, result.site), 'Copy full list');

  if (!result.changes) return `<div class="wa-stack wa-gap-m">${picker}${notice}${full}</div>`;

  const none = result.changes.commander.length === 0 && result.changes.deck.length === 0;
  const changes = none
    ? `<p>Nothing to change: the ${siteName} deck already matches ${escapeHtml(deck.name)}.</p>`
    : listBlock(`${uid}-changes`, `Changes to make on ${siteName}`,
      `Add (+) and remove (-) these by hand on ${siteName}, so its printings, foils and categories stay put.`, 'Copy changes');
  return `<div class="wa-stack wa-gap-m">
      ${changes}
      <wa-details summary="Full list instead">${full}</wa-details>
    </div>`;
}

/**
 * Render the export for `deck` into `container`. A deck with a sourceUrl is
 * diffed against its live site deck; one without gets a Moxfield/Archidekt
 * picker (Moxfield first) and the full list.
 */
export async function renderDeckExport(container, deck, site = 'moxfield') {
  const uid = `deck-export-${++nextId}`;
  container.dataset.exportId = uid;
  const sourced = deckSourceSite(deck.sourceUrl);
  if (sourced) container.innerHTML = `<p class="wa-caption-m">Loading the live ${SITE_NAMES[sourced]} deck…</p>`;

  const result = await exportDeck(deck, site);
  if (container.dataset.exportId !== uid) return; // a newer render owns the container
  container.innerHTML = view(deck, result, sourced, uid);
  const set = (id, text) => { const el = container.querySelector(`#${id}`); if (el) el.value = text; };
  set(`${uid}-full`, result.fullList);
  if (result.changes) set(`${uid}-changes`, changesText(result.changes));
  container.querySelector('.deck-export-site')?.addEventListener('change', (e) => {
    renderDeckExport(container, deck, e.currentTarget.value);
  });
}

let dialog = null;

/** Open the export for `deck` in a dialog, created on first use. `site`
 * picks the format for a deck with no sourceUrl. */
export function openDeckExportDialog(deck, site = 'moxfield') {
  if (!dialog) {
    dialog = document.createElement('wa-dialog');
    dialog.innerHTML = `<div class="deck-export-body"></div>
      <wa-button slot="footer" variant="neutral" appearance="outlined" data-dialog="close">Done</wa-button>`;
    document.body.append(dialog);
  }
  dialog.setAttribute('label', `Copy ${deck.name} for ${SITE_NAMES[deckSourceSite(deck.sourceUrl) || site]}`);
  renderDeckExport(dialog.querySelector('.deck-export-body'), deck, site);
  dialog.setAttribute('open', '');
}
