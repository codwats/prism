#!/usr/bin/env node

/**
 * Test script for delta functionality
 * Simulates loading a JSON, adding a deck, and seeing the changes
 */

import { readFileSync, writeFileSync } from 'fs';
import { v4 as uuidv4 } from 'uuid';
import { parseDecklist } from './dist/core/parser.js';
import { processDecks } from './dist/core/processor.js';
import { generateJSON } from './dist/output/json.js';
import { calculateDelta } from './dist/core/delta.js';
import { generateChangesCSV } from './dist/output/changes.js';

console.log('🔮 PRISM Delta Test\n');

// Step 1: Create initial collection with 2 decks
console.log('Step 1: Creating initial collection with 2 decks...');

const deck1Content = readFileSync('./examples/deck1-spellslinger.txt', 'utf-8');
const deck2Content = readFileSync('./examples/deck2-energy.txt', 'utf-8');

const initialDecks = [
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
];

const initialProcessed = processDecks(initialDecks);
console.log(`✓ Initial: ${initialProcessed.decks.length} decks, ${initialProcessed.cards.length} unique cards`);
console.log();

// Save initial JSON
const initialJSON = generateJSON(initialProcessed);
writeFileSync('./test-initial.json', JSON.stringify(initialJSON, null, 2));

// Step 2: Simulate loading and adding a 3rd deck
console.log('Step 2: Adding a 3rd deck (Mono-G Stompy)...');

const deck3Content = readFileSync('./examples/deck3-stompy.txt', 'utf-8');

const updatedDecks = [
  ...initialDecks,
  {
    id: uuidv4(),
    name: 'Mono-G Stompy',
    commander: 'Ghalta, Primal Hunger',
    bracket: 2,
    cards: parseDecklist(deck3Content).cards,
    assignedColor: '',
  },
];

const updatedProcessed = processDecks(updatedDecks);
console.log(`✓ Updated: ${updatedProcessed.decks.length} decks, ${updatedProcessed.cards.length} unique cards`);
console.log();

// Step 3: Calculate delta
console.log('Step 3: Calculating delta...');
const delta = calculateDelta(initialProcessed, updatedProcessed);

console.log(`New cards: ${delta.summary.newCards}`);
console.log(`Updated cards: ${delta.summary.updatedCards}`);
console.log(`Removed cards: ${delta.summary.removedCards}`);
console.log();

// Show some example changes
console.log('Example changes (first 10):');
delta.changes.slice(0, 10).forEach(change => {
  console.log(`  [${change.action}] ${change.cardName}`);
  console.log(`    ${change.physicalAction}`);
});
console.log();

// Generate changes CSV
const changesCSV = generateChangesCSV(delta);
writeFileSync('./test-changes.csv', changesCSV);
console.log('✓ Changes CSV written to test-changes.csv');

// Save updated JSON
const updatedJSON = generateJSON(updatedProcessed);
writeFileSync('./test-updated.json', JSON.stringify(updatedJSON, null, 2));
console.log('✓ Updated JSON written to test-updated.json');
console.log();

console.log('✓ Delta test complete!');
console.log('\nFiles created:');
console.log('  - test-initial.json (2 decks)');
console.log('  - test-updated.json (3 decks)');
console.log('  - test-changes.csv (what changed)');
