/**
 * Netlify Edge Function: Commander Template deck proxy (#493)
 * Runs on Deno at the edge. The site has no API and sends no CORS headers, so
 * this fetches the public deck page and reads the deck out of it.
 */

import { corsHelpers } from './lib/cors.js';
import { readDeckPage, UNREADABLE } from './lib/commandertemplate-page.js';

const { getCorsHeaders, jsonResponse } = corsHelpers({ allowMethods: 'POST, OPTIONS', allowHeaders: 'Content-Type' });

const UPSTREAM_ERRORS: Record<number, string> = {
  403: 'Commander Template did not allow this request. Try again later.',
  404: 'Deck not found or not public.',
  429: 'Commander Template is busy. Try again in a moment.',
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

    // The URL is fetched as-is, so only the exact deck URL form may reach fetch
    if (typeof deckUrl !== 'string' || !/^https:\/\/commandertemplate\.com\/decks\/[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/.test(deckUrl)) {
      return jsonResponse(request, 400, { error: 'Invalid Commander Template URL' });
    }

    const response = await fetch(deckUrl, {
      headers: { 'Accept': 'text/html', 'User-Agent': 'PRISM deck import (https://prismmtg.com)' },
      redirect: 'error',
    });

    if (!response.ok) {
      console.error('Commander Template error:', response.status);
      return jsonResponse(request, response.status,
        { error: UPSTREAM_ERRORS[response.status] || `Commander Template error: ${response.status}` });
    }

    try {
      return jsonResponse(request, 200, readDeckPage(await response.text()));
    } catch (error) {
      console.error('Commander Template page not readable:', error);
      return jsonResponse(request, 502, { error: UNREADABLE });
    }
  } catch (error) {
    console.error('Commander Template edge proxy error:', error);
    return jsonResponse(request, 500, { error: 'Failed to fetch deck from Commander Template' });
  }
}

export const config = {
  path: '/api/commandertemplate-edge',
  rateLimit: { windowLimit: 30, windowSize: 60, aggregateBy: ['ip', 'domain'] }
};
