// Card preview with stripe overlay

import { fetchCard } from './scryfall.js';

// Display dimensions (half of Scryfall 'normal' 488x680)
const DISPLAY_WIDTH = 244;
const DISPLAY_HEIGHT = 340;
const SCALE = 0.5; // Display scale factor

// Stripe positioning at display scale (32 positions along right edge)
// Original values at full scale: start=40, height=12, gap=4, slot=16
const STRIPE_START_Y = 20; // 40 * 0.5
const STRIPE_SLOT_HEIGHT = 8; // 16 * 0.5

// Get Y position for a stripe (1-32) at display scale
function getStripeY(position) {
  return STRIPE_START_Y + (position - 1) * STRIPE_SLOT_HEIGHT;
}

// Create stripe overlay element
function createStripeOverlay(stripes) {
  const container = document.createElement('div');
  container.className = 'card-preview-stripes';

  for (const stripe of stripes) {
    const mark = document.createElement('div');
    mark.className = 'stripe-mark';
    mark.style.backgroundColor = stripe.color;
    mark.style.top = `${getStripeY(stripe.position)}px`;
    mark.title = `${stripe.deckName} (Position ${stripe.position})`;
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
    const cardData = await fetchCard(cardName);

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
    console.warn('Failed to load card preview:', error.message);

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
