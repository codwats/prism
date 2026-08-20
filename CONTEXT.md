# PRISM

PRISM models Commander decks and the physical sleeved cards shared between them, and hosts the community gallery of artwork for those cards.

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

### Gallery

**Artist**:
A person whose gallery profile is claimed by their PRISM account. The artist asks to claim the profile; an admin approves it.
_Avoid_: creator, contributor, and uploader when the maker is meant
_In code_: a `gallery_artists` row with `user_id` set.

**Attribution**:
The credit naming who made a work, carried whether or not that person has an account. Most makers never sign up, and their work is credited all the same.
_Avoid_: unclaimed artist, artist name
_In code_: `gallery_artworks.artist_name`, and `gallery_artists` rows with `user_id` null. A claim sets `user_id` on the same row, so an Attribution becomes an Artist in place and the credit never changes.

**Uploader**:
The account that submitted a work. Often not the Artist — the two are only the same person when an Artist uploads their own work.
_Avoid_: submitter, poster
_In code_: `gallery_artworks.uploader_id`.

**Alter**:
A real card painted over by hand. The gallery shows a photograph of one, never a file to print, so an Alter is commissioned rather than downloaded.
_Avoid_: altered art, custom card, proxy
_In code_: `type = 'alter'`. The view filtered to Alters is called Alter Alley in reader-facing prose.

**Highlight**:
An admin's mark that a work is editorially featured. It says nothing about whether the work can be bought — the store link alone decides that.
_Avoid_: featured, promoted, and any sense of "merch exists"
_In code_: `gallery_artworks.highlighted`, deliberately independent of `store_url`.

**Commission**:
A request from a signed-in visitor to an Artist who has commissions open. PRISM relays it once and keeps both addresses private; the conversation continues by reply, away from PRISM.
_Avoid_: contact request, inquiry, order
