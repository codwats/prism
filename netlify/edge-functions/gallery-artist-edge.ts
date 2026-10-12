/**
 * Netlify Edge Function: admin artist pages (#330, spec #328)
 * Runs on Deno at the edge.
 *
 * POST { name, bio?, links?, avatarUrl?, isPartner?, email? } with a gallery
 * admin's Supabase access token. Creates the artist page with the service role;
 * with an email (#332) it then writes the contacts row (invited_email +
 * commission_email) and sends a Supabase account invite that lands on the
 * page. Returns { artistId, url, invite: 'sent'|'existing_account'|'failed'|'email_not_saved'|'none' };
 * the artist row is kept whatever the invite does. 'email_not_saved' means the
 * contacts row failed, so no invite went out and Resend has nothing to send to.
 *
 * POST { artistId, resend: true } re-sends the invite to the stored
 * invited_email: 404 unknown artist, 409 claimed or never invited.
 *
 * The invited address never appears in a response or a log line.
 *
 * Order of checks: method → env → session → is_gallery_admin (as the caller)
 * → body → insert. Edits don't come through here: admins UPDATE directly
 * under the "Admins manage gallery artists" policy.
 *
 * Env: SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY, SITE_URL (optional).
 */

import { missingEnv } from './lib/stripe-helpers.js';
import { linkIcon } from '../../js/modules/gallery-links.js';

const SITE = 'https://prismmtg.com';
const MAX_LINKS = 10;
const EMAIL_RE = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
const UUID_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

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

function jsonResponse(request: Request, status: number, body: unknown): Response {
  return new Response(JSON.stringify(body), {
    status,
    headers: { ...getCorsHeaders(request), 'Content-Type': 'application/json' }
  });
}

function isHttps(value: unknown): value is string {
  if (typeof value !== 'string') return false;
  try { return new URL(value).protocol === 'https:'; } catch { return false; }
}

type Link = { label: string; icon: string; family?: string; href: string };
type ArtistInput = { name: string; bio: string; links: Link[]; avatarUrl: string | null; isPartner: boolean; email: string | null };
type Invite = 'sent' | 'existing_account' | 'failed';

/** The validated, normalized create body, or a reason it was refused. */
function parseArtist(raw: unknown): ArtistInput | string {
  const b = raw as Record<string, unknown> | null;
  if (!b || typeof b !== 'object' || Array.isArray(b)) return 'Send the artist as JSON.';
  const name = typeof b.name === 'string' ? b.name.trim() : '';
  if (name.length < 1 || name.length > 80) return 'The name must be 1 to 80 characters.';
  if (b.bio != null && (typeof b.bio !== 'string' || b.bio.length > 2000)) return 'The bio must be text of at most 2000 characters.';
  if (b.isPartner != null && typeof b.isPartner !== 'boolean') return 'The partner flag must be true or false.';
  if (b.avatarUrl != null && b.avatarUrl !== '' && !isHttps(b.avatarUrl)) return 'The avatar must be a web address starting with https://';
  const email = typeof b.email === 'string' ? b.email.trim() : b.email;
  if (email != null && email !== '' && (typeof email !== 'string' || email.length > 254 || !EMAIL_RE.test(email))) return 'That email doesn’t look right.';
  const rawLinks = b.links ?? [];
  if (!Array.isArray(rawLinks) || rawLinks.length > MAX_LINKS) return `Links must be a list of at most ${MAX_LINKS}.`;
  const links: Link[] = [];
  for (const l of rawLinks) {
    if (!l || typeof l !== 'object' || !isHttps(l.href)) return 'Each link must be a web address starting with https://';
    const label = typeof l.label === 'string' && l.label.trim() ? l.label.trim().slice(0, 80) : new URL(l.href).hostname.replace(/^www\./, '');
    links.push({ label, ...linkIcon(l.href), href: l.href });
  }
  return {
    name,
    bio: typeof b.bio === 'string' ? b.bio.trim() : '',
    links,
    avatarUrl: (b.avatarUrl as string) || null,
    isPartner: b.isPartner === true,
    email: (email as string) || null,
  };
}

/** Supabase admin invite. GoTrue answers 422 for an address that already has an account. */
async function sendInvite(supabaseUrl: string, serviceKey: string, email: string, redirectTo: string): Promise<Invite> {
  const res = await fetch(`${supabaseUrl}/auth/v1/invite?redirect_to=${encodeURIComponent(redirectTo)}`, {
    method: 'POST',
    headers: { 'apikey': serviceKey, 'Authorization': `Bearer ${serviceKey}`, 'Content-Type': 'application/json' },
    body: JSON.stringify({ email, redirect_to: redirectTo }),
  });
  if (res.ok) return 'sent';
  const err = await res.json().catch(() => ({}));
  // Newer GoTrue: { error_code: 'email_exists' }; some versions put it in `code`; older ones only say it in msg.
  if (res.status === 422 && (err.error_code === 'email_exists' || err.code === 'email_exists'
    || /already (been )?registered/i.test(String(err.msg ?? err.message ?? '')))) return 'existing_account';
  console.error(`Gallery artist: invite failed: ${res.status}`);
  return 'failed';
}

