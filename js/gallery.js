/**
 * PRISM Gallery — entry point for gallery.html
 *
 * One page, deep-linkable views via query params:
 *   gallery.html                 grid (default)
 *   gallery.html?art=<id>        artwork detail
 *   gallery.html?artist=<id>     artist page
 *   gallery.html?view=upload     community upload form (signed-in)
 *   gallery.html?view=uploads    my uploads (status tracking)
 *   gallery.html?view=admin      moderation queue (gallery admins only)
 *   gallery.html?view=edit-artist  the signed-in Artist's own profile + commission settings
 *   gallery.html?view=admin-artist[&id=]  admin: add an artist page, or edit any one
 *
 * Backend: Supabase (see the GALLERY section of supabase-schema.sql).
 * Public reads go through plain PostgREST fetch with the anon key so
 * logged-out visitors never load the SDK; likes, uploads, and moderation
 * use the SDK client (user is signed in, so it's already loaded).
 *
 * ponytail: if the gallery tables don't exist yet (schema not run), public
 * reads fail and the page falls back to the DEMO_* sample data below —
 * remove the demo arrays once real partner art is seeded.
 */

import { initLayout } from './layout.js';
import { getCurrentUser, onAuthChange, ensureAuthReady } from './modules/auth.js';
import { getSupabase, hasStoredSession, SUPABASE_URL, SUPABASE_ANON_KEY } from './modules/supabase-client.js';
import { showSuccess, showError, showToast } from './core/notifications.js';
import { wireCardAutocomplete as wireCardAutocompleteInput } from './modules/card-autocomplete.js';
import { escapeHtml } from './core/utils.js';
import { linkIcon } from './modules/gallery-links.js';

// ============================================================
// Demo fallback data (used only when the gallery schema isn't deployed)
// ============================================================

const DEMO_ARTISTS = [
  { id: 'reyes', name: 'M. Reyes', isPartner: true, bio: 'Illustrator specializing in artifact and enchantment treatments for Commander. Partnered with PRISM to share proxy and showcase art for personal use.', links: [{ label: 'mreyes.art', icon: 'globe', href: '#' }, { label: '@mreyes', icon: 'instagram', family: 'brands', href: '#' }] },
  { id: 'vela', name: 'Studio Vela', isPartner: true, bio: 'Two-person studio painting tokens and full-art lands with a storybook feel.', links: [{ label: 'studiovela.com', icon: 'globe', href: '#' }] },
  { id: 'okafor', name: 'A. Okafor', isPartner: true, userId: 'demo-okafor', bio: 'Showcase treatments with bold linework and saturated color.', links: [{ label: '@aokafor', icon: 'instagram', family: 'brands', href: '#' }], commissionsOpen: true, commissionNote: 'Alters and sleeve art, about 2 weeks. Tell me the card and the mood.' },
  { id: 'kanae', name: 'kanae_art', isPartner: false, bio: 'Community uploader', links: [] },
  { id: 'deckbrewer', name: 'deckbrewer', isPartner: false, bio: 'Community uploader', links: [] },
  { id: 'lindg', name: 'lindg', isPartner: false, bio: 'Community uploader', links: [] },
];

const DEMO_ARTWORKS = [
  { id: 'a1', title: 'Sol Ring — Ornate', type: 'proxy', artistId: 'reyes', likes: 412, downloads: 1804, isAI: false, highlighted: true, storeUrl: 'https://example.com/store/sol-ring-ornate', originalCard: { name: 'Sol Ring', set: 'Commander 2021', scryfallUrl: 'https://scryfall.com/search?q=%21%22Sol%20Ring%22' }, description: 'A gilded, art-nouveau take on the format’s most iconic mana rock. Warm brass against deep violet.', createdAt: '2026-05-02' },
  { id: 'a2', title: 'Treasure Token', type: 'token', artistId: 'vela', likes: 338, downloads: 1512, isAI: false, highlighted: true, storeUrl: 'https://example.com/store/treasure-token', originalCard: null, description: 'An overflowing chest for any deck that makes treasure. Painted in gouache.', createdAt: '2026-04-18' },
  { id: 'a3', title: 'Command Tower', type: 'showcase', artistId: 'okafor', likes: 291, downloads: 990, isAI: false, highlighted: true, storeUrl: '', originalCard: { name: 'Command Tower', set: 'Commander Legends', scryfallUrl: 'https://scryfall.com/search?q=%21%22Command%20Tower%22' }, description: 'The tower at dusk, five colors of light in its windows.', createdAt: '2026-04-30' },
  { id: 'a4', title: 'Arcane Signet', type: 'proxy', artistId: 'reyes', likes: 256, downloads: 874, isAI: false, highlighted: true, storeUrl: '', originalCard: { name: 'Arcane Signet', set: 'Throne of Eldraine', scryfallUrl: 'https://scryfall.com/search?q=%21%22Arcane%20Signet%22' }, description: 'Companion piece to Sol Ring — Ornate, same brass-and-violet language.', createdAt: '2026-05-06' },
  { id: 'a5', title: 'Beast Token', type: 'token', artistId: 'kanae', likes: 84, downloads: 233, isAI: false, highlighted: false, storeUrl: '', originalCard: null, description: 'Green 3/3 beast for go-wide decks. Community upload.', createdAt: '2026-06-01' },
  { id: 'a6', title: 'Rhystic Study', type: 'proxy', artistId: 'deckbrewer', likes: 63, downloads: 310, isAI: true, highlighted: false, storeUrl: '', originalCard: { name: 'Rhystic Study', set: 'Prophecy', scryfallUrl: 'https://scryfall.com/search?q=%21%22Rhystic%20Study%22' }, description: 'Do you pay the one? Moody library study, AI-assisted and hand-finished.', createdAt: '2026-06-10' },
  { id: 'a7', title: 'Cultivate', type: 'proxy', artistId: 'lindg', likes: 41, downloads: 122, isAI: false, highlighted: false, storeUrl: '', originalCard: { name: 'Cultivate', set: 'Magic 2011', scryfallUrl: 'https://scryfall.com/search?q=%21%22Cultivate%22' }, description: 'Two lands, one to hand. Soft watercolor greens.', createdAt: '2026-06-14' },
  { id: 'a8', title: 'Angel Token', type: 'token', artistId: 'vela', likes: 37, downloads: 96, isAI: false, highlighted: false, storeUrl: '', originalCard: null, description: 'A 4/4 vigilance angel in Studio Vela’s storybook style.', createdAt: '2026-06-20' },
  { id: 'a9', title: 'Mana Crypt', type: 'proxy', artistId: 'reyes', likes: 198, downloads: 701, isAI: false, highlighted: false, storeUrl: '', originalCard: { name: 'Mana Crypt', set: 'Eternal Masters', scryfallUrl: 'https://scryfall.com/search?q=%21%22Mana%20Crypt%22' }, description: 'The crypt rendered as a reliquary.', createdAt: '2026-05-20' },
  { id: 'a10', title: 'Smothering Tithe', type: 'showcase', artistId: 'reyes', likes: 143, downloads: 402, isAI: false, highlighted: false, storeUrl: '', originalCard: { name: 'Smothering Tithe', set: 'Ravnica Allegiance', scryfallUrl: 'https://scryfall.com/search?q=%21%22Smothering%20Tithe%22' }, description: 'Coins raining through cathedral light.', createdAt: '2026-05-28' },
  { id: 'a11', title: 'Swords to Plowshares', type: 'proxy', artistId: 'reyes', likes: 121, downloads: 350, isAI: false, highlighted: false, storeUrl: '', originalCard: { name: 'Swords to Plowshares', set: 'Alpha', scryfallUrl: 'https://scryfall.com/search?q=%21%22Swords%20to%20Plowshares%22' }, description: 'The classic answer, reforged.', createdAt: '2026-06-03' },
  { id: 'a13', title: 'Sol Ring — Night Market', type: 'alter', artistId: 'okafor', likes: 176, downloads: 0, isAI: false, highlighted: false, storeUrl: '', originalCard: { name: 'Sol Ring', set: 'Commander 2021', scryfallUrl: 'https://scryfall.com/search?q=%21%22Sol%20Ring%22' }, description: 'Acrylic over a real Sol Ring, the art extended to the borders. One of one.', createdAt: '2026-07-04' },
  { id: 'a12', title: 'Elf Warrior Token', type: 'token', artistId: 'lindg', likes: 22, downloads: 61, isAI: false, highlighted: false, storeUrl: '', originalCard: null, description: 'A 1/1 elf warrior for the wide boards.', createdAt: '2026-07-01' },
];

const TYPE_LABELS = { proxy: 'Proxy', token: 'Token', showcase: 'Showcase', alter: 'Alter' };
const TYPE_TAG_VARIANTS = { proxy: 'neutral', token: 'brand', showcase: 'warning', alter: 'success' };
const LICENSE_HTML = 'Personal, non-commercial use only — credit the artist. <a href="terms.html">Full terms</a>';
// An alter is a photograph of a real painted card, never a file to print (#322).
const ALTER_LICENSE_HTML = 'Display only — not for reproduction. Commission the artist for your own.';
// Public Turnstile site key (prismmtg.com + localhost); its secret is TURNSTILE_SECRET_KEY in Netlify.
const TURNSTILE_SITE_KEY = '0x4AAAAAAFSxouNPhJdr5HGl';

// ============================================================
// Data layer (Supabase)
// ============================================================

let artworks = [];        // approved artworks, mapped to camelCase
let artistsDb = [];       // gallery_artists rows, mapped
let myLikes = new Set();  // artwork ids the current user liked
let isAdmin = false;      // current user is a gallery admin (loaded before render)
let usingDemo = false;    // gallery schema not deployed — read-only sample data
let publicLoaded = false;

const REST_HEADERS = { apikey: SUPABASE_ANON_KEY, Authorization: `Bearer ${SUPABASE_ANON_KEY}` };

async function restGet(query) {
  const res = await fetch(`${SUPABASE_URL}/rest/v1/${query}`, { headers: REST_HEADERS });
  if (!res.ok) throw new Error(`Gallery fetch failed: ${res.status}`);
  return res.json();
}

function publicImageUrl(path) {
  return `${SUPABASE_URL}/storage/v1/object/public/gallery-art/${path}`;
}

function mapArtwork(r) {
  return {
    id: r.id,
    title: r.title,
    type: r.type,
    originalCard: r.original_card_name
      ? { name: r.original_card_name, set: r.original_card_set, scryfallUrl: r.scryfall_url }
      : null,
    description: r.description || '',
    isAI: r.is_ai,
    artistId: r.artist_id,
    artistName: r.artist_name,
    uploaderId: r.uploader_id,
    imageUrl: r.image_path ? publicImageUrl(r.image_path) : null,
    imagePath: r.image_path,
    likes: r.likes_count || 0,
    downloads: r.downloads_count || 0,
    highlighted: r.highlighted,
    storeUrl: r.store_url,
    status: r.status,
    reason: r.reject_reason,
    createdAt: r.created_at,
  };
}

function mapArtist(r) {
  return {
    id: r.id,
    name: r.name,
    bio: r.bio || '',
    avatarUrl: r.avatar_url,
    links: Array.isArray(r.links) ? r.links : [],
    isPartner: r.is_partner,
    userId: r.user_id || null, // set = a claimed Artist; null = an Attribution
    commissionsOpen: !!r.commissions_open,
    commissionNote: r.commission_note || '',
  };
}

async function loadPublicData() {
  try {
    const [artworkRows, artistRows] = await Promise.all([
      restGet('gallery_artworks?status=eq.approved&select=*&order=likes_count.desc'),
      restGet('gallery_artists?select=*'),
    ]);
    artworks = artworkRows.map(mapArtwork);
    artistsDb = artistRows.map(mapArtist);
    usingDemo = false;
  } catch (err) {
    console.warn('Gallery: schema not reachable, using demo data.', err);
    artworks = DEMO_ARTWORKS;
    artistsDb = DEMO_ARTISTS;
    usingDemo = true;
  }
  publicLoaded = true;
}

async function loadMyLikes() {
  const user = getCurrentUser();
  const sb = getSupabase();
  if (!user || !sb || usingDemo) {
    myLikes = new Set();
    return;
  }
  const { data } = await sb.from('gallery_likes').select('artwork_id').eq('user_id', user.id);
  myLikes = new Set((data || []).map(r => r.artwork_id));
}

async function loadAdminFlag() {
  const user = getCurrentUser();
  const sb = getSupabase();
  if (!user || !sb || usingDemo) {
    isAdmin = false;
    return;
  }
  const { data } = await sb.rpc('is_gallery_admin');
  isAdmin = !!data;
}

