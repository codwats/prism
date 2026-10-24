# Deck export: copying changes back to Moxfield/Archidekt (#377)

Read before touching `js/modules/deck-export.js`, `js/modules/deck-export-panel.js`, the deck `sourceUrl` field, or the Swap Queue Apply deck result.

## Paste formats (research, 2026-10)

Neither site publishes a write API or a paste-format spec. What the primary sources say:

- **Archidekt** (archidekt.com/faq): "Paste any list of cards into the text area ... This will **add** all the cards found in the list to the deck and report any errors." Import adds. It has no syntax for removing a card or lowering a count. Archidekt's own text export writes `1x Name` lines and puts categories in square brackets after the name (`1x Xyris, the Writhing Storm (dmc) 175 [Commander{top}]`, quoted in third-party import help, e.g. mythichub.com/help/importing-decklists). Archidekt's import reads its own export, so PRISM's full list uses `1x Name [Commander]` for commanders and `1x Name` for the rest.
- **Moxfield**: help pages (moxfield.com/help) refuse non-browser fetches, so no primary text. Moxfield's own account (x.com/moxfieldmtg/status/1561375624446582785, 2022) says that with bulk edit or import, "any of the cards that were already in the deck won't change their printings". Bulk Edit replaces the board's list. Moxfield's importer reads MTG Arena text (`Commander` / `Deck` section headers, `N Name` lines), which is what `cardsToDecklistText` already writes, so that is the Moxfield full list.
- **Changes paste**: neither site documents a `-1 Name` line. So the **changes output is a readable checklist with a copy button**, not a paste (the ticket's fallback rule). The player applies it by hand on the site, and the site keeps its printings, foils, categories and Maybeboard.

Not verified by a live test paste. If a site turns out to accept a format above differently, fix `fullListText` in `deck-export.js`; the tests pin today's format.

## Model

- `deck.sourceUrl` — the canonical deck URL from a Moxfield/Archidekt URL import (`deckData.sourceUrl`, from `transformMoxfieldDeck`/`transformArchidektDeck`). Set by URL add and URL re-import (`resolveDeckSource` in deck-import.js leaves it pending until Add Deck / Save Changes), kept by every other edit. Column `decks.source_url`; rides the deck's `updatedAt`, no merge branch of its own. Pasted, file, JSON-less and CubeCobra decks have none.
- `deckExport(deck, siteCards, site)` (pure) → `{ changes, fullList }`. `changes` is `null` with no site deck, else `{ commander: [{ name, delta }], deck: [{ name, delta }] }` — commander zone diffed separately from the rest, names compared with `normalizeCardName`, deltas as count differences.
- `exportDeck(deck, site?)` fetches the live deck through the existing edge proxies and calls `deckExport`. Any fetch failure falls back to the full list with a `notice`. The site follows `sourceUrl`; with none the caller passes the picked site (Moxfield first).
- Only mainboard and commander zones count. Moxfield's transform already reads only commanders, mainboard and companions. Archidekt's transform drops cards whose first category is not `includedInDeck` (Maybeboard, Sideboard), for import and export alike.
- The edge proxies send `Cache-Control: public, max-age=3600`; a POST is not browser-cached, so the diff sees the live deck.
- Free, like the CSV/JSON exports (ADR 0002).
