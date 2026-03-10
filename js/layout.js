/**
 * PRISM Shared Layout
 * Injects shared <head> resources, nav, header, footer, and auth dialog
 * into every page. Each HTML page only needs its <main> content.
 *
 * Usage:
 *   import { initLayout } from './js/layout.js';
 *   initLayout({ activePage: 'build', title: 'Build Your PRISM' });
 */

import { initAuth, setupAuthListeners } from './modules/auth.js';

// Navigation links
const NAV_LINKS = [
  { href: 'index.html', label: 'Home', page: 'home' },
  { href: 'guide.html', label: 'Guide', page: 'guide' },
  { href: 'tools.html', label: 'Tools', page: 'tools' },
  { href: 'build.html', label: 'Build PRISM', page: 'build' },
];

/**
 * Initialize shared layout components.
 * @param {Object} options
 * @param {string} options.activePage - Which nav link to highlight ('home'|'guide'|'tools'|'build'|'profile'|'privacy'|'terms')
 * @param {Object} [options.headerCta] - Header CTA button config
 * @param {string} [options.headerCta.id] - Button id (e.g. 'btn-new-prism')
 * @param {string} [options.headerCta.label] - Button label text
 * @param {string} [options.headerCta.href] - Link destination (omit for button-only)
 * @param {string} [options.headerCta.icon] - Icon name (default: 'plus' for id btn-new-prism, 'wand-magic-sparkles' otherwise)
 * @param {string} [options.headerCta.variant] - Button variant (default: 'brand')
 * @param {string} [options.headerCta.appearance] - Button appearance (default: undefined)
 */
export function initLayout(options = {}) {
  const { activePage = '' } = options;

  injectHeadResources();
  injectNav(activePage);
  injectHeader(options.headerCta);
  injectFooter();
  injectAuthDialog();
  initAuthModule();
}

// ============================================================
// <head> resource injection
// ============================================================

function injectHeadResources() {
  const head = document.head;

  // WebAwesome kit (skip if already loaded)
  if (!head.querySelector('script[src*="webawesome"]')) {
    const wa = document.createElement('script');
    wa.src = 'https://kit.webawesome.com/da021fed1e5141f2.js';
    wa.crossOrigin = 'anonymous';
    head.appendChild(wa);
  }

  // Supabase CDN (skip if already loaded)
  if (!head.querySelector('script[src*="supabase"]')) {
    const sb = document.createElement('script');
    sb.src = 'https://cdn.jsdelivr.net/npm/@supabase/supabase-js@2';
    head.appendChild(sb);
  }

  // Favicon
  if (!head.querySelector('link[rel="icon"]')) {
    const fav = document.createElement('link');
    fav.rel = 'icon';
    fav.type = 'image/x-icon';
    fav.href = './assets/Prism-Small-Icon-Invert.svg';
    head.appendChild(fav);
  }

  // Dark mode
  document.documentElement.classList.add('wa-dark');

  // Custom CSS (skip if already loaded)
  if (!head.querySelector('link[href*="custom.css"]')) {
    const css = document.createElement('link');
    css.rel = 'stylesheet';
    css.href = 'css/custom.css';
    head.appendChild(css);
  }
}

// ============================================================
// Navigation (mobile drawer)
// ============================================================

function injectNav(activePage) {
  const waPage = document.querySelector('wa-page');
  if (!waPage) return;

  // Don't inject if nav already exists
  if (waPage.querySelector('nav[slot="navigation"]')) return;

  const nav = document.createElement('nav');
  nav.slot = 'navigation';
  nav.className = 'wa-stack wa-gap-m';
  nav.style.cssText = 'padding: var(--wa-space-l); height: 100%; justify-content: space-between;';

  // Build nav links
  const linksHtml = NAV_LINKS.map(link => {
    const isActive = link.page === activePage;
    const activeClass = isActive ? ' class="wa-heading-m"' : '';
    const activeColor = isActive ? ' color: var(--wa-color-brand-text);' : '';
    return `<a href="${link.href}"${activeClass} style="text-decoration: none; color: inherit;${activeColor}">${link.label}</a>`;
  }).join('\n          ');

  nav.innerHTML = `
        <div class="wa-stack wa-gap-m">
          ${linksHtml}
        </div>

        <!-- Account Section -->
        <div class="wa-stack wa-gap-s" style="border-top: 1px solid var(--wa-color-neutral-border); padding-top: var(--wa-space-m);">
          <!-- Logged Out State -->
          <div id="auth-logged-out">
            <wa-button id="btn-login" variant="neutral" appearance="outlined" style="width: 100%;">
              <wa-icon slot="start" name="right-to-bracket"></wa-icon>
              Log In
            </wa-button>
          </div>

          <!-- Logged In State -->
          <div id="auth-logged-in" class="wa-stack wa-gap-s" style="display: none;">
            <wa-button href="profile.html" variant="neutral" appearance="outlined" style="width: 100%;">
              <wa-icon slot="start" name="circle-user"></wa-icon>
              Profile
            </wa-button>
            <wa-button id="btn-logout" variant="neutral" appearance="plain" size="small">
              <wa-icon slot="start" name="right-from-bracket"></wa-icon>
              Log Out
            </wa-button>
          </div>
        </div>`;

  // Insert nav as first child of wa-page (before header and main)
  waPage.insertBefore(nav, waPage.firstChild);
}

