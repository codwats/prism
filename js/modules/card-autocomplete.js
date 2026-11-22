// Scryfall name autocomplete under an input: typing 2+ characters lists up to
// 8 names in `list` (a hidden element under the input); picking one fills
// the input and calls onPick(value). /cards/autocomplete isn't one of the
// 2-per-second endpoints, so it skips the rate chain; the debounce spaces it.
// `search(q)` swaps the source: it resolves to [{ label, value }] (Add token
// passes a token-only search, #412).
// Returns a function that removes the outside-click listener.

import { escapeHtml } from '../core/utils.js';

async function cardNames(q) {
  const res = await fetch(`https://api.scryfall.com/cards/autocomplete?q=${encodeURIComponent(q)}`);
  return ((await res.json()).data || []).map((name) => ({ label: name, value: name }));
}

export function wireCardAutocomplete(input, list, onPick = () => {}, search = cardNames) {
  let timer;
  input.addEventListener('input', () => {
    clearTimeout(timer);
    const q = (input.value || '').trim();
    if (q.length < 2) { list.hidden = true; return; }
    timer = setTimeout(async () => {
      try {
        const items = (await search(q)).slice(0, 8);
        list.innerHTML = items.map(it => `<button type="button">${escapeHtml(it.label)}</button>`).join('');
        list.hidden = items.length === 0;
        list.querySelectorAll('button').forEach((b, i) => b.addEventListener('click', () => {
          input.value = items[i].label;
          list.hidden = true;
          onPick(items[i].value);
        }));
      } catch {
        list.hidden = true;
      }
    }, 250);
  });
  const onDocClick = e => { if (!list.contains(e.target) && e.target !== input) list.hidden = true; };
  document.addEventListener('click', onDocClick);
  return () => document.removeEventListener('click', onDocClick);
}
