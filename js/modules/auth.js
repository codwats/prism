// Authentication module for Prism
import { getSupabase, isConfigured, logToSupabase } from './supabase-client.js';
import { syncWithSupabase } from './storage.js';
import { debugLog } from '../core/utils.js';

// Current user state
let currentUser = null;
let authListeners = [];
let wasLoggedOut = true; // Track if user was logged out before sign-in
let authInitPromise = null; // Cached init promise — all callers await the same one

// Subscribe to auth state changes
export function onAuthChange(callback) {
  authListeners.push(callback);
  // Return unsubscribe function
  return () => {
    authListeners = authListeners.filter(cb => cb !== callback);
  };
}

// Notify all listeners
function notifyAuthChange(user) {
  currentUser = user;
  authListeners.forEach(cb => cb(user));
}

// Initialize auth state
// Returns a shared Promise so concurrent callers (layout.js and page scripts)
// all await the same async init — including the awaited syncWithSupabase.
// Previously a boolean guard was flipped synchronously before the async work,
// causing the second caller to short-circuit before cloud sync completed and
// read stale localStorage.
export function initAuth() {
  if (authInitPromise) return authInitPromise;
  authInitPromise = (async () => {
    if (!isConfigured()) {
      console.warn('Supabase not configured - auth disabled');
      return null;
    }

    // Wait for Supabase CDN if the script hasn't executed yet
    if (!window.supabase) {
      const sbScript = document.querySelector('script[src*="supabase"]');
      if (sbScript) {
        await new Promise(resolve => {
          if (window.supabase) { resolve(); return; }
          sbScript.addEventListener('load', resolve, { once: true });
          sbScript.addEventListener('error', resolve, { once: true });
          setTimeout(resolve, 5000);
        });
      }
    }

    const supabase = getSupabase();
    if (!supabase) {
      authInitPromise = null;
      return null;
    }

    // Get initial session
    const { data: { session } } = await supabase.auth.getSession();
    if (session?.user) {
      wasLoggedOut = false; // User already logged in, don't reload on SIGNED_IN
      notifyAuthChange(session.user);
      // Sync on initial load if already logged in
      await syncWithSupabase();
    }

    // Listen for auth changes
    supabase.auth.onAuthStateChange(async (event, session) => {
      debugLog('Auth state changed:', event);
      notifyAuthChange(session?.user || null);

      // Track logout state
      if (event === 'SIGNED_OUT') {
        wasLoggedOut = true;
        logToSupabase('info', 'user_signed_out');
      }

      // Password-reset email link: the user lands with a recovery session and
      // must be prompted for a new password, or reset appears broken.
      if (event === 'PASSWORD_RECOVERY') {
        wasLoggedOut = false; // recovery session signs the user in — skip the SIGNED_IN reload
        openPasswordRecovery();
        return;
      }

      // Sync with Supabase when user freshly logs in (not on session recovery)
      if (event === 'SIGNED_IN' && session?.user && wasLoggedOut) {
        wasLoggedOut = false;
        logToSupabase('info', 'user_signed_in', { email: session.user.email });
        await syncWithSupabase();
        // Reload page to show synced data
        window.location.reload();
      }
    });

    // Supabase processes the recovery token from the URL hash at client
    // creation, which can finish before the listener above registers — check
    // the URL directly so the set-password dialog opens either way.
    if (window.location.hash.includes('type=recovery')) {
      wasLoggedOut = false;
      openPasswordRecovery();
    }

    return currentUser;
  })().catch(err => {
    // Reset cache so a transient failure does not permanently wedge init
    authInitPromise = null;
    throw err;
  });
  return authInitPromise;
}

// Get current user
export function getCurrentUser() {
  return currentUser;
}

// Sign up with email/password
export async function signUp(email, password) {
  const supabase = getSupabase();
  if (!supabase) throw new Error('Supabase not configured');

  const { data, error } = await supabase.auth.signUp({
    email,
    password,
    options: { emailRedirectTo: window.location.origin }
  });

  if (error) throw error;
  return data;
}

// Sign in with email/password
export async function signIn(email, password) {
  const supabase = getSupabase();
  if (!supabase) throw new Error('Supabase not configured');

  const { data, error } = await supabase.auth.signInWithPassword({
    email,
    password
  });

  if (error) throw error;
  return data;
}

// Sign out
export async function signOut() {
  const supabase = getSupabase();
  if (!supabase) throw new Error('Supabase not configured');

  const { error } = await supabase.auth.signOut();
  if (error) throw error;
}

// Send password reset email
export async function resetPassword(email) {
  const supabase = getSupabase();
  if (!supabase) throw new Error('Supabase not configured');

  const { error } = await supabase.auth.resetPasswordForEmail(email, {
    redirectTo: window.location.origin
  });
  if (error) throw error;
}