function findArtwork(id) {
  return artworks.find(a => a.id === id) || null;
}

function getArtist(id) {
  return artistsDb.find(a => a.id === id) || null;
}

function artistName(artwork) {
  return getArtist(artwork.artistId)?.name || artwork.artistName || 'Unknown';
}

function isLiked(id) {
  return myLikes.has(id);
}

function likeCount(artwork) {
  return artwork.likes || 0;
}

async function toggleLike(artwork) {
  const user = getCurrentUser();
  if (!user) {
    showToast('Sign in to like artwork', 'brand', 'heart');
    promptSignIn();
    return;
  }
  if (usingDemo) {
    showToast('Demo data — deploy the gallery schema to enable likes', 'neutral', 'database');
    return;
  }
  const sb = getSupabase();
  if (!sb) return;

  const wasLiked = myLikes.has(artwork.id);
  // Optimistic update; revert on error
  if (wasLiked) {
    myLikes.delete(artwork.id);
    artwork.likes = Math.max(0, artwork.likes - 1);
  } else {
    myLikes.add(artwork.id);
    artwork.likes += 1;
  }
  render();

  const { error } = wasLiked
    ? await sb.from('gallery_likes').delete().eq('artwork_id', artwork.id).eq('user_id', user.id)
    : await sb.from('gallery_likes').insert({ artwork_id: artwork.id, user_id: user.id });

  if (error) {
    if (wasLiked) {
      myLikes.add(artwork.id);
      artwork.likes += 1;
    } else {
      myLikes.delete(artwork.id);
      artwork.likes = Math.max(0, artwork.likes - 1);
    }
    render();
    showError('Could not save like — try again.');
  }
}

// ============================================================
// Shared render helpers
// ============================================================

// Only allow http/https URLs into href attributes — stored values (artist
// links, store URLs, scryfall links) must never render a javascript:/data: scheme.
function safeUrl(url) {
  if (!url) return '#';
  try {
    const u = new URL(url, window.location.origin);
    return u.protocol === 'http:' || u.protocol === 'https:' ? url : '#';
  } catch {
    return '#';
  }
}

function typeTagHtml(type, size = 's') {
  const variant = TYPE_TAG_VARIANTS[type] || 'neutral';
  return `<wa-tag size="${size}" variant="${variant}" appearance="outlined">${TYPE_LABELS[type] || type}</wa-tag>`;
}

function aiTagHtml(size = 's') {
  return `<wa-tag size="${size}" variant="neutral" appearance="filled"><wa-icon slot="start" name="robot"></wa-icon>AI-generated</wa-tag>`;
}

function partnerCheckHtml(artwork) {
  return getArtist(artwork.artistId)?.isPartner
    ? ' <wa-icon name="circle-check" style="color: var(--wa-color-brand-text); font-size: 0.75em;" label="Partnered artist"></wa-icon>'
    : '';
}

function artPlaceholderHtml(artwork, cls = 'gallery-art') {
  const img = artwork.imageUrl;
  return `<div class="${cls}">${img ? `<img src="${escapeHtml(img)}" alt="${escapeHtml(artwork.title)}" loading="lazy" />` : '<wa-icon name="image" label="Artwork placeholder"></wa-icon>'}${artwork.highlighted ? '<wa-tag class="gallery-flag" size="s" variant="brand">Featured</wa-tag>' : artwork.isAI ? '<wa-tag class="gallery-flag" size="s" variant="neutral" appearance="filled"><wa-icon name="robot" label="AI-generated"></wa-icon></wa-tag>' : ''}</div>`;
}

function avatarHtml(artist, sizeRem, extraStyle = '') {
  const style = `width: ${sizeRem}rem; height: ${sizeRem}rem;${extraStyle}`;
  return artist?.avatarUrl
    ? `<div class="gallery-avatar" style="${style} overflow: hidden;"><img src="${escapeHtml(safeUrl(artist.avatarUrl))}" alt="" style="width: 100%; height: 100%; object-fit: cover;" /></div>`
    : `<div class="gallery-avatar" style="${style}"><wa-icon name="user"></wa-icon></div>`;
}

function cardHtml(artwork) {
  return `
    <a class="gallery-card${artwork.highlighted ? ' gallery-card--feat' : ''}" href="gallery.html?art=${encodeURIComponent(artwork.id)}" style="text-decoration: none; color: inherit;">
      ${artPlaceholderHtml(artwork)}
      <div class="gallery-cbody">
        <div class="gallery-ctitle">${escapeHtml(artwork.title)}</div>
        <div class="gallery-arow"><wa-icon name="user" style="font-size: 0.7em;"></wa-icon>${escapeHtml(artistName(artwork))}${partnerCheckHtml(artwork)}</div>
        <div class="gallery-cfoot">
          ${typeTagHtml(artwork.type)}
          <button type="button" class="gallery-likes${isLiked(artwork.id) ? ' liked' : ''}" data-like="${escapeHtml(artwork.id)}" aria-label="Like">
            <wa-icon name="heart" family="${isLiked(artwork.id) ? 'solid' : 'regular'}"></wa-icon>${likeCount(artwork)}
          </button>
        </div>
      </div>
    </a>`;
}

function breadcrumbHtml(items) {
  return `<wa-breadcrumb style="margin-bottom: var(--wa-space-m);">
    ${items.map(i => (i.href ? `<wa-breadcrumb-item href="${i.href}">${escapeHtml(i.label)}</wa-breadcrumb-item>` : `<wa-breadcrumb-item>${escapeHtml(i.label)}</wa-breadcrumb-item>`)).join('')}
  </wa-breadcrumb>`;
}

function licenseHtml(type) {
  return `<div class="gallery-license"><wa-icon name="scale-balanced" style="margin-top: 0.15em; flex: none;"></wa-icon><span>${type === 'alter' ? ALTER_LICENSE_HTML : LICENSE_HTML}</span></div>`;
}

function loadingHtml() {
  return `
    <div class="wa-stack wa-gap-m">
      <wa-skeleton effect="pulse" style="width: 30%; height: 2rem;"></wa-skeleton>
      <wa-skeleton effect="pulse" style="width: 60%;"></wa-skeleton>
      <wa-skeleton effect="pulse" style="width: 100%; height: 8rem;"></wa-skeleton>
    </div>`;
}

function promptSignIn() {
  ensureAuthReady();
  document.getElementById('auth-dialog')?.setAttribute('open', '');
}

/** Wire like buttons inside the root after any render. */
function wireLikeButtons(root) {
  root.querySelectorAll('[data-like]').forEach(btn => {
    btn.addEventListener('click', e => {
      e.preventDefault();
      e.stopPropagation();
      const artwork = findArtwork(btn.dataset.like);
      if (artwork) toggleLike(artwork);
    });
  });
}

// ============================================================
// Grid view
// ============================================================

// ?type=alter is Alter Alley's URL; it seeds the type filter once on load.
const initialType = new URLSearchParams(window.location.search).get('type');
const filters = { type: TYPE_LABELS[initialType] ? initialType : 'all', artist: 'all', q: '', sort: 'liked' };

function sortArtworks(list) {
  const key = { liked: a => likeCount(a), new: a => Date.parse(a.createdAt) || 0, dl: a => a.downloads || 0 }[filters.sort];
  return [...list].sort((a, b) => key(b) - key(a));
}

function filteredArtworks() {
  const q = filters.q.trim().toLowerCase();
  return artworks.filter(a => {
    if (filters.type !== 'all' && a.type !== filters.type) return false;
    if (filters.artist === 'partnered') {
      if (!getArtist(a.artistId)?.isPartner) return false;
    } else if (filters.artist !== 'all' && a.artistId !== filters.artist) return false;
    if (q && !(a.originalCard?.name || '').toLowerCase().includes(q) && !a.title.toLowerCase().includes(q)) return false;
    return true;
  });
}

function renderGrid(root) {
  const user = getCurrentUser();
  const alley = filters.type === 'alter';
  if (alley && filters.sort === 'dl') filters.sort = 'liked'; // alters are never downloaded
  const results = sortArtworks(filteredArtworks());
  const featured = results.filter(a => a.highlighted);
  const rest = results.filter(a => !a.highlighted);
  const hasFilter = filters.type !== 'all' || filters.artist !== 'all' || filters.q.trim() !== '';

  const partnered = artistsDb.filter(a => a.isPartner);
  const community = [...new Set(artworks.map(a => a.artistId).filter(id => id && !getArtist(id)?.isPartner))]
    .map(id => getArtist(id)).filter(Boolean);

  let gridsHtml;
  if (results.length === 0) {
    gridsHtml = hasFilter ? `
      <div class="gallery-empty">
        <div class="ic"><wa-icon name="image"></wa-icon></div>
        <h3 class="wa-heading-s">No artwork matches these filters</h3>
        <p class="wa-caption-m" style="color: var(--wa-color-neutral-text-subtle); max-width: 32ch;">Try another card name or clear the type filter.</p>
        <div class="wa-cluster wa-gap-xs">
          <wa-button size="s" appearance="outlined" id="gallery-clear-filters">Clear filters</wa-button>
          <wa-button size="s" variant="brand" href="gallery.html?view=upload"><wa-icon slot="start" name="plus"></wa-icon>Upload one</wa-button>
        </div>
      </div>` : `
      <div class="gallery-empty">
        <div class="ic"><wa-icon name="image"></wa-icon></div>
        <h3 class="wa-heading-s">No artwork yet</h3>
        <p class="wa-caption-m" style="color: var(--wa-color-neutral-text-subtle); max-width: 32ch;">Partnered art is on its way. Be the first community upload.</p>
        <wa-button size="s" variant="brand" href="gallery.html?view=upload"><wa-icon slot="start" name="plus"></wa-icon>Upload artwork</wa-button>
      </div>`;
  } else if (hasFilter || filters.sort !== 'liked') {
    gridsHtml = `
      <div class="gallery-eyebrow"><wa-icon name="images"></wa-icon>Results <span class="count">&middot; ${results.length} piece${results.length === 1 ? '' : 's'}</span></div>
      <div class="wa-grid wa-gap-m gallery-grid">${results.map(cardHtml).join('')}</div>`;
  } else {
    gridsHtml = `
      ${featured.length ? `
        <div class="gallery-eyebrow"><wa-icon name="star" style="color: var(--wa-color-brand-text);"></wa-icon>Featured <span class="count">&middot; partnered work</span></div>
        <div class="wa-grid wa-gap-m gallery-grid">${featured.map(cardHtml).join('')}</div>` : ''}
      <div class="gallery-eyebrow"><wa-icon name="images"></wa-icon>All artwork <span class="count">&middot; ${rest.length} piece${rest.length === 1 ? '' : 's'}</span></div>
      <div class="wa-grid wa-gap-m gallery-grid">${rest.map(cardHtml).join('')}</div>`;
  }

  root.innerHTML = `
    <div class="wa-split" style="align-items: flex-start; gap: var(--wa-space-m);">
      <div>
        ${alley ? `
        <h1 class="wa-heading-2xl">Alter Alley</h1>
        <p style="color: var(--wa-color-neutral-text-subtle); max-width: 60ch; margin-top: var(--wa-space-2xs);">Real cards, painted over by hand. An alter is expensive, unique and expressive, so you own exactly one, and that one copy has to serve every deck that runs the card: a Pool copy by definition. One alter, every deck. Each piece is shown as a photograph, never a file to print. Commission the artist for your own.</p>` : `
        <h1 class="wa-heading-2xl">Gallery</h1>
        <p style="color: var(--wa-color-neutral-text-subtle); max-width: 60ch; margin-top: var(--wa-space-2xs);">Partnered and community artwork for proxies, tokens, and showcase treatments, plus hand-painted alters. Personal, non-commercial use with credit to the artist.</p>`}
      </div>
      <wa-button variant="brand" href="gallery.html?view=upload"><wa-icon slot="start" name="plus"></wa-icon>Upload artwork</wa-button>
    </div>

    ${user ? '' : `
    <wa-callout variant="brand" size="s" style="margin-top: var(--wa-space-m);">
      <wa-icon slot="icon" name="circle-info"></wa-icon>
      Browsing as a guest. Likes and counts are visible. <a href="#" id="gallery-signin-link">Sign in</a> to like and download.
    </wa-callout>`}

    <div class="gallery-toolbar">
      <div class="gallery-toolbar-search">
        <wa-input id="gallery-search" size="s" label="Card name search" placeholder="Search by card name — e.g. Sol Ring" value="${escapeHtml(filters.q)}">
          <wa-icon slot="start" name="magnifying-glass"></wa-icon>
        </wa-input>
      </div>
      <div>
        <span class="gallery-tlabel">Type</span>
        <wa-button-group label="Filter by type">
          ${['all', ...Object.keys(TYPE_LABELS)].map(t => `<wa-button size="s" data-type="${t}"${filters.type === t ? ' variant="brand"' : ' appearance="outlined"'}>${t === 'all' ? 'All' : TYPE_LABELS[t]}</wa-button>`).join('')}
        </wa-button-group>
      </div>
      <wa-select id="gallery-artist" size="s" label="Artist" value="${escapeHtml(filters.artist)}" style="width: 12rem;">
        <wa-option value="all">All artists</wa-option>
        <wa-option value="partnered">Partnered artists</wa-option>
        ${partnered.map(a => `<wa-option value="${a.id}">${escapeHtml(a.name)}</wa-option>`).join('')}
        ${community.map(a => `<wa-option value="${a.id}">${escapeHtml(a.name)}</wa-option>`).join('')}
      </wa-select>
      <wa-select id="gallery-sort" size="s" label="Sort" value="${escapeHtml(filters.sort)}" style="width: 11rem;">
        <wa-option value="liked">Most liked</wa-option>
        <wa-option value="new">Newest</wa-option>
        ${alley ? '' : '<wa-option value="dl">Most downloaded</wa-option>'}
      </wa-select>
    </div>

    ${gridsHtml}`;

  wireLikeButtons(root);
  root.querySelector('#gallery-signin-link')?.addEventListener('click', e => { e.preventDefault(); promptSignIn(); });
  root.querySelector('#gallery-clear-filters')?.addEventListener('click', () => {
    filters.type = 'all'; filters.artist = 'all'; filters.q = ''; filters.sort = 'liked';
    render();
  });
  root.querySelectorAll('[data-type]').forEach(btn => btn.addEventListener('click', () => {
    filters.type = btn.dataset.type;
    render();
  }));
  const search = root.querySelector('#gallery-search');
  let searchTimer;
  search?.addEventListener('input', () => {
    clearTimeout(searchTimer);
    searchTimer = setTimeout(() => { filters.q = search.value || ''; render(); }, 250);
  });
  root.querySelector('#gallery-artist')?.addEventListener('change', e => { filters.artist = e.target.value; render(); });
  root.querySelector('#gallery-sort')?.addEventListener('change', e => { filters.sort = e.target.value; render(); });
}

