# PRISM Architecture

## Overview

PRISM is built using the **Functional Core, Imperative Shell** pattern, separating pure business logic from I/O operations. This makes the codebase testable, maintainable, and ready for integration into web frameworks like Next.js.

---

## Design Principles

### 1. Functional Core, Imperative Shell

**Core modules** (`parser.ts`, `processor.ts`, `normalizer.ts`) contain pure functions:
- No side effects
- Deterministic output
- Easy to test
- Framework-agnostic

**Shell modules** (`index.ts`, output generators) handle I/O:
- File system operations
- User prompts
- Terminal output
- Side effects isolated to edges

### 2. Type Safety

- **TypeScript strict mode** enabled
- All data structures fully typed in `types.ts`
- No `any` types
- Comprehensive interfaces for all data shapes

### 3. Single Responsibility

Each module has one clear purpose:
- **parser.ts** - Parse decklist text into structured data
- **processor.ts** - Deduplicate cards and assign colors
- **csv.ts** - Generate CSV output
- **json.ts** - Generate JSON output
- **summary.ts** - Format terminal output
- **normalizer.ts** - Normalize card names
- **validator.ts** - Validate user input

### 4. Dependency Injection

Functions accept dependencies as parameters rather than importing them:

```typescript
// Good - testable
function processDecks(decks: Deck[]): ProcessedData { ... }

// Bad - hard to test
function processDecks() {
  const decks = readFromDatabase(); // tight coupling
  ...
}
```

---

## Module Breakdown

### Core Modules

#### `types.ts`
**Purpose:** Central type definitions

**Key Types:**
- `Card` - Individual card with name and quantity
- `Deck` - Complete deck with metadata
- `ProcessedCard` - Card with marking instructions
- `ProcessedData` - Full processed output
- `PrismExport` - JSON export format

**Why it exists:** Single source of truth for data shapes. Changes to types automatically propagate through the entire codebase.

#### `parser.ts`
**Purpose:** Parse decklist text into structured cards

**Key Functions:**
- `parseDecklist(decklist: string): ParseResult`
  - Accepts raw text
  - Returns cards array + errors/warnings
  - Pure function - no side effects

**Parsing Rules:**
- Lines must match: `\d+ CardName`
- Ignores empty lines
- Ignores comments (`//`)
- Stops at `SIDEBOARD:`
- Detects duplicate cards (singleton violation)

**Design Decision:** Returns errors/warnings rather than throwing exceptions, allowing the caller to decide how to handle them.

#### `processor.ts`
**Purpose:** Deduplicate cards and assign colors

**Key Functions:**
- `assignColors(decks: Deck[]): Record<string, string>`
  - Assigns colors from palette in order
- `processDecks(decks: Deck[]): ProcessedData`
  - Main processing pipeline
  - Builds card index (card name → deck IDs)
  - Generates mark slots
  - Calculates statistics
  - Sorts cards (most shared first, then alphabetically)

**Data Flow:**
```
Decks → Color Assignment → Card Indexing → Mark Slot Generation → Statistics → Sorting → ProcessedData
```

**Design Decision:** Case-insensitive card matching (using `getCardKey`) but preserves original capitalization for display.

### Utility Modules

#### `normalizer.ts`
**Purpose:** Consistent card name handling

**Key Functions:**
- `normalizeCardName(name: string): string`
  - Trims whitespace
  - Collapses multiple spaces
  - Preserves special characters
- `getCardKey(name: string): string`
  - Lowercase version for deduplication

**Design Decision:** Normalize for matching but preserve original for display.

#### `validator.ts`
**Purpose:** Input validation

**Key Functions:**
- `validateDeckName(name: string): ValidationResult`
- `validateCommander(commander: string): ValidationResult`
- `validateBracket(bracket: number): ValidationResult`
- `validateDeckInput(deck: DeckInput): ValidationResult`

**Returns:** `{ isValid: boolean, errors: string[] }`

**Design Decision:** Validation functions return structured results rather than throwing, allowing callers to handle errors gracefully.

