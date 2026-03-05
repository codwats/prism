// Simplified auth for non-app pages (index, guide, tools)
import { initAuth, setupAuthListeners } from './auth.js';

// Initialize when DOM is ready
if (document.readyState === 'loading') {
  document.addEventListener('DOMContentLoaded', init);
} else {
  init();
}

async function init() {
  // Wait for Web Awesome components
  await new Promise(resolve => setTimeout(resolve, 100));

  await initAuth();
  setupAuthListeners();
}
