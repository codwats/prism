# Kickstarter tier to Stripe membership

Research for [Establish how a Kickstarter tier becomes a Stripe membership](https://github.com/codwats/prism/issues/185), conducted 2026-08-26.

## Conclusion

**No Stripe-side redemption mechanism is needed for the straggler tail. A manual grandfather stamp in Supabase is enough, and is strictly less work than any Stripe path.**

The reasoning is structural, not preferential. A Stripe promotion code is redeemed by a **Stripe Customer inside a Checkout Session**, and `stripe-checkout-edge.ts` only mints a Stripe customer for a caller who already holds a verified Supabase session. So a code cannot be redeemed by anyone who lacks a PRISM account — the exact population it was supposed to serve. Both the code path and the allowlist path require the backer to make an account first; past that point the code buys nothing the allowlist does not already give, and costs a coupon, a promotion code per backer, a new `discounts[0][promotion_code]` parameter in the checkout edge function, a redemption UI, and a permanent second entitlement source that PRISM must keep reconciled with Stripe. The grandfather stamp costs one row.

The rest follows from that:

- **PRISM's entitlement gate is already PRISM's own.** `isPaymentEnforced()` reads `app_config`; `hasActiveSubscription()` reads the local `subscriptions` row. A grandfather flag is read by the same code with no Stripe object behind it. Sending a grandfathered backer through Checkout creates a live Stripe subscription that PRISM then owes maintenance to forever — trial-end handling, pause handling, dunning — in exchange for an entitlement it could have granted by writing `true` into a column.
- **If a Stripe-side grant is ever wanted anyway, exactly one mechanism survives a customer who never enters a card**: `subscription_data[trial_period_days]` plus `payment_method_collection=if_required` plus `subscription_data[trial_settings][end_behavior][missing_payment_method]`. A 100 %-off coupon does *not* survive it — `trial_settings` is keyed on trial end and has no coupon equivalent, so when the discount lapses the subscription falls into ordinary dunning with no card on file. Trials cap at **730 days**, which covers a one- or two-year membership. See [§1](#1-stripe-mechanics-for-first-period-free-then-bills-normally).
- **Kickstarter gives the creator no Stripe customer and no payment-method handle.** Kickstarter debits the backers' cards itself and pays out **one lump sum from "Kickstarter PBC"** to a bank account. Stripe appears only as Kickstarter's own processor and as the KYC/payout rail for the creator. There is no recurring-billing product for creators; the one that existed, Drip, was shut down in 2019, and "Pledge Over Time" is a 3-instalment split of a single pledge, not a subscription. See [§2](#2-kickstarter).
- **Bulk unique-code delivery is a solved, free problem on both platforms** — Kickstarter's own Pledge Manager sends unique codes from the backer report, and BackerKit has a "Code Bank". That was the open question that made codes look attractive; it is answered, and it does not change the recommendation, because delivery was never the expensive half. See [§2](#2-kickstarter) and [§3](#3-backerkit).
- **Web Awesome — the exemplar the ticket names — did not use codes.** Their live claim page asks for the **"Backer Email Address"** with the hint *"Make sure it matches what you shared in your Backer survey"*, against an account they pre-created. That is the email-match mechanism #185's later comment recommends, shipped by the closest available comparable. See [§5](#5-web-awesome-the-named-exemplar).

---

## 1. Stripe mechanics for "first period free, then bills normally"

### 1.1 The three mechanisms are not interchangeable

Stripe draws the coupon/promotion-code line as *who decides*, in [Coupons and promotion codes](https://docs.stripe.com/billing/subscriptions/coupons#coupons-versus-promotion-codes):

> - **Coupons**: You decide who and when a customer gets the discount. These are backend-driven discounts (your system decides who gets the discount).
> - **Promotion codes**: Your customer decides when to apply a discount. This is a customer-facing code that wraps around a coupon, adding a distribution and control layer on top of coupons. Many promotion codes can reference one coupon.

The same page's comparison table is the one that matters for a per-backer grant:

| | **Coupon** | **Promotion code** |
| --- | --- | --- |
| Restrict to a specific customer | ❌ Unsupported | ✓ Supported |
| Apply to first-time purchase only | ❌ Unsupported | ✓ Supported |
| Minimum spend to redeem | ❌ Unsupported | ✓ Supported |

Trials are a third thing entirely — not a discount, but a delay. From [Configure free trials](https://docs.stripe.com/payments/checkout/free-trials?payment-ui=stripe-hosted):

> You can configure a Checkout Session to start a customer's subscription with a free trial by passing one of the following parameters:
> - `subscription_data.trial_period_days`, the length (in days) of your free trial.
> - `subscription_data.trial_end`, a Unix timestamp representing the end of the trial period.
>
> The maximum free trial length is 2 years (730 days) […]

730 days is the ceiling, confirmed again in [Use free trial periods on subscriptions](https://docs.stripe.com/billing/subscriptions/trials/free-trials): "The trial period must be 730 days (2 years) or less." A one-year Kickstarter membership fits with room to spare.

**A versioning trap worth naming.** Stripe now labels the `trial_end`/`trial_period_days` page *Legacy* — "The content below describes a *Legacy* (Technology that's no longer recommended) integration path for offering free trials" — and points to the new [Trial Offer API](https://docs.stripe.com/billing/subscriptions/trials). But that API's own limitations section says:

> Trial offers are only supported when creating subscriptions directly using the Subscriptions API. The following UI integrations don't support trial offers:
> - Checkout (instead use [legacy free trials](https://docs.stripe.com/payments/checkout/free-trials) with `trial_end`)
> - Payment Links
> - Elements with Checkout Sessions

PRISM's integration is a Checkout Session (`stripe-checkout-edge.ts`). The "legacy" parameters are therefore the *only* ones available to it, and Stripe's recommended replacement is closed to it. Do not read the Legacy banner as a migration signal.

### 1.2 Which mechanism survives a customer who never enters a card

`payment_method_collection` is what makes a card optional at all. From the [Create a Checkout Session reference](https://docs.stripe.com/api/checkout/sessions/create#create_checkout_session-payment_method_collection):

> Specify whether Checkout should collect a payment method. When set to `if_required`, Checkout will not collect a payment method when the total due for the session is 0. This may occur if the Checkout Session includes a free trial **or a discount**.
>
> Can only be set in `subscription` mode. Defaults to `always`.

So both a trial and a 100 %-off coupon get the backer past Checkout without a card. The paths diverge afterwards, and only one of them has a defined ending.

**Trial path — defined.** [Create free trials without collecting payment method](https://docs.stripe.com/billing/subscriptions/trials/free-trials#create-free-trials-without-payment) gives three end behaviours:

> - **Cancel subscription** — If the free trial subscription ends without a payment method, it cancels immediately. […] Set `missing_payment_method=cancel` […]
> - **Pause subscription** — If the free trial subscription ends without a payment method, it pauses and doesn't cycle until it's resumed. When a subscription is paused, it doesn't generate invoices […] When your customer adds their payment method after the subscription has paused, you can resume the same subscription. The subscription can remain paused indefinitely. Set `missing_payment_method=pause` […]
> - Alternatively, set `missing_payment_method=create_invoice` to invoice at the end of the trial if no payment method is present. If a payment method isn't provided when the invoice finalizes, the subscription moves into `past_due`.

And the detection rule: "We check `default_source` and `default_payment_method` on the subscription and customer to determine whether a subscription is missing a payment method at the end of a trial."

The exact Checkout call Stripe documents for this:

```
curl https://api.stripe.com/v1/checkout/sessions \
  -d mode=subscription \
  -d "line_items[0][price]=price_abc" \
  -d "line_items[0][quantity]=1" \
  -d "subscription_data[trial_settings][end_behavior][missing_payment_method]=pause" \
  -d "subscription_data[trial_period_days]=30" \
  -d payment_method_collection=if_required \
  --data-urlencode "success_url=https://example.com/success"
```

That is a four-line diff against `stripe-checkout-edge.ts`'s existing `stripePost('checkout/sessions', …)` params object. `pause` is the humane setting: it "can remain paused indefinitely," and the backer can resume the *same* subscription later by adding a card, rather than starting over.

**Coupon path — undefined, and it ends in dunning.** There is no `end_behavior` for a discount. When a 100 %-off coupon's `duration` runs out, the subscription is an ordinary subscription that happens to have no payment method. From [Billing collection methods § Failed recurring charges](https://docs.stripe.com/billing/collection-method#handle-recurring-charge-failures):

> If a payment fails or if it requires customer authentication, the subscription's `status` is set to `past_due` […]
>
> If a payment to renew the subscription fails when you've set it to charge automatically, the subscription transitions to `past_due` and Stripe may mark it as `canceled` or `unpaid` (depending on your subscriptions settings) after Stripe exhausts all payment retry attempts.

So the backer's first experience of the membership ending is a retry cycle and Stripe's dunning emails, and the terminal state depends on a Dashboard toggle rather than on anything in PRISM's code. The [subscription status table](https://docs.stripe.com/billing/subscriptions/overview#subscription-statuses) confirms that `paused` is reachable *only* through the trial route: "The subscription has ended its trial period without a default payment method and the `trial_settings.end_behavior.missing_payment_method` is set to `pause`."

**Verdict: `trial_period_days` + `if_required` + `missing_payment_method=pause` is the only clean "grant a period, then bill normally, no card up front" mechanism Stripe offers.** Coupons and promotion codes are the wrong tool for granting time; they are the right tool for discounting a price someone is already paying.

### 1.3 Coupon duration, for completeness

If a coupon is ever used anyway, the semantics from [Coupon duration](https://docs.stripe.com/billing/subscriptions/coupons#coupon-duration):

> Duration defaults to `once`, which applies only to the first invoice. Set `duration=repeating` with `duration_in_months` to apply a discount for multiple months, or `duration=forever` to apply it to all invoices indefinitely.
>
> For example, a coupon for 50% off with `duration_in_months=4` applies to all invoices in the 4-month period starting when the coupon is first applied. In a monthly subscription, the coupon applies to the first 4 invoices. In a yearly subscription, the 50% discount applies to the entire year if the subscription renews within the 4-month window.

On an **annual** price, `duration=once` at `percent_off=100` already means "first year free" — `repeating` is unnecessary and its month-window arithmetic is a footgun. There is also a silent-state trap:

> When a subscription uses a coupon with `duration=once`, the coupon is considered used after the invoice finalizes and is removed from the subscription's `discounts` array […] This means a subscription may appear to have no discount even though a coupon was applied.

### 1.4 Webhook events, mapped onto `stripe-webhook-edge.ts`

PRISM's handler subscribes to four types: `checkout.session.completed`, `customer.subscription.updated`, `customer.subscription.deleted`, `invoice.payment_failed`. Everything else hits the `default:` branch and is logged, not acted on.

| Path | Event | Handled today? |
| --- | --- | --- |
| Backer completes a $0 trial Checkout | `checkout.session.completed`, with `subscription` set and `payment_status: "paid"` | **Yes.** The handler fetches the live subscription, whose status is `trialing`, and `hasActiveSubscription()` in `billing.js` already accepts `'trialing'`. This works unchanged. |
| 3 days before trial end | `customer.subscription.trial_will_end` | No — falls through to `default:`. Only needed if PRISM wants to send its own "add a card" nudge; Stripe can send that itself from the Dashboard's free-trial messaging settings. |
| Trial ends, no card, `end_behavior=cancel` | `customer.subscription.deleted` | **Yes.** "The subscription moves to the `canceled` status and sends this event after a free trial ends without a payment method, and if the subscription's `missing_payment_method` end behavior is set to `cancel`." |
| Trial ends, no card, `end_behavior=pause` | `customer.subscription.paused` | **No — and this is a live gap.** "The subscription moves to the `paused` status and sends this event after a free trial ends without a payment method and if the subscription's `missing_payment_method` end behavior is set to `pause`." Unhandled, the stored row keeps saying `trialing` and the user keeps access forever. |
| Paused subscription resumed | `customer.subscription.resumed` | No — same gap in reverse (access would already be granted, so it fails safe). |
| Trial ends, no card, `end_behavior=create_invoice`; or a lapsed 100 %-off coupon | `invoice.payment_failed` | **Yes** — the handler stamps `past_due`. |

Sources: the event table in [Trial offers § Events](https://docs.stripe.com/billing/subscriptions/trials) (which describes the shared trial-end events), the [`payment_status` enum](https://docs.stripe.com/api/checkout/sessions/object#checkout_session_object-payment_status) — "`paid` … For subscriptions with a free trial, this indicates that the $0 trial invoice has been successfully processed" — and the [subscription status table](https://docs.stripe.com/billing/subscriptions/overview#subscription-statuses).

The practical reading: **`missing_payment_method=cancel` is the only end behaviour PRISM's webhook handles correctly today.** `pause` is the better product decision and would need a `customer.subscription.paused` case adding. That is a second reason not to build the Stripe path for a handful of stragglers.

### 1.5 Bulk promotion codes: what Stripe will and will not do

Stripe supports everything needed to make per-backer codes, and supports none of the bulk ergonomics that would make it cheap.

**Uniqueness.** From [Create promotion codes](https://docs.stripe.com/billing/subscriptions/coupons#create-promotion-codes):

> The `code` is case-insensitive and unique across active promotion codes for any customer. […]
> - You can create multiple customer-restricted promotion codes with the same `code`, but you can't reuse that `code` for a promotion code that any customer can redeem.
> - If you create a promotion code that is redeemable by any customer, you can't create another active promotion code with the same `code`.

N distinct code strings for N backers is fine. `code` is capped at 500 characters, `[a-zA-Z0-9-]` only, and "If left blank, we will generate one automatically" ([API reference](https://docs.stripe.com/api/promotion_codes/create)).

**Per-code controls.** `max_redemptions` ("A positive integer specifying the number of times the promotion code can be redeemed" — set to `1`), `expires_at`, `active` for archiving, and `customer` ("The customer who can use this promotion code. If not set, all customers can use the promotion code"). Note that `customer` is useless here: PRISM does not know a backer's Stripe customer id until they sign up and reach Checkout, which is after the code has been printed and shipped.

**`restrictions.first_time_transaction` is actively wrong for this use case.** The object reference calls it "A Boolean indicating if the Promotion Code should only be redeemed for Customers without any successful payments or invoices," and the guide is blunter:

> Restricts the coupon to customers who have no prior transaction history on your platform. This setting prevents customers from using the coupon if they:
> - Initiated a PaymentIntent, even if the payment never completed.
> - Subscribed to a trial period, even if it subsequently canceled.

A backer who tried PRISM before backing would be locked out of their own reward.

**Redemption limits interact.** "Both actions count toward the same `max_redemptions` limit on the coupon" (applying a coupon directly *and* redeeming a promotion code), and a promotion code's `max_redemptions` "can't be greater than the coupon's." Leave the parent coupon's `max_redemptions` unset unless you want a hard campaign-wide cap.

**There is no bulk-creation endpoint.** The [Promotion Codes API](https://docs.stripe.com/api/promotion_codes/create) creates one code per request; nothing in the reference documents a batch form, and the Dashboard flow is likewise one at a time. Generating codes is therefore a loop against [rate limits](https://docs.stripe.com/rate-limits): **100 requests/second global in live mode, 25 requests/second per individual endpoint.** At the endpoint limit that is roughly 1,500 codes a minute — fast enough that volume is not the objection. The objection is that every code is an object you now own, distribute, reconcile and support.

**No documented ceiling on the number of promotion codes per account.** Stripe's rate-limits page and the promotion-code reference both stay silent; treat this as an absence, not a guarantee.

---

## 2. Kickstarter

### No Stripe customer, no payment-method handle, one lump-sum payout

The creator never touches the backer's payment relationship. From [If my project is successfully funded, how do I receive my funds?](https://help.kickstarter.com/hc/en-us/articles/360010120934-If-my-project-is-successfully-funded-how-do-I-receive-my-funds):

> If your project is successfully funded, the funds pledged will be debited directly from your backers' cards. There is a 14 calendar day window following your project's deadline where we will be collecting and processing the pledges. After the 14 days have passed, a payout will be initiated. […] The payout for your project will be transferred as a single transaction, which should appear in your bank account as coming from **Kickstarter PBC**. It isn't possible to spread your project's funds across multiple transactions or bank accounts.

Stripe appears twice, and neither time as something the creator can call. It is Kickstarter's processor — "Stripe, our payments processor, will also collect a payment processing fee" ([What are the fees?](https://help.kickstarter.com/hc/en-us/articles/115005028634-What-are-the-fees)) — and it is the KYC/payout rail for the creator's own bank details: "Stripe, our payments processor, meets and exceeds the most stringent industry standards for security" ([Is the financial information that I share on the Payment tab secure?](https://help.kickstarter.com/hc/en-us/articles/115005139513-Is-the-financial-information-that-I-share-on-the-Payment-tab-secure)).

**The expected shape in the ticket body is confirmed: no Stripe customer, no card token, no subscription hand-off. Anything recurring has to be started from scratch on PRISM's own Stripe account.**

### No recurring-billing product for creators

- **Drip**, Kickstarter's subscription platform, ran roughly 2017–2019 and was shut down. Kickstarter's own announcement is at [A New Approach to Our Work on Drip](https://www.kickstarter.com/blog/a-new-approach-to-our-work-on-drip) and the archive at [kickstarter.com/drip-archive] — *both pages returned HTTP 403 to automated fetching; the shutdown is asserted here from search-index summaries of those first-party pages, not from text I read directly.*
- **Pledge Over Time** is not a subscription. From the [Pledge Over Time FAQ](https://help.kickstarter.com/hc/en-us/articles/33915468199835-Pledge-Over-Time-FAQ): "Pledge Over Time is a flexible payment option that allows backers to split their pledge into 3 payments […] The first charge will occur when your project ends successfully. The remaining 2 payments are then collected automatically each month until the pledge total is fully paid." It is an instalment plan on one pledge, with a real side effect worth knowing: "Pledge Over Time backers will not be able to access your project's Pledge Manager until they have completed all 3 charges of their payment plan" — so those backers reach any code or survey roughly two months late.
- **No first-party public API documentation was found.** Kickstarter's help centre documents no developer API and no OAuth surface. This is an absence of evidence rather than a documented prohibition.

### Kickstarter's own Pledge Manager already sends unique codes, for free

This is the finding that removes BackerKit from the critical path. From [Can I send digital rewards to my backers through Kickstarter?](https://help.kickstarter.com/hc/en-us/articles/48621108793883-Can-I-send-digital-rewards-to-my-backers-through-Kickstarter):

> Yes, if you are using Kickstarter's Pledge Manager you will have the option to send digital rewards to backers through the backer report. You can send rewards as a **digital file, code, or URL**. […]
>
> **Digital codes and URLs** — If your project included digital rewards that only require a code or URL to access, you will have the option to send these within the backer report as either unique or shared access. When sending a unique access code or URL to multiple backers at once, make sure to separate each entry with a comma, and only add one unique access code or URL per recipient. For example, if you are sending digital reward codes to 10 backers, only enter 10 unique codes. If you wish to send a unique access code to a specific backer, you will need to send this to them individually. For a shared access code or URL, simply add this to the modal and it will be sent to all selected backers.

Cost: "There is no up front cost to using this tool. Kickstarter will deduct our usual fees from any payments made within the pledge manager" ([How do I use Kickstarter's Pledge Manager?](https://help.kickstarter.com/hc/en-us/articles/30353536404891-How-do-I-use-Kickstarter-s-Pledge-Manager)). Delivering a per-backer code is therefore free and needs no third party. Eligibility is gated — there is an article titled *How do I know if I'm eligible to use Kickstarter's Pledge Manager?* — and I did not verify PRISM's project would qualify.

### The email you would key an allowlist on

The backer report exposes backer email addresses, and the survey collects whatever else you ask for ([How can I use my project's backer report?](https://help.kickstarter.com/hc/en-us/articles/48619766244251-How-can-I-use-my-project-s-backer-report), [How can I get my backers' information to fulfill rewards?](https://help.kickstarter.com/hc/en-us/articles/31936770006299-How-can-I-get-my-backers-information-to-fulfill-rewards)). One caveat lands directly on the allowlist design:

> When backers sign up to Kickstarter with their Apple ID and opt to hide their email address, you will only be able to see their private relay email address in your backer report at the end of the campaign. The unique private relay email address tied to their Kickstarter account can only be used for communication within Kickstarter. This means that any communication you may send outside of our platform – including via a third-party survey tool or pledge manager service – **will unfortunately not reach their inbox**.

So a slice of backers will hand over an address that is structurally unusable as a PRISM login. **Ask for the PRISM email explicitly as a survey question** rather than harvesting the account email, and expect a residue that the on-demand escape hatch must cover regardless of which mechanism is chosen. This is an argument for keeping *some* manual path open — not an argument for building it in Stripe.

---

## 3. BackerKit

BackerKit's pledge manager does the same job, with a proper bulk-upload affordance. From [Digital Downloads: How do I set up my digital download in BackerKit's Pledge Manager?](https://help.backerkit.com/article/367-digital-downloads):

> - Select **Raw File** to provide a file for your backers to download.
> - Select **Code Bank** to send a unique access code to each of your backers. You must create a text file with a complete list of your codes to use this option, one code per line.
> - Select **Text** to create a single code to send to all of your backers.

Raw files cap at 250 MB. Code Banks are topped up by uploading another file, and BackerKit warns at 75 % and 100 % distribution. Per-backer code administration is thin: [How do I manage the access codes available to a backer?](https://help.backerkit.com/article/532-532) documents viewing a backer's codes on their Digital Downloads tab and a **delete** link to "make the code unavailable to the backer." Reassignment between backers is not documented.

**Code Bank is a better bulk tool than Kickstarter's comma-separated paste. It is not a reason to add BackerKit** if Kickstarter's own pledge manager is available, because it carries its own fee stack (§4) and Kickstarter's does the same job at no extra cut.

---

## 4. Fees, and whether bundling software changes anything

### Kickstarter

From [What are the fees?](https://help.kickstarter.com/hc/en-us/articles/115005028634-What-are-the-fees) (last updated 2026-08-24):

> If a project is successfully funded, Kickstarter collects a **5% fee** from the funds collected for creators. Stripe, our payments processor, will also collect a payment processing fee (**roughly 3-5%**). […] If a project does not reach its funding goal, no fees are collected.
>
> **What are the fees for using Kickstarter's Pledge Manager?** The fees we will collect on payments made through the Pledge Manager are the same as the fees we collect on successful projects. Our payments processor, Stripe, will collect a variable card processing fee (roughly 3-5%) on the full payment, **including any taxes**. Kickstarter will collect a **5% platform fee on all funds, except taxes**.

Micropledges: "Pledges under $10 have a discounted micropledge fee of 5% + $0.05 per pledge" ([Kickstarter Fees: A Comprehensive Guide for Creators](https://updates.kickstarter.com/kickstarter-fees-a-comprehensive-guide-for-creators/), Kickstarter's own updates site).

**All-in: roughly 8–10 % of a tier.**

### BackerKit

From [Frequently Asked Questions](https://help.backerkit.com/article/649-frequently-asked-questions): for a Kickstarter campaign the cost is "Campaign fee + transaction fee," and "A **3.5% transaction fee** is applied to all funds raised in Pledge Manager." For a campaign launched on BackerKit itself the pledge manager is complimentary with "a 5% transaction fee for charges made in the pledge manager." Payment is due "two weeks after your campaign finishes and before sending out surveys to backers."

Card processing is separate, from [Payment Processing Fees for BackerKit Crowdfunding](https://help.backerkit.com/article/852-payment-processing-fees): USD **2.90 % domestic / 4.40 % international / $0.30 flat**; EUR 1.50 % / 3.25 % / €0.25; GBP 1.50 % / 3.25 % / 20p; 18 currencies listed. That page does not name the processor.

The campaign-fee figure — "All Pledge Manager Campaign Fees start at 2% and get cheaper the more you raise," waived if you launched on BackerKit — comes from `backerkit.com/pricing/pledge_manager`. **That page is behind a Cloudflare JavaScript challenge and could not be read directly; the 2 % figure is a search-index snippet of a first-party page, i.e. secondary retrieval of a primary source.** Treat it as indicative.

**All-in on top of Kickstarter's ~10 %: roughly another 6–8 % on anything routed through BackerKit.** Since Kickstarter's own pledge manager delivers codes for the fees you are already paying, adding BackerKit purely for code distribution is a paid solution to a free problem.

### Fulfilment obligations

Nothing about a digital or software reward changes the obligation, and nothing about bundling it into a physical tier changes it either. From [What is a creator obligated to do once their project is funded?](https://help.kickstarter.com/hc/en-us/articles/115005028834-What-is-a-creator-obligated-to-do-once-their-project-is-funded):

> When a project is successfully funded, the creator is responsible for completing the project and fulfilling **each reward** to the best of their abilities. Their fundamental obligation to backers is to finish all the work that was promised, honestly address backers' concerns, and deliver rewards. […] We do ask that if a creator is absolutely unable to complete the project and fulfill rewards, they must make every reasonable effort to find another way of bringing the project to a satisfying conclusion for their backers. For more information, see Section 4 of our Terms of Use.

And [Who is responsible for completing a project as promised?](https://help.kickstarter.com/hc/en-us/articles/115005048073-Who-is-responsible-for-completing-a-project-as-promised): "It's the project creator's responsibility to complete their project. Kickstarter doesn't step into the creative process itself or manage the fulfillment and shipment of rewards."

Non-physical rewards are explicitly allowed — [What can be offered as a reward?](https://help.kickstarter.com/hc/en-us/articles/14048557449499-What-can-be-offered-as-a-reward): "Your reward idea doesn't necessarily need to be a physical item. However, rewards should aim to bring backers closer to your project. […] Reward ideas can vary so long as your reward idea fits into Our Rules."

The operative consequence for #185: **the membership half of a bundled tier is a promised reward like any other**, so "the backer never made an account, so they never got it" is a fulfilment failure whatever the mechanism. That is an argument for an escape hatch that a human can execute on demand — which is what a manual grandfather stamp is — and not an argument for a redemption system.

*I could not read `kickstarter.com/rules`, `kickstarter.com/terms-of-use` or the Creator Handbook: all of `www.kickstarter.com` returns HTTP 403 to automated fetching. The obligations above are quoted from Kickstarter's own help centre, which is first-party but is a summary of the Terms rather than the Terms themselves. Section 4 of the Terms of Use has not been read.*

---

## 5. Web Awesome, the named exemplar

Web Awesome's Kickstarter bundled subscription time. The mechanism is visible on their live claim page, [webawesome.com/claim](https://webawesome.com/claim):

> **Claim your Account from Kickstarter**
>
> If you bought a subscription while backing our Kickstarter, **we've made you an account!** Complete the next steps to claim it.

The form itself (read from the page source on 2026-08-26) posts to `/signup` and carries exactly one identifying field:

```html
<form id="claim-account" action="/signup" method="POST">
  <wa-input name="user[email]"
            label="Backer Email Address"
            hint="Make sure it matches what you shared in your Backer survey"
            type="email" required autocomplete="username">
```

There is no code field. The page's surrounding text — "Didn't get a verification email? Try again" — indicates an email-verification claim of a pre-created account.

**The closest available comparable, run by a team that ships a component library used by this very codebase, solved the Kickstarter-to-membership problem with an email match against the backer survey and zero redemption codes.** They also chose the auto-create side of the trade-off that #185's comment rejects, which is a real difference; but note that their claim UI is doing the same *matching* work an allowlist trigger would do, and their hint text is a public admission that survey-email mismatch is the failure mode. PRISM's allowlist keeps the matching and drops the dormant accounts.

*I could not read Web Awesome's Kickstarter project page or campaign updates — `www.kickstarter.com` returns 403 — so I cannot rule out that a code path also existed alongside the claim flow.*

---

## 6. Recommendation

**Grandfather by email allowlist. Handle the tail with a manual stamp. Build nothing in Stripe.**

1. **Do not pass `discounts` or `subscription_data[trial_*]` in `stripe-checkout-edge.ts`.** Leave the Checkout call as it is. Grandfathered users should never reach Checkout at all; a user with an entitlement has no reason to start a subscription.
2. **Keep the grandfather flag out of the `subscriptions` table's Stripe-shaped columns.** `subscriptions` is written exclusively by `stripe-webhook-edge.ts` from Stripe events. Writing a non-Stripe entitlement into a row whose `updated_at` is a Stripe event timestamp, and whose upsert logic is "update only if older," will be reverted by the next real webhook. This is #186's decision, but the constraint belongs on the record here: **the grandfather flag needs its own storage.**
3. **The tail is served by a support action, not a feature.** "Backer writes in → verify against the backer report → insert their PRISM email into `founding_emails` (or stamp the existing account) → done." That is the same operation the allowlist trigger performs automatically; the escape hatch is the manual invocation of it. There is no Stripe object in the loop, so there is nothing to reconcile, expire, or leak.
4. **Ask for the PRISM email in the backer survey**, as a separate field from the Kickstarter account email. This is the single highest-leverage thing available, because it converts the different-email case — the only case a code was ever better at — into an allowlist case before it happens. Apple private-relay backers make this mandatory rather than nice-to-have.
5. **If the campaign later sells a membership-only tier with no account behind it**, revisit — but revisit toward `trial_period_days` + `payment_method_collection=if_required` + `missing_payment_method=pause`, not toward coupons. And add a `customer.subscription.paused` case to `stripe-webhook-edge.ts` *before* shipping it, or paused subscriptions will read as `trialing` forever.

The one Stripe-side change worth making independent of all this: **`customer.subscription.paused` and `customer.subscription.resumed` are unhandled today.** They cannot fire on PRISM's current integration, because nothing sets a trial. They become live the moment anyone adds one. Worth a comment in `stripe-webhook-edge.ts`'s `default:` branch so the next person does not discover it in production.

---

## Limitations

- **`www.kickstarter.com` returns HTTP 403 to all automated fetching**, including with browser-shaped headers. Kickstarter's Rules, Terms of Use (Section 4, on creator obligations), and Creator Handbook were **not read first-hand**. Everything quoted from Kickstarter here comes from `help.kickstarter.com` (retrieved through its Zendesk article API) and `updates.kickstarter.com`, both first-party but both summaries of the governing documents.
- **The Drip shutdown is asserted from search-index summaries of Kickstarter's own blog posts**, which 403 on direct fetch. The conclusion it supports — that Kickstarter offers creators no recurring-billing product today — is independently supported by the absence of any such product in the current help centre, but the shutdown date and reasoning are secondary.
- **`backerkit.com/pricing` and `backerkit.com/pricing/pledge_manager` are behind a Cloudflare JavaScript challenge.** The "campaign fees start at 2 %" figure is a search snippet of a first-party page, not text I read. The 3.5 % transaction fee and the per-currency processing fees *are* first-party, from `help.backerkit.com`.
- **No first-party statement that Kickstarter has no public API.** I found no developer documentation, no OAuth surface and no mention in the help centre. That is an absence, not a documented denial.
- **Stripe does not document a maximum number of promotion codes per account**, nor a bulk-creation endpoint. Both conclusions rest on absence from the API reference.
- **Whether `customer.subscription.updated` also fires alongside `customer.subscription.paused`** is not stated on any page I read. If it does, PRISM's existing `customer.subscription.updated` handler would happen to catch the pause; do not rely on that.
- **Stripe documents `payment_status: "paid"` for a $0 *trial* Checkout Session** but says nothing about the equivalent for a session zeroed by a *discount*. If the coupon path is ever built, verify that case against a test clock.
- **Kickstarter Pledge Manager eligibility was not verified for PRISM's project.** An eligibility article exists; its criteria were not read.
- **Web Awesome's Kickstarter page and campaign updates could not be read** (same 403). The claim-form evidence is live and direct, but it does not prove a code path never existed alongside it.
- Nothing here was executed against Stripe's API. Every Stripe claim is from `docs.stripe.com` as published on 2026-08-26; behaviour was not confirmed with a test clock.
