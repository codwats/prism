# Extras are gated in the browser, not at the edge

Extras pages (today `mpc-stripes.html`) check `isEntitled()` on load and show non-Members a short pitch that opens the Membership drawer in place of the tool. The page and its JavaScript stay publicly served, so anyone who reads the source can still run the tool. We accept that. An Extra is a modest perk, not what people pay for ("Extras is not the sell"), and the rest of the system already makes the same trade: gallery downloads are gated in the UI, and entitlement reads fail open.

## Considered options

- **Edge-function gate on the page and its JS.** Rejected. The Supabase session lives in localStorage, so an edge function never sees it on a plain navigation. Gating at the edge would need a session cookie mirrored on every auth change and JWT verification at the edge. That is new auth plumbing to protect a tool that already runs entirely in the browser.
- **Gate on any signed-in account.** Rejected. Extras are part of Membership, and a free account is not a Member. Until enforcement is flipped, `is_entitled()` returns true for every signed-in account, so the two options behave the same today.
