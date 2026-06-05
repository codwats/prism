<h2 align="center">
	<img src="https://raw.githubusercontent.com/codwats/prism/170e2c85d0a26462806e9354761b6c0cc0113209/assets/Prism-Logo-Invert.svg" width="350" alt="Logo"/><br/>
<br/></h2>
<h5 align="center">Personal Reference Index &amp; Sleeve Marking <br/>
   
[![Live Site](https://img.shields.io/badge/Live%20Site-prismmtg.netlify.app-a78bfa?style=for-the-badge)](https://prismmtg.netlify.app) [![License: MIT](https://img.shields.io/badge/License-MIT-green.svg?style=for-the-badge)](LICENSE)
</h5>

Share MTG Commander cards across multiple decks without buying duplicates. Mark your sleeves once, swap cards in seconds.



---

## The Problem

Commander players often own 5-30+ decks, and staples like Sol Ring, Mana Crypt, and Command Tower appear in almost every one. You can:

- **Buy duplicates** — expensive, wasteful
- **Use proxies** — not tournament legal
- **Re-sleeve constantly** — slow and annoying

## The Solution

PRISM assigns each deck a unique color and stripe position. Mark your sleeves with paint pens, and any card can live in multiple decks. Fan your cards to instantly see which decks a card belongs to.

**One Sol Ring. One Mana Crypt. Up to 48 decks (96 with dot splits).**

---

## How It Works

1. **Import** — Paste your decklists (MTGO/Moxfield format)
2. **Assign** — Each deck gets a color + stripe position (1-48)
3. **Analyze** — PRISM finds shared cards across decks
4. **Export** — Download your marking guide (CSV, JSON, or printable)
5. **Mark** — Apply colored stripes to sleeve edges with paint pens

---

## Features

- **Up to 48 decks** per PRISM (96 with dot splits)
- **Smart basic land handling** — calculates max needed, not sum
- **Track changes** — add decks later, only mark new cards
- **Multiple export formats** — CSV, JSON, printable guide
- **Auto-save** — localStorage persistence, no account needed
- **Reorder stripes** — drag-and-drop to customize positions
- **100% client-side** — your data never leaves your browser

---

## Is This Tournament Legal?

**Yes!** Per [MTR 3.12](https://blogs.magicjudges.org/rules/mtr3-12/), cards are only "marked" if identifiable without seeing the face. Sleeve edge marks don't affect the card's profile in the deck.

---

## Real World Impact

Based on average EDHREC decklists for top commanders:

| Collection | Sellable Duplicates | Resale Value |
|------------|---------------------|--------------|
| 5 decks    | 166 cards           | ~$919        |
| 10 decks   | 358 cards           | ~$1,637      |
| 48 decks   | 2,295 cards         | ~$9,680      |

Sell your duplicates. Fund more decks. 💰

---

## Contributing

Contributions welcome! This is a community tool built for Commander players.

- **Bug reports** — Open an issue
- **Feature ideas** — Open an issue or discussion
- **Pull requests** — Fork, branch, PR

---

## Tech Stack

- Vanilla JavaScript (ES6 modules)
- [Web Awesome](https://www.webawesome.com/) components
- localStorage for persistence
- Hosted on Netlify

---

## License

[MIT](LICENSE) — Use it, fork it, build on it.

---

<p align="center">
  <strong>Made for Commander players, by Commander players</strong><br>
  <a href="https://prismmtg.netlify.app">prismmtg.netlify.app</a>
</p>