// ============================================================
// Detail view
// ============================================================

// CAMPAIGN WINDOW (#222): the logged-out download caption below. Reverted when
// signups reopen (#206), see docs/runbooks/enforcement-cutover.md. A JS comment, not an
// HTML one inside the template literal: that renders into public page source.
function renderDetail(root, id) {
  const artwork = findArtwork(id);
  if (!artwork) {
    renderNotFound(root, 'Artwork not found', 'It may still be in review, or the link is wrong.');
    return;
  }
  const user = getCurrentUser();
  const artist = getArtist(artwork.artistId);
  const more = artworks.filter(a => a.artistId === artwork.artistId && a.id !== artwork.id && artwork.artistId).slice(0, 4);
  const liked = isLiked(artwork.id);

  root.innerHTML = `
    ${breadcrumbHtml([{ label: 'Gallery', href: 'gallery.html' }, { label: artwork.title }])}
    <div class="gallery-detail">
      ${artPlaceholderHtml(artwork, 'gallery-art gallery-art--lg')}
      <div class="wa-stack wa-gap-s">
        <div class="wa-cluster wa-gap-xs wa-align-items-center">
          ${typeTagHtml(artwork.type)}
          ${artwork.isAI ? aiTagHtml() : ''}
        </div>
        <h1 class="wa-heading-xl">${escapeHtml(artwork.title)}</h1>
        ${artwork.originalCard && artwork.type === 'alter'
          ? `<p class="wa-heading-m" style="margin: 0;">Painted over ${escapeHtml(artwork.originalCard.name)}</p>` : ''}
        ${artwork.originalCard
          ? `<div class="gallery-orig"><wa-icon name="link" style="color: var(--wa-color-neutral-text-subtle);"></wa-icon><span>Original card: <strong>${escapeHtml(artwork.originalCard.name)}</strong>${artwork.originalCard.set ? ` &middot; ${escapeHtml(artwork.originalCard.set)}` : ''}</span><a href="${escapeHtml(safeUrl(artwork.originalCard.scryfallUrl || 'https://scryfall.com/search?q=' + encodeURIComponent('!"' + artwork.originalCard.name + '"')))}" target="_blank" rel="noopener" style="margin-left: auto; font-size: var(--wa-font-size-xs);">Scryfall <wa-icon name="arrow-up-right-from-square" style="font-size: 0.7em;"></wa-icon></a></div>`
          : `<div class="gallery-orig"><wa-icon name="circle-minus" style="color: var(--wa-color-neutral-text-subtle);"></wa-icon><span style="color: var(--wa-color-neutral-text-subtle);">No original card${artwork.type === 'token' ? ' (token)' : ''}</span></div>`}
        ${artwork.description ? `<p class="gallery-desc">${escapeHtml(artwork.description)}</p>` : ''}
        <wa-divider></wa-divider>
        <div class="gallery-artist-card">
          ${avatarHtml(artist, 2.875)}
          <div style="flex: 1;">
            <div class="wa-cluster wa-gap-xs wa-align-items-center">
              <strong>${escapeHtml(artistName(artwork))}</strong>
              ${artist?.isPartner ? '<wa-tag size="s" variant="brand"><wa-icon slot="start" name="handshake-angle"></wa-icon>Partner</wa-tag>' : ''}
            </div>
            <p class="wa-caption-m" style="color: var(--wa-color-neutral-text-subtle); margin: var(--wa-space-3xs) 0 var(--wa-space-xs);">${escapeHtml(artist?.bio || 'Community uploader')}</p>
            <div class="wa-cluster wa-gap-m" style="font-size: var(--wa-font-size-s);">
              ${(artist?.links || []).map(l => `<a href="${escapeHtml(safeUrl(l.href))}" target="_blank" rel="noopener"><wa-icon name="${escapeHtml(l.icon || 'globe')}"${l.family ? ` family="${escapeHtml(l.family)}"` : ''}></wa-icon> ${escapeHtml(l.label)}</a>`).join('')}
              ${artist ? `<a href="gallery.html?artist=${encodeURIComponent(artist.id)}">View artist page &rarr;</a>` : ''}
            </div>
          </div>
        </div>
        <div class="wa-cluster wa-gap-s wa-align-items-center">
          <wa-button appearance="outlined" id="detail-like"><wa-icon slot="start" name="heart" family="${liked ? 'solid' : 'regular'}"${liked ? ' style="color: var(--wa-color-brand-text);"' : ''}></wa-icon>Like &middot; ${likeCount(artwork)}</wa-button>
          ${artwork.type === 'alter' ? '' : user
            ? '<wa-button variant="brand" id="detail-download"><wa-icon slot="start" name="download"></wa-icon>Download</wa-button>'
            : '<wa-button variant="brand" id="detail-download-gated"><wa-icon slot="start" name="lock"></wa-icon>Sign in to download</wa-button>'}
          ${artwork.type === 'alter' && artist?.userId && artist.commissionsOpen
            ? `<wa-button variant="brand" href="gallery.html?artist=${encodeURIComponent(artist.id)}&art=${encodeURIComponent(artwork.id)}#commission"><wa-icon slot="start" name="paintbrush"></wa-icon>Commission this artist</wa-button>` : ''}
          ${artwork.highlighted && artwork.storeUrl ? `<wa-button appearance="outlined" href="${escapeHtml(safeUrl(artwork.storeUrl))}" target="_blank" rel="noopener"><wa-icon slot="start" name="cart-shopping"></wa-icon>Order custom sleeves <wa-icon slot="end" name="arrow-up-right-from-square" style="font-size: 0.7em;"></wa-icon></wa-button>` : ''}
          ${user && !usingDemo && (isAdmin || artwork.uploaderId === user.id) ? `<wa-button appearance="outlined" href="gallery.html?view=edit&art=${encodeURIComponent(artwork.id)}"><wa-icon slot="start" name="pen"></wa-icon>Edit</wa-button>` : ''}
        </div>
        ${user || artwork.type === 'alter' ? '' : '<p class="wa-caption-s" style="color: var(--wa-color-neutral-text-subtle); margin: 0;">Downloads need an account, and signup is currently closed. Each download is one print-ready file (2.5&times;3.5&Prime; + bleed).</p>'}
        ${licenseHtml(artwork.type)}
      </div>
    </div>
    ${more.length ? `
      <div class="gallery-eyebrow"><wa-icon name="images"></wa-icon>More from ${escapeHtml(artistName(artwork))}</div>
      <div class="wa-grid wa-gap-m gallery-grid">${more.map(cardHtml).join('')}</div>` : ''}`;

  wireLikeButtons(root);
  root.querySelector('#detail-like')?.addEventListener('click', () => toggleLike(artwork));
  root.querySelector('#detail-download')?.addEventListener('click', () => {
    if (usingDemo || !artwork.imageUrl) {
      // ponytail: demo pieces have no hosted file — real artworks always do
      showToast('Print-ready file coming soon for this piece', 'neutral', 'download');
      return;
    }
    getSupabase()?.rpc('increment_gallery_download', { p_artwork_id: artwork.id });
    window.open(artwork.imageUrl, '_blank', 'noopener');
  });
  root.querySelector('#detail-download-gated')?.addEventListener('click', promptSignIn);
}

// ============================================================
// Artist view
// ============================================================

function renderArtist(root, id) {
  const artist = getArtist(id);
  if (!artist) {
    renderNotFound(root, 'Artist not found', 'The link may be wrong.');
    return;
  }
  const works = sortArtworks(artworks.filter(a => a.artistId === artist.id));
  const totalLikes = works.reduce((sum, a) => sum + likeCount(a), 0);
  const focus = [...new Set(works.map(w => TYPE_LABELS[w.type]))].join(' &middot; ');

  root.innerHTML = `
    ${breadcrumbHtml([{ label: 'Gallery', href: 'gallery.html' }, { label: artist.name }])}
    <div class="gallery-artist-head${artist.isPartner ? '' : ' gallery-artist-head--community'}">
      ${avatarHtml(artist, 5, ` font-size: var(--wa-font-size-xl);${artist.isPartner && !artist.avatarUrl ? ' background: var(--wa-color-brand-fill-normal); color: var(--wa-color-brand-on-normal);' : ''}`)}
      <div style="flex: 1;">
        <div class="wa-cluster wa-gap-s wa-align-items-center">
          <h1 class="wa-heading-xl">${escapeHtml(artist.name)}</h1>
          ${artist.isPartner ? '<wa-tag variant="brand"><wa-icon slot="start" name="handshake-angle"></wa-icon>PRISM Partner</wa-tag>' : ''}
          ${artist.commissionsOpen ? '<wa-tag variant="success"><wa-icon slot="start" name="paintbrush"></wa-icon>Open for commissions</wa-tag>' : ''}
          ${isOwnArtist(artist) ? '<wa-button size="s" appearance="outlined" href="gallery.html?view=edit-artist"><wa-icon slot="start" name="pen"></wa-icon>Edit profile</wa-button>' : ''}
        </div>
        <p style="color: var(--wa-color-neutral-text); margin: var(--wa-space-xs) 0 0; max-width: 64ch;">${escapeHtml(artist.bio)}</p>
        ${artist.links.length ? `<div class="wa-cluster wa-gap-m" style="margin-top: var(--wa-space-s); font-size: var(--wa-font-size-s);">${artist.links.map(l => `<a href="${escapeHtml(safeUrl(l.href))}" target="_blank" rel="noopener"><wa-icon name="${escapeHtml(l.icon || 'globe')}"${l.family ? ` family="${escapeHtml(l.family)}"` : ''}></wa-icon> ${escapeHtml(l.label)}</a>`).join('')}</div>` : ''}
        ${artist.commissionsOpen && artist.commissionNote ? `<p class="wa-caption-m" style="margin: var(--wa-space-xs) 0 0; max-width: 64ch;"><wa-icon name="paintbrush"></wa-icon> ${escapeHtml(artist.commissionNote)}</p>` : ''}
        ${artist.userId ? '' : '<div id="artist-claim" class="wa-cluster wa-gap-s wa-align-items-center" style="margin-top: var(--wa-space-s);"></div>'}
        ${artist.isPartner ? `
        <div class="gallery-stats">
          <div class="gallery-stat"><b>${works.length}</b><span>Works</span></div>
          <div class="gallery-stat"><b>${totalLikes}</b><span>Likes</span></div>
          ${focus ? `<div class="gallery-stat"><b>${focus}</b><span>Focus</span></div>` : ''}
        </div>` : ''}
      </div>
    </div>
    ${artist.commissionsOpen ? '<section id="commission" style="margin-bottom: var(--wa-space-xl); max-width: 40rem;"></section>' : ''}
    <div class="gallery-eyebrow"><wa-icon name="images"></wa-icon>Works <span class="count">&middot; ${works.length}</span></div>
    ${works.length
      ? `<div class="wa-grid wa-gap-m gallery-grid">${works.map(cardHtml).join('')}</div>`
      : '<p style="color: var(--wa-color-neutral-text-subtle);">No public works yet.</p>'}`;

  wireLikeButtons(root);
  renderClaimSlot(root.querySelector('#artist-claim'), artist);
  renderCommissionForm(root.querySelector('#commission'), artist, works);
  // The section renders after the page loads, so the browser's own hash scroll misses it.
  if (window.location.hash === '#commission') root.querySelector('#commission')?.scrollIntoView();
}

