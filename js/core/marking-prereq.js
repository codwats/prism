// Pre-marking warning (#476). Device-only: the ids of PRISMs where the player
// dismissed it or already started marking. Never part of the PRISM, so it never syncs.
const KEY = 'prism_marking_prereq_dismissed';

function load() {
  try {
    const ids = JSON.parse(localStorage.getItem(KEY));
    return Array.isArray(ids) ? ids : [];
  } catch {
    return [];
  }
}

export function dismissMarkingPrereq(prismId) {
  const ids = load();
  if (ids.includes(prismId)) return;
  try {
    localStorage.setItem(KEY, JSON.stringify([...ids, prismId]));
  } catch {
    // Storage blocked: the warning comes back next session.
  }
}

/** A first mark retires the warning for good, even if the marks are cleared later. Writes storage. */
export function retireMarkingPrereq(prism) {
  if (prism.markedCards?.length) dismissMarkingPrereq(prism.id);
}

/** Shown until dismissed or until the PRISM has a mark. Read only. */
export function markingPrereqVisible(prism) {
  return !prism.markedCards?.length && !load().includes(prism.id);
}
