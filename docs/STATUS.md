# Project Status — Last updated 2026-04-27

## Stories

| Story | Status | Notes |
|-------|--------|-------|
| STORY-000 | ✅ Done | Spike findings documented in `done/` |
| STORY-001 | ✅ Done | Scaffold complete, verified by tester |
| STORY-002 | ⚠️ Code complete, not closed out | See below |
| STORY-003 through 009 | 🔲 Backlog | |
| STORY-008 (Docker) | 🔲 Backlog — implement last | |

## STORY-002 — Immediate next actions

The implementation is complete and verified clean. Before starting STORY-003, do these three things:

1. **Fix the story file location** — find where it currently is and move it to `done/`:
   ```bash
   find /mnt/d/Git/Pixel-Formula-Roller/docs/stories -name "STORY-002*"
   # then mv it to docs/stories/done/
   ```

2. **Check off the d% fix** in the story file — the developer's implementation had a bug (`\bd%\b` regex didn't match because `%` is a non-word char). It was fixed in `src/services/formulaParser.ts` line 71: changed to `.replace(/d%/gi, 'd100')`. All 34 tests now pass.

3. **Run the tester agent** on STORY-002 (it was never launched — session ran out of budget). Prompt:
   - Read `docs/stories/done/STORY-002-formula-parser-service.md`
   - Verify all ACs against `src/services/formulaParser.ts` and `src/services/__tests__/formulaParser.test.ts`
   - Run `npm test` (allowed without sandbox bypass via the allowlist entry `Bash(npm test *)`)
   - Append `## Tester Findings` to the story file

## Current state of the codebase

```
src/
  types/formula.ts          ✅ All 8 types defined (DieType, DiceGroup, ParsedFormula,
                               RequiredDie, DieRollResult, GroupResult, EvaluationResult,
                               PickerState)
  services/
    formulaParser.ts        ✅ All 5 functions implemented and tested
    __tests__/
      formulaParserSmoke.test.ts   ✅ 1 test (rpg-dice-roller smoke)
      formulaParser.test.ts        ✅ 33 tests — all passing
  stores/useAppStore.ts     ✅ Zustand store (pixels excluded from persist)
  pages/
    MainScreen.tsx          ✅ Stub
    FormulaScreen.tsx       ✅ Stub
    SettingsScreen.tsx      ✅ Stub
  main.tsx                  ✅ Routes wired
  index.css                 ✅ Tailwind + Press Start 2P font
```

**`npm test`**: 34/34 passing  
**`npm run build`**: Clean (231kb bundle)

## What to build next: STORY-003

File: `docs/stories/backlog/STORY-003-bluetooth-service.md`

Key points for the developer prompt:
- Create `src/services/pixelsService.ts`
- Import from `@systemic-games/pixels-web-connect` — use `repeatConnect()` (confirmed in spike)
- Zustand `pixels` slice: `Record<string, PixelEntry>`, already scaffolded in `useAppStore.ts`
- Add `bleAvailable` and `bleError` fields to the store
- BLE capability detection on app init (`navigator.bluetooth`)
- Deduplication: 300ms debounce per die on roll events
- Map SDK's `"d00"` → `"d100"` at the BLE boundary
- Pixels slice must be excluded from persist (already set up via `partialize` in the store)
- This story has NO UI — pure service + store additions

## Developer agent setup

Always launch with `mode: "bypassPermissions"` — Node.js is Windows-side, npm commands require sandbox disabled.

After developer completes: run `npm test` and `npm run build` yourself with `dangerouslyDisableSandbox: true`, fix any failures, then launch the tester agent.

## Known issues / watch-outs

- The `@systemic-games/pixels-web-connect` package is v1.3.1 (not 0.9.0 — that version doesn't exist)
- `rpg-dice-roller` is v5.0.0 (not 5.5.0)
- Node.js is at `/mnt/c/nvm4w/nodejs/` — only accessible with `dangerouslyDisableSandbox: true`
- d100 face range from SDK is unconfirmed — code has `// VERIFY: d100 face range assumed 0-99` comment
