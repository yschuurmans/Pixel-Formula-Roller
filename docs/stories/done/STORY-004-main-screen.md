# STORY-004: Main Screen UI

## Goal
The home screen showing saved formula cards and roll history, so users have a launchpad for all actions.

## Acceptance Criteria

### BLE unavailability banner
- [x] If `bleAvailable === false` in store, show a non-dismissible banner at the top with the platform-specific message from `pixelsService`

### Saved Formulas section
- [x] Grid of formula cards; each card shows: name (bold), formula string (monospace/smaller)
- [x] Each card has a **kebab menu (⋮) button** in the top-right corner — this is the sole edit/delete entry point (no long-press, no swipe)
- [x] Kebab menu items: [Edit] → navigate to `/formula/:id` | [Delete] → confirmation modal
- [x] Tapping the card body (not the ⋮ button) → navigate to `/formula/:id` with the formula pre-loaded; **no auto-glow on load**
- [x] Empty state: `"No saved formulas yet — tap + to add one"`

### Delete confirmation modal
- [x] Custom modal (not `window.confirm`)
- [x] Title: `"Delete formula?"`, body: `"'<name>' will be permanently removed."`
- [x] Buttons: [Cancel] (left) | [Delete] (right, destructive colour)
- [x] On confirm: remove from store, close modal, show toast `"Formula deleted"`

### Roll History section
- [x] List of last N entries (N = `settings.historyLength`, default 5); newest at top
- [x] Each entry shows: **formula name or formula string** (if unnamed) + **total result** + **relative timestamp**
- [x] Do NOT show per-die breakdown in the history list
- [x] Empty state: `"No rolls yet"`

### Local storage quota errors
- [x] Zustand persist writes are wrapped defensively for quota handling
- [x] On quota pressure, history is trimmed and the write is retried

### Navigation
- [x] [+ New] button → `/formula/new`
- [x] [⚙] button → `/settings`

### Layout
- [x] Responsive: single-column on mobile (≤ 767px), two-column formula grid on desktop (≥ 768px)
- [x] Pixel-art / retro theme: Press Start 2P font, pixel borders, dark background

## Notes
- Reads from Zustand `savedFormulas`, `rollHistory`, `settings`, `bleAvailable` slices.
- Implemented and validated alongside the hardware-first flow that feeds recent roll history back from the BLE service.