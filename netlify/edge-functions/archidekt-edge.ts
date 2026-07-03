/**
 * Netlify Edge Function: Archidekt API Proxy
 * Runs on Deno at the edge
 */

function getCorsHeaders(request: Request): Record<string, string> {
  const origin = request.headers.get('origin') || 'https://prismmtg.com';
  const allowedOrigin = Deno.env.get('CONTEXT') === 'production'
    ? 'https://prismmtg.com'
    : origin;
  return {
    'Access-Control-Allow-Origin': allowedOrigin,
    'Access-Control-Allow-Headers': 'Content-Type',
    'Access-Control-Allow-Methods': 'GET, POST, OPTIONS',
    // Responses are publicly cacheable and ACAO echoes the request Origin in
    // non-production contexts — without Vary, a cache could serve one origin's
    // ACAO header to a different origin.
    'Vary': 'Origin',
  };
}

export default async function handler(request: Request): Promise<Response> {
  // Handle CORS preflight
  if (request.method === 'OPTIONS') {
    return new Response(null, {
      status: 204,
      headers: getCorsHeaders(request)
    });
  }

  // Only allow POST
  if (request.method !== 'POST') {
    return new Response(JSON.stringify({ error: 'Method not allowed' }), {
      status: 405,
      headers: { ...getCorsHeaders(request), 'Content-Type': 'application/json' }
    });
  }

  try {
    const body = await request.json();
    const { deckId } = body;

    if (!deckId) {
      return new Response(JSON.stringify({ error: 'Missing deckId' }), {
        status: 400,
        headers: { ...getCorsHeaders(request), 'Content-Type': 'application/json' }
      });
    }

    // Validate deckId is numeric
    if (!/^\d+$/.test(deckId)) {
      return new Response(JSON.stringify({ error: 'Invalid deck ID format' }), {
        status: 400,
        headers: { ...getCorsHeaders(request), 'Content-Type': 'application/json' }
      });
    }

    const archidektUrl = `https://archidekt.com/api/decks/${deckId}/`;

    const response = await fetch(archidektUrl, {
      method: 'GET',
      headers: {
        'Accept': 'application/json',
        'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/141.0.0.0 Safari/537.36'
      }
    });

    if (!response.ok) {
      const errorText = await response.text();
      console.error('Archidekt API error:', response.status, errorText);

      if (response.status === 404) {
        return new Response(JSON.stringify({ error: 'Deck not found. Make sure the deck is public.' }), {
          status: 404,
          headers: { ...getCorsHeaders(request), 'Content-Type': 'application/json' }
        });
      }

      return new Response(JSON.stringify({ error: `Archidekt API error: ${response.status}` }), {
        status: response.status,
        headers: { ...getCorsHeaders(request), 'Content-Type': 'application/json' }
      });
    }

    const data = await response.json();

    return new Response(JSON.stringify(data), {
      status: 200,
      headers: {
        ...getCorsHeaders(request),
        'Content-Type': 'application/json',
        'Cache-Control': 'public, max-age=3600'
      }
    });

  } catch (error) {
    console.error('Archidekt edge proxy error:', error);
    return new Response(JSON.stringify({ error: 'Failed to fetch deck from Archidekt' }), {
      status: 500,
      headers: { ...getCorsHeaders(request), 'Content-Type': 'application/json' }
    });
  }
}

export const config = {
  path: '/api/archidekt-edge'
};
