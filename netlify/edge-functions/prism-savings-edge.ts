/**
 * Netlify Edge Function: site-wide money saved (home page counter)
 * Runs on Deno at the edge.
 *
 * GET → { usd, copies }: the duplicate copies every synced PRISM no longer
 * needs (site_card_savings() in supabase-schema.sql), priced at Scryfall's USD
 * price for each card's default printing. Cached at the CDN for a day, so
 * Scryfall and the database see about one request a day, not one per visit.
 *
 * Env: SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY.
 */

import { missingEnv } from './lib/stripe-helpers.js';

const BATCH = 75; // Scryfall /cards/collection maximum
// shortcut: only the 1,500 most-saved cards are priced (20 requests at Scryfall's 2/s), so the
// total undercounts the long tail; store prices in a table if the collection outgrows that.
const MAX_PRICED = 1500;
const SPACING_MS = 500;

type Prices = { usd?: string | null; usd_foil?: string | null; usd_etched?: string | null };
type ScryCard = { name: string; prices?: Prices; card_faces?: { name: string }[] };

export function priceOf(card: ScryCard): number {
  const p = card.prices ?? {};
  const value = Number(p.usd ?? p.usd_foil ?? p.usd_etched);
  return Number.isFinite(value) && value > 0 ? value : 0;
}

export default async function handler(request: Request): Promise<Response> {
  if (request.method !== 'GET') return new Response(null, { status: 405 });

  const missing = missingEnv(['SUPABASE_URL', 'SUPABASE_SERVICE_ROLE_KEY'], (name: string) => Deno.env.get(name));
  if (missing.length > 0) {
    console.error(`PRISM savings: missing env vars: ${missing.join(', ')}`);
    return new Response(null, { status: 503 });
  }
  const supabaseUrl = Deno.env.get('SUPABASE_URL') as string;
  const serviceKey = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY') as string;

  try {
    const res = await fetch(`${supabaseUrl}/rest/v1/rpc/site_card_savings?order=saved_copies.desc`, {
      method: 'POST',
      headers: { 'apikey': serviceKey, 'Authorization': `Bearer ${serviceKey}`, 'Content-Type': 'application/json' },
      body: '{}',
    });
    if (!res.ok) throw new Error(`Supabase site_card_savings failed: ${res.status}`);
    const rows: { card_name: string; saved_copies: number }[] = await res.json();

    const prices = new Map<string, number>();
    const priced = rows.slice(0, MAX_PRICED);
    for (let i = 0; i < priced.length; i += BATCH) {
      if (i > 0) await new Promise(r => setTimeout(r, SPACING_MS));
      const scry = await fetch('https://api.scryfall.com/cards/collection', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', 'Accept': 'application/json', 'User-Agent': 'PRISM/1.0' },
        body: JSON.stringify({ identifiers: priced.slice(i, i + BATCH).map(r => ({ name: r.card_name.split(' // ')[0] })) }), // Scryfall matches DFCs by front face only
      });
      // A failed batch leaves its cards unpriced rather than failing the whole count.
      if (!scry.ok) { console.error('PRISM savings: Scryfall', scry.status); if (scry.status === 429) break; continue; }
      for (const card of ((await scry.json()).data ?? []) as ScryCard[]) {
        const price = priceOf(card);
        // Stored names may be the full "Front // Back" name or the front face alone.
        for (const name of [card.name, card.card_faces?.[0]?.name]) if (name) prices.set(name.toLowerCase(), price);
      }
    }

    let usd = 0;
    let copies = 0;
    for (const { card_name, saved_copies } of rows) {
      copies += Number(saved_copies);
      usd += Number(saved_copies) * (prices.get(card_name.toLowerCase()) ?? 0);
    }

    return Response.json({ usd: Math.round(usd), copies }, {
      headers: {
        'Cache-Control': 'public, max-age=3600',
        'Netlify-CDN-Cache-Control': 'public, durable, s-maxage=86400, stale-while-revalidate=604800',
      },
    });
  } catch (error) {
    console.error('PRISM savings error:', error);
    return new Response(null, { status: 502 });
  }
}

export const config = {
  path: '/api/prism-savings',
  cache: 'manual',
};
