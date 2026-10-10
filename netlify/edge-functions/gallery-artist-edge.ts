/**
 * Netlify Edge Function: admin artist pages (#330, spec #328)
 * Runs on Deno at the edge.
 *
 * POST { name, bio?, links?, avatarUrl?, isPartner? } with a gallery admin's
 * Supabase access token. Creates the artist page with the service role and
 * returns { artistId, url, invite }. No invite is sent yet (`invite: 'none'`);
 * the email + invite step slots in after the insert.
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
type ArtistInput = { name: string; bio: string; links: Link[]; avatarUrl: string | null; isPartner: boolean };

/** The validated, normalized create body, or a reason it was refused. */
function parseArtist(raw: unknown): ArtistInput | string {
  const b = raw as Record<string, unknown> | null;
  if (!b || typeof b !== 'object' || Array.isArray(b)) return 'Send the artist as JSON.';
  const name = typeof b.name === 'string' ? b.name.trim() : '';
  if (name.length < 1 || name.length > 80) return 'The name must be 1 to 80 characters.';
  if (b.bio != null && (typeof b.bio !== 'string' || b.bio.length > 2000)) return 'The bio must be text of at most 2000 characters.';
  if (b.isPartner != null && typeof b.isPartner !== 'boolean') return 'The partner flag must be true or false.';
  if (b.avatarUrl != null && b.avatarUrl !== '' && !isHttps(b.avatarUrl)) return 'The avatar must be a web address starting with https://';
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
  };
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

    const artist = parseArtist(await request.json().catch(() => null));
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

    const invite = 'none';
    return jsonResponse(request, 200, { artistId, url: `${site}/gallery.html?artist=${artistId}`, invite });
  } catch (error) {
    console.error('Gallery artist error:', error);
    return jsonResponse(request, 500, { error: 'The artist page couldn’t be created. Try again.' });
  }
}

export const config = {
  path: '/api/gallery-artist'
};
