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
- [ ] On ROLL pressed: validate formula is non-empty and parseable; if not, show inline error `"Invalid formula — please check and try again"` and abort
- [ ] Call `extractRequiredDice(formula)` to get required die list
- [ ] For each required die type: find matching connected entries in the `pixels` store
  - If none connected for that type: route those slots to manual entry (STORY-009 integration point — show manual input immediately)
  - If one die connected but count > 1: use sequential rolling mode for that die type
- [ ] Glow **all** connected required dice simultaneously via `pixelsService.glowDie()`
- [ ] Transition to "awaiting rolls" state

### Sequential roll state machine (when 1 die must be rolled N times)
- [ ] Display a progress indicator: `"Roll d6 — 2 of 3"` updating as results come in
- [ ] After each result received from the die: flash a brief confirmation animation (or update counter), then glow again to signal the next roll
- [ ] A [Cancel roll] button is always visible while awaiting any result
- [ ] [Cancel roll]: call `pixelsService.stopAllGlows()`, discard partial results, return to idle state (Result Panel not shown, history not written)

### BLE event collection
- [ ] Listen via `pixelsService.onRollResult()`
- [ ] Match each incoming `(pixelId, face, dieType)` to the next unfilled slot in the required dice list (ordered by die type, then by roll sequence number)
- [ ] BLE deduplication is handled in STORY-003; this layer trusts that each callback = one valid roll
- [ ] When all slots are filled: call `pixelsService.stopAllGlows()`, call `evaluateFormula()`, emit result to STORY-006b

### Navigation cleanup
- [ ] On component unmount (back navigation or route change while awaiting rolls): call `pixelsService.stopAllGlows()` and cancel all pending roll listeners
- [ ] No result is written to history if the roll is abandoned via navigation

### Mid-roll disconnect
- [ ] If a die disconnects while its slot is pending: stop waiting for that slot, transition it to manual entry mode (STORY-009 integration)

## Notes
- This story owns the roll state machine and nothing else — no UI beyond the progress indicator and cancel button.
- Result Panel UI is STORY-006b, which consumes the `EvaluationResult` emitted here.
- Depends on STORY-002, STORY-003, STORY-005.
