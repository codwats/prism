/**
 * Global error reporting.
 * Surfaces unhandled errors as GA events (anonymous users included) and
 * Supabase app_logs rows (authenticated users only — logToSupabase gates on
 * session). Capped per page load so a render-loop error can't flood either
 * sink.
 */

import { logToSupabase } from '../modules/supabase-client.js';

const MAX_REPORTS_PER_PAGE = 5;
let reported = 0;
let installed = false;

function report(kind, message, source = '') {
  if (reported >= MAX_REPORTS_PER_PAGE) return;
  reported++;
  logToSupabase('error', 'unhandled_error', {
    kind,
    message: String(message).slice(0, 500),
    source,
    page: window.location.pathname,
  });
}

export function initGlobalErrorReporting() {
  if (installed) return;
  installed = true;

  window.addEventListener('error', (e) => {
    report('error', e.message || e.error?.message || 'unknown', `${e.filename || ''}:${e.lineno || 0}`);
  });

  window.addEventListener('unhandledrejection', (e) => {
    report('unhandledrejection', e.reason?.message || e.reason || 'unknown');
  });
}
