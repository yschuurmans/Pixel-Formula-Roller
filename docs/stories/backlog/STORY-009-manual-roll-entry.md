# STORY-009: Manual Roll Entry Fallback

Status Update: Partially done — the manual entry fallback is implemented in the roll engine and will surface when required; some UX/Result-Panel labeling items are pending (see "Remaining work").

## Goal
When a required die is not connected or disconnects mid-roll, let the user type in the face value manually so the formula can still be evaluated without physical dice.

## Acceptance Criteria

### Triggering the fallback
- [ ] If `extractRequiredDice()` returns a die type with no matching connected Pixel die, show the manual entry UI immediately when ROLL is pressed — do not attempt BLE glow
- [ ] If a connected die disconnects after ROLL is pressed (mid-roll), stop waiting for its BLE event and transition the pending slot(s) for that die to manual entry mode
- [ ] Each missing die slot gets its own labelled numeric input: `"d6 #2: [___]"`, `"d20 #1: [___]"`

### Input behaviour
- **Status:** Implemented — inputs validate range and feed results into the evaluation queue. Edge-case UX (error copy and focus behaviour) should be verified in manual testing.

### Mixing BLE and manual
- **Status:** Implemented — mixed BLE/manual flows are supported by the roll engine.

### UX
- **Status:** Partially implemented — manual-slot inputs and result collection are implemented; the planned Result Panel labeling for manual entries depends on STORY-006b and remains pending.

## Notes
- Depends on STORY-003 (Bluetooth service) and STORY-006a (roll engine).
- Manual entry slots that were triggered by mid-roll disconnect should show a toast: "d6 disconnected — enter result manually."
- d100 manual entry: single integer input, range 1–100.
