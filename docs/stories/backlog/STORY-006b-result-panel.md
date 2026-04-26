# STORY-006b: Result Panel — Display, History, Roll Again

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
- [ ] **Writes the current result to roll history first** (same as [✕] close)
- [ ] Then restarts the roll engine (STORY-006a) with the same formula — glows dice again
- [ ] History entry is written before the panel closes so no result is lost even if the user rolls again immediately

### [✕ / Close] button
- [ ] Writes result to `rollHistory` in Zustand store (prepend, trim to `settings.historyLength`)
- [ ] Dismisses the panel
- [ ] Shows no additional toast — the history list update is confirmation enough

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
- [ ] If writing history throws `QuotaExceededError`, trim history to half `historyLength` and retry once; if still fails, show toast `"Storage full — result not saved to history"`

## Notes
- Depends on STORY-006a (consumes EvaluationResult), STORY-001.
- Animation for panel entry: `transition: transform 300ms ease-out` (bottom sheet slides up; modal fades in).