// ============================================================
// Header
// ============================================================

function injectHeader(ctaConfig) {
  const waPage = document.querySelector('wa-page');
  if (!waPage) return;

  // Don't inject if header already exists
  if (waPage.querySelector('header[slot="header"]')) return;

  const header = document.createElement('header');
  header.slot = 'header';
  header.className = 'wa-split';

  // Default CTA: link to build.html with brand variant
  const cta = ctaConfig || { href: 'build.html', label: 'Build PRISM', icon: 'wand-magic-sparkles' };
  const ctaId = cta.id ? ` id="${cta.id}"` : '';
  const ctaHref = cta.href ? ` href="${cta.href}"` : '';
  const ctaVariant = cta.variant || (cta.id === 'btn-new-prism' ? 'neutral' : 'brand');
  const ctaAppearance = cta.appearance || (cta.id === 'btn-new-prism' ? 'outlined' : '');
  const ctaAppearanceAttr = ctaAppearance ? ` appearance="${ctaAppearance}"` : '';
  const ctaIcon = cta.icon || (cta.id === 'btn-new-prism' ? 'plus' : 'wand-magic-sparkles');
  const ctaLabel = cta.label || 'Build PRISM';

  header.innerHTML = `
        <div class="wa-cluster wa-gap-m wa-align-items-center">
          <wa-button data-toggle-nav appearance="plain" variant="neutral" size="small">
            <wa-icon name="bars"></wa-icon>
          </wa-button>
          <a href="index.html" class="wa-cluster wa-gap-xs wa-align-items-center" style="text-decoration: none; color: inherit;">
            <img src="./assets/Prism-Small-Icon-Invert.svg" alt="Prism Logo" style="height:1.5em;" class="wa-border-radius-square">
            <span class="wa-heading-m wa-desktop-only">PRISM</span>
          </a>
        </div>
        <div class="wa-cluster wa-gap-xs wa-align-items-center">
          <wa-button${ctaId}${ctaHref} variant="${ctaVariant}"${ctaAppearanceAttr} size="small">
            <wa-icon slot="start" name="${ctaIcon}"></wa-icon>
            ${ctaLabel}
          </wa-button>
        </div>`;

  // Insert after nav (if exists) or as first child
  const nav = waPage.querySelector('nav[slot="navigation"]');
  if (nav) {
    nav.after(header);
  } else {
    waPage.insertBefore(header, waPage.firstChild);
  }
}

// ============================================================
// Footer
// ============================================================

function injectFooter() {
  const main = document.querySelector('wa-page > main');
  if (!main) return;

  // Don't inject if footer already exists
  if (main.querySelector('footer')) return;

  const footer = document.createElement('footer');
  footer.style.cssText = 'margin-top: var(--wa-space-4xl); padding-block: var(--wa-space-xl); border-top: 1px solid var(--wa-color-neutral-stroke-subtle);';
  footer.innerHTML = `
          <div class="wa-stack wa-gap-m">
            <div class="wa-split">
              <div class="wa-cluster wa-gap-s wa-align-items-center">
                <img src="./assets/Prism-Small-Icon-Invert.svg" style="height:1em;" class="wa-border-radius-square">
                <span>PRISM</span>
                <span style="color: var(--wa-color-neutral-text-subtle);">&bull;</span>
                <span style="color: var(--wa-color-neutral-text-subtle);">Made for Commander players, by Commander players</span>
              </div>
              <div class="wa-cluster wa-gap-m" style="color: var(--wa-color-neutral-text-subtle);">
                <a href="https://github.com" target="_blank" rel="noopener">
                  <wa-icon name="github" family="brands"></wa-icon>
                </a>
                <a href="https://discord.com" target="_blank" rel="noopener">
                  <wa-icon name="discord" family="brands"></wa-icon>
                </a>
              </div>
            </div>
            <div class="wa-cluster wa-gap-m" style="justify-content: center;">
              <a href="privacy.html" class="wa-caption-s" style="color: var(--wa-color-neutral-text-subtle);">Privacy Policy</a>
              <a href="terms.html" class="wa-caption-s" style="color: var(--wa-color-neutral-text-subtle);">Terms of Service</a>
            </div>
          </div>`;

  main.appendChild(footer);
}

