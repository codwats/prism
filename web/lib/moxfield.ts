/**
 * Moxfield API Integration
 * Fetches decklists from Moxfield's public API
 */

export interface MoxfieldCard {
  quantity: number;
  card: {
    name: string;
  };
}

export interface MoxfieldDeck {
  name: string;
  commanders?: MoxfieldCard[];
  mainboard: Record<string, MoxfieldCard>;
  sideboard?: Record<string, MoxfieldCard>;
}

/**
 * Fetches a deck from Moxfield by ID
 *
 * @param deckId - Moxfield deck ID (from URL: moxfield.com/decks/{deckId})
 * @returns Deck data from Moxfield
 */
export async function fetchMoxfieldDeck(deckId: string): Promise<MoxfieldDeck> {
  const response = await fetch(`https://api2.moxfield.com/v3/decks/all/${deckId}`);

  if (!response.ok) {
    throw new Error(`Failed to fetch deck: ${response.statusText}`);
  }

  return response.json();
}

/**
 * Converts Moxfield deck to PRISM decklist format
 *
 * @param moxfieldDeck - Deck data from Moxfield
 * @returns Decklist string in MTGO format (quantity cardname per line)
 */
export function convertMoxfieldToPrismFormat(moxfieldDeck: MoxfieldDeck): string {
  const lines: string[] = [];

  // Add mainboard cards
  for (const [cardName, cardData] of Object.entries(moxfieldDeck.mainboard)) {
    lines.push(`${cardData.quantity} ${cardName}`);
  }

  return lines.join('\n');
}

/**
 * Extracts deck ID from Moxfield URL
 *
 * @param url - Full Moxfield URL or just the deck ID
 * @returns Deck ID
 */
export function extractMoxfieldId(url: string): string {
  // If it's already just an ID, return it
  if (!url.includes('/') && !url.includes('.')) {
    return url;
  }

  // Extract from URL like: https://www.moxfield.com/decks/abc123
  const match = url.match(/moxfield\.com\/decks\/([a-zA-Z0-9_-]+)/);
  if (match) {
    return match[1];
  }

  throw new Error('Invalid Moxfield URL or ID');
}

/**
 * Gets commander name from Moxfield deck
 *
 * @param moxfieldDeck - Deck data from Moxfield
 * @returns Commander name or 'Unknown'
 */
export function getCommanderName(moxfieldDeck: MoxfieldDeck): string {
  if (moxfieldDeck.commanders && moxfieldDeck.commanders.length > 0) {
    return moxfieldDeck.commanders[0].card.name;
  }
  return 'Unknown Commander';
}
