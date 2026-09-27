// Scryfall name autocomplete under an input: typing 2+ characters lists up to
// 8 names in `list` (a hidden element under the input); picking one fills
// the input and calls onPick(name). /cards/autocomplete isn't one of the
// 2-per-second endpoints, so it skips the rate chain; the debounce spaces it.
// Returns a function that removes the outside-click listener.

import { escapeHtml } from '../core/utils.js';

export function wireCardAutocomplete(input, list, onPick = () => {}) {
  let timer;
  input.addEventListener('input', () => {
    clearTimeout(timer);
    const q = (input.value || '').trim();
    if (q.length < 2) { list.hidden = true; return; }
    timer = setTimeout(async () => {
      try {
        const res = await fetch(`https://api.scryfall.com/cards/autocomplete?q=${encodeURIComponent(q)}`);
        const names = ((await res.json()).data || []).slice(0, 8);
        list.innerHTML = names.map(n => `<button type="button">${escapeHtml(n)}</button>`).join('');
        list.hidden = names.length === 0;
        list.querySelectorAll('button').forEach(b => b.addEventListener('click', () => {
          input.value = b.textContent;
          list.hidden = true;
          onPick(b.textContent);
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
