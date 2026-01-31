/**
 * Card Name Normalizer
 * Ensures consistent card name formatting across all decks
 */

/**
 * Normalizes a card name for consistent matching
 *
 * - Trims whitespace
 * - Preserves special characters (apostrophes, hyphens, commas, etc.)
 * - Preserves capitalization (for display purposes)
 * - Removes extra internal whitespace
 *
 * Examples:
 * "  Sol Ring  " -> "Sol Ring"
 * "Niv-Mizzet, Parun" -> "Niv-Mizzet, Parun"
 * "An Offer You Can't Refuse" -> "An Offer You Can't Refuse"
 *
 * @param name - Raw card name
 * @returns Normalized card name
 */
export function normalizeCardName(name: string): string {
  return name
    .trim()
    .replace(/\s+/g, ' '); // Replace multiple spaces with single space
}

/**
 * Compares two card names for equality (case-insensitive)
 *
 * @param name1 - First card name
 * @param name2 - Second card name
 * @returns True if names match (ignoring case)
 */
export function cardNamesEqual(name1: string, name2: string): boolean {
  return normalizeCardName(name1).toLowerCase() === normalizeCardName(name2).toLowerCase();
}

/**
 * Gets a canonical key for a card name (for deduplication)
 *
 * @param name - Card name
 * @returns Lowercase normalized name
 */
export function getCardKey(name: string): string {
  return normalizeCardName(name).toLowerCase();
}
