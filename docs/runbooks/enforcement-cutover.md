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
with the site changeover on **Sunday evening, 2026-09-13
(America/Vancouver)** and ends here, at the flip. Nothing else
records it end to end: [#206](https://github.com/codwats/prism/issues/206) owns
the signup lock and [#222](https://github.com/codwats/prism/issues/222) owns the
site edits, but the two sessions are weeks apart and this file is the only thing
that spans them.

### Schedule (updated 2026-09-10)

- **Sunday evening, September 13:** deploy the site changeover and close
  signups ahead of pre-launch traffic. Exact time is not yet set.
- **Monday, September 14:** the Kickstarter pre-launch page opens.
- **Monday, September 21:** planned Kickstarter funding launch, one week later.
  Update the site's pre-launch copy and CTA to the live campaign wording.

[Draft PR #236](https://github.com/codwats/prism/pull/236) already prepares
#222 and #206. Before the September 13 changeover, replace its campaign URL
placeholder, complete the anonymous build/import/mark/export walkthrough on
the deploy preview, and adapt the campaign block for pre-launch: it must not
say the campaign is live or invite visitors to back it before funding opens.
Verify the destination works on Sunday evening, before Monday's public
pre-launch. At funding launch, switch to #221's settled live-campaign copy.
The kit photo can follow later.

Payment enforcement stays off during this changeover; the Founder stamp and
enforcement flip remain after campaign close.

**At the September 13 site changeover:**

1. **Disable signups** in Supabase, Authentication → Sign In / Providers. This is
   the real lock; the UI change alone is cosmetic.
2. **Hide the signup path** in `js/layout.js` — the `#btn-show-signup` button and
   the `#auth-signup-view` block. Login, password reset and every existing
   session stay untouched.
3. **Add the campaign block** to `index.html`, using pre-launch copy until
   September 21, below How It Works and above the features grid. It is a plain deploy: no flag, and
   `payment_enforcement` cannot drive it, because that row is false both before
   go-live and during the window while the copy differs.

**At campaign close, before the flip:**

4. **Delete the campaign block** from `index.html`. Its copy asks a visitor to
   back a live campaign and goes stale the moment funding ends, and the close
   date and the flip date are not the same day. The revert is a deletion rather
   than new copy: the page returns to its prior state. Between close and the
   flip, signups are still shut and backers reach their Membership through the
   backer survey ([#204](https://github.com/codwats/prism/issues/204)), never
   through the site.
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

**At the flip, this session, after step 6 of the cutover below:**

6. **Re-enable signups** in Supabase and restore the `layout.js` signup view,
   only after the stamp is verified and `payment_enforcement` is true. Reopening
   any earlier lets new accounts into the grandfathered cohort. #240's claim RPC
   must be deployed **before** this step — reopening signups is exactly when the
   first backer account gets created, and without the claim path that account is
   refused.
7. **Land the membership section** on `index.html`
   ([#215](https://github.com/codwats/prism/issues/215)) and the membership
   drawer ([#216](https://github.com/codwats/prism/issues/216)).

The closed-signup window and the campaign-copy window share a start and do not
share an end: the copy comes out at campaign close, the signup lock at the flip.
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

After campaign close and before the flip, take the PRISM-email column from
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

## Membership drawer readiness (#216)

The shared drawer is on `build.html` and `profile.html`. The landing-page handoff
is `build.html#membership`. Entry points and automatic creation notices stay
hidden until `payment_enforcement` is true; `PRISM_DEBUG` exposes them locally
for rehearsal without changing entitlement. A Founder rehearsal still uses the
real `is_entitled()` answer and must show no price or checkout controls.

Before enabling Membership:

- Configure `STRIPE_PRICE_ID` for the monthly price in Netlify. Annual billing
  (a `period` selector, `STRIPE_ANNUAL_PRICE_ID`) is deliberately not part of
  this drawer — it lives on `feature/216-annual-billing`, a follow-up split out
  of the #216 review, and lands separately.
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

The profile Membership section exposes **Manage Billing / Cancel Membership**
for accounts with a Stripe subscription row. It uses the existing authenticated
`/api/stripe-portal` endpoint, which looks up the caller's Stripe customer on the
server. The hosted portal handles confirmation and cancellation. Patreon owns
its own cancellation flow; a Founder without a Stripe subscription has no
Stripe billing control.

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
is disproportionate for this optional $3 saving, especially while annual billing
is still a separate delivery. Do not configure a substitute coupon, pause offer,
or extra decline screen. PRODUCT.md's permission and price-lock carve-out remain
policy for any future implementation, not a claim that the offer is live.

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
   continued read/export access. Repeat for annual billing when it lands.
5. Verify an account without a Stripe subscription sees no portal control, and
   portal errors leave the button usable for retry.

These are deployment checks, not evidence of a live rehearsal. The profile
currently labels `current_period_end` as a renewal while Stripe remains active,
even after cancellation is scheduled; the portal is authoritative for the
scheduled end date. A persisted scheduled-cancellation caption is separate work.
