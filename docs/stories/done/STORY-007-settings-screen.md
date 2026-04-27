# STORY-007: Settings Screen

## Goal
Let users manage connected Pixels dice and configure app behaviour like history length.

## Acceptance Criteria

### Navigation
- [x] Route `/settings` renders Settings Screen
- [x] [← Back] uses `navigate(-1)` (navigation stack back) — not a hardcoded route to `/`

### Connected Dice section
- [x] Lists each entry from the `pixels` store (connected and recently disconnected)
- [x] Each row: die type icon, last 4 chars of pixelId, battery % (or `"—"` if null), connection state badge
- [x] Battery level: display value from store; if null (not yet received), show `"—"` — do not show 0%
- [x] [Connect new die] button → calls `pixelsService.connectDie()` → new die appears in list on success
- [x] Per-die [Disconnect] button → calls `pixelsService.disconnectDie(pixelId)`
- [x] Empty state: `"No dice connected — tap 'Connect new die' to get started"`
- [x] BLE unavailability: if `bleAvailable === false`, [Connect new die] is disabled and shows tooltip with platform-specific message

### History Length setting
- [x] Numeric input, min 1, max 50, default 5
- [x] Change persists to store immediately (no save button needed)
- [x] Changing the value does not truncate existing history immediately — truncation happens the next time a roll result is written

### Theme setting
- [x] **Stubbed in this story**: render the dark theme unconditionally; the theme toggle control is hidden (not rendered)
- [x] `theme` field in `AppSettings` remains in the type for forward compatibility but is always `"dark"` until implemented post-MVP

### Zustand persist
- [x] `settings` slice (historyLength, theme) is persisted to on-device app storage
- [x] `pixels` slice is NOT persisted (see STORY-003)

### Hardware verification panel
- [x] Screen includes a live `Recent Roll Events` list backed by `pixelsService.onRollResult()`
- [x] Newest events appear first and show die type, face, pixel suffix, and relative timestamp
- [x] Empty state: `"No recent rolls detected yet"`

## Notes
- Pulled ahead of STORY-005 / STORY-006a to validate BLE pairing and settled roll events on real hardware before the formula flow is complete.
- Battery subscription is implemented in STORY-003; this screen only reads from the store.