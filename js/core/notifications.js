/**
 * Toast notification helpers.
 */

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
    // Messages interpolate user-controlled names (decks, cards, imports).
    // create() sets them as textContent, which is XSS-safe as long as
    // allowHtml is never passed — so don't escape (it shows as &#39;).
    toastContainer.create(message, { variant, duration: 5000, icon });
  }
}