// Update password (for logged in users)
export async function updatePassword(newPassword) {
  const supabase = getSupabase();
  if (!supabase) throw new Error('Supabase not configured');

  const { error } = await supabase.auth.updateUser({
    password: newPassword
  });

  if (error) throw error;
}

// Update email (for logged in users)
export async function updateEmail(newEmail) {
  const supabase = getSupabase();
  if (!supabase) throw new Error('Supabase not configured');

  const { error } = await supabase.auth.updateUser({
    email: newEmail
  }, {
    emailRedirectTo: window.location.origin
  });

  if (error) throw error;
}

// Update user account UI in the nav
export function updateAuthUI(user) {
  const loadingSection = document.getElementById('auth-loading');
  const loginSection = document.getElementById('auth-logged-out');
  const userSection = document.getElementById('auth-logged-in');

  if (loadingSection) loadingSection.style.display = 'none';

  if (user) {
    if (loginSection) loginSection.style.display = 'none';
    if (userSection) userSection.style.display = '';
  } else {
    if (loginSection) loginSection.style.display = '';
    if (userSection) userSection.style.display = 'none';
  }
}

// Show specific auth view
function showAuthView(viewName) {
  const loginView = document.getElementById('auth-login-view');
  const signupView = document.getElementById('auth-signup-view');
  const forgotView = document.getElementById('auth-forgot-view');
  const recoveryView = document.getElementById('auth-recovery-view');
  const dialogTitle = document.getElementById('auth-dialog-title');

  // Hide all views
  if (loginView) loginView.style.display = 'none';
  if (signupView) signupView.style.display = 'none';
  if (forgotView) forgotView.style.display = 'none';
  if (recoveryView) recoveryView.style.display = 'none';

  // Show requested view and update title
  switch (viewName) {
    case 'login':
      if (loginView) loginView.style.display = '';
      if (dialogTitle) dialogTitle.textContent = 'Login';
      break;
    case 'signup':
      if (signupView) signupView.style.display = '';
      if (dialogTitle) dialogTitle.textContent = 'Sign up with Email';
      break;
    case 'forgot':
      if (forgotView) forgotView.style.display = '';
      if (dialogTitle) dialogTitle.textContent = 'Reset Password';
      break;
    case 'recovery':
      if (recoveryView) recoveryView.style.display = '';
      if (dialogTitle) dialogTitle.textContent = 'Set a New Password';
      break;
  }

  // Clear any error/success messages
  clearAuthMessages();
}

// Open the auth dialog on the set-new-password view (password-reset landing)
function openPasswordRecovery() {
  const dialog = document.getElementById('auth-dialog');
  if (!dialog) return;
  showAuthView('recovery');
  dialog.setAttribute('open', '');
}

// Clear all error and success messages
function clearAuthMessages() {
  const errorEls = document.querySelectorAll('#login-error, #signup-error, #forgot-error, #recovery-error');
  const successEls = document.querySelectorAll('#signup-success, #forgot-success, #recovery-success');

  errorEls.forEach(el => {
    if (el) el.hidden = true;
  });
  successEls.forEach(el => {
    if (el) el.hidden = true;
  });
}

// Setup auth event listeners for nav buttons
let listenersSetup = false;