let turnstileReady = null;
function loadTurnstile() {
  turnstileReady ??= new Promise((resolve, reject) => {
    const script = document.createElement('script');
    script.src = 'https://challenges.cloudflare.com/turnstile/v0/api.js?render=explicit';
    script.async = true;
    script.onload = () => resolve(window.turnstile);
    script.onerror = () => { turnstileReady = null; reject(new Error('Turnstile failed to load')); };
    document.head.appendChild(script);
  });
  return turnstileReady;
}

/** The Commission form under the artist's note: relayed once by /api/commission. */
function renderCommissionForm(section, artist, works) {
  if (!section) return;
  const heading = '<div class="gallery-eyebrow"><wa-icon name="paintbrush"></wa-icon>Request a commission</div>';
  const done = (variant, icon, text) => {
    section.innerHTML = `${heading}<wa-callout variant="${variant}"><wa-icon slot="icon" name="${icon}"></wa-icon>${text}</wa-callout>`;
  };
  if (!getCurrentUser()) {
    section.innerHTML = `${heading}
      <p style="color: var(--wa-color-neutral-text); margin-top: 0;">Sign in to send ${escapeHtml(artist.name)} a commission request. Their reply comes straight to your email.</p>
      <wa-button size="s" variant="brand" id="btn-commission-signin"><wa-icon slot="start" name="right-to-bracket"></wa-icon>Sign in</wa-button>`;
    section.querySelector('#btn-commission-signin').addEventListener('click', promptSignIn);
    return;
  }
  const refId = new URLSearchParams(window.location.search).get('art');
  const selected = works.some(w => w.id === refId) ? refId : 'none';
  section.innerHTML = `${heading}
    <form id="commission-form" class="wa-stack wa-gap-m">
      ${works.length ? `<wa-select id="cm-artwork" label="Reference artwork (optional)" value="${escapeHtml(selected)}">
        <wa-option value="none">No reference</wa-option>
        ${works.map(w => `<wa-option value="${escapeHtml(w.id)}">${escapeHtml(w.title)}</wa-option>`).join('')}
      </wa-select>` : ''}
      <wa-textarea id="cm-message" label="What would you like?" rows="5" maxlength="2000" required
        hint="20 to 2000 characters. ${escapeHtml(artist.name)} replies to your account email; neither address is shown to anyone."></wa-textarea>
      <div id="cm-turnstile"></div>
      <div><wa-button type="submit" variant="brand" id="cm-send"><wa-icon slot="start" name="paper-plane"></wa-icon>Send request</wa-button></div>
    </form>`;

  let token = '';
  let widgetId = null;
  loadTurnstile().then(turnstile => {
    if (!section.isConnected) return;
    widgetId = turnstile.render(section.querySelector('#cm-turnstile'), {
      sitekey: TURNSTILE_SITE_KEY,
      callback: t => { token = t; },
      'expired-callback': () => { token = ''; },
    });
  }).catch(() => showError('The human check could not load. Refresh to try again.'));

  section.querySelector('#commission-form').addEventListener('submit', async e => {
    e.preventDefault();
    const message = fieldValue(section, '#cm-message').trim();
    if (message.length < 20) { showError('Tell the artist a little more (at least 20 characters).'); return; }
    if (!token) { showError('Complete the human check first.'); return; }
    if (usingDemo) {
      showToast('Demo data — deploy the gallery schema to send commissions', 'neutral', 'database');
      return;
    }
    const artwork = fieldValue(section, '#cm-artwork');
    const button = section.querySelector('#cm-send');
    button.setAttribute('loading', '');
    try {
      const { data: { session } = {} } = await getSupabase()?.auth.getSession() || { data: {} };
      const res = await fetch('/api/commission', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${session?.access_token || ''}` },
        body: JSON.stringify({ artistId: artist.id, artworkId: artwork && artwork !== 'none' ? artwork : null, message, turnstileToken: token }),
      });
      if (res.ok) return done('success', 'circle-check', `Request sent. ${escapeHtml(artist.name)} will reply to your email if they take it on.`);
      if (res.status === 429) return done('warning', 'clock', 'You’ve reached today’s commission limit: three requests a day, one per artist. Try again tomorrow.');
      if (res.status === 409) return done('neutral', 'circle-pause', `${escapeHtml(artist.name)} closed commissions while you were writing. Your message wasn’t sent.`);
      const body = await res.json().catch(() => ({}));
      showError(body.error || 'Your request couldn’t be sent. Try again later.');
    } catch {
      showError('Your request couldn’t be sent. Try again later.');
    } finally {
      button.removeAttribute('loading');
    }
    // A Turnstile token is single-use; get a fresh one for the retry.
    token = '';
    if (widgetId !== null) window.turnstile?.reset(widgetId);
  });
}

function isOwnArtist(artist) {
  const user = getCurrentUser();
  return !!(user && artist.userId && artist.userId === user.id);
}

/** "This is me" on an unclaimed profile, or "Claim pending" once filed. */
async function renderClaimSlot(slot, artist) {
  if (!slot) return; // claimed profile: nothing to show
  const user = getCurrentUser();
  const sb = getSupabase();
  let claims = [];
  if (user && sb && !usingDemo) {
    const { data } = await sb.from('gallery_artist_claims')
      .select('status, created_at')
      .eq('artist_id', artist.id)
      .eq('user_id', user.id)
      .order('created_at', { ascending: false });
    claims = data || [];
  }
  if (!slot.isConnected) return; // navigated away while loading

  if (claims.some(c => c.status === 'pending')) {
    slot.innerHTML = `
      <wa-tag variant="warning"><wa-icon slot="start" name="hourglass-half"></wa-icon>Claim pending</wa-tag>
      <span class="wa-caption-s" style="color: var(--wa-color-neutral-text-subtle);">An admin will review it soon.</span>`;
    return;
  }
  const rejected = claims[0]?.status === 'rejected';
  slot.innerHTML = `
    <wa-button size="s" appearance="outlined" id="btn-claim-artist"><wa-icon slot="start" name="user-check"></wa-icon>This is me</wa-button>
    ${rejected ? '<span class="wa-caption-s" style="color: var(--wa-color-neutral-text-subtle);">Your last claim on this profile was rejected. If that was a mistake, contact PRISM.</span>' : ''}`;
  slot.querySelector('#btn-claim-artist').addEventListener('click', async () => {
    const me = getCurrentUser();
    if (!me) {
      showToast('Sign in to claim this profile', 'brand', 'user-check');
      promptSignIn();
      return;
    }
    if (usingDemo) {
      showToast('Demo data — deploy the gallery schema to enable claims', 'neutral', 'database');
      return;
    }
    const claimId = crypto.randomUUID();
    const { error } = await getSupabase().from('gallery_artist_claims')
      .insert({ id: claimId, artist_id: artist.id, user_id: me.id });
    // 23505: a pending claim already exists, which is the outcome wanted anyway
    if (error && error.code !== '23505') {
      showError('Could not send your claim — try again.');
      return;
    }
    // An invited artist's claim is approved on insert (#331): re-read it.
    const { data: approved } = await getSupabase().from('gallery_artist_claims')
      .select('id').eq('artist_id', artist.id).eq('user_id', me.id).eq('status', 'approved').limit(1);
    if (approved?.length) {
      showSuccess('This page is yours — you can edit it and open commissions.');
      await loadPublicData(); // the artist row now carries user_id, so Edit profile appears
      render();
      return;
    }
    if (!error) notifyReviewers('claim', claimId);
    showSuccess('Claim sent — an admin will review it.');
    renderClaimSlot(slot, artist);
  });
}

// Tell the admins a new upload or claim awaits review (/api/gallery-notify).
// Fire-and-forget: it never blocks or fails the UI; the server dedupes.
function notifyReviewers(kind, id) {
  getSupabase()?.auth.getSession()
    .then(({ data: { session } = {} }) => fetch('/api/gallery-notify', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${session?.access_token || ''}` },
      body: JSON.stringify({ kind, id }),
    }))
    .catch(() => {});
}

// ============================================================
// Upload / edit form (shared fields)
// ============================================================

// Last-used public display name, so repeat uploaders don't retype it.
const ARTIST_NAME_KEY = 'prism_gallery_artist_name';
const EMAIL_RE = /\S+@\S+\.\S+/;

// Suggested display name: last used, else the email's local part —
// never the full email, since artist_name renders publicly on the site.
// An Artist gets their page's name instead, which approval links on (#321).
function defaultArtistName(user) {
  try {
    const stored = localStorage.getItem(ARTIST_NAME_KEY);
    if (stored) return stored;
  } catch { /* storage unavailable */ }
  return (user.email || '').split('@')[0];
}

function rememberArtistName(name) {
  try { localStorage.setItem(ARTIST_NAME_KEY, name); } catch { /* storage unavailable */ }
}

/** Metadata fields shared by the upload and edit forms. */
function artworkFieldsHtml(v = {}) {
  const aiValue = v.isAI === true ? 'yes' : v.isAI === false ? 'no' : '';
  return `
      <wa-input id="up-title" label="Title" placeholder="e.g. Sol Ring — Ornate" value="${escapeHtml(v.title || '')}" required></wa-input>
      <wa-radio-group id="up-type" label="Type" value="${escapeHtml(v.type || 'proxy')}" orientation="horizontal">
        <wa-radio value="proxy">Proxy</wa-radio>
        <wa-radio value="token">Token</wa-radio>
        <wa-radio value="showcase">Showcase</wa-radio>
        <wa-radio value="alter">Alter</wa-radio>
        <span slot="hint">Alter: a photo of a real card you painted by hand. It is shown, never offered as a download.</span>
      </wa-radio-group>
      <div class="card-suggest">
        <wa-input id="up-card" label="Original card (optional)" placeholder="Start typing a card name" autocomplete="off" value="${escapeHtml(v.originalCard?.name || '')}">
          <wa-icon slot="start" name="magnifying-glass"></wa-icon>
          <span slot="hint">Leave blank for tokens or original art with no source card.</span>
        </wa-input>
        <div class="card-suggest-list" id="up-card-suggest" hidden></div>
      </div>
      <wa-textarea id="up-desc" label="Description" placeholder="Tell players about this piece (optional)" rows="3" value="${escapeHtml(v.description || '')}"></wa-textarea>
      <div>
        <wa-radio-group id="up-ai" label="AI-generated?" orientation="horizontal"${aiValue ? ` value="${aiValue}"` : ''}>
          <wa-radio value="no">No</wa-radio>
          <wa-radio value="yes">Yes</wa-radio>
        </wa-radio-group>
        <p class="wa-caption-s" style="color: var(--wa-color-neutral-text-subtle); margin: var(--wa-space-2xs) 0 0;"><wa-icon name="robot"></wa-icon> AI art is allowed but must be labeled.</p>
      </div>
      <wa-input id="up-artist" label="Display name" placeholder="e.g. deckbrewer" value="${escapeHtml(v.artistName || '')}">
        <span slot="hint">Shown publicly next to the artwork — use a pseudonym or handle, not your email. Crediting someone else? Only with their permission.</span>
      </wa-input>`;
}

// Outside-click dismissal for the autocomplete list. One document listener at
// a time: re-wiring (each form render replaces the subtree) removes the old
// listener so handlers don't accumulate holding detached nodes.
let acDismissCleanup = null;

/** Scryfall card-name autocomplete for the #up-card input. */
function wireCardAutocomplete(root) {
  acDismissCleanup?.();
  acDismissCleanup = wireCardAutocompleteInput(root.querySelector('#up-card'), root.querySelector('#up-card-suggest'));
}

