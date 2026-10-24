# Deck export diffs the live site deck, not a stored snapshot

"Copy for Moxfield/Archidekt" (#377) shows the changes a player has to make on the site. PRISM stores the deck's `sourceUrl` when it is imported by URL, and at export time fetches the live deck through the existing `/api/moxfield-edge` and `/api/archidekt-edge` proxies and diffs it against the PRISM deck. Edits made on the site in the meantime show up correctly, so there is no "mark as exported" step and nothing to keep in sync. Decks with no `sourceUrl`, and any failed fetch, get the full list in the site's format.

## Considered options

- **Store a snapshot of the deck at import and diff against it.** Rejected. It goes stale the moment the player edits the deck on the site, so the export would undo those edits. It also needs a synced snapshot per deck plus a reset step after each export.
- **Paste a changes list into the site.** Neither site documents a remove-a-card paste (docs/agents/deck-export.md), so the changes are a checklist the player works through by hand. That keeps the site's printings, foils and categories, which PRISM never stores.
