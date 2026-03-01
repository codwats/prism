// Supabase client configuration
// Replace these with your actual Supabase project credentials

const SUPABASE_URL = 'YOUR_SUPABASE_URL'; // e.g., 'https://xxxx.supabase.co'
const SUPABASE_ANON_KEY = 'YOUR_SUPABASE_ANON_KEY';

// Import Supabase from CDN (loaded in HTML)
// We'll use the global supabase object

let supabaseClient = null;

export function getSupabase() {
  if (!supabaseClient && window.supabase) {
    supabaseClient = window.supabase.createClient(SUPABASE_URL, SUPABASE_ANON_KEY);
  }
  return supabaseClient;
}

export function isConfigured() {
  return SUPABASE_URL !== 'YOUR_SUPABASE_URL' && SUPABASE_ANON_KEY !== 'YOUR_SUPABASE_ANON_KEY';
}

// Log helper for debugging
export async function logToSupabase(level, message, metadata = null) {
  const client = getSupabase();
  if (!client) return;

  try {
    const { data: { user } } = await client.auth.getUser();
    await client.from('app_logs').insert({
      user_id: user?.id || null,
      level,
      message,
      metadata
    });
  } catch (err) {
    console.error('Failed to log to Supabase:', err);
  }
}
