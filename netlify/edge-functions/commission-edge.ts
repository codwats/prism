/**
 * Netlify Edge Function: Commission relay (#325, spec #321)
 * Runs on Deno at the edge.
 *
 * POST { artistId, artworkId?, message, turnstileToken } with a Supabase
 * access token. Relays the request once by email from relay.prismmtg.com to
 * the Artist's private commission email, reply_to the requester, so the
 * Artist's Reply reaches them directly. No address is ever echoed back.
 *
 * Order of checks: method → body → Turnstile → session → artist (claimed,
 * open, contacts row) → artwork (approved, this artist's) → claim → Resend.
 * The claim_gallery_commission_send RPC enforces both rate limits under a
 * per-requester lock and inserts the ledger row before the email goes out, so
 * two racing requests send at most one; null is a 429. A Resend failure
 * deletes the claimed row (the requester can retry today) and is a 502.
 *
 * Env (Netlify dashboard, see scripts/setup-commission-relay.sh):
 * RESEND_API_KEY, TURNSTILE_SECRET_KEY, SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY.
 */

import { missingEnv } from './lib/stripe-helpers.js';

const UUID_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
const SITE = 'https://prismmtg.com';
const FROM = 'PRISM Commissions <commissions@relay.prismmtg.com>';
const SUBJECT = 'Commission request via PRISM';

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

function escapeHtml(text: string): string {
  return text.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;').replace(/'/g, '&#39;');
}

type Body = { artistId: string; artworkId: string | null; message: string; turnstileToken: string };

function parseBody(raw: unknown): Body | null {
  const b = raw as Record<string, unknown> | null;
  if (!b || typeof b !== 'object') return null;
  const { artistId, artworkId, message, turnstileToken } = b;
  if (typeof artistId !== 'string' || !UUID_RE.test(artistId)) return null;
  if (artworkId != null && artworkId !== '' && (typeof artworkId !== 'string' || !UUID_RE.test(artworkId))) return null;
  if (typeof message !== 'string') return null;
  const trimmed = message.trim();
  if (trimmed.length < 20 || trimmed.length > 2000) return null;
  if (typeof turnstileToken !== 'string' || !turnstileToken) return null;
  return { artistId, artworkId: (artworkId as string) || null, message: trimmed, turnstileToken };
}