### Output Modules

#### `csv.ts`
**Purpose:** Generate CSV marking instructions

**Key Functions:**
- `generateCSV(data: ProcessedData): string`
  - Builds header row (4 base columns + 30 slot columns)
  - Builds data rows (one per unique card)
  - Handles empty slots
- `writeCSVFile(data: ProcessedData, filepath: string): Promise<void>`
  - Async file write

**CSV Structure:**
```
Card Name | Quantity | Total Decks | Mark Summary | Slot 1 Color | Slot 1 Deck | Slot 1 Bracket | ...
```

**Design Decision:** Fixed 10 slots (max decks) rather than dynamic columns for consistent CSV structure.

#### `json.ts`
**Purpose:** Generate JSON export

**Key Functions:**
- `generateJSON(data: ProcessedData): PrismExport`
  - Transforms internal data to export format
  - Adds version and timestamp
- `writeJSONFile(data: ProcessedData, filepath: string): Promise<void>`

**JSON Schema:** See `PrismExport` type in `types.ts`

**Design Decision:** Separate export format (`PrismExport`) from internal format (`ProcessedData`) allows evolution without breaking consumers.

#### `summary.ts`
**Purpose:** Terminal output formatting

**Key Functions:**
- `displayWelcome()` - Banner
- `displayDeckHeader(index, total)` - Deck collection progress
- `displayDeckParsed(name, count, color)` - Parsing confirmation
- `displayProcessingSummary(data)` - Statistics and top cards
- `displayOutputConfirmation(csvPath, jsonPath, count)` - Success message

**Uses:** `chalk` for colored output

**Design Decision:** Separate display logic from business logic makes it easy to swap terminal output for web UI later.

### CLI Module

#### `index.ts`
**Purpose:** Interactive command-line interface

**Key Functions:**
- `main()` - Entry point
  - Prompts for deck count
  - Collects deck inputs
  - Processes decks
  - Writes outputs
- `collectDeckInput()` - Prompt for single deck
- `parseDeck(input: DeckInput)` - Parse and validate

**Uses:** `inquirer` for prompts

**Data Flow:**
```
User Prompts → Deck Collection → Parsing → Validation → Processing → Output Generation → File Write → Confirmation
```

**Design Decision:** CLI logic is isolated to this one file. Core modules can be imported into Next.js without bringing CLI dependencies.

---

## Data Flow

### High-Level Pipeline

```
┌─────────────────┐
│  User Input     │
│  (CLI prompts)  │
└────────┬────────┘
         │
         ▼
┌─────────────────┐
│  Deck Collection│  Multiple DeckInput objects
│  (index.ts)     │
└────────┬────────┘
         │
         ▼
┌─────────────────┐
│  Parser         │  DeckInput → ParseResult
│  (parser.ts)    │  (pure function)
└────────┬────────┘
         │
         ▼
┌─────────────────┐
│  Deck Objects   │  ParseResult → Deck[]
│  (index.ts)     │  (with UUIDs assigned)
└────────┬────────┘
         │
         ▼
┌─────────────────┐
│  Processor      │  Deck[] → ProcessedData
│  (processor.ts) │  (pure function)
│                 │  - Assign colors
│                 │  - Build card index
│                 │  - Generate mark slots
│                 │  - Calculate stats
│                 │  - Sort cards
└────────┬────────┘
         │
         ▼
┌─────────────────┐
│  Output Gen     │  ProcessedData → CSV/JSON
│  (csv.ts,       │  (pure functions)
│   json.ts)      │
└────────┬────────┘
         │
         ▼
┌─────────────────┐
│  File Write     │  Side effects (I/O)
│  (index.ts)     │
└────────┬────────┘
         │
         ▼
┌─────────────────┐
│  Confirmation   │
│  (summary.ts)   │
└─────────────────┘
```

### Card Deduplication Algorithm

**Problem:** Multiple decks may contain the same card (e.g., "Sol Ring"). We need ONE entry in the output with all decks listed.

