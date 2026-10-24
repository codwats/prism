# Sleeve reuse is reconciled from state and matched by sleeve, never at edit time

When a card leaves the PRISM, its marked sleeve is a Freed sleeve that another card can go into. PRISM finds these from current state every time the view is shown (`planSleeveReuse` in `js/modules/sleeve-reuse.js`): the open `removedCards` rows rebuild each card's old copies over today's decks, the copies still in a deck keep the sleeves that cost them the fewest changes, and whatever is left is freed. A Freed sleeve matches any unmarked batch whose marks differ by at most 2 marks to clear, cheapest first, compared by the mark identity `tallyMarks` already uses (side, slot, mark type, color). Nothing about a match is stored. Completing one raises `clearedQuantity` on the rows it covers and marks the incoming batch Done, and the next plan no longer shows it.

Matching by sleeve means PRISM never guesses which card replaced which. A freed sleeve marked for {A,B,C} fits any card that needs {A,B,C}, and card names only show up in labels. Reconciling from state means the order of edits doesn't matter: removing a card from five decks takes five saves, and only the last one shows the full picture. Matching at edit time would see each save on its own and get the first four wrong.

## Considered options

- **Detect swaps at deck-edit time** (prompt in the Edit dialog, or store a pending pair). Rejected. Re-imports and file uploads change many cards at once with no pairing, single-deck edits see only part of a multi-deck change, and a stored pair goes stale the moment the next edit lands.
- **Match by card** (Kodama's Reach out, Cultivate in, same decks). Rejected. It needs the pairing above, and it misses the common case where the marks fit but the cards are unrelated.
- **Lower `previousQuantity` when a reuse is ticked.** Rejected. `mergeRemovedCards` keeps the max of `previousQuantity`, so sync would undo it. `clearedQuantity` is a separate field that also only goes up and merges by max.
- **Include Planned swaps.** Rejected. Ticking a reuse marks a card Done, and a card that isn't in a deck yet can't be Done.
