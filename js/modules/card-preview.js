// Card preview with stripe overlay

import { fetchCard } from './scryfall.js';
import { getPreferences } from './storage.js';

// Strip back-face name from DFCs for Scryfall lookup
// "Bala Ged Recovery // Bala Ged Sanctuary" → "Bala Ged Recovery"
function frontFaceName(name) {
  const idx = name.indexOf(' // ');
  return idx !== -1 ? name.substring(0, idx) : name;
}

// Display dimensions (half of Scryfall 'normal' 488x680)
const DISPLAY_WIDTH = 244;
const DISPLAY_HEIGHT = 340;
const SCALE = 0.5; // Display scale factor

// Stripe positioning at display scale
// 24 slots per side, spanning the card art area
const STRIPE_START_Y = 28;   // Start just below title bar
const STRIPE_SLOT_HEIGHT = 12; // Spacing between stripe positions
const SLOTS_PER_SIDE = 24;
const STRIPE_END_Y = STRIPE_START_Y + (SLOTS_PER_SIDE - 1) * STRIPE_SLOT_HEIGHT;

// Parse corner preference into rendering config
function getCornerConfig() {
  const prefs = getPreferences();
  const corner = prefs.stripeStartCorner || 'top-right';
  return {
    sideARight: corner.includes('right'),  // Side A stripes on right edge
    topDown: corner.includes('top'),        // Position 1 at top
  };
}

// Get Y position for a stripe at display scale
// Supports top-down (position 1 at top) or bottom-up (position 1 at bottom)
function getStripeY(position, topDown = true) {
  const index = position <= SLOTS_PER_SIDE
    ? position - 1
    : position - SLOTS_PER_SIDE - 1;
  if (topDown) {
    return STRIPE_START_Y + index * STRIPE_SLOT_HEIGHT;
  }
  return STRIPE_END_Y - index * STRIPE_SLOT_HEIGHT;
}

// Resolve which edge a slot lives on, purely from position + corner preference.
// Slots 1-24 live on the primary edge; slots 25-48 live on the opposite edge.
function getStripeEdge(position, sideARight) {
  const onPrimaryEdge = position <= SLOTS_PER_SIDE;
  const onRight = onPrimaryEdge ? sideARight : !sideARight;
  return { onRight };
}

// Create stripe overlay element
function createStripeOverlay(stripes) {
  const container = document.createElement('div');
  container.className = 'card-preview-stripes';
  const { sideARight, topDown } = getCornerConfig();

  // Build per-group dot local indices for offset computation
  const groupDotCounters = new Map();
  for (const stripe of stripes) {
    if (stripe.markType === 'dot') {
      if (!groupDotCounters.has(stripe.groupId)) groupDotCounters.set(stripe.groupId, 0);
    }
  }

  for (const stripe of stripes) {
    // Handle dot-style variants
    if (stripe.markType === 'dot') {
      const dot = document.createElement('div');
      // Dots go inward from the parent stripe's edge, wherever that edge lives
      const { onRight: parentOnRight } = getStripeEdge(stripe.position, sideARight);
      const dotOnLeft = parentOnRight;
      dot.className = `stripe-dot-mark${dotOnLeft ? '' : ' stripe-dot-mark-right'}`;
      dot.style.backgroundColor = stripe.color;
      dot.style.top = `${getStripeY(stripe.position, topDown)}px`;

      // Offset multiple dots horizontally so they don't overlap, using local group index
      const insetBase = 28;
      const dotSpacing = 10;
      const localIndex = groupDotCounters.get(stripe.groupId);
      groupDotCounters.set(stripe.groupId, localIndex + 1);
      const offset = insetBase + localIndex * dotSpacing;
      if (dotOnLeft) {
        dot.style.right = `${offset}px`;
      } else {
        dot.style.left = `${offset}px`;
      }

      dot.title = `${stripe.deckName} (Dot)`;
      container.appendChild(dot);
      continue;
    }

    // Membership entries carry deckId for filtering only — not rendered visually
    if (stripe.markType === 'membership') continue;

    // Standard stripe rendering — edge derived purely from position + corner
    const mark = document.createElement('div');
    const { onRight } = getStripeEdge(stripe.position, sideARight);
    mark.className = `stripe-mark${onRight ? '' : ' stripe-mark-left'}`;
    mark.style.backgroundColor = stripe.color;
    mark.style.top = `${getStripeY(stripe.position, topDown)}px`;

    const sideLabel = stripe.position > SLOTS_PER_SIDE ? 'Side B' : 'Side A';
    mark.title = `${stripe.deckName} (${sideLabel} · Slot ${stripe.position})`;

    container.appendChild(mark);
  }

  return container;
}

