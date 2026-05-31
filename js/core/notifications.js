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
    toastContainer.create(message, { variant, duration: 5000, icon });
  }
}
