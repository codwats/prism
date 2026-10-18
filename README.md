<h2 align="center">
	<img src="https://raw.githubusercontent.com/codwats/prism/170e2c85d0a26462806e9354761b6c0cc0113209/assets/Prism-Logo-Invert.svg" width="350" alt="Logo"/><br/>
<br/></h2>
<h5 align="center">Personal Reference Index &amp; Sleeve Marking <br/>
   
[![Live Site](https://img.shields.io/badge/Live%20Site-prismmtg.com-a78bfa?style=for-the-badge)](https://prismmtg.com) [![License: MIT](https://img.shields.io/badge/License-MIT-green.svg?style=for-the-badge)](LICENSE)
</h5>

Share Commander cards across all your decks without buying duplicates. Mark each sleeve once, and every card shows which decks it belongs to.

---

## The Problem

A lot of Commander players own 5 to 30 decks, and staples like Sol Ring, Arcane Signet and Command Tower show up in almost all of them. The usual options:

- **Buy duplicates.** Expensive, and most copies sit in a box.
- **Print proxies.** Cheaper per copy, but you still need a copy per deck, and proxies aren't tournament legal.
- **Re-sleeve between games.** Slow, and easy to get wrong.

## The Solution

PRISM gives each deck its own color and a slot along the sleeve edge. You paint a short stripe on the inner sleeve for every deck that uses the card. Fan a stack and the edges tell you which cards go where.

It doesn't matter where your cards come from. Paper, proxies or a mix: if it's in a sleeve, it can carry a mark.

Proxies give you two shortcuts. You can mark the proxy face and skip the sleeve, or use the MPC Stripe Compositor (a Membership Extra) to print your stripes onto MakePlayingCards images before you order, so the proxies arrive already marked.

**One Sol Ring. One Arcane Signet. Up to 48 decks, or 96 with dot splits.**

---

## How It Works

1. **Add your decks.** Paste a decklist, upload a file, or import a Moxfield or Archidekt URL.
2. **Get your slots.** Each deck gets a color and a stripe position from 1 to 48.
3. **See what's shared.** PRISM works out which cards are shared and how many copies you actually need.
4. **Mark your sleeves.** Work from the results list, the printable guide or SCRY-Mode, and tick each card off as you go.
5. **Keep it current.** When a deck changes, PRISM shows only the new marks to paint and the stale ones to clear.

The [Sleeve Marking Guide](https://prismmtg.com/guide.html) walks through a full marking session.

---

## Features

- **Up to 48 decks per PRISM**, or 96 with dot splits
- **Exact copy counts.** If one deck runs 12 Islands and another runs 8, you own 12, and PRISM tells you which 8 carry both marks.
- **Split groups.** Two to eight builds of one deck share a slot, told apart by a second stripe or a dot.
- **Stale marks.** Remove a card from a deck and PRISM keeps a list of the marks you still need to clear.
- **Export.** Printable guide, CSV, a JSON backup, or a plain-text list of what's left to mark.
- **Move a deck's slot** at any time, before you paint
- **No account needed.** Everything runs in your browser and saves locally.

An optional Membership ($3 a month or $30 a year) adds cloud sync across devices and two Extras: the Swap Planner and the MPC Stripe Compositor.

---

## Is This Tournament Legal?

Yes. Under [MTR 3.12](https://blogs.magicjudges.org/rules/mtr3-12/), a card counts as marked only if you can identify it without seeing its face. Marks go on the inner sleeve's edge, under an outer sleeve.

---

## Real World Impact

Based on average EDHREC decklists for top commanders:

| Collection | Sellable duplicates | Resale value |
|------------|---------------------|--------------|
| 5 decks    | 166 cards           | ~$919        |
| 10 decks   | 358 cards           | ~$1,637      |
| 48 decks   | 2,295 cards         | ~$9,680      |

Sell the duplicates and put the money into your next deck.

---

## Contributing

PRISM is built for Commander players, and contributions are welcome.

- **Bug reports and feature ideas:** open an issue.
- **Pull requests:** fork, branch, open a PR.

---

## Tech Stack

- Vanilla JavaScript (ES modules), no build step
- [Web Awesome](https://www.webawesome.com/) components
- localStorage first, with optional sync through Supabase
- Card data from [Scryfall](https://scryfall.com/)
- Hosted on Netlify, with edge functions for deck imports and billing

---

## License

[MIT](LICENSE). Use it, fork it, build on it.

---

<p align="center">
  <strong>Made for Commander players, by Commander players</strong><br>
  <a href="https://prismmtg.com">prismmtg.com</a>
</p>
