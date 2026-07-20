/**
 * PRISM Profile Page
 * Handles user profile, PRISM management, and account settings
 */

import { initAuth, setupAuthListeners, onAuthChange, getCurrentUser, signOut, updatePassword, updateEmail, updateAuthUI, ensureAuthReady } from './modules/auth.js';
import { getAllPrisms, setCurrentPrism, deletePrism, savePrism, getCurrentPrism } from './modules/storage.js';
import { createPrism, processCards } from './modules/processor.js';
import { downloadJSON } from './modules/export.js';
import { buildPrismFromJson } from './modules/prism-import.js';
import { isPaymentEnforced, getSubscription, hasActiveSubscription, startCheckout } from './modules/billing.js';
import { showError, showSuccess } from './core/notifications.js';
import { escapeHtml, getLogicalDeckCount } from './core/utils.js';

// DOM Elements
let elements = {};

function getElements() {
  return {
    // Profile sections
    profileLoading: document.getElementById('profile-loading'),
    profileLoggedOut: document.getElementById('profile-logged-out'),
    profileLoggedIn: document.getElementById('profile-logged-in'),
    profileEmail: document.getElementById('profile-email'),
    profileAvatar: document.getElementById('profile-avatar'),
    profileMeta: document.getElementById('profile-meta'),
    accountEmailCaption: document.getElementById('account-email-caption'),

    // PRISMs list
    prismsList: document.getElementById('prisms-list'),
    btnNewPrism: document.getElementById('btn-new-prism'),

    // Email change (dialog)
    emailDialog: document.getElementById('email-dialog'),
    btnOpenEmailDialog: document.getElementById('btn-open-email-dialog'),
    changeEmailForm: document.getElementById('change-email-form'),
    newEmail: document.getElementById('new-email'),
    emailError: document.getElementById('email-error'),
    emailSuccess: document.getElementById('email-success'),
    btnChangeEmail: document.getElementById('btn-change-email'),

    // Password change (dialog)
    passwordDialog: document.getElementById('password-dialog'),
    btnOpenPasswordDialog: document.getElementById('btn-open-password-dialog'),
    changePasswordForm: document.getElementById('change-password-form'),
    newPassword: document.getElementById('new-password'),
    confirmPassword: document.getElementById('confirm-password'),
    passwordError: document.getElementById('password-error'),
    passwordSuccess: document.getElementById('password-success'),
    btnChangePassword: document.getElementById('btn-change-password'),

    // Data download / restore
    btnDownloadData: document.getElementById('btn-download-data'),
    restoreDialog: document.getElementById('restore-dialog'),
    btnOpenRestoreDialog: document.getElementById('btn-open-restore-dialog'),
    profileJsonInput: document.getElementById('profile-json-input'),

    // Delete account
    deleteAccountDialog: document.getElementById('delete-account-dialog'),
    btnOpenDeleteAccountDialog: document.getElementById('btn-open-delete-account-dialog'),
    btnConfirmDeleteAccount: document.getElementById('btn-confirm-delete-account'),

    // Subscription
    subscriptionSection: document.getElementById('subscription-section'),
    subscriptionStatusTag: document.getElementById('subscription-status-tag'),
    subscriptionCaption: document.getElementById('subscription-caption'),
    btnSubscribe: document.getElementById('btn-subscribe'),

    // Auth
    btnProfileLogin: document.getElementById('btn-profile-login'),
    btnProfileLogout: document.getElementById('btn-profile-logout'),
    authDialog: document.getElementById('auth-dialog'),

    // Delete PRISM dialog
    deletePrismDialog: document.getElementById('delete-prism-dialog'),
    deletePrismName: document.getElementById('delete-prism-name'),
    btnCancelDeletePrism: document.getElementById('btn-cancel-delete-prism'),
    btnConfirmDeletePrism: document.getElementById('btn-confirm-delete-prism')
  };
}

// PRISM id pending deletion while the confirm dialog is open.
let pendingDeleteId = null;

