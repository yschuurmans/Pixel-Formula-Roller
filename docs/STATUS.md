# Project Status — Last updated 2026-04-27

> Product-spec pivot note: the target product is Android-only and now runs through a working Capacitor Android shell with a native BLE bridge.

## Stories

| Story | Status | Notes |
|-------|--------|-------|
| STORY-000 | ✅ Done | Spike findings documented in `done/` |
| STORY-001 | ✅ Done | Scaffold complete, verified by tester |
| STORY-002 | ✅ Done | Parser/service verified, regression covered, clean test/build |
| STORY-003 | ✅ Done | BLE service layer implemented and validated |
| STORY-004 | ✅ Done | Main Screen UI implemented and validated |
| STORY-005 | ✅ Done | Formula screen implemented, validated, and deployed to Android device |
| STORY-006a | ✅ Done | Roll engine wired into FormulaScreen, including sequential rolling and manual fallback handoff |
| STORY-007 | ✅ Done | Pulled ahead for hardware verification; includes live recent-roll monitor |
| STORY-008 | ✅ Done | Direct device build/install/run workflow verified on physical Android hardware |
| STORY-006b, STORY-009, STORY-010 | 🔲 Backlog | Result panel polish, manual-entry finish work, and remembered-die confirmation flow remain |

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
    pixelsService.ts        ✅ Native Android BLE connect/disconnect, reconnect,
                               roll subscriptions, battery, glow
    pixelsTransport.ts      ✅ Capacitor-native Pixels transport/session bridge
  stores/useAppStore.ts     ✅ Zustand store with BLE state + quota-safe persist
  pages/
    MainScreen.tsx          ✅ Implemented
    FormulaScreen.tsx       ✅ Implemented, including roll engine and core manual fallback
    SettingsScreen.tsx      ✅ Hardware verification UI implemented
  main.tsx                  ✅ Routes wired
  index.css                 ✅ Tailwind + retro base styling
tests/
  services/                 ✅ Service-level Vitest coverage
  pages/                    ✅ Screen-level Vitest coverage
  components/               ✅ Bridge/component Vitest coverage
  stores/                   ✅ Store/persistence Vitest coverage
```

**Focused validations completed**:
- `npm test -- tests/services/pixelsService.test.ts tests/pages/SettingsScreen.test.tsx`
- `npm run build`
- `android/.\gradlew.bat app:installDebug`

## Reprioritized order

Hardware validation now happens through STORY-007 before the formula flow stories:

1. STORY-003 — BLE service layer
2. STORY-004 — Main Screen UI
3. STORY-007 — Settings screen and live hardware verification
4. STORY-006b — Result panel
5. STORY-009 — Manual entry fallback polish
6. STORY-010 — Forget remembered die confirmation + persistence UX

## What to build next

File: `docs/stories/backlog/STORY-006b-result-panel.md`

The next blocker after the implemented roll engine is the result panel so completed rolls can match the planned modal/bottom-sheet display and close semantics.

## Known issues / watch-outs

- `rpg-dice-roller` is v5.0.0 (not 5.5.0)
- d100 face range from hardware is still unconfirmed — code still carries the current verification note
- Forgetting a remembered die is now tracked as follow-up story `docs/stories/backlog/STORY-010-forget-remembered-die.md`
- STORY-009 is only partially satisfied today: manual fallback works, but its planned result-panel labeling still depends on STORY-006b
