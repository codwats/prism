# Coding standards

Read at review time. Mechanical rules are enforced by `npm run lint` (eslint.config.js) and `tests/schema-rules.test.js`; this file holds the judgement calls those can't check. CLAUDE.md and CONTEXT.md are standards sources too.

## Reuse before copying

- A second dialog, REST read or form that repeats an existing one line for line shares a helper with it. Known homes: `confirmDeleteArtwork` (confirm-then-delete dialog), `REST_HEADERS`/`restGet` in gallery.js (anon PostgREST reads; move to `supabase-client.js` when a second page needs them), `artworkFieldsHtml`/`wireCardAutocomplete`/`readArtworkFields` (artwork form).
- A function whose job grows renames with it, so its name and doc comment still describe it.

## Schema changes

- **Rollout is schema-first.** A changed RPC signature keeps the old overload until the client that calls the new one is live, and the PR body says which SQL to run before merging.
- **Every server-enforced rule lives on the server.** A check the client makes (https-only URLs, ownership) also lives in the RPC or policy; the client copy is for the error message only.
- **Owner edits go through a SECURITY DEFINER RPC**, never an owner-UPDATE policy: WITH CHECK can't compare OLD with NEW.
- **New SQL behaviour gets a case in `tests/*.sql`**, including the failure path a `WARNING`/`EXCEPTION WHEN OTHERS` handler claims to survive.

## Edge functions

- **Claim before you send.** A once-only side effect (email, ledger) inserts its dedupe row first and sends only if the row came back; it never reads, then sends, then writes.
- **Responses never echo an address or secret** the caller didn't send.
- **Every outcome the UI names has a path that works.** A message telling the admin to retry or resend must lead to an action that can succeed.

## Copy

Reader-facing strings use CONTEXT.md's terms (Membership, Member, artist page, Attribution); code names keep theirs.