async function init() {
  // Wait for Web Awesome components
  await new Promise(resolve => setTimeout(resolve, 100));

  // Initialize auth
  try {
    await initAuth();
  } catch (err) {
    console.error('Auth init failed:', err);
  }
  setupAuthListeners();

  // Get elements
  elements = getElements();

  // Setup event listeners
  setupEventListeners();

  // Subscribe to auth changes
  onAuthChange(handleAuthChange);

  // Initial render based on current auth state
  handleAuthChange(getCurrentUser());

  // Returning from Stripe Checkout
  const checkoutResult = new URLSearchParams(window.location.search).get('checkout');
  if (checkoutResult) {
    if (checkoutResult === 'success') {
      showSuccess('Payment complete! Your subscription is active.');
    } else if (checkoutResult === 'cancel') {
      showError('Checkout was cancelled — you have not been charged.');
    }
    history.replaceState(null, '', window.location.pathname);
  }
}

function setupEventListeners() {
  // Profile login button
  if (elements.btnProfileLogin) {
    elements.btnProfileLogin.addEventListener('click', () => {
      // Warm the lazily-loaded SDK while the user types credentials
      ensureAuthReady();
      if (elements.authDialog) {
        elements.authDialog.setAttribute('open', '');
      }
    });
  }

  // Profile logout button
  if (elements.btnProfileLogout) {
    elements.btnProfileLogout.addEventListener('click', async () => {
      try {
        await signOut();
        window.location.href = 'index.html';
      } catch (err) {
        console.error('Logout error:', err);
      }
    });
  }

  // New PRISM button
  if (elements.btnNewPrism) {
    elements.btnNewPrism.addEventListener('click', handleNewPrism);
  }

  // Any dialog footer Cancel closes its own dialog
  document.addEventListener('click', (e) => {
    const btn = e.target.closest('[data-dialog-close]');
    if (btn) btn.closest('wa-dialog')?.removeAttribute('open');
  });

  // Change email dialog
  if (elements.btnOpenEmailDialog) {
    elements.btnOpenEmailDialog.addEventListener('click', () => {
      if (elements.emailError) elements.emailError.hidden = true;
      if (elements.emailSuccess) elements.emailSuccess.hidden = true;
      elements.emailDialog?.setAttribute('open', '');
    });
  }
  if (elements.changeEmailForm) {
    elements.changeEmailForm.addEventListener('submit', handleChangeEmail);
  }
  if (elements.btnChangeEmail) {
    elements.btnChangeEmail.addEventListener('click', () => elements.changeEmailForm?.requestSubmit());
  }

  // Change password dialog
  if (elements.btnOpenPasswordDialog) {
    elements.btnOpenPasswordDialog.addEventListener('click', () => {
      if (elements.passwordError) elements.passwordError.hidden = true;
      if (elements.passwordSuccess) elements.passwordSuccess.hidden = true;
      elements.passwordDialog?.setAttribute('open', '');
    });
  }
  if (elements.changePasswordForm) {
    elements.changePasswordForm.addEventListener('submit', handleChangePassword);
  }
  if (elements.btnChangePassword) {
    elements.btnChangePassword.addEventListener('click', () => elements.changePasswordForm?.requestSubmit());
  }

  // Download my data — one .json backup per PRISM (each restorable on its own)
  if (elements.btnDownloadData) {
    elements.btnDownloadData.addEventListener('click', () => {
      const prisms = getAllPrisms();
      if (prisms.length === 0) {
        showError('No PRISMs to download yet.');
        return;
      }
      prisms.forEach(prism => downloadJSON(prism));
    });
  }

  // Restore from backup — imported file becomes a NEW PRISM
  if (elements.btnOpenRestoreDialog) {
    elements.btnOpenRestoreDialog.addEventListener('click', () => {
      elements.restoreDialog?.setAttribute('open', '');
    });
  }
  if (elements.profileJsonInput) {
    elements.profileJsonInput.addEventListener('change', handleRestoreBackup);
  }

  // Delete account
  if (elements.btnOpenDeleteAccountDialog) {
    elements.btnOpenDeleteAccountDialog.addEventListener('click', () => {
      elements.deleteAccountDialog?.setAttribute('open', '');
    });
  }
  if (elements.btnConfirmDeleteAccount) {
    elements.btnConfirmDeleteAccount.addEventListener('click', () => {
      elements.deleteAccountDialog?.removeAttribute('open');
      // ponytail: no client-side account deletion API yet — needs a server-side
      // (service-role) function. Surface the manual path until that exists.
      showError('Account deletion is not automated yet. Contact us on Discord and we will remove your account and synced data.');
    });
  }

  // Subscribe button — redirect to Stripe Checkout
  if (elements.btnSubscribe) {
    elements.btnSubscribe.addEventListener('click', async () => {
      elements.btnSubscribe.loading = true;
      try {
        await startCheckout(); // navigates away on success
      } catch (err) {
        console.error('Checkout error:', err);
        showError(err.message || 'Could not start checkout.');
        elements.btnSubscribe.loading = false;
      }
    });
  }

  // Delete PRISM dialog
  if (elements.btnCancelDeletePrism) {
    elements.btnCancelDeletePrism.addEventListener('click', () => {
      pendingDeleteId = null;
      elements.deletePrismDialog?.removeAttribute('open');
    });
  }
  if (elements.btnConfirmDeletePrism) {
    elements.btnConfirmDeletePrism.addEventListener('click', () => {
      if (pendingDeleteId) {
        deletePrism(pendingDeleteId);
        renderPrismsList();
      }
      pendingDeleteId = null;
      elements.deletePrismDialog?.removeAttribute('open');
    });
  }
}

