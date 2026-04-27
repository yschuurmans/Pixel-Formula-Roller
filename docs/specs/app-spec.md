# Pixel Formula Roller — App Specification

> Last updated: 2026-04-27
> Status: Spec updated for Android-only product and aligned with the working Capacitor Android + native BLE implementation

---

## 1. Product Overview

An Android-only mobile app that connects to [Pixels electronic dice](https://gamewithpixels.com/) over native Android Bluetooth Low Energy. Users build dice formulas visually or via text input, then roll those formulas. The app signals the correct physical dice to light up, collects their results, and displays a roll history.

The target product should behave like a dedicated Android Pixels companion app:

- On app launch and app resume, it automatically scans for previously known Pixels dice
- Any known dice that are currently detectable are automatically reconnected without requiring the user to pick them again
- The user only needs a manual pairing flow when adding a brand-new die or when OS permissions were revoked

---

## 2. Technology Decisions

### Frontend
- **Framework**: React + Vite (TypeScript, strict mode)
- **Styling**: Tailwind CSS — pixel-art / retro theme via a custom pixel font (Press Start 2P or similar)
- **State**: Zustand (lightweight, no boilerplate)
- **Routing**: React Router v6

### Android Shell
- **App shell**: Capacitor Android app wrapping the React UI
- **IDE / build system**: Android Studio + Gradle
- **Runtime target**: Foreground Android app, APK/AAB distribution

### Bluetooth
- **Protocol**: Native Android BLE
- **Integration shape**: A native Android BLE layer exposed to the React app through a thin Capacitor bridge
- **Implementation language**: Java on the Android side for BLE scanning, connection, notifications, and reconnect
- **Behavior target**: Automatically reconnect all detectable remembered dice on app launch / resume

### Persistence
- **App data**: Capacitor Preferences-backed persistence for formulas and settings
- **Known dice cache**: Persist remembered Pixels identities and auto-connect metadata locally on-device
- No backend required for MVP

### Formula Parsing
- **Library**: `rpg-dice-roller` (npm) — supports NdX, kh, kl, modifiers
- Wrap in a thin service layer so it can be swapped later

---

## 3. Platform Support

### Supported runtime

| Platform | Status | Notes |
|----------|--------|-------|
| Android phone | Primary target | Full BLE support, APK install, auto-connect workflow |
| Android tablet | Supported | Same feature set as phone |

### Runtime scope

Only Android phone and tablet runtime support is in scope for MVP.

### Development hosts

| Host OS | Status |
|---------|--------|
| Windows | Supported via Android Studio + ADB |
| macOS | Supported via Android Studio + ADB |
| Linux | Supported via Android Studio + ADB |

---

## 4. Android Pixels BLE Integration

### Architecture

The React app calls a platform service that is implemented natively on Android.

Suggested TypeScript-facing contract:

```ts
interface PixelsPlatformService {
  initialize(): Promise<void>;
  connectNewDie(): Promise<void>;
  reconnectKnownDice(options?: { promptIfNeeded?: boolean }): Promise<void>;
  disconnectDie(pixelId: string): Promise<void>;
  onRollResult(callback: (pixelId: string, face: number, dieType: DieType) => void): () => void;
  glowDie(pixelId: string, color?: { r: number; g: number; b: number }): Promise<void>;
  stopGlow(pixelId: string): Promise<void>;
  stopAllGlows(): Promise<void>;
}
```

### Connection Flow
1. App launches or resumes in foreground
2. Native layer loads remembered Pixels identities from local storage
3. Native BLE scan starts automatically for a short reconnect window
4. Any remembered dice detected during that window are connected automatically
5. New dice are added through a manual "Connect new die" flow
6. Once connected, the die is added to the known-dice list for future auto-connect
7. Roll, battery, and status events are forwarded from Android to the React app

### Remembered Identity

The app should remember enough metadata to reconnect a die reliably on Android:

- Stable Pixels identity (`pixelId` once learned)
- Die type
- Last known Android BLE device identifier if available
- Last seen timestamp
- Whether the die is eligible for auto-connect

### Lighting a Die

The Android BLE layer should expose a high-level glow API to the React app. The React layer should never construct raw BLE payloads directly.

### Die Types

Canonical app tokens remain: `d4`, `d6`, `d8`, `d10`, `d12`, `d20`, `d100`.

If Pixels reports `d00`, map it to `d100` at the BLE boundary.

---

## 5. Formula Language

Uses standard RPG dice notation, parsed by `rpg-dice-roller`:

| Expression | Meaning |
|-----------|---------|
| `2d6` | Roll 2 six-sided dice, sum |
| `1d20+5` | Roll d20, add 5 |
| `2d20kh1` | Roll 2d20, keep highest 1 (advantage) |
| `2d20kl1` | Roll 2d20, keep lowest 1 (disadvantage) |
| `5d8kl3` | Roll 5d8, keep lowest 3 |
| `2d20kh1+1d8+3d6kl1` | Complex compound formula |

The formula string is the single source of truth. The visual dice picker is derived from it and writes back to it.

---

## 6. Screens

### 6.1 Main Screen

```
┌─────────────────────────────┐
│ [⚡ Pixel Formula Roller]    │
│                 [+ New]  [⚙] │
├─────────────────────────────┤
│ SAVED FORMULAS              │
│  ┌──────────┐ ┌──────────┐  │
│  │ Fireball │ │ Attack   │  │
│  │ 8d6      │ │ 1d20+5   │  │
│  └──────────┘ └──────────┘  │
│  ┌──────────┐               │
│  │ Sneak Atk│               │
│  │ 2d20kh1  │               │
│  └──────────┘               │
├─────────────────────────────┤
│ ROLL HISTORY (last 5)       │
│  Fireball  → 28             │
│  Attack    → 17             │
│  2d6+3     → 11             │
│  ...                        │
└─────────────────────────────┘
```

**Behaviour:**
- Tapping a saved formula card → opens Formula Screen with formula pre-loaded
- Kebab menu on a card → Edit / Delete options
- Roll history shows: formula label/string, total result, timestamp
- History count is configurable in Settings (default 5)
- [+ New] → opens blank Formula Screen
- [⚙] → opens Settings Screen

---

### 6.2 Formula Screen

```
┌─────────────────────────────┐
│ [← Back]  Formula  [Delete] │
├─────────────────────────────┤
│ Name: [Attack Roll_______]  │
├─────────────────────────────┤
│ DICE PICKER                 │
│  [d4 ][-][0][+]             │
│  [d6 ][-][2][+]  ← counter  │
│  [d8 ][-][0][+]             │
│  [d10][-][0][+]             │
│  [d12][-][0][+]             │
│  [d20][-][1][+]             │
│  [d% ][-][0][+]             │
├─────────────────────────────┤
│ MODIFIERS                   │
│  Flat modifier: [+5_______] │
│  Keep: [kh▼] [1___] of each │
├─────────────────────────────┤
│ FORMULA TEXT                │
│ [1d20+2d6+5_____________]   │
│                  (editable) │
├─────────────────────────────┤
│       [  ROLL  ] [  SAVE  ] │
└─────────────────────────────┘
```

**Dice Picker behaviour:**
- Shows all 7 types: d4, d6, d8, d10, d12, d20, d% (d100)
- Each row: die icon | [−] | count | [+]
- Count cannot go below 0
- Any change to counts/modifiers regenerates the formula text field
- Each die group can independently have a keep-highest or keep-lowest modifier

**Formula Text behaviour:**
- Mirrors the visual picker at all times
- Fully editable; on blur (leaving the field), parse the formula and update the visual picker to match
- If parse fails, show inline validation error; do not clear the text

**Keep modifier (per die group):**
- Each die type row optionally has: Keep [kh / kl] [N]
- Only visible / relevant when count ≥ 2
- Generates the `kdX` suffix in the formula

**Roll button:**
- Determine which physical Pixels dice are needed (by die type and count)
- For each required die, call the BLE glow API to light it up
- Listen for roll events on the subscribed dice
- As results come in, tick off the required rolls
- When all required dice have reported, evaluate the formula with actual values and display the Result Panel
- If a needed die is not connected, show inline guidance and offer manual entry fallback only if that story is in scope

**Save button:**
- Validate: formula must be non-empty and parseable
- Name must be non-empty; if blank, show inline validation error
- Persist locally on-device
- Navigate back to Main Screen

**Delete button (only shown when editing existing formula):**
- Confirmation dialog → remove from saved formulas → navigate back

---

### 6.3 Result Panel (inline / modal)

Appears after a roll completes:

```
┌─────────────────────┐
│ Attack Roll         │
│ Formula: 1d20kh1+5  │
│                     │
│ d20 #1 → [18] ✓     │
│ d20 #2 → [7]  (drp) │
│ +5 (modifier)       │
│ ──────────────────  │
│ TOTAL: 23           │
│                     │
│  [Roll Again] [✕]   │
└─────────────────────┘
```

- Shows each die result individually, marking kept vs. dropped
- Shows flat modifier contribution
- Shows grand total
- [Roll Again] repeats the same formula (lights dice again)
- [✕] closes the panel; result is added to roll history

---

### 6.4 Settings Screen

| Setting | Default | Description |
|---------|---------|-------------|
| History length | 5 | Max entries in roll history |
| Known dice | — | List of connected / remembered Pixels dice |
| Auto-connect | On | Remembered dice are auto-connected on launch and resume |
| Theme | Pixel (dark) | Visual theme selector |

---

- Each known-die row supports both **Disconnect** and **Forget** actions
- **Forget** removes the die from remembered state, removes it from the Settings list, and stops future auto-connect until the user manually connects that die again

## 7. Bluetooth State Management

- App maintains a **Pixel registry** in Zustand keyed by `pixelId`
- Each live entry tracks: `dieType`, `connectionState`, `batteryLevel`, `lastRollFace`
- App also maintains a **remembered dice registry** for auto-connect
- On connect: subscribe to roll and battery events, register die in live state, and mark it remembered for future reconnect
- On disconnect: update live state but keep the die in remembered state unless explicitly forgotten by the user
- On app launch / resume: native layer scans for remembered dice and reconnects every detectable match automatically

Roll collection flow:
1. Formula is parsed → extract required die types and counts
2. Required dice are matched against connected registry entries
3. Missing dice → surface warning and optionally allow manual entry fallback when that story is implemented
4. On roll event received → match to pending slot in formula evaluation queue
5. When all slots filled → evaluate formula → show Result Panel

---

## 8. Data Models

### SavedFormula
```ts
interface SavedFormula {
  id: string;           // uuid
  name: string;
  formula: string;      // e.g. "2d20kh1+1d8+3"
  createdAt: number;    // epoch ms
  updatedAt: number;
}
```

### RollHistoryEntry
```ts
interface RollHistoryEntry {
  id: string;
  formulaId?: string;   // if from a saved formula
  formulaString: string;
  rolls: DieRollResult[];
  modifier: number;
  total: number;
  timestamp: number;
}

interface DieRollResult {
  dieType: string;      // "d20", "d6", etc.
  face: number;
  kept: boolean;
}
```

### RememberedPixel
```ts
interface RememberedPixel {
  pixelId: string;
  dieType: DieType;
  lastKnownDeviceId: string | null;
  autoConnect: boolean;
  lastSeenAt: number | null;
}
```

### AppSettings
```ts
interface AppSettings {
  historyLength: number;
  theme: "pixel-dark";
}
```

---

## 9. MVP Scope

**In scope:**
- Main screen with saved formulas + roll history
- Formula screen with visual picker + text input + keep modifiers
- Android-native BLE connect / disconnect per die
- Automatic reconnect to all detectable remembered dice on app launch / resume
- Dice glow on roll prompt
- Result panel with per-die breakdown
- Save / edit / delete formulas
- Configurable history length
- APK debug builds and direct install / launch to a connected Android device

**Out of scope (post-MVP):**
- iOS app
- Cloud sync / accounts
- Shared formula libraries
- Custom animations per formula
- Roll statistics / analytics

---

## 10. Android Development And Device Run Workflow

This project should support a direct developer workflow where the phone is connected once and every build installs and launches automatically. No manual APK transfer or manual sideloading should be part of the normal loop.

### 10.1 Tooling prerequisites

Install:

- Node.js and npm
- Android Studio
- Android SDK Platform Tools (`adb`)
- Android SDK platform + build tools for the target API level
- A USB data cable for first-time pairing

### 10.2 Phone setup

On the Android phone:

1. Open **Settings → About phone**
2. Tap **Build number** seven times to enable Developer Options
3. Open **Developer options**
4. Enable **USB debugging**
5. Optionally enable **Wireless debugging** for cable-free iteration later

### 10.3 First-time workspace bootstrap

```bash
npm install
npm run build
npx cap sync android
npx cap open android
```

Notes:

- `npx cap sync android` updates the native Android project from the web assets and Capacitor config
- `npx cap open android` opens the native project in Android Studio

### 10.4 Direct install and run on a connected phone

Connect the phone by USB, accept the device trust prompt on the phone, then run:

```bash
adb devices
npx cap run android --target <device-id>
```

Expected workflow:

- Gradle builds the app
- The app is installed directly to the connected phone
- The app launches automatically
- Re-running the same command updates the installed app in place

This is the default dev loop. Do not require developers to build an APK, copy it to the phone, and install it manually.

### 10.5 Android Studio run workflow

If Android Studio is open:

1. Connect the phone
2. Confirm it appears in the device dropdown
3. Press **Run**

Android Studio should build, install, and launch directly to the device with no manual APK handling.

### 10.6 Optional live-reload workflow

For faster UI iteration, support a live-reload loop:

```bash
npm run dev -- --host 0.0.0.0
npx cap run android --target <device-id> -l --external
```

Requirements:

- Phone and dev machine must be on the same network
- Native BLE functionality must still be available in the Android shell

### 10.7 Optional wireless debugging workflow

Once USB debugging works, developers may switch to wireless ADB:

```bash
adb pair <phone-ip>:<pair-port>
adb connect <phone-ip>:<debug-port>
adb devices
npx cap run android --target <device-id>
```

This still builds, installs, and launches directly to the phone. No APK transfer step is introduced.

---

## 11. Open Questions

1. How should the app behave when Android Bluetooth permissions are denied permanently from system settings?
2. d% (d100): does the Pixels device report 1–100 or 0–99 on Android? Confirm against real hardware.
3. Is the current reconnect scan window on launch / resume sufficient for slower devices and multiple dice?
