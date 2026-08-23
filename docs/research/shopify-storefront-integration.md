# Shopify storefront integration without a subdomain

Research for [Integrate the Shopify store into PRISM without a subdomain](https://github.com/codwats/prism/issues/180), conducted 2026-08-20. Current stable Storefront API version at time of writing: **2026-07**.

## Conclusion

- **Checkout is always Shopify-hosted, but the host the buyer sees is the store's *primary domain*, not `myshopify.com`.** Shopify states plainly that "customers are always directed back to a Shopify-hosted checkout," and documents the standard headless pattern: point a subdomain (for example `checkout.prismmtg.com`) at the Online Store and mark it **Primary**. `cart.checkoutUrl` then returns that host. Verified live on Shopify's own demo store — see [Checkout domain](#1-checkout-domain). No plan gate is documented for this; it is domain configuration, not a Plus feature. There is no supported way to render the checkout *page itself* inside prismmtg.com.
- **The Storefront API works from a plain browser `fetch()` with no build step and, as of the current version, no token at all.** Shopify documents tokenless access covering Products, Collections, Search, Pages/Blogs and **Cart (read/write)** — everything a catalog + cart + checkout handoff needs. Responses carry `access-control-allow-origin: *` (verified live). The public token is explicitly designed to be visible to buyers.
- **`/api/shopify-edge` is not required and is actively harmful.** Shopify documents that "public access capacity scales with the number of buyers, based on their IP address." A single edge-function egress IP collapses every buyer into one bucket. The proxy pattern PRISM uses for Moxfield/Archidekt exists to defeat CORS; Shopify has no CORS problem to defeat.
- **A fourth option the issue does not list: Storefront Web Components.** Shopify ships `<script src="https://cdn.shopify.com/storefront/web-components.js">` plus `<shopify-store>` / `<shopify-context>` / `<shopify-cart>` — declarative HTML, no build step, no token, styled via your own markup, CSS parts and slots. This sits between "Buy Button" and "hand-rolled Storefront API" and is the closest fit to PRISM's no-bundler vanilla stack.
- **Buy Button is the weakest option and rests on a deprecated dependency.** `buy-button-js` is still released (v3.0.6, Aug 2025; commits through Aug 2026), but it depends on `shopify-buy` (JS Buy SDK), which Shopify marked **deprecated as of January 2025**. Shopify's own help centre says it does "not recommend the use of Buy Buttons on your Shopify online store."
- **Checkout API is gone, not merely deprecated.** Deprecated in API version 2024-04, shut off **April 1, 2025**. Cart API is the only path.
- **Cart permalinks are documented and supported** by both help.shopify.com and shopify.dev, with a rich parameter set (discounts, attributes, notes, prefilled checkout fields, locale). They are the zero-JavaScript floor.

---

## 1. Checkout domain

### Checkout is always Shopify-hosted

From [Migrate from the online store to Hydrogen § Subdomain for checkout](https://shopify.dev/docs/storefronts/headless/hydrogen/migrate):

> Regardless of whether you're using the online store or Hydrogen, customers are always directed back to a Shopify-hosted checkout. Traditionally, a checkout URL might look something like `{shop}.myshopify.com/123456/checkouts…`.
>
> To make sure your Hydrogen site works correctly, assign a subdomain for your storefront to checkout. For example, if your Hydrogen store is `example.com`, then assign `checkout.example.com` to checkout. To do this:
>
> 1. Connect the subdomain
> 2. Set the **Target** to **Online Store**.
> 3. Set the **Domain** type to **Primary**.

The same procedure appears in [Redirect traffic to the Hydrogen channel § Step 1](https://shopify.dev/docs/storefronts/headless/hydrogen/migrate/redirect-traffic), which names Shopify's own demo as the reference implementation:

> The [hydrogen.shop](https://hydrogen.shop/) demo provides an example of this routing pattern. The primary domain `hydrogen.shop` receives traffic on the Hydrogen storefront while the subdomain `checkout.hydrogen.shop` receives traffic at checkout.
>
> **Note:** For custom storefronts not hosted on Oxygen, only the subdomain must point to Shopify.

That note matters for PRISM: prismmtg.com stays on Netlify. Only the checkout subdomain's DNS goes to Shopify.

### What host the buyer actually sees — verified live

Executed 2026-08-20 against Shopify's public demo store, tokenless, with a browser-shaped `Origin` header:

```
POST https://checkout.hydrogen.shop/api/2026-07/graphql.json
{"query":"mutation{cartCreate(input:{lines:[{quantity:1,merchandiseId:\"gid://shopify/ProductVariant/41007289630776\"}]}){cart{id checkoutUrl}}}"}
```

Response:

```json
{"data":{"cartCreate":{"cart":{
  "id":"gid://shopify/Cart/hWNFsvNSBFDk5Qz0xhnQEVTl?key=7c026214…",
  "checkoutUrl":"https://checkout.hydrogen.shop/cart/c/hWNFsvNSBFDk5Qz0xhnQEVTl?key=JpGRVv2JSim…"
}}}}
```

The buyer sees `checkout.hydrogen.shop` — a subdomain of the merchant's own domain. `{ shop { primaryDomain { url } } }` on the same store returns `https://checkout.hydrogen.shop`, confirming that `checkoutUrl`'s host is the store's **primary domain** as configured in Shopify admin.

The shipped docs example in [Create and update a cart § Step 7](https://shopify.dev/docs/storefronts/headless/building-with-the-storefront-api/cart/manage) shows the un-configured case, where the primary domain is still the myshopify one:

```json
{"data":{"cart":{"checkoutUrl":"https://exam.myshopify.com/cart/c/29567c413f68cf5e8c1cb623954f3a28"}}}
```

So: `myshopify.com` is what you get if you do nothing; a subdomain of your own domain is what you get after the documented three-step domain change. Neither is prismmtg.com itself.

### Plans

| Capability | Plan gate | Source |
| --- | --- | --- |
| Checkout served on a subdomain of your own domain | **None documented** — it is the Online Store primary-domain setting | [Migrate to Hydrogen](https://shopify.dev/docs/storefronts/headless/hydrogen/migrate), [Redirect traffic](https://shopify.dev/docs/storefronts/headless/hydrogen/migrate/redirect-traffic) |
| Checkout branding: logo, header/content/form colours, fonts, button colours, one-page vs three-page layout | All plans (checkout editor) | [Customizing and editing your checkout and accounts pages](https://help.shopify.com/en/manual/checkout-settings/customize-checkout-configurations) |
| Checkout Branding API (`checkoutBrandingUpsert`, now superseded by `checkoutAndAccountsConfigurationUpdate`) | **Plus** (or a development store) | [About checkout styling](https://shopify.dev/docs/apps/build/checkout/styling): "Checkout styling customizations are available only to Shopify Plus merchants." The [`checkoutBrandingUpsert` reference](https://shopify.dev/docs/api/admin-graphql/latest/mutations/checkoutBrandingUpsert) states "the shop must be on a Plus plan or a Development store plan." |
| Checkout UI extensions / Checkout Blocks | **Plus** | Same page |
| Domain count | 20 domains/subdomains on regular plans, 1,000 on Plus | [Domains](https://help.shopify.com/en/manual/domains) |

### Not answered by the docs

- **No page states a plan floor for the checkout-subdomain pattern.** It is described in Hydrogen/headless docs and is a plain Settings → Domains operation, but Shopify never writes "available on all plans" in so many words. Treat as strongly implied, not stated.
- **Domain masking / reverse-proxying checkout under prismmtg.com is not documented anywhere as supported, on any plan** — including Plus. The absence is consistent across the domain, checkout-settings and headless docs; it is an absence of support, not a documented prohibition.
- **`shop.app`**: cart permalinks document `payment=shop_pay` as directing buyers to a Shop Pay checkout, but no primary page states what host Shop Pay renders on. Unverified.

---

## 2. Storefront API from a no-build-step vanilla JS site

### Endpoint and version

```
POST https://{shop}.myshopify.com/api/{api_version}/graphql.json
```

Current stable version is **2026-07** ([Storefront API reference](https://shopify.dev/docs/api/storefront/latest), `api_version: 2026-07`). Shopify releases "four times a year." The store's primary domain also serves the endpoint — `https://checkout.hydrogen.shop/api/2026-07/graphql.json` responded normally in the live test above.

### Authentication — three modes

From [Storefront API reference § Authentication](https://shopify.dev/docs/api/storefront/latest):

> The Storefront API supports both tokenless access and token-based authentication.
>
> **Tokenless access** allows API queries without an access token providing access to essential features such as:
> * Products and Collections
> * Selling Plans
> * Search
> * Pages, Blogs, and Articles
> * Cart (read/write)
>
> Tokenless access has a query complexity limit of 1,000.

> * **Public access**: Used to query the API from a browser or mobile app, where the token is visible to buyers. Create a public access token with the `storefrontAccessTokenCreate` mutation on the GraphQL Admin API. Then send it in the `X-Shopify-Storefront-Access-Token` header.
> * **Private access**: Used to query the API from a server or other private context, like a Hydrogen backend, where the token stays secret. Send it in the `Shopify-Storefront-Private-Token` header.

> **Caution:** Unlike public access tokens, private access tokens should be treated as secret and not used on the client-side.

Token-based auth is only needed for: Product Tags, Metaobjects and Metafields, Menu (Online Store navigation), and Customers. **A catalog + product pages + cart + checkout handoff needs no token at all.**

| Mode | Header | Browser-safe? |
| --- | --- | --- |
| Tokenless | none | Yes — no secret exists |
| Public | `X-Shopify-Storefront-Access-Token` | Yes — "the token is visible to buyers" |
| Private / delegate | `Shopify-Storefront-Private-Token` (+ `Shopify-Storefront-Buyer-IP`) | **No** — "should be treated as secret and not used on the client-side" |

A private token is obtained via the Headless channel, a [delegate access token](https://shopify.dev/docs/apps/build/authentication-authorization/delegate-api-access), or unauthenticated scopes on an existing token. Apps are capped at "a maximum of 100 active storefront access tokens per shop."

### CORS

**Shopify's docs do not mention CORS for the Storefront API anywhere I could find.** This is a documentation gap. Verified empirically on 2026-08-20:

```
OPTIONS https://mock.shop/api            Origin: https://prismmtg.com
→ 200, access-control-allow-origin: *
       access-control-allow-methods: POST, OPTIONS
       access-control-allow-headers: *

POST https://checkout.hydrogen.shop/api/2026-07/graphql.json   Origin: https://prismmtg.com
→ 200, access-control-allow-origin: *
```

`access-control-allow-headers: *` covers `X-Shopify-Storefront-Access-Token`, so a public-token request from the browser also passes preflight. Shopify's own [Storefront Web Components](https://shopify.dev/docs/api/storefront-web-components/getting-started) — a browser-only, script-tag product — are conclusive circumstantial evidence that browser-origin requests are the intended path, since they have no server side at all.

### Rate limits

From [Shopify API limits](https://shopify.dev/docs/api/usage/limits#rate-limits):

| API | Rate-limiting method | Standard | Advanced | Plus |
| --- | --- | --- | --- | --- |
| GraphQL Admin API | Calculated query cost | 100 pts/s | 200 pts/s | 1000 pts/s |
| **Storefront API** | **None** | **None** | **None** | **None** |

> The Storefront API is designed to support businesses of all sizes, and scales to support surges in buyer traffic or your largest flash sale. **Requests from real buyers aren't subject to a fixed request-per-minute limit.**

Not cost-based, not per-token, not per-app. What is limited:

- **Bots/crawlers.** "Shopify rate-limits automated traffic — such as bots and crawlers … Unsigned, anonymous bots receive the strictest limits." Bot operators can sign requests with [Web Bot Auth](https://datatracker.ietf.org/doc/draft-meunier-web-bot-auth-architecture/) for higher limits.
- **Malicious traffic.** "If a request appears to be malicious, Shopify responds with a `430 Shopify Security Rejection` error code."
- **Checkout creation.** "Shopify limits the amount of checkouts that can be created on the Storefront API per minute. If an API client exceeds this throttle, then a `200 Throttled` error response is returned." Note the status is **200**, not 429 — the error is in the body. Shopify recommends "a request queue with an exponential backoff algorithm." The per-minute number is **not published**.
- **Input arrays**: max 250 items. **Pagination**: max 25,000 objects.
- **Cart**: max 500 line items ([Cart](https://shopify.dev/docs/storefronts/headless/building-with-the-storefront-api/cart)).

Responses include `extensions.cost.requestedQueryCost` (observed: 12 for a `cartCreate`), which is how the tokenless complexity limit of 1,000 is measured.

---

## 3. Does PRISM need `/api/shopify-edge`?

**No. It is optional at best and counterproductive in practice.**

The decisive sentence is in [Storefront API § Authentication](https://shopify.dev/docs/api/storefront/latest):

> **Public access capacity scales with the number of buyers, based on their IP address.**

And on the private-token path ([same page](https://shopify.dev/docs/api/storefront/latest#make-server-side-requests-with-a-private-access-token)):

> When the request results from buyer traffic, also include the `Shopify-Storefront-Buyer-IP` (case-sensitive) header with the buyer's IP address. Shopify uses this header to enforce IP-level bot and platform protection and to manage traffic from a single high-volume user, such as a bot.
>
> **Caution:** Without the `Shopify-Storefront-Buyer-IP` header, Shopify can't differentiate requests from different buyers, which can result in throttled API requests, limited bot protection, and unauthenticated flows at checkout.

Concretely:

1. **There is no secret to hide.** Tokenless access covers products, collections, search, content and cart read/write. Even a public token is documented as buyer-visible. The Moxfield/Archidekt precedent does not transfer — those proxies exist because those APIs reject browser origins; Shopify sends `access-control-allow-origin: *`.
2. **A proxy makes capacity worse.** All buyers arrive from Netlify's edge egress IPs. That is exactly the "single high-volume user" shape Shopify's own caution describes, and it forfeits per-buyer capacity scaling.
3. **A proxy can be made correct, but only with work.** Forwarding the real client IP requires a private token plus a correct `Shopify-Storefront-Buyer-IP` header — a new secret to manage, in exchange for capacity you already had for free.
4. **One legitimate reason to keep a proxy exists**: the cart-ID secret (see §5), which Shopify says not to put in client-side code. If PRISM decides to honour that caution literally, cart mutations must move server-side. Shopify's own browser-only Web Components do not honour it, which is a real inconsistency in Shopify's guidance — flagged, not resolved.

---

## 4. What the anon Storefront token exposes

From [Access scopes § Unauthenticated access scopes](https://shopify.dev/docs/api/usage/access-scopes#unauthenticated-access-scopes):

> Unauthenticated access scopes provide apps with read-only access to the Storefront API. Unauthenticated access is intended for interacting with a store on behalf of a customer.

Complete documented list:

| Scope | Access |
| --- | --- |
| `unauthenticated_read_checkouts`, `unauthenticated_write_checkouts` | `Cart` object |
| `unauthenticated_read_customers`, `unauthenticated_write_customers` | `Customer` object |
| `unauthenticated_read_customer_tags` | `tags` field on `Customer` |
| `unauthenticated_read_content` | `Article`, `Blog`, `Comment` |
| `unauthenticated_read_metaobjects` | `Metaobject` |
| `unauthenticated_read_product_inventory` | `quantityAvailable` on `ProductVariant`, `totalAvailable` on `Product` |
| `unauthenticated_read_product_listings` | `Product` and `Collection` |
| `unauthenticated_read_product_pickup_locations` | `Location`, `StoreAvailability` |
| `unauthenticated_read_product_tags` | `tags` field on `Product` |
| `unauthenticated_read_selling_plans` | Selling plan content on `Product` |

Answers to the specific questions:

- **Customer data:** only via `unauthenticated_read_customers` / `unauthenticated_write_customers`, and only through the `Customer` object, which requires a customer access token to resolve a specific customer. Grant it only if you build accounts. Note the page's own header calls unauthenticated scopes "read-only" while the table lists three `write_` scopes — an internal inconsistency in Shopify's own doc.
- **Orders:** no unauthenticated scope grants order access. Orders are reachable only through an authenticated customer via the [Customer Account API](https://shopify.dev/docs/api/customer).
- **Inventory quantities:** yes, but only with `unauthenticated_read_product_inventory` explicitly granted, and only `quantityAvailable` / `totalAvailable`. Tokenless access does not include it — the [Web Components getting-started guide](https://shopify.dev/docs/api/storefront-web-components/getting-started) says a token is needed "if you want to display the inventory count."
- **Draft/unpublished products:** the Storefront API is a **sales channel**. The Headless channel "gives you all of Shopify's channel features, such as product publishing, scheduled product publishing" ([Manage headless channels](https://shopify.dev/docs/storefronts/headless/building-with-the-storefront-api/manage-headless-channels)). Products not published to the channel are not returned. **Shopify does not state this as an explicit security guarantee on the Storefront API reference page** — it follows from the channel model rather than from a sentence I can quote.

**Abuse risks and mitigations Shopify names:**

- Bot/crawler rate limiting, with Web Bot Auth as the sanctioned escape hatch for legitimate crawlers.
- `430 Shopify Security Rejection` for traffic judged malicious.
- Checkout-creation throttle (`200 Throttled`).
- "We recommend only requesting the scopes that your app needs, to reduce the security risk if the token leaks."
- Max 100 active storefront access tokens per shop, and tokens are rotatable from the Headless channel.
- Plus-only [bot protection](https://help.shopify.com/manual/checkout-settings/bot-protection) for cart.

**Not answered:** Shopify does not document any way to restrict a public storefront token by referring origin, domain allowlist, or referrer. Anyone can copy the token (or use tokenless access) and query the same catalog from anywhere. Shopify's position is that this is acceptable because the data is public catalog data.

---

## 5. Cart API state of play

### Checkout API is sunset

From [Migrate to the Storefront Cart API](https://shopify.dev/docs/storefronts/headless/building-with-the-storefront-api/cart/migrate-to-cart-api):

> In API version **2024-04**, Checkout APIs on the REST Admin and Storefront API are deprecated, with the exception of the REST Admin API's Abandoned checkouts resource. In version **2025-04**, the Checkout APIs will be sunset and no longer function.

From the changelog entry [Checkout APIs will be shut down April 1, 2025](https://shopify.dev/changelog/checkout-apis-will-be-shut-down-april-1-2025) (dated March 2, 2025, version 2025-04, flagged *Deprecation announcement / Action required*):

> Reminder: The Checkout APIs (Storefront Checkout Mutations and REST Checkout Endpoints) are deprecated and will be shut off on April 1, 2025. Customers will not be able to create or complete checkouts using the deprecated Checkout APIs after the deadline.

This date is in the past. There is no fallback; Cart API is the only path.

### Minimal happy path (2026-07 field names)

Shopify's [Create and update a cart](https://shopify.dev/docs/storefronts/headless/building-with-the-storefront-api/cart/manage) guide is a **two**-step happy path, not three — `cartCreate` takes lines directly, so `cartLinesAdd` is only needed for later additions.

1. **`cartCreate`** — [reference](https://shopify.dev/docs/api/storefront/latest/mutations/cartCreate): "Creates a new `Cart` for a buyer session. You can optionally initialize the cart with merchandise lines, discount codes, gift card codes, buyer identity for international pricing, and custom attributes. The returned cart includes a `checkoutUrl`."

   ```graphql
   mutation {
     cartCreate(input: {
       lines: [{ quantity: 1, merchandiseId: "gid://shopify/ProductVariant/1" }]
     }) {
       cart { id checkoutUrl cost { totalAmount { amount currencyCode } } }
       userErrors { message }
       warnings { ... }
     }
   }
   ```

2. **`cartLinesUpdate`** (quantity change) / `cartLinesAdd` / `cartLinesRemove`; also `cartBuyerIdentityUpdate`, `cartDiscountCodesUpdate`, `cartMetafieldsSet`, and four `cartDeliveryAddresses*` mutations.

3. **Read `checkoutUrl`** — `query { cart(id: "...") { checkoutUrl } }`. The guide warns:

   > For security reasons, the `checkoutUrl` should be requested when the buyer is ready to navigate to checkout and can be re-requested if it is stale.

### Cart ID shape and the secret

> The cart ID consists of a token and a secret key parameter in the form of `<token>?key=<secret>`. When you work with any Cart API, you must always provide the full ID. […] If you do not include the secret key during a query, the buyer's private details (such as email or address) will be removed from the cart response. Additionally, if you attempt to modify the cart through a mutation without a key, the mutation will fail with an error message indicating the cart does not exist.
>
> **Caution:** Never expose the `secret` part of the ID. Treat it like a password—don't include it in shareable links, public pages, or any client-side code.
>
> **Caution:** Shopify may change the format and length of cart tokens at any time. Apps must be built to handle cart tokens of any format.

**This is the sharpest unresolved tension in the whole research.** A browser-only cart has nowhere to keep the cart ID but `localStorage`, which is client-side code by any reading. Shopify's own Storefront Web Components do exactly that. Shopify does not reconcile the two positions anywhere I could find. Practical reading: the caution is aimed at *sharing* the ID (links, server logs, public pages), not at the buyer's own browser holding their own cart — but that reading is inference, not documentation.

### Cart persistence

From [Cart § Speed and scale](https://shopify.dev/docs/storefronts/headless/building-with-the-storefront-api/cart):

> * **Rate limits:** Carts don't have any global API rate limits.
> * **Cart limits:** A shop or customer can create an unlimited number of carts.
> * **Abandoned carts:** Unused and abandoned carts automatically expire within **30 days** of creation.
> * **Completed carts:** Shopify automatically deletes the cart when the customer completes their checkout.

And from the migration guide: "Completed carts are deleted upon order creation. Unlike the Checkout API, you can't query a completed cart for order information or completion status." Also: "No webhooks are fired for `cart/create` or `cart/update` for the Storefront Cart API."

---

## 6. Cart permalinks

Documented in two places — [help.shopify.com § Cart permalinks](https://help.shopify.com/en/manual/checkout-settings/cart-permalink) and [shopify.dev § Create cart permalinks](https://shopify.dev/docs/apps/build/checkout/create-cart-permalinks).

**Format:**

```
https://{shop}.myshopify.com/cart/{variant_id}:{quantity}(,{variant_id}:{quantity})*
```

Multiple lines are comma-separated. Documented example:

```
https://my-shop-name.myshopify.com/cart/36485954240671:3,31384149360662:1
```

**Documented query parameters:**

| Parameter | Effect |
| --- | --- |
| `discount` | Apply discount code(s), comma-separated. Codes containing commas cannot be passed. |
| `note` | Displays in the Notes section on the order details page |
| `attributes[key]=value` | Custom attributes; multiple allowed; display in Notes |
| `properties` | Line item properties, Base64 URL-encoded JSON, up to 25 |
| `checkout[...]` | Pre-fill checkout fields (email, shipping address) |
| `access_token` | Storefront access token, for sales-channel attribution |
| `source_name` | Match an attribution handle owned by your app |
| `ref` | Referral code in the Conversion summary |
| `storefront=true` | Land on the online-store cart page instead of checkout |
| `payment=shop_pay` | Direct the buyer to Shop Pay checkout |
| locale path prefix | e.g. `/fr/cart/...` for a localized checkout |

Documented example with discount: `https://my-shop-name.myshopify.com/cart/36485954240671:1?payment=shop_pay&discount=15off`

**Documented limitations:** "Selling plans don't work with cart permalinks." "Cart permalinks cannot bypass storefront passwords."

**Stability:** Both pages present permalinks as ordinary supported functionality — a merchant-facing help article plus a developer guide under `apps/build/checkout`. Neither page carries a beta, deprecation, or "convenience only" caveat. Neither carries an explicit stability guarantee either; there is no API version attached to permalinks, so they are outside Shopify's versioning contract. **Shopify does not document a maximum number of variants per permalink.**

Because the host is the store's primary domain, the same primary-domain configuration from §1 applies: with `checkout.prismmtg.com` set as Primary, permalinks would be built against that host.

---

## 7. Buy Button / embed script

### Status

| Fact | Evidence |
| --- | --- |
| `buy-button-js` v3.0.6 released 2025-08-25; commits through 2026-08-14; not archived; MIT | [GitHub repo](https://github.com/Shopify/buy-button-js) (releases + commits API, checked 2026-08-20) |
| Depends on `shopify-buy` 3.0.7 — the JS Buy SDK | [package.json](https://github.com/Shopify/buy-button-js/blob/main/package.json) |
| **JS Buy SDK is deprecated** | [js-buy-sdk README](https://github.com/Shopify/js-buy-sdk): "**The JS Buy SDK is deprecated as of January, 2025.** It will no longer be updated or maintained by Shopify past that point. A final major version, v3.0, has been released to remove the SDK's dependency on the deprecated Checkout APIs, replacing them with Cart APIs. […] Recommended Option: switch to the Storefront API Client" |
| No deprecation notice on `buy-button-js` itself | Its README covers v3.0 troubleshooting only |
| Shopify discourages Buy Buttons on your own Shopify store | [Buy Button channel](https://help.shopify.com/en/manual/online-sales-channels/buy-button): they "do not recommend the use of Buy Buttons on your Shopify online store or blog, because they can cause problems with the checkout process." Also "Buy Buttons created before October 10, 2016 are no longer supported." |
| Available on all Shopify plans | Same page |
| CDN still live | `https://sdks.shopifycdn.com/buy-button/latest/buy-button-storefront.min.js` → HTTP 200 (verified 2026-08-20) |

So: a maintained wrapper around an explicitly deprecated core, with an active discouragement from Shopify's own help centre for the closest analogous use case.

### Styling control

From [BuyButton.js customization docs](https://shopify.github.io/buy-button-js/customization/):

- Components render **inside iframes by default** — "Iframes are beneficial for most users because they isolate the embed in a 'sandbox' so that other parts of your website don't interact with it in unwanted ways." `iframe` defaults to `true` for top-level components, `false` for nested ones.
- Customization is a JS `options` object per component: `contents` (boolean toggles per element), `text` (labels), `styles` (CSS-shaped nested objects incl. pseudo-selectors), `order`, `events`, `classes`, `templates` (Mustache), `DOMEvents`.
- Turning off the iframe to use your own CSS means the components "will appear unstyled" — you inherit the full styling burden with no Shopify defaults.

**Can it match Web Awesome?** Only by re-declaring PRISM's design tokens as JS style objects inside the iframe, or by disabling iframes and rewriting every template. Both paths mean the Buy Button ends up styled *parallel to* `custom.css` rather than *by* it — the `--wa-*` custom properties on PRISM's `:root` do not cross an iframe boundary. This is precisely the "hardest to make look like PRISM" cost the issue anticipated.

---

## 8. Anything else that changes the decision

### Storefront Web Components — a fourth option

[Storefront Web Components](https://shopify.dev/docs/api/storefront-web-components) are not in the issue's option list but map onto PRISM's constraints better than any of the three.

> Storefront Web Components let you bring Shopify-powered commerce capabilities to any website. Display products, showcase collections, and offer a checkout, all with a few lines of embedded HTML.

From [Getting started](https://shopify.dev/docs/api/storefront-web-components/getting-started):

```html
<script src="https://cdn.shopify.com/storefront/web-components.js"></script>
<shopify-store store-domain="https://your-store.myshopify.com" country="US" language="en"></shopify-store>
<shopify-context type="product" handle="your-product-handle">
  <template>
    <h1 class="your-style"><shopify-data query="product.title"></shopify-data></h1>
  </template>
</shopify-context>
```

> **You don't need an access token to use Storefront Web Components.** However, if you want to display the inventory count or any custom data about a product, then you need to add an access token.

Key properties for PRISM:

- **Script tag from Shopify's CDN, no bundler** — the same delivery model as the Web Awesome kit already in every `<head>`.
- **Custom elements with `<template>` slots**, so the surrounding markup is yours: "Since the component outputs a text node, to match your site's design you can wrap it in any necessary HTML elements." This is genuinely different from Buy Button — your HTML, Shopify's data.
- **Components:** `shopify-store`, `shopify-context`, `shopify-list-context`, `shopify-data`, `shopify-media`, `shopify-money`, `shopify-variant-selector`, `shopify-cart`, `shopify-account` ([full list](https://shopify.dev/docs/api/storefront-web-components/components)).
- **`<shopify-cart>`** renders into a native `<dialog>`, exposes `showModal()` / `show()` / `close()` / `addLine()`, and is styled via **CSS parts** (`dialog`, `line-heading`, `line-image`, `line-price`, `primary-button`, `secondary-button`, `tertiary-button`, `input-field`, `discount-code`, `discount-error`) and slots ([reference](https://shopify.dev/docs/api/storefront-web-components/components/shopify-cart)). Real `::part()` styling, not an iframe.
- `<shopify-store>` exposes a `buyNow(e, options)` method for skipping the cart.
- Caveat: "The cart component doesn't support mixing products from multiple stores."
- The track is actively developed — [`shopify-account` shipped 2026-02-18](https://shopify.dev/changelog/shopify-account-web-component-for-storefronts) and is on its way to being *required* for Theme Store themes.
- **Not answered:** the docs carry no stability label (GA / beta / preview) and no API version for the web-components bundle. `web-components.js` is unversioned and auto-updating — Shopify pushes changes to it without a version pin on your side. That is a real risk axis with no documentation to quantify it.

The seam is identical to the Storefront API option (checkout on Shopify's hosted checkout via `checkoutUrl`); the difference is purely how much JavaScript PRISM writes.

### Hydrogen / Oxygen

Irrelevant. [Options for building headless](https://shopify.dev/docs/storefronts/headless/getting-started/build-options) frames Hydrogen as "Shopify's opinionated fullstack approach" built on React Router, deployed to Oxygen. PRISM has no bundler, no React, no Node runtime, and is hosted on Netlify. The correct row of Shopify's own table is "Build headless using the framework of your choice and Shopify's backend using only the Storefront API → Headless channel."

The only Hydrogen artifact worth borrowing is the **checkout-subdomain routing pattern**, which the docs explicitly generalize: "For custom storefronts not hosted on Oxygen, only the subdomain must point to Shopify."

### Customer Account API

[Customer Account API](https://shopify.dev/docs/api/customer) is where orders and account data live; it is cost-limited (100 pts/s standard, 200 Plus) unlike the Storefront API. Not needed for anonymous catalog + cart + checkout. If PRISM ever wants "my orders" inside prismmtg.com, `<shopify-account>` is the low-effort path (passwordless + social sign-in, "styling control via CSS variables"). Note that Shopify accounts are a **separate identity system from PRISM's Supabase auth** — nothing in the docs bridges them, and merging them is not a documented capability.

### Product images

The Storefront API [`Image`](https://shopify.dev/docs/api/storefront/latest/objects/Image) object returns Shopify-CDN URLs and the `url` field accepts an `ImageTransformInput` for "resizing, cropping, scaling for retina displays, and converting between image formats," plus a `thumbhash` field for placeholders. Serving those URLs directly from prismmtg.com is the documented, intended use — the same as `<shopify-media>`, which "generates an image or video element with `srcset` and `sizes` attributes." No CSP or hotlink restriction is documented; PRISM would need `cdn.shopify.com` added to any image CSP.

### Prices and taxes

[`CartCost`](https://shopify.dev/docs/storefronts/headless/building-with-the-storefront-api/cart/manage) distinguishes three pricing surfaces:

> * **Checkout pricing**: The final sale price.
> * **Cart pricing**: The estimated final sale price.
> * **Product queries**: The price that displays on a product page.

And on `Cart.cost`: "The estimated costs that the buyer will pay at checkout. The costs are subject to change and changes will be reflected at checkout."

So any price PRISM renders is an estimate; tax and shipping resolve on Shopify's checkout. **Shopify does not document any legal requirement about how a custom storefront must display prices or taxes** — no primary page covers this. Jurisdictional price-display law is outside Shopify's docs entirely; note as a gap, not as "no requirement exists."

### Terms and branding

The [Shopify API License and Terms of Use](https://www.shopify.com/legal/api-terms) governs *Applications* built by Partners. Its relevant restrictions are: no "systematic or automated data collection activities (including scraping, data mining, data extraction and data harvesting)"; request no "more than the minimum amount of data … needed"; and use Shopify's Trademarks only per the brand guidelines and "for the sole purpose of notifying Merchants that the Application is compatible with the Service."

**Not answered:** the API terms are written for third-party developers building for other merchants, not for a merchant building their own storefront over their own catalog. No primary page states an attribution or "Powered by Shopify" requirement for a custom storefront. Shopify's whole headless product line presupposes merchants render their own catalog on their own domain, so the practical answer is clearly "allowed" — but I found no clause that says so explicitly. Do not treat the absence of a branding requirement as a documented permission.

---

## Decision inputs

| Axis | Buy Button (`buy-button-js`) | Cart permalinks | Storefront Web Components | Storefront API (hand-rolled `fetch`) |
| --- | --- | --- | --- | --- |
| **Visual control** | Low. Iframe-sandboxed by default; styles are a JS object tree; `--wa-*` tokens don't cross the iframe. Disabling the iframe means fully unstyled components. | Total for the pages you write (they're just PRISM pages) — zero control over the destination. | High. Your markup and CSS in `<template>`; `<shopify-cart>` styled via `::part()` and slots. Cart chrome is still Shopify's DOM. | Total. Every element is PRISM markup, styled by `custom.css` and Web Awesome tokens like every other page. |
| **Work for a no-build-step vanilla site** | Low to write, high to make look right. One script tag; then fight the styling model. | Lowest. Static product pages plus one `<a href>` per product. No JS, no API. | Low. One script tag, declarative custom elements. Familiar model — same shape as the Web Awesome autoloader already in every `<head>`. | Highest. Hand-write GraphQL queries, cart-state module, `localStorage` persistence, error/throttle handling, variant selection. A new `js/modules/shopify.js` plus feature modules. |
| **Where the seam falls** | Buyer leaves for Shopify checkout from inside an iframe-hosted cart. | Buyer leaves at the very first click — no cart in PRISM at all. | Buyer leaves at "Checkout" from a PRISM-styled cart dialog. Same `checkoutUrl`. | Buyer leaves at "Checkout" from a fully PRISM cart. Same `checkoutUrl`. |
| **Host at the seam** | Store primary domain (`checkout.prismmtg.com` if configured, else `*.myshopify.com`) | Same | Same | Same |
| **Edge function needed** | No | No | No | No — and a proxy would hurt (per-buyer IP capacity) |
| **Token needed** | Public storefront access token | None (optional `access_token` for attribution) | None for catalog + cart; token only for inventory counts, metafields, metaobjects, accounts | None for catalog + cart; same exceptions |
| **What breaks it** | JS Buy SDK deprecated Jan 2025; Shopify discourages Buy Buttons near your own store; iframe styling ceiling | No cart, no quantity edits, no multi-item basket UX beyond one prebuilt link; selling plans unsupported; no discount codes containing commas | Unversioned auto-updating CDN bundle with no stability label; cart DOM is Shopify's; single-store only | You own cart-state bugs, `200 Throttled` handling, cart-ID/secret storage, and the 30-day cart expiry |
| **Ongoing version risk** | Deprecated dependency, no sunset date announced for the wrapper | Outside API versioning; no announced changes | Unversioned bundle — Shopify pushes changes with no pin | Versioned (`2026-07`), 4 releases/year, explicit deprecation changelogs |

**Cross-cutting facts that hold for all four:**

- The final payment step is on Shopify's hosted checkout. The only lever is *which host* — `*.myshopify.com` by default, or a subdomain of prismmtg.com after a Settings → Domains change. Never prismmtg.com itself.
- Making checkout render at `checkout.prismmtg.com` means setting that subdomain as the store's **Primary** domain with target **Online Store**. Note the wording collision with the issue: the issue rules out a `shop.` subdomain *for the storefront*; the checkout subdomain is a different thing and is unavoidable if you want to leave `myshopify.com` behind.
- Checkout look-and-feel below Plus is limited to the checkout editor: logo, colours, fonts, one-page vs three-page. The Checkout Branding API is Plus-only.
- The Checkout API is dead (April 1, 2025). Anything built now uses Cart.
- Carts expire 30 days after creation; completed carts are deleted and cannot be queried.

## Limitations

- Live verification used Shopify's public demo stores (`mock.shop`, `checkout.hydrogen.shop`) on 2026-08-20, not PRISM's own store. Behaviour on a store with different plan/settings could differ; nothing observed suggests it would.
- CORS behaviour is **observed**, not documented. Shopify could change it without a versioned deprecation notice, since it is not part of the GraphQL schema contract.
- The checkout-creation throttle number is not published, so the practical ceiling on cart→checkout conversions per minute is unknown.
- No primary source states a plan floor for the checkout-subdomain pattern, states that domain-masking checkout is prohibited (only that it is undocumented), or states branding/attribution requirements for a merchant's own custom storefront. Those are documentation gaps, deliberately left unfilled here.
