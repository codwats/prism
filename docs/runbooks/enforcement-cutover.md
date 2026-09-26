# Runbook: switching on payment enforcement

Decided in [#186](https://github.com/codwats/prism/issues/186). This is the
procedure for the one-time cutover from "PRISM is free" to "PRISM enforces
membership", executed by hand in the Supabase SQL editor.

`app_config.payment_enforcement` is the last step, not the only step. Flipping
it before the Founder stamp is complete walls every Founder.

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
with the site changeover, a few days before the Kickstarter pre-launch page
goes up, and ends when signups reopen (#206). Nothing else records it end to end: [#206](https://github.com/codwats/prism/issues/206) owns
the signup lock and [#222](https://github.com/codwats/prism/issues/222) owns the
site edits, but the two sessions are weeks apart and this file is the only thing
that spans them.

### Schedule (updated 2026-09-25)

**Enforcement was flipped on 2026-09-25, ahead of the campaign**
([#268](https://github.com/codwats/prism/issues/268)). It no longer waits for
campaign close: signups were already shut and the pre-flight count of accounts
without a Founder row was `0`, so the cohort was final and nothing was gained by
holding the flag. The campaign-window steps below still run on the campaign's
dates. The backer survey and allowlist (#240) grant Membership after the flip
just as well as before it. Signups reopen after the campaign concludes, in late
November ([#206](https://github.com/codwats/prism/issues/206)). With enforcement
on, a new account is a free account, not a Founder, so the lock no longer
protects the cohort, but the #240 claim RPC must be deployed first.

**The campaign moved to November.** The previous schedule (site changeover
Sunday 2026-09-13, pre-launch Monday the 14th, funding launch Monday the 21st)
was not executed and no longer holds. Two other TCG-adjacent Kickstarters
called Prism are live right now — a self-published card game and an all-in-one
scanning system for card shops — and Jay's other obligations pushed prep back.
Launching in November clears both of those projects, lands inside holiday
impulse buying, and buys prep time; it accepts up front that backers will not
receive the kit before Christmas. Fulfilment moves with the campaign, from
shortly after a November wrap to a **January** target.

The month is settled; the dates are not. The team has not met on this yet, and
the reasoning above is Jay's rather than a team decision. Treat every entry
below as a placeholder until that conversation happens.

- **Pending, expected 2026-09-18:** the bank's letter to Stripe, and Stripe's
  confirmation back. No launch date is real before this lands.
- **November, date not set:** Kickstarter pre-launch page opens.
- **The Sunday evening before it:** deploy the site changeover and close
  signups, so the destination can be verified before Monday's public traffic.
- **Roughly a week after pre-launch:** funding launch. No site deploy: the
  campaign block reads correctly in both phases and the pre-launch URL becomes
  the live one. See below.
- **Late November, date not set:** campaign close. Then the backer survey, the
  allowlist load, and reopening signups (step 6 below, after the #240 claim RPC
  is deployed). The flip is done (2026-09-25).
- **January:** fulfilment target.

Fill in the exact dates once the team has met. An approximate month in this
file is fine; a stale exact date is not.

[Draft PR #236](https://github.com/codwats/prism/pull/236) already prepares
#222 and #206. It no longer waits on the Kickstarter URL: the CTA ships
`disabled`, labelled "Coming soon", so the block can go up before the
pre-launch page exists. Enable it by deleting `disabled`, adding
`href="<pre-launch URL>" target="_blank" rel="noopener"`, and changing the
label back to "See it on Kickstarter" — that is the pre-launch URL, not the
live campaign one. Verify
the destination works on the Sunday evening, before Monday's public pre-launch.
Complete the anonymous build/import/mark/export walkthrough on the deploy
preview. The kit photo can follow later.

**There is no copy swap at funding launch.** #221 wrote the block for a live
campaign, and the schedule since put pre-launch a week ahead of funding. Rather
than carry two versions of the copy and a second deploy to switch them, the
block is phase-agnostic: heading "The Kickstarter Campaign", CTA "See it on
Kickstarter", and #221's paragraph with its opening verb changed from "is on
Kickstarter" to "The Kickstarter campaign brings", since the block now deploys
before the page exists. It points at the page instead of naming an action only
one phase allows, and it states what the campaign contains instead of asserting
it is live, so it reads correctly before pre-launch, while the page collects
follows, and after it starts taking pledges. A pre-launch page keeps its slug
when it launches, so the single URL needs no second edit either. Those three
deviations from #221's verbatim copy are deliberate and noted at the block in
`index.html`.

Payment enforcement is already on (2026-09-25); the changeover does not touch it.

**At the site changeover:**

1. **Disable signups** in Supabase, Authentication → Sign In / Providers. This is
   the real lock; the UI change alone is cosmetic.
2. **Remove the signup path** from `js/layout.js` — the `#btn-show-signup`
   toggle and the whole `#auth-signup-view` block, deleted, not hidden: hidden
   markup still ships an `input[type=password]` for a password manager to offer,
   and a `display` toggle is one devtools edit away from a working form. In
   their place, one caption line in the login view: *New account signup is
   currently closed.* A caption rather than a disabled button, because someone
   who opened this dialog is asking where signup went, and a greyed-out button
   answers that on hover only, which is nowhere on touch. It points nowhere yet;
   the campaign and the manual account path are a later edit. Login,
   password reset and every existing session stay untouched, and `auth.js` is
   not touched at all — its `signUp` path and `showAuthView('signup')` case go
   unreachable and are already null-guarded. This is #206's code half, and it
   ships on the same branch as step 3 rather than in its own session.
3. **Deploy the campaign-window branch.** It is a plain deploy: no flag, and
   `payment_enforcement` cannot drive it, because that row is false both before
   go-live and during the window while the copy differs. Every edit in it carries
   a `CAMPAIGN WINDOW` comment, which is what steps 4 and 5 grep for. Landed in
   #222, on `feature/222-campaign-window`, together with step 2:

   - **The campaign block** on `index.html`, below How It Works and above the
     features grid, carrying #221's paragraph under a phase-agnostic heading and
     CTA, its opening verb changed so the block reads correctly before the
     campaign page exists. Its button ships `disabled` and labelled "Coming soon"
     until the pre-launch URL exists, so the block can deploy ahead of the
     campaign page; see the `TODO(#222)` at the block for the change that turns
     it into a link. Disabled rather than a placeholder href: a dead link that
     looks live is worse than a button that says it is not ready, and the label
     carries the status because a tooltip on a disabled button is hover-only.
     The block ships text-only: #221 specifies a flank with a kit-contents photo, and if that
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

**At campaign close:**

4. **Delete the campaign block** from `index.html`, and nothing else yet. Its
   copy asks a visitor to back a live campaign and goes stale the moment funding
   ends, and signups do not reopen the same day. The revert
   is a deletion, not new copy: the page returns to its prior state. Until
   signups reopen (#206), backers reach their Membership
   through the backer survey
   ([#204](https://github.com/codwats/prism/issues/204)), never through the site.
5. **Collect and load the backer allowlist**
   ([#240](https://github.com/codwats/prism/issues/240)). The Pledge Manager
   survey must carry the PRISM account email as its own field (#204), labelled
   to work for a backer who has **no** PRISM account — signups are shut for the
   whole window, so most backers cannot have one when they answer. Verify the
   field exists before the survey is distributed; #204 is closed on Jay's
   commitment to add it, not on the field having been seen. Then load the
   collected emails into the allowlist. Pledge Over Time is disabled on the
   campaign, so there is no instalment lag and the answers are complete at
   close.

   **Never distribute the plain Kickstarter Backer Survey.** Doing so forecloses
   the Pledge Manager permanently: a creator may revert from Pledge Manager to
   survey-only before the survey launches, never the reverse.

   **Everything else in the campaign-window branch stays until step 6.** The
   `js/layout.js` signup deletion and the two `js/gallery.js` notices are all
   about signups being *shut*, and signups are still shut during this gap.
   Reverting them here would restore a signup view that widens the Founder
   cohort early, and gallery copy that offers a free account
   nobody can create. `grep -rn "CAMPAIGN WINDOW"` lists all four markers; only
   the `index.html` one is in scope at this step.

**When signups reopen ([#206](https://github.com/codwats/prism/issues/206)):**

6. **Re-enable signups** in Supabase, then revert the remaining three
   `CAMPAIGN WINDOW` markers. The flip (2026-09-25) already made this safe for
   the Founder cohort: a new account is now a free account. When to do it is
   #206's call, no longer this runbook's. #240's claim RPC must be deployed **before** this
   step — reopening signups is exactly when the first backer account gets
   created, and without the claim path that account is refused.

   - `js/layout.js` — restore the `#btn-show-signup` toggle and the
     `#auth-signup-view` block from the deletion hunk of the #222 commit, and
     delete the signup-disabled caption that stood in for them. The comment left
     at the deletion site is itself the last thing to remove.
   - `js/gallery.js` — the download and upload gates go back to their prior
     copy. The upload one drops the manual-account-by-Discord path with it,
     since signup is the path again.

7. **Land the membership section** on `index.html`
   ([#215](https://github.com/codwats/prism/issues/215)) and the membership
   drawer ([#216](https://github.com/codwats/prism/issues/216)).

The closed-signup window and the campaign-copy window share a start and do not
share an end: the copy comes out at campaign close, the signup lock when signups reopen.
That asymmetry is the reason this section exists.

### Backer claim deployment and ingestion (#240)

Before reopening signups, apply the **Backer Membership claims (#240)** migration
at the end of `supabase-schema.sql`, then deploy the auth client. It claims on
session restore and signed-in auth transitions before notifying listeners or
starting sign-in sync, and clears the entitlement cache afterwards. A failed
claim logs an error and permits login/local use; the next auth event or page
load retries. Deploying the schema first avoids those errors during rollout.

The RPC uses the account's confirmed email from `auth.users`, never an email
supplied by the browser. An entry grants an ordinary `founders` row once;
`is_entitled()` is unchanged. Already-stamped Founders can consume their entry
without changing their Membership. A consumed entry stays consumed even if its
claimant later deletes their account.

After campaign close, take the PRISM-email column from
Jay's survey CSV. In the SQL editor, paste the addresses as SQL text values
(double any single quote inside an address), replacing the example values below.
Do not paste CSV syntax directly into SQL or commit actual survey emails.

```sql
INSERT INTO public.backer_allowlist (email)
SELECT DISTINCT lower(btrim(email))
FROM (VALUES
  ('backer-one@example.com'),
  ('backer-two@example.com')
) AS survey(email)
WHERE NULLIF(btrim(email), '') IS NOT NULL
ON CONFLICT (email) DO NOTHING;

SELECT count(*) AS total,
       count(*) FILTER (WHERE claimed_at IS NULL) AS unclaimed,
       count(*) FILTER (WHERE claimed_at IS NOT NULL) AS claimed
FROM public.backer_allowlist;
```

Reconcile the total with the CSV's distinct, nonblank, trimmed, lowercased
addresses. Re-importing is safe and does not reset claims. Do not remove Gmail
dots or `+` suffixes: a different signup/survey address remains the manual
support path, granting the verified account a `founders` row.

**Verification:** `tests/backer-claim.test.js` covers auth with mocked Supabase
responses. Run `tests/backer-claim.sql` as one submission in a **disposable
Supabase project**, after the schema; it checks claims, confirmed-email gating,
repeat calls, Founder overlap, consumed-email reuse and permissions, then rolls
back its fixtures. This SQL script has not yet been executed against a database.
It must pass there before production deployment. Apply the claim migration
twice there as well to check its idempotence. Never use production for this test.

On production after deployment, this read-only check must return true, false,
true, zero respectively:

```sql
SELECT has_function_privilege('authenticated', 'public.claim_backer_membership()', 'EXECUTE') AS authenticated_execute,
       has_function_privilege('anon', 'public.claim_backer_membership()', 'EXECUTE') AS anon_execute,
       (SELECT relrowsecurity FROM pg_class WHERE oid = 'public.backer_allowlist'::regclass) AS rls_enabled,
       (SELECT count(*) FROM pg_policies WHERE schemaname = 'public' AND tablename = 'backer_allowlist') AS policies;
```

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

### The stamp — re-run 2026-09-20

Re-run unfiltered after the count query came back 20 users / 10 Founders: ten
accounts had been created since the rehearsal stamp and were not yet stamped.
The unstamped rows were read before the insert and all looked like real
accounts. The verify query then read 20 / 20.

This does **not** finish the stamp. Signups were still open when it ran, so
anyone who joins before the lock is unstamped and cutover step 1 below still runs
as written. What it buys is that the cohort as of this date is safe if the flip
arrives sooner than planned.

**The announced cutoff and the stamp do not match, deliberately.** Discord was
told to sign up by 2026-09-05 to be included, and the changeover then slipped on
our end. One account created on the 8th, with a real PRISM, was stamped rather
than excluded. The stamp takes no date predicate and is not going to grow one:
`CONTEXT.md` defines a Founder as every account that existed when enforcement was
switched on, the announcement was the more restrictive of the two, and nobody is
worse off for the difference. If it comes up, every account that existed is in.

**It also re-entitled the rehearsal throwaway**, whose `founders` row was deleted
in #225 precisely so something could be refused. Any later rehearsal or flip
verification needs a genuinely unentitled account again, and once signups are
locked the UI cannot make one. Create it from Authentication → Users → Add user
in the Supabase dashboard, then delete its `founders` row.

## The cutover — in order

The flip (step 5) ran 2026-09-25
([#268](https://github.com/codwats/prism/issues/268)) after a pre-flight count of
`0` accounts without a Founder row, and step 6's checks passed for a Founder, a
non-Founder test account and a signed-out visitor.
Kept as the record of how, and for a rollback-and-reflip.

1. **Stamp.** Every row in `auth.users`, no predicate. Idempotent, and run
   twice already (before the 2026-08-30 rehearsal, and again on 2026-09-20).
   It still runs here, after the signup lock, because that is the first moment
   the cohort is final.

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

3. **Re-run step 1.** Anyone who signed up during steps 1 and 2 is owed a
   Founder row; the promise is every account existing *at enforcement*, not at
   the stamp. Re-running closes the window to seconds.

4. **Prepare the test account, after the re-stamp and never before.** Delete its
   `founders` row, then `SELECT` that row back and confirm it is gone. Keep a
   normal stamped account signed in elsewhere.

   **The order is the whole point.** Step 3 stamps every row in `auth.users` with
   no predicate, so it re-creates the row for any account un-stamped before it
   ran. A deletion made earlier is silently undone, every account is entitled at
   the flip, nothing is refused, and step 6 passes whether the gate works or not.
   This is the failure the 2026-08-30 rehearsal had to design around.

   Do not sign up a throwaway here: signups are shut from the site changeover
   until they reopen (step 6 of the campaign-window list above),
   so the site cannot make one. Use the rehearsal throwaway, which
   already exists and has been re-stamped since, or create an account from
   Authentication → Users → Add user in the Supabase dashboard, which works with
   signups disabled.

5. **Flip.**

   ```sql
   UPDATE app_config SET value = 'true'::jsonb WHERE key = 'payment_enforcement';
   ```

6. **Verify both directions**, immediately, with the two accounts from step 4:

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

## Stripe environment (#253)

Production's Stripe keys are the **business account's live keys**, set in
Netlify's Production deploy context only. Deploy previews carry none, so a
preview can never start a live checkout. Run `scripts/setup-stripe-netlify.sh`
to set or rotate them. It opens each dashboard page, says what to copy, and
probes the webhook at the end.

| Variable | Source | Secret |
| --- | --- | --- |
| `STRIPE_SECRET_KEY` | Stripe → API keys, `sk_live_…` | yes |
| `STRIPE_WEBHOOK_SECRET` | Stripe → Webhooks → the prismmtg.com destination, `whsec_…` | yes |
| `STRIPE_PRICE_ID` | Monthly $3 price, `price_…` | no |
| `STRIPE_ANNUAL_PRICE_ID` | Yearly $30 price, `price_…` (optional) | no |
| `STRIPE_PORTAL_CONFIGURATION_ID` | Only when pinning a non-default portal, `bpc_…` | no |
| `SUPABASE_URL` | `https://clqxysoimlsjfmnjbxsa.supabase.co` | no |
| `SUPABASE_SERVICE_ROLE_KEY` | Supabase → API keys → Legacy → `service_role` | yes |

The webhook destination sends exactly `checkout.session.completed`,
`customer.subscription.updated`, `customer.subscription.deleted` and
`invoice.payment_failed`, as snapshot payloads, to
`https://prismmtg.com/api/stripe-webhook`.

Environment variables reach edge functions only after a new deploy, and only
with the Functions scope. An unsigned `POST` to the webhook is the quick check:
`400 Invalid signature` means all four of its variables are present, and
`500 Not configured` means at least one is missing. The Edge Functions log
names the missing ones. A green probe does not prove the keys belong together.
The round trip does: a real $3 checkout on a throwaway account, then a
`subscriptions` row reading `active`, then cancel and refund. While enforcement
is off every signed-in account is entitled and the drawer shows no Join button,
so start checkout from the console:
`(await import('/js/modules/billing.js')).startCheckout()`. It must pass before
the site changeover (PR #236).

## Membership drawer readiness (#216)

The shared drawer is on `build.html` and `profile.html`. The landing-page handoff
is `build.html#membership`. Entry points and automatic creation notices stay
hidden until `payment_enforcement` is true; `PRISM_DEBUG` exposes them locally
for rehearsal without changing entitlement. A Founder rehearsal still uses the
real `is_entitled()` answer and must show no price or checkout controls.

Before enabling Membership:

- Configure `STRIPE_PRICE_ID` (monthly) and `STRIPE_ANNUAL_PRICE_ID` (yearly)
  in Netlify. The drawer offers a Billing choice, monthly by default, and passes
  it to checkout as `period` (#257). If the yearly price is unset the endpoint
  answers 503, the drawer shows its message, and monthly stays usable.
- Rehearse a yearly checkout end to end: `subscriptions.price_id` must be the
  yearly price. Then cancel and refund it, and repeat the portal checklist below
  for the yearly member.
- Patreon is statically unavailable in this drawer: the "On Patreon" option is
  always disabled and captioned "not available yet". Nothing here reads an
  `app_config` Patreon URL. Wiring a real Patreon destination in is #208's job
  (account-linking and entitlement), once that flow exists to make the link
  meaningful.
- Rehearse anonymous, free, Member and Founder states. A manual open shows
  general Membership information; only a successful explicit New PRISM action
  may show the new PRISM's device notice. Reloading must not repeat it. Local
  creation, editing and exports work whether the drawer is closed or billing
  services are unavailable.

This UI does not flip enforcement, configure Stripe products, or implement
Patreon linking. Those deployment steps remain separate from the drawer change.

## Cancellation readiness (#218)

The profile Membership section's **Manage Billing** button (accounts with a
Stripe subscription row only) uses the existing authenticated
`/api/stripe-portal` endpoint, which looks up the caller's Stripe customer on
the server. The hosted portal handles confirmation and cancellation. Discoverability
comes from the active-member caption stating it directly — "Manage Billing also
lets you cancel your membership" — rather than from the button label itself,
since the same label also renders in the past-due caption ("Use Manage Billing
to update your card"), where foregrounding cancellation reads as confusing. Patreon
owns its own cancellation flow; a Founder without a Stripe subscription has no
Stripe billing control and never sees the cancel mention.

### Save offer decision

**Omit the optional save offer**, using the fallback explicitly accepted in
[#218](https://github.com/codwats/prism/issues/218). Stripe's documented
[cancellation retention](https://docs.stripe.com/customer-management/cancellation-page)
offers a coupon on the existing subscription; it does not document a combined
monthly-to-annual switch within that retention flow. The
[portal flow documentation](https://docs.stripe.com/customer-management/portal-deep-links)
does support a price change plus coupon through `subscription_update_confirm`,
so Stripe can host the payment confirmation. PRISM would still need its own
eligible-offer screen ahead of that handoff; the native cancellation coupon
alone would discount the same billing period, which PRODUCT.md forbids.

A custom offer would need server-side continuous-membership eligibility,
durable once-per-account redemption across cancellation and rejoining, and an
annual-switch payment flow with explicit first-year and renewal pricing. That
is disproportionate for this optional $3 saving. Do not configure a substitute
coupon, pause offer, or extra decline screen. PRODUCT.md's permission and
price-lock carve-out remain policy for any future implementation, not a claim
that the offer is live.

### Portal configuration and rehearsal

Before enabling paid Membership, in the Stripe account used by Netlify:

1. Open **Settings → Billing → Customer portal**. Configure the portal selected
   by `STRIPE_PORTAL_CONFIGURATION_ID`, or the default configuration if unset.
2. Enable cancellation **at the end of the paid billing period**. Leave retention
   coupons off. Keep payment-method updates available. Repeat configuration in
   live mode before launch; test-mode settings do not establish live readiness.
3. With a test monthly member, open profile → **Manage Billing / Cancel
   Membership**. Verify the portal offers cancellation without a retention offer,
   confirms the paid-through date, and returns to `/profile.html`.
4. Cancel in the test portal. Verify Stripe schedules cancellation at period end,
   access remains until then, and the final webhook moves the subscription to
   `canceled`. After lapse, verify the existing dated paused-sync notice and
   continued read/export access. Repeat with a yearly member (#257).
5. Verify an account without a Stripe subscription sees no portal control, and
   portal errors leave the button usable for retry.

These are deployment checks, not evidence of a live rehearsal. The profile
labels `current_period_end` as "Membership ends" when `cancel_at_period_end` is
true and "Renews" otherwise, and drops the cancel hint in that state (#252).
That migration carries its own deploy-ordering warning in `supabase-schema.sql`,
where it is read at merge time rather than here at flip time: apply the schema
before the mapper deploys, never after.

One part of it does belong here. Rows written before the migration read false,
so a member who scheduled cancellation earlier keeps reading "Renews" until
their next subscription webhook. Reconcile the flag from the live Stripe
subscription before relying on the caption. The portal remains authoritative
for the scheduled end date.
