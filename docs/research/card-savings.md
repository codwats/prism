# Card savings: prices, staple frequency and worked examples for a PRISM savings explainer

All prices were pulled on **2026-10-18** (about 21:36 UTC). Sources and how they were read:

- **TCGplayer Market (retail):** taken from Scryfall's `prices.usd` field through the Scryfall API (`api.scryfall.com/cards/named` and `/cards/search?unique=prints&order=usd`). Scryfall's `usd` price is the TCGplayer market price, so it is cited as "TCGplayer Market via Scryfall". I did not open TCGplayer product pages directly.
- **Card Kingdom buylist (cash):** taken from Card Kingdom's public price list JSON, [api.cardkingdom.com/api/v2/pricelist](https://api.cardkingdom.com/api/v2/pricelist) (`meta.created_at` = 2026-10-18 14:08:16). I used `price_buy` (cash buy price for Near Mint) and counted a printing as "buying" only when `qty_buying > 0`. Non-foil only.
- **EDHREC:** card JSON at `json.edhrec.com/pages/cards/<slug>.json`. Inclusion = `num_decks / potential_decks`, which is the percentage EDHREC shows on each card page. Average decks come from `json.edhrec.com/pages/average-decks/<slug>.json`, and the top commanders list ("Past 2 Years") from `json.edhrec.com/pages/commanders/year.json`. All read 2026-10-18.

## 1. README "Real World Impact" table: does it hold?

### Takeaway
The table's magnitudes are about right, but the numbers can't be reproduced from today's data, and the 5-deck row overstates what you would get selling to a buylist. I recomputed it with today's EDHREC average decks for the top commanders. The 10-deck and 48-deck rows are at or below today's Card Kingdom cash buylist totals, so they read as conservative. The 5-deck row ($919) is higher than both the buylist total ($580 to $772) and the TCGplayer retail total ($843). The README does not record its method (which commanders, which date, retail or buylist, whether basics count), so its card counts (166, 358, 2,295) can't be checked exactly.

### Cited Findings
- The README table currently reads: 5 decks, 166 cards, ~$919; 10 decks, 358 cards, ~$1,637; 48 decks, 2,295 cards, ~$9,680. It is captioned "Based on average EDHREC decklists for top commanders" and followed by "Sell the duplicates and put the money into your next deck." — `/home/cody/Projects/prism/README.md` lines 63–75
- PRODUCT.md says the table "is real, computed from average EDHREC decklists for top commanders — confirmed reusable in future marketing/landing work". — `/home/cody/Projects/prism/PRODUCT.md` (Evidence on Hand)
- **My recompute (2026-10-18).** Inputs: the first N commanders of EDHREC's "Past 2 Years" list (Y'shtola, Night's Blessed; Edgar Markov; The Ur-Dragon; Atraxa, Praetors' Voice; Krenko, Mob Boss; …) and each commander's EDHREC average deck. A duplicate is Σ over card names of (total copies across the N decks − the largest quantity any one deck needs), which is the number of copies one shared collection lets you skip. Commanders are excluded. — [EDHREC top commanders](https://edhrec.com/commanders/year), [EDHREC average decks](https://edhrec.com/average-decks/atraxa-praetors-voice)

