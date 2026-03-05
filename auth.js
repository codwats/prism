// Authentication module for Prism
import { getSupabase, isConfigured } from './supabase-client.js';
import { syncWithSupabase } from './storage.js';

// Current user state
let currentUser = null;
let authListeners = [];
let wasLoggedOut = true; // Track if user was logged out before sign-in

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
export async function initAuth() {
  if (!isConfigured()) {
    console.warn('Supabase not configured - auth disabled');
    return null;
  }

  const supabase = getSupabase();
  if (!supabase) return null;

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
    console.log('Auth state changed:', event);
    notifyAuthChange(session?.user || null);

    // Track logout state
    if (event === 'SIGNED_OUT') {
      wasLoggedOut = true;
    }

    // Sync with Supabase when user freshly logs in (not on session recovery)
    if (event === 'SIGNED_IN' && session?.user && wasLoggedOut) {
      wasLoggedOut = false;
      await syncWithSupabase();
      // Reload page to show synced data
      window.location.reload();
    }
  });

  return currentUser;
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
    password
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

  const { error } = await supabase.auth.resetPasswordForEmail(email);
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
  });

  if (error) throw error;
}

// Update user account UI in the nav
export function updateAuthUI(user) {
  const loginSection = document.getElementById('auth-logged-out');
  const userSection = document.getElementById('auth-logged-in');

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
  const dialogTitle = document.getElementById('auth-dialog-title');

  // Hide all views
  if (loginView) loginView.style.display = 'none';
  if (signupView) signupView.style.display = 'none';
  if (forgotView) forgotView.style.display = 'none';

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
  }

  // Clear any error/success messages
  clearAuthMessages();
}

// Clear all error and success messages
function clearAuthMessages() {
  const errorEls = document.querySelectorAll('#login-error, #signup-error, #forgot-error');
  const successEls = document.querySelectorAll('#signup-success, #forgot-success');

  errorEls.forEach(el => {
    if (el) el.hidden = true;
  });
  successEls.forEach(el => {
    if (el) el.hidden = true;
  });
}

// Setup auth event listeners for nav buttons
export function setupAuthListeners() {
  // Login button - opens dialog
  const loginBtn = document.getElementById('btn-login');
  if (loginBtn) {
    loginBtn.addEventListener('click', () => {
      const dialog = document.getElementById('auth-dialog');
      if (dialog) {
        showAuthView('login');
        dialog.open = true;
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
        if (dialog) dialog.open = false;
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

  // Subscribe to auth changes to update UI
  onAuthChange(updateAuthUI);
}
