/**
 * Terminal Summary Display
 * Formats and displays summary information to the console
 */

import chalk from 'chalk';
import { ProcessedData } from '../core/types.js';

/**
 * Displays deck parsing confirmation
 *
 * @param deckName - Name of the deck
 * @param cardCount - Number of cards parsed
 * @param color - Assigned color
 */
export function displayDeckParsed(deckName: string, cardCount: number, color: string): void {
  console.log(chalk.green('✓'), `Parsed ${cardCount} cards for "${deckName}"`);
  console.log('  Assigned color:', chalk.bold(color));
  console.log();
}

/**
 * Displays processing summary
 *
 * @param data - Processed deck data
 */
export function displayProcessingSummary(data: ProcessedData): void {
  const stats = data.stats;

  console.log(chalk.bold.cyan('━━━ PROCESSING ━━━'));
  console.log(`Analyzing ${stats.totalDecks} decks with ${stats.totalCardSlots} total card slots...`);
  console.log();

  console.log(chalk.green('✓'), `Found ${stats.totalUniqueCards} unique cards`);
  console.log(chalk.green('✓'), `${stats.sharedCards} cards appear in multiple decks`);
  console.log(chalk.green('✓'), chalk.bold(`You only need ${stats.totalUniqueCards} physical cards!`));

  const saved = stats.totalCardSlots - stats.totalUniqueCards;
  if (saved > 0) {
    console.log(chalk.dim(`  (That's ${saved} fewer cards than owning complete copies of each deck)`));
  }

  console.log();

  // Display top shared cards
  if (stats.mostSharedCards.length > 0) {
    console.log(chalk.bold('Top shared cards:'));
    for (const card of stats.mostSharedCards) {
      const deckColors = data.cards
        .find(c => c.name === card.name)
        ?.markSlots.map(slot => chalk.bold(slot.color))
        .join(', ');

      console.log(
        '  •',
        chalk.bold(card.name),
        '—',
        `in ${card.count} decks`,
        `(${deckColors})`
      );
    }
    console.log();
  }
}

/**
 * Displays deck summary header
 *
 * @param index - Deck number (1-based)
 * @param total - Total number of decks
 */
export function displayDeckHeader(index: number, total: number): void {
  console.log(chalk.bold.cyan(`━━━ DECK ${index} of ${total} ━━━`));
}

/**
 * Displays final output confirmation
 *
 * @param csvPath - Path to CSV file
 * @param jsonPath - Path to JSON file
 * @param cardCount - Number of unique cards
 */
export function displayOutputConfirmation(
  csvPath: string,
  jsonPath: string,
  cardCount: number
): void {
  console.log(chalk.bold.cyan('━━━ OUTPUT ━━━'));
  console.log(chalk.green('✓'), 'Files saved!');
  console.log('  CSV:', chalk.bold(csvPath), chalk.dim(`(${cardCount} cards)`));
  console.log('  JSON:', chalk.bold(jsonPath));
  console.log();
  console.log(chalk.bold.green('Ready to mark your sleeves! 🎨'));
}

/**
 * Displays welcome banner
 */
export function displayWelcome(): void {
  console.log();
  console.log(chalk.bold.magenta('🔮 PRISM'), '—', chalk.bold('Personal Resource Inventory & Sleeve Marking'));
  console.log(chalk.dim('   Share cards across Commander decks with confidence!'));
  console.log();
}

/**
 * Displays an error message
 *
 * @param message - Error message
 */
export function displayError(message: string): void {
  console.log(chalk.red('✗'), message);
}

/**
 * Displays a warning message
 *
 * @param message - Warning message
 */
export function displayWarning(message: string): void {
  console.log(chalk.yellow('⚠'), message);
}

/**
 * Displays deck summary after all decks are collected
 *
 * @param data - Processed data
 */
export function displayDecksSummary(data: ProcessedData): void {
  console.log(chalk.bold.cyan('━━━ YOUR DECKS ━━━'));
  console.log();

  for (const deck of data.decks) {
    const cardCount = deck.cards.reduce((sum, card) => sum + card.quantity, 0);
    const sharedCount = data.cards.filter(c => c.deckIds.includes(deck.id) && c.totalDecks > 1).length;

    console.log(chalk.bold(deck.name));
    console.log('  Commander:', deck.commander);
    console.log('  Bracket:', deck.bracket);
    console.log('  Color:', chalk.bold(deck.assignedColor));
    console.log('  Cards:', cardCount, chalk.dim(`(${sharedCount} shared with other decks)`));
    console.log();
  }
}
