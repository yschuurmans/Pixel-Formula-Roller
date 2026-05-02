# STORY-015 — Combined Rolls

Status: backlog

## Summary

Add multi-select support to Saved Formulas so a user can select one or more saved formulas from the Main screen and launch them as one combined roll session. When formulas are selected, a bottom-right `Roll` button appears; tapping it performs the combined roll, and long-pressing it opens the shared roll-options modal for variant execution.

## Motivation

Players often roll multiple saved formulas together for attacks, damage packages, spell effects, or grouped checks. Selecting several existing formulas and resolving them in one roll session reduces repetition and keeps the launch flow fast on mobile.

## User Stories

- As a user I can select one or more saved formulas from the Main screen using checkboxes on each formula card.
- As a user I see a dedicated `Roll` action appear when at least one formula is selected.
- As a user tapping that `Roll` action combines the selected formulas into one formula string and launches a single roll session.
- As a user long-pressing that `Roll` action opens the same roll-options modal used elsewhere in the app, letting me choose `Normal Roll`, `Double Dice`, or `Double All` before launching the combined roll.
- As a user I can deselect formulas and the combined-roll affordance disappears when no formulas remain selected.

## Acceptance Criteria

- Each saved formula card on the Main screen exposes a checkbox in the lower-right area beneath the existing `...` menu button.
- Checkbox state is local interaction state for the Main screen and does not persist across app restarts or profile switches unless a later story explicitly adds persistence.
- When zero formulas are selected, no combined-roll action is visible.
- When one or more formulas are selected, a bottom-right floating `Roll` button appears on the Main screen.
- Tapping the floating `Roll` button combines the selected formulas into one formula string in the same order the selected formulas appear in the current saved-formula list.
- Combined formula composition is additive only. Example: selecting `1d20+3` and `4d12+1` produces `1d20+3+4d12+1`.
- The combined roll launches as one roll session through the existing roll flow rather than multiple sequential roll sessions.
- The temporary roll name for the launched session is `Combined Roll`.
- Long-pressing the floating `Roll` button for 1000ms opens the shared roll-options modal with three choices:
  - `Normal Roll`
  - `Double Dice`
  - `Double All`
- Selecting a modal option transforms the combined formula before the roll session starts:
  - `Normal Roll` leaves the formula unchanged.
  - `Double Dice` doubles all dice groups and leaves the flat modifier unchanged.
  - `Double All` doubles all dice groups and doubles the flat modifier.
- Correct example transformations:
  - `1d12+3d6+4` with `Double Dice` becomes `2d12+6d6+4`
  - `1d12+3d6+4` with `Double All` becomes `(1d12+3d6+4)*2`
- If only one formula is selected, combined roll behavior still works and uses the same single-session flow with the temporary name `Combined Roll`.
- Tapping a formula card to open it for normal use must still work when the checkbox itself is not being interacted with.
- Selection state is cleared after a combined roll is launched.
- Selection state is cleared if the active profile changes.
- Selection state is updated safely if a selected formula is deleted from the list.
- The feature is covered by tests for selection state, combined formula construction, roll launch integration, and long-press modal entry.

## UI / UX

Main screen formula cards
- Keep the current card layout and existing kebab-menu placement.
- Add a checkbox in the lower-right area of the card, visually aligned beneath the `...` menu.
- Checking a box should not open the formula card.
- Selected cards should have a subtle selected state so users can scan what will be included in the combined roll.

Combined Roll action
- Placement: floating in the bottom-right of the Main screen.
- Visible only while at least one formula is selected.
- Label: `Roll`
- Tap behavior: immediately launch the combined formula using `Normal Roll`.
- Long-press behavior: after 1000ms, open the shared roll-options modal instead of launching immediately.

Modal reuse
- Reuse the genericized version of the current modal component now implemented by `src/components/AdvantagePrompt.tsx`.
- For this story, the modal must support these three formula-roll options:
  - `Normal Roll`
  - `Double Dice`
  - `Double All`
- The modal should preserve the existing focus management, Escape-to-close behavior, and backdrop dismissal behavior already established for the character-roll prompt.

## Data / State Notes

Selection state
- Maintain selected formula ids in Main screen interaction state, not in persisted store state.
- Keep page shells thin and place Main screen interaction orchestration in `src/application/mainScreen/useMainScreenController.ts`.

Formula combination
- Build the combined formula from the selected saved formulas in current display order.
- Do not concatenate names. Use the temporary session name `Combined Roll`.
- Do not create a new saved formula automatically.
- Formula composition and variant transformation should be handled by reusable helpers rather than ad hoc string concatenation in the page component.
- Prefer parser-aware transformation using the existing formula boundary in `src/services/formulaParser.ts`.

Roll launch
- Launch through the existing single-session roll flow owned by `src/application/formulaScreen/useFormulaScreenController.ts`.
- Keep the Main screen page in `src/pages/MainScreen.tsx` thin and move orchestration into `src/application/mainScreen/useMainScreenController.ts`.

## Developer Tasks

- Add Main screen selection state and selection actions in `src/application/mainScreen/useMainScreenController.ts`.
- Update `src/pages/MainScreen.tsx` to render formula-card checkboxes and the bottom-right floating `Roll` action.
- Refactor the current prompt in `src/components/AdvantagePrompt.tsx` into a generic roll-options modal shape that can be configured for combined-roll usage without regressing the existing character-sheet flow.
- Add or extract helper logic for:
  - building a combined formula from selected saved formulas
  - applying `Normal Roll`, `Double Dice`, and `Double All` transformations
- Reuse the long-press primitive in `src/components/LongPressButton.tsx` or extract a shared hold interaction pattern for the floating `Roll` action.
- Ensure the combined roll launches one roll session through `src/application/formulaScreen/useFormulaScreenController.ts`.
- Add tests in:
  - `tests/pages/MainScreen.test.tsx`
  - `tests/pages/FormulaScreen.test.tsx`
  - helper or component tests as needed for formula combination and roll-option transforms

## Testing

- Component and page tests:
  - checkbox selection toggles state correctly
  - floating `Roll` button appears only when selection is non-empty
  - tap on floating `Roll` launches a combined roll with the expected formula string
  - long-press on floating `Roll` opens the shared roll-options modal
  - choosing `Double Dice` or `Double All` launches the transformed combined formula
  - selection clears after launch and after profile switch
- Focused validations:
  - `npm test -- tests/pages/MainScreen.test.tsx tests/pages/FormulaScreen.test.tsx`
  - `npm run build`
- Manual QA:
  - select multiple formulas on mobile
  - verify tap vs long-press behavior on the floating `Roll` button
  - verify combined-roll formula order matches on-screen order
  - verify modal choice changes the launched roll as expected

## Related

- Reuses the modal interaction pattern introduced by `docs/stories/done/STORY-014-characters.md`
- Reuses formula roll orchestration patterns from `docs/stories/done/STORY-005-formula-screen.md`
- Depends on the existing roll engine behavior from `docs/stories/done/STORY-006a-roll-engine.md`