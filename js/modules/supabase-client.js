// Supabase client configuration
// Replace these with your actual Supabase project credentials

const SUPABASE_URL = 'https://clqxysoimlsjfmnjbxsa.supabase.co';
const SUPABASE_ANON_KEY = 'sb_publishable_EmMs1syywKSfhJuPsO0LvA_GsCzVYFD';

// Import Supabase from CDN (loaded in HTML)
// We'll use the global supabase object

let supabaseClient = null;

// Supabase JS v2 persists sessions under `sb-<project-ref>-auth-token`
const AUTH_TOKEN_KEY = `sb-${new URL(SUPABASE_URL).hostname.split('.')[0]}-auth-token`;

// Synchronous check for a persisted session — safe to call before the SDK loads.
// Used to decide whether to eager-load the SDK and how to size the nav skeleton.
export function hasStoredSession() {
  try {
    return !!localStorage.getItem(AUTH_TOKEN_KEY);
  } catch {
    return false;
  }
}

// Inject the Supabase SDK script on demand. Idempotent. Anonymous visitors
// never pay for the SDK unless they open the login dialog.
export function loadSupabaseSdk() {
  if (window.supabase) return;
  if (document.head.querySelector('script[src*="supabase"]')) return;
  const sb = document.createElement('script');
  sb.src = 'https://cdn.jsdelivr.net/npm/@supabase/supabase-js@2';
  document.head.appendChild(sb);
}

export function getSupabase() {
  if (!supabaseClient && window.supabase) {
    supabaseClient = window.supabase.createClient(SUPABASE_URL, SUPABASE_ANON_KEY);
  }
  return supabaseClient;
}

export function isConfigured() {
  return SUPABASE_URL !== 'YOUR_SUPABASE_URL' && SUPABASE_ANON_KEY !== 'YOUR_SUPABASE_ANON_KEY';
}

// Fire a Google Analytics event if gtag is present. Centralised here so every
// logToSupabase call doubles as a funnel event — GA covers anonymous users,
// who can't write to app_logs (RLS restricts INSERT to authenticated users).
export function trackEvent(name, params = {}) {
  try {
    if (typeof window.gtag !== 'function') return;
    const safe = { ...params };
    delete safe.email; // never send PII to GA
    window.gtag('event', name, safe);
  } catch {
    // Analytics must never break the app.
  }
}

// Log helper for debugging
export async function logToSupabase(level, message, metadata = null) {
  trackEvent(message, { level, ...(metadata || {}) });

  const client = getSupabase();
  if (!client) return;

  try {
    // getSession reads the locally cached session — no network round-trip
    // (getUser made one per log call). Anonymous inserts are rejected by RLS
    // anyway, so skip them instead of erroring into the console.
    const { data: { session } } = await client.auth.getSession();
    if (!session?.user) return;
    await client.from('app_logs').insert({
      user_id: session.user.id,
      level,
      message,
      metadata
    });
  } catch (err) {
    console.error('Failed to log to Supabase:', err);
  }
}
