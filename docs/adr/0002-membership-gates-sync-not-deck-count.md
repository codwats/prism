# Membership gates cloud sync, not deck count

PRISM's paid line is **cloud sync**, plus more than one cloud PRISM and the bundled
Extras, at $3/mo or $30/yr USD on Stripe or Patreon at identical prices. Anonymous,
local-only use stays fully functional forever: no deck cap, no slot cap, no cap on
locally-created PRISMs. Enforcement gates *adding* — the INSERT of a new prism or deck —
and never gates reading, editing or exporting anything already made.

The obvious alternative, and the one most tools in this space reach for, is to meter the
thing the product counts: decks. PRISM does not, and the reasons are not aesthetic.

## Considered options

1. **A 24-slot (Side A only) free cap** — rejected on two independent grounds.
   *Technically it does not work:* split-group variants allocate from Side B first —
   `getNextVariantPosition` scans 48→25 before 1→24 (`js/modules/processor.js:837`) — so a
   Side-A-only tier throws on the user's first split group. The cap would break a free
   feature rather than withhold a paid one. *Commercially it does not pay:* at an average
   of ~5 decks per player it converts almost nobody, while costing the full "PRISM limits
   your decks" brand hit. And the PRISM count is already a count-based meter, so a deck cap
   is a second, weaker meter on the same axis.
2. **Free sync of a single PRISM** — rejected. Sync is the membership's only real feature;
   giving it away in the shape almost every user needs leaves nothing to sell.
3. **Selling sync as backup insurance** — rejected as a hostage dynamic. Charging for
   protection from a data loss we choose not to mitigate for free is the wrong
   relationship with a community project's users. Sync is pitched as *multi-device
   convenience* ("pick it up on your phone at the LGS"); JSON export
   (`js/modules/export.js`) is the honest free backup and stays free.
4. **Deleting a lapsed member's cloud rows** — rejected. It saves nothing worth having: a
   typical account's entire cloud footprint is ~0.15 MB against 8 GB included, and one
   gallery upload outweighs roughly sixty lapsed members. Rows are kept indefinitely and
   are never deleted by a billing event.
5. **Locking a lapsed or over-limit member out of their data** — rejected outright, and
   this is the one closest to non-negotiable. Paint on sleeves is permanent. Walling a
   marked deck's data does not inconvenience someone; it makes their physical cards
   unreadable, with no undo. Nothing PRISM charges for is worth that.

## Consequences

- **Gate adding, never access.** Over a limit refuses the next create and nothing else.
  Existing decks and PRISMs stay readable, editable and exportable forever — paid, lapsed,
  or never paid. A lapse pauses cloud *writes* and keeps cloud *reads*, so a lapsed member
  can still pull their dated snapshot onto a new device.
- **The 25-PRISM cap is a runaway-cost ceiling on *cloud* PRISMs, not an anti-sharing
  measure.** Account sharing is one login and several humans; a cap does not address it and
  it is cheaper to ignore than to fight. The real exposure is unbounded PRISM creation
  against a Supabase org shared with two other projects, so the cap is enforced
  server-side. Local PRISM creation stays uncapped and is self-limiting — juggling local
  PRISMs means hand-carrying JSON exports.
- **Everyone with an account at the flip is a Founder, permanently.** Recorded as a stamped
  flag in a `founders` table, never derived from `auth.users.created_at`: the enforcement
  date has already slipped once, and a derived cutoff silently re-grandfathers people.
  `subscriptions` cannot hold the flag — it is webhook-owned and update-only-if-older
  against Stripe event times, so a real event would revert it.
- **Entitlement is source-blind and fails open.** `is_entitled()` hides whether entitlement
  came from a Founder row, Stripe or Patreon, which is what lets a Kickstarter backer's
  "lifetime PRISM membership" and a $3 monthly member be the same thing to every feature.
  When the check itself errors, the user is treated as entitled.
- **The paying population starts at zero.** Lifetime for backers, permanent grandfathering
  for existing accounts, and a signup window closed for the campaign together mean the
  membership's entire addressable population is people who create an account *after*
  enforcement flips. Revenue grows only from cold traffic — which is why the price holds at
  $3 rather than rising to compensate. A higher price against colder traffic converts
  worse, not better.
- **Ten members cover PRISM.** Fully-allocated hosting is ~$25/mo (a third of the shared
  Supabase org, half of Netlify). The figure stays internal and is never published: gallery
  storage rather than sync is the growth driver, so a published number only moves up, and
  one you later exceed reads as a broken promise.
- **A free account is worth having without sync.** Its draw is gallery participation —
  likes, uploads, artist claims — which `js/gallery.js` already requires auth for.
