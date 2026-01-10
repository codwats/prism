#!/usr/bin/env node

/**
 * PRISM - Personal Reference Index & Sleeve Marking
 * CLI Entry Point
 */

import inquirer from 'inquirer';
import { v4 as uuidv4 } from 'uuid';
import { Deck, DeckInput, ProcessedData } from './core/types.js';
import { parseDecklist, validateDeckSize } from './core/parser.js';
import { processDecks } from './core/processor.js';
import { writeCSVFile } from './output/csv.js';
import { writeJSONFile } from './output/json.js';
import { writeChangesCSVFile } from './output/changes.js';
import { calculateDelta } from './core/delta.js';
import { loadPrismJSON, validatePrismJSON } from './input/loader.js';
import {
  displayWelcome,
  displayDeckHeader,
  displayDeckParsed,
  displayDecksSummary,
  displayProcessingSummary,
  displayError,
  displayWarning,
} from './output/summary.js';
import { validateDeckCount } from './utils/validator.js';
import { promises as fs } from 'fs';
import { resolve } from 'path';
import chalk from 'chalk';

/**
 * Main CLI application
 */
async function main(): Promise<void> {
  displayWelcome();

  // Ask: new or existing collection?
  const { mode } = await inquirer.prompt<{ mode: 'new' | 'load' }>([
    {
      type: 'list',
      name: 'mode',
      message: 'What would you like to do?',
      choices: [
        { name: 'Start new collection', value: 'new' },
        { name: 'Load existing collection', value: 'load' },
      ],
    },
  ]);

  let existingDecks: Deck[] = [];
  let oldProcessedData: ProcessedData | null = null;

  if (mode === 'load') {
    // Load existing JSON
    const { jsonPath } = await inquirer.prompt<{ jsonPath: string }>([
      {
        type: 'input',
        name: 'jsonPath',
        message: 'Path to existing PRISM JSON file:',
        default: './prism-output.json',
        validate: async (input: string) => {
          const validation = await validatePrismJSON(input);
          return validation || true;
        },
      },
    ]);

    try {
      existingDecks = await loadPrismJSON(jsonPath);
      oldProcessedData = processDecks(existingDecks);

      console.log();
      console.log(chalk.green('✓'), `Loaded ${existingDecks.length} decks (${oldProcessedData.cards.length} unique cards)`);
      existingDecks.forEach((deck, i) => {
        console.log(`  ${i + 1}. ${deck.name} (${chalk.bold(deck.assignedColor)})`);
      });
      console.log();

      // Menu: add/edit/remove/done
      let editing = true;
      while (editing) {
        const { action } = await inquirer.prompt<{
          action: 'add' | 'edit' | 'remove' | 'done';
        }>([
          {
            type: 'list',
            name: 'action',
            message: 'What would you like to do?',
            choices: [
              { name: 'Add more decks', value: 'add' },
              { name: 'Edit existing deck', value: 'edit' },
              { name: 'Remove a deck', value: 'remove' },
              { name: 'Done (regenerate outputs)', value: 'done' },
            ],
          },
        ]);

        if (action === 'add') {
          const newDecks = await collectNewDecks(existingDecks.length);
          existingDecks.push(...newDecks);
        } else if (action === 'edit') {
          await editDeck(existingDecks);
        } else if (action === 'remove') {
          await removeDeck(existingDecks);
        } else {
          editing = false;
        }
      }
    } catch (error) {
      displayError(`Failed to load JSON: ${error}`);
      process.exit(1);
    }
  } else {
    // New collection
    existingDecks = await collectNewDecks(0);
  }

  // Process decks
  const processedData = processDecks(existingDecks);

  // Display summary
  console.log();
  displayDecksSummary(processedData);
  displayProcessingSummary(processedData);

  // Calculate delta if we loaded from existing
  const delta = calculateDelta(oldProcessedData, processedData);

  if (oldProcessedData) {
    console.log(chalk.bold.cyan('━━━ CHANGES ━━━'));
    console.log(`New cards: ${chalk.green(delta.summary.newCards)}`);
    console.log(`Updated cards: ${chalk.yellow(delta.summary.updatedCards)}`);
    console.log(`Removed cards: ${chalk.red(delta.summary.removedCards)}`);
    console.log();
  }

  // Ask for output file paths
  const { csvPath, changesPath, jsonPath } = await inquirer.prompt<{
    csvPath: string;
    changesPath: string;
    jsonPath: string;
  }>([
    {
      type: 'input',
      name: 'csvPath',
      message: 'Save full reference CSV to:',
      default: './prism-output.csv',
    },
    {
      type: 'input',
      name: 'changesPath',
      message: 'Save changes CSV to:',
      default: './prism-changes.csv',
      when: () => oldProcessedData !== null,
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
    console.log(chalk.bold.cyan('━━━ OUTPUT ━━━'));
    console.log(chalk.green('✓'), 'Files saved!');
    console.log('  Full CSV:', chalk.bold(resolvedCsvPath), chalk.dim(`(${processedData.cards.length} cards)`));

    // Write changes CSV if there was a delta
    if (oldProcessedData && changesPath) {
      const resolvedChangesPath = resolve(changesPath);
      await writeChangesCSVFile(delta, resolvedChangesPath);
      console.log('  Changes CSV:', chalk.bold(resolvedChangesPath), chalk.dim(`(${delta.changes.length} changes)`));
    }

    console.log('  JSON:', chalk.bold(resolvedJsonPath));
    console.log();
    console.log(chalk.bold.green('Ready to mark your sleeves! 🎨'));
  } catch (error) {
    displayError(`Failed to write output files: ${error}`);
    process.exit(1);
  }
}

/**
 * Collects new decks from user
 *
 * @param startingCount - Number of existing decks (for display)
 * @returns Array of new decks
 */
async function collectNewDecks(startingCount: number): Promise<Deck[]> {
  const { deckCount } = await inquirer.prompt<{ deckCount: number }>([
    {
      type: 'number',
      name: 'deckCount',
      message: 'How many decks would you like to add? (1-10):',
      default: startingCount === 0 ? 2 : 1,
      validate: (input: number) => {
        const totalDecks = startingCount + input;
        if (totalDecks > 10) {
          return `Too many decks total (${totalDecks}). Maximum is 10.`;
        }
        const validation = validateDeckCount(input);
        if (!validation.isValid) {
          return validation.errors[0];
        }
        return true;
      },
    },
  ]);

  console.log();

  const newDecks: Deck[] = [];

  for (let i = 0; i < deckCount; i++) {
    displayDeckHeader(startingCount + i + 1, startingCount + deckCount);

    const deckInput = await collectDeckInput();
    const deck = await parseDeck(deckInput);

    if (deck) {
      newDecks.push(deck);
      displayDeckParsed(deck.name, deck.cards.length, deck.assignedColor || '(will assign)');
    } else {
      // Parsing failed, retry this deck
      i--;
    }
  }

  return newDecks;
}

/**
 * Edits an existing deck
 *
 * @param decks - Array of all decks
 */
async function editDeck(decks: Deck[]): Promise<void> {
  const { deckIndex } = await inquirer.prompt<{ deckIndex: number }>([
    {
      type: 'list',
      name: 'deckIndex',
      message: 'Which deck would you like to edit?',
      choices: decks.map((deck, i) => ({
        name: `${deck.name} (${deck.assignedColor})`,
        value: i,
      })),
    },
  ]);

  const deck = decks[deckIndex];

  console.log();
  console.log(`Editing: ${chalk.bold(deck.name)}`);
  console.log();

  const deckInput = await collectDeckInput(deck);
  const updatedDeck = await parseDeck(deckInput);

  if (updatedDeck) {
    // Preserve ID and color
    updatedDeck.id = deck.id;
    updatedDeck.assignedColor = deck.assignedColor;

    // Replace in array
    decks[deckIndex] = updatedDeck;

    console.log(chalk.green('✓'), 'Deck updated');
    console.log();
  }
}

/**
 * Removes a deck from the collection
 *
 * @param decks - Array of all decks
 */
async function removeDeck(decks: Deck[]): Promise<void> {
  const { deckIndex } = await inquirer.prompt<{ deckIndex: number }>([
    {
      type: 'list',
      name: 'deckIndex',
      message: 'Which deck would you like to remove?',
      choices: decks.map((deck, i) => ({
        name: `${deck.name} (${deck.assignedColor})`,
        value: i,
      })),
    },
  ]);

  const deck = decks[deckIndex];

  const { confirm } = await inquirer.prompt<{ confirm: boolean }>([
    {
      type: 'confirm',
      name: 'confirm',
      message: `Remove "${deck.name}"? This will update marks for all affected cards.`,
      default: false,
    },
  ]);

  if (confirm) {
    decks.splice(deckIndex, 1);
    console.log(chalk.green('✓'), 'Deck removed');
    console.log();
  }
}

/**
 * Collects deck input from user
 *
 * @param existingDeck - Optional existing deck to pre-fill values
 */
async function collectDeckInput(existingDeck?: Deck): Promise<DeckInput> {
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
      default: existingDeck?.name,
      validate: (input: string) => {
        return input.trim().length > 0 || 'Deck name cannot be empty';
      },
    },
    {
      type: 'input',
      name: 'commander',
      message: 'Commander:',
      default: existingDeck?.commander,
      validate: (input: string) => {
        return input.trim().length > 0 || 'Commander name cannot be empty';
      },
    },
    {
      type: 'number',
      name: 'bracket',
      message: 'Bracket level (1-4):',
      default: existingDeck?.bracket || 2,
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
      return collectDeckInput(existingDeck); // Retry
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
