/**
 * Netlify Edge Function: DeckCheck API Proxy
 * Runs on Deno at the edge. DeckCheck sends no CORS headers, and an API key
 * (DECKCHECK_API_KEY, optional) must never reach the browser.
 */

function getCorsHeaders(request: Request): Record<string, string> {
  const origin = request.headers.get('origin') || 'https://prismmtg.com';
  const allowedOrigin = Deno.env.get('CONTEXT') === 'production'
    ? 'https://prismmtg.com'
    : origin;
  return {
    'Access-Control-Allow-Origin': allowedOrigin,
    'Access-Control-Allow-Headers': 'Content-Type',
    'Access-Control-Allow-Methods': 'POST, OPTIONS',
    'Vary': 'Origin',
  };
}

function jsonResponse(request: Request, body: unknown, status: number): Response {
  return new Response(JSON.stringify(body), {
    status,
    headers: { ...getCorsHeaders(request), 'Content-Type': 'application/json' }
  });
}

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
    return jsonResponse(request, { error: 'Method not allowed' }, 405);
  }

  try {
    const { deckUrl } = await request.json();

    if (typeof deckUrl !== 'string' || !/^https:\/\/deckcheck\.co\/app\/decklist\/[A-Za-z0-9_-]+$/.test(deckUrl)) {
      return jsonResponse(request, { error: 'Invalid DeckCheck URL' }, 400);
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
      return jsonResponse(request,
        { error: UPSTREAM_ERRORS[response.status] || `DeckCheck API error: ${response.status}` },
        response.status);
    }

    return jsonResponse(request, await response.json(), 200);
  } catch (error) {
    console.error('DeckCheck edge proxy error:', error);
    return jsonResponse(request, { error: 'Failed to fetch deck from DeckCheck' }, 500);
  }
}

export const config = {
  path: '/api/deckcheck-edge'
};
