# Permutation mode (colour-pattern deck encoding)

PRISM does not identify decks by combinations of mark colours across slots. One deck owns one stripe slot.

## Why this is out of scope

PRISM's promise is that you can see which deck a sleeve belongs to at a glance: find the stripe at that deck's slot, in that deck's colour. Encoding each deck as a pattern of colours across several slots (for example 6 pen colours over 48 slots) raises capacity far past 48 decks, but it breaks that promise:

- A card in several decks would carry the union of several patterns on one sleeve. You can no longer pick out one deck's code from the overlap without decoding it.
- Sorting a sleeve back into its deck means reading and matching a multi-slot code, not spotting one stripe.
- Every downstream rule assumes one slot per deck: `processCards` batches, split groups (shared Side A slot, Side B stripes, dots), Marks to Clear diffs when a deck changes, the printable guide, SCRY-Mode and MPC stripes. A pattern scheme would rewrite all of them.

Capacity today is 48 stripe slots (`MAX_STRIPE_SLOTS`), up to 96 variants with dots. Very large sets of small decks, such as a Jumpstart collection, are better served another way, for example importing them as a cube (CubeCobra import) or splitting them across several PRISMs.

## Prior requests

- #518: "Permutation mode: identify decks by combinations of mark colours instead of one stripe per deck" (Jumpstart collection feedback)
