/**
 * CSV Output Generator
 * Generates CSV file with sleeve marking instructions
 */

import { stringify } from 'csv-stringify/sync';
import { ProcessedData } from '../core/types.js';
import { promises as fs } from 'fs';

/**
 * Generates CSV content from processed data
 *
 * Format:
 * - Card Name, Quantity, Total Decks, Mark Summary
 * - Slot 1 Color, Slot 1 Deck, Slot 1 Bracket
 * - Slot 2 Color, Slot 2 Deck, Slot 2 Bracket
 * - ... (up to 10 slots)
 *
 * @param data - Processed deck data
 * @returns CSV string
 */
export function generateCSV(data: ProcessedData): string {
  // Build header row
  const headers = [
    'Card Name',
    'Quantity',
    'Total Decks',
    'Mark Summary',
  ];

  // Add slot columns (up to 10)
  const maxSlots = 10;
  for (let i = 1; i <= maxSlots; i++) {
    headers.push(`Slot ${i} Color`);
    headers.push(`Slot ${i} Deck`);
    headers.push(`Slot ${i} Bracket`);
  }

  // Build data rows
  const rows = data.cards.map(card => {
    const row: (string | number)[] = [
      card.name,
      1, // Quantity is always 1 for shared system
      card.totalDecks,
      card.markSummary,
    ];

    // Add mark slot data
    for (let i = 0; i < maxSlots; i++) {
      if (i < card.markSlots.length) {
        const slot = card.markSlots[i];
        row.push(slot.color);
        row.push(slot.deckName);
        row.push(slot.bracket);
      } else {
        // Empty slots
        row.push('');
        row.push('');
        row.push('');
      }
    }

    return row;
  });

  // Generate CSV
  return stringify([headers, ...rows], {
    quoted: true,
    quoted_empty: false,
  });
}

/**
 * Writes CSV to file
 *
 * @param data - Processed deck data
 * @param filepath - Output file path
 */
export async function writeCSVFile(data: ProcessedData, filepath: string): Promise<void> {
  const csv = generateCSV(data);
  await fs.writeFile(filepath, csv, 'utf-8');
}
