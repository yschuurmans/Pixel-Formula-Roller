# STORY-006a: Roll Engine — Glow, Collect, Evaluate

## Goal
The stateful roll engine: identify required dice, glow them simultaneously, collect BLE events with deduplication, manage sequential rolling for multi-roll same-die scenarios, and evaluate the formula with real results.

## Prerequisites
- STORY-002 (formula parser), STORY-003 (BLE service), STORY-005 (Formula Screen with ROLL button rendered)
- STORY-000 Spike A findings must be incorporated into `evaluateFormula`

## Decisions captured here

| Decision | Choice | Rationale |
|----------|--------|-----------|
| Multi-die glow | All connected dice glow simultaneously | User rolls all at once; simpler UX |
| Sequential rolling | When N×dX needed but only 1 die connected, roll same die N times | Die glows again for each sub-roll |
| Roll Again history | Writes previous result to history before restarting | No result is ever silently lost |
| Auto-glow on card tap | No — user must press ROLL | Safer UX; avoids unwanted glow if user just wants to inspect the formula |

## Acceptance Criteria

### Roll initiation (wires the ROLL button in STORY-005)
- [x] On ROLL pressed: validate formula is non-empty and parseable; if not, show inline error `"Invalid formula — please check and try again"` and abort
- [x] Call `extractRequiredDice(formula)` to get required die list
- [x] For each required die type: find matching connected entries in the `pixels` store
  - If none connected for that type: route those slots to manual entry (STORY-009 integration point — show manual input immediately)
  - If one die connected but count > 1: use sequential rolling mode for that die type
- [x] Glow **all** connected required dice simultaneously via `pixelsService.glowDie()`
- [x] Transition to "awaiting rolls" state

### Sequential roll state machine (when 1 die must be rolled N times)
- [x] Display a progress indicator: `"Roll d6 — 2 of 3"` updating as results come in
- [x] After each result received from the die: flash a brief confirmation animation (or update counter), then glow again to signal the next roll
- [x] A [Cancel roll] button is always visible while awaiting any result
- [x] [Cancel roll]: call `pixelsService.stopAllGlows()`, discard partial results, return to idle state (Result Panel not shown, history not written)

### BLE event collection
- [x] Listen via `pixelsService.onRollResult()`
- [x] Match each incoming `(pixelId, face, dieType)` to the next unfilled slot in the required dice list (ordered by die type, then by roll sequence number)
- [x] BLE deduplication is handled in STORY-003; this layer trusts that each callback = one valid roll
- [x] When all slots are filled: call `pixelsService.stopAllGlows()`, call `evaluateFormula()`, emit result to the completed roll state

### Navigation cleanup
- [x] On component unmount (back navigation or route change while awaiting rolls): call `pixelsService.stopAllGlows()` and cancel all pending roll listeners
- [x] No result is written to history if the roll is abandoned via navigation

### Mid-roll disconnect
- [x] If a die disconnects while its slot is pending: stop waiting for that slot, transition it to manual entry mode (STORY-009 integration)

## Notes
- Reprompt interval (`ROLL_GLOW_REPEAT_MS`): 2000ms (previously 5000ms)

- `npm run build`