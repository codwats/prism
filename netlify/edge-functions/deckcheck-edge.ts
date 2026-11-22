/**
 * Netlify Edge Function: DeckCheck API Proxy
 * Runs on Deno at the edge. DeckCheck sends no CORS headers, and an API key
 * (DECKCHECK_API_KEY, optional) must never reach the browser.
 */

import { corsHelpers } from './lib/cors.js';

const { getCorsHeaders, jsonResponse } = corsHelpers({ allowMethods: 'POST, OPTIONS', allowHeaders: 'Content-Type' });

const UPSTREAM_ERRORS: Record<number, string> = {
  403: 'This deck is private. Set it to Public or Unlisted on DeckCheck.',
  404: 'Deck not found.',
  429: 'DeckCheck is busy. Try again in a moment.',
};

export default async function handler(request: Request): Promise<Response> {
  if (request.method === 'OPTIONS') {
    return new Response(null, { status: 204, headers: getCorsHeaders(request) });
  }

  if (request.method !== 'POST') {
    return jsonResponse(request, 405, { error: 'Method not allowed' });
  }

  try {
    const { deckUrl } = await request.json();

    if (typeof deckUrl !== 'string' || !/^https:\/\/deckcheck\.co\/app\/decklist\/[A-Za-z0-9_-]+$/.test(deckUrl)) {
      return jsonResponse(request, 400, { error: 'Invalid DeckCheck URL' });
    }

    const headers: Record<string, string> = { 'Accept': 'application/json' };
    const apiKey = Deno.env.get('DECKCHECK_API_KEY');
    if (apiKey) headers['X-Api-Key'] = apiKey;

    const response = await fetch(
      `https://deckcheck.co/api/external/deck?deck_url=${encodeURIComponent(deckUrl)}`,
      { headers }
    );

    if (!response.ok) {
      console.error('DeckCheck API error:', response.status, await response.text());
      return jsonResponse(request, response.status,
        { error: UPSTREAM_ERRORS[response.status] || `DeckCheck API error: ${response.status}` });
    }

    return jsonResponse(request, 200, await response.json());
  } catch (error) {
    console.error('DeckCheck edge proxy error:', error);
    return jsonResponse(request, 500, { error: 'Failed to fetch deck from DeckCheck' });
  }
}

export const config = {
  path: '/api/deckcheck-edge',
  rateLimit: { windowLimit: 30, windowSize: 60, aggregateBy: ['ip', 'domain'] }
};