export function setupAuthListeners() {
  // Idempotent — safe to call from both layout.js and page-specific scripts
  if (listenersSetup) return;
  listenersSetup = true;

  // Login button - opens dialog
  const loginBtn = document.getElementById('btn-login');
  if (loginBtn) {
    loginBtn.addEventListener('click', () => {
      const dialog = document.getElementById('auth-dialog');
      if (dialog) {
        showAuthView('login');
        dialog.setAttribute('open', '');
      }
    });
  }

  // Logout button
  const logoutBtn = document.getElementById('btn-logout');
  if (logoutBtn) {
    logoutBtn.addEventListener('click', async () => {
      try {
        await signOut();
      } catch (err) {
        console.error('Logout failed:', err);
      }
    });
  }

  // View toggle buttons
  const btnShowSignup = document.getElementById('btn-show-signup');
  if (btnShowSignup) {
    btnShowSignup.addEventListener('click', () => showAuthView('signup'));
  }

  const btnShowLogin = document.getElementById('btn-show-login');
  if (btnShowLogin) {
    btnShowLogin.addEventListener('click', () => showAuthView('login'));
  }

  const btnForgotPassword = document.getElementById('btn-forgot-password');
  if (btnForgotPassword) {
    btnForgotPassword.addEventListener('click', (e) => {
      e.preventDefault();
      showAuthView('forgot');
    });
  }

  const btnBackToLogin = document.getElementById('btn-back-to-login');
  if (btnBackToLogin) {
    btnBackToLogin.addEventListener('click', () => showAuthView('login'));
  }

  // Login form submission
  const loginForm = document.getElementById('login-form');
  if (loginForm) {
    loginForm.addEventListener('submit', async (e) => {
      e.preventDefault();
      const email = document.getElementById('login-email')?.value;
      const password = document.getElementById('login-password')?.value;
      const submitBtn = document.getElementById('btn-login-submit');
      const errorEl = document.getElementById('login-error');

      try {
        if (submitBtn) submitBtn.loading = true;
        if (errorEl) errorEl.hidden = true;

        await signIn(email, password);

        // Close dialog on successful login
        const dialog = document.getElementById('auth-dialog');
        if (dialog) dialog.removeAttribute('open');
      } catch (err) {
        console.error('Login error:', err);
        if (errorEl) {
          errorEl.textContent = err.message;
          errorEl.hidden = false;
        }
      } finally {
        if (submitBtn) submitBtn.loading = false;
      }
    });
  }

  // Signup form submission
  const signupForm = document.getElementById('signup-form');
  if (signupForm) {
    signupForm.addEventListener('submit', async (e) => {
      e.preventDefault();
      const email = document.getElementById('signup-email')?.value;
      const password = document.getElementById('signup-password')?.value;
      const submitBtn = document.getElementById('btn-signup-submit');
      const errorEl = document.getElementById('signup-error');
      const successEl = document.getElementById('signup-success');

      try {
        if (submitBtn) submitBtn.loading = true;
        if (errorEl) errorEl.hidden = true;
        if (successEl) successEl.hidden = true;

        await signUp(email, password);
        logToSupabase('info', 'user_signed_up');

        // Show success message
        if (successEl) {
          successEl.textContent = 'Check your email to confirm your account!';
          successEl.hidden = false;
        }

        // Disable form after successful signup
        if (submitBtn) submitBtn.disabled = true;
      } catch (err) {
        console.error('Signup error:', err);
        if (errorEl) {
          errorEl.textContent = err.message;
          errorEl.hidden = false;
        }
      } finally {
        if (submitBtn) submitBtn.loading = false;
      }
    });
  }

  // Forgot password form submission
  const forgotForm = document.getElementById('forgot-form');
  if (forgotForm) {
    forgotForm.addEventListener('submit', async (e) => {
      e.preventDefault();
      const email = document.getElementById('forgot-email')?.value;
      const submitBtn = document.getElementById('btn-forgot-submit');
      const errorEl = document.getElementById('forgot-error');
      const successEl = document.getElementById('forgot-success');

      try {
        if (submitBtn) submitBtn.loading = true;
        if (errorEl) errorEl.hidden = true;
        if (successEl) successEl.hidden = true;

        await resetPassword(email);

        // Show success message
        if (successEl) {
          successEl.textContent = 'Check your email for a password reset link!';
          successEl.hidden = false;
        }
      } catch (err) {
        console.error('Password reset error:', err);
        if (errorEl) {
          errorEl.textContent = err.message;
          errorEl.hidden = false;
        }
      } finally {
        if (submitBtn) submitBtn.loading = false;
      }
    });
  }

  // Set-new-password form (password-reset landing)
  const recoveryForm = document.getElementById('recovery-form');
  if (recoveryForm) {
    recoveryForm.addEventListener('submit', async (e) => {
      e.preventDefault();
      const password = document.getElementById('recovery-password')?.value;
      const confirm = document.getElementById('recovery-password-confirm')?.value;
      const submitBtn = document.getElementById('btn-recovery-submit');
      const errorEl = document.getElementById('recovery-error');
      const successEl = document.getElementById('recovery-success');

      if (password !== confirm) {
        if (errorEl) {
          errorEl.textContent = 'Passwords do not match.';
          errorEl.hidden = false;
        }
        return;
      }

      try {
        if (submitBtn) submitBtn.loading = true;
        if (errorEl) errorEl.hidden = true;

        await updatePassword(password);
        logToSupabase('info', 'password_recovered');

        if (successEl) {
          successEl.textContent = 'Password updated. You are signed in.';
          successEl.hidden = false;
        }

        // Let the confirmation register, then close the dialog
        setTimeout(() => {
          document.getElementById('auth-dialog')?.removeAttribute('open');
        }, 1500);
      } catch (err) {
        console.error('Password update error:', err);
        if (errorEl) {
          errorEl.textContent = err.message;
          errorEl.hidden = false;
        }
      } finally {
        if (submitBtn) submitBtn.loading = false;
      }
    });
  }

  // Subscribe to auth changes to update UI
  onAuthChange(updateAuthUI);
  // Sync nav UI immediately — INITIAL_SESSION may have fired during initAuth()
  // (before this listener was registered) when session was already in memory
  updateAuthUI(currentUser);
}
