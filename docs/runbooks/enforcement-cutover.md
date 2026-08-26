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
| Active subscriber | `subscriptions.status` in (`active`, `trialing`) | Yes — see [#190](https://github.com/codwats/prism/issues/190) |
| Free | no row anywhere | n/a |

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

## Before the flip — any order

1. Create `founders` and `is_entitled()`.
2. Add the `is_entitled()` predicate to the INSERT policies on `prisms` and
   `decks`.
3. Ship the client gate and its copy.

Step 3 must land **before** the flip whatever else happens. Enforcing in the
database while the UI still offers the button gives users a raw PostgREST error
and no explanation.

Steps 1 and 2 are safe to deploy days early: `is_entitled()` returns true for
everyone while the flag is false.

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

   This is the first time the enforcement branch has ever executed. While the
   flag was false the predicate short-circuited true for everybody, so the dark
   deploy proved only that nothing broke — never that the gate works.

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
