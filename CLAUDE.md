# Pixel Formula Roller — Claude Workspace

> Full spec: `docs/specs/app-spec.md`
> BA review: `docs/specs/ba-review-2026-04-26.md`

## Project Overview

Android-only mobile app that connects to [Pixels electronic dice](https://gamewithpixels.com/) over native Android BLE. The React UI remains, but Bluetooth moves behind a native Android bridge so the app can auto-connect detectable remembered dice on launch and resume.

## Tech Stack

| Layer | Choice |
|-------|--------|
| Framework | React + Vite (TypeScript strict) |
| Android shell | Capacitor + Android Studio |
| Styling | Tailwind CSS + Press Start 2P font (pixel-art theme) |
| State | Zustand with `persist` middleware |
| Routing | React Router v6 |
| Bluetooth | Native Android BLE via a Capacitor bridge implemented in Kotlin |
| Formula parsing | `rpg-dice-roller` (wrapped in `src/services/formulaParser.ts`) |
| Date formatting | `date-fns` (formatDistanceToNow for history timestamps) |
| Persistence | On-device storage via Capacitor/Android-backed persistence |
| Tests | Vitest |

## Platform Support
- Android phones and tablets only for MVP
- Development hosts: Windows, macOS, Linux via Android Studio + ADB
- Web / PWA, iOS, and desktop runtime are out of scope after the platform pivot

## Target Architecture Note
- The product spec targets Android-only behavior.
- Future Bluetooth work should converge on a platform BLE adapter backed by a native Android bridge.

## Canonical Die Type
Internal token: `"d4" | "d6" | "d8" | "d10" | "d12" | "d20" | "d100"` (DieType in `src/types/formula.ts`)
- BLE boundary: map SDK's `"d00"` → `"d100"`
- UI labels only: display `"d100"` as `"d%"`
- Never use `"d00"` or `"d%"` as a data value anywhere

## Project Structure

```
docs/
  specs/app-spec.md              # Full product spec (READ THIS FIRST)
  specs/ba-review-2026-04-26.md  # BA review findings
  stories/
    backlog/                     # Not started
    in-progress/                 # Being worked on
    done/                        # Complete
src/
  services/
    formulaParser.ts             # rpg-dice-roller wrapper
    pixelsService.ts             # BLE service facade; migrate to Android platform bridge
  stores/
    useAppStore.ts               # Zustand store (formulas, history, settings, pixels)
  types/
    formula.ts                   # Shared TypeScript interfaces (DieType, ParsedFormula, etc.)
  components/                    # Shared UI components
  pages/
    MainScreen.tsx               # Route /
    FormulaScreen.tsx            # Route /formula/new and /formula/:id
    SettingsScreen.tsx           # Route /settings
```

## Story Map & Build Order

| Story | Description | Depends on |
|-------|-------------|------------|
| **STORY-000** | Spike — validate rpg-dice-roller injection, d% range, round-trip, Android BLE behavior | — |
| **STORY-001** | Project setup & Android scaffolding | — |
| **STORY-002** | Formula parser service | 000, 001 |
| **STORY-003** | Android BLE / Pixels service layer | 000, 001 |
| **STORY-004** | Main Screen UI | 001 (parallel with 002, 003) |
| **STORY-007** | Settings screen + hardware verification | 001, 003 |
| **STORY-005** | Formula Screen — picker + text input | 001, 002 |
| **STORY-006a** | Roll engine — glow, collect, evaluate | 002, 003, 005 |
| **STORY-006b** | Result Panel — display, Roll Again, history | 006a |
| **STORY-009** | Manual roll entry fallback | 003, 006a |
| **STORY-008** | Android packaging & direct device-run workflow | 001 |

For hardware-first verification, STORY-007 is intentionally pulled ahead of STORY-005/006 so BLE pairing, auto-reconnect, disconnect, battery reporting, and recent settled-roll events can be tested on real dice before the formula flow is finished.

## Key Design Decisions (resolved from BA review)

| Decision | Choice |
|----------|--------|
| Edit/delete UX on formula cards | Kebab menu (⋮) — no long-press or swipe |
| Card tap behaviour | Pre-loads formula; NO auto-glow — user presses ROLL |
| Multi-die simultaneous glow | All connected dice glow at once; user rolls all at once |
| Roll Again history write | Writes previous result before restarting |
| Flat modifier display | Summed as single value in Result Panel |
| History list content | Formula name/string + total only (no per-die breakdown) |
| Theme toggle | Dark theme only for MVP; toggle hidden |
| Unsaved changes guard | React Router `useBlocker`, [Keep editing] / [Discard] dialog |
| Blank name on save | Inline validation error (no prompt dialog, no auto-name) |
| d% / d100 | Canonical internal token: `"d100"`; SDK `"d00"` mapped at BLE boundary |
| Pixels Zustand slice | `Record<string, PixelEntry>` (plain object), excluded from persist |
| Result Panel layout | Bottom sheet on mobile (< 768px), modal on desktop (≥ 768px) |
| Launch behaviour | On app launch/resume, auto-connect all detectable remembered dice |

## Open Questions (pending STORY-000 spike)

1. **rpg-dice-roller injection** — can it accept pre-rolled values? → Update STORY-002 evaluateFormula after spike
2. **d100 face range** — 1–100 or 0–99 from Android BLE events? → Update STORY-002 after device validation
3. **Formula round-trip** — does rpg-dice-roller normalise strings? → Update STORY-002 after spike
4. **Android reconnect window** — how long should startup auto-connect scan before surfacing dice as offline? → Update STORY-003 after hardware validation

## Development Guidelines

- Implement only what the current story requires — no speculative abstractions.
- No comments unless the WHY is non-obvious.
- Validate only at system boundaries (user input, BLE events).
- Run dev server and test the golden path before marking a story done.
- TypeScript strict mode throughout.
- When picking up after a break: read CLAUDE.md, then the current in-progress story file.

## Commands

```bash
# Development
npm install          # Install dependencies
npm run dev          # Start the UI asset host used by Android live reload
npm test             # Run Vitest tests
npm run build        # Production build → dist/

# Android shell
npx cap sync android                 # Sync web assets/config into Android project
npx cap open android                 # Open Android Studio
adb devices                          # Verify connected phone/debug target
npx cap run android --target <id>    # Build, install, and launch on device
npx cap run android --target <id> -l --external   # Optional live reload on device
```

## Deployment Notes

- The target deliverable is an Android APK/AAB, not a Docker deployment.
- Normal developer workflow should be direct build/install/run to a connected phone via Android Studio or `npx cap run android --target <id>`.
- Avoid any workflow that depends on manually copying APK files to the device.
