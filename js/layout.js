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

  // Web Awesome CDN — CSS links
  const WA_BASE = 'https://ka-p.webawesome.com/kit/da021fed1e5141f2/webawesome@3.5.0';
  const waStyles = [
    `${WA_BASE}/styles/themes/matter.css`,
    `${WA_BASE}/styles/color/palettes/mild.css`,
    `${WA_BASE}/styles/native.css`,
    `${WA_BASE}/styles/utilities.css`,
  ];
  waStyles.forEach(href => {
    if (!head.querySelector(`link[href="${href}"]`)) {
      const link = document.createElement('link');
      link.rel = 'stylesheet';
      link.href = href;
      head.appendChild(link);
    }
  });

  // Fonts
  const fonts = [
    'https://fonts.bunny.net/css2?family=Inter:ital,wght@0,100..900;1,100..900&display=swap',
    'https://fonts.bunny.net/css2?family=Geist+Mono:wght@100..900&display=swap',
    'https://fonts.bunny.net/css2?family=Crimson+Pro:ital,wght@0,200..900;1,200..900&display=swap',
  ];
  fonts.forEach(href => {
    if (!head.querySelector(`link[href="${href}"]`)) {
      const link = document.createElement('link');
      link.rel = 'stylesheet';
      link.href = href;
      head.appendChild(link);
    }
  });

  // Web Awesome autoloader (module)
  if (!head.querySelector('script[src*="webawesome.loader"]')) {
    const wa = document.createElement('script');
    wa.type = 'module';
    wa.src = `${WA_BASE}/webawesome.loader.js`;
    head.appendChild(wa);
  }

  // Custom theme overrides (CSS variables)
  if (!head.querySelector('style[data-prism-theme]')) {
    const style = document.createElement('style');
    style.setAttribute('data-prism-theme', '');
    style.textContent = `
      :root {
        --wa-color-brand-05: #1d1023;
        --wa-color-brand-10: #291b2f;
        --wa-color-brand-20: #413348;
        --wa-color-brand-30: #56465d;
        --wa-color-brand-40: #68586f;
        --wa-color-brand-50: #85758d;
        --wa-color-brand-60: #a594ad;
        --wa-color-brand-70: #c2b0ca;
        --wa-color-brand-80: #d8c6e0;
        --wa-color-brand-90: #f3e0fb;
        --wa-color-brand-95: #ffedff;
        --wa-color-neutral-05: #0b141a;
        --wa-color-neutral-10: #151e25;
        --wa-color-neutral-20: #2b343b;
        --wa-color-neutral-30: #3d464e;
        --wa-color-neutral-40: #4f5a61;
        --wa-color-neutral-50: #6c767e;
        --wa-color-neutral-60: #8c979f;
        --wa-color-neutral-70: #a4b0b8;
        --wa-color-neutral-80: #bec9d2;
        --wa-color-neutral-90: #dbe6f0;
        --wa-color-neutral-95: #e8f4fd;
        --wa-color-success-05: #001900;
        --wa-color-success-10: #002500;
        --wa-color-success-20: #0b3b01;
        --wa-color-success-30: #204f17;
        --wa-color-success-40: #326029;
        --wa-color-success-50: #508047;
        --wa-color-success-60: #6e9f65;
        --wa-color-success-70: #87b97d;
        --wa-color-success-80: #a0d396;
        --wa-color-success-90: #bef2b4;
        --wa-color-success-95: #cbffc1;
        --wa-color-warning-05: #1a1000;
        --wa-color-warning-10: #271b00;
        --wa-color-warning-20: #413100;
        --wa-color-warning-30: #584400;
        --wa-color-warning-40: #705800;
        --wa-color-warning-50: #917600;
        --wa-color-warning-60: #b09525;
        --wa-color-warning-70: #c9ae44;
        --wa-color-warning-80: #e2c65e;
        --wa-color-warning-90: #fee27b;
        --wa-color-warning-95: #ffef88;
        --wa-color-danger-05: #340000;
        --wa-color-danger-10: #490000;
        --wa-color-danger-20: #6c0000;
        --wa-color-danger-30: #851c10;
        --wa-color-danger-40: #9e3527;
        --wa-color-danger-50: #c15646;
        --wa-color-danger-60: #e47463;
        --wa-color-danger-70: #ff8e7b;
        --wa-color-danger-80: #ffb1a1;
        --wa-color-danger-90: #ffd8ce;
        --wa-color-danger-95: #ffeae4;
        --wa-font-family-body: Inter, sans-serif;
        --wa-font-family-heading: Inter, sans-serif;
        --wa-font-family-code: "Geist Mono", monospace;
        --wa-font-family-longform: "Crimson Pro", serif;
        --wa-font-weight-body: 400;
        --wa-font-weight-heading: 600;
        --wa-font-weight-code: 400;
        --wa-font-weight-longform: 400;
        --wa-border-radius-scale: 0.25;
        --wa-border-width-scale: 1;
        --wa-space-scale: 1.25;
      }
    `;
    head.appendChild(style);
  }

  // Theme + palette + dark mode classes on <html>
  document.documentElement.classList.add('wa-theme-matter', 'wa-palette-mild', 'wa-dark');

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

  // Fallback: <wa-button href> only navigates after WA upgrades the element.
  // Add a click listener so navigation works even before WA loads.
  const profileNavBtn = nav.querySelector('wa-button[href="profile.html"]');
  if (profileNavBtn) {
    profileNavBtn.addEventListener('click', () => {
      window.location.href = 'profile.html';
    });
  }
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
                <a href="https://github.com/codwats/prism" target="_blank" rel="noopener">
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
