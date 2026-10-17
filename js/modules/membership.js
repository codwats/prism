import { escapeHtml } from '../core/utils.js';
import { getCurrentUser, onAuthChange, canPaintAuthState, ensureAuthReady, startAuth } from './auth.js';
import { getCurrentPrism } from './storage.js';
import { isEntitled, isMembershipDrawerAvailable, startCheckout } from './billing.js';

const PRICES = { month: '$3 a month', year: '$30 a year' };
// The one price statement, shared by the drawer and the landing pitch.
const PRICE_LINE = '<strong>$3</strong> a month or <strong>$30</strong> a year';
// Until the Patreon rail opens; the drawer and the landing pitch say it the same way.
const PATREON_NOT_YET = 'Paying on Patreon is not available yet.';

/**
 * Auth-dependent async reads for one render target: each call supersedes the
 * last. Resolves { user, value }, or null when a later call or a user change
 * overtook it, so a slow read never paints over a newer one.
 */
export function latestRead() {
  let seq = 0;
  return async read => {
    const mine = ++seq;
    const user = getCurrentUser();
    const value = await read(user);
    return mine === seq && user === getCurrentUser() ? { user, value } : null;
  };
}

export function joinLabel(period, signedIn) {
  return `${signedIn ? 'Join' : 'Sign in to join'} for ${PRICES[period]}`;
}

/**
 * The entire sell is one branch: entitled Members never render a price.
 * Order matches the spec exactly: state notice, price, three benefits,
 * billing period, where to pay, one button, Extras — Extras is always last.
 */
export function membershipContent({ entitled, signedIn, createdName = null, period = 'month' }) {
  if (entitled) {
    return `<div class="wa-stack wa-gap-l">
      <p>Your Membership is included. Cloud sync and Extras are yours to use.</p>
      <section class="wa-stack wa-gap-s" aria-labelledby="membership-extras-heading">
        <h3 id="membership-extras-heading" class="wa-heading-m">Extras</h3>
        <a href="mpc-stripes.html">MPC Stripe Compositor</a>
        <p>Add your stripe marks to MPC Autofill images before you order. Needs a finished MPC Autofill order and Chrome.</p>
        <a href="swap-planner.html">Swap Planner</a>
        <p>Find the cards a new card could replace across your decks, and what each Swap costs in marks.</p>
      </section>
    </div>`;
  }
  return `<div class="wa-stack wa-gap-l">
    <p>${createdName !== null ? `<strong>${escapeHtml(createdName || 'Your new PRISM')}</strong> stays on this device.` : 'Your PRISMs work on this device without a Membership.'}
      Keep creating, marking and exporting for free.</p>
    <section class="wa-stack wa-gap-m" aria-label="Join PRISM">
      <p class="membership-price">${PRICE_LINE}. USD.</p>
      <ul class="wa-stack wa-gap-xs">
        <li>Your PRISMs on every device</li>
        <li>PRISM Extras</li>
        <li>A member role in the Discord</li>
      </ul>
      <wa-radio-group label="Billing" name="membership-period" value="${period}" data-membership-period>
        <wa-radio value="month">Monthly, $3</wa-radio>
        <wa-radio value="year">Yearly, $30</wa-radio>
      </wa-radio-group>
      <wa-radio-group label="Where would you like to pay?" name="membership-rail" value="stripe"
        hint="Same price either way. Patreon also carries our videos, extra media and site updates.">
        <wa-radio value="stripe">Here, through Stripe</wa-radio>
        <wa-radio value="patreon" disabled>On Patreon</wa-radio>
      </wa-radio-group>
      <p class="wa-caption-m">${PATREON_NOT_YET}</p>
      <wa-button variant="brand" data-membership-checkout>${joinLabel(period, signedIn)}</wa-button>
      <p data-membership-error role="alert" hidden></p>
      <p class="wa-caption-m">Your price stays the same while your Membership continues. Cancel and rejoin at the current price.</p>
      ${signedIn ? '' : '<p class="wa-caption-m">A free account lets you like and upload work in the gallery. <button type="button" class="membership-account-link" data-membership-signin>Create a free account</button></p>'}
    </section>
    <section class="wa-stack wa-gap-s" aria-labelledby="membership-extras-heading">
      <h3 id="membership-extras-heading" class="wa-heading-m">Extras</h3>
      <p><strong>MPC Stripe Compositor</strong></p>
      <p>Add your stripe marks to MPC Autofill images before you order. Included with Membership. Needs a finished MPC Autofill order and Chrome.</p>
      <p><strong>Swap Planner</strong></p>
      <p>Find the cards a new card could replace across your decks, and what each Swap costs in marks. Included with Membership.</p>
    </section>
  </div>`;
}