export default async function handler(request: Request): Promise<Response> {
  if (request.method === 'OPTIONS') {
    return new Response(null, { status: 204, headers: getCorsHeaders(request) });
  }
  if (request.method !== 'POST') {
    return jsonResponse(request, 405, { error: 'Method not allowed' });
  }

  const missing = missingEnv(
    ['RESEND_API_KEY', 'TURNSTILE_SECRET_KEY', 'SUPABASE_URL', 'SUPABASE_SERVICE_ROLE_KEY'],
    (name: string) => Deno.env.get(name)
  );
  if (missing.length > 0) {
    console.error(`Commission relay: missing env vars: ${missing.join(', ')}`);
    return jsonResponse(request, 503, { error: 'Commissions are not available yet' });
  }
  const supabaseUrl = Deno.env.get('SUPABASE_URL') as string;
  const serviceKey = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY') as string;
  const service = { 'apikey': serviceKey, 'Authorization': `Bearer ${serviceKey}`, 'Content-Type': 'application/json' };
  const rest = async (query: string) => {
    const res = await fetch(`${supabaseUrl}/rest/v1/${query}`, { headers: service });
    if (!res.ok) throw new Error(`Supabase ${query.split('?')[0]} lookup failed: ${res.status}`);
    return res.json();
  };

  const body = parseBody(await request.json().catch(() => null));
  if (!body) {
    return jsonResponse(request, 400, { error: 'Write a message of 20 to 2000 characters and complete the check.' });
  }

  try {
    const verify = await fetch('https://challenges.cloudflare.com/turnstile/v0/siteverify', {
      method: 'POST',
      body: new URLSearchParams({ secret: Deno.env.get('TURNSTILE_SECRET_KEY') as string, response: body.turnstileToken }),
    });
    if (!(await verify.json().catch(() => null))?.success) {
      return jsonResponse(request, 403, { error: 'The human check failed. Try again.' });
    }

    const token = request.headers.get('authorization')?.replace(/^Bearer\s+/i, '');
    if (!token) return jsonResponse(request, 401, { error: 'Not signed in' });
    const userRes = await fetch(`${supabaseUrl}/auth/v1/user`, {
      headers: { 'apikey': serviceKey, 'Authorization': `Bearer ${token}` }
    });
    if (!userRes.ok) return jsonResponse(request, 401, { error: 'Invalid session' });
    const user = await userRes.json();
    if (!user?.email || !user.email_confirmed_at) {
      return jsonResponse(request, 401, { error: 'Confirm your email address first' });
    }

    const [artist] = await rest(`gallery_artists?id=eq.${body.artistId}&select=id,name,user_id,commissions_open`);
    if (!artist?.user_id) return jsonResponse(request, 404, { error: 'Artist not found' });
    const [contact] = await rest(`gallery_artist_contacts?artist_id=eq.${body.artistId}&select=commission_email`);
    if (!artist.commissions_open || !contact?.commission_email) {
      return jsonResponse(request, 409, { error: 'This artist has closed commissions.' });
    }

    let artwork: { id: string; title: string; image_path: string } | null = null;
    if (body.artworkId) {
      [artwork] = await rest(`gallery_artworks?id=eq.${body.artworkId}&artist_id=eq.${body.artistId}&status=eq.approved&select=id,title,image_path`);
      if (!artwork) return jsonResponse(request, 404, { error: 'Artwork not found for this artist' });
    }

    // The title comes from the database, never the requester; newlines stripped anyway.
    const title = artwork ? String(artwork.title).replace(/[\r\n]+/g, ' ') : '';
    const thumb = artwork ? `${supabaseUrl}/storage/v1/object/public/gallery-art/${artwork.image_path}` : '';
    const link = artwork ? `${SITE}/gallery.html?art=${artwork.id}` : '';
    const text = [
      `Someone on PRISM would like to commission you, ${artist.name}.`,
      '',
      body.message,
      '',
      ...(artwork ? [`Regarding: ${title}`, `Thumbnail: ${thumb}`, `In the gallery: ${link}`, ''] : []),
      'Reply to this email to answer them directly. PRISM relays one message and keeps no copy.',
    ].join('\n');
    const html = `<p>Someone on PRISM would like to commission you, ${escapeHtml(String(artist.name))}.</p>
<p style="white-space:pre-wrap">${escapeHtml(body.message)}</p>
${artwork ? `<p>Regarding: <a href="${escapeHtml(link)}">${escapeHtml(title)}</a><br><img src="${escapeHtml(thumb)}" alt="${escapeHtml(title)}" width="240"></p>` : ''}
<p>Reply to this email to answer them directly. PRISM relays one message and keeps no copy.</p>`;

    // Claim first: the RPC returns the new ledger row's id, or null at a limit.
    const claimRes = await fetch(`${supabaseUrl}/rest/v1/rpc/claim_gallery_commission_send`, {
      method: 'POST',
      headers: service,
      body: JSON.stringify({ p_user_id: user.id, p_artist_id: body.artistId, p_artwork_id: artwork?.id ?? null }),
    });
    if (!claimRes.ok) throw new Error(`Supabase claim_gallery_commission_send failed: ${claimRes.status}`);
    const claimId = await claimRes.json();
    if (!claimId) {
      return jsonResponse(request, 429, { error: 'You’ve reached today’s commission limit. Try again tomorrow.' });
    }

    const sendRes = await fetch('https://api.resend.com/emails', {
      method: 'POST',
      headers: { 'Authorization': `Bearer ${Deno.env.get('RESEND_API_KEY')}`, 'Content-Type': 'application/json' },
      body: JSON.stringify({
        from: FROM,
        to: [contact.commission_email],
        reply_to: user.email,
        subject: artwork ? `${SUBJECT} — Regarding: ${title}` : SUBJECT,
        text,
        html,
      }),
    });
    if (!sendRes.ok) {
      console.error('Commission relay: Resend error', sendRes.status, await sendRes.text());
      // Release the claim so the requester can retry today; no email went out.
      const undo = await fetch(`${supabaseUrl}/rest/v1/gallery_commission_sends?id=eq.${encodeURIComponent(claimId)}`, { method: 'DELETE', headers: service });
      if (!undo.ok) console.error('Commission relay: ledger release failed', undo.status);
      return jsonResponse(request, 502, { error: 'Your request couldn’t be sent. Try again later.' });
    }

    return jsonResponse(request, 200, { ok: true });
  } catch (error) {
    console.error('Commission relay error:', error);
    return jsonResponse(request, 500, { error: 'Your request couldn’t be sent. Try again later.' });
  }
}

export const config = {
  path: '/api/commission'
};