function handleAuthChange(user) {
  // Update nav auth UI
  updateAuthUI(user);

  // Auth resolved — hide the loading skeleton
  if (elements.profileLoading) elements.profileLoading.style.display = 'none';

  if (user) {
    // Show logged in state - use style.display for reliability with Web Awesome CSS
    if (elements.profileLoggedOut) elements.profileLoggedOut.style.display = 'none';
    if (elements.profileLoggedIn) {
      elements.profileLoggedIn.hidden = false;
      elements.profileLoggedIn.style.display = '';
    }
    if (elements.profileEmail) elements.profileEmail.textContent = user.email;
    if (elements.accountEmailCaption) elements.accountEmailCaption.textContent = user.email;
    if (elements.profileAvatar) {
      elements.profileAvatar.setAttribute('initials', (user.email?.[0] || 'P').toUpperCase());
    }
    if (elements.profileMeta) {
      const prisms = getAllPrisms();
      const deckCount = prisms.reduce((n, p) => n + getLogicalDeckCount(p), 0);
      const since = user.created_at
        ? new Date(user.created_at).toLocaleDateString('en-US', { month: 'short', year: 'numeric' })
        : null;
      elements.profileMeta.textContent =
        `${prisms.length} PRISM${prisms.length === 1 ? '' : 's'} · ` +
        `${deckCount} deck${deckCount === 1 ? '' : 's'}` +
        (since ? ` · member since ${since}` : '');
    }

    // Load PRISMs
    renderPrismsList();

    // Subscription section (hidden unless enforcement flag or PRISM_DEBUG)
    renderSubscriptionSection();
  } else {
    // Show logged out state
    if (elements.profileLoggedOut) elements.profileLoggedOut.style.display = '';
    if (elements.profileLoggedIn) elements.profileLoggedIn.style.display = 'none';
    if (elements.subscriptionSection) elements.subscriptionSection.hidden = true;
  }
}

/**
 * Show subscription state on the profile page. The section stays hidden
 * unless payment enforcement is switched on (app_config) or the PRISM_DEBUG
 * localStorage flag is set — the payment pipe ships ahead of the paid tier.
 */
async function renderSubscriptionSection() {
  const section = elements.subscriptionSection;
  if (!section) return;

  let debugFlag = false;
  try { debugFlag = !!localStorage.getItem('PRISM_DEBUG'); } catch { /* private mode */ }
  if (!debugFlag && !(await isPaymentEnforced())) {
    section.hidden = true;
    return;
  }
  section.hidden = false;

  const subscription = await getSubscription();
  const tag = elements.subscriptionStatusTag;
  const caption = elements.subscriptionCaption;
  const active = hasActiveSubscription(subscription);

  if (active) {
    if (tag) { tag.setAttribute('variant', 'success'); tag.textContent = 'Active'; }
    if (caption) {
      const renews = subscription.current_period_end
        ? ` Renews ${formatDate(subscription.current_period_end)}.`
        : '';
      caption.textContent = `Thanks for supporting PRISM.${renews}`;
    }
  } else if (subscription?.status === 'past_due') {
    if (tag) { tag.setAttribute('variant', 'warning'); tag.textContent = 'Past due'; }
    if (caption) caption.textContent = 'Your last payment failed — resubscribe to update your card.';
  } else {
    if (tag) { tag.setAttribute('variant', 'neutral'); tag.textContent = subscription?.status === 'canceled' ? 'Canceled' : 'Free'; }
    if (caption) caption.textContent = 'Support PRISM with a recurring subscription.';
  }

  if (elements.btnSubscribe) elements.btnSubscribe.hidden = active;
}

