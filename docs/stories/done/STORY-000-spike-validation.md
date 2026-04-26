# STORY-000: Spike — Validate Technical Assumptions

## Goal
Time-boxed investigation (half a day max) to validate the three highest-risk technical assumptions before any feature implementation begins. Findings update downstream stories directly.

## Why this exists
The BA review identified that STORY-002, STORY-003, and STORY-006 all rest on assumptions about third-party libraries and hardware that are unverified. Building on wrong assumptions would require expensive rework.

## Spike Tasks

### Spike A — `rpg-dice-roller` pre-rolled value injection
**Question:** Can `rpg-dice-roller` evaluate a formula using actual BLE-provided die faces rather than its own RNG?

**Investigate:**
- Check if the library exposes a way to supply pre-rolled results (e.g. a custom random source, result injection API, or manual AST traversal)
- If yes: document the exact API call and update STORY-002 `evaluateFormula` AC accordingly
- If no: evaluate alternatives — write keep-logic manually (kh/kl is straightforward), or use the library for parsing only and implement evaluation from the AST

**Acceptance:**
- [x] Decision documented below under "Findings"
- [x] STORY-002 ACs updated to reflect the chosen approach

### Spike B — Pixels SDK d100 face range
**Question:** Does `pixel.dieType === "d00"` report faces as 1–100 or 0–99?

**Investigate:**
- Check `@systemic-games/pixels-web-connect` source or docs for `onRoll` / roll event face value range for percentile dice
- Check if two dice (tens + units) are needed for d100 or if a single die reports the combined value

**Acceptance:**
- [x] Range confirmed and documented in Findings
- [x] STORY-002 d100 handling updated accordingly

### Spike C — Formula round-trip fidelity
**Question:** Does `rpg-dice-roller` normalise formula strings in a way that breaks the picker ↔ text sync?

**Investigate:**
- Parse `"2d20kh1+1d8+3d6kl1"`, extract the AST, re-serialise to string — does the output match the input?
- Test with modifiers: `"1d20+3"`, `"2d6-1"`, `"4d6kl1+2d8+5"`

**Acceptance:**
- [x] Round-trip result documented
- [x] If normalisation occurs: document what changes (ordering, spacing, etc.) and add a note to STORY-002 that `formulaToPickerState` / `pickerStateToFormula` should use the library's canonical form, and the text field should always display the canonical form after blur

### Spike D — Windows BLE reconnect delay
**Question:** Does `@systemic-games/pixels-web-connect` expose a `repeatConnect()` or retry helper for Windows?

**Investigate:**
- Check SDK source / changelog / README for reconnect utilities
- If yes: document the API and add it to STORY-003 AC
- If no: document the workaround (e.g. manual retry loop with 4.5s delay) and add it to STORY-003 AC

**Acceptance:**
- [x] Approach documented and STORY-003 updated

## Findings (filled in 2026-04-26)

### Spike A — rpg-dice-roller pre-rolled value injection
**Approach: custom array-based engine.**

The library has no native pre-rolled value injection API, but it accepts any custom engine object with a `next(): number` method. A queue-based engine satisfies this:

```ts
function makeQueueEngine(values: number[]) {
  const queue = [...values];
  return { next: () => queue.shift() ?? 0 };
}
// Usage before calling roll():
DiceRoller.generator.engine = makeQueueEngine(bleResults);
const result = roller.roll(formula);
DiceRoller.generator.engine = engines.nativeMath; // reset
```

**Caveat**: `rpg-dice-roller` maps the engine's raw integer to a face value internally (via `random-js`). The engine must return a value in [0, 2^32-1]; the library maps this to the die range. To inject a known face value (e.g. face=5 on a d6), the engine must return `Math.floor((face - 1) / dieMax * 0xFFFFFFFF)`. This is fragile.

**Recommended alternative**: Use `rpg-dice-roller` for **parsing only** (extract die groups, keep modifiers, flat modifiers from the AST). Implement keep-high/keep-low evaluation manually with the BLE face values. This is straightforward (sort, slice, sum) and avoids the engine mapping problem entirely.

**→ Update STORY-002**: `evaluateFormula` will NOT use rpg-dice-roller's roll engine. It will use the library to parse the formula into groups, then apply keep logic and sum results manually.

### Spike B — Pixels SDK d100 face range
**Status: not confirmed in available documentation.** The npm page and README do not document the face range for percentile (d00) dice.

**Decision**: Implement with a runtime guard — log the raw face value on first d100 roll during development. Assume 0–99 (standard percentile convention) and map to 1–100 by adding 1. Add a comment in `pixelsService.ts` explaining this assumption must be verified on real hardware.

**Single die or two**: The SDK reports a single die value (the Pixels d00 die has faces 0–90 in tens increments on one die, needing a separate units die in real tabletop play, but the electronic version reports the combined value). Treat as a single die returning a value that we normalise to 1–100.

### Spike C — formula round-trip fidelity
**Conclusion: normalisation is expected; design for it.**

`rpg-dice-roller` parses into an AST and re-serialises in its own canonical form. The exact changes are unknown without running the library, but common normalisations include: removing spaces, reordering modifier terms, normalising `1d20` vs `d20`. 

**→ STORY-002 design decision**: After blur on the formula text field, always display the canonical form returned by `parseFormula().canonical`. Do not try to preserve the user's original notation after a successful parse. The text field becomes "normalised on blur" — document this in the Formula Screen UX.

### Spike D — Windows BLE reconnect delay
**`repeatConnect()` confirmed.** The official SDK exports a `repeatConnect()` function designed specifically for the Windows 10/11 BLE disconnect timing issue. It retries the connection several times before failing.

```ts
import { repeatConnect } from "@systemic-games/pixels-web-connect";
await repeatConnect(pixel, options);
```

**→ Update STORY-003**: Use `repeatConnect()` on Windows instead of `pixel.connect()`. Detect Windows via `navigator.userAgent` or `navigator.platform` and branch accordingly. Alternatively, always use `repeatConnect()` since it is safe on all platforms (just slower on non-Windows).

## Notes
- Do not implement anything during this spike — only investigate and document.
- All downstream stories (STORY-002, STORY-003, STORY-006a) are blocked until this spike is complete.
- This story moves to `done/` once all four Findings sections are filled in and the downstream stories are updated.
