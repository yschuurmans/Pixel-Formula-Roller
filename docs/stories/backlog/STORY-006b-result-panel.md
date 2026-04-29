# STORY-006b: Result Panel — Display, History, Roll Again

Status Update: Partially done — core evaluation and [Roll Again] behavior implemented in the roll engine; UI polish, accessibility, and a11y-focused acceptance items remain pending (see "Remaining work" below).

## Goal
Display the roll result after the engine (STORY-006a) evaluates the formula, handle Roll Again, and write to roll history.

## Acceptance Criteria

### Display
- [ ] Shows formula name (if saved) or formula string
- [ ] Per-group breakdown, one section per die type:
  - Each individual roll: `"d20 #1 → 18 ✓"` (kept) or `"d20 #2 → 7 (dropped)"` (discarded by kh/kl)
  - Manual results labelled: `"d6 #2 → 4 (manual)"`
- [ ] Flat modifier row: `"Modifier: +5"` (shown only if modifier ≠ 0); displays the summed modifier as a single line
- [ ] Grand total displayed prominently, larger font

### Component style
- [ ] **Mobile (< 768px)**: bottom sheet sliding up from the bottom; backdrop dims the screen
- [ ] **Desktop (≥ 768px)**: centred modal dialog
- [ ] Backdrop click does NOT dismiss (prevents accidental dismissal)
- [ ] Focus is trapped inside the panel when open (`aria-modal="true"`, focus on first interactive element on mount)
- [ ] Dismiss via [✕] only

### [Roll Again] button
- **Status:** Implemented — the engine writes the previous result to history before restarting and the [Roll Again] button is present and covered by tests.

### [✕ / Close] button
- **Status:** Implemented for core flow (writes history and dismisses). UI behaviour for modal/backdrop accessibility and focus trapping needs verification in manual QA.

### Roll history entry written
```ts
{
  id: uuid(),
  formulaId: <id if from saved formula, else undefined>,
  formulaString: <canonical formula string>,
  rolls: <DieRollResult[]>,  // includes kept/dropped/manual flags
  modifier: <sum of flat modifiers>,
  total: <grand total>,
  timestamp: Date.now()
}
```

### Local storage quota
- **Status:** Not implemented/tested — storage-quota fallback handling remains pending and should be covered during QA.

## Notes
- Depends on STORY-006a (consumes EvaluationResult), STORY-001.
- Animation for panel entry: `transition: transform 300ms ease-out` (bottom sheet slides up; modal fades in).
