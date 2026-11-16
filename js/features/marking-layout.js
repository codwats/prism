/**
 * Mark sleeves tab layout (#452). Desktop: totals and legend sit in a rail
 * beside the table, Export and Start marking in the toolbar. Phone (the same
 * 768px breakpoint as wa-page): those elements move, as live nodes, into the
 * bottom bar (`data-phone-slot="bar"`) or the "Totals and tools" sheet
 * (`data-phone-slot="sheet"`, ordered by `data-phone-order`).
 *
 * Moving the nodes, not copying them, keeps one id per control, so every
 * state.elements ref and listener keeps working. To add a sheet entry, give
 * the element its desktop home in build.html and `data-phone-slot="sheet"`
 * plus a `data-phone-order` (Export 10, Shown rows 20, Audit 30, Totals 40, Legend 50, Matrix 60).
 */

const PHONE_QUERY = '(max-width: 768px)';
const homes = new Map(); // element -> placeholder comment at its desktop spot

function place(phone) {
  const sheetBody = document.getElementById('marking-sheet-body');
  const bar = document.getElementById('marking-bar');
  if (!sheetBody || !bar) return;

  const items = [...document.querySelectorAll('[data-phone-slot]')];
  for (const el of items) {
    if (!homes.has(el)) {
      const marker = document.createComment(`${el.id || 'marking item'} desktop home`);
      el.before(marker);
      homes.set(el, marker);
    }
  }

  if (phone) {
    const order = (el) => Number(el.dataset.phoneOrder) || 0;
    items
      .filter(el => el.dataset.phoneSlot === 'sheet')
      .sort((a, b) => order(a) - order(b))
      .forEach(el => sheetBody.append(el));
    items.filter(el => el.dataset.phoneSlot === 'bar').forEach(el => bar.append(el));
  } else {
    for (const [el, marker] of homes) marker.after(el);
    document.getElementById('marking-sheet')?.removeAttribute('open');
  }
}

export function setupMarkingLayout() {
  const query = window.matchMedia(PHONE_QUERY);
  place(query.matches);
  query.addEventListener('change', (e) => place(e.matches));
  document.getElementById('btn-marking-tools')?.addEventListener('click', () => {
    document.getElementById('marking-sheet')?.setAttribute('open', '');
  });
}
