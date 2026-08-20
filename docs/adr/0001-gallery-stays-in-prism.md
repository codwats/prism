# The gallery stays in PRISM's Supabase project

The community gallery is welded to identity, not to PRISM's deck-marking domain: four
foreign keys to `auth.users`, ~15 RLS policies built on `auth.uid()` / `is_gallery_admin()`,
and a Storage bucket whose paths are `<auth.uid()>/<uuid>.<ext>`. It is not a separate
domain — it is *PRISM accounts, plus artwork*. So it stays where the accounts are, and
[defcat-website](https://github.com/codwats/defcat-website) renders it read-only:
approved artworks and artists over plain PostgREST with the anon key, a teaser strip of
the latest three highlights, and every action that needs an account linking back to PRISM.

## Considered options

1. **A third Supabase project for the gallery** — rejected. A third project means a third
   `auth.users`, so every FK and policy above loses the identity it points at, uploaders
   need a third account, and cross-project JWT verification becomes a permanent tax paid
   to make a diagram tidier.
2. **Move the gallery to defcat's project** — rejected for the mirror image of the same
   reason, and it would strand PRISM's uploaders.
3. **Merge the two projects into one auth realm** — rejected. defcat's project has ~22
   user-scoped tables (`profiles`, `decks`, `deck_submissions`, `user_credits`, …) all
   FK'd to its own `auth.users`; PRISM's has `prisms`, `deck_cards`, `subscriptions`,
   `stripe_customers`, and the gallery. "One auth realm" is therefore a database merger
   in whichever direction, with a cutover that kills every live session — the most
   expensive and least reversible option on the table.

Options 1–3 were all priced against a requirement that evaporated: defcat needs no
authenticated gallery actions of its own. It shows the art and links across.

## Consequences

- **defcat's Patreon login is untouched.** Worth knowing, because it looks like an
  obstacle and is not: `src/app/auth/patreon-callback/route.ts` is a hand-rolled OAuth
  exchange that calls `admin.createUser` and mints a *Supabase* session. Patreon is the
  identity source; Supabase Auth is already the realm. Nothing about it conflicts with
  PRISM's email/password — the two simply never meet.
- **Neither site gains the other's login method.** A PRISM user cannot sign in to defcat,
  and a patron gets no PRISM account from their Patreon. If a patron ever complains about
  signing up twice, the cheap fix is bridging — defcat's callback runs a second time
  against PRISM's project, same email, ~1 file — not a merger.
- **One moderation queue, in PRISM.** Uploads, artist profiles, claims, and approvals
  happen in one place. This is the main thing option 3 would have bought and the main
  cost of building gallery writes on defcat.
- **defcat's reads need no CORS work.** A public Storage bucket and anon PostgREST are
  cross-origin by default.
