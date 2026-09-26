# Scryfall oracle tags for comparable-role matching

Research for [Can Scryfall oracle tags power comparable-role matching?](https://github.com/codwats/prism/issues/271) (part of [Swap Planner (Extra)](https://github.com/codwats/prism/issues/270)), conducted 2026-09-26 against the live Scryfall API and docs.

## Conclusion

**Yes, with a curated role list, and read from the bulk file rather than from search.**

- Card objects do **not** carry oracle tags. Tags reach clients two ways: `otag:` search queries, and a daily **Oracle Tags bulk file** (5.7 MB gzipped, 4,557 tags, 236,284 taggings over 36,241 oracle IDs). The bulk file is served from `data.scryfall.io`, which has no rate limit and allows CORS from any origin.
- Coverage is complete enough, even for a set that is not yet released. Every previewed Reality Fracture card but one has at least one tag, with the same median of 7 tags as mature sets. 87% of its nonland cards hit a role in the list below, against 82–84% for Commander Masters and Bloomburrow.
- Tag **slugs are not stable**. Scryfall says to key on the tag UUID and to be able to hide individual tags, because the data is community-edited. Some tags are noise (see below), so the Planner needs an **allowlist** of role tags pinned by UUID. It must not display whatever tags a card happens to have.
- Cost: joining a whole PRISM of about 2,000 unique names takes **1 API call plus 1 unmetered file download**. Mapping names to oracle IDs takes another 27 `/cards/collection` calls. PRISM already makes those calls in `canonicalizeCards` and throws away the `oracle_id`. Running `otag:` searches per role instead costs about 200 paginated requests (about 100 s at the 2/s search limit). Looking up tags per card is impossible, because card objects carry none.
- **Terms-of-use risk to resolve before building.** Scryfall forbids paywalling its data: "You may not require anyone to make payments … agree to subscriptions … in exchange for access to Scryfall data." The Swap Planner is a Members-only Extra. A role label that comes straight from Tagger, shown only to Members, reads as paywalled Scryfall data. The same concern already applies to any Scryfall data the Extras show today.
- Fallback: same color identity + type + mana value. Every card object has these fields, and the fallback needs no tags. Lands need it most, because generic role tags cover them poorly.

## Where tags live

**Not on card objects.** A live `GET /cards/named?exact=Swords to Plowshares` returns 60 top-level keys. None of them is a tag field. The keys include `keywords`, `type_line`, `color_identity`, `cmc`, `oracle_id` and `game_changer`.

**Search.** `otag:`, `function:` and `oracletag:` are synonyms ([Tagger tags docs](https://scryfall.com/docs/tagger-tags): "You can use function:, otag:, or oracletag: to find 'Oracle' tags which describe the function of the card"). Live checks:

| Query | `total_cards` |
| --- | --- |
| `otag:removal` | 6,449 |
| `otag:ramp` | 2,286 |
| `otag:card-advantage` | 6,206 |
| `otag:board-wipe` / `otag:sweeper` / `otag:wipe` | 942 (all three identical) |
| `otag:shock-land` / `otag:shockland` | 11 |
| `set:fra function:removal` = `set:fra oracletag:removal` = `set:fra otag:removal` | 60 |

Search resolves aliases and normalizes hyphens and spaces (`board-wipe` matches the alias `boardwipe`). It includes descendant tags: `removal` has zero direct taggings in bulk, yet `otag:removal` returns 6,449 cards. There is **no way to ask which tags a card has**. `has:otag` is rejected with the warning "Checking if cards are 'otag' is not supported", and the search ignores it. An unknown slug (`otag:zzznotatag`) returns the normal "didn't match any cards" 404. So a renamed tag fails silently, as an empty result.

**Bulk file.** `GET https://api.scryfall.com/bulk-data` lists `oracle_tags` ("A JSON file containing all Oracle tags sourced from Tagger, the Scryfall community tagging project"). On 2026-09-26 it was `oracle-tags-20260926090032.jsonl.gz`, 6,005,756 bytes compressed and 18,693,426 bytes decompressed, with 4,557 JSON lines. `access-control-allow-origin: *`. `cache-control: public, max-age=31556952`, because the file URL carries a timestamp. The [Tags API docs](https://scryfall.com/docs/api/tags) define the object:

- `id` (stable UUID), `slug`, `label`, `type` (`oracle`), `description`, `parent_ids`, `child_ids`, `aliases`, `taggings[]`
- each tagging has `oracle_id`, `weight` (`very_strong` / `strong` / `median` / `weak`) and an optional `annotation`
- "The bulk data only includes direct taggings. A parent tag … will have no direct taggings of its own — … traverse its `child_ids` … and collect their taggings."
- Join: "match each tagging's `oracle_id` against the `oracle_id` field in the Oracle Cards bulk file".

Measured shape: 925 root tags, 729 with aliases, 1,668 `cycle-*` tags. The weights are almost all `median` (235,665), with 618 `very_strong` and 1 `strong`, so weight is not a useful signal. Rolling up through `child_ids` gives slightly larger sets than search: `removal` 6,738 against 6,449, because search counts unique cards and leaves some objects out. Bulk aliases are stored in raw form (`"mass removal"`, `"boardwipe"`, `"wrath of god"`), so a client that matches aliases has to normalize them the way search does. The docs say "Each file contains a JSON array", but the file is JSONL, one tag per line.

## Coverage

These counts compare Reality Fracture (`fra`, released 2026-10-02, six days after this check, still in preview) with mature sets. Coverage uses the bulk file joined on `oracle_id` from `set:` searches.

| Set | Unique cards | Untagged | Median tags per card | Nonland cards with ≥1 allowlisted role |
| --- | --- | --- | --- | --- |
| fra (Reality Fracture) | 285 | 1 (Yargle, Goliath of Otaria) | 7 | 226/260 (87%) |
| frc (Reality Fracture Commander) | 87 | 0 | 6 | 58/59 (98%) |
| hob (The Hobbit) | 193 | 0 | 7 | n/a |
| msh (Marvel Super Heroes) | 281 | 0 | 7 | n/a |
| blb (Bloomburrow) | 279 | 0 | 7 | 220/262 (84%) |
| cmm (Commander Masters) | 737 | 0 | 6 | 525/643 (82%) |

The allowlist used for the role column was the roll-up of `removal, sweeper, ramp, mana-producer, card-advantage, tutor, counterspell, recursion, protects-permanent, lifegain, sacrifice-outlet, burn, discard, mill, evasion, anthem, cost-reducer, untapper, copy, extra-turn, fog, hate, combat-trick`. Five slugs I guessed at do not exist: `token-generator`, `graveyard-hate`, `land-destruction`, `wincon`, `pump`. A real list has to be built by browsing Tagger.

Cards that miss the list are mostly vanilla or mechanical creatures and set-mechanic cards (Ainok Bond-Kin, Bark-Knuckle Boxer). That is the expected gap: no comparable-role match exists for them, and type + mana value is the right comparison anyway.

**Lands** are poorly served by generic roles (fra 2/25 lands, cmm 28/94). They are tagged by **family** instead: `cycle-rav-shockland` (parent `shockland`), `cycle-mid-slowland`, `cycle-bfz-tangoland`, `cycle-eve-filterland`, `rainbow-land` (Command Tower, Exotic Orchard), `utility-land`. New-set cycles get tags before release (`cycle-fra-commons`, `cycle-fra-annex`). 15 of 20 fra nonbasic lands and 60 of 88 cmm nonbasic lands carry a cycle or land-family tag. Cycle tags are set-scoped, so "same role" for a dual land means climbing to the parent family tag (`shockland`), not matching the exact `cycle-*` tag.

Sample direct tags, showing both the useful signal and the noise:

- Swords to Plowshares: `removal-exile`, `removal-creature`, `spot-removal`, … plus `evasion`, `donate-token`, `enters-in-company`
- Sol Ring: `mana-rock`, `adds-multiple-mana`
- Cultivate: `land-ramp`, `tutor-land-basic`
- Wrath of God: `sweeper`, `removal-destroy`
- Lightning Greaves: `protects-creature`, `gives-shroud`. This tag is not under `protects-permanent`, so the taxonomy is uneven and an allowlist has to name leaf tags as well.
- Eternal Witness: `regrowth-any` … plus `virtual-vanilla`
- Rhystic Study, Smothering Tithe, Counterspell: `meme`

Trivia and structure tags (`alliteration` with 4,455 cards, `meme`, `activated-ability` with 9,166, `triggered-ability`, `single-english-word-name`) outnumber role tags, which is a second reason to use an allowlist.

## Stability

Scryfall, [Tags API docs](https://scryfall.com/docs/api/tags): "Tag data is subject to change as the community adds, edits, and removes tags. … we cannot guarantee that tag data is 100% free from intentional errors or abuse. **Do not treat tag slugs or labels as permanent identifiers** … Use the `id` field (a stable UUID) … Downstream applications are strongly recommended to implement a way to temporarily disable display of individual tags."

In practice this means:

- Pin the allowlist by UUID, not by slug, and re-resolve labels from each day's file.
- Keep a local deny list so one bad tag can be hidden without shipping code.
- Treat the role match as a hint next to the type/color/mana-value comparison, never as the only filter.

## Terms of use and rate limits

From the [API overview](https://scryfall.com/docs/api):

- Every request to `api.scryfall.com` must send `User-Agent` and `Accept` headers. Browser JavaScript keeps the browser's own User-Agent.
- "You may not 'paywall' access to Scryfall data. You may not require anyone to make payments, take surveys, agree to subscriptions … in exchange for access to Scryfall data. If you have an account system, end-users should be able to access card data anonymously or with free accounts."
- "You may not simply repackage, republish, or proxy Scryfall data. Your software must create additional value for end-users."

From [Rate Limits](https://scryfall.com/docs/api/rate-limits):

- `/cards/search`, `/cards/named`, `/cards/random` and `/cards/collection` are limited to **2/second (500 ms)**. `/cards/manifest` is limited to 10/minute. Everything else is limited to 10/second.
- "The direct file origins located at `*.scryfall.io` do not have rate limits."
- A 429 locks the client out for 30 s, and repeated overload can lead to a ban. "If you need to rapidly look up card names … you must use the bulk data files."
- Scryfall asks clients to cache for at least 24 h. Gameplay data (and so tags) only needs refreshing about weekly or after a set release.

**Implication for Swap Planner:** the Planner's value is working out the paint cost of a Swap, which is value PRISM adds. A role *label* taken from Tagger and shown only to Members is still the "paywall" case. Two ways to stay clearly inside the terms:

1. Show a card's role tags **somewhere free**, for example in the free card hover or the Results tab, so the Extra adds planning on top of data anyone can already see.
2. Use the tags only to *rank* comparable cards inside the Extra, without presenting them as data.

This is a product call for the #270 spec, not something the research can settle.

**Aside (existing code):** `js/modules/scryfall.js` spaces every request 100 ms apart (`REQUEST_DELAY = 100`), including the `/cards/named` queue and the `/cards/collection` POST. Both endpoints now have 500 ms hard limits, so PRISM can exceed them during bulk canonicalization. This deserves its own ticket.

## Request cost for a PRISM of about 30 decks and 2,000 unique names

| Approach | Requests | Wall time | Notes |
| --- | --- | --- | --- |
| **Bulk file (recommended)** | 1 × `GET /bulk-data` + 1 download from `data.scryfall.io` (5.7 MB gz) | seconds | Unmetered origin, CORS `*`, immutable per-day URL. Decompress with the browser's native `DecompressionStream('gzip')` and cache the derived role index in IndexedDB. The 18.7 MB decompressed file is too big for `localStorage`. Refresh at most daily. |
| Name → `oracle_id` | 27 × `POST /cards/collection` (75 names each) | about 14 s at 2/s | Already paid: `canonicalizeCards` calls this endpoint and drops `oracle_id`. Storing it, or caching it next to `scryfall_canonical_cache`, makes this free from then on. |
| `otag:` search per role, intersected locally | about 200 pages (about 36k role memberships ÷ 175 per page for about 20 roles) | about 100 s at 2/s | Works without oracle IDs (name match), but costs far more and fails silently if a slug is renamed. |
| Per-card lookup | not possible | n/a | Card objects have no tags. The only per-card route, `!"name" otag:X` for each role, would be 2,000 × 20 = 40k searches (about 5.5 h). |

The incoming card needs only the same index lookup by its `oracle_id`, which the Scryfall autocomplete/named fetch already returns.

## Fallback

If tags are dropped, or a card has no allowlisted role (vanilla creatures, lands without a family tag), compare on fields every card object carries:

- `color_identity` (subset of the deck's identity)
- `type_line` (primary card type, and for lands the basic land types)
- `cmc` (sort by distance)
- `keywords`

These fields come from the same `/cards/collection` responses, so the fallback costs no extra requests. It is also the baseline #270 already names ("same color identity + type, sortable by mana value"). Tags only improve the order on top of it.
