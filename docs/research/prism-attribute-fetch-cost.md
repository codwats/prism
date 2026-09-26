# What fetching card attributes for a whole PRISM costs

Research for [What does fetching card attributes for a whole PRISM cost?](https://github.com/codwats/prism/issues/272) (part of [Swap Planner (Extra)](https://github.com/codwats/prism/issues/270)), conducted 2026-09-26.

This file gives facts only. The storage decision belongs to [#273](https://github.com/codwats/prism/issues/273).

## Answer

For a large PRISM with about 30 decks and 2,000 unique names:

| Quantity | Value | Source |
| --- | --- | --- |
| Batch limit of `/cards/collection` | 75 identifiers per request | [Scryfall docs][collection] |
| Rate limit of `/cards/collection` | **2 per second (500 ms)**, not the general 10 per second | [Scryfall rate limits][rate] |
| Requests for 2,000 names | ⌈2000 / 75⌉ = **27** | arithmetic |
| Latency of one 75-name request (measured) | 1.09 s, 1.31 s, 1.13 s, 1.21 s | live curl, 2026-09-26 |
| Wall-clock time, one request after another | 27 × about 1.2 s ≈ **30–35 s** | derived from measurements |
| Transfer per 75-name batch | 393 KB uncompressed JSON, **about 51 KB gzip on the wire** | live curl |
| Transfer for 2,000 names | about 10.5 MB uncompressed, **about 1.4 MB gzip** | derived |
| Slim `{colorIdentity, typeLine, cmc}` entry keyed by lowercased name | **about 85 characters per card** (111 with a `cached_at` timestamp) | measured over all 32,116 Commander-legal Oracle cards |
| Slim cache for 2,000 cards | **about 169K characters** (103K as a `[ci, type, cmc]` array) | measured, random sample of 2,000 |
| localStorage quota | 5 MiB per origin | [MDN][mdn-quota] |

The 100 ms `rateLimit()` chain does not slow this down. Each request takes longer than 1 s, and `canonicalizeCards` awaits each fetch before it starts the next one. So in practice the time between requests is set by latency, not by the chain. That is also why the loop stays under the 500 ms limit today, but only because the requests are slow. The chain itself does not enforce the limit (see [Side findings](#side-findings)).

## Primary-source facts

### `/cards/collection` ([docs][collection])

- "A maximum of 75 card references may be submitted per request." It must be a POST with `Content-Type: application/json`.
- Every request must send a `User-Agent` and an `Accept` header. Browser JavaScript must "keep the browser's User-Agent intact" ([API overview][api]). PRISM's fetch sends neither header explicitly. The browser supplies both, which is compliant.
- `name` "finds the newest edition of a card with the specified name". Each identifier returns at most one card. Misses go into `not_found`. The results come back in request order, but misses throw off positional matching, so match results by name, not by index.
- `oracle_id` is also a valid identifier. It would be exact, but PRISM does not store it.

### Rate limits ([docs][rate])

- `/cards/search`, `/cards/named`, `/cards/random` and `/cards/collection`: **2 per second (500 ms)**. All other methods: 10 per second (100 ms).
- "Recieving an HTTP 429 response will result in your access being limited for 30 seconds."
- "The direct file origins located at `*.scryfall.io` do not have rate limits."
- "If you need to rapidly look up card names, prices, or resolve a large number of card images, you **must** use the bulk data files."
- Scryfall asks clients to cache for at least 24 hours. Gameplay data "downloading ... once per week or right after set releases would most likely be sufficient."

### Name matching: the `" // "` trap (live test)

A `name` identifier matches a **face name**. It does **not** match the full Oracle name `"A // B"` for any multi-face layout. It is case-insensitive.

| Sent | Result |
| --- | --- |
| `Fire // Ice`, `fire // ice`, `Fire//Ice`, `Wear // Tear`, `Cut // Ribbons`, `Unholy Annex // Ritual Chamber` | `not_found` |
| `Delver of Secrets // Insectile Aberration`, `Shatterskull Smashing // Shatterskull, the Hammer Pass`, `Bonecrusher Giant // Stomp`, `Akki Lavarunner // Tok-Tok, Volcano Born` | `not_found` |
| `Fire`, `Wear`, `Cut`, `Unholy Annex`, `Delver of Secrets`, `Shatterskull Smashing`, `Valki, God of Lies`, `Bonecrusher Giant`, `Akki Lavarunner` | found; the response `name` is the full `"A // B"` Oracle name |
| `sol ring` | found |

PRISM stores the canonical Oracle name after `canonicalizeCards`, so multi-face cards are stored as `"A // B"`. A fetch must send `name.split(' // ')[0]` and map the response back through the front face of the response `name`. `canonicalizeCards` already does the mapping back, but it sends the full input name. Of the Commander-legal Oracle cards, **846 of 32,116 (2.6%)** have a `" // "` name.

### Which fields to read (live `/cards/collection` responses)

| Card (layout) | top-level `color_identity` | top-level `type_line` | top-level `cmc` | top-level `colors` | `card_faces[].cmc` |
| --- | --- | --- | --- | --- | --- |
| Delver of Secrets (`transform`) | U | `Creature — Human Wizard // Creature — Human Insect` | 1 | *absent* | null |
| Shatterskull Smashing (`modal_dfc`) | R | `Sorcery // Land` | 2 | *absent* | null |
| Valki, God of Lies (`modal_dfc`) | B R | `Legendary Creature — God // Legendary Planeswalker — Tibalt` | 2 | *absent* | null |
| Esika, God of the Tree (`modal_dfc`) | **W U B R G** (back face adds the colors) | `Legendary Creature — God // Legendary Enchantment` | 3 | *absent* | null |
| Fire // Ice (`split`) | U R | `Instant // Instant` | **4** (both halves added together) | R U | null |
| Unholy Annex // Ritual Chamber (`split`, Room) | B | `Enchantment — Room // Enchantment — Room` | 8 | B | null |
| Bonecrusher Giant (`adventure`) | R | `Creature — Giant // Instant — Adventure` | 3 | R | null |
| Akki Lavarunner (`flip`) | R | `Creature — Goblin Warrior // Legendary Creature — Goblin Shaman` | 4 | R | null |
| Bruna, the Fading Light (`meld`) | W | `Legendary Creature — Angel Horror` | 7 | W | no faces |
| Kenrith, the Returned King (`normal`) | **W U B R G** | `Legendary Creature — Human Noble` | 5 | **W** only | no faces |
| Command Tower, Sol Ring | *empty* | `Land`, `Artifact` | 0, 1 | *empty* | no faces |

What this shows:

- **`color_identity` (top level)** is always present and already follows the Commander rule: it covers both faces (Esika) and rules text (Kenrith). Use it both for card identity and for **a commander's identity**. For two commanders, take the union of their `color_identity`. `colors` is the wrong field. It is absent at the top level on DFCs and is narrower than identity (Kenrith).
- **`cmc` (top level)** is always present and is the rules mana value: the front face for transform and MDFC cards, both halves added together for split cards, and the creature for adventure cards. Per the [Card docs][cards], `card_faces[].cmc` is set only "if the card is reversible". It was null on every face in these tests. No Commander-legal card has a fractional `cmc` today.
- **`type_line` (top level)** is always present. It joins the faces with `" // "`. A type check against the top-level line therefore sees both faces: `Sorcery // Land` contains "Land". Front-face-only types are in `card_faces[0].type_line`. Which one the Swap Planner wants is a product question, not a data gap.
- Across the whole Oracle bulk file, **no Commander-legal entry lacks** a top-level `color_identity`, `type_line` or `cmc`. The only layout without top-level `cmc` or `type_line` is `reversible_card` (70 Commander-legal Secret Lair-style prints, found with `/cards/search`). When all 70 of those names were sent through `/cards/collection`, it returned the normal print every time, not the reversible one. A defensive fallback to `card_faces[0]` costs one line.

Commander-legal layout mix: normal 30,944; transform 388; saga 180; adventure 151; split 123; modal_dfc 98; prepare 67; class 34; mutate 34; leveler 25; meld 21; prototype 19; flip 19; case 13.

### Storage footprint (measured)

The measurements are JSON character counts. localStorage quota is counted per origin; [MDN][mdn-quota] gives 5 MiB.

- The existing `scryfall_card_cache` entry shape (`name, image_uri, scryfall_uri, type_line, mana_cost, cached_at`) is about **301 characters per card**. It already holds `type_line` and lacks `color_identity` and `cmc`.
- Slim object `{"colorIdentity":"BR","typeLine":"…","cmc":2}` keyed by lowercased name: **84.6 characters per card**. With `cached_at`: 110.6. For 2,000 cards that is about 169K characters (about 221K with `cached_at`).
- Slim array `[ci, typeLine, cmc]`: 51.6 characters per card, about 103K for 2,000.
- A full Scryfall card object is about 5,200 characters per card, so storing raw responses (about 10 MB for 2,000) would exceed the quota.
- The **whole Commander-legal pool** in slim form: 2.7M characters as objects, 1.66M as arrays. That is a large share of the 5 MiB quota before `prism_data` and the other caches.

### Bulk data ([docs][bulk])

- The bulk files are now **gzipped JSONL** (`jsonl_download_uri`). Oracle Cards on 2026-09-26: **24.6 MB compressed, 203 MB decompressed, 38,690 lines** (32,116 Commander-legal). It is regenerated every 12–24 hours, and the URL carries a timestamp, so it has to be discovered through `GET /bulk-data` (one 100 ms-class request).
- `data.scryfall.io` sends `access-control-allow-origin: *` and `content-type: application/gzip` (a file, not `Content-Encoding`). A browser would have to stream it through `DecompressionStream('gzip')` and parse it line by line. That means 24.6 MB of download per client, compared with about 1.4 MB for 27 collection calls.
- The file origin has no rate limit, and Scryfall says clients that resolve "a large number" of cards "must use the bulk data files". Whether 27 requests per PRISM counts as a large number is not defined in the docs.
- A middle option: a slim `{name: [ci, type, cmc]}` index of the whole Commander-legal pool, built offline from the bulk file, is **1.76 MB raw and 463 KB gzip**. It could be served as a static file, the way `scripts/build-og-card.mjs` and `scripts/build-sitemap.mjs` already generate assets. The trade-off is keeping it fresh after each set release.

## Side findings

These are outside the ticket, but #273 and the implementation should know them.

1. **`/cards/named` is also limited to 2 per second.** `fetchCard`/`prefetchCards` go through the 100 ms chain, so fast (cached-CDN) responses can exceed the documented limit. The single-name path does not wait out its own latency between requests the way the batched loop does.
2. **A 429 locks the client out for 30 s**, but `fetchWithRetry` retries after about 1 s (`REQUEST_DELAY * 10`), inside the lockout.
3. **`cacheCard` loads and rewrites the whole cache on every call.** Adding 2,000 entries one at a time through it is quadratic in serialization work. A batch writer avoids that.
4. `canonicalizeCards` sends full `"A // B"` input names, which always miss (see above). This is harmless today, because the name is already canonical, but a copy of this loop for attributes would silently return nothing for 2.6% of cards.
5. The UB example in the `canonicalizeCards` comment ("Dwight Schrute, Hay King") returned `not_found` from `/cards/collection` today.

## Method

- Scryfall's docs pages (`/docs/api`, `/docs/api/rate-limits`, `/docs/api/cards/collection`, `/docs/api/cards`, `/docs/api/bulk-data`) were fetched on 2026-09-26.
- Live calls used `curl` with `User-Agent: PRISM-research/1.0` and `Accept: application/json`, with at least 600 ms between collection calls (about 10 requests in total).
- Footprint and layout statistics were computed over the Oracle Cards bulk file `oracle-cards-20260926090156.jsonl.gz`, filtered to `legalities.commander ∈ {legal, restricted}`.

[api]: https://scryfall.com/docs/api
[rate]: https://scryfall.com/docs/api/rate-limits
[collection]: https://scryfall.com/docs/api/cards/collection
[cards]: https://scryfall.com/docs/api/cards
[bulk]: https://scryfall.com/docs/api/bulk-data
[mdn-quota]: https://developer.mozilla.org/en-US/docs/Web/API/Storage_API/Storage_quotas_and_eviction_criteria
