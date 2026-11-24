# Calendar data routine

The weekly cloud routine (#526) follows this prompt. It runs every Saturday. Edit this file to change what it does.

---

Weekly PRISM release-calendar data update (codwats/prism, issue #526).

Goal: keep `assets/calendar.json` and `assets/sets/` current. Output is a PR, never a commit to main. If nothing changed, open no PR and stop.

## Setup
- Branch from origin/main: `calendar-data/<YYYY-MM-DD>`.
- Read CONTEXT.md (Premier set, Spotlight) and the current `assets/calendar.json`. Match its format: one JSON object per line, the existing id style (e.g. `magiccon-detroit-2027`), and the existing fields.

Range: from Jan 1 of the previous year to as far ahead as anything is announced.

## 1. Sets
Scryfall `GET https://api.scryfall.com/sets`, with headers `User-Agent: PRISM-calendar/1.0` and `Accept: application/json`.
- Premier set = `set_type` `expansion` or `core` (Universes Beyond included). Set `premier: true` and add a `release` event.
- Supplemental = standalone paper products such as Masters sets or Mystery Booster. Leave out Commander decks released alongside a Premier set, digital-only sets, promos, tokens and Secret Lair boxes.
- For each new set, download `icon_svg_uri` to `assets/sets/<code>.svg`. Never hotlink it. Set `symbol` to that path, or null if there is no icon.
- For each new Premier set, propose a hex `color` from its key art or logo, or null. List every proposed color in the PR body for review.
- `url` is the set's magic.wizards.com/en/products page. If that page returns 404, use `https://magic.wizards.com/en/products` and say so in the PR body.

## 2. Prereleases
WPN "Dates and Details" pages. A prerelease spans about 7 days and ends the day before release. Use plain dates.

## 3. Secret Lair drops
magic.wizards.com news and announcements. Set `time` to an ISO time with its offset (usually 09:00 Pacific, `-07:00` or `-08:00` depending on daylight saving). Leave the time out if the post gives none.

## 4. MagicCons
`url` is the city page, `https://mc<city>.mtgfestivals.com/en-us.html` (Las Vegas is `mcvegas`). Fall back to `https://www.mtgfestivals.com/#upcoming-events`. Check the dates on that page or Wizards' announcement, and include `city`.

## Rules
- Every new or changed event has a `source` URL where you read the fact.
- Change a date only when a source contradicts it, and cite that source.
- Don't invent anything. A wrong date sends someone to an empty store. If you can't confirm something, leave it out and list it in the PR body.
- Run `npm ci && npm run lint && npm test`. The data check must pass before you open the PR.
- PR body: added, changed and removed items (each with its source), proposed colors, unconfirmed items, and pages that blocked automated reads.
