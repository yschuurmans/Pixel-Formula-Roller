# STORY-016 — Formula Improvements

Status: backlog

## Summary

Improve saved-formula interactions on the Main screen by introducing a 1000ms hold gesture that supports two outcomes: drag to reorder saved formulas, or release without dragging to open a reusable formula-roll options modal. This story also refactors the current character-specific prompt into a generic roll-options modal that can be reused for formula flows without regressing the existing character-sheet experience.

## Motivation

Saved formulas are one of the app’s primary launch surfaces. Users need a fast way to reorder them for frequent use and a TTRPG-friendly way to launch common roll variants without editing the underlying saved formula.

## User Stories

- As a user I can hold a saved formula card for 1000ms and drag it up or down to reorder my saved formulas.
- As a user I can hold a saved formula card for 1000ms and release it without dragging to open a modal with formula-specific roll options.
- As a user I can choose `Normal Roll`, `Double Dice`, or `Double All` from that modal and roll a transformed version of the selected formula without permanently changing the saved formula itself.
- As a user normal taps still open the formula card as they do today.
- As a user the existing character-sheet advantage modal behavior continues to work even after the prompt component is generalized.

## Acceptance Criteria

### Saved formula reorder
- A saved formula card enters hold interaction after 1000ms of sustained press.
- After the hold threshold is reached, moving the pointer or touch beyond the chosen drag threshold starts reorder mode.
- Dragging a held formula card up or down reorders it within the saved-formula list.
- Releasing the dragged card commits the new order immediately.
- Formula order persists because the active profile’s formulas remain stored in the desired display order.
- Reorder must not create, delete, or mutate formula content beyond list position.
- Normal tap behavior remains unchanged when the hold threshold is not reached.

### Hold without drag
- If a saved formula card is held for 1000ms and then released without entering drag mode, open the shared roll-options modal.
- The modal presents exactly three choices:
  - `Normal Roll`
  - `Double Dice`
  - `Double All`
- Choosing an option launches a roll session for that saved formula without modifying the saved formula record itself.
- `Normal Roll` launches the saved formula unchanged.
- `Double Dice` doubles all dice groups and leaves the flat modifier unchanged.
- `Double All` keeps all dice groups normal, but doubles the end result.
- Correct example transformations:
  - `1d12+3d6+4` with `Double Dice` becomes `2d12+6d6+4`
  - `1d12+3d6+4` with `Double All` becomes `(1d12+3d6+4)*2`

### Modal genericization
- The current prompt component in `src/components/AdvantagePrompt.tsx` is refactored into a generic modal that can render configurable option sets and icon treatments.
- The refactor must preserve:
  - focus-on-open behavior
  - Escape-to-close behavior
  - restore-previous-focus-on-close behavior
  - accessible dialog semantics
- The existing character-sheet long-press flow from `docs/stories/done/STORY-014-characters.md` must continue to behave the same from a user perspective.
- The generic modal must be reusable by both character skill rolls and formula-card roll variants.

### Reorder backlog consolidation
- This story absorbs the mobile reorder scope from `docs/stories/backlog/STORY-012-reorder-saved-formulas.md`.
- If STORY-012 remains in the backlog, it should be marked as superseded or explicitly linked so reorder work is not tracked twice.

## UI / UX

Saved Formulas card interactions
- Keep the existing saved-formula card appearance and tap target.
- Hold timing: 1000ms everywhere in this story.
- Gesture split:
  - hold then drag = reorder
  - hold then release without drag = modal
  - quick tap = existing open behavior
- Reorder should feel mobile-first and should not require an explicit separate edit mode for the default path.

Formula roll-options modal
- Visual direction should reuse the established style of the current prompt component.
- Options:
  - `Normal Roll` with a regular die icon
  - `Double Dice` with two regular dice icons and text `x2`
  - `Double All` with two regular dice icons and text `x2 ALL`
- Modal copy should be formula-oriented rather than character-check oriented.
- Closing the modal should not reorder or launch anything.

Reorder affordance
- During drag, the lifted item should have visible elevation and the list should show where the card will land.
- The drag interaction should be tuned for touch devices first.
- Accessibility fallback controls can be captured as implementation notes if needed, but the story’s primary requested path is the mobile hold-and-drag gesture.

## Data / State Notes

Ordering
- Keep formula order in the active profile’s ordered `formulas` array in `src/stores/useAppStore.ts`.
- Prefer a focused store action for moving formulas rather than rebuilding order ad hoc in the page.

Interaction state
- Keep page shells thin in `src/pages/MainScreen.tsx`.
- Own hold, drag, active menu, and modal orchestration in `src/application/mainScreen/useMainScreenController.ts`.

Formula transformation
- Do not implement roll variants with brittle string replacements.
- Use parser-aware helpers rooted in `src/services/formulaParser.ts` so the transformed formula remains valid and testable.
- Launch transformed formulas through the existing roll-only navigation and roll session flow in `src/application/formulaScreen/useFormulaScreenController.ts`.

Long-press infrastructure
- Reuse or extend `src/components/LongPressButton.tsx` where appropriate, but account for the difference between button hold and drag-capable card hold interactions.

## Developer Tasks

- Refactor `src/components/AdvantagePrompt.tsx` into a reusable roll-options modal API while preserving current character-sheet behavior.
- Update the character-sheet flow to use the genericized modal without changing the existing outward behavior.
- Add saved-formula hold interaction handling in `src/application/mainScreen/useMainScreenController.ts`.
- Update `src/pages/MainScreen.tsx` to support:
  - drag-capable formula cards
  - formula-card long-press without drag
  - modal opening from a held formula
- Add a store action in `src/stores/useAppStore.ts` for moving formulas within the active profile.
- Add helper logic for transforming a single saved formula into `Normal Roll`, `Double Dice`, or `Double All`.
- Ensure launched formula variants use the existing roll flow rather than bypassing it.
- Add tests in:
  - `tests/pages/MainScreen.test.tsx`
  - `tests/components/LongPressButton.test.tsx`
  - component tests for the generic modal
  - helper tests for formula transformation
- Update backlog references so STORY-012 is not left as a competing active scope.

## Testing

- Component and page tests:
  - quick tap still opens a formula normally
  - 1000ms hold without movement opens the formula roll-options modal
  - hold then drag reorders the formula list
  - new order persists through store state updates
  - choosing `Normal Roll`, `Double Dice`, or `Double All` launches the correct transformed formula
  - character-sheet long-press still shows its original three-mode behavior through the generic modal
- Focused validations:
  - `npm test -- tests/pages/MainScreen.test.tsx tests/components/LongPressButton.test.tsx`
  - additional modal/helper tests for formula transformations
  - `npm run build`
- Manual QA:
  - verify hold-vs-drag feel on an Android phone
  - verify reordered formulas remain in order after app restart
  - verify long-press without drag does not accidentally reorder
  - verify formula variants do not mutate the stored saved formula

## Related

- Absorbs the reorder scope currently described in `docs/stories/backlog/STORY-012-reorder-saved-formulas.md`
- Reuses modal behavior introduced by `docs/stories/done/STORY-014-characters.md`
- Reuses formula flow patterns from `docs/stories/done/STORY-005-formula-screen.md`
- Uses the existing roll engine from `docs/stories/done/STORY-006a-roll-engine.md`