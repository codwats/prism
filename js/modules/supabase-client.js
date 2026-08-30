// Supabase client configuration
// Replace these with your actual Supabase project credentials

// Exported for anonymous PostgREST reads (gallery public data) — plain fetch
// with the anon key keeps the SDK lazy for logged-out visitors.
export const SUPABASE_URL = 'https://clqxysoimlsjfmnjbxsa.supabase.co';
export const SUPABASE_ANON_KEY = 'sb_publishable_EmMs1syywKSfhJuPsO0LvA_GsCzVYFD';

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

const SDK_URL = 'https://cdn.jsdelivr.net/npm/@supabase/supabase-js@2';
// A hung request fires neither load nor error, so each attempt needs its own
// deadline. The dead tag is left in the document — if it lands late its own
// load listener still resolves us — and only a tag that errored is removed.
const SDK_ATTEMPT_TIMEOUT_MS = 3000;
const SDK_LOAD_ATTEMPTS = 3;

let sdkReadyPromise = null;

// Load the Supabase SDK on demand. Idempotent. Anonymous visitors never pay
// for the SDK unless they open the login dialog.
//
// Resolves true once window.supabase exists, false once every attempt has
// failed; never rejects. Callers that only want the tag injected can ignore
// the promise.
//
// Retrying matters: a single failed load used to leave auth permanently
// unresolvable, and the nav painted "signed out" at a signed-in user with
// nothing left to correct it (#199).
export function loadSupabaseSdk() {
  if (window.supabase) return Promise.resolve(true);
  if (sdkReadyPromise) return sdkReadyPromise;

  sdkReadyPromise = new Promise(resolve => {
    let attempts = 0;
    let settled = false;

    // Timers and listeners from abandoned attempts can still fire after we've
    // given up. Without this guard a stale one would clear sdkReadyPromise
    // out from under a later caller that had already started fresh attempts.
    const finish = (loaded) => {
      if (settled) return;
      settled = true;
      // Don't cache a failure for the page's lifetime — a later caller (login
      // click, another navigation) gets a fresh set of attempts.
      if (!loaded) sdkReadyPromise = null;
      resolve(loaded);
    };

    const attach = (script) => {
      // Listeners go on before the tag enters the document. Attaching them
      // later — as initAuth() used to, after a 100ms sleep — means a load or
      // error firing inside that window is missed entirely (#199).
      script.addEventListener('load', () => {
        if (window.supabase) finish(true);
        else retry();
      }, { once: true });
      script.addEventListener('error', () => {
        script.remove();
        retry();
      }, { once: true });
    };

    const retry = () => {
      if (settled) return;
      if (window.supabase) { finish(true); return; }
      if (attempts >= SDK_LOAD_ATTEMPTS) { finish(false); return; }
      setTimeout(inject, 300 * attempts);
    };

    const inject = () => {
      if (settled) return;
      if (window.supabase) { finish(true); return; }
      attempts += 1;
      // Adopt a tag already in the document on the first pass — layout.js
      // injects one eagerly for returning users — rather than racing a
      // duplicate against it. Later attempts always need a fresh request.
      let script = attempts === 1
        ? document.head.querySelector('script[src*="supabase"]')
        : null;
      if (script) {
        attach(script);
      } else {
        script = document.createElement('script');
        script.src = SDK_URL;
        attach(script);
        document.head.appendChild(script);
      }
      setTimeout(() => { if (!window.supabase) retry(); }, SDK_ATTEMPT_TIMEOUT_MS);
    };

    inject();
  });

  return sdkReadyPromise;
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
    // Strip email PII before persisting, mirroring trackEvent's GA rule —
    // app_logs rows already carry user_id, so the email adds nothing.
    let safeMetadata = metadata;
    if (metadata && typeof metadata === 'object' && 'email' in metadata) {
      safeMetadata = { ...metadata };
      delete safeMetadata.email;
    }
    await client.from('app_logs').insert({
      user_id: session.user.id,
      level,
      message,
      metadata: safeMetadata
    });
  } catch (err) {
    console.error('Failed to log to Supabase:', err);
  }
}
