# STORY-003: Android BLE / Pixels Service

## Goal
A service layer managing connecting to Pixels dice, auto-reconnecting remembered dice, receiving roll events, and sending glow commands through a native Android BLE bridge. The React app must never touch raw platform Bluetooth APIs directly.

## Prerequisites
- STORY-000 device validation findings available for die type mapping and settled roll behavior.

## Canonical Die Type
Map any Android/native Pixels `d00` value to `"d100"` here at the BLE boundary. All values emitted from this service use `DieType` from `src/types/formula.ts`.

## Acceptance Criteria

### Android BLE Availability And Permissions
- [ ] On app initialisation, query the native layer for BLE availability and runtime permission state
- [ ] If unavailable, set `bleAvailable: false` in Zustand store
- [ ] If Android Bluetooth permissions are missing, set a `bleError` string in store with actionable guidance
- [ ] The service exposes a way for the UI to trigger the native permission request flow

### Connection
- [ ] `connectDie(): Promise<void>` — opens the native Android add-die flow, connects, registers in store, and remembers the die for future auto-connect
- [ ] `reconnectPairedDice(options?): Promise<void>` — attempts to reconnect all remembered dice currently detectable by Android BLE
- [ ] `disconnectDie(pixelId: string): Promise<void>`
- [ ] On permission denial: store `bleError = "Bluetooth permission denied. Tap 'Connect' to try again."` — the UI layer surfaces this as a toast

### Automatic Reconnect
- [ ] On app launch and app resume, the service automatically scans for remembered dice
- [ ] Any remembered dice that are currently detectable are connected without user interaction
- [ ] If none are found, the app remains usable and surfaces disconnected state without crashing
- [ ] The reconnect scan window is bounded so startup does not hang indefinitely

### Roll Events
- [ ] Subscribe to the native layer's settled roll event (face is stable, not the intermediate rolling state)
- [ ] **Deduplication**: ignore any roll event that arrives within 300ms of a previous roll event from the same die (debounce per-die)
- [ ] `onRollResult(callback: (pixelId: string, face: number, dieType: DieType) => void): Unsubscribe` — exposed to the roll engine (STORY-006a)

### Glow / Animate
- [ ] `glowDie(pixelId: string, color?: { r: number; g: number; b: number }): Promise<void>` — makes the die pulse to prompt user; default colour: white
- [ ] `stopGlow(pixelId: string): Promise<void>`
- [ ] `stopAllGlows(): Promise<void>` — called on navigation away mid-roll (STORY-006a cleanup)

### Battery
- [ ] Subscribe to battery level events from the native layer; update `batteryLevel` in `PixelEntry` when received
- [ ] If battery is not pushed continuously, request it once on connect and store the result

### Zustand `pixels` slice
- [ ] Use `Record<string, PixelEntry>` (plain object keyed by pixelId) — NOT a `Map` (Maps do not serialise to JSON)
- [ ] `PixelEntry`:
  ```ts
  interface PixelEntry {
    pixelId: string;
    dieType: DieType;
    connectionState: "connected" | "disconnected";
    batteryLevel: number | null;
    lastFace: number | null;
  }
  ```
- [ ] The `pixels` slice is **excluded from `persist` middleware** using Zustand's `partialize` option — live SDK objects are not serialisable and the connected state is transient
- [ ] Additional store fields: `bleAvailable: boolean`, `bleError: string | null`, `pairedPixelIds: string[]`
- [ ] Actions: `addPixel`, `updatePixelState`, `removePixel`, `rememberPairedPixelId`, `setBleError`, `clearBleError`

### Native bridge boundary
- [ ] The React app talks to a platform service interface, not directly to Android APIs
- [ ] The actual Android BLE implementation lives behind a Capacitor bridge so the UI can stay framework-level and testable

### Manual Test Checklist
- [ ] Connect one d6 → appears in Settings screen list with battery %
- [ ] Close and reopen the app with the same die nearby → it auto-reconnects without opening a picker
- [ ] Power on two remembered dice near the phone → both reconnect automatically on app launch
- [ ] Roll die → event fires once per physical roll (deduplication verified by rolling quickly)
- [ ] `glowDie()` → die visibly pulses
- [ ] `stopGlow()` → animation stops
- [ ] Deny permission on connect → toast shown, app does not crash
- [ ] Disconnect die via Settings → state updates in UI

## Notes
- No UI in this story — pure service and store.
- Depends on STORY-000, STORY-001.
