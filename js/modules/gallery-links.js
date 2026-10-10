/**
 * Artist page link icons (#330). Shared by the gallery client and the
 * /api/gallery-artist edge function, so a link gets the same icon whichever
 * path saves it. Plain JS with no imports: Deno, Node and the browser all load it.
 */

// Host (or its parent domain) → Font Awesome brands icon.
const BRAND_HOSTS = {
  'instagram.com': 'instagram',
  'x.com': 'x-twitter',
  'twitter.com': 'x-twitter',
  'bsky.app': 'bluesky',
  'threads.net': 'threads',
  'facebook.com': 'facebook',
  'tiktok.com': 'tiktok',
  'youtube.com': 'youtube',
  'twitch.tv': 'twitch',
  'artstation.com': 'artstation',
  'deviantart.com': 'deviantart',
  'behance.net': 'behance',
  'patreon.com': 'patreon',
  'etsy.com': 'etsy',
  'tumblr.com': 'tumblr',
  'discord.gg': 'discord',
  'discord.com': 'discord',
};

/** `{ icon, family? }` for a link's href: a brand icon for a known host, else globe. */
export function linkIcon(href) {
  let host;
  try { host = new URL(href).hostname.toLowerCase(); } catch { return { icon: 'globe' }; }
  const match = Object.keys(BRAND_HOSTS).find(h => host === h || host.endsWith(`.${h}`));
  return match ? { icon: BRAND_HOSTS[match], family: 'brands' } : { icon: 'globe' };
}
