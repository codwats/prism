#!/usr/bin/env node

/**
 * PRISM - Personal Resource Inventory & Sleeve Marking
 * CLI Entry Point
 */

import inquirer from 'inquirer';
import { v4 as uuidv4 } from 'uuid';
import { Deck, DeckInput } from './core/types.js';
import { parseDecklist, validateDeckSize } from './core/parser.js';
import { processDecks } from './core/processor.js';
import { writeCSVFile } from './output/csv.js';
import { writeJSONFile } from './output/json.js';
import {
  displayWelcome,
  displayDeckHeader,
  displayDeckParsed,
  displayDecksSummary,
  displayProcessingSummary,
  displayOutputConfirmation,
  displayError,
  displayWarning,
} from './output/summary.js';
import { validateDeckCount } from './utils/validator.js';
import { promises as fs } from 'fs';
import { resolve } from 'path';

/**
 * Main CLI application
 */
async function main(): Promise<void> {
  displayWelcome();

  // Ask how many decks
  const { deckCount } = await inquirer.prompt<{ deckCount: number }>([
    {
      type: 'number',
      name: 'deckCount',
      message: 'How many decks would you like to process? (1-10):',
      default: 2,
      validate: (input: number) => {
        const validation = validateDeckCount(input);
        if (!validation.isValid) {
          return validation.errors[0];
        }
        return true;
      },
    },
  ]);

  console.log();

  // Collect deck information
  const decks: Deck[] = [];

  for (let i = 0; i < deckCount; i++) {
    displayDeckHeader(i + 1, deckCount);

    const deckInput = await collectDeckInput();
    const deck = await parseDeck(deckInput);

    if (deck) {
      decks.push(deck);
      displayDeckParsed(deck.name, deck.cards.length, deck.assignedColor || '');
    } else {
      // Parsing failed, retry this deck
      i--;
    }
  }

  // Process decks
  const processedData = processDecks(decks);

  // Display summary
  displayDecksSummary(processedData);
  displayProcessingSummary(processedData);

  // Ask for output file paths
  const { csvPath, jsonPath } = await inquirer.prompt<{
    csvPath: string;
    jsonPath: string;
  }>([
    {
      type: 'input',
      name: 'csvPath',
      message: 'Save CSV to:',
      default: './prism-output.csv',
    },
    {
      type: 'input',
      name: 'jsonPath',
      message: 'Save JSON to:',
      default: './prism-output.json',
    },
  ]);

  // Write output files
  try {
    const resolvedCsvPath = resolve(csvPath);
    const resolvedJsonPath = resolve(jsonPath);

    await writeCSVFile(processedData, resolvedCsvPath);
    await writeJSONFile(processedData, resolvedJsonPath);

    console.log();
    displayOutputConfirmation(
      resolvedCsvPath,
      resolvedJsonPath,
      processedData.cards.length
    );
  } catch (error) {
    displayError(`Failed to write output files: ${error}`);
    process.exit(1);
  }
}

/**
 * Collects deck input from user
 */
async function collectDeckInput(): Promise<DeckInput> {
  const answers = await inquirer.prompt<{
    name: string;
    commander: string;
    bracket: number;
    inputMethod: 'paste' | 'file';
  }>([
    {
      type: 'input',
      name: 'name',
      message: 'Deck name:',
      validate: (input: string) => {
        return input.trim().length > 0 || 'Deck name cannot be empty';
      },
    },
    {
      type: 'input',
      name: 'commander',
      message: 'Commander:',
      validate: (input: string) => {
        return input.trim().length > 0 || 'Commander name cannot be empty';
      },
    },
    {
      type: 'number',
      name: 'bracket',
      message: 'Bracket level (1-4):',
      default: 2,
      validate: (input: number) => {
        if (!Number.isInteger(input) || input < 1 || input > 4) {
          return 'Bracket must be between 1 and 4';
        }
        return true;
      },
    },
    {
      type: 'list',
      name: 'inputMethod',
      message: 'How would you like to input the decklist?',
      choices: [
        { name: 'Paste decklist', value: 'paste' },
        { name: 'Load from file', value: 'file' },
      ],
    },
  ]);

  let decklist = '';

  if (answers.inputMethod === 'paste') {
    console.log('Paste your decklist (press Enter twice when done):');

    const { decklistInput } = await inquirer.prompt<{ decklistInput: string }>([
      {
        type: 'editor',
        name: 'decklistInput',
        message: 'Decklist:',
      },
    ]);

    decklist = decklistInput;
  } else {
    const { filepath } = await inquirer.prompt<{ filepath: string }>([
      {
        type: 'input',
        name: 'filepath',
        message: 'Enter path to decklist file:',
        validate: async (input: string) => {
          try {
            await fs.access(input);
            return true;
          } catch {
            return 'File not found';
          }
        },
      },
    ]);

    try {
      decklist = await fs.readFile(filepath, 'utf-8');
    } catch (error) {
      displayError(`Failed to read file: ${error}`);
      return collectDeckInput(); // Retry
    }
  }

  return {
    name: answers.name,
    commander: answers.commander,
    bracket: answers.bracket,
    decklist,
  };
}

/**
 * Parses a deck from user input
 */
async function parseDeck(input: DeckInput): Promise<Deck | null> {
  const parseResult = parseDecklist(input.decklist);

  // Display errors
  if (parseResult.errors.length > 0) {
    displayWarning(`Found ${parseResult.errors.length} parsing errors:`);
    parseResult.errors.slice(0, 5).forEach(error => {
      console.log(`  Line ${error.line}: ${error.reason}`);
    });

    if (parseResult.errors.length > 5) {
      console.log(`  ... and ${parseResult.errors.length - 5} more errors`);
    }

    console.log();
  }

  // Display warnings
  if (parseResult.warnings.length > 0) {
    displayWarning(`Found ${parseResult.warnings.length} warnings:`);
    parseResult.warnings.slice(0, 5).forEach(warning => {
      console.log(`  Line ${warning.line}: ${warning.message}`);
    });

    if (parseResult.warnings.length > 5) {
      console.log(`  ... and ${parseResult.warnings.length - 5} more warnings`);
    }

    console.log();
  }

  // Validate deck size
  if (parseResult.cards.length === 0) {
    displayError('Deck is empty (0 valid cards parsed). Please try again.');
    console.log();
    return null;
  }

  const sizeValidation = validateDeckSize(parseResult.cards);
  if (sizeValidation) {
    if (sizeValidation.startsWith('Note:')) {
      displayWarning(sizeValidation);
    } else if (parseResult.cards.length < 50) {
      displayError(sizeValidation);
      console.log();
      return null;
    }
  }

  // Create deck
  const deck: Deck = {
    id: uuidv4(),
    name: input.name,
    commander: input.commander,
    bracket: input.bracket,
    cards: parseResult.cards,
    assignedColor: '', // Will be assigned during processing
  };

  return deck;
}

// Run the CLI
main().catch(error => {
  displayError(`Fatal error: ${error}`);
  process.exit(1);
});
