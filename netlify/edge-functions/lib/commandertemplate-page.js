/**
 * Reads a deck out of a commandertemplate.com deck page (#493). The site has no
 * API; the page is Next.js and carries the deck as JSON in its RSC payload
 * (self.__next_f.push chunks). Plain .js beside cors.js so tests import it
 * without a TypeScript loader.
 *
 * Any markup change must fail loudly: every check below throws UNREADABLE
 * rather than return part of a deck.
 */

export const UNREADABLE = "Couldn't read this deck from Commander Template. The site may have changed; try again later.";

const fail = () => { throw new Error(UNREADABLE); };

/** The JSON object text starting at `start` (a `{`), string- and escape-aware. */
function objectText(s, start) {
  let depth = 0, inString = false, escaped = false;
  for (let i = start; i < s.length; i++) {
    const c = s[i];
    if (inString) {
      if (escaped) escaped = false;
      else if (c === '\\') escaped = true;
      else if (c === '"') inString = false;
    } else if (c === '"') inString = true;
    else if (c === '{') depth++;
    else if (c === '}' && --depth === 0) return s.slice(start, i + 1);
  }
  return fail();
}

/**
 * @param {string} html - the deck page
 * @returns {{id: string, name: string, bracket: number|null, cards: Array<{name: string, quantity: number, isCommander: boolean, isBasicLand: boolean}>}}
 */
export function readDeckPage(html) {
  let deck;
  try {
    const payload = [...html.matchAll(/self\.__next_f\.push\((\[[\s\S]*?\])\)<\/script>/g)]
      .map((m) => JSON.parse(m[1])[1])
      .filter((chunk) => typeof chunk === 'string')
      .join('');
    const at = payload.search(/"deck":\{"id":"[0-9a-f-]{36}"/);
    if (at < 0) fail();
    deck = JSON.parse(objectText(payload, at + '"deck":'.length));
  } catch {
    return fail();
  }

  const { id, name, selectedCommanders: commanders, deckInstances: instances } = deck;
  if (typeof id !== 'string' || typeof name !== 'string' || !name) fail();
  if (!Array.isArray(commanders) || commanders.length === 0 || !Array.isArray(instances)) fail();

  // One instance per copy: group by name. The maybeboard is a separate field and never read.
  const cards = commanders.map((c) => (typeof c?.name === 'string' ? { name: c.name, quantity: 1, isCommander: true, isBasicLand: false } : fail()));
  const byName = new Map();
  for (const { cardData } of instances) {
    if (typeof cardData?.name !== 'string') fail();
    const typeLine = (cardData.type_line || '').toLowerCase();
    const card = byName.get(cardData.name)
      || byName.set(cardData.name, { name: cardData.name, quantity: 0, isCommander: false, isBasicLand: typeLine.includes('basic') && typeLine.includes('land') }).get(cardData.name);
    card.quantity++;
  }
  cards.push(...byName.values());

  // The page states its own card count; a list that doesn't add up is a partial read.
  // shortcut: a companion may or may not be in mainCount, so either is accepted, and it is not imported.
  const total = cards.reduce((n, c) => n + c.quantity, 0);
  if (![total, total + (deck.selectedCompanion ? 1 : 0)].includes(deck.mainCount)) fail();

  return { id, name, bracket: Number.isInteger(deck.deckBracket) ? deck.deckBracket : null, cards };
}
