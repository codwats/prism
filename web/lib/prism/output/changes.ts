/**
 * Changes CSV Generator
 * Generates CSV file showing what changed between PRISM states
 */

import { stringify } from 'csv-stringify/sync';
import { PrismDelta } from '../core/types';

/**
 * Generates changes CSV content from delta
 *
 * Format:
 * - Card Name, Action, Old Marks, New Marks, What to Do
 *
 * @param delta - Delta between old and new states
 * @returns CSV string
 */
export function generateChangesCSV(delta: PrismDelta): string {
  // Build header row
  const headers = ['Card Name', 'Action', 'Old Marks', 'New Marks', 'What to Do'];

  // Build data rows
  const rows = delta.changes.map(change => {
    return [
      change.cardName,
      change.action,
      change.oldMarkSummary || '(none)',
      change.newMarkSummary || '(none)',
      change.physicalAction,
    ];
  });

  // Generate CSV
  return stringify([headers, ...rows], {
    quoted: true,
    quoted_empty: false,
  });
}