// Create loading placeholder
function createLoadingElement() {
  const container = document.createElement('div');
  container.className = 'card-preview-container card-preview-loading';

  const spinner = document.createElement('wa-spinner');
  spinner.setAttribute('size', 'large');
  container.appendChild(spinner);

  return container;
}

// Create error placeholder
function createErrorElement(message) {
  const container = document.createElement('div');
  container.className = 'card-preview-container card-preview-error';

  const icon = document.createElement('wa-icon');
  icon.setAttribute('name', 'image-slash');
  icon.style.fontSize = '3rem';
  icon.style.color = 'var(--wa-color-neutral-text-subtle)';

  const text = document.createElement('p');
  text.textContent = message || 'Image not available';
  text.style.color = 'var(--wa-color-neutral-text-subtle)';
  text.style.marginTop = 'var(--wa-space-s)';

  container.appendChild(icon);
  container.appendChild(text);

  return container;
}

// Create full preview element with image and stripes
function createPreviewElement(imageUri, stripes) {
  const container = document.createElement('div');
  container.className = 'card-preview-container';

  const img = document.createElement('img');
  img.className = 'card-preview-image';
  img.src = imageUri;
  img.alt = 'Card preview';
  img.loading = 'eager';

  container.appendChild(img);
  container.appendChild(createStripeOverlay(stripes));

  return container;
}

// Position tooltip near cursor, keeping it in viewport
function positionTooltip(tooltip, event) {
  const padding = 20;

  // First, make tooltip visible to measure it
  tooltip.hidden = false;
  tooltip.style.visibility = 'hidden';

  const rect = tooltip.getBoundingClientRect();
  const tooltipWidth = rect.width || DISPLAY_WIDTH + 20;
  const tooltipHeight = rect.height || DISPLAY_HEIGHT + 20;

  let x = event.clientX + padding;
  let y = event.clientY + padding;

  // Keep within viewport
  if (x + tooltipWidth > window.innerWidth) {
    x = event.clientX - tooltipWidth - padding;
  }
  if (y + tooltipHeight > window.innerHeight) {
    y = Math.max(padding, window.innerHeight - tooltipHeight - padding);
  }

  // Ensure not off left or top edge
  x = Math.max(padding, x);
  y = Math.max(padding, y);

  tooltip.style.left = `${x}px`;
  tooltip.style.top = `${y}px`;
  tooltip.style.visibility = 'visible';
}

// Tooltip element reference
let tooltipElement = null;
let currentCardName = null;

// Get or create tooltip element
function getTooltip() {
  if (!tooltipElement) {
    tooltipElement = document.getElementById('card-preview-tooltip');
  }
  return tooltipElement;
}

// Show preview for a card
export async function showPreview(cardName, stripes, event) {
  const tooltip = getTooltip();
  if (!tooltip) return;

  // Avoid refetching if same card
  if (currentCardName === cardName && !tooltip.hidden) {
    positionTooltip(tooltip, event);
    return;
  }

  currentCardName = cardName;

  // Show loading state
  tooltip.innerHTML = '';
  tooltip.appendChild(createLoadingElement());
  positionTooltip(tooltip, event);

  try {
    const cardData = await fetchCard(frontFaceName(cardName));

    // Check if we're still showing this card (user might have moved away)
    if (currentCardName !== cardName) return;

    if (!cardData.image_uri) {
      throw new Error('No image available');
    }

    // Preload image before showing
    const img = new Image();
    img.src = cardData.image_uri;

    await new Promise((resolve, reject) => {
      img.onload = resolve;
      img.onerror = reject;
    });

    // Check again if still showing this card
    if (currentCardName !== cardName) return;

    // Show preview with stripes
    tooltip.innerHTML = '';
    tooltip.appendChild(createPreviewElement(cardData.image_uri, stripes));
    positionTooltip(tooltip, event);
  } catch (error) {
    console.warn(`Failed to load card preview for "${cardName}":`, error.message);

    // Check if still showing this card
    if (currentCardName !== cardName) return;

    tooltip.innerHTML = '';
    tooltip.appendChild(createErrorElement());
    positionTooltip(tooltip, event);
  }
}

// Hide the preview
export function hidePreview() {
  const tooltip = getTooltip();
  if (tooltip) {
    tooltip.hidden = true;
    currentCardName = null;
  }
}

// Update tooltip position (for mousemove)
export function updatePosition(event) {
  const tooltip = getTooltip();
  if (tooltip && !tooltip.hidden) {
    positionTooltip(tooltip, event);
  }
}
