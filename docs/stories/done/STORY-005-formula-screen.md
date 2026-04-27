# STORY-005: Formula Screen — Visual Picker & Text Input

## Goal
The formula builder screen where users pick dice visually or type a formula, with both views staying in sync.

## Acceptance Criteria

### Route behaviour
- [x] `/formula/new` → blank form, no formula pre-loaded
- [x] `/formula/:id` → load saved formula by id from store; if id does not exist, redirect to `/` and show toast `"Formula not found"`

### Formula Name field
- [x] Text input at top, placeholder `"Formula name"`
- [x] Pre-filled when editing an existing formula
- [x] Saving with a blank name shows an **inline validation error** below the field: `"Please enter a name"` — no dialog prompt, no auto-generated name

### Dice Picker
- [x] All 7 die types in order: d4, d6, d8, d10, d12, d20, d% (display label; internal value `"d100"`)
- [x] Compact horizontal visual picker with all 7 dice visible on mobile; each die exposes icon, decrement, count, and increment controls
- [x] Count cannot go below 0; [−] is disabled at 0
- [x] Any change to counts regenerates the formula text field immediately

### Keep Modifier (per die row)
- [x] Keep controls appear when count ≥ 2: a [kh / kl] dropdown and a [N] integer input
- [x] Keep controls hidden when count < 2; when count drops back to < 2, the keep value is cleared
- [x] **Validation**: if N > count, show inline error `"Cannot keep N of M dice"` and disable [Roll] and [Save]
- [x] N minimum: 1; N maximum: count

### Flat Modifier
- [x] Integer input (positive or negative), range ±9999
- [x] Updates formula text field on change

### Formula Text Field
- [x] Editable; mirrors picker state at all times
- [x] On blur: parse via `parseFormula()`; on success update picker to match canonical form
- [x] On blur: if parse fails, show inline error `"Invalid formula"` beneath the field; do not update picker; do not clear the text
- [x] `d%` in the text field is normalised to `1d100` on parse

### ROLL button
- [x] **Present and visible** in this story; wired to the roll engine in STORY-006a
- [x] In this story: disabled with tooltip `"Roll not available — install complete app"`
- [x] Disabled if: formula is empty, formula is invalid, or any keep N > count validation error is active

### SAVE button
- [x] Validates: name non-empty, formula non-empty and parseable, no keep errors
- [x] On success: persist to store → navigate to `/` → show toast `"Formula saved"`
- [x] On editing an existing formula: update in place (same id, new `updatedAt`)

### DELETE button
- [x] Only shown when editing an existing formula (not on `/formula/new`)
- [x] Shows confirmation modal:
  - Title: `"Delete formula?"`, body: `"'<name>' will be permanently removed."`
  - [Cancel] | [Delete] (destructive)
  - On confirm: remove from store → navigate to `/` → show toast `"Formula deleted"`

### Unsaved changes guard
- [x] Track whether any field has been modified since the form was opened (name, dice counts, keep values, modifier, formula text)
- [x] If modified and user taps [← Back], show confirmation dialog: `"Discard changes?"` with [Keep editing] | [Discard]
- [x] Implement via React Router `useBlocker`
- [x] No guard shown if nothing was changed

### Layout
- [x] [← Back] in header; [Delete] in header (right side, only when editing)
- [x] Responsive: single column, all controls visible without horizontal scroll on 375px width

## Notes
- Uses `formulaParser` service (STORY-002).
- Roll engine wired in STORY-006a — that story owns the actual ROLL handler.
- Depends on STORY-001, STORY-002.

## Focused validations
- `npm test -- src/pages/__tests__/FormulaScreen.test.tsx src/pages/__tests__/MainScreen.test.tsx`
- `npm run build`
- Android deploy verified on a connected phone via Capacitor after Formula screen UI updates