# PRISM

PRISM models Commander decks and the physical sleeved cards shared between them.

## Language

**Commander**:
A card assigned to a deck's command zone. A deck may have one or more commanders.

**Multi-commander deck**:
A deck with more than one commander, regardless of the game mechanic that permits it.
_Avoid_: Partner deck, when referring to all multi-commander mechanics

**Decklist**:
The user-supplied list of cards and quantities for a deck. PRISM treats it as authoritative and does not adjudicate Commander legality.

**PRISM**:
A named container of decks, split groups, and their marks. A user may keep several. The product and the container share the name, so reader-facing prose introduces the container sense on first use.

**Marking batch**:
A result line describing a quantity of interchangeable physical copies that receive the same set of deck marks.

**Marking pass**:
One deck mark applied to a quantity of copies, summed across marking batches. Distinct from a marking batch, which is copies sharing the same _set_ of marks — a pass is a single mark that may draw copies from several batches.
_Avoid_: marking group, basics by deck
_In code_: the filter value is `basics-by-deck`; the control reads "One Mark at a Time" (`build.html`). Both mismatches are deliberate, and the control label is the one to use in reader-facing prose.

**Quantity tier**:
A quantity of one card needed by the same set of decks. Tier boundaries occur where decklist quantities differ.

**Split group**:
A logical deck composed of child variants that share one physical card pool and a parent deck mark. Child marks distinguish copies needed by only some variants.

**Pool**:
A physical copy in a marking batch used by two or more logical decks. Always capitalized — a term of art, not the ordinary word.
_Avoid_: shared card, POOL, pool

**Core**:
A physical copy in a marking batch used by exactly one logical deck. Always capitalized.
_Avoid_: unshared card, CORE, core

**Dedicated**:
A qualifier on a Core batch that exists because the PRISM gives a commander its own copy instead of sharing one. Written `Core (dedicated)`, lowercase in the parentheses. Never a third category beside Pool and Core.

**Physical total**:
The number of physical copies of a card needed across a PRISM. It equals the sum of that card's marking-batch quantities.

**Mark**:
A painted indicator on a sleeve edge. Every mark is either a stripe or a dot.

**Stale mark**:
A mark on a sleeve for a deck that no longer needs the card. Arises when a card leaves a decklist or its quantity drops. Lowercase in prose.
_Avoid_: removed card, pending removal
_In code_: `removedCards`, and the filter value is `removed`.

**Slot**:
One of the 48 places on a sleeve edge where a deck's mark goes. Lowercase in prose; capitalized only before a number, as in `Side A - Slot 3`.
_Avoid_: stripe position, position
_In code_: `stripePosition` and `sideAPosition`. The mismatch is deliberate — do not align either direction.

**Perfect Fit inner**:
The inner sleeve of a double-sleeved card, and the only sleeve that is ever marked. Its partner is the outer sleeve, which protects the mark.
_Avoid_: perfect-fit inner sleeve, inner Perfect Fit sleeve, Perfect Fit inner sleeve
