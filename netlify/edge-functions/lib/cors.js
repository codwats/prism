/**
 * CORS + JSON response helpers shared by the edge functions (#442).
 * Plain .js beside stripe-helpers.js for the same reason (see there).
 */

const SITE = 'https://prismmtg.com';

// `methods` / `headers` are the Access-Control-Allow-* values, which differ per function.
export function corsHelpers({ methods, headers }) {
  function getCorsHeaders(request) {
    const origin = request.headers.get('origin') || SITE;
    // Production allows only the site; elsewhere the origin is echoed, so `Vary`
    // is required or a cache could serve one origin's header to another.
    const allowedOrigin = globalThis.Deno.env.get('CONTEXT') === 'production' ? SITE : origin;
    return {
      'Access-Control-Allow-Origin': allowedOrigin,
      'Access-Control-Allow-Headers': headers,
      'Access-Control-Allow-Methods': methods,
      'Vary': 'Origin',
    };
  }

  function jsonResponse(request, status, body) {
    return new Response(JSON.stringify(body), {
      status,
      headers: { ...getCorsHeaders(request), 'Content-Type': 'application/json' },
    });
  }

  return { getCorsHeaders, jsonResponse };
}