// WA inputs store values in shadow DOM; fall back to the internal
// input/textarea when the host .value is empty (see CLAUDE.md).
function fieldValue(root, selector) {
  const el = root.querySelector(selector);
  if (!el) return '';
  return el.value || el.shadowRoot?.querySelector('input, textarea')?.value || '';
}

/** Read + validate the shared fields. Returns null (after showError) when invalid. */
function readArtworkFields(root) {
  const title = fieldValue(root, '#up-title').trim();
  const ai = root.querySelector('#up-ai').value;
  const artistName = fieldValue(root, '#up-artist').trim();
  if (!title) { showError('Give it a title.'); return null; }
  if (!ai) { showError('Tell us whether it’s AI-generated — AI art is allowed but must be labeled.'); return null; }
  if (!artistName) { showError('Add a display name — it’s shown publicly next to the artwork.'); return null; }
  if (EMAIL_RE.test(artistName)) { showError('That looks like an email address. Your display name is shown publicly — use a pseudonym or handle instead.'); return null; }
  const cardName = fieldValue(root, '#up-card').trim() || null;
  return {
    title,
    type: root.querySelector('#up-type').value || 'proxy',
    cardName,
    scryfallUrl: cardName ? 'https://scryfall.com/search?q=' + encodeURIComponent('!"' + cardName + '"') : null,
    description: fieldValue(root, '#up-desc').trim(),
    isAI: ai === 'yes',
    artistName,
  };
}

// ============================================================
// Upload view
// ============================================================

// CAMPAIGN WINDOW (#222): the signed-out upload gate copy below. Reverted when
// signups reopen (#206), see docs/runbooks/enforcement-cutover.md. A JS comment, not an
// HTML one inside the template literal: that renders into public page source.
function renderUpload(root) {
  const user = getCurrentUser();
  if (!user) {
    if (hasStoredSession()) { root.innerHTML = loadingHtml(); return; } // auth still restoring
    root.innerHTML = `
      ${breadcrumbHtml([{ label: 'Gallery', href: 'gallery.html' }, { label: 'Upload artwork' }])}
      <div class="gallery-empty" style="max-width: 34rem;">
        <div class="ic"><wa-icon name="lock"></wa-icon></div>
        <h2 class="wa-heading-m">Sign in to upload artwork</h2>
        <p class="wa-caption-m" style="color: var(--wa-color-neutral-text-subtle); max-width: 40ch;">Community uploads need an account, and signup is currently closed. Ask on <a href="https://discord.gg/Jp84QUPSe" target="_blank" rel="noopener">Discord</a> and we will set one up for you. Uploads are reviewed before going public.</p>
        <wa-button variant="brand" id="upload-signin"><wa-icon slot="start" name="right-to-bracket"></wa-icon>Sign in</wa-button>
      </div>`;
    root.querySelector('#upload-signin')?.addEventListener('click', promptSignIn);
    return;
  }

  root.innerHTML = `
    ${breadcrumbHtml([{ label: 'Gallery', href: 'gallery.html' }, { label: 'Upload artwork' }])}
    <h1 class="wa-heading-2xl">Upload artwork</h1>
    <p style="color: var(--wa-color-neutral-text-subtle); margin-top: var(--wa-space-2xs);">Uploads are reviewed before going public. You&rsquo;ll see it under <a href="gallery.html?view=uploads">My uploads</a> while it&rsquo;s pending.</p>
    <form class="gallery-form" id="upload-form" style="margin-top: var(--wa-space-l);">
      <wa-file-input id="upload-file" accept="image/png,image/jpeg,image/webp" hint="PNG, JPG, or WebP &middot; up to 10 MB &middot; high-res recommended for print">
        <span slot="label">Image <span style="color: var(--wa-color-danger-text);">*</span></span>
      </wa-file-input>
      ${artworkFieldsHtml({ artistName: artistsDb.find(a => a.userId === user.id)?.name || defaultArtistName(user) })}
      <div class="gallery-ack">
        <wa-checkbox id="up-ack">I confirm this upload follows the rules:</wa-checkbox>
        <span class="wa-caption-s" style="color: var(--wa-color-neutral-text-subtle);">MTG-related only &middot; your own work or permission held &middot; no NSFW &middot; AI art is labeled</span>
      </div>
      <div class="wa-cluster wa-gap-s">
        <wa-button type="submit" variant="brand" id="upload-submit"><wa-icon slot="start" name="paper-plane"></wa-icon>Submit for review</wa-button>
        <wa-button type="button" appearance="plain" href="gallery.html">Cancel</wa-button>
      </div>
    </form>`;

  // Image picker — wa-file-input handles dropzone, browse, and thumbnail.
  // Its .files is a plain array; enforce the 10 MB cap here and clear on reject.
  const fileInput = root.querySelector('#upload-file');
  let selectedFile = null;
  fileInput.addEventListener('change', () => {
    const file = fileInput.files[0] || null;
    if (file && file.size > 10 * 1024 * 1024) {
      showError('Image too large — keep it under 10 MB.');
      selectedFile = null;
      try { fileInput.files = []; } catch { /* best-effort UI clear; state is already reset */ }
      return;
    }
    selectedFile = file;
  });

  wireCardAutocomplete(root);

  root.querySelector('#upload-form').addEventListener('submit', async e => {
    e.preventDefault();
    if (!selectedFile) { showError('Add an image — it’s what the gallery is for.'); return; }
    const fields = readArtworkFields(root);
    if (!fields) return;
    if (!root.querySelector('#up-ack').checked) { showError('Please confirm the upload rules.'); return; }

    const sb = getSupabase();
    if (!sb) { showError('Not connected — try reloading the page.'); return; }

    const submitBtn = root.querySelector('#upload-submit');
    submitBtn.setAttribute('loading', '');
    submitBtn.setAttribute('disabled', '');

    try {
      const ext = { 'image/png': 'png', 'image/jpeg': 'jpg', 'image/webp': 'webp' }[selectedFile.type] || 'png';
      const path = `${user.id}/${crypto.randomUUID()}.${ext}`;
      const { error: uploadErr } = await sb.storage.from('gallery-art').upload(path, selectedFile, { contentType: selectedFile.type });
      if (uploadErr) throw uploadErr;

      const artworkId = crypto.randomUUID();
      const { error: insertErr } = await sb.from('gallery_artworks').insert({
        id: artworkId,
        title: fields.title,
        type: fields.type,
        original_card_name: fields.cardName,
        scryfall_url: fields.scryfallUrl,
        description: fields.description,
        is_ai: fields.isAI,
        artist_name: fields.artistName,
        uploader_id: user.id,
        image_path: path,
        status: 'pending',
      });
      if (insertErr) {
        sb.storage.from('gallery-art').remove([path]); // best-effort cleanup
        throw insertErr;
      }
      notifyReviewers('upload', artworkId);
      rememberArtistName(fields.artistName);
      renderPending(root);
    } catch (err) {
      console.error('Gallery upload failed:', err);
      showError('Upload failed — try again.');
      submitBtn.removeAttribute('loading');
      submitBtn.removeAttribute('disabled');
    }
  });
}

function renderPending(root) {
  root.innerHTML = `
    <div class="wa-stack wa-gap-m wa-align-items-center" style="text-align: center; padding-block: var(--wa-space-3xl); max-width: 30rem; margin: 0 auto;">
      <div class="gallery-avatar" style="width: 3.5rem; height: 3.5rem; background: var(--wa-color-warning-fill-quiet); color: var(--wa-color-warning-text); font-size: var(--wa-font-size-l);"><wa-icon name="clock"></wa-icon></div>
      <h2 class="wa-heading-l">Submitted — pending review</h2>
      <p style="color: var(--wa-color-neutral-text-subtle);">Thanks. An admin will review it before it goes public. You&rsquo;ll find its status under My uploads.</p>
      <wa-callout size="s" style="text-align: left;">
        <wa-icon slot="icon" name="list-check"></wa-icon>
        We check: MTG-related, your own work or permission, no NSFW, AI labeled.
      </wa-callout>
      <div class="wa-cluster wa-gap-xs">
        <wa-button size="s" variant="brand" href="gallery.html?view=uploads">View My uploads</wa-button>
        <wa-button size="s" appearance="outlined" href="gallery.html?view=upload">Upload another</wa-button>
      </div>
    </div>`;
}

// ============================================================
// Edit view (owner metadata edits; admins edit everything)
// ============================================================

async function renderEditArtwork(root, id) {
  const user = getCurrentUser();
  if (!user) {
    if (hasStoredSession()) { root.innerHTML = loadingHtml(); return; } // auth still restoring
    root.innerHTML = `
      ${breadcrumbHtml([{ label: 'Gallery', href: 'gallery.html' }, { label: 'Edit artwork' }])}
      <div class="gallery-empty" style="max-width: 34rem;">
        <div class="ic"><wa-icon name="lock"></wa-icon></div>
        <h2 class="wa-heading-m">Sign in to edit artwork</h2>
        <wa-button variant="brand" id="edit-signin"><wa-icon slot="start" name="right-to-bracket"></wa-icon>Sign in</wa-button>
      </div>`;
    root.querySelector('#edit-signin')?.addEventListener('click', promptSignIn);
    return;
  }
  if (usingDemo) {
    renderNotFound(root, 'Editing unavailable', 'Demo data — deploy the gallery schema to enable editing.');
    return;
  }
  const sb = getSupabase();
  if (!sb) {
    renderNotFound(root, 'Not connected', 'Try reloading the page.');
    return;
  }
  root.innerHTML = loadingHtml();

  // RLS: owners and admins can read any-status rows; others only see approved.
  const { data: row, error } = await sb.from('gallery_artworks').select('*').eq('id', id).maybeSingle();
  if (error || !row) {
    renderNotFound(root, 'Artwork not found', 'It may have been removed, or the link is wrong.');
    return;
  }
  const artwork = mapArtwork(row);
  const isOwner = artwork.uploaderId === user.id;
  if (!isOwner && !isAdmin) {
    renderNotFound(root, 'Not authorized', 'Only the uploader or a gallery admin can edit this artwork.');
    return;
  }

  const backHref = isOwner ? 'gallery.html?view=uploads'
    : artwork.status === 'pending' ? 'gallery.html?view=admin'
    : `gallery.html?art=${encodeURIComponent(artwork.id)}`;

  root.innerHTML = `
    ${breadcrumbHtml([{ label: 'Gallery', href: 'gallery.html' }, { label: 'Edit artwork' }])}
    <h1 class="wa-heading-2xl">Edit artwork</h1>
    <p style="color: var(--wa-color-neutral-text-subtle); margin-top: var(--wa-space-2xs);">${isOwner
      ? 'Changes apply right away — approved artwork stays live.'
      : `Editing as gallery admin${artwork.artistName ? ` &middot; uploaded by ${escapeHtml(artwork.artistName)}` : ''}.`}</p>
    <form class="gallery-form" id="edit-form" style="margin-top: var(--wa-space-l);">
      <div class="gallery-row">
        <div class="gallery-thumb">${artwork.imageUrl ? `<img src="${escapeHtml(artwork.imageUrl)}" alt="" loading="lazy" />` : '<wa-icon name="image"></wa-icon>'}</div>
        <div class="gallery-rowmeta">
          ${STATUS_TAGS[artwork.status] || ''}
          <span class="wa-caption-s" style="color: var(--wa-color-neutral-text-subtle);">The image can&rsquo;t be changed — withdraw this upload and submit a new one to replace it.</span>
        </div>
      </div>
      ${artworkFieldsHtml(artwork)}
      ${isAdmin ? `
      <wa-divider></wa-divider>
      <wa-radio-group id="edit-status" label="Status" value="${escapeHtml(artwork.status)}" orientation="horizontal">
        <wa-radio value="pending">Pending</wa-radio>
        <wa-radio value="approved">Approved</wa-radio>
        <wa-radio value="rejected">Rejected</wa-radio>
      </wa-radio-group>
      <wa-input id="edit-reject-reason" label="Rejection reason" placeholder="Shown to the uploader" value="${escapeHtml(artwork.reason || '')}">
        <span slot="hint">Only used when status is Rejected.</span>
      </wa-input>
      <wa-switch id="edit-highlight"${artwork.highlighted ? ' checked' : ''}>Highlight (Featured + sleeves link)</wa-switch>
      <wa-input id="edit-store" label="Store URL" placeholder="https://&hellip; (highlighted only)" value="${escapeHtml(artwork.storeUrl || '')}"></wa-input>` : ''}
      <div class="wa-cluster wa-gap-s">
        <wa-button type="submit" variant="brand" id="edit-submit"><wa-icon slot="start" name="floppy-disk"></wa-icon>Save changes</wa-button>
        <wa-button type="button" appearance="plain" href="${backHref}">Cancel</wa-button>
      </div>
    </form>`;

  wireCardAutocomplete(root);

  root.querySelector('#edit-form').addEventListener('submit', async e => {
    e.preventDefault();
    const fields = readArtworkFields(root);
    if (!fields) return;

    const submitBtn = root.querySelector('#edit-submit');
    const unlock = () => { submitBtn.removeAttribute('loading'); submitBtn.removeAttribute('disabled'); };

    let status = artwork.status;
    let rejectReason = null;
    if (isAdmin) {
      status = root.querySelector('#edit-status').value || artwork.status;
      rejectReason = fieldValue(root, '#edit-reject-reason').trim() || null;
      if (status === 'rejected' && !rejectReason) { showError('Give the uploader a reason.'); return; }
    }

    submitBtn.setAttribute('loading', '');
    submitBtn.setAttribute('disabled', '');

    try {
      if (isAdmin) {
        const update = {
          title: fields.title,
          type: fields.type,
          original_card_name: fields.cardName,
          scryfall_url: fields.scryfallUrl,
          description: fields.description,
          is_ai: fields.isAI,
          artist_name: fields.artistName,
          status,
          reject_reason: status === 'rejected' ? rejectReason : null,
          highlighted: !!root.querySelector('#edit-highlight')?.checked,
          store_url: fieldValue(root, '#edit-store').trim() || null,
        };
        if (status !== artwork.status) {
          update.reviewed_at = new Date().toISOString();
          update.reviewed_by = user.id;
        }
        const { error: err } = await sb.from('gallery_artworks').update(update).eq('id', artwork.id);
        if (err) throw err;
      } else {
        const { data, error: err } = await sb.rpc('update_own_gallery_artwork', {
          p_id: artwork.id,
          p_title: fields.title,
          p_type: fields.type,
          p_original_card_name: fields.cardName,
          p_scryfall_url: fields.scryfallUrl,
          p_description: fields.description,
          p_is_ai: fields.isAI,
          p_artist_name: fields.artistName,
        });
        if (err) throw err;
        if (!data) throw new Error('No row updated — not the uploader?');
      }
      if (isOwner) rememberArtistName(fields.artistName);
      showSuccess('Changes saved');
      await loadPublicData(); // approved metadata may have changed
      history.pushState({}, '', backHref);
      render();
    } catch (err) {
      console.error('Gallery edit failed:', err);
      showError('Could not save changes — try again.');
      unlock();
    }
  });
}

