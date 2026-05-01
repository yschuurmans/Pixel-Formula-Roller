# STORY-011 — Highlight low-battery dice (DONE)

Summary

Add a Settings toggle that visually highlights paired/remembered dice by battery level using the dice glow. When enabled the app cycles remembered/paired dice and applies a color or action based on the reported battery percentage.

Status: Completed 2026-04-29

Completed work
- Implemented `startBatteryHighlightCycle` / `stopBatteryHighlightCycle` in `src/services/pixelsService.ts` with parallel connect/read/disconnect/glow orchestration.
- Wired Settings toggle in `src/pages/SettingsScreen.tsx` to start/stop the cycle and enforce exclusivity with cleanup toggles.
- Made `highlightLowBattery` transient (not persisted) in `src/stores/useAppStore.ts` per product decision.
- Added `batteryToHighlightAction` helper and unit tests; updated service tests to assert glow behavior.
- Replaced short blink behavior with long-duration instant animations and implemented clean cancellation (`stopAllAnimations`).
- Ran unit tests and verified build locally (tests covering modified units passed).

Notes / Remaining work
- Foreground/background suspension of the highlight cycle is not implemented; see backlog for next steps.
- Product decision required for whether to auto-disconnect dice >80% or simply skip highlighting (current implementation disconnects as specified in the backlog).

Files of interest
- `src/services/pixelsService.ts`
- `src/pages/SettingsScreen.tsx`
- `src/stores/useAppStore.ts`
- `tests/services/pixelsService.test.ts`