**Solution:**
1. Build a `Map<string, Set<string>>` where:
   - Key = lowercase card name (from `getCardKey`)
   - Value = Set of deck IDs containing that card

2. For each unique card key:
   - Find first deck containing it (to get original capitalization)
   - Build mark slots from all decks containing it
   - Store mark slots in entry order (deck 1 = slot 1, etc.)

3. Sort results:
   - Primary: Total decks (descending)
   - Secondary: Card name (alphabetically)

**Example:**

```
Input:
  Deck A: [Sol Ring, Island]
  Deck B: [Sol Ring, Mountain]
  Deck C: [Island, Plains]

Card Index:
  "sol ring" → {deck-a-id, deck-b-id}
  "island" → {deck-a-id, deck-c-id}
  "mountain" → {deck-b-id}
  "plains" → {deck-c-id}

Output (sorted):
  1. Sol Ring (2 decks) - slots: [Deck A/Red, Deck B/Blue]
  2. Island (2 decks) - slots: [Deck A/Red, Deck C/Green]
  3. Mountain (1 deck) - slots: [Deck B/Blue]
  4. Plains (1 deck) - slots: [Deck C/Green]
```

---

## Integration with Next.js

PRISM's architecture makes web integration straightforward:

### API Route Example

```typescript
// app/api/prism/process/route.ts
import { parseDecklist } from '@/prism/core/parser';
import { processDecks } from '@/prism/core/processor';
import { generateCSV } from '@/prism/output/csv';
import { v4 as uuidv4 } from 'uuid';

export async function POST(req: Request) {
  const { decks } = await req.json();

  // Parse
  const parsedDecks = decks.map(d => ({
    id: uuidv4(),
    name: d.name,
    commander: d.commander,
    bracket: d.bracket,
    cards: parseDecklist(d.decklist).cards,
    assignedColor: '',
  }));

  // Process
  const processed = processDecks(parsedDecks);

  // Generate
  const csv = generateCSV(processed);

  return new Response(csv, {
    headers: { 'Content-Type': 'text/csv' },
  });
}
```

**Why this works:**
- Core modules have zero Next.js dependencies
- All functions are pure (no Node.js-specific I/O)
- TypeScript types are shared
- Only `index.ts` (CLI) is excluded from web bundle

### React Component Example

```tsx
'use client';

import { useState } from 'react';
import { processDecks } from '@/prism/core/processor';
import { parseDecklist } from '@/prism/core/parser';

export function DeckProcessor() {
  const [results, setResults] = useState(null);

  const handleProcess = (deckInputs) => {
    // Parse locally in browser
    const decks = deckInputs.map(/* ... */);
    const processed = processDecks(decks);
    setResults(processed);
  };

  return (
    <div>
      {/* Form for deck input */}
      {results && (
        <div>
          <h2>Results</h2>
          <p>Unique cards: {results.stats.totalUniqueCards}</p>
          {/* Display cards */}
        </div>
      )}
    </div>
  );
}
```

---

## Testing Strategy

### Unit Tests

Each module should have isolated unit tests:

```typescript
// parser.test.ts
import { parseDecklist } from '../parser';

test('parses valid decklist', () => {
  const input = '1 Sol Ring\n1 Island';
  const result = parseDecklist(input);

  expect(result.cards).toHaveLength(2);
  expect(result.cards[0].name).toBe('Sol Ring');
  expect(result.errors).toHaveLength(0);
});

test('ignores sideboard', () => {
  const input = '1 Sol Ring\nSIDEBOARD:\n1 Island';
  const result = parseDecklist(input);

  expect(result.cards).toHaveLength(1);
});
```

### Integration Tests

Test the full pipeline:

```typescript
// processor.test.ts
import { processDecks } from '../processor';

test('deduplicates cards across decks', () => {
  const decks = [
    { id: '1', cards: [{ name: 'Sol Ring', quantity: 1 }], ... },
    { id: '2', cards: [{ name: 'Sol Ring', quantity: 1 }], ... },
  ];

  const result = processDecks(decks);

  expect(result.cards).toHaveLength(1);
  expect(result.cards[0].totalDecks).toBe(2);
});
```

