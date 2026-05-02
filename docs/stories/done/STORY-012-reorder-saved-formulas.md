# STORY-012 — Reorder saved formulas (tap-and-hold-then-drag)

Status: superseded by `STORY-016 — Formula Improvements`

This backlog item has been absorbed into `docs/stories/backlog/STORY-016-formula-improvements.md` so reorder, long-press modal behavior, and formula-card interaction rules are implemented from a single story.

Summary

Allow users to reorder their saved formulas directly in the formula list using a mobile-friendly "tap-and-hold-then-drag" gesture. The new feature should persist ordering and provide accessible fallbacks for keyboard and assistive technology.

Why

Users often have a few frequently-used formulas; letting them reorder saves time and keeps the UI tailored to their workflow.

User-facing behavior

- In the saved formulas list (Main view / Formula screen), a user can tap-and-hold a formula item to pick it up and then drag it to a new position.
- While dragging, the lifted item shows a subtle elevation/scale and the list animates to show the drop target.
- Release drops the item in place and the new order is persisted immediately.
- After reorder, show a non-blocking snackbar: "Order updated" with an "Undo" action for 5 seconds to revert the change.
- Desktop / keyboard alternative: a small "Edit order" control enters reorder mode showing move-up / move-down buttons and keyboard-accessible focus controls for moving the selected item.
- Default: no separate edit mode required — long-press gesture starts the drag. If product prefers an explicit Edit mode, the implementation notes include how to switch.

Acceptance criteria

- Long-press drag gesture reorders list items with the correct final order persisted across app restarts.
- Persisted order is stored in the existing formulas data store (no loss of formula metadata).
- Visual affordances are present: drag handle (optional), lifted item, placeholder, and snackbar undo.
- Undo returns the list to the previous order and persists that state.
- Keyboard and screen-reader accessible alternatives exist (Edit mode or move buttons) so the feature meets basic accessibility requirements.
- Unit tests cover the reorder helper (move item in array) and store persistence; integration tests simulate reorder and verify persisted order.

UI / UX details

- Gesture: long-press for ~300ms to initiate drag on touch devices. Provide short haptic feedback if available.
- Drag Handle: show a faint drag handle (☰) at the right edge of each item; users can also long-press anywhere on the item to begin dragging.
- While dragging: the lifted item slightly scales up (e.g., transform: scale(1.03)) and shadow increases.
- Placeholder: the list displays an animated gap where the item will be dropped.
- Snackbar: "Order updated" with "Undo" button for 5s.
- Accessibility: provide an explicit Edit mode (toggle) that reveals move-up / move-down buttons and a visible focus target. Keyboard shortcuts: while focused on a formula, `Ctrl+ArrowUp/ArrowDown` move the item (optional).

Implementation notes

- Recommended approach: use `@dnd-kit/core` + `@dnd-kit/sortable` for robust drag-and-drop with long-press sensors (works well on touch and supports long-press activation). If adding a dependency is not acceptable, implement a lightweight long-press + pointer move solution, but prefer the library for reliability.
- Store changes:
  - Persist ordering in the formulas store. Options:
    - Keep the canonical `formulas: Formula[]` array ordered by user preference (simplest), or
    - Add `formulaOrder: string[]` (array of formula IDs) and derive display order when rendering.
  - Add store actions: `moveFormula(fromIndex, toIndex)` and `setFormulaOrder(order)`; ensure these actions persist to existing storage middleware.
- Components:
  - Create/modify `src/components/FormulaList.tsx` to expose drag-and-drop sorting. If a component already handles the list, extend it.
  - Update `src/pages/MainScreen.tsx` and `src/pages/FormulaScreen.tsx` to import the sortable list and pass formulas from `useAppStore`.
- UX details:
  - Long-press threshold configurable (default 300ms).
  - Respect existing swipe or tap gestures on list items; prefer a drag handle to reduce accidental conflicts with other gestures (e.g., tapping to open formula, swiping for delete).
- Data migration:
  - If moving from an unordered persisted set, when a `formulaOrder` is first added, default to the current array order.
- Undo implementation:
  - On reorder commit, push previous order into a short-lived stack; show snackbar with Undo that restores previous order and re-persist.
- Performance:
  - For long lists, virtualize if necessary; however formulas lists are typically short so this is likely unnecessary.

Testing & QA

- Unit tests:
  - `moveItem<T>(arr, from, to)` helper edge cases (from==to, from/to out-of-range).
  - Store `moveFormula` action persists expected order.
- Integration tests:
  - Simulate drag-and-drop sequence using `@testing-library/user-event` pointer events or `dnd-kit` test helpers to verify UI sends the correct store actions.
- Manual QA:
  - Test on iOS/Android devices for long-press sensitivity and haptic.
  - Verify Undo behavior and persistence across app restart.

Developer notes / risks

- Gesture conflicts: long-press may conflict with other gestures (open, swipe). If issues arise, add an explicit Edit mode as a fallback.
- Accessibility: long-press-only reorder is not accessible — ensure move buttons or keyboard controls exist.
- Dependency: adding `dnd-kit` is recommended; include it in project dependency plan and update package.json.

Estimated effort

Small: ~1–2 dev days (UI + store wiring + tests + QA). If accessibility/keyboard-first behavior is required, add another half day.

Files to change (implementation)

- `src/components/FormulaList.tsx` — new or updated sortable list component.
- `src/pages/MainScreen.tsx` — integrate sortable list for the saved formulas list.
- `src/pages/FormulaScreen.tsx` — integrate sortable list if formulas are listed here as well.
- `src/stores/useAppStore.ts` — add `moveFormula` / `setFormulaOrder` actions and persist order.
- `tests/components/FormulaList.test.tsx` — integration test for drag behavior.
- `tests/stores/useAppStore.test.ts` — unit tests for move action.

---

Created-by: developer-story-generator
Date: 2026-04-28
