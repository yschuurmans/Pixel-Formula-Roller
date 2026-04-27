# Project Status — Last updated 2026-04-27

> Product-spec pivot note: the target product is now Android-only. Android shell and native BLE bridge work are the remaining platform blockers.

## Stories

| Story | Status | Notes |
|-------|--------|-------|
| STORY-000 | ✅ Done | Spike findings documented in `done/` |
| STORY-001 | ✅ Done | Scaffold complete, verified by tester |
| STORY-002 | ✅ Done | Parser/service verified, regression covered, clean test/build |
| STORY-003 | ✅ Done | BLE service layer implemented and validated |
| STORY-004 | ✅ Done | Main Screen UI implemented and validated |
| STORY-007 | ✅ Done | Pulled ahead for hardware verification; includes live recent-roll monitor |
| STORY-005, STORY-006a, STORY-006b, STORY-009 | 🔲 Backlog | Formula flow and roll engine remain |
| STORY-008 (Android packaging/device workflow) | 🔲 Backlog | Direct build/install/run to a connected phone; no manual APK transfer |

## STORY-002 — Closed out

The story is now fully closed out:

1. The story file is in `docs/stories/done/`.
2. The `d%` normalisation fix is reflected in the implementation and story checklist.
3. Tester findings were appended to the story file after validation.

## Current state of the codebase

```
src/
  types/formula.ts          ✅ All 8 types defined (DieType, DiceGroup, ParsedFormula,
                               RequiredDie, DieRollResult, GroupResult, EvaluationResult,
                               PickerState)
  services/
    formulaParser.ts        ✅ All 5 functions implemented and tested
    pixelsService.ts        ✅ BLE connect/disconnect, roll subscriptions, battery, glow
    __tests__/
      formulaParserSmoke.test.ts   ✅ 1 test (rpg-dice-roller smoke)
      formulaParser.test.ts        ✅ Parser coverage
      pixelsService.test.ts        ✅ BLE service coverage
  stores/useAppStore.ts     ✅ Zustand store with BLE state + quota-safe persist
  pages/
    MainScreen.tsx          ✅ Implemented
    FormulaScreen.tsx       ✅ Stub
    SettingsScreen.tsx      ✅ Hardware verification UI implemented
  main.tsx                  ✅ Routes wired
  index.css                 ✅ Tailwind + retro base styling
```

**`npm test`**: 63/63 passing  
**`npm run build`**: Clean

## Reprioritized order

Hardware validation now happens through STORY-007 before the formula flow stories:

1. STORY-003 — BLE service layer
2. STORY-004 — Main Screen UI
3. STORY-007 — Settings screen and live hardware verification
4. STORY-005 — Formula editor
5. STORY-006a — Roll engine
6. STORY-006b — Result panel

## What to build next

File: `docs/stories/backlog/STORY-005-formula-screen.md`

The next blocker after hardware verification is the formula editor so saved formulas can actually be created and edited from the new UI.

## Known issues / watch-outs

- Android bridge implementation is still pending; current BLE code is an interim adapter surface.
- `rpg-dice-roller` is v5.0.0 (not 5.5.0)
- Node.js is at `/mnt/c/nvm4w/nodejs/` — only accessible with `dangerouslyDisableSandbox: true`
- d100 face range from hardware is still unconfirmed — code has a verification note for the current assumption
