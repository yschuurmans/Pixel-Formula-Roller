# STORY-009: Manual Roll Entry Fallback

## Goal
When a required die is not connected or disconnects mid-roll, let the user type in the face value manually so the formula can still be evaluated without physical dice.

## Acceptance Criteria

### Triggering the fallback
- [ ] If `extractRequiredDice()` returns a die type with no matching connected Pixel die, show the manual entry UI immediately when ROLL is pressed — do not attempt BLE glow
- [ ] If a connected die disconnects after ROLL is pressed (mid-roll), stop waiting for its BLE event and transition the pending slot(s) for that die to manual entry mode
- [ ] Each missing die slot gets its own labelled numeric input: `"d6 #2: [___]"`, `"d20 #1: [___]"`

### Input behaviour
- [ ] Inputs accept integers only; min = 1, max = die faces (e.g. 1–6 for d6, 1–20 for d20, 1–100 for d100)
- [ ] Out-of-range values show inline error; [Submit] is disabled until all inputs are valid
- [ ] [Submit] button feeds the entered values into the roll evaluation queue identically to BLE results

### Mixing BLE and manual
- [ ] If some dice are connected and others are not, connected dice glow and collect results normally; only missing dice use manual entry
- [ ] Collected BLE results and manually entered values are combined before `evaluateFormula()` is called

### UX
- [ ] A visible label distinguishes manual entries in the Result Panel: `"d6 #2 → [4] (manual)"` instead of a die icon

## Notes
- Depends on STORY-003 (Bluetooth service) and STORY-006a (roll engine).
- Manual entry slots that were triggered by mid-roll disconnect should show a toast: "d6 disconnected — enter result manually."
- d100 manual entry: single integer input, range 1–100.