// ============================================================
// Artist profile edit view (#324)
// ============================================================

/** One link per line. A line whose URL is unchanged keeps its stored label and icon. */
function linksToText(links) {
  return links.map(l => l.href).join('\n');
}

function textToLinks(text, oldLinks) {
  const links = [];
  for (const line of text.split('\n').map(l => l.trim()).filter(Boolean)) {
    let url;
    try { url = new URL(line); } catch { return null; }
    if (url.protocol !== 'https:') return null; // the RPC refuses anything else
    links.push(oldLinks.find(l => l.href === line) || { label: url.hostname.replace(/^www\./, ''), ...linkIcon(line), href: line });
  }
  return links;
}

async function renderEditArtist(root) {
  const user = getCurrentUser();
  if (!user) {
    if (hasStoredSession()) { root.innerHTML = loadingHtml(); return; } // auth still restoring
    renderNotFound(root, 'Sign in to edit your profile', 'Your artist profile is linked to your account.');
    return;
  }
  if (usingDemo) {
    renderNotFound(root, 'Editing unavailable', 'Demo data — deploy the gallery schema to enable editing.');
    return;
  }
  const artist = artistsDb.find(a => a.userId === user.id);
  const sb = getSupabase();
  if (!artist || !sb) {
    renderNotFound(root, 'No artist profile', 'Claim your profile with “This is me” on your artist page first.');
    return;
  }
  root.innerHTML = loadingHtml();
  // RLS: only the owning Artist (and admins) can read this row.
  const { data: contact } = await sb.from('gallery_artist_contacts')
    .select('commission_email').eq('artist_id', artist.id).maybeSingle();
  if (!root.isConnected) return;
  const backHref = `gallery.html?artist=${encodeURIComponent(artist.id)}`;

  root.innerHTML = `
    ${breadcrumbHtml([{ label: 'Gallery', href: 'gallery.html' }, { label: artist.name, href: backHref }, { label: 'Edit profile' }])}
    <h1 class="wa-heading-2xl">Edit profile</h1>
    <p style="color: var(--wa-color-neutral-text-subtle); margin-top: var(--wa-space-2xs);">Changes apply right away.</p>
    <form class="gallery-form" id="artist-form" style="margin-top: var(--wa-space-l);">
      <wa-textarea id="ar-bio" label="Bio" rows="4" value="${escapeHtml(artist.bio)}"></wa-textarea>
      <wa-textarea id="ar-links" label="Links" rows="3" placeholder="https://your-site.example" value="${escapeHtml(linksToText(artist.links))}">
        <span slot="hint">One web address per line: your site, shop or socials.</span>
      </wa-textarea>
      <wa-input id="ar-avatar" label="Avatar image URL" placeholder="https://&hellip;/me.png" value="${escapeHtml(artist.avatarUrl || '')}"></wa-input>
      <wa-divider></wa-divider>
      <wa-switch id="ar-open"${artist.commissionsOpen ? ' checked' : ''}>Open for commissions</wa-switch>
      <wa-textarea id="ar-note" label="Commissions note" rows="2" placeholder="e.g. Sleeve art, ~2 weeks, DM for rates" value="${escapeHtml(artist.commissionNote)}">
        <span slot="hint">Shown publicly on your artist page.</span>
      </wa-textarea>
      <wa-input id="ar-email" type="email" label="Commission email" value="${escapeHtml(contact?.commission_email || '')}">
        <span slot="hint">Private. Requests are relayed here and it never appears on any page.</span>
      </wa-input>
      <div class="wa-cluster wa-gap-s">
        <wa-button type="submit" variant="brand" id="ar-submit"><wa-icon slot="start" name="floppy-disk"></wa-icon>Save changes</wa-button>
        <wa-button type="button" appearance="plain" href="${backHref}">Cancel</wa-button>
      </div>
    </form>`;

  root.querySelector('#artist-form').addEventListener('submit', async e => {
    e.preventDefault();
    const links = textToLinks(fieldValue(root, '#ar-links'), artist.links);
    const avatar = fieldValue(root, '#ar-avatar').trim();
    const email = fieldValue(root, '#ar-email').trim();
    const open = !!root.querySelector('#ar-open').checked;
    if (!links) { showError('Each link must be a full web address starting with https://'); return; }
    if (avatar && !/^https:\/\//i.test(avatar)) { showError('The avatar must be a web address starting with https://'); return; }
    if (email && !EMAIL_RE.test(email)) { showError('That commission email doesn’t look right.'); return; }
    if (open && !email) { showError('Add a commission email to open commissions.'); return; }

    const submitBtn = root.querySelector('#ar-submit');
    submitBtn.setAttribute('loading', '');
    submitBtn.setAttribute('disabled', '');
    const { error } = await sb.rpc('update_own_gallery_artist', {
      p_bio: fieldValue(root, '#ar-bio').trim(),
      p_links: links,
      p_avatar_url: avatar,
      p_commissions_open: open,
      p_commission_note: fieldValue(root, '#ar-note').trim(),
      p_commission_email: email,
    });
    if (error) {
      console.error('Artist profile save failed:', error);
      showError('Could not save your profile — try again.');
      submitBtn.removeAttribute('loading');
      submitBtn.removeAttribute('disabled');
      return;
    }
    showSuccess('Profile saved');
    await loadPublicData();
    history.pushState({}, '', backHref);
    render();
  });
}

// ============================================================
// Admin artist form (#330): Add artist via /api/gallery-artist; Edit by
// direct UPDATE under the "Admins manage gallery artists" policy.
// ============================================================

const INVITE_OUTCOME = {
  sent: 'Invite sent',
  existing_account: 'They already have an account — they can sign in and claim',
  failed: 'Invite failed — try Resend',
  email_not_saved: 'The email couldn’t be saved, so no invite went out. Send them the link below; they can sign up and claim the page.',
};

async function postGalleryArtist(body) {
  const { data: { session } = {} } = await getSupabase().auth.getSession();
  return fetch('/api/gallery-artist', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${session?.access_token || ''}` },
    body: JSON.stringify(body),
  });
}

async function renderAdminArtist(root, id) {
  const user = getCurrentUser();
  if (!user) {
    if (hasStoredSession()) { root.innerHTML = loadingHtml(); return; } // auth still restoring
    renderNotFound(root, 'Not authorized', 'Artist pages are managed by gallery admins. Sign in first.');
    return;
  }
  if (!isAdmin || usingDemo) {
    renderNotFound(root, 'Not authorized', 'Artist pages are managed by gallery admins.');
    return;
  }
  const artist = id ? artistsDb.find(a => a.id === id) : null;
  if (id && !artist) { renderNotFound(root, 'Artist not found', 'It may have been removed.'); return; }
  const v = artist || { name: '', bio: '', links: [], avatarUrl: '', isPartner: false };
  const title = artist ? `Edit ${artist.name}` : 'Add artist';

  root.innerHTML = `
    ${breadcrumbHtml([{ label: 'Gallery', href: 'gallery.html' }, { label: 'Moderation queue', href: 'gallery.html?view=admin' }, { label: title }])}
    <h1 class="wa-heading-2xl">${escapeHtml(title)}</h1>
    <p style="color: var(--wa-color-neutral-text-subtle); margin-top: var(--wa-space-2xs);">${artist ? 'Changes go live right away.' : 'Creates a public artist page. The page link is shown after saving.'}</p>
    <form class="gallery-form" id="admin-artist-form" style="margin-top: var(--wa-space-l);">
      <wa-input id="aa-name" label="Display name" required maxlength="80" value="${escapeHtml(v.name)}"></wa-input>
      <wa-textarea id="aa-bio" label="Bio" rows="4" value="${escapeHtml(v.bio)}"></wa-textarea>
      <wa-textarea id="aa-links" label="Links" rows="3" placeholder="https://their-site.example" value="${escapeHtml(linksToText(v.links))}">
        <span slot="hint">One web address per line: site, shop or socials.</span>
      </wa-textarea>
      <wa-input id="aa-avatar" label="Avatar image URL" placeholder="https://&hellip;/avatar.png" value="${escapeHtml(v.avatarUrl || '')}"></wa-input>
      <wa-switch id="aa-partner"${v.isPartner ? ' checked' : ''}>Partner artist</wa-switch>
      ${artist ? '' : `<wa-input id="aa-email" type="email" label="Artist’s email (optional)">
        <span slot="hint">Sends them an account invite that lands on their page. Private: never shown on any page.</span>
      </wa-input>`}
      <div class="wa-cluster wa-gap-s">
        <wa-button type="submit" variant="brand" id="aa-submit"><wa-icon slot="start" name="floppy-disk"></wa-icon>${artist ? 'Save changes' : 'Add artist'}</wa-button>
        <wa-button type="button" appearance="plain" href="gallery.html?view=admin">Cancel</wa-button>
      </div>
    </form>`;

  root.querySelector('#admin-artist-form').addEventListener('submit', async e => {
    e.preventDefault();
    const name = fieldValue(root, '#aa-name').trim();
    const links = textToLinks(fieldValue(root, '#aa-links'), v.links);
    const avatar = fieldValue(root, '#aa-avatar').trim();
    if (!name || name.length > 80) { showError('The name must be 1 to 80 characters.'); return; }
    if (!links) { showError('Each link must be a full web address starting with https://'); return; }
    if (avatar && !/^https:\/\//i.test(avatar)) { showError('The avatar must be a web address starting with https://'); return; }
    const email = artist ? '' : fieldValue(root, '#aa-email').trim();
    if (email && !EMAIL_RE.test(email)) { showError('That email doesn’t look right.'); return; }
    const fields = { email: email || undefined, name, bio: fieldValue(root, '#aa-bio').trim(), links, avatarUrl: avatar, isPartner: !!root.querySelector('#aa-partner').checked };

    const submitBtn = root.querySelector('#aa-submit');
    submitBtn.setAttribute('loading', '');
    submitBtn.setAttribute('disabled', '');
    const sb = getSupabase();
    let created = null;
    let errorText = null;
    try {
      if (artist) {
        const { error } = await sb.from('gallery_artists').update({
          name: fields.name, bio: fields.bio, links: fields.links, avatar_url: fields.avatarUrl || null, is_partner: fields.isPartner,
        }).eq('id', artist.id);
        if (error) { console.error('Artist edit failed:', error); errorText = 'Could not save the artist — try again.'; }
      } else {
        const res = await postGalleryArtist(fields);
        const body = await res.json().catch(() => ({}));
        if (res.ok) created = body;
        else errorText = body.error || 'Could not add the artist — try again.';
      }
    } catch {
      errorText = 'Could not save the artist — try again.';
    }
    if (errorText) {
      showError(errorText);
      submitBtn.removeAttribute('loading');
      submitBtn.removeAttribute('disabled');
      return;
    }
    await loadPublicData();
    if (!created) {
      showSuccess('Artist saved');
      adminTab = 'artists';
      history.pushState({}, '', 'gallery.html?view=admin');
      render();
      return;
    }
    root.innerHTML = `
      ${breadcrumbHtml([{ label: 'Gallery', href: 'gallery.html' }, { label: 'Moderation queue', href: 'gallery.html?view=admin' }, { label: 'Artist added' }])}
      <h1 class="wa-heading-2xl">${escapeHtml(name)} is live</h1>
      ${INVITE_OUTCOME[created.invite] ? `<p style="margin-top: var(--wa-space-2xs);">${INVITE_OUTCOME[created.invite]}</p>` : ''}
      <p style="color: var(--wa-color-neutral-text-subtle); margin-top: var(--wa-space-2xs);">Send them this link to their page:</p>
      <div class="wa-cluster wa-gap-xs wa-align-items-center" style="margin-top: var(--wa-space-s);">
        <wa-input readonly value="${escapeHtml(created.url)}" style="flex: 1; min-width: 16rem;" aria-label="Artist page link"></wa-input>
        <wa-copy-button value="${escapeHtml(created.url)}"></wa-copy-button>
      </div>
      <div class="wa-cluster wa-gap-s" style="margin-top: var(--wa-space-l);">
        <wa-button variant="brand" href="gallery.html?artist=${encodeURIComponent(created.artistId)}">View page</wa-button>
        <wa-button appearance="outlined" href="gallery.html?view=admin-artist">Add another</wa-button>
      </div>`;
  });
}

// ============================================================
// My uploads view
// ============================================================

const STATUS_TAGS = {
  pending: '<wa-tag variant="warning"><wa-icon slot="start" name="clock"></wa-icon>Pending</wa-tag>',
  approved: '<wa-tag variant="success"><wa-icon slot="start" name="circle-check"></wa-icon>Approved</wa-tag>',
  rejected: '<wa-tag variant="danger"><wa-icon slot="start" name="circle-xmark"></wa-icon>Rejected</wa-tag>',
};

function uploadRowHtml(u) {
  return `
    <div class="gallery-row${u.status === 'rejected' ? ' gallery-row--rejected' : ''}">
      <div class="gallery-thumb">${u.imageUrl ? `<img src="${escapeHtml(u.imageUrl)}" alt="" loading="lazy" />` : '<wa-icon name="image"></wa-icon>'}</div>
      <div class="gallery-rowmeta">
        <strong>${escapeHtml(u.title)}</strong>
        <div class="gallery-rowsub">
          <span><wa-icon name="tag"></wa-icon> ${TYPE_LABELS[u.type] || u.type}</span>
          ${u.isAI ? '<span><wa-icon name="robot"></wa-icon> AI</span>' : ''}
          ${u.status === 'approved' ? `<span><wa-icon name="heart"></wa-icon> ${likeCount(u)}</span>` : ''}
          <span>Submitted <wa-relative-time date="${escapeHtml(u.createdAt)}"></wa-relative-time></span>
          ${u.status === 'rejected' && u.reason ? `<span style="color: var(--wa-color-danger-text);"><wa-icon name="circle-exclamation"></wa-icon> Reason: ${escapeHtml(u.reason)}</span>` : ''}
        </div>
      </div>
      ${STATUS_TAGS[u.status] || ''}
      <wa-button size="s" appearance="outlined" href="gallery.html?view=edit&art=${encodeURIComponent(u.id)}"><wa-icon slot="start" name="pen"></wa-icon>Edit</wa-button>
      ${u.status === 'approved' ? `<wa-button size="s" appearance="outlined" href="gallery.html?art=${encodeURIComponent(u.id)}">View</wa-button>` : ''}
      ${u.status === 'rejected' ? `<wa-button size="s" appearance="outlined" data-resubmit="${u.id}">Resubmit</wa-button>` : ''}
      ${u.status === 'pending' ? `<wa-button size="s" appearance="plain" data-withdraw="${u.id}" aria-label="Withdraw upload"><wa-icon name="trash"></wa-icon></wa-button>` : ''}
    </div>`;
}

async function renderMyUploads(root) {
  const user = getCurrentUser();
  if (!user) {
    if (hasStoredSession()) { root.innerHTML = loadingHtml(); return; } // auth still restoring
    root.innerHTML = `
      ${breadcrumbHtml([{ label: 'Gallery', href: 'gallery.html' }, { label: 'My uploads' }])}
      <div class="gallery-empty" style="max-width: 34rem;">
        <div class="ic"><wa-icon name="lock"></wa-icon></div>
        <h2 class="wa-heading-m">Sign in to see your uploads</h2>
        <wa-button variant="brand" id="uploads-signin"><wa-icon slot="start" name="right-to-bracket"></wa-icon>Sign in</wa-button>
      </div>`;
    root.querySelector('#uploads-signin')?.addEventListener('click', promptSignIn);
    return;
  }

  const sb = getSupabase();
  root.innerHTML = loadingHtml();
  const { data, error } = await sb.from('gallery_artworks')
    .select('*')
    .eq('uploader_id', user.id)
    .order('created_at', { ascending: false });
  if (error) {
    renderNotFound(root, 'Could not load your uploads', 'Check your connection and reload.');
    return;
  }
  const uploads = (data || []).map(mapArtwork);
  const by = status => uploads.filter(u => u.status === status);
  const listHtml = list => (list.length
    ? `<div class="wa-stack wa-gap-s">${list.map(uploadRowHtml).join('')}</div>`
    : '<p style="color: var(--wa-color-neutral-text-subtle);">Nothing here yet.</p>');

  root.innerHTML = `
    ${breadcrumbHtml([{ label: 'Gallery', href: 'gallery.html' }, { label: 'My uploads' }])}
    <div class="wa-split" style="align-items: flex-start;">
      <div>
        <h1 class="wa-heading-2xl">My uploads</h1>
        <p style="color: var(--wa-color-neutral-text-subtle); margin-top: var(--wa-space-2xs);">Track your submissions through review.</p>
      </div>
      <wa-button variant="brand" href="gallery.html?view=upload"><wa-icon slot="start" name="plus"></wa-icon>Upload artwork</wa-button>
    </div>
    <wa-tab-group style="margin-top: var(--wa-space-m);">
      <wa-tab panel="all">All &middot; ${uploads.length}</wa-tab>
      <wa-tab panel="pending">Pending &middot; ${by('pending').length}</wa-tab>
      <wa-tab panel="approved">Approved &middot; ${by('approved').length}</wa-tab>
      <wa-tab panel="rejected">Rejected &middot; ${by('rejected').length}</wa-tab>
      <wa-tab-panel name="all">${listHtml(uploads)}</wa-tab-panel>
      <wa-tab-panel name="pending">${listHtml(by('pending'))}</wa-tab-panel>
      <wa-tab-panel name="approved">${listHtml(by('approved'))}</wa-tab-panel>
      <wa-tab-panel name="rejected">${listHtml(by('rejected'))}</wa-tab-panel>
    </wa-tab-group>`;

  root.querySelectorAll('[data-resubmit]').forEach(btn => btn.addEventListener('click', async () => {
    const { error: err } = await sb.from('gallery_artworks')
      .update({ status: 'pending', reject_reason: null, reviewed_at: null, reviewed_by: null })
      .eq('id', btn.dataset.resubmit);
    if (err) { showError('Could not resubmit — try again.'); return; }
    showSuccess('Resubmitted for review');
    render();
  }));
  root.querySelectorAll('[data-withdraw]').forEach(btn => btn.addEventListener('click', async () => {
    const u = uploads.find(x => x.id === btn.dataset.withdraw);
    const { error: err } = await sb.from('gallery_artworks').delete().eq('id', btn.dataset.withdraw);
    if (err) { showError('Could not withdraw — try again.'); return; }
    if (u?.imagePath) sb.storage.from('gallery-art').remove([u.imagePath]); // best-effort
    showSuccess('Upload withdrawn');
    render();
  }));
}

// ============================================================
// Admin moderation queue (gallery admins only)
// ============================================================

let adminTab = 'uploads'; // kept across re-renders so approving a claim stays on Claims

async function renderAdmin(root) {
  const user = getCurrentUser();
  if (!user) {
    if (hasStoredSession()) { root.innerHTML = loadingHtml(); return; } // auth still restoring
    renderNotFound(root, 'Not authorized', 'The moderation queue is for gallery admins. Sign in first.');
    return;
  }
  const sb = getSupabase();
  root.innerHTML = loadingHtml();

  if (!isAdmin) {
    renderNotFound(root, 'Not authorized', 'The moderation queue is for gallery admins.');
    return;
  }

  const [{ data, error }, claimsRes, invitedRes] = await Promise.all([
    sb.from('gallery_artworks')
      .select('*')
      .eq('status', 'pending')
      .order('created_at', { ascending: true }),
    sb.rpc('list_gallery_artist_claims'),
    // Admin-readable under the contacts RLS; only which artists were invited is used.
    sb.from('gallery_artist_contacts').select('artist_id').not('invited_email', 'is', null),
  ]);
  const invitedIds = new Set((invitedRes.data || []).map(r => r.artist_id));
  if (error) {
    renderNotFound(root, 'Could not load the queue', 'Check your connection and reload.');
    return;
  }
  const pending = (data || []).map(mapArtwork);
  const claims = claimsRes.data || [];

  root.innerHTML = `
    ${breadcrumbHtml([{ label: 'Gallery', href: 'gallery.html' }, { label: 'Moderation queue' }])}
    <div class="wa-split" style="align-items: flex-start;">
      <div>
        <h1 class="wa-heading-2xl">Moderation queue</h1>
        <p style="color: var(--wa-color-neutral-text-subtle); margin-top: var(--wa-space-2xs);">Review pending uploads and artist claims.</p>
      </div>
      <wa-tag variant="warning" size="l"><wa-icon slot="start" name="inbox"></wa-icon>${pending.length + claims.length} pending</wa-tag>
    </div>
    <wa-tab-group id="admin-tabs" active="${adminTab}" style="margin-top: var(--wa-space-m);">
      <wa-tab panel="uploads">Uploads &middot; ${pending.length}</wa-tab>
      <wa-tab panel="claims">Claims &middot; ${claims.length}</wa-tab>
      <wa-tab panel="artists">Artists &middot; ${artistsDb.length}</wa-tab>
      <wa-tab-panel name="artists">
        <div class="wa-split" style="margin-bottom: var(--wa-space-m);">
          <span class="wa-caption-m" style="color: var(--wa-color-neutral-text-subtle);">Every artist page, claimed or not.</span>
          <wa-button size="s" variant="brand" href="gallery.html?view=admin-artist"><wa-icon slot="start" name="plus"></wa-icon>Add artist</wa-button>
        </div>
        <div class="wa-stack wa-gap-s">
          ${[...artistsDb].sort((a, b) => a.name.localeCompare(b.name)).map(a => `
          <div class="gallery-row">
            <div class="gallery-rowmeta">
              <strong><a href="gallery.html?artist=${encodeURIComponent(a.id)}">${escapeHtml(a.name)}</a></strong>
              <div class="gallery-rowsub">
                <span><wa-icon name="${a.userId ? 'user-check' : 'user'}"></wa-icon> ${a.userId ? 'Claimed' : 'Unclaimed'}</span>
                ${a.isPartner ? '<span><wa-icon name="circle-check"></wa-icon> Partner</span>' : ''}
              </div>
            </div>
            <div class="wa-cluster wa-gap-xs">
              ${!a.userId && invitedIds.has(a.id) ? `<wa-button size="s" appearance="outlined" data-resend-invite="${escapeHtml(a.id)}"><wa-icon slot="start" name="paper-plane"></wa-icon>Resend invite</wa-button>` : ''}
              <wa-button size="s" appearance="outlined" href="gallery.html?view=admin-artist&id=${encodeURIComponent(a.id)}"><wa-icon slot="start" name="pen"></wa-icon>Edit</wa-button>
            </div>
          </div>`).join('')}
        </div>
      </wa-tab-panel>
      <wa-tab-panel name="claims">${claimsRes.error
        ? '<p style="color: var(--wa-color-neutral-text-subtle);">Could not load claims. Check that the schema is deployed, then reload.</p>'
        : claims.length === 0 ? `
        <div class="gallery-empty">
          <div class="ic"><wa-icon name="user-check"></wa-icon></div>
          <h3 class="wa-heading-s">No pending claims</h3>
          <p class="wa-caption-m" style="color: var(--wa-color-neutral-text-subtle);">When a maker clicks &ldquo;This is me&rdquo; on their profile, the claim lands here.</p>
        </div>` : `
        <div class="wa-stack wa-gap-m">
          ${claims.map(c => `
          <div class="gallery-queue-card">
            <div class="wa-split" style="align-items: flex-start; gap: var(--wa-space-m);">
              <div class="gallery-rowmeta">
                <strong><a href="gallery.html?artist=${encodeURIComponent(c.artist_id)}">${escapeHtml(c.artist_name)}</a></strong>
                <div class="gallery-rowsub">
                  <span><wa-icon name="envelope"></wa-icon> ${escapeHtml(c.claimant_email || 'No email on account')}</span>
                  <span>Claimed <wa-relative-time date="${escapeHtml(c.created_at)}"></wa-relative-time></span>
                </div>
              </div>
              <div class="wa-cluster wa-gap-xs">
                <wa-button size="s" variant="success" data-claim-approve="${escapeHtml(c.claim_id)}"><wa-icon slot="start" name="check"></wa-icon>Approve</wa-button>
                <wa-button size="s" variant="danger" appearance="outlined" data-claim-reject="${escapeHtml(c.claim_id)}"><wa-icon slot="start" name="xmark"></wa-icon>Reject</wa-button>
              </div>
            </div>
          </div>`).join('')}
        </div>`}
        <p class="wa-caption-s" style="color: var(--wa-color-neutral-text-subtle); margin-top: var(--wa-space-m);"><wa-icon name="circle-info"></wa-icon> Approving links the account to the existing profile and rejects any other pending claims on it. Check the email before approving.</p>
      </wa-tab-panel>
      <wa-tab-panel name="uploads">
    ${pending.length === 0 ? `
      <div class="gallery-empty">
        <div class="ic"><wa-icon name="inbox"></wa-icon></div>
        <h3 class="wa-heading-s">Queue is clear</h3>
        <p class="wa-caption-m" style="color: var(--wa-color-neutral-text-subtle);">New community uploads land here for review.</p>
      </div>` : `
      <div class="wa-stack wa-gap-m" style="margin-top: var(--wa-space-m);">
        ${pending.map(u => `
        <div class="gallery-queue-card" data-queue="${u.id}">
          <div class="wa-split" style="align-items: flex-start; gap: var(--wa-space-m);">
            <div class="wa-cluster wa-gap-m" style="align-items: flex-start; flex: 1;">
              <div class="gallery-thumb" style="width: 6rem; height: 4.5rem;">${u.imageUrl ? `<img src="${escapeHtml(u.imageUrl)}" alt="" loading="lazy" />` : '<wa-icon name="image"></wa-icon>'}</div>
              <div class="gallery-rowmeta">
                <div class="wa-cluster wa-gap-xs wa-align-items-center">
                  <strong>${escapeHtml(u.title)}</strong>
                  ${typeTagHtml(u.type)}
                  ${u.isAI ? '<wa-tag size="s" variant="neutral" appearance="filled"><wa-icon slot="start" name="robot"></wa-icon>AI</wa-tag>' : ''}
                </div>
                <div class="gallery-rowsub">
                  <span><wa-icon name="user"></wa-icon> ${escapeHtml(u.artistName || 'Unknown')}</span>
                  ${u.originalCard ? `<span><wa-icon name="link"></wa-icon> ${escapeHtml(u.originalCard.name)}</span>` : '<span><wa-icon name="circle-minus"></wa-icon> No source card</span>'}
                  <span>Submitted <wa-relative-time date="${escapeHtml(u.createdAt)}"></wa-relative-time></span>
                </div>
                ${u.description ? `<p class="wa-caption-m" style="color: var(--wa-color-neutral-text-subtle); margin: var(--wa-space-3xs) 0 0; max-width: 60ch;">${escapeHtml(u.description)}</p>` : ''}
              </div>
            </div>
            <div class="wa-cluster wa-gap-xs">
              <wa-button size="s" appearance="outlined" href="gallery.html?view=edit&art=${encodeURIComponent(u.id)}"><wa-icon slot="start" name="pen"></wa-icon>Edit</wa-button>
              <wa-button size="s" variant="success" data-approve="${u.id}"><wa-icon slot="start" name="check"></wa-icon>Approve</wa-button>
              <wa-button size="s" variant="danger" appearance="outlined" data-reject="${u.id}"><wa-icon slot="start" name="xmark"></wa-icon>Reject&hellip;</wa-button>
            </div>
          </div>
          <wa-divider style="margin: 0;"></wa-divider>
          <div class="wa-split wa-align-items-center">
            <div class="wa-cluster wa-gap-l wa-align-items-center">
              <wa-switch size="s" data-highlight="${u.id}">Highlight</wa-switch>
              <div class="wa-cluster wa-gap-xs wa-align-items-center">
                <wa-icon name="cart-shopping" style="color: var(--wa-color-neutral-text-subtle);"></wa-icon>
                <wa-input size="s" placeholder="Store URL (highlighted only)" data-store-url="${u.id}" style="width: 17.5rem;"></wa-input>
              </div>
            </div>
            <span class="wa-caption-s" style="color: var(--wa-color-neutral-text-subtle);">Highlight &rarr; surfaces in Featured + enables sleeves link</span>
          </div>
          <div class="gallery-reject-row" data-reject-row="${u.id}">
            <wa-input size="s" placeholder="Reason (shown to the uploader)" data-reject-reason="${u.id}"></wa-input>
            <wa-button size="s" variant="danger" data-reject-confirm="${u.id}">Confirm reject</wa-button>
          </div>
        </div>`).join('')}
      </div>`}
    <p class="wa-caption-s" style="color: var(--wa-color-neutral-text-subtle); margin-top: var(--wa-space-m);"><wa-icon name="circle-info"></wa-icon> Internal view. Rejection reasons are shown to the uploader. Room is left for a future trusted-uploader tier that skips the queue.</p>
      </wa-tab-panel>
    </wa-tab-group>`;

  root.querySelector('#admin-tabs')?.addEventListener('wa-tab-show', e => { adminTab = e.detail.name; });

  root.querySelectorAll('[data-resend-invite]').forEach(btn => btn.addEventListener('click', async () => {
    btn.setAttribute('loading', '');
    let body = {};
    try {
      const res = await postGalleryArtist({ artistId: btn.dataset.resendInvite, resend: true });
      body = await res.json().catch(() => ({}));
      if (!res.ok) body = { error: body.error || 'Could not resend the invite — try again.' };
    } catch {
      body = { error: 'Could not resend the invite — try again.' };
    }
    btn.removeAttribute('loading');
    if (body.error) showError(body.error);
    else if (body.invite === 'sent') showSuccess(INVITE_OUTCOME.sent);
    else showError(INVITE_OUTCOME[body.invite] || 'Could not resend the invite — try again.');
  }));

  const claimAction = (attr, rpc, done) => root.querySelectorAll(`[${attr}]`).forEach(btn => btn.addEventListener('click', async () => {
    btn.setAttribute('loading', '');
    const { error: err } = await sb.rpc(rpc, { p_claim_id: btn.getAttribute(attr) });
    btn.removeAttribute('loading');
    if (err) showError(err.code === '23505' ? 'That profile is already claimed, or the claimant already owns one.' : 'Could not update the claim — try again.');
    else done();
    await loadPublicData(); // an approved claim changes the public artist row
    render();
  }));
  claimAction('data-claim-approve', 'approve_gallery_artist_claim', () => showSuccess('Claim approved — the profile is now an Artist'));
  claimAction('data-claim-reject', 'reject_gallery_artist_claim', () => showToast('Claim rejected', 'danger', 'circle-xmark'));

  root.querySelectorAll('[data-approve]').forEach(btn => btn.addEventListener('click', async () => {
    const id = btn.dataset.approve;
    const storeUrl = root.querySelector(`[data-store-url="${id}"]`)?.value?.trim() || null;
    const { error: err } = await sb.from('gallery_artworks').update({
      status: 'approved',
      highlighted: !!root.querySelector(`[data-highlight="${id}"]`)?.checked,
      store_url: storeUrl,
      reviewed_at: new Date().toISOString(),
      reviewed_by: user.id,
    }).eq('id', id);
    if (err) { showError('Could not approve — try again.'); return; }
    showSuccess('Approved');
    await loadPublicData(); // approved art is public now
    render();
  }));
  root.querySelectorAll('[data-reject]').forEach(btn => btn.addEventListener('click', () => {
    root.querySelector(`[data-reject-row="${btn.dataset.reject}"]`)?.classList.toggle('open');
  }));
  root.querySelectorAll('[data-reject-confirm]').forEach(btn => btn.addEventListener('click', async () => {
    const id = btn.dataset.rejectConfirm;
    const reason = root.querySelector(`[data-reject-reason="${id}"]`)?.value?.trim();
    if (!reason) { showError('Give the uploader a reason.'); return; }
    const { error: err } = await sb.from('gallery_artworks').update({
      status: 'rejected',
      reject_reason: reason,
      reviewed_at: new Date().toISOString(),
      reviewed_by: user.id,
    }).eq('id', id);
    if (err) { showError('Could not reject — try again.'); return; }
    showToast('Rejected', 'danger', 'circle-xmark');
    render();
  }));
}

// ============================================================
// Router
// ============================================================

function renderNotFound(root, title, sub) {
  root.innerHTML = `
    ${breadcrumbHtml([{ label: 'Gallery', href: 'gallery.html' }, { label: title }])}
    <div class="gallery-empty">
      <div class="ic"><wa-icon name="image"></wa-icon></div>
      <h2 class="wa-heading-m">${escapeHtml(title)}</h2>
      <p class="wa-caption-m" style="color: var(--wa-color-neutral-text-subtle);">${escapeHtml(sub)}</p>
      <wa-button appearance="outlined" href="gallery.html">Back to gallery</wa-button>
    </div>`;
}

function render() {
  const root = document.getElementById('gallery-root');
  if (!root || !publicLoaded) return; // initial skeleton stays until public data arrives
  const params = new URLSearchParams(window.location.search);
  const art = params.get('art');
  const artist = params.get('artist');
  const view = params.get('view');

  if (view === 'edit' && art) renderEditArtwork(root, art);
  else if (view === 'edit-artist') renderEditArtist(root);
  else if (view === 'admin-artist') renderAdminArtist(root, params.get('id'));
  else if (artist) renderArtist(root, artist); // ?artist=&art= is the Commission link from an alter
  else if (art) renderDetail(root, art);
  else if (view === 'upload') renderUpload(root);
  else if (view === 'uploads') renderMyUploads(root);
  else if (view === 'admin') renderAdmin(root);
  else renderGrid(root);
}

// ============================================================
// Init
// ============================================================

initLayout({ activePage: initialType === 'alter' ? 'alter-alley' : 'gallery' });

loadPublicData().then(async () => {
  await Promise.all([loadMyLikes(), loadAdminFlag()]); // no-ops unless auth already restored
  render();
});

// Post-save navigation uses pushState so success toasts survive; re-render
// when the user walks back through history.
window.addEventListener('popstate', render);

// <wa-button href> only navigates once WA upgrades the element (see CLAUDE.md);
// delegated fallback so links rendered before the CDN loads still work.
document.addEventListener('click', e => {
  const btn = e.target.closest?.('wa-button[href]');
  if (btn && !btn.matches(':defined')) window.location.href = btn.getAttribute('href');
});

// Re-render when auth state changes (session restore, logout) so gated views
// and the guest callout stay in sync. Fresh SIGNED_IN reloads the page (auth.js).
let lastUserId = null;
onAuthChange(async user => {
  const id = user?.id || null;
  if (id !== lastUserId) {
    lastUserId = id;
    await Promise.all([loadMyLikes(), loadAdminFlag()]);
    render();
  }
});
