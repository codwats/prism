/**
 * Toast notification helpers.
 */

import { escapeHtml } from './utils.js';

export function showError(message) {
  console.error('PRISM Error:', message);
  showToast(message, 'danger', 'circle-exclamation');
}

export function showSuccess(message) {
  console.log('PRISM Success:', message);
  showToast(message, 'success', 'check-circle');
}

export function showToast(message, variant = 'neutral', icon = 'info-circle') {
  const toastContainer = document.querySelector('#toast-container');
  if (toastContainer) {
    // Messages interpolate user-controlled names (decks, cards, imports);
    // wa-toast renders the string as markup, so it must be escaped here.
    toastContainer.create(escapeHtml(message), { variant, duration: 5000, icon });
  }
}
