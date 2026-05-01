# STORY-002: Formula Parser Service

## Goal
A thin TypeScript service wrapping `rpg-dice-roller` so the rest of the app can parse, validate, and decompose dice formulas without depending directly on the library.

## Prerequisites
- STORY-000 spike must be complete. The approach for `evaluateFormula` and d100 handling depends on spike findings.

## Canonical Die Type
The internal canonical token is `"d100"`. All code uses this token except:
- BLE boundary: map `pixel.dieType === "d00"` → `"d100"` in `pixelsService.ts`
- UI labels only: display `"d100"` as `"d%"` in JSX

```ts
export type DieType = "d4" | "d6" | "d8" | "d10" | "d12" | "d20" | "d100";
```

This mapping is enforced here and in STORY-003. No other code should reference `"d00"` or `"d%"` as a data value.

## Acceptance Criteria

### `src/types/formula.ts` — define all shared types
- [x] `DieType` union as above
- [x] `ParsedFormula`:
  ```ts
  interface ParsedFormula {
    groups: DiceGroup[];       // one entry per die type group in the formula
    flatModifier: number;      // sum of all numeric constants (+3, -1, etc.)
    raw: string;               // the original formula string
    canonical: string;         // rpg-dice-roller's normalised form (may differ from raw)
  }
  interface DiceGroup {
    dieType: DieType;
    count: number;
    keep?: { mode: "kh" | "kl"; n: number };
  }
  ```
- [x] `RequiredDie`: `{ dieType: DieType; count: number; keep?: { mode: "kh"|"kl"; n: number } }`
- [x] `DieRollResult`: `{ dieType: DieType; face: number; kept: boolean; source: "ble" | "manual" }`
- [x] `EvaluationResult`: `{ groups: GroupResult[]; flatModifier: number; total: number }`
  ```ts
  interface GroupResult {
    dieType: DieType;
    rolls: DieRollResult[];
  }
  ```
- [x] `PickerState`:
  ```ts
  interface PickerState {
    dice: Partial<Record<DieType, { count: number; keep?: { mode: "kh"|"kl"; n: number } }>>;
    flatModifier: number;
  }
  ```

### `src/services/formulaParser.ts` — exports
- [x] `parseFormula(formula: string): ParsedFormula | null` — returns null on invalid/empty input
- [x] `evaluateFormula(parsed: ParsedFormula, rolls: DieRollResult[]): EvaluationResult`
  - Uses `rpg-dice-roller` for **parsing only** — do NOT call its roll engine
  - Implements keep-high / keep-low evaluation manually:
    1. For each `DiceGroup`, take the slice of `rolls` belonging to that group (in order)
    2. Sort faces descending (kh) or ascending (kl), mark kept/dropped
    3. Sum kept faces across all groups, add `flatModifier`
  - This avoids the fragile engine-mapping problem identified in STORY-000 Spike A
- [x] `extractRequiredDice(formula: string): RequiredDie[]` — convenience wrapper around parseFormula
- [x] `formulaToPickerState(formula: string): PickerState | null`
- [x] `pickerStateToFormula(state: PickerState): string`
  - The generated formula string uses canonical form; text field always shows canonical after blur (see Spike C)

### Validation
- [x] `parseFormula` returns null for: empty string, non-dice text, malformed expressions
- [x] Formula complexity limit enforced in `parseFormula`: max 20 dice per die type, max 100 dice total, modifier clamped to ±9999 — return null if exceeded

### Tests (Vitest)
- [x] `parseFormula`: valid cases (`"2d6"`, `"1d20+5"`, `"2d20kh1"`, `"2d20kh1+1d8+3d6kl1"`, `"d%"` → normalised to `"1d100"`), invalid cases (empty, garbage, over-limit)
- [x] `evaluateFormula`: kh/kl logic verified with fixed roll arrays
- [x] `formulaToPickerState` / `pickerStateToFormula` round-trip test using canonical form from Spike C
- [x] `extractRequiredDice`: compound formula decomposes correctly

## Notes (incorporating STORY-000 findings)
- `d%` entered in the text field should be normalised to `1d100` on parse.
- **Never call rpg-dice-roller's roll engine in evaluateFormula** — parsing only.
- **d100 face range**: assume SDK reports 0–99; add 1 to get 1–100. Mark with a `// VERIFY: d100 face range assumed 0-99` comment for hardware verification.
- **Formula text field**: always display `parsed.canonical` after blur — do not preserve user's original notation.
- Depends on STORY-000 (done), STORY-001.

## Tester Findings
- Verified against [src/services/formulaParser.ts](d:/Git/Pixel-Formula-Roller/src/services/formulaParser.ts) and [tests/services/formulaParser.test.ts](d:/Git/Pixel-Formula-Roller/tests/services/formulaParser.test.ts).
- Added a regression test to reject subtraction of a dice group (`1d6-1d4`), because STORY-002 supports flat numeric modifiers but not signed dice groups. The parser now returns `null` instead of evaluating that formula incorrectly.
- Validation on 2026-04-27: `npm test` passed with 36/36 tests; `npm run build` passed.