export default async function handler(request: Request): Promise<Response> {
  if (request.method === 'OPTIONS') {
    return new Response(null, { status: 204, headers: getCorsHeaders(request) });
  }
  if (request.method !== 'POST') {
    return jsonResponse(request, 405, { error: 'Method not allowed' });
  }

  const missing = missingEnv(['SUPABASE_URL', 'SUPABASE_SERVICE_ROLE_KEY'], (name: string) => Deno.env.get(name));
  if (missing.length > 0) {
    console.error(`Gallery artist: missing env vars: ${missing.join(', ')}`);
    return jsonResponse(request, 503, { error: 'Artist pages can’t be created yet' });
  }
  const supabaseUrl = Deno.env.get('SUPABASE_URL') as string;
  const serviceKey = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY') as string;
  const site = Deno.env.get('SITE_URL') || SITE;
  let resend = false;

  try {
    const token = request.headers.get('authorization')?.replace(/^Bearer\s+/i, '');
    if (!token) return jsonResponse(request, 401, { error: 'Not signed in' });
    const asCaller = { 'apikey': serviceKey, 'Authorization': `Bearer ${token}`, 'Content-Type': 'application/json' };
    const userRes = await fetch(`${supabaseUrl}/auth/v1/user`, { headers: asCaller });
    if (!userRes.ok) return jsonResponse(request, 401, { error: 'Invalid session' });

    const adminRes = await fetch(`${supabaseUrl}/rest/v1/rpc/is_gallery_admin`, { method: 'POST', headers: asCaller, body: '{}' });
    if (!adminRes.ok || (await adminRes.json()) !== true) {
      return jsonResponse(request, 403, { error: 'Only gallery admins can add artists' });
    }

    const serviceHeaders = { 'apikey': serviceKey, 'Authorization': `Bearer ${serviceKey}`, 'Content-Type': 'application/json' };
    const pageUrl = (id: string) => `${site}/gallery.html?artist=${id}`;
    const body = await request.json().catch(() => null);

    resend = body?.resend === true;
    if (resend) {
      const artistId = String(body.artistId ?? '');
      if (!UUID_RE.test(artistId)) return jsonResponse(request, 404, { error: 'Artist not found' });
      const artistRes = await fetch(`${supabaseUrl}/rest/v1/gallery_artists?id=eq.${artistId}&select=id,user_id`, { headers: serviceHeaders });
      if (!artistRes.ok) throw new Error(`gallery_artists read failed: ${artistRes.status}`);
      const [row] = await artistRes.json();
      if (!row) return jsonResponse(request, 404, { error: 'Artist not found' });
      if (row.user_id) return jsonResponse(request, 409, { error: 'This artist page is already claimed' });
      const contactRes = await fetch(`${supabaseUrl}/rest/v1/gallery_artist_contacts?artist_id=eq.${artistId}&select=invited_email`, { headers: serviceHeaders });
      if (!contactRes.ok) throw new Error(`gallery_artist_contacts read failed: ${contactRes.status}`);
      const [contact] = await contactRes.json();
      if (!contact?.invited_email) return jsonResponse(request, 409, { error: 'This artist was never invited' });
      const invite = await sendInvite(supabaseUrl, serviceKey, contact.invited_email, pageUrl(artistId));
      return jsonResponse(request, 200, { artistId, url: pageUrl(artistId), invite });
    }

    const artist = parseArtist(body);
    if (typeof artist === 'string') return jsonResponse(request, 400, { error: artist });

    const insertRes = await fetch(`${supabaseUrl}/rest/v1/gallery_artists?select=id`, {
      method: 'POST',
      headers: { 'apikey': serviceKey, 'Authorization': `Bearer ${serviceKey}`, 'Content-Type': 'application/json', 'Prefer': 'return=representation' },
      body: JSON.stringify({
        name: artist.name, bio: artist.bio, links: artist.links, avatar_url: artist.avatarUrl, is_partner: artist.isPartner,
      }),
    });
    if (!insertRes.ok) throw new Error(`gallery_artists insert failed: ${insertRes.status}`);
    const [{ id: artistId }] = await insertRes.json();

    let invite: Invite | 'email_not_saved' | 'none' = 'none';
    if (artist.email) {
      const contactRes = await fetch(`${supabaseUrl}/rest/v1/gallery_artist_contacts`, {
        method: 'POST',
        headers: serviceHeaders,
        body: JSON.stringify({ artist_id: artistId, invited_email: artist.email, commission_email: artist.email }),
      });
      if (!contactRes.ok) {
        // Kept: the page exists. Without the contacts row the claim can't auto-approve, so don't invite.
        console.error(`Gallery artist: contacts insert failed: ${contactRes.status}`);
        invite = 'email_not_saved';
      } else {
        invite = await sendInvite(supabaseUrl, serviceKey, artist.email, pageUrl(artistId));
      }
    }
    return jsonResponse(request, 200, { artistId, url: pageUrl(artistId), invite });
  } catch (error) {
    console.error('Gallery artist error:', error);
    return jsonResponse(request, 500, { error: resend ? 'The invite couldn’t be resent. Try again.' : 'The artist page couldn’t be created. Try again.' });
  }
}

export const config = {
  path: '/api/gallery-artist'
};