/**
 * The landing page's pitch block (#215). Same single branch as the drawer:
 * an entitled visitor (a Founder included) never renders a price. Checkout
 * lives only in the build.html drawer, so the button hands off to it.
 */
export function membershipPitch({ entitled }) {
  if (entitled) {
    return '<p>Your Membership is included. Your PRISMs sync to every device you sign in to.</p>';
  }
  return `<p>Everything PRISM does today stays free and stays on this device. A free account adds gallery participation: liking and uploading work. Membership adds sync across devices, PRISM Extras, and a member role in the Discord.</p>
    <p class="membership-price">${PRICE_LINE}. USD.</p>
    <p class="wa-caption-m">Same price on Stripe or Patreon. ${PATREON_NOT_YET}</p>
    <div class="wa-cluster wa-gap-s wa-justify-content-center">
      <wa-button href="build.html#membership" variant="brand" size="l">Join for ${PRICES.month}</wa-button>
    </div>`;
}

/** Called only by index.html. Renders nothing until auth state can be painted. */
export function initMembershipPitch() {
  const container = document.querySelector('[data-membership-pitch]');
  if (!container) return;
  const read = latestRead();
  const render = async () => {
    if (!canPaintAuthState()) return;
    const result = await read(user => Promise.all([
      isMembershipDrawerAvailable(),
      user ? isEntitled() : false
    ]));
    if (!result) return;
    const [available, entitled] = result.value;
    // No drawer to hand off to while enforcement is off.
    // layout.js's document-level fallback covers the button before WA upgrades it.
    container.innerHTML = available ? membershipPitch({ entitled }) : '';
  };
  onAuthChange(render);
  render();
}

let drawer;
let content;
let openButtons = [];
let extrasLinks = [];
let renderVersion = 0;
let openRequest = null;
// Survives the auth re-render, so a yearly pick made before sign-in holds.
let chosenPeriod = 'month';

/** Called only by build/profile, after their initial auth and local render. */
export function initMembershipDrawer() {
  if (drawer) return;
  drawer = document.getElementById('membership-drawer');
  if (!drawer) return;
  content = drawer.querySelector('[data-membership-content]');
  openButtons = [...document.querySelectorAll('[data-open-membership]')];
  openButtons.forEach(button => {
    button.addEventListener('click', () => openMembershipDrawer());
  });
  extrasLinks = [...document.querySelectorAll('[data-extras-link]')];
  extrasLinks.forEach(link => {
    link.addEventListener('click', () => { window.location.href = link.dataset.extrasLink; });
  });
  drawer.addEventListener('wa-hide', event => {
    if (event.target !== drawer) return;
    openRequest = null;
    renderVersion++;
  });
  onAuthChange(() => {
    // Remove the old account's block immediately, before any async reads.
    renderVersion++;
    content.replaceChildren();
    if (openRequest) openMembershipDrawer(openRequest);
    else updateAvailability();
    updateExtrasLinks();
  });
  updateAvailability();
  updateExtrasLinks();

  // The profile's create redirects here only after saving. Consume its notice
  // once; reloading or opening an old PRISM must never produce a create notice.
  let pendingId;
  try {
    pendingId = sessionStorage.getItem('prism_membership_created');
    sessionStorage.removeItem('prism_membership_created');
  } catch { /* local use still works when sessionStorage is unavailable */ }
  if (pendingId && getCurrentPrism()?.id === pendingId) {
    openMembershipDrawer({ createdId: pendingId });
  } else if (window.location.hash === '#membership') {
    openMembershipDrawer();
  }
  window.addEventListener('hashchange', () => {
    if (window.location.hash === '#membership') openMembershipDrawer();
  });
}

