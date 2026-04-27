# STORY-003: Android BLE / Pixels Service

## Goal
A service layer managing connecting to Pixels dice, auto-reconnecting remembered dice, receiving roll events, and sending glow commands through a native Android BLE bridge. The React app must never touch raw platform Bluetooth APIs directly.

## Prerequisites
- STORY-000 device validation findings available for die type mapping and settled roll behavior.

## Canonical Die Type
Map any Android/native Pixels `d00` value to `"d100"` here at the BLE boundary. All values emitted from this service use `DieType` from `src/types/formula.ts`.

## Acceptance Criteria

### Android BLE Availability And Permissions
- [x] On app initialisation, query the native layer for BLE availability and runtime permission state
- [x] If unavailable, set `bleAvailable: false` in Zustand store
- [x] If Android Bluetooth permissions are missing, set a `bleError` string in store with actionable guidance
- [x] The service exposes a way for the UI to trigger the native permission request flow

### Connection
- [x] `connectDie(): Promise<void>` — opens the native Android add-die flow, connects, registers in store, and remembers the die for future auto-connect
- [x] `reconnectPairedDice(options?): Promise<void>` — attempts to reconnect all remembered dice currently detectable by Android BLE
- [x] `disconnectDie(pixelId: string): Promise<void>`
- [x] On permission denial: store `bleError = "Bluetooth permission denied. Tap 'Connect' to try again."`

### Automatic Reconnect
- [x] On app launch and app resume, the service automatically scans for remembered dice
- [x] Any remembered dice that are currently detectable are connected without user interaction
- [x] If none are found, the app remains usable and surfaces disconnected state without crashing
- [x] The reconnect scan window is bounded so startup does not hang indefinitely

### Roll Events
- [x] Subscribe to the native layer's settled roll event (face is stable, not the intermediate rolling state)
- [x] **Deduplication**: ignore any roll event that arrives within 300ms of a previous roll event from the same die (debounce per-die)
- [x] `onRollResult(callback: (pixelId: string, face: number, dieType: DieType) => void): Unsubscribe` — exposed to the roll engine (STORY-006a)

### Glow / Animate
- [x] `glowDie(pixelId: string, color?: { r: number; g: number; b: number }): Promise<void>` — makes the die pulse to prompt user; default colour: white
- [x] `stopGlow(pixelId: string): Promise<void>`
- [x] `stopAllGlows(): Promise<void>` — called on navigation away mid-roll (STORY-006a cleanup)

### Battery
- [x] Subscribe to battery level events from the native layer; update `batteryLevel` in `PixelEntry` when received
- [x] If battery is not pushed continuously, request it once on connect and store the result

### Zustand `pixels` slice
- [x] Use `Record<string, PixelEntry>` (plain object keyed by pixelId) — NOT a `Map` (Maps do not serialise to JSON)
- [x] `PixelEntry`:
  ```ts
  interface PixelEntry {
    pixelId: string;
    dieType: DieType;
    connectionState: "connected" | "disconnected";
    batteryLevel: number | null;
    lastFace: number | null;
  }
  ```
- [x] The `pixels` slice is **excluded from `persist` middleware** using Zustand's `partialize` option — live SDK objects are not serialisable and the connected state is transient
- [x] Additional store fields: `bleAvailable: boolean`, `bleError: string | null`, `pairedPixelIds: string[]`
- [x] Actions: `addPixel`, `updatePixelState`, `removePixel`, `rememberPairedPixelId`, `setBleError`, `clearBleError`

### Native bridge boundary
- [x] The React app talks to a platform service interface, not directly to Android APIs
- [x] The actual Android BLE implementation lives behind a Capacitor bridge so the UI can stay framework-level and testable

### Manual Test Checklist
- [x] Connect one d6 → appears in Settings screen list with battery %
- [x] Close and reopen the app with the same die nearby → it auto-reconnects without opening a picker
- [x] Roll die → recent roll event appears in the Settings screen monitor
- [x] `glowDie()` → die visibly pulses
- [x] `stopGlow()` → animation stops
- [x] Deny permission on connect → actionable error shown, app does not crash
- [x] Disconnect die via Settings → state updates in UI

## Notes
- Implemented through a local Capacitor Android plugin in `android/app/src/main/java/com/youri/pixelformularoller/PixelsBlePlugin.java`.
- The React-side transport adapter lives in `src/services/pixelsTransport.ts`; `pixelsService.ts` stays the app-facing BLE facade.
- The Android bridge now covers scan, permission flow, connect/disconnect, notification streaming, battery updates, glow commands, and remembered-die reconnect behavior.

## Validation Notes
- Native Android BLE discovery and connection were verified on a physical Android device.
- Transport debugging covered permission flow, scan filtering, GATT service selection, Android 13+ notification callbacks, and MTU negotiation.
- Focused regression coverage exists in `src/services/__tests__/pixelsService.test.ts`.