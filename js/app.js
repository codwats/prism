/**
 * PRISM Main Application — Entry Point
 * All logic has been split into feature modules under js/features/.
 */

import { init } from './features/init.js';

if (document.readyState === 'loading') {
  document.addEventListener('DOMContentLoaded', init);
} else {
  init();
}