async function updateAvailability() {
  const available = await isMembershipDrawerAvailable();
  openButtons.forEach(button => { button.hidden = !available; });
  return available;
}

// Extras links are Members-only and follow entitlement, not the drawer's
// enforcement flag: with the flag off every signed-in account is a Member.
async function updateExtrasLinks() {
  const user = getCurrentUser();
  const entitled = user ? await isEntitled() : false;
  if (user !== getCurrentUser()) return;
  extrasLinks.forEach(link => { link.hidden = !entitled; });
}

/**
 * Gate an Extras page (ADR 0003): Members get [data-extra-tool], anyone else
 * [data-extra-pitch]. Soft by design — the page source stays public.
 * Entitlement fails open, and so does an auth verdict that never arrives.
 * Re-renders on every auth change (sign-out does not reload the page); a
 * render superseded by a later one, or by a user change, is discarded.
 * onTool runs each time the tool is revealed, so a page starts its
 * Members-only fetches only for Members.
 */
export async function initExtraGate(onTool) {
  const [tool, pitch, loading] = ['tool', 'pitch', 'loading']
    .map(part => document.querySelector(`[data-extra-${part}]`));
  const signIn = pitch.querySelector('[data-extra-signin]');
  signIn.addEventListener('click', () => {
    ensureAuthReady();
    document.getElementById('auth-dialog')?.setAttribute('open', '');
  });

  const read = latestRead();
  const render = async () => {
    const result = await read(user => !canPaintAuthState() || (user ? isEntitled() : false));
    if (!result) return;
    const { user, value: entitled } = result;
    loading.remove();
    tool.hidden = !entitled;
    pitch.hidden = entitled;
    signIn.hidden = !!user;
    if (entitled) onTool?.();
  };

  await startAuth();
  // Owns the pitch's "See Membership" button, including its visibility.
  initMembershipDrawer();
  onAuthChange(render);
  render();
}

/** A create is already persisted by the caller. This function never gates it. */
export async function openMembershipDrawer({ createdId = null } = {}) {
  if (!drawer) return;
  openRequest = { createdId };
  const version = ++renderVersion;
  content.replaceChildren();
  const available = await updateAvailability();
  if (version !== renderVersion) return;
  if (!available) {
    openRequest = null;
    return;
  }
  if (!canPaintAuthState()) return;
  if (!createdId) {
    content.innerHTML = '<p role="status">Checking Membership…</p>';
    drawer.setAttribute('open', '');
  }
  const user = getCurrentUser();
  const entitled = user ? await isEntitled() : false;
  if (version !== renderVersion || user !== getCurrentUser()) return;
  const prism = getCurrentPrism();
  if (createdId && (prism?.id !== createdId || entitled)) {
    openRequest = null;
    return;
  }
  content.innerHTML = membershipContent({
    entitled, signedIn: !!user,
    createdName: createdId ? prism.name : null,
    period: chosenPeriod
  });
  wireCheckout();
  drawer.setAttribute('open', '');
}

function openSignIn() {
  drawer.removeAttribute('open');
  ensureAuthReady();
  document.getElementById('auth-dialog')?.setAttribute('open', '');
}

function wireCheckout() {
  content.querySelector('[data-membership-signin]')?.addEventListener('click', openSignIn);
  const button = content.querySelector('[data-membership-checkout]');
  if (!button) return;
  const error = content.querySelector('[data-membership-error]');
  const periodGroup = content.querySelector('[data-membership-period]');
  // The attribute covers a click before WA upgrades the group.
  const period = () => periodGroup.value || periodGroup.getAttribute('value');
  periodGroup.addEventListener('change', () => {
    chosenPeriod = period();
    button.textContent = joinLabel(period(), !!getCurrentUser());
    error.hidden = true;
  });
  button.addEventListener('click', async () => {
    if (button.loading) return;
    if (!getCurrentUser()) {
      openSignIn();
      return;
    }
    button.loading = true;
    error.hidden = true;
    try {
      await startCheckout(period());
    } catch (err) {
      error.textContent = err.message || 'Could not start checkout. Please try again.';
      error.hidden = false;
    } finally {
      button.loading = false;
    }
  });
}
