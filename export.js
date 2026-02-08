/**
 * PRISM Export Module
 * Handles CSV and JSON export generation
 */

import { processCards, getColorName } from './processor.js';

/**
 * Escape a value for CSV (handle commas, quotes, newlines)
 * @param {*} value - The value to escape
 * @returns {string} CSV-safe string
 */
function escapeCSV(value) {
  if (value === null || value === undefined) return '';
  
  const str = String(value);
  
  // If the value contains comma, quote, or newline, wrap in quotes and escape internal quotes
  if (str.includes(',') || str.includes('"') || str.includes('\n')) {
    return `"${str.replace(/"/g, '""')}"`;
  }
  
  return str;
}

/**
 * Generate a stripe summary string for display
 * @param {Array} stripes - Array of stripe objects
 * @returns {string} Human-readable summary
 */
function generateStripeSummary(stripes) {
  return stripes
    .map(s => `Slot ${s.position}: ${getColorName(s.color)} (${s.deckName})`)
    .join('; ');
}

/**
 * Export PRISM data as CSV
 * @param {Object} prism - The PRISM to export
 * @returns {string} CSV content
 */
export function exportToCSV(prism) {
  const processedCards = processCards(prism);
  
  // Build header row
  // Fixed columns + up to 15 slot columns (3 columns each: Color, Deck, Bracket)
  const headers = [
    'Card Name',
    'Is Basic Land',
    'Copies Needed',
    'Total Decks',
    'Stripe Summary'
  ];
  
  // Add slot columns for each possible position (1-15)
  for (let i = 1; i <= 15; i++) {
    headers.push(`Slot ${i} Color`);
    headers.push(`Slot ${i} Deck`);
    headers.push(`Slot ${i} Bracket`);
  }
  
  const rows = [headers.map(escapeCSV).join(',')];
  
  // Add data rows
  for (const card of processedCards) {
    const row = [
      escapeCSV(card.name),
      escapeCSV(card.isBasicLand ? 'Yes' : 'No'),
      escapeCSV(card.totalQuantity),
      escapeCSV(card.deckCount),
      escapeCSV(generateStripeSummary(card.stripes))
    ];
    
    // Create a map of position -> stripe for easy lookup
    const stripeMap = new Map(card.stripes.map(s => [s.position, s]));
    
    // Add slot columns
    for (let i = 1; i <= 15; i++) {
      const stripe = stripeMap.get(i);
      if (stripe) {
        row.push(escapeCSV(getColorName(stripe.color)));
        row.push(escapeCSV(stripe.deckName));
        row.push(escapeCSV(stripe.bracket));
      } else {
        row.push('');
        row.push('');
        row.push('');
      }
    }
    
    rows.push(row.join(','));
  }
  
  return rows.join('\n');
}

/**
 * Export PRISM data as JSON
 * @param {Object} prism - The PRISM to export
 * @returns {string} JSON content
 */
export function exportToJSON(prism) {
  const processedCards = processCards(prism);
  
  const exportData = {
    prism: {
      id: prism.id,
      name: prism.name,
      exportedAt: new Date().toISOString(),
      deckCount: prism.decks.length,
      decks: prism.decks.map(deck => ({
        id: deck.id,
        name: deck.name,
        commander: deck.commander,
        bracket: deck.bracket,
        color: deck.color,
        colorName: getColorName(deck.color),
        stripePosition: deck.stripePosition,
        cardCount: deck.cards.length,
        cards: deck.cards, // Include full cards for re-import
        createdAt: deck.createdAt,
        updatedAt: deck.updatedAt
      })),
      cards: processedCards.map(card => ({
        name: card.name,
        isBasicLand: card.isBasicLand,
        copiesNeeded: card.totalQuantity,
        deckCount: card.deckCount,
        stripes: card.stripes.map(s => ({
          position: s.position,
          color: s.color,
          colorName: getColorName(s.color),
          deckName: s.deckName,
          deckId: s.deckId,
          bracket: s.bracket
        }))
      })),
      statistics: {
        totalUniqueCards: processedCards.length,
        sharedCards: processedCards.filter(c => c.deckCount > 1).length,
        uniqueCards: processedCards.filter(c => c.deckCount === 1).length
      }
    }
  };
  
  return JSON.stringify(exportData, null, 2);
}

/**
 * Trigger a file download in the browser
 * @param {string} content - File content
 * @param {string} filename - Suggested filename
 * @param {string} mimeType - MIME type for the file
 */
export function downloadFile(content, filename, mimeType) {
  const blob = new Blob([content], { type: mimeType });
  const url = URL.createObjectURL(blob);
  
  const link = document.createElement('a');
  link.href = url;
  link.download = filename;
  document.body.appendChild(link);
  link.click();
  document.body.removeChild(link);
  
  URL.revokeObjectURL(url);
}

/**
 * Export and download as CSV
 * @param {Object} prism - The PRISM to export
 */
export function downloadCSV(prism) {
  const csv = exportToCSV(prism);
  const safeName = prism.name.replace(/[^a-z0-9]/gi, '_').toLowerCase();
  downloadFile(csv, `prism_${safeName}.csv`, 'text/csv');
}

