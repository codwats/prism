// Card preview with stripe overlay

import { fetchCard } from './scryfall.js';
import { getPreferences, getStripeNumbersMode } from './storage.js';
import { stripeNumberLabel, countVisibleMarks, STRIPE_SPARSE_MAX } from '../core/utils.js';

// Strip back-face name from DFCs for Scryfall lookup
// "Bala Ged Recovery // Bala Ged Sanctuary" → "Bala Ged Recovery"
function frontFaceName(name) {
  const idx = name.indexOf(' // ');
  return idx !== -1 ? name.substring(0, idx) : name;
}

// Display dimensions (half of Scryfall 'normal' 488x680)
const DISPLAY_WIDTH = 244;
const DISPLAY_HEIGHT = 340;

// Stripe positioning at display scale
// 24 slots per side, spanning the card art area
const STRIPE_START_Y = 28;   // Start just below title bar
const STRIPE_SLOT_HEIGHT = 12; // Spacing between stripe positions
const SLOTS_PER_SIDE = 24;
const STRIPE_END_Y = STRIPE_START_Y + (SLOTS_PER_SIDE - 1) * STRIPE_SLOT_HEIGHT;

// Translate a stripeStartCorner value into rendering config.
// Pure — shared with the MPC stripe compositor, which resolves the corner
// from an imported JSON export rather than local preferences.
export function cornerToConfig(corner) {
  const c = corner || 'top-right';
  return {
    sideARight: c.includes('right'),  // Side A stripes on right edge
    topDown: c.includes('top'),        // Position 1 at top
  };
}

// Parse the local corner preference into rendering config
function getCornerConfig() {
  return cornerToConfig(getPreferences().stripeStartCorner);
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
// Exported for the MPC stripe compositor, which mirrors this geometry at print scale.
export function getStripeEdge(position, sideARight) {
  const onPrimaryEdge = position <= SLOTS_PER_SIDE;
  const onRight = onPrimaryEdge ? sideARight : !sideARight;
  return { onRight };
}

// Anchor positions (every 5th slot per side) used for the reference ruler.
// Side A side-relative 5/10/15/20 → positions 5/10/15/20; Side B → 29/34/39/44.
export const RULER_ANCHORS = [5, 10, 15, 20, 29, 34, 39, 44];

// Draw a faint tick + number at every 5th slot down both card edges, regardless
// of which slots the card actually marks — a permanent ruler so any lone stripe
// can be located by eye. Gated on the stripeNumbersMode preference.
function appendRulerGuides(container, sideARight, topDown) {
  for (const pos of RULER_ANCHORS) {
    const { onRight } = getStripeEdge(pos, sideARight);
    const y = getStripeY(pos, topDown);

    const tick = document.createElement('div');
    tick.className = `stripe-ruler-tick${onRight ? '' : ' stripe-ruler-tick-left'}`;
    tick.style.top = `${y}px`;

    const num = document.createElement('span');
    num.className = 'stripe-ruler-num';
    num.textContent = stripeNumberLabel(pos, { exact: true });
    if (onRight) num.style.right = '26px';
    else num.style.left = '26px';
    tick.appendChild(num);

    container.appendChild(tick);
  }
}

// Create stripe overlay element
function createStripeOverlay(stripes) {
  const container = document.createElement('div');
  container.className = 'card-preview-stripes';
  const { sideARight, topDown } = getCornerConfig();
  const numbersMode = getStripeNumbersMode();
  const showNums = numbersMode !== 'none';
  // Sparse cards number every stripe with its exact slot (always-on).
  const exact = numbersMode === 'all' || countVisibleMarks(stripes) <= STRIPE_SPARSE_MAX;

  // Permanent reference ruler down both edges when the counting aid is on.
  if (showNums) appendRulerGuides(container, sideARight, topDown);

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

    // Sparse cards label every stripe exactly (always-on); dense cards label
    // only anchor stripes, and only when the counting aid is on.
    const label = (exact || showNums) ? stripeNumberLabel(stripe.position, { exact }) : null;
    if (label) {
      const num = document.createElement('span');
      num.className = 'stripe-mark-num';
      num.textContent = label;
      // Sit just inboard of the stripe's edge.
      if (onRight) num.style.right = '26px';
      else num.style.left = '26px';
      mark.appendChild(num);
    }

    container.appendChild(mark);
  }

  return container;
}

// Build a card preview element (image + stripe overlay) by fetching from Scryfall.
// Returns a 244×340 .card-preview-container — caller is responsible for scaling.
export async function buildCardWithStripes(cardName, stripes) {
  const data = await fetchCard(frontFaceName(cardName));
  if (!data.image_uri) throw new Error('No image available');
  return createPreviewElement(data.image_uri, stripes);
}

// Create loading placeholder
export function createLoadingElement() {
  const container = document.createElement('div');
  container.className = 'card-preview-container card-preview-loading';

  const spinner = document.createElement('wa-spinner');
  spinner.setAttribute('size', 'large');
  container.appendChild(spinner);

  return container;
}

// Create error placeholder
export function createErrorElement(message) {
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
let currentStripes = null;
let currentImageUri = null;

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
    currentImageUri = cardData.image_uri;
    currentStripes = stripes;
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

// Re-render the open preview in place (e.g. after the position-numbers pref
// toggles) using the cached image + stripes — no refetch.
export function refreshOpenPreview() {
  const tooltip = getTooltip();
  if (!tooltip || tooltip.hidden || !currentImageUri || !currentStripes) return;
  tooltip.innerHTML = '';
  tooltip.appendChild(createPreviewElement(currentImageUri, currentStripes));
}

// Update tooltip position (for mousemove)
export function updatePosition(event) {
  const tooltip = getTooltip();
  if (tooltip && !tooltip.hidden) {
    positionTooltip(tooltip, event);
  }
}