| Decks | Duplicate copies (of which basics) | TCGplayer Market, default printing | CK cash buylist, lowest printing CK is buying | CK cash buylist, median printing | README says |
|---|---|---|---|---|---|
| 5 | 101 (28) | $843 | $580 | $772 | 166 cards, ~$919 |
| 10 | 328 (95) | $2,341 | $1,564 | $2,113 | 358 cards, ~$1,637 |
| 48 | 2,592 (628) | $15,322 | $10,210 | $13,672 | 2,295 cards, ~$9,680 |

  Sources for the table: [Scryfall API](https://api.scryfall.com/cards/collection) for TCGplayer Market prices, and the [Card Kingdom pricelist](https://api.cardkingdom.com/api/v2/pricelist) for buylist prices.
- The dollar value comes mostly from a few expensive staples. In the 48-deck set the largest contributors are Rhystic Study (14 extra copies × $68.13), Demonic Tutor (13 × $65.44), Smothering Tithe (11 × $58.16), Fierce Guardianship (7 × $64.27) and Cyclonic Rift (11 × $39.16). — Scryfall API, 2026-10-18
- The recompute priced basic lands at $0 on the TCGplayer column, because the Scryfall collection lookup returned no `usd` price for the default basic printing. Basics would add only a few dollars (see section 4).

### Inferences
- Do these rows hold as "resale" (buylist)? The 10-deck row ($1,637 against $1,564 to $2,113) holds. The 48-deck row ($9,680 against $10,210 to $13,672) holds and is conservative. The 5-deck row ($919 against $580 to $772) is wrong for resale. It sits at or above even the retail total.
- Suggested corrected rows if the column stays labelled "Resale value" and uses the conservative buylist method: 5 decks ≈ 100 cards, ~$580; 10 decks ≈ 330 cards, ~$1,560; 48 decks ≈ 2,600 cards, ~$10,200. Any figure should carry "Card Kingdom cash buylist, October 2026" next to it.
- Card counts change a lot with which commanders are chosen. The README's 166 for 5 decks against my 101 is the biggest gap, which suggests a different commander list or an older snapshot. The safest fix is to state the method in the README, or regenerate the table with the script approach above and record the date.
- Prices change daily. A README table without a date will go stale. Rounding to "about $600 / $1,500 / $10,000" would be more durable.

### Gaps
- I could not recover the README's original method or date, so I can't say why its card counts differ.
- I did not check whether the README's numbers included basic lands.
- CK's buylist price assumes Near Mint, and CK also pays more in store credit. I did not verify the current credit bonus.

## 2. Current prices for the named staples

### Takeaway
Cheap staples (Sol Ring, Arcane Signet, Command Tower, Swords to Plowshares) cost $0.25 to $1.70 at retail and buylist for $0.06 to $1.30. The savings case rests on the $30 to $70 cards: Cyclonic Rift, Rhystic Study, Smothering Tithe, Demonic Tutor, Esper Sentinel and Fierce Guardianship. Their buylist prices are roughly 55 to 85% of retail.

### Cited Findings
All prices are from 2026-10-18 and are non-foil. TCGplayer Market prices come from the [Scryfall API](https://api.scryfall.com/cards/search?q=!%22Sol%20Ring%22&unique=prints&order=usd). CK buylist prices come from the [Card Kingdom pricelist](https://api.cardkingdom.com/api/v2/pricelist).

| Card | Cheapest printing, TCGplayer Market | Scryfall default printing, TCGplayer Market | CK cash buylist (common printings) | EDHREC inclusion |
|---|---|---|---|---|
| Sol Ring | $1.25 (Foundations Commander #286; Final Fantasy Commander #356) | $1.66 (Reality Fracture Commander #21) | $0.45 (Commander Masters, Duskmourn Cmdr), $0.70 (Reality Fracture Cmdr), $0.95 (Edge of Eternities Cmdr), $1.30 (Foundations Cmdr) | 83.3% |
| Arcane Signet | $0.39 (Final Fantasy Commander) | $1.16 (Reality Fracture Cmdr) | $0.10 to $0.26 (Final Fantasy, Reality Fracture Cmdr) | 71.7% |
| Command Tower | $0.23 (Starter Commander Decks) | $0.32 (Reality Fracture Cmdr) | $0.06 to $0.20 | 73.7% |
| Lightning Greaves | $3.54 (Aetherdrift Commander) | $4.00 (Marvel Super Heroes Cmdr) | $3.00 (Aetherdrift Cmdr); lowest buying printing $1.20 (Doctor Who) | 24.6% |
| Swords to Plowshares | $1.07 (Reality Fracture Cmdr) | $1.07 | $0.95 (Reality Fracture Cmdr), $1.30 (Foundations Cmdr) | 61.0% |
| Cyclonic Rift | $28.92 (Double Masters) | $39.16 (Ravnica Remastered, `rvr` #40) | $17.50 (Commander Masters), $20.00 (Double Masters, Return to Ravnica) | 20.0% |
| Rhystic Study | $68.05 (Secret Lair) / $68.13 (Jumpstart 2022) | $69.03 (Jumpstart 2022) | $38 to $42 (Jumpstart, Jumpstart 2022, Prophecy) | 22.0% |
| Smothering Tithe | $54.28 (Ravnica Allegiance) | $58.16 (Commander Masters) | $39.00 (Ravnica Allegiance), $42.00 (Commander Masters) | 19.7% |
| Demonic Tutor | $11.78 (Secrets of Strixhaven #80, see note) | $66.93 (Commander Masters) | $50 to $54 (Ultimate Masters, Strixhaven Mystical Archive, Commander Masters) | 18.4% |
| Esper Sentinel | $52.77 (Modern Horizons 2) | $55.40 (MH2) | $39.00 (MH2) | 18.5% |
| Fierce Guardianship | $60.55 (Commander 2020) | $63.67 (Commander Masters) | $47.00 (Commander 2020), $51.00 (Commander Masters) | 17.1% |

- The Cyclonic Rift default printing on Scryfall is set code `rvr` #40, which is Ravnica Remastered, at $39.16. — [Scryfall API](https://api.scryfall.com/cards/named?exact=Cyclonic%20Rift)
- Demonic Tutor shows a $11.78 printing in "Secrets of Strixhaven" (`sos` #80) and $12.10 for its promo. The Card Kingdom pricelist had no buylist entry for that printing on 2026-10-18. The median across all Demonic Tutor printings is $78.98. — [Scryfall API](https://api.scryfall.com/cards/search?q=!%22Demonic%20Tutor%22&unique=prints&order=usd)
- The EDHREC denominators (`potential_decks`) differ by card because EDHREC counts only decks whose color identity allows the card. Sol Ring, Arcane Signet and Command Tower are colorless, so they count against all 10,323,797 decks. Swords to Plowshares is counted against 4,810,605 white-identity decks, and Cyclonic Rift against 5,081,088 blue-identity decks. Exact counts: Sol Ring 8,598,326; Arcane Signet 7,404,143; Command Tower 7,607,520; Swords to Plowshares 2,934,023; Cyclonic Rift 1,018,194. — [EDHREC Sol Ring](https://edhrec.com/cards/sol-ring), [EDHREC Arcane Signet](https://edhrec.com/cards/arcane-signet), [EDHREC Command Tower](https://edhrec.com/cards/command-tower), [EDHREC Swords to Plowshares](https://edhrec.com/cards/swords-to-plowshares), [EDHREC Cyclonic Rift](https://edhrec.com/cards/cyclonic-rift), read 2026-10-18
- Card Kingdom's buylist sometimes pays close to or above TCGplayer Market on cheap precon printings. Foundations Commander Sol Ring buylists at $1.30, against a TCGplayer Market of $1.25 and a CK retail price of $2.79. — CK pricelist; Scryfall API

### Inferences
- Swords to Plowshares runs in 61% of decks that can play it, and Cyclonic Rift in 20%. Quote these as "% of eligible decks", the way EDHREC's pages do. The Sol Ring figure is "83% of all Commander decks on EDHREC".
- The Demonic Tutor reprint price is new and likely to move. For an explainer, use a card with a stable price, such as Smothering Tithe or Rhystic Study.

### Gaps
- I did not load TCGplayer product pages directly. All retail figures are TCGplayer Market as reported by Scryfall.
- Foil, borderless and Secret Lair printings were left out on purpose. Some of them buylist for $30 to $1,800 (for example, Alpha Sol Ring has a $1,680 buy price).

## 3. Worked examples

### Takeaway
Sharing Sol Ring across 5 decks saves about $5 to $7 at retail, or brings back $2 to $5 on a buylist. That is enough to explain the idea but not enough to sell it. A $55 staple shared across 3 decks saves about $110 at retail, or brings back about $80 cash. Use the pricey staple as the headline example.

### Cited Findings (arithmetic)
Prices are from 2026-10-18 and come from the [Scryfall API](https://api.scryfall.com/cards/search?q=!%22Sol%20Ring%22&unique=prints&order=usd) (TCGplayer Market) and the [CK pricelist](https://api.cardkingdom.com/api/v2/pricelist) (cash buylist).

**Sol Ring in 5 decks.** One copy covers all 5, so you need 4 fewer copies.
- Copies you don't buy, at the cheapest retail printing: 4 × $1.25 = **$5.00**
- At the default precon printing (Reality Fracture Commander): 4 × $1.66 = **$6.64**
- Sell back 4 copies you already own, at CK cash: 4 × $0.45 (Commander Masters or Duskmourn Cmdr) = **$1.80**. Reality Fracture: 4 × $0.70 = **$2.80**. Foundations Commander: 4 × $1.30 = **$5.20**.

**Smothering Tithe in 3 decks.** You need 2 fewer copies.
- Not bought, cheapest retail printing (Ravnica Allegiance): 2 × $54.28 = **$108.56**
- Not bought, Commander Masters: 2 × $58.16 = **$116.32**
- Sold back, CK cash: 2 × $39.00 (RNA) = **$78.00**. Commander Masters: 2 × $42.00 = **$84.00**.

**Alternative pricey example: Cyclonic Rift in 3 decks.** You need 2 fewer copies.
- Not bought: 2 × $28.92 (Double Masters) = **$57.84**
- Sold back, CK cash: 2 × $20.00 = **$40.00**. Commander Masters: 2 × $17.50 = **$35.00**.

**Combined "starter shelf" example: one copy each of Sol Ring, Arcane Signet, Command Tower, Swords to Plowshares and Smothering Tithe, shared across 3 decks.** You need 2 fewer of each.
- Retail at the cheapest printings: 2 × ($1.25 + $0.39 + $0.23 + $1.07 + $54.28) = 2 × $57.22 = **$114.44**

### Inferences
- When you talk about what someone stops buying (retail) or what they can sell back (buylist), keep the two numbers separate. Buylist cash runs about 25% to 75% of retail on cheap cards, and about 65% to 75% on the $50+ staples.

### Gaps
- None for the arithmetic itself. Prices will drift after 2026-10-18.

## 4. Basic lands

### Takeaway
A typical average deck runs about 35 lands, of which about 15 are basics. Basics cost cents, so sharing them saves little money. The honest gain is fewer cards to buy, sleeve and store.

### Cited Findings
- Across the EDHREC average decks of the top 48 commanders ("Past 2 Years"), the mean is 35.2 lands per deck and 15.4 basics (median 15, range 8 to 30). Atraxa's average deck, for example, has 36 lands: 13 basic and 23 nonbasic. — [EDHREC average decks](https://edhrec.com/average-decks/atraxa-praetors-voice), read 2026-10-18
- Island, non-full-art paper printings, TCGplayer Market: minimum $0.07, 25th percentile $0.16, median $0.25 (507 printings priced). Full-art Islands: minimum $0.17, 25th percentile $0.31, median $0.47 (102 printings). — [Scryfall API](https://api.scryfall.com/cards/search?q=!%22Island%22%20game:paper%20is:fullart&unique=prints&order=usd), 2026-10-18
- Card Kingdom buys most basics at $0.03 to $0.05 cash. A few Zendikar full-art basics get $0.15 to $0.52. CK's cheapest retail basic is $0.35. — [CK pricelist](https://api.cardkingdom.com/api/v2/pricelist)
- In the 48-deck recompute, basics made up 628 of the 2,592 duplicate copies (24%) but almost none of the dollar value. — recompute in section 1
- guide.html's own basics example says: "You never mark all twelve Islands for both decks. Eight marked for Deck B is exactly enough, because Deck B never needs a ninth." — `/home/cody/Projects/prism/guide.html` line 230

### Inferences
- Example: 5 blue decks running 10 Islands each need only 10 Islands, not 50. That is 40 cards not bought: 40 × $0.25 = $10 retail, or 40 × $0.47 = $18.80 for full art. Selling 40 to CK brings back about 40 × $0.03 = $1.20. The real gain is 40 fewer cards and sleeves to store and sort.

### Gaps
- I did not research sleeve prices, so I can't put a dollar figure on "sleeves saved".

## 5. Commander ban status (cards not to use)

### Takeaway
Mana Crypt, Jeweled Lotus and Dockside Extortionist are all banned in Commander (since September 2024). Leave them out of every example. PRISM's own copy still names Mana Crypt in two places.

### Cited Findings
- The official banned list shows Mana Crypt, Jeweled Lotus and Dockside Extortionist, each marked "2024-SEP" (along with Nadu, Winged Wisdom). The latest update shown is the September 2024 quarterly update, posted 2024-09-23. — [MTGCommander.net banned list](https://mtgcommander.net/index.php/banned-list/), read 2026-10-18
- Scryfall agrees: `legalities.commander = "banned"` for all three. — [Scryfall API](https://api.scryfall.com/cards/named?exact=Mana%20Crypt), 2026-10-18
- PRISM copy still uses Mana Crypt as an example of a shared staple. PRODUCT.md's Users section says "share high-value staples (Sol Ring, Mana Crypt, Command Tower, etc.)". guide.html line 182 says "so a miscount costs you a sleeve and not a Mana Crypt". — `/home/cody/Projects/prism/PRODUCT.md`, `/home/cody/Projects/prism/guide.html`

### Inferences
- Replace those Mana Crypt mentions with a legal staple of similar value, such as Rhystic Study or Smothering Tithe.

### Gaps
- MTGCommander.net was not checked for any post-September-2024 update that might be posted somewhere other than that page.

## 6. Money-language rules (PRODUCT.md) and tournament text (guide.html)

### Takeaway
PRODUCT.md's banned money patterns are about asking for money (Membership), but four of them limit how a savings explainer can be written. guide.html's legality line is short and depends on double-sleeving.

### Cited Findings
- PRODUCT.md "Voice, money" lists five banned patterns for any surface that asks for money:
  1. No time-unit anchoring below the billing period (never "$0.60 a week").
  2. No gift or offer framing (no WELCOME OFFER tags, countdown urgency or gift illustrations).
  3. Only one permitted save offer: the $27 first-year annual switch, stated with its $30 renewal, next to an equally prominent cancel path.
  4. No feature comparison matrix.
  5. No badge, banner or nag in the working surfaces. The pitch lives on index.html and the Membership drawer, and build.html carries none of it.

  The same section bans exclamation points in UI copy. — `/home/cody/Projects/prism/PRODUCT.md`
- Further constraints from PRODUCT.md: "No testimonials, customer logos, press mentions, or third-party benchmarks exist — do not fabricate any". Sync must be sold "never as backup insurance". And "Pool/Core/Dedicated classification exists to save the user real money — copy and UI should keep that payoff legible". — `/home/cody/Projects/prism/PRODUCT.md`
- guide.html, the exact tournament text (line 216): "**Double-sleeve every marked card.** The outer sleeve protects the paint from handling. It also keeps the deck legal for play, because every card in it shows the same outer sleeve." guide.html says nothing else about tournaments, MTR or legality. — `/home/cody/Projects/prism/guide.html`
- README, for comparison: "Yes. Under [MTR 3.12](https://blogs.magicjudges.org/rules/mtr3-12/), a card counts as marked only if you can identify it without seeing its face. Marks go on the inner sleeve's edge, under an outer sleeve." PRODUCT.md adds that proxies are not tournament legal. — `/home/cody/Projects/prism/README.md`, `/home/cody/Projects/prism/PRODUCT.md`

### Inferences
- For the savings explainer, avoid:
  - Phrases like "Membership pays for itself after one Sol Ring" or any savings-per-week framing. Both tie a saving to the membership price, which comes close to rules 1 and 2.
  - A savings-versus-price comparison grid (rule 4).
  - Any savings banner on build.html (rule 5).
  - Exclamation points.
- Keep savings numbers in prose, with a date and a named source ("Card Kingdom cash buylist, October 2026").
- The explainer could reuse the README's MTR 3.12 sentence. guide.html does not cite the rule.

### Gaps
- I did not re-read MTR 3.12 itself to confirm the README's paraphrase.
