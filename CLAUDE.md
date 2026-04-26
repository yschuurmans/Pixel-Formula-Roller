# Pixel Formula Roller — Claude Workspace

> Full spec: `docs/specs/app-spec.md`
> BA review: `docs/specs/ba-review-2026-04-26.md`

## Project Overview

Mobile-first PWA that connects to [Pixels electronic dice](https://gamewithpixels.com/) over Web Bluetooth. Users build dice formulas visually or via text, roll them, and the matching physical dice light up. Results are collected and displayed with a per-die breakdown.

## Tech Stack

| Layer | Choice |
|-------|--------|
| Framework | React + Vite (TypeScript strict) |
| Styling | Tailwind CSS + Press Start 2P font (pixel-art theme) |
| State | Zustand with `persist` middleware |
| Routing | React Router v6 |
| Bluetooth | `@systemic-games/pixels-web-connect` (official Pixels SDK) |
| Formula parsing | `rpg-dice-roller` (wrapped in `src/services/formulaParser.ts`) |
| Date formatting | `date-fns` (formatDistanceToNow for history timestamps) |
| Persistence | Local Storage (no backend for MVP) |
| Tests | Vitest |

## Browser Support
- Chrome / Edge (Android, Windows, macOS) — native Web Bluetooth
- Linux Chrome — requires `chrome://flags/#enable-web-bluetooth`
- iOS — requires Bluefy browser
- Firefox / Safari — Web Bluetooth unsupported; app shows guidance banner

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
    pixelsService.ts             # Web Bluetooth / Pixels SDK wrapper
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
| **STORY-000** | Spike — validate rpg-dice-roller injection, d% range, round-trip, Windows BLE | — |
| **STORY-001** | Project setup & scaffolding | — |
| **STORY-002** | Formula parser service | 000, 001 |
| **STORY-003** | Bluetooth/Pixels service layer | 000, 001 |
| **STORY-004** | Main Screen UI | 001 (parallel with 002, 003) |
| **STORY-005** | Formula Screen — picker + text input | 001, 002 |
| **STORY-006a** | Roll engine — glow, collect, evaluate | 002, 003, 005 |
| **STORY-006b** | Result Panel — display, Roll Again, history | 006a |
| **STORY-007** | Settings screen | 001, 003 |
| **STORY-009** | Manual roll entry fallback | 003, 006a |
| **STORY-008** | Docker & Docker Compose | 001 (implement last) |

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

## Open Questions (pending STORY-000 spike)

1. **rpg-dice-roller injection** — can it accept pre-rolled values? → Update STORY-002 evaluateFormula after spike
2. **d100 face range** — 1–100 or 0–99 from SDK? → Update STORY-002 after spike
3. **Formula round-trip** — does rpg-dice-roller normalise strings? → Update STORY-002 after spike
4. **Windows reconnect** — does SDK expose `repeatConnect()`? → Update STORY-003 after spike

## Development Guidelines

- Implement only what the current story requires — no speculative abstractions.
- No comments unless the WHY is non-obvious.
- Validate only at system boundaries (user input, BLE events).
- Run dev server and test the golden path before marking a story done.
- TypeScript strict mode throughout.
- When picking up after a break: read CLAUDE.md, then the current in-progress story file.

## Commands

```bash
# Development (no Docker)
npm install          # Install dependencies
npm run dev          # Start Vite dev server (http://localhost:5173)
npm test             # Run Vitest tests
npm run build        # Production build → dist/

# Production (Docker)
cp .env.example .env
docker compose up --build    # nginx on port 80 (or APP_PORT)
docker compose down
```

## Deployment Notes

- Production runs as a static nginx container — no backend, no database.
- **Web Bluetooth requires HTTPS** in production. Use Caddy or nginx + Certbot in front of the Docker container for any non-localhost deployment.