/**
 * Export and download as JSON
 * @param {Object} prism - The PRISM to export
 */
export function downloadJSON(prism) {
  const json = exportToJSON(prism);
  const safeName = prism.name.replace(/[^a-z0-9]/gi, '_').toLowerCase();
  downloadFile(json, `prism_${safeName}.json`, 'application/json');
}

/**
 * Generate a printable marking guide (HTML)
 * @param {Object} prism - The PRISM to export
 * @returns {string} HTML content for printing
 */
export function generatePrintableGuide(prism) {
  const processedCards = processCards(prism);
  
  let html = `
<!DOCTYPE html>
<html>
<head>
  <title>PRISM Marking Guide - ${prism.name}</title>
  <style>
    body { font-family: system-ui, sans-serif; padding: 20px; max-width: 800px; margin: 0 auto; }
    h1 { border-bottom: 2px solid #333; padding-bottom: 10px; }
    .deck-legend { display: flex; flex-wrap: wrap; gap: 15px; margin-bottom: 20px; padding: 15px; background: #f5f5f5; border-radius: 8px; }
    .deck-item { display: flex; align-items: center; gap: 8px; }
    .color-swatch {
      width: 24px;
      height: 24px;
      border-radius: 4px;
      border: 2px solid #333;
      -webkit-print-color-adjust: exact !important;
      print-color-adjust: exact !important;
      color-adjust: exact !important;
    }
    table { width: 100%; border-collapse: collapse; margin-top: 20px; }
    th, td { padding: 8px 12px; text-align: left; border-bottom: 1px solid #ddd; }
    th { background: #f0f0f0; }
    .stripe-indicator { display: inline-flex; gap: 4px; }
    .stripe-dot {
      width: 16px;
      height: 16px;
      border-radius: 3px;
      border: 2px solid #333;
      -webkit-print-color-adjust: exact !important;
      print-color-adjust: exact !important;
      color-adjust: exact !important;
    }
    .stripe-empty {
      width: 16px;
      height: 16px;
      border-radius: 3px;
      border: 1px dashed #999;
      background: transparent;
    }
    .shared { background: #fffde7; }
    .basic-land { font-style: italic; }

    /* Force backgrounds to print */
    * {
      -webkit-print-color-adjust: exact !important;
      print-color-adjust: exact !important;
      color-adjust: exact !important;
    }

    @media print {
      .no-print { display: none; }
      body { padding: 10px; }
      .deck-legend { background: #f5f5f5 !important; }
      .shared { background: #fffde7 !important; }
      th { background: #f0f0f0 !important; }
    }
  </style>
</head>
<body>
  <h1>🔮 PRISM Marking Guide</h1>
  <p><strong>${prism.name}</strong> — ${prism.decks.length} decks, ${processedCards.length} unique cards</p>
  
  <h2>Deck Legend</h2>
  <div class="deck-legend">
`;

  // Add deck legend
  for (const deck of prism.decks.sort((a, b) => a.stripePosition - b.stripePosition)) {
    html += `
    <div class="deck-item">
      <div class="color-swatch" style="background: ${deck.color}"></div>
      <span><strong>Slot ${deck.stripePosition}:</strong> ${deck.name} (Bracket ${deck.bracket})</span>
    </div>`;
  }
  
  html += `
  </div>
  
  <h2>Card Marking Guide</h2>
  <p>Cards are sorted by number of decks (most shared first), then alphabetically.</p>
  
  <table>
    <thead>
      <tr>
        <th>Card Name</th>
        <th>Copies</th>
        <th>Stripe Positions</th>
      </tr>
    </thead>
    <tbody>
`;

  const totalDecks = prism.decks.length;

  // Add card rows
  for (const card of processedCards) {
    const rowClass = card.deckCount > 1 ? 'shared' : '';
    const nameClass = card.isBasicLand ? 'basic-land' : '';

    // Show all slots with empty placeholders
    const stripeMap = new Map(card.stripes.map(s => [s.position, s]));
    let stripeIndicators = '';
    for (let i = 1; i <= totalDecks; i++) {
      const stripe = stripeMap.get(i);
      if (stripe) {
        stripeIndicators += `<div class="stripe-dot" style="background: ${stripe.color}" title="Slot ${stripe.position}: ${stripe.deckName}"></div>`;
      } else {
        stripeIndicators += `<div class="stripe-empty" title="Slot ${i}: Empty"></div>`;
      }
    }

    html += `
      <tr class="${rowClass}">
        <td class="${nameClass}">${card.name}${card.isBasicLand ? ' (Basic)' : ''}</td>
        <td>${card.totalQuantity}</td>
        <td><div class="stripe-indicator">${stripeIndicators}</div></td>
      </tr>`;
  }
  
  html += `
    </tbody>
  </table>
  
  <p style="margin-top: 30px; color: #666; font-size: 0.9em;">
    Generated by PRISM on ${new Date().toLocaleString()}
  </p>
</body>
</html>
`;

  return html;
}

/**
 * Open printable guide in new window
 * @param {Object} prism - The PRISM to export
 */
export function openPrintableGuide(prism) {
  const html = generatePrintableGuide(prism);
  const win = window.open('', '_blank');
  win.document.write(html);
  win.document.close();
}