// ============================================================
// Auth Dialog
// ============================================================

function injectAuthDialog() {
  // Don't inject if dialog already exists
  if (document.getElementById('auth-dialog')) return;

  const dialog = document.createElement('wa-dialog');
  dialog.id = 'auth-dialog';
  dialog.style.setProperty('--width', '45ch');
  dialog.innerHTML = `
      <span slot="label" id="auth-dialog-title">Login</span>

      <!-- Login View -->
      <div id="auth-login-view" class="wa-stack wa-gap-m">
        <form id="login-form" class="wa-stack wa-gap-m">
          <wa-input id="login-email" name="username" type="email" label="Email" placeholder="you@example.com" autocomplete="username" required></wa-input>
          <wa-input id="login-password" name="password" type="password" label="Password" placeholder="Your password" autocomplete="current-password" required minlength="6"></wa-input>
          <a href="#" id="btn-forgot-password" class="wa-caption-m" style="color: var(--wa-color-brand-text);">Having trouble signing in?</a>
          <div id="login-error" hidden class="wa-caption-m" style="color: var(--wa-color-danger-text);"></div>
          <wa-button id="btn-login-submit" type="submit" variant="brand" style="width: 100%;">Sign in</wa-button>
        </form>
        <wa-divider></wa-divider>
        <wa-button id="btn-show-signup" type="button" appearance="plain" size="small" style="align-self: center;">
          Don't have an account? Sign up
        </wa-button>
      </div>

      <!-- Signup View -->
      <div id="auth-signup-view" class="wa-stack wa-gap-m" style="display: none;">
        <p class="wa-body-m" style="color: var(--wa-color-neutral-text-subtle);">You don't need to sign in to use PRISM, but if you want to save multiple PRISMs or sync across devices, create an account.</p>
        <form id="signup-form" class="wa-stack wa-gap-m">
          <wa-input id="signup-email" name="username" type="email" label="Email" placeholder="you@example.com" autocomplete="username" required></wa-input>
          <wa-input id="signup-password" name="password" type="password" label="Password" placeholder="Create a password" autocomplete="new-password" required minlength="6"></wa-input>
          <div id="signup-error" hidden class="wa-caption-m" style="color: var(--wa-color-danger-text);"></div>
          <div id="signup-success" hidden class="wa-caption-m" style="color: var(--wa-color-success-text);"></div>
          <wa-button id="btn-signup-submit" type="submit" variant="brand" style="width: 100%;">Create Account</wa-button>
        </form>
        <p class="wa-caption-xs" style="color: var(--wa-color-neutral-text-subtle);">By clicking continue, you agree to our <a href="terms.html">Terms of Service</a> and <a href="privacy.html">Privacy Policy</a>.</p>
        <wa-divider></wa-divider>
        <wa-button id="btn-show-login" type="button" appearance="plain" size="small" style="align-self: center;">
          Already have an account? Log in
        </wa-button>
      </div>

      <!-- Forgot Password View -->
      <div id="auth-forgot-view" class="wa-stack wa-gap-m" style="display: none;">
        <p class="wa-body-m" style="color: var(--wa-color-neutral-text-subtle);">Enter your email and we'll send you a link to reset your password.</p>
        <form id="forgot-form" class="wa-stack wa-gap-m">
          <wa-input id="forgot-email" name="email" type="email" label="Email" placeholder="you@example.com" required></wa-input>
          <div id="forgot-error" hidden class="wa-caption-m" style="color: var(--wa-color-danger-text);"></div>
          <div id="forgot-success" hidden class="wa-caption-m" style="color: var(--wa-color-success-text);"></div>
          <wa-button id="btn-forgot-submit" type="submit" variant="brand" style="width: 100%;">Send Reset Link</wa-button>
        </form>
        <wa-divider></wa-divider>
        <wa-button id="btn-back-to-login" type="button" appearance="plain" size="small" style="align-self: center;">
          Back to login
        </wa-button>
      </div>`;

  document.body.appendChild(dialog);
}

// ============================================================
// Auth initialization
// ============================================================

async function initAuthModule() {
  // Wait a tick for Web Awesome components to upgrade
  await new Promise(resolve => setTimeout(resolve, 100));
  await initAuth();
  setupAuthListeners();
}
