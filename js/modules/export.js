/**
 * PRISM Export Module
 * Handles CSV and JSON export generation
 */

import { processCards, getColorName, formatSlotLabel } from './processor.js';

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
    .map(s => `${formatSlotLabel(s.position)}: ${getColorName(s.color)} (${s.deckName})`)
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
  // Fixed columns + slot columns (3 columns each: Color, Deck, Bracket)
  const headers = [
    'Card Name',
    'Is Basic Land',
    'Copies Needed',
    'Total Decks',
    'Stripe Summary'
  ];

  // Determine all used positions (deck positions + split group Side A positions)
  const allPositions = [
    ...(prism.decks || []).map(d => d.stripePosition),
    ...(prism.splitGroups || []).map(g => g.sideAPosition)
  ];
  const maxSlot = allPositions.length > 0 ? Math.max(...allPositions) : 0;

  // Add slot columns for each position up to the max used
  for (let i = 1; i <= maxSlot; i++) {
    const label = formatSlotLabel(i);
    headers.push(`${label} Color`);
    headers.push(`${label} Deck`);
    headers.push(`${label} Bracket`);
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
    for (let i = 1; i <= maxSlot; i++) {
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
      splitGroups: (prism.splitGroups || []).map(group => ({
        id: group.id,
        name: group.name,
        sideAPosition: group.sideAPosition,
        sideAColor: group.sideAColor,
        sideAColorName: getColorName(group.sideAColor),
        splitStyle: group.splitStyle || 'stripes',
        childDeckIds: group.childDeckIds
      })),
      decks: prism.decks.map(deck => ({
        id: deck.id,
        name: deck.name,
        commander: deck.commander,
        bracket: deck.bracket,
        color: deck.color,
        colorName: getColorName(deck.color),
        stripePosition: deck.stripePosition,
        side: deck.splitGroupId ? 'b' : 'a',
        splitGroupId: deck.splitGroupId || null,
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
        stripes: card.stripes.filter(s => s.markType !== 'membership').map(s => ({
          position: s.position,
          side: s.side,
          slotLabel: formatSlotLabel(s.position),
          color: s.color,
          colorName: getColorName(s.color),
          deckName: s.deckName,
          deckId: s.deckId,
          groupId: s.groupId || null,
          bracket: s.bracket,
          markType: s.markType || 'stripe'
        }))
      })),
      markedCards: prism.markedCards || [],
      removedCards: prism.removedCards || [],
      statistics: {
        totalUniqueCards: processedCards.length,
        sharedCards: processedCards.filter(c => c.logicalDeckCount > 1).length,
        uniqueCards: processedCards.filter(c => c.logicalDeckCount === 1).length,
        markedCards: (prism.markedCards || []).length,
        removedCards: (prism.removedCards || []).length
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
  const splitGroups = prism.splitGroups || [];

  let html = `
<!DOCTYPE html>
<html>
<head>
  <title>PRISM Marking Guide - ${prism.name}</title>
  <style>
    body { font-family: system-ui, sans-serif; padding: 20px; max-width: 800px; margin: 0 auto; }
    h1 { border-bottom: 2px solid #333; padding-bottom: 10px; }
    .deck-legend { display: flex; flex-wrap: wrap; gap: 12px; margin-bottom: 20px; padding: 15px; background: #f5f5f5; border-radius: 8px; }
    .deck-item { display: flex; align-items: center; gap: 8px; }
    .color-swatch {
      width: 24px;
      height: 24px;
      border-radius: 4px;
      border: 2px solid #333;
      flex-shrink: 0;
      -webkit-print-color-adjust: exact !important;
      print-color-adjust: exact !important;
      color-adjust: exact !important;
    }
    .color-swatch.side-b { border-style: dashed; }
    /* ö-style slot: dot above square */
    .stripe-slot {
      display: flex;
      flex-direction: column;
      align-items: center;
      gap: 2px;
    }
    .slot-dot-row {
      display: flex;
      gap: 2px;
      min-height: 9px;
      align-items: center;
      justify-content: center;
    }
    .variant-dot {
      width: 8px;
      height: 8px;
      border-radius: 50%;
      border: 1.5px solid #333;
      flex-shrink: 0;
      -webkit-print-color-adjust: exact !important;
      print-color-adjust: exact !important;
      color-adjust: exact !important;
    }
    .stripe-square {
      width: 16px;
      height: 16px;
      border-radius: 3px;
      border: 2px solid #333;
      flex-shrink: 0;
      -webkit-print-color-adjust: exact !important;
      print-color-adjust: exact !important;
      color-adjust: exact !important;
    }
    .stripe-square.side-b { border-style: dashed; }
    .stripe-empty {
      width: 16px;
      height: 16px;
      border-radius: 3px;
      border: 1px dashed #ccc;
      background: transparent;
    }
    /* legend mini ö swatch */
    .legend-slot {
      display: flex;
      flex-direction: column;
      align-items: center;
      gap: 2px;
      flex-shrink: 0;
    }
    .legend-dot-row {
      display: flex;
      gap: 2px;
      min-height: 9px;
      align-items: center;
      justify-content: center;
    }
    table { width: 100%; border-collapse: collapse; margin-top: 20px; }
    th, td { padding: 8px 12px; text-align: left; border-bottom: 1px solid #ddd; vertical-align: middle; }
    th { background: #f0f0f0; }
    .stripe-indicator { display: inline-flex; gap: 4px; align-items: flex-end; }
    .symbol-key { display: flex; flex-wrap: wrap; gap: 12px; align-items: center; font-size: 0.85em; padding: 10px 14px; background: #f0f0f0; border-radius: 6px; margin-bottom: 12px; }
    .key-item { display: flex; align-items: center; gap: 5px; }
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
      .symbol-key { background: #f0f0f0 !important; }
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

  // Split group legend entries
  for (const group of [...splitGroups].sort((a, b) => a.sideAPosition - b.sideAPosition)) {
    const isDots = (group.splitStyle || 'stripes') === 'dots';
    html += `
    <div class="deck-item" style="width: 100%;">
      <div class="color-swatch" style="background: ${group.sideAColor}"></div>
      <span><strong>${formatSlotLabel(group.sideAPosition, 'a')}:</strong> ${group.name} (split group · ${isDots ? 'dot variants' : 'stripe variants'})</span>
    </div>`;

    const childDecks = prism.decks
      .filter(d => group.childDeckIds.includes(d.id))
      .sort((a, b) => group.childDeckIds.indexOf(a.id) - group.childDeckIds.indexOf(b.id));

    if (isDots) {
      for (const deck of childDecks) {
        const dotHtml = `<div class="variant-dot" style="background: ${deck.color}" title="${deck.name}"></div>`;
        html += `
    <div class="deck-item" style="padding-left: 20px;">
      <div class="legend-slot">
        <div class="legend-dot-row">${dotHtml}</div>
        <div class="stripe-square" style="background: ${group.sideAColor}"></div>
      </div>
      <span>${deck.name} · Bracket ${deck.bracket}</span>
    </div>`;
      }
    } else {
      for (const deck of childDecks) {
        html += `
    <div class="deck-item" style="padding-left: 20px;">
      <div class="color-swatch side-b" style="background: ${deck.color}"></div>
      <span><strong>${formatSlotLabel(deck.stripePosition, 'b')}:</strong> ${deck.name} (Side B) · Bracket ${deck.bracket}</span>
    </div>`;
      }
    }
  }

  // Standalone deck legend entries
  for (const deck of prism.decks.filter(d => !d.splitGroupId).sort((a, b) => a.stripePosition - b.stripePosition)) {
    html += `
    <div class="deck-item">
      <div class="color-swatch" style="background: ${deck.color}"></div>
      <span><strong>${formatSlotLabel(deck.stripePosition)}:</strong> ${deck.name} (Bracket ${deck.bracket})</span>
    </div>`;
  }

  const hasDotGroups = splitGroups.some(g => (g.splitStyle || 'stripes') === 'dots');
  const hasSideBStripes = splitGroups.some(g => (g.splitStyle || 'stripes') === 'stripes');

  html += `
  </div>

  <h2>Card Marking Guide</h2>
  <p>Cards sorted by number of decks (most shared first), then alphabetically.</p>

  <div class="symbol-key">
    <strong>Key:</strong>
    <span class="key-item">
      <div class="stripe-slot"><div class="slot-dot-row"></div><div class="stripe-square" style="background:#888"></div></div>
      Side A stripe
    </span>`;

  if (hasSideBStripes) {
    html += `
    <span class="key-item">
      <div class="stripe-slot"><div class="slot-dot-row"></div><div class="stripe-square side-b" style="background:#888"></div></div>
      Side B stripe
    </span>`;
  }

  if (hasDotGroups) {
    html += `
    <span class="key-item">
      <div class="stripe-slot"><div class="slot-dot-row"><div class="variant-dot" style="background:#e74c3c"></div></div><div class="stripe-square" style="background:#888"></div></div>
      card in this variant only
    </span>
    <span class="key-item">
      <div class="stripe-slot"><div class="slot-dot-row"></div><div class="stripe-square" style="background:#888"></div></div>
      card in all variants (no dot)
    </span>`;
  }

  html += `
    <span class="key-item">
      <div class="stripe-slot"><div class="slot-dot-row"></div><div class="stripe-empty"></div></div>
      unused slot
    </span>
  </div>

  <table>
    <thead>
      <tr>
        <th>Card Name</th>
        <th>Stripe Positions</th>
      </tr>
    </thead>
    <tbody>
`;

  // Collect all used positions (from decks + split group Side A positions)
  const allPositions = [...new Set([
    ...prism.decks.map(d => d.stripePosition),
    ...splitGroups.map(g => g.sideAPosition)
  ])].sort((a, b) => a - b);

  // Add card rows
  for (const card of processedCards) {
    const rowClass = card.logicalDeckCount > 1 ? 'shared' : '';
    const nameClass = card.isBasicLand ? 'basic-land' : '';

    // Non-dot stripes by position
    const stripeMap = new Map(card.stripes.filter(s => s.markType !== 'dot' && s.markType !== 'membership').map(s => [s.position, s]));
    // Dots grouped by position
    const dotsByPos = new Map();
    for (const s of card.stripes.filter(s => s.markType === 'dot')) {
      if (!dotsByPos.has(s.position)) dotsByPos.set(s.position, []);
      dotsByPos.get(s.position).push(s);
    }

    let stripeIndicators = '';
    for (const pos of allPositions) {
      const stripe = stripeMap.get(pos);
      const dots = dotsByPos.get(pos) || [];
      const dotHtml = dots.map(d => `<div class="variant-dot" style="background: ${d.color}" title="Dot: ${d.deckName}"></div>`).join('');
      const dotRow = `<div class="slot-dot-row">${dotHtml}</div>`;

      let squareHtml;
      if (stripe) {
        squareHtml = `<div class="stripe-square${stripe.side === 'b' ? ' side-b' : ''}" style="background: ${stripe.color}" title="${formatSlotLabel(stripe.position)}: ${stripe.deckName}"></div>`;
      } else {
        squareHtml = `<div class="stripe-empty" title="${formatSlotLabel(pos)}: Empty"></div>`;
      }

      stripeIndicators += `<div class="stripe-slot">${dotRow}${squareHtml}</div>`;
    }

    html += `
      <tr class="${rowClass}">
        <td class="${nameClass}">${card.name}${card.isBasicLand ? ' (Basic)' : ''}</td>
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

/**
 * Generate a plain-text list of cards not yet marked as done.
 * Format: "QTY CardName" per line (MTGO-compatible, works with Moxfield, proxy services, etc.)
 * @param {Object} prism - The PRISM to export
 * @returns {string} Plain text content
 */
export function exportUndoneTxt(prism) {
  const processedCards = processCards(prism);
  const markedSet = new Set(prism.markedCards || []);

  const lines = processedCards
    .filter(card => !markedSet.has(card.name))
    .map(card => `${card.totalQuantity} ${card.name}`);

  return lines.join('\n');
}

/**
 * Download undone cards list as a .txt file
 * @param {Object} prism - The PRISM to export
 */
export function downloadUndoneTxt(prism) {
  const txt = exportUndoneTxt(prism);
  const safeName = prism.name.replace(/[^a-z0-9]/gi, '_').toLowerCase();
  downloadFile(txt, `prism_${safeName}_undone.txt`, 'text/plain');
}

/**
 * Copy undone cards list to clipboard
 * @param {Object} prism - The PRISM to export
 * @returns {Promise<number>} Count of undone cards copied
 */
export async function copyUndoneToClipboard(prism) {
  const txt = exportUndoneTxt(prism);
  await navigator.clipboard.writeText(txt);
  return txt ? txt.split('\n').length : 0;
}
