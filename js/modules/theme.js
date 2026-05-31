/**
 * Theme helpers — color scheme application.
 */

/**
 * Apply a color scheme by toggling the `wa-dark` class on <html>.
 * 'auto' follows the OS prefers-color-scheme; 'light'/'dark' force it.
 * @param {string} scheme - 'auto' | 'light' | 'dark'
 */
export function applyColorScheme(scheme) {
  const dark = scheme === 'dark'
    || (scheme !== 'light' && window.matchMedia('(prefers-color-scheme: dark)').matches);
  document.documentElement.classList.toggle('wa-dark', dark);
}
