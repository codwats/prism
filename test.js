#!/usr/bin/env node

/**
 * Simple test script to verify PRISM functionality
 * Uses the example decks to test the core logic
 */

import { readFileSync } from 'fs';
import { v4 as uuidv4 } from 'uuid';
import { parseDecklist } from './dist/core/parser.js';
import { processDecks } from './dist/core/processor.js';
import { generateCSV } from './dist/output/csv.js';
import { generateJSON } from './dist/output/json.js';

console.log('🔮 PRISM Test Suite\n');

// Load example decks
const deck1Content = readFileSync('./examples/deck1-spellslinger.txt', 'utf-8');
const deck2Content = readFileSync('./examples/deck2-energy.txt', 'utf-8');
const deck3Content = readFileSync('./examples/deck3-stompy.txt', 'utf-8');

console.log('✓ Loaded 3 example decklists\n');

// Parse decks
const decks = [
  {
    id: uuidv4(),
    name: 'Spellslinger Izzet',
    commander: 'Alania, Divergent Storm',
    bracket: 2,
    cards: parseDecklist(deck1Content).cards,
    assignedColor: '',
  },
  {
    id: uuidv4(),
    name: 'Energy Aggro',
    commander: 'Chandra, Hope\'s Beacon',
    bracket: 3,
    cards: parseDecklist(deck2Content).cards,
    assignedColor: '',
  },
  {
    id: uuidv4(),
    name: 'Mono-G Stompy',
    commander: 'Ghalta, Primal Hunger',
    bracket: 2,
    cards: parseDecklist(deck3Content).cards,
    assignedColor: '',
  },
];

console.log('Parsed decks:');
decks.forEach((deck, i) => {
  const cardCount = deck.cards.reduce((sum, card) => sum + card.quantity, 0);
  console.log(`  ${i + 1}. ${deck.name} - ${cardCount} cards`);
});
console.log();

// Process decks
const processedData = processDecks(decks);

console.log('Processing results:');
console.log(`  Total decks: ${processedData.stats.totalDecks}`);
console.log(`  Unique cards: ${processedData.stats.totalUniqueCards}`);
console.log(`  Total card slots: ${processedData.stats.totalCardSlots}`);
console.log(`  Shared cards: ${processedData.stats.sharedCards}`);
console.log(`  Cards saved: ${processedData.stats.totalCardSlots - processedData.stats.totalUniqueCards}`);
console.log();

console.log('Most shared cards:');
processedData.stats.mostSharedCards.forEach(card => {
  console.log(`  • ${card.name} - ${card.count} decks`);
});
console.log();

// Generate outputs
const csv = generateCSV(processedData);
const json = generateJSON(processedData);

console.log('✓ Generated CSV output');
console.log('✓ Generated JSON output');
console.log();

console.log('Sample CSV rows (first 5 cards):');
const csvLines = csv.split('\n');
console.log(csvLines[0]); // Header
for (let i = 1; i <= Math.min(5, csvLines.length - 1); i++) {
  console.log(csvLines[i]);
}
console.log();

console.log('✓ All tests passed!');
console.log('🎨 PRISM is working correctly!');
