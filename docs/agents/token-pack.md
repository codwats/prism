# Token pack (#412)

Read before touching `js/modules/tokens.js`, `js/features/token-pack.js`, `getTokenTypes`/`searchTokens` in `scryfall.js`, `prism.tokenChoices` or the `token_choices` table. Terms (Token type, Token pack) are in `CONTEXT.md`. The Token pack is free, not an Extra.

## Token types

- A **Token type** is one Scryfall `oracle_id`. Two printings of a token share it; "1/1 white Soldier" and "1/1 red-white Soldier" don't. A `double_faced_token` (checked against the live API) has one `oracle_id` on top, with P/T, colors and images on its faces, so `tokenType` describes each face (`4/4 white // 5/5 black`); a reminder back face (type line `Token`) adds nothing.
- A deck **needs** a Token type when one of its cards makes it, or the player hand-added it for that deck. Hand-added decks add to the derived ones; they don't follow decklist edits.
- Derivation: `getCardAttributes` keeps each card's `all_parts` token parts with a Token type line (`tokens: [{ id, name }]`; emblems, dungeons and the like are token parts too, and are left out). `getTokenTypes(cardNames, oracleIds)` resolves the printing ids (and hand-added oracle ids) through `/cards/collection` on the shared `rateLimit()` chain. It never throws: a failed request answers from the caches and sets `incomplete`.
- Caches: `prism_token_types` keeps each type forever under `id:<printing>` and `oracle:<oracle_id>`, past the card cache's 24 h on purpose (identities don't change; offline still lists the pack). A miss, or a printing with no image, is not cached. Images are not kept there: a row's image name is `token:<oracleId>`, and `fetchCard` fetches that as `/cards/<scryfallId>` on the rate chain into the 24 h card cache, never `/cards/named`, and never caches it under the token's plain name.
- `searchTokens(q)` backs Add token: `/cards/search?q=t:token …&unique=cards&include_extras=true`, on the chain (a 2-per-second endpoint).

## Rows and marks

- `tokenRows(prism, tokensOf, typeOf)` runs `processCards` on a synthetic PRISM: one card per row, named `token:<oracleIds>`, quantity 1, in the decks that need it. Split groups, shared-vs-subset child marks, Side B stripes, dots, slots, colors and the corner preference are therefore the card rules, and there is one batch (no quantity tiers).
- Hidden types drop out first. Then two types whose `paired` choices point at each other become one row (`Dinosaur // Treasure`) with the union of their decks. A one-sided pointer (two devices paired a type differently) is ignored.
- A row's Done key, `doneKey`, is its batch key: `token:<sorted oracle ids>|#b|<sorted deck ids>|1`. A change in the decks that need the token, or in its pairing, re-keys it, so a Done token reads undone with its new marks. `rowDoneKey` and `rowImageName` (core/utils.js) are the one source for a row's key and image name; `isCardDone`, the table, SCRY-Mode and the preview use them. Unticking goes through `setCardsMarked` and `savePrism`, so the un-mark syncs in `markTimes` as for cards.
- Token rows never enter `processCards(prism)` or `state.processedCards`, so Total cards, Pool, Core, deck Pool/Core and the savings counters leave them out by construction; the backup statistics skip `token:` keys. `state.tokenRows` holds the last Tokens view rows for its tally ("12 of 30 tokens marked") and the hover preview. Not in Marks to Clear, the printable guide or MPC stripes.

## Choices and sync

- `prism.tokenChoices`, one entry per (kind, oracleId, deckId), each with its own `updatedAt`: `added` (one deck: `deckId`, `name`, `included`), `paired` (`pairedWith`), `hidden` (`hidden`). `TOKEN_CHOICE_FIELDS` in tokens.js maps each kind's fields to their columns; storage and the backup import share it.
- Nothing is deleted: undoing a choice writes a newer entry (`included: false`, `pairedWith: null`, `hidden: false`). `setAddedToken` writes only the decks whose tick changed, so ticks for two decks on two devices both survive. Merge rule and table: `docs/agents/sync.md`.
- Choose decks (`tokenDeckOptions`): a deck whose own card makes the token is ticked and locked, unless the player also added it there, which leaves it theirs to untick.

## UI

Mark sleeves: a **Tokens** option in the view switch; `features/token-pack.js` owns the Tokens toolbar (tally, Add token, Hidden menu), each row's menu (Pair with another token, Unpair, Choose decks, Hide) and the Add token and Pair dialogs. `requestTokenTypes` asks Scryfall once per visit to the view; `currentTokenRows` builds the rows. One Mark at a Time doesn't apply (a token is one copy). SCRY-Mode, Audit and the bulk marks walk the shown rows, tokens included.
