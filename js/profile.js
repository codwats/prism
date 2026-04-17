/**
 * PRISM Profile Page
 * Handles user profile, PRISM management, and account settings
 */

import { initAuth, setupAuthListeners, onAuthChange, getCurrentUser, signOut, updatePassword, updateEmail, updateAuthUI } from './modules/auth.js';
import { getAllPrisms, setCurrentPrism, deletePrism, savePrism, getCurrentPrism } from './modules/storage.js';
import { createPrism } from './modules/processor.js';

// DOM Elements
let elements = {};

function getElements() {
  return {
    // Profile sections
    profileLoggedOut: document.getElementById('profile-logged-out'),
    profileLoggedIn: document.getElementById('profile-logged-in'),
    profileEmail: document.getElementById('profile-email'),

    // PRISMs list
    prismsList: document.getElementById('prisms-list'),
    btnNewPrism: document.getElementById('btn-new-prism'),

    // Email change
    changeEmailForm: document.getElementById('change-email-form'),
    newEmail: document.getElementById('new-email'),
    emailError: document.getElementById('email-error'),
    emailSuccess: document.getElementById('email-success'),
    btnChangeEmail: document.getElementById('btn-change-email'),

    // Password change
    changePasswordForm: document.getElementById('change-password-form'),
    newPassword: document.getElementById('new-password'),
    confirmPassword: document.getElementById('confirm-password'),
    passwordError: document.getElementById('password-error'),
    passwordSuccess: document.getElementById('password-success'),
    btnChangePassword: document.getElementById('btn-change-password'),

    // Auth
    btnProfileLogin: document.getElementById('btn-profile-login'),
    btnProfileLogout: document.getElementById('btn-profile-logout'),
    authDialog: document.getElementById('auth-dialog')
  };
}

async function init() {
  // Wait for Web Awesome components
  await new Promise(resolve => setTimeout(resolve, 100));

  // Initialize auth
  await initAuth();
  setupAuthListeners();

  // Get elements
  elements = getElements();

  // Setup event listeners
  setupEventListeners();

  // Subscribe to auth changes
  onAuthChange(handleAuthChange);

  // Initial render based on current auth state
  handleAuthChange(getCurrentUser());
}

function setupEventListeners() {
  // Profile login button
  if (elements.btnProfileLogin) {
    elements.btnProfileLogin.addEventListener('click', () => {
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

  // Change email form
  if (elements.changeEmailForm) {
    elements.changeEmailForm.addEventListener('submit', handleChangeEmail);
  }

  // Change password form
  if (elements.changePasswordForm) {
    elements.changePasswordForm.addEventListener('submit', handleChangePassword);
  }
}

function handleAuthChange(user) {
  // Update nav auth UI
  updateAuthUI(user);

  if (user) {
    // Show logged in state - use style.display for reliability with Web Awesome CSS
    if (elements.profileLoggedOut) elements.profileLoggedOut.style.display = 'none';
    if (elements.profileLoggedIn) {
      elements.profileLoggedIn.hidden = false;
      elements.profileLoggedIn.style.display = '';
    }
    if (elements.profileEmail) elements.profileEmail.textContent = user.email;

    // Load PRISMs
    renderPrismsList();
  } else {
    // Show logged out state
    if (elements.profileLoggedOut) elements.profileLoggedOut.style.display = '';
    if (elements.profileLoggedIn) elements.profileLoggedIn.style.display = 'none';
  }
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
    return `
    <wa-card class="prism-card ${isActive ? 'prism-active' : ''}" data-prism-id="${prism.id}" style="${isActive ? 'border: 2px solid var(--wa-color-brand-stroke);' : ''}">
      <div class="wa-split wa-align-items-center">
        <div class="wa-stack wa-gap-2xs">
          <div class="wa-cluster wa-gap-s wa-align-items-center">
            <span class="wa-heading-m">${escapeHtml(prism.name)}</span>
            <wa-tag size="small" variant="neutral">${prism.decks?.length || 0} decks</wa-tag>
            ${isActive ? '<wa-tag size="small" variant="brand">Active</wa-tag>' : ''}
          </div>
          <span class="wa-caption-m" style="color: var(--wa-color-neutral-text-subtle);">
            Last updated: ${formatDate(prism.updatedAt)}
          </span>
        </div>
        <div class="wa-cluster wa-gap-xs">
          ${!isActive ? `
          <wa-button
            appearance="outlined"
            variant="neutral"
            size="small"
            class="btn-set-active"
            data-prism-id="${prism.id}"
            title="Set as Active"
          >
            Set Active
          </wa-button>
          ` : ''}
          <wa-button
            appearance="plain"
            variant="neutral"
            size="small"
            class="btn-open-prism"
            data-prism-id="${prism.id}"
            title="Edit PRISM"
          >
            <wa-icon name="pen-to-square"></wa-icon>
          </wa-button>
          <wa-button
            appearance="plain"
            variant="neutral"
            size="small"
            class="btn-delete-prism"
            data-prism-id="${prism.id}"
            title="Delete PRISM"
          >
            <wa-icon name="trash"></wa-icon>
          </wa-button>
        </div>
      </div>
    </wa-card>
  `;
  }).join('');

  // Add event listeners
  elements.prismsList.querySelectorAll('.btn-set-active').forEach(btn => {
    btn.addEventListener('click', () => handleSetActive(btn.dataset.prismId));
  });

  elements.prismsList.querySelectorAll('.btn-open-prism').forEach(btn => {
    btn.addEventListener('click', () => handleOpenPrism(btn.dataset.prismId));
  });

  elements.prismsList.querySelectorAll('.btn-delete-prism').forEach(btn => {
    btn.addEventListener('click', () => handleDeletePrism(btn.dataset.prismId));
  });
}

function handleSetActive(prismId) {
  setCurrentPrism(prismId);
  renderPrismsList();
}

function handleOpenPrism(prismId) {
  setCurrentPrism(prismId);
  window.location.href = 'build.html';
}

function handleDeletePrism(prismId) {
  const prisms = getAllPrisms();
  const prism = prisms.find(p => p.id === prismId);

  if (!prism) return;

  if (confirm(`Are you sure you want to delete "${prism.name}"? This cannot be undone.`)) {
    deletePrism(prismId);
    renderPrismsList();
  }
}

function handleNewPrism() {
  const newPrism = createPrism('New PRISM');
  savePrism(newPrism);
  setCurrentPrism(newPrism.id);
  window.location.href = 'build.html';
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
function escapeHtml(text) {
  const div = document.createElement('div');
  div.textContent = text;
  return div.innerHTML;
}

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
