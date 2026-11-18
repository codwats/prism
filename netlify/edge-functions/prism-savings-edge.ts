/**
 * Netlify Edge Function: site-wide money saved (home page counter)
 * Runs on Deno at the edge.
 *
 * GET → { usd, copies }: the duplicate copies every synced PRISM no longer
 * needs (site_card_savings() in supabase-schema.sql), priced at Scryfall's USD
 * price for each card's default printing. The total is kept in app_config
 * ('site_savings') and rebuilt at most once a day, in the background when a
 * stored total exists, so visitors never wait on the ~25 s Scryfall run.
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

type Totals = { usd: number; copies: number; computed_at: string };
const KEY = 'site_savings'; // app_config row: anyone may read it, only the service role writes
const MAX_AGE_MS = 24 * 60 * 60 * 1000;

export default async function handler(request: Request, context?: { waitUntil?: (p: Promise<unknown>) => void }): Promise<Response> {
  if (request.method !== 'GET') return new Response(null, { status: 405 });

  const missing = missingEnv(['SUPABASE_URL', 'SUPABASE_SERVICE_ROLE_KEY'], (name: string) => Deno.env.get(name));
  if (missing.length > 0) {
    console.error(`PRISM savings: missing env vars: ${missing.join(', ')}`);
    return new Response(null, { status: 503 });
  }
  const supabaseUrl = Deno.env.get('SUPABASE_URL') as string;
  const serviceKey = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY') as string;
  const service = { 'apikey': serviceKey, 'Authorization': `Bearer ${serviceKey}`, 'Content-Type': 'application/json' };
  const save = async (value: Totals | null) => {
    const res = value
      ? await fetch(`${supabaseUrl}/rest/v1/app_config`, {
        method: 'POST', headers: { ...service, 'Prefer': 'resolution=merge-duplicates' }, body: JSON.stringify({ key: KEY, value }),
      })
      : await fetch(`${supabaseUrl}/rest/v1/app_config?key=eq.${KEY}`, { method: 'DELETE', headers: service });
    if (!res.ok) throw new Error(`Supabase app_config write failed: ${res.status}`);
  };
  const reply = ({ usd, copies }: Totals) => Response.json({ usd, copies }, { headers: { 'Cache-Control': 'public, max-age=3600' } });

  try {
    const res = await fetch(`${supabaseUrl}/rest/v1/app_config?key=eq.${KEY}&select=value`, { headers: service });
    if (!res.ok) throw new Error(`Supabase app_config read failed: ${res.status}`);
    const stored: Totals | undefined = (await res.json())[0]?.value;
    if (stored && Date.now() - Date.parse(stored.computed_at) < MAX_AGE_MS) return reply(stored);

    // Stale or missing: stamp the old totals as fresh first, so requests arriving during
    // the ~25 s rebuild serve them instead of starting their own Scryfall run.
    // With nothing stored there is no total to stamp: a fake zero would read as a valid cache.
    if (stored) await save({ usd: stored.usd, copies: stored.copies, computed_at: new Date().toISOString() });
    const refresh = computeTotals(supabaseUrl, service).then(async (fresh) => { await save(fresh); return fresh; })
      .catch(async (error) => {
        console.error('PRISM savings refresh failed:', error);
        await save(stored ?? null).catch(e => console.error('PRISM savings: restore failed', e)); // the next request retries
        throw error;
      });
    if (stored && context?.waitUntil) {
      context.waitUntil(refresh.catch(() => {}));
      return reply(stored);
    }
    return reply(await refresh);
  } catch (error) {
    console.error('PRISM savings error:', error);
    return new Response(null, { status: 502 });
  }
}

async function computeTotals(supabaseUrl: string, service: Record<string, string>): Promise<Totals> {
  // PostgREST caps a response (1000 rows by default), so page until a short page.
  const PAGE = 1000;
  const rows: { card_name: string; saved_copies: number }[] = [];
  for (let offset = 0; ; offset += PAGE) {
    const res = await fetch(`${supabaseUrl}/rest/v1/rpc/site_card_savings?order=saved_copies.desc,card_name.asc&limit=${PAGE}&offset=${offset}`, {
      method: 'POST', headers: service, body: '{}',
    });
    if (!res.ok) throw new Error(`Supabase site_card_savings failed: ${res.status}`);
    const page = await res.json();
    rows.push(...page);
    if (page.length < PAGE) break;
  }

  const prices = new Map<string, number>();
  const priced = rows.slice(0, MAX_PRICED);
  for (let i = 0; i < priced.length; i += BATCH) {
    if (i > 0) await new Promise(r => setTimeout(r, SPACING_MS));
    const scry = await fetch('https://api.scryfall.com/cards/collection', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', 'Accept': 'application/json', 'User-Agent': 'PRISM/1.0' },
      body: JSON.stringify({ identifiers: priced.slice(i, i + BATCH).map(r => ({ name: r.card_name.split(' // ')[0] })) }), // Scryfall matches DFCs by front face only
    });
    // A failed batch must not cache an undercount as fresh: throw so the caller restores the old total and the next request retries.
    if (!scry.ok) throw new Error(`Scryfall pricing failed: ${scry.status}`);
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
  return { usd: Math.round(usd), copies, computed_at: new Date().toISOString() };
}

export const config = {
  path: '/api/prism-savings',
};
