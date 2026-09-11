# Paywall UI patterns

Research for [Decide PRISM's membership paywall policy](https://github.com/codwats/prism/issues/172), conducted 2026-08-29. Source: Mobbin, web platform only, 39 screens and website sections across six queries.

A visual dossier with every screen embedded is published as an artifact: <https://claude.ai/code/artifact/465ee181-9fac-4b41-857a-3e1853b22070>. This note is the referenceable record; the dossier is the same material with the pictures.

A self-contained copy of the dossier sits at `docs/research/paywall-dossier.html` — open it directly in a browser, no server needed. It is **gitignored on purpose**: it embeds 39 Mobbin captures as base64, and `publish = "."` would otherwise serve them from the live site. Expect it to be absent on a fresh clone.

## Conclusion

**The corpus argues against a modal wall, against building any billing screen, and for a dated, reversible lapse panel. It also settles the register question: the closest comparable to PRISM in the whole set is an indie book tracker charging $6.**

- **A wall is the wrong shape for this product.** PRISM is localStorage-first, so the free tier is a complete working tool rather than a demo, and a modal that blocks the app would misrepresent what the app is. The fitting pattern is TIDAL's — everything visible and working, one dimension reduced. `CONTEXT.md` already specifies this in prose under **Paused sync**; it needs drawing, not deciding. See [§1](#1-a-wall-is-the-wrong-shape).
- **The billing screens are already bought.** Four screens in the corpus are hand-built billing pages that PRISM should not build. `stripe-checkout-edge.ts` already mints and reuses a Stripe customer per user; a Billing Portal session is one more call against the same secret key, and it returns plan changes, invoices, payment method and cancellation as a hosted page. Direct evidence for [#213](https://github.com/codwats/prism/issues/213). See [§2](#2-the-billing-screens-are-already-bought).
- **The lapse window needs a panel, not a dialog.** Laravel Cloud draws the policy recorded in `d0c31d1` almost exactly: a `Scheduled` chip, "ends in 27 days (on June 4, 2026)", and **Resume subscription** as the primary action. NordVPN covers the payment-failure half. Neither is a modal, because neither state is a decision the reader must make now. Serves [#212](https://github.com/codwats/prism/issues/212) and [#211](https://github.com/codwats/prism/issues/211). See [§3](#3-the-lapse-window-needs-a-panel-not-a-dialog).
- **Oku, not Krea.** The tone question has an answer in this corpus, and it is not a countdown. Serves [#201](https://github.com/codwats/prism/issues/201). See [§4](#4-register-oku-not-krea).

Mobbin holds no Stripe-integration screens as a category. It does hold Patreon's own tier UI — relevant to [#208](https://github.com/codwats/prism/issues/208) — and one capture of Stripe's hosted Customer Portal in the wild.

---

## 1. A wall is the wrong shape

PRISM runs entirely on `localStorage` with no server dependency. Signed out and offline, every deck, stripe assignment and export still works. That single architectural fact disqualifies most of the corpus: a paywall modal over a working app is a claim that the app has stopped working, and the reader can see that it hasn't.

[TIDAL](https://mobbin.com/screens/b5771b05-c819-4790-8367-8014812cdaed) is the counter-model. Free accounts still play — 30 seconds of every track. The track list is fully browsable, the player is live, and the transport bar shows a 0:29 window inside a 2:48 track. Nothing is hidden; one dimension is reduced.

This is already PRISM's written policy. `CONTEXT.md` defines **Paused sync** as a lapsed member's cloud copy being "retained forever and still readable on any device, but never written again", and rules the word *paused* in, always with the date of the last sync, with *frozen*, *locked*, *disabled* and *lost* ruled out because they "suggest the collection itself is at risk when only the uploading has stopped". TIDAL is what that paragraph looks like as an interface.

Two corollaries from the same section:

- [Maze](https://mobbin.com/screens/ef905b30-a0c5-4f9e-aeb4-a2cfdd8754b2) offers a free remedy beside the paid one — "Or archive a project to create a new one." If a deck or PRISM cap ever becomes the gate ([#209](https://github.com/codwats/prism/issues/209) caps PRISMs at 25), a free way out is the difference between a limit and a shakedown.
- [Navattic](https://mobbin.com/screens/aec544a8-1ada-4fda-afc0-6b7f68dd6780) quotes the actual number — "the maximum number of members for your workspace (1)". State the real limit. "You've hit your deck limit" is a sales line; "You have 12 of 12 decks" is a fact.

[Bonsai](https://mobbin.com/screens/3ae5c1ff-a3c4-46f6-9ef6-e516c28611b7) is included as the honest version of the thing to avoid: a clean, well-made full-page "Your free trial has ended" wall. Clean of its kind, and still wrong here, because the local decks keep working after a lapse and a page like this would be false.

## 2. The billing screens are already bought

The [Rise](https://mobbin.com/screens/89af7d1a-3f7a-47fe-ae25-e037ecfd39cc) capture is Stripe's hosted Customer Portal, not Rise's own work — the left rail reads "Rise Technologies B.V. partners with Stripe for simplified billing" and the foot carries *Powered by stripe*. On one page it provides current plan and renewal date, Update plan, Cancel plan, payment method with add and edit, and billing information.

Against it, the corpus offers four hand-built equivalents: [Claude](https://mobbin.com/flows/3741833a-44f2-4b89-95dc-67456545df4e) (payment method, invoice table, Cancellation as its own section), [Podia](https://mobbin.com/screens/cdd7f5b9-f272-4af9-8211-23977deec37f) (a Manage dropdown collapsing change plan / switch to yearly / invoices / cancel), [PlayAI](https://mobbin.com/screens/dafb1e3d-ad9c-4907-af23-77a22e82765e) and [Sprout Social](https://mobbin.com/screens/225b39f0-0458-4462-8d36-a98c1720bb0c). All four are work PRISM can decline.

`stripe-checkout-edge.ts` already verifies a Supabase access token and reuses or creates a Stripe customer. A portal session is the same pattern against the same `STRIPE_SECRET_KEY`, and taking it also keeps card handling entirely outside the codebase. This is the concrete argument for [#213](https://github.com/codwats/prism/issues/213).

Two details worth keeping even with the portal in place:

- [Podia](https://mobbin.com/screens/cdd7f5b9-f272-4af9-8211-23977deec37f) keeps cancel genuinely reachable — no support-email hostage-taking — without giving it real estate.
- [Claude](https://mobbin.com/flows/3741833a-44f2-4b89-95dc-67456545df4e) shows the plan as a small header chip. A **Founder** chip in the PRISM nav would cost about that much, and would make a permanent grant feel like something rather than nothing.

## 3. The lapse window needs a panel, not a dialog

The policy recorded in `d0c31d1` is that entitlement spans the billing rail's dunning window: `stripe-webhook-edge.ts` writes `past_due` on `invoice.payment_failed`, and a member must not be cut off on day one of a window Stripe is still retrying. A lapse is `is_entitled()` turning false, not a status string changing.

[Laravel Cloud](https://mobbin.com/screens/c382dd7f-43ff-4f69-ac0e-57c5514e5a9c) is that policy drawn. Cancellation is not a confirmation dialog but a persistent panel: a `Scheduled` chip, "Subscription ends in 27 days", the full sentence "Your subscription will not renew at the end of your billing cycle, in 27 days (on June 4, 2026)", and **Resume subscription** as the primary action. A toast confirms the cancel without being the only record of it.

[NordVPN](https://mobbin.com/screens/34b9c144-6807-4a60-94fc-bcebf917c7cc) covers the payment-failure half: "Auto-renewal ⚠ OFF" with the expiry date beside it and a bordered row offering one button to fix it. Visible, dated, one-click fixable, not a lockout — which is what the `past_due` interval should look like under [#211](https://github.com/codwats/prism/issues/211).

[PlayAI](https://mobbin.com/screens/dafb1e3d-ad9c-4907-af23-77a22e82765e) adds the rule that toasts vanish: whatever the toast said must also be legible on the object it happened to. [Slite](https://mobbin.com/screens/c59304fb-c987-44fb-9e67-c0d2f3e7474c) shows the ambient version for a state that isn't urgent yet — a sidebar strip with a progress bar rather than an interrupting modal. Both feed [#212](https://github.com/codwats/prism/issues/212).

## 4. Register: Oku, not Krea

[Oku](https://mobbin.com/sites/sections/f66ba39e-9d4f-4336-955d-8721fef92d47) is an indie book tracker. Its pricing page runs Free / **Premium $6** ("Help us pay the bills continue working on improvements!") / **Supporter $15** ("You believe in what we're doing and really want to show your support"), and the Supporter column's listed benefits include "Your own spot on our supporter wall (coming soon)" and, last, "Our eternal gratitude". The header reads: "Our premium friends get some cool extras, plus the warm feeling inside that comes from supporting an indie team."

It is the closest comparable in the corpus — same scale, same relationship to its users — and it quietly answers a question [#185](https://github.com/codwats/prism/issues/185) left open. A supporter tier as an ordinary column on the pricing page is simpler than a redemption flow bolted onto Checkout, and it agrees with the conclusion already reached in [kickstarter-tier-to-stripe-membership.md](kickstarter-tier-to-stripe-membership.md): the entitlement gate is PRISM's own, so a grant needs no Stripe object behind it.

Supporting evidence for the same register:

- [Reflect](https://mobbin.com/sites/sections/e42c8789-8709-4d25-8778-8f18b6cb3719) — "We like keeping things simple. One plan one price." The honest layout when there is exactly one tier, which is where PRISM starts.
- [Sketch](https://mobbin.com/sites/sections/312580d5-9c82-48fd-9ef4-dbc6275c3768) — a subscription beside a perpetual licence, the licence carrying an explicit **"License excludes"** list. Two entitlement kinds on one page, each stating plainly what it does and does not include, with no pretence that one is a discounted version of the other. Directly relevant to how **Founder** is presented.
- [Dub](https://mobbin.com/sites/sections/0d2d583d-2925-4080-a99e-001e46f0437f) — "$0 — Free forever", stated first and at full contrast. PRISM can make that promise truthfully, because the app has no per-user server cost.
- [Patreon](https://mobbin.com/screens/d6cac496-7f42-4ddf-ad94-bf72570cfbb0) — tier benefits written as prose in the maker's voice above a short list, rather than a feature matrix. A feature matrix would make a small membership look like enterprise software. Relevant to [#208](https://github.com/codwats/prism/issues/208).
- [Cursor](https://mobbin.com/screens/5bea222a-76ec-4082-b1e3-80969aa387fb) — the quietest gate in the set: one line of grey body text and a small button, no modal, no illustration. The register for anything genuinely gated, because it reads as a fact about the account rather than a sales moment.

### The register to avoid

Two competent screens using a vocabulary PRISM's glossary has already ruled out elsewhere:

- [Evernote](https://mobbin.com/screens/392b54df-c819-4241-aa77-e72d6720cc38) — a `WELCOME OFFER` tag, a wrapped-present illustration, and "Try for USD 0.60 a week". Anchoring on a weekly figure makes an annual commitment sound like pocket change; the gift framing dresses an ask as a present.
- [Savee](https://mobbin.com/screens/a01d76b0-5bea-4f8b-9b09-62b1452d803b) — a save offer fired during cancellation, with **"Decline offer"** as the only way onward. Making someone click *Decline* to leave is the pattern the lapse language was written against.

`CONTEXT.md` already bans *churn*, *expiry*, *frozen* and *locked*. The visual grammar that travels with those words belongs on the same list.

---

## 5. Screen index

Every screen reviewed, grouped as in the artifact. Bold entries are the load-bearing ones.

wrote /tmp/claude-1000/-home-cody-prism/749b871d-36f2-4883-98c5-3747018c1e91/scratchpad/paywall-dossier.html 967496 bytes | 39 images

### 01 — The upgrade moment

Modal paywalls the user opens on purpose, or is shown once. Six variations on the same job: name one price, list what it buys, and leave an unembarrassing way out.

| App | Pattern | Reading |
| --- | --- | --- |
| **[Elicit](https://mobbin.com/screens/9a85989e-62da-4b19-8121-6aa72fb87740)** | Pitch left, benefits right | Closest structure to what PRISM would need if it ever shows a modal at all: one plan, benefits enumerated, refusal given equal weight to acceptance. |
| [Superlist](https://mobbin.com/screens/2721ee89-65ca-4b14-a84f-7b13c0fda3b3) | Free column stays in the modal | If PRISM ever carries two prices, keep the free column visible like this. Hiding it implies the free tier is going away, which it isn’t. |
| [Mobbin](https://mobbin.com/screens/8c330b43-b179-4540-a747-aa2812a5a24d) | The escape hatch is text, not a button | Lowest-pressure version of the pattern in the set. The asymmetry is deliberate and still doesn’t feel like a trap. |
| [Matter](https://mobbin.com/screens/dd7a0fe3-54b8-404c-b79b-8b022c094f6b) | Both prices shown per month | If an annual price ever exists, showing the per-month equivalent for both is the only honest way to present the discount. |
| [Air](https://mobbin.com/screens/33662dd3-56c7-49c8-bc9d-b393f8133dac) | One plan, addressed by name | The single-plan modal is the shape PRISM fits: one paid tier, no seats, nothing to compare against. |
| [Wellfound](https://mobbin.com/screens/35bdbe6f-557a-4fe5-baaa-e54276a1fd36) | Free and paid side by side | Heavier than PRISM needs, but note the free column stays legible rather than being greyed out or struck through. |

### 02 — The wall

Gates fired at the moment of use. The interesting variable is not the artwork — it is whether the screen tells you the actual limit, and whether it offers a way out that costs nothing.

| App | Pattern | Reading |
| --- | --- | --- |
| **[Cursor](https://mobbin.com/screens/5bea222a-76ec-4082-b1e3-80969aa387fb)** | The quietest gate here | This is the register PRISM should use for anything genuinely gated. It reads as a fact about the account rather than a sales moment, which is the difference between a tool and a funnel. |
| [Wayyy](https://mobbin.com/screens/6dc4e492-d781-4bb4-9166-4698a194c5b3) | Names the plans that include it | Naming the plans teaches the model in one sentence. A gate that only says “upgrade” makes the reader go find out what that means. |
| [Ghost](https://mobbin.com/screens/dde09f1b-a7d1-4cd8-9dcf-ec8d6af8a217) | A plain confirm dialog | Cheapest possible limit gate. If PRISM ever caps something, this is the amount of ceremony it deserves. |
| [Navattic](https://mobbin.com/screens/aec544a8-1ada-4fda-afc0-6b7f68dd6780) | Quotes the actual number | State the real limit. “You’ve hit your deck limit” is a sales line; “You have 12 of 12 decks” is a fact. |
| [Maze](https://mobbin.com/screens/ef905b30-a0c5-4f9e-aeb4-a2cfdd8754b2) | Offers a free remedy too | The free way out alongside the paid one is the whole difference between a limit and a shakedown. Worth copying verbatim if deck count ever becomes the gate. |
| [Mixpanel](https://mobbin.com/screens/3e027c63-0ec7-4abd-b5bd-513d979c3925) | Sells the feature, not the plan | A contextual pitch outperforms a generic plan modal because it arrives when the reader has already demonstrated they want the thing. |
| [Synthesia](https://mobbin.com/screens/40019054-1c62-4a13-8e14-37f36bc52be2) | Framing discovery, not denial | A little cute for PRISM, but a useful marker of where the tone knob sits between “blocked” and “found something”. |
| [Krea AI](https://mobbin.com/screens/dffee797-6dd4-4dc2-8fb5-a26404efdf99) | States why the limit exists | Three plans in a modal is far too much for PRISM. Giving the reason for a limit, though, is worth stealing — it converts a policy into an explanation. |

### 03 — Degrade, don’t block

The most important section for PRISM, because PRISM’s free tier is a complete, working product that runs entirely on localStorage. These are the screens where the app keeps functioning in a reduced form instead of putting up a wall.

| App | Pattern | Reading |
| --- | --- | --- |
| **[TIDAL](https://mobbin.com/screens/b5771b05-c819-4790-8367-8014812cdaed)** | The product still runs | This is PRISM’s shape, and it is already written down. `CONTEXT.md` defines **Paused sync** as a lapsed member’s cloud copy staying “retained forever and still readable on any device, but never written again” — a working app with one dimension turned off. TIDAL is what that looks like drawn. |
| [Bonsai](https://mobbin.com/screens/3ae5c1ff-a3c4-46f6-9ef6-e516c28611b7) | Honest end-of-trial page | Clean of its kind — but it *is* a wall, and PRISM’s lapse must not look like this. The local decks still work after a lapse; a page that implies otherwise would be false. |
| [beehiiv](https://mobbin.com/screens/7486fa9b-1f92-47d6-ab83-1fcb286b0c0e) | Recaps what the trial was used for | Grounding the ask in the reader’s own usage is a fair basis for it, and it needs no persuasion copy. |
| [Slite](https://mobbin.com/screens/c59304fb-c987-44fb-9e67-c0d2f3e7474c) | Ambient, not modal | The right weight for a state that isn’t urgent yet. A countdown that interrupts on every page load teaches people to dismiss it. |
| [mymind](https://mobbin.com/screens/1dd0d283-6a79-44f4-9e41-4258cd11424e) | A limit in the product’s own voice | Proof that a small, opinionated tool can write a limit notice in its own register without sounding either corporate or pushy. |

### 04 — Pricing pages

Full pricing sections, ordered from the ones PRISM could ship next week to the ones that only make sense with three plans and a sales team.

| App | Pattern | Reading |
| --- | --- | --- |
| **[Oku](https://mobbin.com/sites/sections/f66ba39e-9d4f-4336-955d-8721fef92d47)** | The closest comparable in the set | Same scale as PRISM, same relationship to its users, and it quietly solves the backer problem: a supporter tier as an ordinary column on the pricing page rather than a redemption flow bolted onto Checkout. Read this one against `docs/research/kickstarter-tier-to-stripe-membership.md`. |
| [Reflect](https://mobbin.com/sites/sections/e42c8789-8709-4d25-8778-8f18b6cb3719) | One plan, one price | The honest layout when there is exactly one tier — which is where PRISM starts. |
| [Sketch](https://mobbin.com/sites/sections/312580d5-9c82-48fd-9ef4-dbc6275c3768) | Two kinds of entitlement, side by side | Directly relevant to **Founders**. Two entitlement kinds on one page, each stating plainly what it does and does not include, with no pretence that one is a discounted version of the other. |
| [Dub](https://mobbin.com/sites/sections/0d2d583d-2925-4080-a99e-001e46f0437f) | “Free forever”, stated first | “Free forever” is a promise PRISM can actually keep, because the app runs on localStorage with no server cost per user. Few products can say it truthfully. |
| [Oevra](https://mobbin.com/sites/sections/1075f05e-7bfc-45ac-96b7-e583baf6bbf8) | Lifetime as a peer card | The shape a Kickstarter-style tier would take if it were ever sold on the site instead of on a crowdfunding platform. |
| [Cursor](https://mobbin.com/sites/sections/32775893-d17d-4162-a2a8-bc5054fbe3e7) | Grouped by who is buying | Grouping by buyer instead of by price keeps a growing page legible. Not needed yet; worth remembering. |
| [Linear](https://mobbin.com/sites/sections/0499d8f7-09b7-4022-afc1-4b63a4fabb00) | Usage rows above feature rows | Only earns its keep with three-plus plans and real quotas. PRISM is nowhere near this and shouldn’t pretend to be. |
| [The Content Architecture](https://mobbin.com/sites/sections/215c7a37-7f40-48b6-9cc2-f87977fdb58d) | A spec sheet as a pricing page | The far end of restraint. No persuasion at all, just enumeration; the confidence is the pitch. |

### 05 — Membership & supporters

Mobbin has no Stripe-billing screens as such, but it does have Patreon — the only place in the library where the paid relationship is written as a relationship rather than a feature matrix.

| App | Pattern | Reading |
| --- | --- | --- |
| **[Patreon](https://mobbin.com/screens/d6cac496-7f42-4ddf-ad94-bf72570cfbb0)** | Benefits as prose, not checkmarks | If PRISM ever offers a supporter tier, this is the register: a paragraph in the maker’s voice, then a short list. A feature matrix would make a $5 hobby membership look like enterprise software. |
| [Patreon](https://mobbin.com/screens/df6bd56f-2c29-4103-a8b9-55703ac13297) | Pay-what-you-want, below a divider | An explicit escape from the tier grid, placed after it rather than competing with it. |

### 06 — After the sale, and the lapse

Where most of the actual build cost hides — and where PRISM’s just-written lapse policy needs a picture. The first two screens here are the highest-leverage findings in the whole dossier.

| App | Pattern | Reading |
| --- | --- | --- |
| **[Rise](https://mobbin.com/screens/89af7d1a-3f7a-47fe-ae25-e037ecfd39cc)** | This is Stripe’s hosted portal | **The highest-leverage screen in the dossier.** `stripe-checkout-edge.ts` already mints and reuses Stripe customers; a Billing Portal session is one more API call against the same secret key. Taking it deletes the build for the four screens below it, along with the card-handling surface and the cancel flow — and it is the reason not to design a billing page at all. |
| **[Laravel Cloud](https://mobbin.com/screens/c382dd7f-43ff-4f69-ac0e-57c5514e5a9c)** | Cancellation as a dated, reversible state | This is the lapse window from `CONTEXT.md`, drawn. The policy says entitlement spans the billing rail’s dunning window and that a lapse is `is_entitled()` turning false — never an instant wall. A dated “ends in N days” panel with an undo is exactly that policy made visible. |
| [NordVPN](https://mobbin.com/screens/34b9c144-6807-4a60-94fc-bcebf917c7cc) | The dunning state, visible and fixable | PRISM writes `past_due` on `invoice.payment_failed` while still entitling the member. This is what that interval should look like — visible, dated, one-click fixable, and not a lockout. |
| [Podia](https://mobbin.com/screens/cdd7f5b9-f272-4af9-8211-23977deec37f) | Destructive action, no dedicated button | Keeps cancel genuinely available — no support-email hostage-taking — without giving it real estate on the page. |
| [PlayAI](https://mobbin.com/screens/dafb1e3d-ad9c-4907-af23-77a22e82765e) | State written on the object | Toasts vanish. Whatever the toast said must also be legible on the thing it happened to. |
| [Claude](https://mobbin.com/flows/3741833a-44f2-4b89-95dc-67456545df4e) | Billing settings, hand-built | A clean layout — and a complete list of what the Stripe portal above hands over for free. |
| [Claude](https://mobbin.com/flows/3741833a-44f2-4b89-95dc-67456545df4e) | Benefits restated above the form | PRISM’s checkout is a hosted Stripe Session, so most of this comes free — but restating what the money buys, adjacent to the card field, is worth configuring. |
| [Claude](https://mobbin.com/flows/3741833a-44f2-4b89-95dc-67456545df4e) | The plan as a header chip | Cheapest possible way to show state. A **Founder** chip in the PRISM nav would cost about this much and would make the permanent grant feel like something rather than nothing. |

### 07 — The register to avoid

Two screens included as counter-examples. Both are competent work; both use a vocabulary that PRISM’s own writing guidance has already ruled out elsewhere.

| App | Pattern | Reading |
| --- | --- | --- |
| [Evernote](https://mobbin.com/screens/392b54df-c819-4241-aa77-e72d6720cc38) | A gift box and a weekly price | Anchoring on a weekly figure makes an annual commitment sound like pocket change, and the gift framing dresses an ask as a present. Neither survives contact with a reader who does the multiplication. |
| [Savee](https://mobbin.com/screens/a01d76b0-5bea-4f8b-9b09-62b1452d803b) | Interception at cancel | Making someone click *Decline* to leave is the pattern PRISM’s lapse language was written against. Compare Laravel Cloud above, which lets the subscription end on a stated date and leaves the door open instead of standing in it. |

---

## 6. Method and caveats

Six Mobbin queries, web platform only: upgrade modals with feature lists; locked premium features; usage-limit prompts; pricing pages with plan comparison; single-plan and lifetime pricing; billing and subscription settings; and subscription checkout flows. Roughly a third of returned results were dropped as mobile-consumer patterns or near-duplicates.

- **Mobbin indexes interfaces, not outcomes.** Nothing here is evidence that a pattern converts — only that a competent team shipped it. No conversion claim in this note should be read into the sources.
- **Screens are Mobbin's captures and remain theirs.** Links go to the source; the images live only in the artifact, which is private.
- **Not decided by this document:** whether PRISM gates on deck count or on features, what the price is, and when enforcement flips. This is input to [#172](https://github.com/codwats/prism/issues/172) and [#201](https://github.com/codwats/prism/issues/201), not an answer to them.
