# STORY-004: Main Screen UI

## Goal
The home screen showing saved formula cards and roll history, so users have a launchpad for all actions.

## Acceptance Criteria

### BLE unavailability banner
- [ ] If `bleAvailable === false` in store, show a non-dismissible banner at the top with the platform-specific message from `pixelsService` constants

### Saved Formulas section
- [ ] Grid of formula cards; each card shows: name (bold), formula string (monospace/smaller)
- [ ] Each card has a **kebab menu (⋮) button** in the top-right corner — this is the sole edit/delete entry point (no long-press, no swipe)
- [ ] Kebab menu items: [Edit] → navigate to `/formula/:id` | [Delete] → confirmation modal (see below)
- [ ] Tapping the card body (not the ⋮ button) → navigate to `/formula/:id` with the formula pre-loaded; **no auto-glow on load** — the user must press ROLL
- [ ] Empty state: `"No saved formulas yet — tap + to add one"`

### Delete confirmation modal
- [ ] Custom modal (not `window.confirm`)
- [ ] Title: `"Delete formula?"`, body: `"'<name>' will be permanently removed."`
- [ ] Buttons: [Cancel] (left) | [Delete] (right, destructive colour)
- [ ] On confirm: remove from store, close modal, show toast `"Formula deleted"`

### Roll History section
- [ ] List of last N entries (N = `settings.historyLength`, default 5); newest at top
- [ ] Each entry shows: **formula name or formula string** (if unnamed) + **total result** + **relative timestamp**
  - Relative timestamp uses `date-fns` `formatDistanceToNow` with `addSuffix: true` (e.g. "2 minutes ago", "just now")
  - Do NOT show per-die breakdown in the history list — full breakdown is in the Result Panel only
- [ ] Empty state: `"No rolls yet"`

### Local storage quota errors
- [ ] Wrap any `localStorage.setItem` call (via Zustand persist) in a try/catch for `QuotaExceededError`
- [ ] On error: show toast `"Storage full — oldest history entries will be removed"` then trim history to half `historyLength` and retry

### Navigation
- [ ] [+ New] button → `/formula/new`
- [ ] [⚙] button → `/settings`

### Layout
- [ ] Responsive: single-column on mobile (≤ 767px), two-column formula grid on desktop (≥ 768px)
- [ ] Pixel-art / retro theme: Press Start 2P font, pixel borders, dark background

## Notes
- Reads from Zustand `savedFormulas`, `rollHistory`, `settings`, `bleAvailable` slices.
- `date-fns` should be added to `package.json` in STORY-001 or this story.
- Depends on STORY-001. Can be built in parallel with STORY-002 and STORY-003.