### E2E Tests

Use the test script (`test.js`) for end-to-end validation.

---

## Error Handling

### Philosophy

**Prefer returning errors over throwing exceptions** for expected failure cases.

**Examples:**

```typescript
// Good - returns error info
function parseDecklist(text: string): ParseResult {
  return {
    cards: [...],
    errors: [...],
    warnings: [...],
  };
}

// Bad - throws exception
function parseDecklist(text: string): Card[] {
  if (invalid) throw new Error('Invalid!');
  ...
}
```

**Why:**
- Caller can decide how to handle errors
- Expected failures (parse errors) shouldn't crash the app
- Type system documents possible failure modes

**When to throw:**
- Programmer errors (invalid arguments)
- Unexpected system failures (file system errors)

---

## Future Extensibility

### Adding New Input Methods

To add Moxfield API support:

1. Create `src/input/moxfield.ts`
2. Export `fetchDeckFromMoxfield(url: string): Promise<DeckInput>`
3. Import in `index.ts`, add menu option
4. No changes needed to core processing

### Adding New Output Formats

To add PDF export:

1. Create `src/output/pdf.ts`
2. Export `generatePDF(data: ProcessedData): Buffer`
3. Import in `index.ts`, write file
4. No changes needed to core processing

### Adding Web UI

1. Create Next.js project
2. Copy `src/core`, `src/output`, `src/utils` to Next.js
3. Create API routes or use client-side processing
4. Build React components for input/output
5. `src/index.ts` (CLI) stays separate

---

## Performance Considerations

### Current Performance

- **O(n × m)** where n = total cards, m = number of decks
- For typical use (3-5 decks × 100 cards each = 300-500 cards):
  - Parsing: < 10ms
  - Processing: < 50ms
  - CSV generation: < 20ms
  - Total: < 100ms (well within acceptable range)

### Optimization Opportunities (if needed)

1. **Card indexing** - Currently builds `Map<string, Set<string>>` in O(n). Could use Trie for prefix matching if we add autocomplete.

2. **CSV generation** - Currently builds full CSV string in memory. For very large outputs (10,000+ cards), could stream to file.

3. **Caching** - If adding web UI, could cache processed results by hash of input decks.

**Decision:** Current performance is excellent for expected use cases. Premature optimization avoided.

---

## Dependencies

### Production

- **inquirer** (9.2.12) - CLI prompts
- **csv-stringify** (6.4.6) - CSV generation
- **uuid** (9.0.1) - Unique IDs
- **chalk** (5.3.0) - Terminal colors

### Development

- **typescript** (5.3.3) - Type checking and compilation
- **@types/** - Type definitions

### Philosophy

**Minimal dependencies** - Only include libraries that significantly simplify the code. Avoid:
- Lodash (native JS is sufficient)
- Moment.js (native Date is sufficient)
- Heavy frameworks (this is a library, not an app)

---

## Deployment

### As CLI Tool

```bash
npm install -g mtg-prism
prism
```

### As Library

```bash
npm install mtg-prism
```

```typescript
import { processDecks } from 'mtg-prism/core/processor';
```

### As Part of Next.js App

Copy `src/` to Next.js project:

```
my-nextjs-app/
├── lib/
│   └── prism/
│       ├── core/
│       ├── output/
│       └── utils/
```

Import as needed:

```typescript
import { processDecks } from '@/lib/prism/core/processor';
```

---

## Summary

PRISM's architecture prioritizes:

1. **Testability** - Pure functions, dependency injection
2. **Maintainability** - Single responsibility, clear module boundaries
3. **Extensibility** - Easy to add new inputs/outputs
4. **Portability** - Core logic runs anywhere (Node.js, browser, Deno)
5. **Type Safety** - Comprehensive TypeScript types

The result is a codebase that's easy to understand, test, and evolve.