function renderPrismsList() {
  if (!elements.prismsList) return;

  const prisms = getAllPrisms();
  const currentPrism = getCurrentPrism();
  const currentPrismId = currentPrism?.id;

  if (prisms.length === 0) {
    elements.prismsList.innerHTML = `
      <wa-card appearance="outlined" style="text-align: center; padding: var(--wa-space-xl);">
        <div class="wa-stack wa-gap-m wa-align-items-center">
          <wa-icon name="layer-group" style="font-size: 2.5rem; color: var(--wa-color-neutral-text-subtle);"></wa-icon>
          <p style="color: var(--wa-color-neutral-text-subtle);">You don't have any PRISMs yet.</p>
          <wa-button href="build.html" variant="brand">
            <wa-icon slot="start" name="wand-magic-sparkles"></wa-icon>
            Create Your First PRISM
          </wa-button>
        </div>
      </wa-card>
    `;
    return;
  }

  elements.prismsList.innerHTML = prisms.map(prism => {
    const isActive = prism.id === currentPrismId;
    const deckCount = getLogicalDeckCount(prism);
    const cardCount = processCards(prism).reduce((n, card) => n + card.totalQuantity, 0);
    const sortedDecks = [...prism.decks].sort((a, b) => a.stripePosition - b.stripePosition);
    return `
    <wa-card class="prism-card ${isActive ? 'prism-active' : ''}" data-prism-id="${prism.id}">
      <div class="wa-stack wa-gap-s">
        <div class="wa-split wa-align-items-center">
          <span class="wa-heading-s">${escapeHtml(prism.name)}</span>
          ${isActive ? '<wa-tag size="small" variant="brand">Current</wa-tag>' : '<span></span>'}
        </div>
        <span class="wa-caption-m" style="color: var(--wa-color-neutral-text-subtle);">
          ${deckCount} deck${deckCount === 1 ? '' : 's'} · ${cardCount} card${cardCount === 1 ? '' : 's'} · updated ${formatDate(prism.updatedAt)}
        </span>
        <div class="wa-cluster wa-gap-2xs">
          ${sortedDecks.map(deck => `<span class="stripe-indicator" style="background: ${deck.color};"></span>`).join('')}
        </div>
        <div class="wa-cluster wa-gap-s" style="padding-block-start: var(--wa-space-xs);">
          <wa-button variant="brand" appearance="outlined" size="small" class="btn-open-prism" data-prism-id="${prism.id}">
            <wa-icon slot="start" name="wand-magic-sparkles"></wa-icon>
            Open
          </wa-button>
          <wa-button appearance="plain" variant="danger" size="small" class="btn-delete-prism" data-prism-id="${prism.id}" title="Delete PRISM">
            <wa-icon name="trash"></wa-icon>
          </wa-button>
        </div>
      </div>
    </wa-card>
  `;
  }).join('');

  // Add event listeners
  elements.prismsList.querySelectorAll('.btn-open-prism').forEach(btn => {
    btn.addEventListener('click', () => handleOpenPrism(btn.dataset.prismId));
  });

  elements.prismsList.querySelectorAll('.btn-delete-prism').forEach(btn => {
    btn.addEventListener('click', () => handleDeletePrism(btn.dataset.prismId));
  });
}

function handleOpenPrism(prismId) {
  setCurrentPrism(prismId);
  window.location.href = 'build.html';
}

/**
 * Stage a PRISM for deletion and open the confirmation dialog. The actual
 * delete runs from the dialog's confirm button (see setupEventListeners).
 * @param {string} prismId - ID of the PRISM to delete
 */
function handleDeletePrism(prismId) {
  const prisms = getAllPrisms();
  const prism = prisms.find(p => p.id === prismId);

  if (!prism) return;

  pendingDeleteId = prismId;
  if (elements.deletePrismName) elements.deletePrismName.textContent = prism.name;
  elements.deletePrismDialog?.setAttribute('open', '');
}

function handleNewPrism() {
  const newPrism = createPrism('New PRISM');
  savePrism(newPrism);
  setCurrentPrism(newPrism.id);
  window.location.href = 'build.html';
}

