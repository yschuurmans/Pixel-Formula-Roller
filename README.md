<!-- placeholder to register finalization -->
# Pixel Formula Roller

Android-native dice roller for [Pixels electronic dice](https://gamewithpixels.com/). The current app shell, native BLE bridge, die discovery, direct device deployment, and hardware verification flow are all working on Android.

## Prerequisites

- Node.js 20+
- npm 10+
- Android Studio
- Android SDK Platform Tools (`adb`)
- Android phone or tablet with Developer Options enabled

## Setup

```bash
# Install dependencies
npm install

# Run tests
npm test

# Build web assets consumed by the Android shell
npm run build

# Sync the Android project
npx cap sync android

# Open the Android project in Android Studio
npx cap open android
```

## Direct Device Run

Enable USB debugging on the phone, connect it with a USB data cable, accept the trust prompt, then run:

```bash
adb devices
npx cap run android --target <device-id>
```

That command should build, install, and launch directly on the connected phone. The normal workflow does not involve copying APK files to the phone or installing them manually.

Full setup, PowerShell environment examples, Gradle fallback commands, logcat usage, and troubleshooting are documented in [docs/guides/deploy-to-android-phone.md](docs/guides/deploy-to-android-phone.md).

## Current Implemented Surface

- Native Android BLE runs through a Capacitor bridge and is used by the React app via `src/services/pixelsTransport.ts` and `src/services/pixelsService.ts`
- The Settings screen can connect a die, show battery/connection state, and display recent roll events from hardware
- The app can build, install, and relaunch directly on a USB-connected phone without manual APK transfer
- Formula creation and full roll-engine orchestration are still backlog work

## Optional Live Reload

```bash
# Start the UI asset host used by the Android shell
npm run dev

# Launch on device against the live-reload host
npx cap run android --target <device-id> -l --external
```

## Tech Stack

| Layer | Choice |
|-------|--------|
| Framework | React 19 + Vite 6 (TypeScript strict) |
| Android shell | Capacitor + Android Studio |
| Styling | Tailwind CSS v4 + Press Start 2P font |
| State | Zustand with persist middleware |
| Routing | React Router v6 |
| Bluetooth | Native Android BLE via a Capacitor bridge |
| Formula parsing | `rpg-dice-roller` |
| Date formatting | `date-fns` |
| Tests | Vitest + Testing Library |

## Runtime Target

| Platform | Support |
|----------|---------|
| Android phones | Primary target |
| Android tablets | Supported |

## Project Structure

```
src/
  pages/          # Route-level page components
  services/       # Business logic (formula parser, platform BLE facade)
  stores/         # Zustand state (useAppStore)
  types/          # Shared TypeScript types
  test/           # Vitest setup
docs/
  specs/          # Full product spec and BA review
  stories/        # Story backlog and progress tracking
```

## Notes

- The product target is Android-only.
- The preferred developer loop is direct build/install/run to a connected phone.
- See `CLAUDE.md` for full development guidelines and architecture decisions.
