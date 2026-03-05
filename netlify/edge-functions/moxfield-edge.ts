/**
 * Netlify Edge Function: Moxfield API Proxy
 * Runs on Deno at the edge - different infrastructure than regular functions
 */

const CORS_HEADERS = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'Content-Type',
  'Access-Control-Allow-Methods': 'GET, POST, OPTIONS'
};

export default async function handler(request: Request): Promise<Response> {
  // Handle CORS preflight
  if (request.method === 'OPTIONS') {
    return new Response(null, {
      status: 204,
      headers: CORS_HEADERS
    });
  }

  // Only allow POST
  if (request.method !== 'POST') {
    return new Response(JSON.stringify({ error: 'Method not allowed' }), {
      status: 405,
      headers: { ...CORS_HEADERS, 'Content-Type': 'application/json' }
    });
  }

  try {
    const body = await request.json();
    const { publicId } = body;

    if (!publicId) {
      return new Response(JSON.stringify({ error: 'Missing publicId' }), {
        status: 400,
        headers: { ...CORS_HEADERS, 'Content-Type': 'application/json' }
      });
    }

    // Validate publicId format
    if (!/^[a-zA-Z0-9_-]+$/.test(publicId)) {
      return new Response(JSON.stringify({ error: 'Invalid deck ID format' }), {
        status: 400,
        headers: { ...CORS_HEADERS, 'Content-Type': 'application/json' }
      });
    }

    const moxfieldUrl = `https://api2.moxfield.com/v3/decks/all/${publicId}`;

    const response = await fetch(moxfieldUrl, {
      method: 'GET',
      headers: {
        'accept': 'application/json, text/plain, */*',
        'accept-language': 'en-US,en;q=0.9',
        'authorization': 'Bearer undefined',
        'cache-control': 'no-cache',
        'pragma': 'no-cache',
        'sec-ch-ua': '"Microsoft Edge";v="141", "Not?A_Brand";v="8", "Chromium";v="141"',
        'sec-ch-ua-mobile': '?0',
        'sec-ch-ua-platform': '"Windows"',
        'sec-fetch-dest': 'empty',
        'sec-fetch-mode': 'cors',
        'sec-fetch-site': 'same-site',
        'x-moxfield-version': '2025.10.13.2',
        'Referer': 'https://moxfield.com/',
        'Referrer-Policy': 'strict-origin-when-cross-origin',
        'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/141.0.0.0 Safari/537.36 Edg/141.0.0.0'
      }
    });

    if (!response.ok) {
      const errorText = await response.text();
      console.error('Moxfield API error:', response.status, errorText);

      if (response.status === 404) {
        return new Response(JSON.stringify({ error: 'Deck not found. Make sure the deck is public.' }), {
          status: 404,
          headers: { ...CORS_HEADERS, 'Content-Type': 'application/json' }
        });
      }

      return new Response(JSON.stringify({ error: `Moxfield API error: ${response.status}` }), {
        status: response.status,
        headers: { ...CORS_HEADERS, 'Content-Type': 'application/json' }
      });
    }

    const data = await response.json();

    return new Response(JSON.stringify(data), {
      status: 200,
      headers: {
        ...CORS_HEADERS,
        'Content-Type': 'application/json',
        'Cache-Control': 'public, max-age=3600'
      }
    });

  } catch (error) {
    console.error('Moxfield edge proxy error:', error);
    return new Response(JSON.stringify({ error: 'Failed to fetch deck from Moxfield' }), {
      status: 500,
      headers: { ...CORS_HEADERS, 'Content-Type': 'application/json' }
    });
  }
}

export const config = {
  path: '/api/moxfield-edge'
};
