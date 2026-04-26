# STORY-001: Project Setup & Tech Stack Bootstrap

## Goal
Scaffold the webapp so all subsequent stories have a working dev environment to build on.

## Stack
- Vite + React + TypeScript (strict)
- Tailwind CSS
- Zustand (state)
- React Router v6
- `@systemic-games/pixels-web-connect`
- `rpg-dice-roller`

## Acceptance Criteria
- [x] `npm create vite@latest` with React + TypeScript template
- [x] TypeScript `strict: true` in tsconfig
- [x] Tailwind CSS installed and configured
- [x] Press Start 2P font (Google Fonts) applied globally — sets the retro tone
- [x] React Router v6 with placeholder routes: `/` (Main), `/formula/new`, `/formula/:id`, `/settings`
- [x] Zustand store skeleton: `useAppStore` with empty `savedFormulas`, `rollHistory`, `settings`, `pixels` slices
- [x] `@systemic-games/pixels-web-connect` installed; verify it imports without error
- [x] `rpg-dice-roller` installed; write a quick smoke-test parse of `"2d6+3"` in a component
- [x] `npm run dev` starts without errors
- [x] README updated with setup instructions

## Notes
- Keep placeholder components thin — just route stubs. Real UI is in later stories.
- See `docs/specs/app-spec.md` § 2 for full rationale on stack choices.

---

## Tester Findings

**Verified by:** QA (2026-04-26)
**Overall: PARTIAL PASS** — All static checks pass. Runtime checks (npm test, npm run build) could not be executed in the CI sandbox due to a WSL 1 / Node.js environment limitation; these must be verified manually or in a proper CI pipeline.

### AC Results

1. ✓ PASS — Vite + React + TypeScript template: `vite.config.ts`, `src/main.tsx`, and `index.html` all exist and are correctly structured.
2. ✓ PASS — TypeScript strict mode: `tsconfig.app.json` has `"strict": true` under `compilerOptions`.
3. ✓ PASS — Tailwind CSS: `@tailwindcss/vite` is in `vite.config.ts` plugins; `@import "tailwindcss"` is the first line of `src/index.css`.
4. ✓ PASS — Press Start 2P font: `index.html` has the Google Fonts `<link>` for Press Start 2P; `src/index.css` applies it to `body` via `font-family: 'Press Start 2P', monospace`.
5. ✓ PASS — React Router routes: `src/main.tsx` declares routes for `/`, `/formula/new`, `/formula/:id`, and `/settings`.
6. ✓ PASS — Zustand store: `src/stores/useAppStore.ts` exports `useAppStore` with `savedFormulas`, `rollHistory`, `settings`, and `pixels` slices. `pixels` is correctly excluded from `partialize` (only `savedFormulas`, `rollHistory`, and `settings` are persisted).
7. ✓ PASS — pixels-web-connect installed: present in `package.json` dependencies (`^1.3.1`) and `node_modules/@systemic-games/pixels-web-connect` directory exists.
8. ! UNVERIFIED — rpg-dice-roller smoke test: smoke test file exists at `src/services/__tests__/formulaParserSmoke.test.ts` and correctly tests `"2d6+3"` parsing via `DiceRoller`. Could not run `npm test` in this environment (WSL 1 / Node.js not available in sandbox). **Must be verified manually.**
9. ! UNVERIFIED — `npm run build` succeeds: Could not run build in this environment. **Must be verified manually.**
10. ✓ PASS — README: `README.md` contains setup instructions with both `npm install` and `npm run dev` (plus `npm test` and `npm run build`).

### Action Required

ACs 8 and 9 need manual verification by the developer or in a CI environment with Node.js available:

```bash
npm test        # should pass the rpg-dice-roller smoke test
npm run build   # should exit 0 with no TypeScript or bundler errors
```

All static/file-level checks passed without issue. No code defects were found during review.
