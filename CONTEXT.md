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

**Lapse**:
The moment a Membership stops entitling its holder — the billing rail has
given up retrying a failed payment, or a cancelled subscription has reached the
end of the period already paid for. A Founder never lapses and a free account
has nothing to lapse from. Verb and noun; the person is a *lapsed member*, never
a churned or expired one.
_Avoid_: churn, expiry, downgrade, cancellation (which is the request, not the state)
_In code_: no field of its own — a lapse is `is_entitled()` turning false, read from `subscriptions.status`.

**Paused sync**:
The state of a lapsed member's cloud copy: retained forever and still readable
on any device, but never written again until they become a member again. The word
shown to the reader is *paused*, always with the date of the last sync — never
*frozen*, *locked*, *disabled* or *lost*, all of which suggest the collection
itself is at risk when only the uploading has stopped.
_Avoid_: frozen, locked, suspended, sync disabled

**Membership**:
The paid tier: cloud sync, up to 25 cloud PRISMs, the Extras and the paid Discord role, for $3 a month or $30 a year on either billing rail. A **Member** is anyone entitled to it, a Founder included. The verb is **join** on buttons, always with the price attached so it does not collide with the open Discord, and **become a member** in prose. The unpaid state has no name — the profile tag reads Member or shows nothing at all.
_Avoid_: subscribe, subscription, subscriber (reader-facing prose only), upgrade, downgrade, plan, tier, premium, pro, plus, free trial. *Unlock* is fine: it names a perk gained, not data walled.
_In code_: `subscriptions`, `getSubscription()`, `#btn-subscribe`. The mismatch is deliberate — the table is webhook-owned and mirrors Stripe's own object — so do not align either direction. Stripe's hosted Checkout says "Subscribe" and we do not control it. Unrelated: `markType: 'membership'` (`processor.js`) is a card's membership in a split-group variant, and is never rendered.

**Extras**:
The bundled perks a Membership includes beyond sync, reached from a paid-only area linked from build.html. Today that is the MPC Stripe Compositor (`mpc-stripes.html`). Always capitalized. The modest register is deliberate — Extras is not the sell.
_Avoid_: premium features, bonus content, perks (as a proper noun)

**Founder**:
A person entitled to PRISM permanently and without paying: every account that existed when payment enforcement was switched on, and every Kickstarter backer stamped from the backer survey. A Founder **is** a Member — it is *how* someone holds a Membership, not an alternative to holding one. One word in prose and in code — never founding member or founding supporter.
_Avoid_: grandfathered user, founding member, founding supporter, early adopter
_In code_: the `founders` table. Both intakes write the same row: the unfiltered stamp at the flip (`docs/runbooks/enforcement-cutover.md`), and a manual stamp for backers matched on the email the backer survey collects ([#204](https://github.com/codwats/prism/issues/204)). Entitlement is read through `is_entitled()`, which hides whether it came from a Founder row or a subscription. The grant is app-only: a Founder gets no Patreon content library, and pays like anyone else for that.

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
