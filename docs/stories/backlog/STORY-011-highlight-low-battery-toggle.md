# STORY-011 — Highlight low-battery dice (Settings toggle)

Summary

Add a Settings toggle that visually highlights paired/remembered dice by battery level using the dice glow. When enabled the app will cycle through each die and apply a color or action based on its reported battery percentage.

Why

Helps the user quickly identify dice that need charging by using the hardware glow instead of manually inspecting each die.

User-facing behavior

- Settings includes a toggle labelled: "Highlight low battery dice" with a short description: "Cycle paired dice and indicate battery level with glow colors; dice > 80% will be disconnected and not highlighted."
- Toggling ON starts a continuous cycle that visits each remembered/paired die one at a time and applies the battery-based action.
- Toggling OFF immediately stops the cycle and cancels any in-progress glow for the current die.

Battery-to-action mapping (exact)

- Battery > 80%: disconnect the die (it's charged enough — do not highlight).
- Battery > 60% and <= 80%: glow GREEN.
- Battery > 40% and <= 60%: glow YELLOW.
- Battery <= 40%: glow RED.

Notes on boundaries: battery values are integers in range 0–100. The mapping uses the exclusive/ inclusive comparisons above (e.g., 61–80 => green, 41–60 => yellow, <=40 => red).

Acceptance criteria

- The toggle appears on the Settings screen and persists across app restarts (use existing settings store).
- When enabled and there are no remembered/paired dice, a non-blocking toast appears: "No paired dice to highlight." No errors logged.
- When enabled and there are paired dice, the app cycles each die in turn, applying the mapping above.
- Each die receives a glow command for a configurable hold time (default 2000ms) except dice > 80% which are sent a disconnect command and are skipped for glowing.
- The cycle runs only while the toggle is ON and the app is in foreground (suspend when app backgrounded).
- Turning the toggle OFF immediately stops further commands and cancels pending glow timers.
- Unit tests cover the battery-to-color mapping helper.
- Integration tests (mocking `pixelsService`) verify the cycle sends the expected sequence of commands for a sample set of battery values.

UI / UX details

- Toggle text: "Highlight low battery dice"
- Toggle description (subtext): "Cycle paired dice and indicate battery level with LEDs (red/yellow/green). Dice > 80% are disconnected and not highlighted."
- Provide an inline small status hint when running: "Highlighting: 3 dice — running" with a stop button next to the toggle (optional visual affordance).
- Default: OFF.

Implementation notes

- Add a persisted setting `highlightLowBattery: boolean` to the settings slice in the existing store.
- `SettingsScreen` should render the toggle and call an action that starts/stops the cycle in `pixelsService` when the toggle changes.
- Implement a `pixelsService` helper method, e.g. `startBatteryHighlightCycle(opts)` which:
  - Reads the list of remembered/paired dice from the store (or pixels slice).
  - Iterates them in order, for each die:
    - Reads battery percentage (from cached value or by requesting an immediate read if supported).
    - If battery > 80: call the existing disconnect method for that die and do not send glow.
    - Else map battery to color and call the glow command for `holdMs` (default 2000).
  - Wait `holdMs` between dice; loop continuously until stopped.
  - Return a controller object with `stop()` to cancel the cycle cleanly.
- Implement helper: `batteryToHighlightAction(percent): { action: 'disconnect'|'glow', color?: 'red'|'yellow'|'green' }` and unit-test it.
- Ensure the cycle yields control (uses await/sleep) and does not block React main thread.
- Respect hardware rate-limits; do not spam commands if many dice exist (use sensible debounce/delay and allow config).

Testing & QA

- Unit tests: `batteryToHighlightAction` with boundary tests (40,41,60,61,80,81).
- Integration tests: mock `pixelsService` to assert correct calls for a sample set of dice with varied battery levels.
- Manual QA: run with 3–5 physical dice having different battery states; verify glow color and that dice > 80% are disconnected and not glowing.

Developer notes / risks

- Disconnecting dice automatically may surprise users; confirm product/BA approval. If this is not desired, change the action to "skip highlighting" instead of disconnect.
- BLE races: repeated connect/disconnect and glow commands can create race conditions on older firmware. Add short delays and retry guards.
- If battery reads are stale, consider requesting a battery refresh from the device before acting.

Estimated effort

Small story: ~1–2 dev days (toggle + store wiring + `pixelsService` helper + unit tests + one integration smoke test + QA on device).

Files to change (implementation)

- `src/pages/SettingsScreen.tsx` — add toggle and wire to store.
- `src/stores/useAppStore.ts` — add `highlightLowBattery` setting and action.
- `src/services/pixelsService.ts` — add `startBatteryHighlightCycle` / `stopBatteryHighlightCycle` and `batteryToHighlightAction` helper.
- `src/services/__tests__/pixelsService.test.ts` — add unit/integration tests.


---

Created-by: developer-story-generator
Date: 2026-04-28
