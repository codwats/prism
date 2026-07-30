# Multi-commander import signals

Research for [Verify how supported imports identify multiple commanders](https://github.com/codwats/prism/issues/148), conducted 2026-07-30.

## Conclusion

Both supported services expose command-zone placement directly:

- Moxfield puts every commander in `boards.commanders.cards`, with `quantity` on each entry.
- Archidekt puts the exact category name `Commander` on every commander card entry, with `quantity` on each entry.

Representative Partner, Partner with, Choose a Background, Doctor's companion, and Friends forever decks all exposed two distinct quantity-1 commander entries. PRISM does not need to recognize those mechanics from Oracle text, maintain a mechanic or card list, or validate legality.

PRISM's service adapters initially preserve both commander flags and quantities. The loss happens afterward: URL import flattens structured cards to quantity-and-name text, fills one Commander field, and reparses the text. The generated text has no Commander section, so only the card matching that one field remains `isCommander: true`.

## First-party payload evidence

### Moxfield

PRISM's proxy requests `https://api2.moxfield.com/v3/decks/all/{publicId}` and returns the JSON body unchanged ([proxy source](../../netlify/edge-functions/moxfield-edge.ts#L58-L89)). Live payloads were retrieved through the deployed proxy because Moxfield's Cloudflare policy rejected direct command-line access.

Every sample had `format: "commander"`, `boards.commanders.count: 2`, and two entries under `boards.commanders.cards`, each with `quantity: 1`.

| Mechanic | First-party deck and API | Commander entries |
| --- | --- | --- |
| Partner | [Deck](https://moxfield.com/decks/71u-QlojR0K9pWeHuXVl3w) · [API](https://api2.moxfield.com/v3/decks/all/71u-QlojR0K9pWeHuXVl3w) | Thrasios, Triton Hero; Tymna the Weaver |
| Partner with | [Deck](https://moxfield.com/decks/wHjIwn8rZUG4DXCgWqkppQ) · [API](https://api2.moxfield.com/v3/decks/all/wHjIwn8rZUG4DXCgWqkppQ) | Pir, Imaginative Rascal; Toothy, Imaginary Friend |
| Choose a Background | [Deck](https://moxfield.com/decks/H0PWMN_CDUiFbjscl7oVsA) · [API](https://api2.moxfield.com/v3/decks/all/H0PWMN_CDUiFbjscl7oVsA) | Wilson, Refined Grizzly; Raised by Giants |
| Doctor's companion | [Deck](https://moxfield.com/decks/SkCJ8fafWkWW9uWXn_uUxA) · [API](https://api2.moxfield.com/v3/decks/all/SkCJ8fafWkWW9uWXn_uUxA) | The Fourteenth Doctor; Rose Noble |
| Friends forever | [Deck](https://moxfield.com/decks/HJU_oVYX6E6czh67XA6cCg) · [API](https://api2.moxfield.com/v3/decks/all/HJU_oVYX6E6czh67XA6cCg) | Cecily, Haunted Mage; Wernog, Rider's Chaplain |

Moxfield exposes actual Companion cards separately under `boards.companions.cards`. A card with Doctor's companion belongs to the commander board when selected as a commander.

### Archidekt

Archidekt's public deck response includes a premier category object named `Commander`, while each card entry carries category names as strings. In every sample, both command-zone entries included `Commander` in `categories`, had `quantity: 1`, and had `companion: false`.

| Mechanic | First-party deck and API | Commander entries |
| --- | --- | --- |
| Partner | [Deck](https://archidekt.com/decks/24144312/thrasiostymna_2026_test) · [API](https://archidekt.com/api/decks/24144312/) | Tymna the Weaver; Thrasios, Triton Hero |
| Partner with | [Deck](https://archidekt.com/decks/11050357/pir_and_toothy) · [API](https://archidekt.com/api/decks/11050357/) | Pir, Imaginative Rascal; Toothy, Imaginary Friend |
| Choose a Background | [Deck](https://archidekt.com/decks/19294098/wilson_refined_grizzly_raised_by_giants_v201) · [API](https://archidekt.com/api/decks/19294098/) | Raised by Giants; Wilson, Refined Grizzly |
| Doctor's companion | [Deck](https://archidekt.com/decks/7440417/the_fourteenth_doctor) · [API](https://archidekt.com/api/decks/7440417/) | The Fourteenth Doctor; Rose Noble |
| Friends forever | [Deck](https://archidekt.com/decks/17402808/friends_forever) · [API](https://archidekt.com/api/decks/17402808/) | Cecily, Haunted Mage; Othelm, Sigardian Outcast |

The `companion` boolean is the distinct Companion deck role, not Doctor's companion. Backgrounds and all sampled paired mechanics use the generic `Commander` category. PRISM's current fallback that accepts any category containing `partner` is unnecessary and potentially over-broad because Archidekt categories can be user-defined; the evidence supports exact, case-insensitive recognition of `Commander`.

## Current PRISM round trip

### The adapters start correctly

Moxfield's transformer iterates all `boards.commanders.cards`, copies quantity, and emits `isCommander: true` ([source](../../js/modules/moxfield.js#L53-L70)). Archidekt's transformer copies quantity and derives `isCommander` from card-entry categories ([source](../../js/modules/archidekt.js#L53-L81)).

At this point, two commanders are represented as two card objects with `isCommander: true`. Both adapters also reduce the deck-level `commander` string to the first matching card ([Moxfield](../../js/modules/moxfield.js#L55-L67), [Archidekt](../../js/modules/archidekt.js#L55-L72)). That first card follows response order and is not the complete set.

### Add URL import loses the second flag

`toDecklistText` serializes only quantity and name, with no board, category, or commander marker ([source](../../js/modules/moxfield.js#L150-L158)). Add URL import places the adapter's first commander in the single Commander input and the flat text in the textarea ([source](../../js/features/deck-import.js#L146-L152)).

Submit reparses the text against that one commander name ([source](../../js/features/deck-form.js#L120-L150)). The parser marks cards only when they are below a Commander section header or match that exact one name ([source](../../js/modules/parser.js#L75-L86), [source](../../js/modules/parser.js#L135-L150)). Because generated text has no section header, the second commander becomes an ordinary card.

Both names and quantities survive, but the second `isCommander` flag and the complete commander set are lost.

### Edit URL import can lose every imported flag

Edit URL import replaces only the decklist textarea; it does not update the existing Commander input ([source](../../js/features/deck-import.js#L180-L185)). Save reparses the flat text against that existing one name ([source](../../js/features/deck-list.js#L325-L353)).

If the old commander is present, only it is marked commander. If absent, none of the newly imported cards is marked commander. A second upstream commander is never reconstructed.

### Persistence already has the needed scaffolding

Once a card reaches persistence with `isCommander: true`, local JSON preserves it and Supabase stores `quantity` and `is_commander` per deck-card row ([source](../../js/modules/storage.js#L493-L502), [source](../../js/modules/storage.js#L623-L632)). Multiple flagged rows fit the current card schema.

Cloud hydration restores every card's quantity and flag, but rebuilds the singular deck-level `commander` string from the first flagged row ([source](../../js/modules/storage.js#L335-L351)). The card model and storage already scaffold multiple commanders; the singular form field and structured-to-text boundary are the incomplete seam.

## Decision supported

1. Use every Moxfield commander-board entry.
2. Use every Archidekt card with an exact case-insensitive `Commander` category.
3. Preserve the adapters' full commander list, per-card flags, and quantities through Add and Edit instead of asking the generic text parser to rediscover them.
4. Auto-populate the agreed Two commanders UI from that list, retaining manual fields as fallback.
5. Do not inspect Oracle text or maintain a list of multi-commander mechanics.

The smallest compatible seam is the structure the adapters already produce: `cards[]` with `quantity` and `isCommander`. No new commander-role taxonomy or inventory model is justified.

## Limitations

- These endpoints do not have a versioned public schema. Findings describe first-party responses observed on 2026-07-30, not a provider guarantee.
- Direct Moxfield API URLs may return a Cloudflare block outside a browser; the observations used PRISM's deployed pass-through proxy.
- Samples cover the major current paired-commander families, not every historical or future mechanic.
- Exhaustive mechanic coverage is unnecessary because the decision uses generic command-zone placement. If provider metadata is absent or wrong, the manual Two commanders fallback is the bounded recovery path.
