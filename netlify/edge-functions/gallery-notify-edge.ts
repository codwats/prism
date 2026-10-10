/**
 * Netlify Edge Function: Gallery review notifications (#333, spec #328)
 * Runs on Deno at the edge.
 *
 * POST { kind: 'upload'|'claim', id } with the caller's Supabase access token,
 * sent by gallery.js right after an upload or claim insert. Emails every
 * gallery admin once per item that is waiting for review.
 *
 * Checks, in order: token → item exists, is the caller's, is pending and was
 * created ≤ 10 minutes ago → the ledger row is claimed. Any failure is a bare
 * 204 with no email, so a probe learns nothing. The ledger row is claimed before
 * sending, so two racing requests send at most one email; a Resend failure
 * deletes the claim and is a 502. Each admin gets their own email, so no admin
 * sees another's address, and no address is ever echoed back.
 *
 * Env: RESEND_API_KEY, SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY.
 */

import { missingEnv } from './lib/stripe-helpers.js';

const UUID_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
const SITE = 'https://prismmtg.com';
const FROM = 'PRISM Gallery <gallery@relay.prismmtg.com>';
const ADMIN_LINK = `${SITE}/gallery.html?view=admin`;
const MAX_AGE_MS = 10 * 60 * 1000;
const SUBJECTS = { upload: 'New gallery upload to review', claim: 'New artist claim to review' } as const;

function getCorsHeaders(request: Request): Record<string, string> {
  const origin = request.headers.get('origin') || SITE;
  const allowedOrigin = Deno.env.get('CONTEXT') === 'production' ? SITE : origin;
  return {
    'Access-Control-Allow-Origin': allowedOrigin,
    'Access-Control-Allow-Headers': 'Content-Type, Authorization',
    'Access-Control-Allow-Methods': 'POST, OPTIONS',
    'Vary': 'Origin',
  };
}

function escapeHtml(text: string): string {
  return text.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;').replace(/'/g, '&#39;');
}

export default async function handler(request: Request): Promise<Response> {
  const cors = getCorsHeaders(request);
  const done = (status = 204) => new Response(null, { status, headers: cors });
  if (request.method === 'OPTIONS') return done();
  if (request.method !== 'POST') return done(405);

  const missing = missingEnv(
    ['RESEND_API_KEY', 'SUPABASE_URL', 'SUPABASE_SERVICE_ROLE_KEY'],
    (name: string) => Deno.env.get(name)
  );
  if (missing.length > 0) {
    console.error(`Gallery notify: missing env vars: ${missing.join(', ')}`);
    return done(503);
  }
  const supabaseUrl = Deno.env.get('SUPABASE_URL') as string;
  const serviceKey = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY') as string;
  const service = { 'apikey': serviceKey, 'Authorization': `Bearer ${serviceKey}`, 'Content-Type': 'application/json' };
  const rest = async (query: string) => {
    const res = await fetch(`${supabaseUrl}/rest/v1/${query}`, { headers: service });
    if (!res.ok) throw new Error(`Supabase ${query.split('?')[0]} lookup failed: ${res.status}`);
    return res.json();
  };

  const body = await request.json().catch(() => null);
  const kind = body?.kind;
  const id = body?.id;
  if ((kind !== 'upload' && kind !== 'claim') || typeof id !== 'string' || !UUID_RE.test(id)) return done();

  try {
    const token = request.headers.get('authorization')?.replace(/^Bearer\s+/i, '');
    if (!token) return done();
    const userRes = await fetch(`${supabaseUrl}/auth/v1/user`, {
      headers: { 'apikey': serviceKey, 'Authorization': `Bearer ${token}` }
    });
    if (!userRes.ok) return done();
    const user = await userRes.json();
    if (!user?.id || !UUID_RE.test(user.id)) return done();

    const since = encodeURIComponent(new Date(Date.now() - MAX_AGE_MS).toISOString());
    const recentPending = `id=eq.${id}&status=eq.pending&created_at=gte.${since}`;
    const [item] = kind === 'upload'
      ? await rest(`gallery_artworks?${recentPending}&uploader_id=eq.${user.id}&select=title,type`)
      : await rest(`gallery_artist_claims?${recentPending}&user_id=eq.${user.id}&select=artist:gallery_artists(name)`);
    if (!item) return done();

    const admins: { user_id: string }[] = await rest('gallery_admins?select=user_id');
    const emails = (await Promise.all(admins.map(async ({ user_id }) => {
      const res = await fetch(`${supabaseUrl}/auth/v1/admin/users/${user_id}`, { headers: service });
      return res.ok ? (await res.json())?.email : null;
    }))).filter(Boolean);
    if (emails.length === 0) return done();

    // Everything named comes from the database, never the request; the subject is fixed.
    const name = String(kind === 'upload' ? item.title : item.artist?.name ?? '');
    const what = kind === 'upload' ? `A new ${item.type} upload, "${name}",` : `A claim on the artist page "${name}"`;
    const whatHtml = kind === 'upload'
      ? `A new ${escapeHtml(String(item.type))} upload, “${escapeHtml(name)}”,`
      : `A claim on the artist page “${escapeHtml(name)}”`;
    // Claim the ledger row first: of two racing requests only one gets a row back.
    const ledgerRes = await fetch(`${supabaseUrl}/rest/v1/gallery_review_notices`, {
      method: 'POST',
      headers: { ...service, 'Prefer': 'resolution=ignore-duplicates,return=representation' },
      body: JSON.stringify({ kind, item_id: id }),
    });
    if (!ledgerRes.ok) throw new Error(`Supabase gallery_review_notices claim failed: ${ledgerRes.status}`);
    if ((await ledgerRes.json()).length === 0) return done();

    const sendRes = await fetch('https://api.resend.com/emails/batch', {
      method: 'POST',
      headers: { 'Authorization': `Bearer ${Deno.env.get('RESEND_API_KEY')}`, 'Content-Type': 'application/json' },
      body: JSON.stringify(emails.map(to => ({
        from: FROM,
        to: [to],
        subject: SUBJECTS[kind as keyof typeof SUBJECTS],
        text: `${what} is waiting for review.\n\nReview it in the Admin view: ${ADMIN_LINK}`,
        html: `<p>${whatHtml} is waiting for review.</p>\n<p><a href="${ADMIN_LINK}">Open the Admin view</a></p>`,
      }))),
    });
    if (!sendRes.ok) {
      console.error('Gallery notify: Resend error', sendRes.status, await sendRes.text());
      // Release the claim so a retry can send; no email went out.
      const undo = await fetch(`${supabaseUrl}/rest/v1/gallery_review_notices?kind=eq.${kind}&item_id=eq.${id}`, { method: 'DELETE', headers: service });
      if (!undo.ok) console.error('Gallery notify: ledger release failed', undo.status);
      return done(502);
    }

    return done();
  } catch (error) {
    console.error('Gallery notify error:', error);
    return done(500);
  }
}

export const config = {
  path: '/api/gallery-notify'
};