/**
 * Restore a backup .json as a NEW PRISM (fresh id, existing PRISMs untouched).
 */
function handleRestoreBackup(e) {
  const file = e.target.files?.[0];
  if (!file) return;

  const reader = new FileReader();
  reader.onload = (event) => {
    try {
      const jsonData = JSON.parse(event.target.result);
      const newPrism = buildPrismFromJson(jsonData, { preserveId: false });
      savePrism(newPrism);
      renderPrismsList();
      elements.restoreDialog?.removeAttribute('open');
      showSuccess(`Imported "${newPrism.name}" as a new PRISM with ${newPrism.decks.length} deck${newPrism.decks.length === 1 ? '' : 's'}.`);
    } catch (err) {
      console.error('Backup restore error:', err);
      showError(err.message || 'Failed to parse JSON file. Please check the format.');
    }
  };
  reader.onerror = () => showError('Failed to read file. Please try again.');
  reader.readAsText(file);
  try { e.target.value = ''; } catch { /* wa-file-input may not allow value reset before upgrade */ }
}

async function handleChangeEmail(e) {
  e.preventDefault();

  const newEmailValue = elements.newEmail?.value;

  // Clear previous messages
  if (elements.emailError) elements.emailError.hidden = true;
  if (elements.emailSuccess) elements.emailSuccess.hidden = true;

  // Validate email
  if (!newEmailValue || !newEmailValue.includes('@')) {
    if (elements.emailError) {
      elements.emailError.textContent = 'Please enter a valid email address.';
      elements.emailError.hidden = false;
    }
    return;
  }

  try {
    if (elements.btnChangeEmail) elements.btnChangeEmail.loading = true;

    await updateEmail(newEmailValue);

    // Show success
    if (elements.emailSuccess) {
      elements.emailSuccess.textContent = 'Check your new email to confirm the change.';
      elements.emailSuccess.hidden = false;
    }

    // Clear form
    if (elements.newEmail) elements.newEmail.value = '';

  } catch (err) {
    console.error('Email update error:', err);
    if (elements.emailError) {
      elements.emailError.textContent = err.message || 'Failed to update email.';
      elements.emailError.hidden = false;
    }
  } finally {
    if (elements.btnChangeEmail) elements.btnChangeEmail.loading = false;
  }
}

async function handleChangePassword(e) {
  e.preventDefault();

  const newPass = elements.newPassword?.value;
  const confirmPass = elements.confirmPassword?.value;

  // Clear previous messages
  if (elements.passwordError) elements.passwordError.hidden = true;
  if (elements.passwordSuccess) elements.passwordSuccess.hidden = true;

  // Validate passwords match
  if (newPass !== confirmPass) {
    if (elements.passwordError) {
      elements.passwordError.textContent = 'Passwords do not match.';
      elements.passwordError.hidden = false;
    }
    return;
  }

  // Validate password length
  if (newPass.length < 6) {
    if (elements.passwordError) {
      elements.passwordError.textContent = 'Password must be at least 6 characters.';
      elements.passwordError.hidden = false;
    }
    return;
  }

  try {
    if (elements.btnChangePassword) elements.btnChangePassword.loading = true;

    await updatePassword(newPass);

    // Show success
    if (elements.passwordSuccess) {
      elements.passwordSuccess.textContent = 'Password updated successfully!';
      elements.passwordSuccess.hidden = false;
    }

    // Clear form
    if (elements.newPassword) elements.newPassword.value = '';
    if (elements.confirmPassword) elements.confirmPassword.value = '';

  } catch (err) {
    console.error('Password update error:', err);
    if (elements.passwordError) {
      elements.passwordError.textContent = err.message || 'Failed to update password.';
      elements.passwordError.hidden = false;
    }
  } finally {
    if (elements.btnChangePassword) elements.btnChangePassword.loading = false;
  }
}

// Utility functions
function formatDate(dateString) {
  if (!dateString) return 'Unknown';
  const date = new Date(dateString);
  return date.toLocaleDateString('en-US', {
    year: 'numeric',
    month: 'short',
    day: 'numeric'
  });
}

// Initialize when DOM is ready
if (document.readyState === 'loading') {
  document.addEventListener('DOMContentLoaded', init);
} else {
  init();
}
