# STORY-007: Settings Screen

## Goal
Let users manage connected Pixels dice and configure app behaviour like history length.

## Acceptance Criteria

### Navigation
- [ ] Route `/settings` renders Settings Screen
- [ ] [← Back] uses `navigate(-1)` (browser history back) — not a hardcoded route to `/`

### Connected Dice section
- [ ] Lists each entry from the `pixels` store (connected and recently disconnected)
- [ ] Each row: die type icon, last 4 chars of pixelId, battery % (or `"—"` if null), connection state badge
- [ ] Battery level: display value from store; if null (not yet received), show `"—"` — do not show 0%
- [ ] [Connect new die] button → calls `pixelsService.connectDie()` → new die appears in list on success
- [ ] Per-die [Disconnect] button → calls `pixelsService.disconnectDie(pixelId)`
- [ ] Empty state: `"No dice connected — tap 'Connect new die' to get started"`
- [ ] BLE unavailability: if `bleAvailable === false`, [Connect new die] is disabled and shows tooltip with platform-specific message

### History Length setting
- [ ] Numeric input, min 1, max 50, default 5
- [ ] Change persists to store immediately (no save button needed)
- [ ] Changing the value does not truncate existing history immediately — truncation happens the next time a roll result is written

### Theme setting
- [ ] **Stubbed in this story**: render the dark theme unconditionally; the theme toggle control is hidden (not rendered)
- [ ] `theme` field in `AppSettings` remains in the type for forward compatibility but is always `"pixel-dark"` until implemented post-MVP

### Zustand persist
- [ ] `settings` slice (historyLength, theme) is persisted to local storage
- [ ] `pixels` slice is NOT persisted (see STORY-003)

## Notes
- Depends on STORY-001, STORY-003.
- Battery subscription is implemented in STORY-003; this screen only reads from the store.
