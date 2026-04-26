# STORY-003: Bluetooth / Pixels Service

## Goal
A service layer managing connecting to Pixels dice, receiving roll events, and sending glow commands — the rest of the app never touches the SDK directly.

## Prerequisites
- STORY-000 Spike D must be complete (Windows reconnect delay workaround confirmed).

## Canonical Die Type
Map `pixel.dieType === "d00"` → `"d100"` here at the BLE boundary. All values emitted from this service use `DieType` from `src/types/formula.ts`.

## Acceptance Criteria

### BLE Capability Detection (runs on app load)
- [ ] On app initialisation, check `"bluetooth" in navigator && navigator.bluetooth !== undefined`
- [ ] If unavailable, set `bleAvailable: false` in Zustand store — the UI layer uses this to show a persistent banner (see STORY-004)
- [ ] Platform-specific messages (stored as constants in this service):
  - iOS Safari: `"Open this app in the Bluefy browser to use Bluetooth dice"`
  - Firefox / unsupported: `"Bluetooth dice require Chrome or Edge"`
  - Linux Chrome: `"Enable chrome://flags/#enable-web-bluetooth then restart Chrome"`

### Connection
- [ ] `connectDie(): Promise<void>` — calls `requestPixel()`, connects, registers in store; catches permission denial (user cancels picker or denies) and sets a `bleError` string in store without throwing
- [ ] `disconnectDie(pixelId: string): Promise<void>`
- [ ] On permission denial: store `bleError = "Bluetooth permission denied. Tap 'Connect' to try again."` — the UI layer surfaces this as a toast

### Roll Events
- [ ] Subscribe to the SDK's settled roll event (face is stable, not the intermediate rolling state) — determined by Spike A/D; use `onRoll` or equivalent "rolled" final state event only
- [ ] **Deduplication**: ignore any roll event that arrives within 300ms of a previous roll event from the same die (debounce per-die)
- [ ] `onRollResult(callback: (pixelId: string, face: number, dieType: DieType) => void): Unsubscribe` — exposed to the roll engine (STORY-006a)

### Glow / Animate
- [ ] `glowDie(pixelId: string, color?: { r: number; g: number; b: number }): Promise<void>` — makes the die pulse to prompt user; default colour: white
- [ ] `stopGlow(pixelId: string): Promise<void>`
- [ ] `stopAllGlows(): Promise<void>` — called on navigation away mid-roll (STORY-006a cleanup)

### Battery
- [ ] Subscribe to battery level events from the SDK; update `batteryLevel` in `PixelEntry` when received
- [ ] If SDK does not push battery events continuously, request battery level once on connect and store the result; document in Findings of STORY-000

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
- [ ] Additional store fields: `bleAvailable: boolean`, `bleError: string | null`
- [ ] Actions: `addPixel`, `updatePixelState`, `removePixel`, `setBleError`, `clearBleError`

### Windows reconnect delay
- [ ] Use `repeatConnect()` exported from `@systemic-games/pixels-web-connect` — confirmed to exist (STORY-000 Spike D)
- [ ] Use `repeatConnect()` on all platforms (it is safe everywhere, just has slightly slower connect on non-Windows; avoids platform detection complexity)

### Manual Test Checklist
- [ ] Connect one d6 → appears in Settings screen list with battery %
- [ ] Roll die → event fires once per physical roll (deduplication verified by rolling quickly)
- [ ] `glowDie()` → die visibly pulses
- [ ] `stopGlow()` → animation stops
- [ ] Deny permission on connect → toast shown, app does not crash
- [ ] Open in Firefox → unsupported banner shown
- [ ] Disconnect die via Settings → state updates in UI

## Notes
- No UI in this story — pure service and store.
- Depends on STORY-000, STORY-001.
