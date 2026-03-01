// Authentication module for Prism
import { getSupabase, isConfigured } from './supabase-client.js';

// Current user state
let currentUser = null;
let authListeners = [];

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
    notifyAuthChange(session.user);
  }

  // Listen for auth changes
  supabase.auth.onAuthStateChange((event, session) => {
    console.log('Auth state changed:', event);
    notifyAuthChange(session?.user || null);
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

// Update user account UI in the nav
export function updateAuthUI(user) {
  const loginSection = document.getElementById('auth-logged-out');
  const userSection = document.getElementById('auth-logged-in');
  const userEmail = document.getElementById('user-email');

  if (!loginSection || !userSection) return;

  if (user) {
    loginSection.hidden = true;
    userSection.hidden = false;
    if (userEmail) {
      userEmail.textContent = user.email;
    }
  } else {
    loginSection.hidden = false;
    userSection.hidden = true;
  }
}

// Setup auth event listeners for nav buttons
export function setupAuthListeners() {
  // Login button - opens dialog
  const loginBtn = document.getElementById('btn-login');
  if (loginBtn) {
    loginBtn.addEventListener('click', () => {
      const dialog = document.getElementById('auth-dialog');
      if (dialog) dialog.open = true;
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

  // Auth form submission
  const authForm = document.getElementById('auth-form');
  if (authForm) {
    authForm.addEventListener('submit', async (e) => {
      e.preventDefault();
      const formData = new FormData(authForm);
      const email = formData.get('email');
      const password = formData.get('password');
      const mode = document.getElementById('auth-mode')?.value || 'login';

      const submitBtn = authForm.querySelector('wa-button[type="submit"]');
      const errorEl = document.getElementById('auth-error');

      try {
        if (submitBtn) submitBtn.loading = true;
        if (errorEl) errorEl.hidden = true;

        if (mode === 'signup') {
          await signUp(email, password);
          // Show success message for signup (needs email confirmation)
          if (errorEl) {
            errorEl.textContent = 'Check your email to confirm your account!';
            errorEl.hidden = false;
            errorEl.style.color = 'var(--wa-color-success-text)';
          }
        } else {
          await signIn(email, password);
          // Close dialog on successful login
          const dialog = document.getElementById('auth-dialog');
          if (dialog) dialog.open = false;
        }
      } catch (err) {
        console.error('Auth error:', err);
        if (errorEl) {
          errorEl.textContent = err.message;
          errorEl.hidden = false;
          errorEl.style.color = 'var(--wa-color-danger-text)';
        }
      } finally {
        if (submitBtn) submitBtn.loading = false;
      }
    });
  }

  // Toggle between login/signup mode
  const toggleModeBtn = document.getElementById('toggle-auth-mode');
  if (toggleModeBtn) {
    toggleModeBtn.addEventListener('click', () => {
      const modeInput = document.getElementById('auth-mode');
      const submitBtn = document.getElementById('auth-submit-btn');
      const dialogTitle = document.getElementById('auth-dialog-title');

      if (modeInput.value === 'login') {
        modeInput.value = 'signup';
        if (submitBtn) submitBtn.textContent = 'Sign Up';
        if (dialogTitle) dialogTitle.textContent = 'Create Account';
        toggleModeBtn.textContent = 'Already have an account? Log in';
      } else {
        modeInput.value = 'login';
        if (submitBtn) submitBtn.textContent = 'Log In';
        if (dialogTitle) dialogTitle.textContent = 'Log In';
        toggleModeBtn.textContent = "Don't have an account? Sign up";
      }
    });
  }

  // Subscribe to auth changes to update UI
  onAuthChange(updateAuthUI);
}
