/**
 * Shared failure handling for the deck-import proxy responses
 * (moxfield.js, archidekt.js, deckcheck.js).
 */

export const IMPORT_BUSY_MESSAGE = 'Import is busy, try again in a moment.';

/** The Error to throw for a non-ok proxy response: busy on a rate limit (#439), else the proxy's message. */
export async function importError(response) {
  if (response.status === 429) return new Error(IMPORT_BUSY_MESSAGE);
  const error = await response.json().catch(() => ({ error: 'Unknown error' }));
  return new Error(error.error || `Failed to fetch deck: ${response.status}`);
}
