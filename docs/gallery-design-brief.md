# PRISM Gallery — Design Brief for Wireframe

**Deliverable requested:** wireframes for a new Gallery section of PRISM (prismmtg.netlify.app). Look at the existing site first — the gallery must feel like the same product.

## Context

PRISM is a tool for MTG Commander players who share cards across decks. Jay has partnered with artists who've agreed to let us share their artwork for proxies, tokens, and showcase treatments. The gallery presents that partnered work, and lets the community upload their own. This brief covers the **full vision** — curated + community — so the design is coherent even though the build may ship curated-first.

### Existing design system (match it)

- **Web Awesome 3.10** components + design tokens (`--wa-color-*`, `--wa-space-*`), loaded via CDN kit. Vanilla JS ES modules, no build step.
- Shared layout via `js/layout.js`: `<wa-page mobile-breakpoint="768">` — desktop sidebar nav, mobile hamburger. The gallery is a **new nav item** ("Gallery") alongside Build / Guide / Tools.
- Existing pages for reference: `index.html` (landing), `build.html` (the app), `guide.html`, `tools.html`, `profile.html`.
- Auth already exists: Supabase email/password, login dialog injected by layout.js.
- Wireframe both **desktop (1280px+)** and **mobile (<768px)**.

## Screens to wireframe

### 1. Gallery grid (the main page)

- Masonry/grid of artwork cards. Each card in the grid shows: image, title, artist name, type badge, like count. Highlighted (partnered/featured) pieces get a visual distinction and appear first by default.
- **Filter toolbar:**
  - Type filter: **Proxy / Token / Showcase**
  - Artist filter (partnered artists surfaced prominently)
  - **Card-name search** — "show me all the Sol Rings" (matches the original-card field)
  - Sort: Most liked (default) / Newest / Most downloaded
- **States to show:** populated, empty-filter-result, logged-out (likes visible but tap prompts sign-in).

### 2. Artwork detail view

Deep-linkable (each artwork has a shareable URL). Contains:

- Large artwork image
- Title + **type badge** (proxy/token/showcase) + **AI-generated label** when applicable
- **Original card**: card name + set, linking to its Scryfall page. Optional — tokens/original art may have no source card.
- Description (artist-written or uploader-written)
- **Artist credit block**: name, avatar, short bio line, links to website/socials, link to their artist page
- **License line** (site-wide, same on every artwork): *"Personal, non-commercial use only — credit the artist."* Links to the full terms.
- **Like** (heart) — one tap for signed-in users; count visible to everyone; logged-out tap prompts sign-in
- **Download** button — **requires a free account** (login-gated). Delivers one print-ready file (2.5×3.5" + bleed). Logged-out state shows the button with a sign-in prompt.
- **"Order custom sleeves"** button — **only on admin-highlighted pieces**. External link to the store, new tab. Most artworks don't have this; design both variants.

### 3. Artist page

- Artist header: name, avatar, bio, website/social links. **Partnered artists** get a richer treatment (partner badge, longer bio) than community uploaders.
- Grid of that artist's works (same cards as the main grid).

### 4. Community upload flow

Signed-in users only. Form fields:

- Image file
- Title
- Type (proxy / token / showcase)
- Original card (optional; ideally a card-name autocomplete via Scryfall)
- Description
- AI-generated? (required yes/no — AI art is allowed but must be labeled)
- Artist attribution (defaults to uploader; field for crediting someone else with permission)
- Rules acknowledgment checkbox: *MTG-related only · your own work or permission held · no NSFW · AI art must be labeled*

After submit: **"pending review"** state — uploads are pre-moderated, nothing goes public until approved. Show the user's own pending/approved/rejected submissions somewhere (their profile or a "My uploads" view).

### 5. Admin moderation queue

Internal but wireframed: list of pending uploads with image preview, metadata, uploader, and **Approve / Reject (with reason)** actions. Also where admins set the **Highlight** flag and per-artwork **store URL**.

## Decisions already made (don't reopen in the wireframe)

| Area | Decision |
|---|---|
| License | One site-wide license: personal non-commercial use, artist credit required |
| Moderation | Pre-approval queue; admins approve before anything is public |
| Content rules | MTG-related only · own work only · AI art labeled · no NSFW |
| Rating | Hearts/likes from signed-in users; no star ratings |
| Download | Login-gated; single print-ready file per artwork |
| Store | Per-artwork external link, admin-flagged, highlighted pieces only |
| Storage | Supabase Storage (public-read bucket for approved art; auth-gated uploads) |
| Browse | Filter by type + artist, card-name search |

## Data shape (for the designer's mental model)

```
Artwork: { id, title, imageUrl, type (proxy|token|showcase), originalCard? { name, scryfallUrl },
           description, artistId, isAI, likes, downloads, status (pending|approved|rejected),
           highlighted, storeUrl?, createdAt }
Artist:  { id, name, avatar, bio, links[], isPartner }
```

## Out of scope

- In-gallery commerce (cart/checkout) — store is an external link only
- Per-artwork licenses
- Color/color-identity filtering (nice-to-have, derivable from Scryfall data later)

## Future (design nothing, break nothing)

- Google Drive shared-folder ingestion for artist batches (the way MPC-autofill integrates Drive) — keep the storage story from assuming manual upload is the only intake path.
- Trusted-uploader tier (skip the queue after N approvals) — moderation UI shouldn't preclude it.
