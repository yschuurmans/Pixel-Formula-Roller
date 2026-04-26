# Pixel Formula Roller — App Specification

> Last updated: 2026-04-26
> Status: Spec complete, implementation not started

---

## 1. Product Overview

A mobile-first progressive web app (PWA) that connects to [Pixels electronic dice](https://gamewithpixels.com/) over Web Bluetooth. Users build dice formulas visually or via text input, then roll those formulas. The app signals the correct physical dice to light up, collects their results, and displays a roll history.

---

## 2. Technology Decisions

### Frontend
- **Framework**: React + Vite (TypeScript, strict mode)
- **Styling**: Tailwind CSS — pixel-art / retro theme via a custom pixel font (Press Start 2P or similar)
- **State**: Zustand (lightweight, no boilerplate)
- **Routing**: React Router v6

### Bluetooth
- **Library**: `@systemic-games/pixels-web-connect` (official Pixels JS SDK)
- **Protocol**: Web Bluetooth API (Chromium-based browsers only; Chrome, Edge, Opera)
- **iOS caveat**: Requires Bluefy browser on iOS

### Persistence
- **Local Storage** for saved formulas and settings (no backend needed for MVP)

### Formula Parsing
- **Library**: `rpg-dice-roller` (npm) — supports NdX, kh, kl, modifiers
- Wrap in a thin service layer so it can be swapped later

---

## 3. Browser / Device Support

| Platform | Browser | Bluetooth |
|----------|---------|-----------|
| Android  | Chrome / Edge | Native |
| Windows  | Chrome / Edge | Native (4s reconnect delay workaround needed) |
| macOS    | Chrome / Edge | Native |
| iOS      | Bluefy | Via Bluefy |
| Linux    | Chrome (flag: `#enable-web-bluetooth`) | Native |

---

## 4. Pixels BLE Integration

### Library Usage
```ts
import { requestPixel, Pixel } from "@systemic-games/pixels-web-connect";
```

### Connection Flow
1. User taps "Connect Die" → `requestPixel()` opens browser BLE picker
2. After selection → `pixel.connect()` establishes connection
3. Subscribe to `onRollState` / `onRoll` events for live roll data
4. App tracks each connected die by `pixel.pixelId` and `pixel.dieType`

### Lighting a Die
```ts
// Make a die flash a color to prompt the user to roll it
await pixel.sendMessage("playLightUpFace", { ... });
// Or use the blink/animate helpers from the SDK
```
Exact API calls depend on SDK version — consult `@systemic-games/pixels-web-connect` docs. The app should call the appropriate animation command to make a die glow when it is the next one to be rolled.

### Die Types
The SDK exposes `pixel.dieType` as one of: `d4`, `d6`, `d8`, `d10`, `d12`, `d20`, `d00` (percentile / d100).

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
- Tapping a saved formula card → opens Formula Screen with formula pre-loaded and dice glowing
- Long-press (or swipe / kebab menu) → Edit / Delete options
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
- For each required die, call the SDK glow/animate command to light it up
- Listen for roll events on the subscribed dice
- As results come in, tick off the required rolls
- When all required dice have reported, evaluate the formula with actual values and display the Result Panel (see 6.3)
- If a needed die is not connected → show prompt "Please connect a dX die"

**Save button:**
- Validate: formula must be non-empty and parseable
- Prompt for a name if none entered
- Persist to local storage
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
| Connected dice | — | List of currently connected Pixels dice, with Connect/Disconnect per die |
| Theme | Pixel (dark) | Visual theme selector |

---

## 7. Bluetooth State Management

- App maintains a **Pixel registry**: `Map<pixelId, Pixel>` held in Zustand store
- Each entry tracks: `dieType`, `connectionState`, `batteryLevel`, `lastRollFace`
- On connect: subscribe to roll events, store in registry
- On disconnect: update state, do not remove from registry (allow reconnect)
- Roll collection flow:
  1. Formula is parsed → extract required die types and counts
  2. Required dice are matched against connected registry entries
  3. Missing dice → surface warning but allow manual entry fallback (type the result)
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

### AppSettings
```ts
interface AppSettings {
  historyLength: number;  // default 5
  theme: "pixel-dark" | "pixel-light";
}
```

---

## 9. MVP Scope

**In scope:**
- Main screen with saved formulas + roll history
- Formula screen with visual picker + text input + keep modifiers
- Bluetooth connect/disconnect per die
- Dice glow on roll prompt
- Result panel with per-die breakdown
- Save / edit / delete formulas
- Configurable history length
- Docker Compose deployment (nginx serving production build)

**Out of scope (post-MVP):**
- Cloud sync / accounts
- Shared formula libraries
- Custom animations per formula
- Roll statistics / analytics
- Offline PWA install prompt (nice-to-have, defer)

---

## 11. Deployment

### Development
```bash
npm install && npm run dev    # Vite dev server at http://localhost:5173
```

### Production (Docker)
```
Dockerfile (multi-stage):
  Stage 1 — builder: node:lts-alpine → npm ci → npm run build → dist/
  Stage 2 — runner:  nginx:alpine    → copy dist/ → serve on :80

docker-compose.yml:
  service: app
  build: .
  ports: "${APP_PORT:-80}:80"
```

Custom `nginx.conf` must include:
- SPA fallback: `try_files $uri $uri/ /index.html` (required for React Router)
- Gzip compression
- Long-lived cache headers for hashed static assets; `no-cache` for `index.html`

> **HTTPS requirement**: Web Bluetooth only works on secure origins. In production outside of localhost, put a TLS-terminating proxy (Caddy or nginx + Certbot) in front of the Docker container.

---

## 10. Open Questions

1. Does `@systemic-games/pixels-web-connect` expose a simple "blink this die" call, or do we need to send raw animation payloads? (Check SDK source before STORY-004.)
2. How does the app handle a formula that needs 3× d6 but the user only has 1 connected d6? — Proposed: roll the same die 3 times sequentially, lighting it each time.
3. What happens when a die disconnects mid-roll? — Proposed: surface error, allow manual result entry.
4. d% (d100) — does the Pixels SDK report 1–100 or 0–99? Confirm against SDK docs.
