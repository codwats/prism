# Runbook: switching on payment enforcement

Decided in [#186](https://github.com/codwats/prism/issues/186). This is the
procedure for the one-time cutover from "PRISM is free" to "PRISM enforces
membership", executed by hand in the Supabase SQL editor.

`app_config.payment_enforcement` is the last step, not the only step. Flipping
it before the Founder stamp is complete walls every grandfathered account.

## What entitlement means

Three states. A user is entitled if **any** of the first two hold:

| State | Where it lives | Lapses? |
| --- | --- | --- |
| Founder | `founders` row | Never |
| Active subscriber | `subscriptions.status` in (`active`, `trialing`, `past_due`, `unpaid`) | Yes — see [#187](https://github.com/codwats/prism/issues/187) |
| Free | no row anywhere | n/a |

`past_due` and `unpaid` are entitled on purpose. The grace period after a
failed payment is the billing rail's own dunning window — Stripe's Smart
Retries, Patreon's decline retries — rather than a number PRISM invents and has
to keep in sync across two rails. A member is unentitled when the rail gives up
and the subscription reaches `canceled`. Decided in
[#187](https://github.com/codwats/prism/issues/187).

One read answers the question: `is_entitled()`, a STABLE SECURITY DEFINER
function that also folds in the enforcement flag, so it returns true for
everyone while `payment_enforcement` is false. Both the RLS policies and
`js/modules/billing.js` call it. Nothing assembles the answer itself.

## What is gated

INSERT on `prisms` and INSERT on `decks`. Nothing else.

- **Not `deck_cards`.** `replace_deck_cards` (`supabase-schema.sql:181`)
  implements a decklist edit as DELETE + INSERT, so gating INSERT there would
  block editing a deck you already have.
- **Not UPDATE, SELECT or DELETE**, on any table. Existing data stays readable,
  editable and exportable permanently. Paint on sleeves does not come off:
  locking a marked deck's data makes physical cards unreadable with no undo.
- **Not the PRISM count.** A free user's PRISMs live in localStorage, so there
  is nothing server-side to enforce. That gate is client-side and bypassable by
  anyone who opens devtools. Accepted.

## The campaign window

Decided in [#221](https://github.com/codwats/prism/issues/221). The window opens
at campaign go-live (est. 2026-09-15) and ends here, at the flip. Nothing else
records it end to end: [#206](https://github.com/codwats/prism/issues/206) owns
the signup lock and [#222](https://github.com/codwats/prism/issues/222) owns the
site edits, but the two sessions are weeks apart and this file is the only thing
that spans them.

**At campaign go-live:**

1. **Disable signups** in Supabase, Authentication → Sign In / Providers. This is
   the real lock; the UI change alone is cosmetic.
2. **Remove the signup path** from `js/layout.js` — the `#btn-show-signup`
   toggle and the whole `#auth-signup-view` block. Deleted, not hidden: hidden
   markup still ships an `input[type=password]` for a password manager to offer,
   and a `display` toggle is one devtools edit away from a working form. Login,
   password reset and every existing session stay untouched, and `auth.js` is
   not touched at all — its `signUp` path and `showAuthView('signup')` case go
   unreachable and are already null-guarded. This is #206's code half, and it
   ships on the same branch as step 3 rather than in its own session.
3. **Deploy the campaign-window branch.** It is a plain deploy: no flag, and
   `payment_enforcement` cannot drive it, because that row is false both before
   go-live and during the window while the copy differs. Every edit in it carries
   a `CAMPAIGN WINDOW` comment, which is what steps 4 and 5 grep for. Landed in
   #222, on `feature/222-campaign-window`, together with step 2:

   - **The campaign block** on `index.html`, #221's copy verbatim, below How It
     Works and above the features grid. Its CTA href is a
     `KICKSTARTER_URL_TODO` placeholder until the campaign URL exists;
     **fill it in before merging.** It is deliberately not a valid link, so a
     premature deploy fails loudly instead of looking correct. The block ships
     text-only: #221 specifies a flank with a kit-contents photo, and if that
     photo lands it is a follow-up, not a blocker.
   - **Two gallery notices** in `js/gallery.js` — the download gate on the
     artwork detail view and the upload gate on `?view=upload`. Both previously
     promised "a free account", which is not creatable while signups are shut.
     The upload one now names the manual path (#206's accepted collateral):
     ask on Discord and an account is made by hand.

   Swept and deliberately left alone: `index.html`'s own CTAs, which all point
   at `build.html` and need no account; `profile.html`'s logged-out panel and
   `gallery.html`'s guest callout, which say *sign in*, not *sign up*, and stay
   correct for the pre-existing cohort; `build.html`, whose sync affordances are
   already hidden until a user is logged in; and the two places `index.html`
   *describes* accounts rather than asking for one, the Auto-Save feature card
   ("Login to sync across multiple devices") and the data-storage FAQ answer.
   Those two are prose, not a call to action, and they stay true throughout the
   window: accounts exist and still sync, there is just no way to make a new one.

**At campaign close, before the flip:**

4. **Delete the campaign block** from `index.html`, and nothing else yet. Its
   copy asks a visitor to back a live campaign and goes stale the moment funding
   ends, and the close date and the flip date are not the same day. The revert
   is a deletion, not new copy: the page returns to its prior state. Between
   close and the flip, signups are still shut and backers reach their Membership
   through the backer survey
   ([#204](https://github.com/codwats/prism/issues/204)), never through the site.

   **Everything else in the campaign-window branch stays until step 5.** The
   `js/layout.js` signup deletion and the two `js/gallery.js` notices are all
   about signups being *shut*, and signups are still shut during this gap.
   Reverting them here would restore a signup view that reopens the
   grandfathered cohort early, and gallery copy that offers a free account
   nobody can create. `grep -rn "CAMPAIGN WINDOW"` lists all four markers; only
   the `index.html` one is in scope at this step.

**At the flip, this session, after step 6 of the cutover below:**

5. **Re-enable signups** in Supabase, then revert the remaining three
   `CAMPAIGN WINDOW` markers, only after the stamp is verified and
   `payment_enforcement` is true. Reopening any earlier lets new accounts into
   the grandfathered cohort.

   - `js/layout.js` — restore the `#btn-show-signup` toggle and the
     `#auth-signup-view` block from the deletion hunk of the #222 commit. The
     comment left at the deletion site is itself the last thing to remove.
   - `js/gallery.js` — the download and upload gates go back to their prior
     copy. The upload one drops the manual-account-by-Discord path with it,
     since signup is the path again.

6. **Land the membership section** on `index.html`
   ([#215](https://github.com/codwats/prism/issues/215)) and the membership
   drawer ([#216](https://github.com/codwats/prism/issues/216)).

The closed-signup window and the campaign-copy window share a start and do not
share an end: the copy comes out at campaign close, the signup lock at the flip.
That asymmetry is the reason this section exists.

## Before the flip — any order

1. Create `founders` and `is_entitled()`.
2. Add the `is_entitled()` predicate to the INSERT policies on `prisms` and
   `decks`.
3. Ship the client gate and its copy.
4. Rehearse the enforcement branch on production — done 2026-08-30, see below.

Step 3 must land **before** the flip whatever else happens. Enforcing in the
database while the UI still offers the button gives users a raw PostgREST error
and no explanation.

Steps 1 and 2 are safe to deploy days early: `is_entitled()` returns true for
everyone while the flag is false.

### Verifying steps 1 and 2

Run all four as **one statement**. The SQL editor renders only the last
statement's result in a multi-statement block, so four separate `SELECT`s show
you only the fourth. The first two confirm the deploy is dark; the last two
confirm it is reachable by the right role and only that role.

```sql
SELECT is_entitled()                                                       AS entitled,        -- true
       (SELECT value FROM app_config WHERE key = 'payment_enforcement')    AS enforcement,     -- false
       has_function_privilege('authenticated', 'is_entitled()', 'EXECUTE') AS authed_execute,  -- true
       has_function_privilege('anon',          'is_entitled()', 'EXECUTE') AS anon_execute;    -- false
```

**`authed_execute` is not redundant.** The SQL editor runs as the postgres/
service role, so `SELECT is_entitled()` returns true whether or not the grant to
`authenticated` landed. Without that grant every signed-in user's PRISM insert
fails with `permission denied for function is_entitled`, breaking cloud sync for
everyone *while the flag is still false*. `has_function_privilege` is the only
one of the four that catches it.

**`anon_execute` must read false.** The migration revokes EXECUTE from `public`
*and* from `anon`, and both are needed: Supabase's stock setup grants EXECUTE on
public-schema functions to `anon` directly, and `REVOKE ... FROM public` drops
only the `PUBLIC` pseudo-role grant. For a while it did not, and the function
was callable with no `Authorization` header at all — harmless, since `auth.uid()`
is NULL for `anon` so it returned only the flag's inverse, but not what the
schema claimed. Found during the rehearsal, fixed in
[#231](https://github.com/codwats/prism/issues/231).

A green result here proves **nothing broke**. On its own it does not prove the
gate refuses anyone, because while the flag is false the predicate
short-circuits true for everybody.

Applied and verified in [#220](https://github.com/codwats/prism/issues/220).
The gate was then made to actually refuse — see the rehearsal below.

### The rehearsal — done 2026-08-30

The enforcement branch has been executed on production once, deliberately, in a
**99-second window** (16:47:14Z to 16:48:53Z) with the flag flipped back
afterwards and the `false` confirmed by an explicit read. Run in
[#225](https://github.com/codwats/prism/issues/225).

Why it was safe: the Founder stamp (cutover step 1) was run **first**, so every
account then in existence was already entitled and nothing changed for any real
user. Only an account created inside the window could have been refused, and
that failure mode is a refused sync write that retries — `savePrismToSupabase`
returns `false`, the baseline is not recorded, and the next debounced save
succeeds.

Sixteen observations, all matching. What was established:

| Actor | `is_entitled()` | INSERT `prisms` | INSERT `decks` |
| --- | --- | --- | --- |
| No `founders` row, no subscription | false | refused | refused |
| `founders` row | true | allowed | — |
| `subscriptions.status = 'past_due'` | true | allowed | — |
| `subscriptions.status = 'canceled'` | false | refused | — |

And, for the unentitled account against a PRISM it already owned: `SELECT` the
PRISM, `SELECT` its decks, and `UPDATE` the PRISM all returned 200 while both
INSERTs were refused. **Gate adding, never access** was observed holding, not
assumed.

Two details that made the result mean something, worth repeating if it is ever
re-run:

- **A baseline first.** Both actors were probed with enforcement still off and
  had to come back entitled and allowed, through the same harness that would
  later judge the refusal. Without it a broken probe and a working gate produce
  identical output.
- **The throwaway had to be un-stamped, and the deletion verified by `SELECT`.**
  It was created before the stamp, so step 1 made it a Founder. Left in place it
  stays entitled, nothing is refused, and the whole rehearsal passes green for
  the wrong reason.

Observation ran against PostgREST with real access tokens, not the SQL editor:
with enforcement on, `SELECT is_entitled()` in the editor returns **false**
regardless of who is entitled, because `auth.uid()` is NULL there. The editor
cannot observe any row of that table.

## The cutover — in order

1. **Stamp.** Every row in `auth.users`, no predicate. Idempotent.

   ```sql
   INSERT INTO founders (user_id)
   SELECT id FROM auth.users
   ON CONFLICT (user_id) DO NOTHING;
   ```

2. **Verify the stamp.**

   ```sql
   SELECT (SELECT count(*) FROM auth.users) AS users,
          (SELECT count(*) FROM founders)   AS founders;
   ```

   The two numbers must be equal. Stop if they are not.

3. **Prepare the test account.** Sign up a throwaway, then delete its `founders`
   row so it is genuinely unentitled. Keep a normal stamped account signed in
   elsewhere.

4. **Re-run step 1.** Anyone who signed up during steps 1–3 is owed a
   grandfather; the promise is every account existing *at enforcement*, not at
   the stamp. Re-running closes the window to seconds.

5. **Flip.**

   ```sql
   UPDATE app_config SET value = 'true'::jsonb WHERE key = 'payment_enforcement';
   ```

6. **Verify both directions**, immediately, with the two accounts from step 3:

   - Unstamped account: creating a PRISM is refused.
   - Stamped account: creating a PRISM succeeds.
   - Both accounts: existing PRISMs still open, edit and export.

   The enforcement branch has been exercised once already, in the rehearsal
   above: it refused an unentitled account both a new PRISM and a new deck,
   allowed a Founder and a `past_due` subscriber, refused a `canceled` one, and
   left an existing PRISM readable, editable and exportable throughout. So this
   is confirmation on the real population, not a first run — but it is still the
   step to slow down on, because the rehearsal ran with every account stamped
   and this one runs against whoever is signed in.

## Rollback

```sql
UPDATE app_config SET value = 'false'::jsonb WHERE key = 'payment_enforcement';
```

Immediate, global, no deploy. The verification lever and the rollback lever are
the same row, which is why step 6 is safe to run on production.

`isPaymentEnforced()` caches its answer in `enforcementCache` for the lifetime
of a page, so open tabs keep the old value until reload. That direction fails
open, so it delays relief rather than causing harm.

## Known consequence

The Founder flag cannot distinguish a Kickstarter backer from an account
created in 2025 that never made a deck. The stamp is deliberately unfiltered,
and telling the two apart would need a second entitlement source — the cost
[#197](https://github.com/codwats/prism/issues/197) priced and refused. Any
badge or copy addressed to Founders is addressed to both.
