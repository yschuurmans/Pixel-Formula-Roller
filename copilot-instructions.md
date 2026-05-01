# Copilot Project Instructions

Purpose
-------
This repository-level instruction file documents the constraints and working conventions Copilot (or any code-generating assistant) must follow when creating or modifying code for this project. The intent is to keep the codebase readable, well-layered, test-safe, and to avoid generating large unstructured files.

When to consult this file
-------------------------
- Read this file before you: creating new features that span multiple files, performing refactors, or generating library-level helpers.
- If you are asked to make a single-line or trivial change, you do not need to re-run the full checklist, but still respect the stylistic rules below.

High-level principles
---------------------
- Tests-first: always run the test suite before making refactors. If tests fail before you start, stop and report the failures.
- Small, focused changes: prefer many small changes over one large change.
- Separation of concerns (onion layers):
  - Presentation: `src/pages`, `src/components` — UI, hooks, lifecycle, and event wiring only.
  - Application: `src/application` — pure application logic, use-cases, builders, transformations, and evaluation helpers.
  - Infrastructure: `src/services`, `src/stores`, `src/transports` — BLE, persistence, network, and platform adapters.

Screen architecture rules (mandatory)
------------------------------------
- Screens in `src/pages` must remain thin composition shells. They may read a view-model hook and render JSX, but they should not accumulate business rules, reconnect loops, timer orchestration, or service-heavy workflows.
- For any non-trivial screen, use this structure:
  - `src/application/<screen>/<Screen>Controller.ts` for synchronous derivations, state transitions, and policy decisions.
  - `src/application/<screen>/use<Screen>Controller.ts` for React-side orchestration: router integration, store selection, effects, timers, refs, and service calls.
  - `src/pages/<Screen>.tsx` for rendering and event-to-view-model wiring only.
- If a screen grows beyond basic rendering and event forwarding, stop adding logic to the page and extract the behavior before continuing.
- Do not move business logic into presentational subcomponents just to shrink a page file. Presentational sections may format data and emit callbacks, but screen behavior belongs in the application layer.

Type ownership rules
--------------------
- Reuse canonical types from the owning layer. Do not create ad hoc duplicates of store, service, or application-layer shapes inside pages or controllers.
- If a helper or service already consumes a repository type such as `RememberedPixelEntry`, import that exact type instead of recreating a structurally similar local type.
- Shared UI-only types can live near the application controller for that screen if they represent view-model data, but domain and persistence types stay in their owning modules.

File and function sizing rules
-----------------------------
- Functions should generally be under 100 lines. If a function grows beyond 100 lines, split it into clearly named helpers.
- Files and classes should contain roughly between 1 and 10 functions/methods. If a file grows larger, split it by responsibility.
- Components (presentation) should be small and focused; any non-UI logic should be extracted to the Application layer.

Refactor workflow (mandatory)
----------------------------
1. Run the full test suite: `npm test`.
   - If tests fail, stop and report; do not refactor until the baseline is green.
2. Create a short TODO plan for the work (track progress). In this environment, use the `manage_todo_list` tool; in other environments add a `TODO` or issue.
3. Refactor one screen or one local behavior slice at a time. Do not rewrite multiple screens in one unvalidated step.
4. Implement minimal changes to fix the root cause — avoid extensive, speculative rewrites.
5. After the first substantive edit, run the narrowest affected tests immediately.
6. Run `tsc -b` or `npm run build` during screen refactors, not only at the end. Targeted tests can miss cross-layer type mismatches.
7. When done, run the full relevant page suite again and confirm all tests are passing.
8. Run build: `npm run build`. For Android-facing changes, run the repository's deploy script or Android task before considering the work complete.

Screen refactor sequence (must-follow)
-------------------------------------
1. Extract or centralize pure helpers first.
2. Extract presentational sections second, if needed.
3. Extract screen behavior into `use<Screen>Controller` and `<Screen>Controller` third.
4. Validate after each step before starting the next one.
5. Only after the controller/view-model boundary is stable should you do adjacent cleanup or deduplication.

Tooling & communication rules (for interactive/code-gen assistants)
------------------------------------------------------------------
- Preambles: before running commands, making tool calls, or creating multi-file changes, emit a concise 1–2 sentence preamble explaining what you will do next. Keep it short (≈8–12 words).
- TODOs: when a task requires multiple steps, create and maintain a TODO list (use the `manage_todo_list` tool if available). Update statuses as you make progress.
- Patches: use repository-appropriate patch tooling for edits (in this environment use `apply_patch`). Keep patches minimal and focused.
- Do not produce changes that only remove noise; prefer changes that improve structure or fix root causes.

TypeScript & JSX rules
----------------------
- Keep `tsconfig` strict settings passing: remove unused imports and duplicate types.
- Files that contain JSX must use the `.tsx` extension.
- Centralize shared types in `src/types/*`.
- Do not leave stale page-local state, handlers, or imports behind after moving logic into a controller hook; the page should compile cleanly as a shell.

Testing & logging
-----------------
- Tests are the source of truth: do not modify tests to suit generated code without human review.
- Avoid adding noisy, unconditional console logs in code that tests exercise. If debug logs are needed, gate them behind a debug flag or logger.
- For screen architecture work, validate in this order: focused screen tests, broader page tests, then `npm run build`, then Android deploy if the change can affect runtime packaging or integration.

Comments & naming
-----------------
- Prefer clear, self-explanatory names. Add comments only when the reasoning (WHY) is non-obvious.
- Keep names consistent with repository conventions (e.g., `d100` canonical internal token; BLE mapping of `d00`→`d100` occurs at the transport boundary).

Code organization guidance
-------------------------
- When generating a new feature that involves UI + business logic + infra, create these artifacts:
  - `src/pages/<Feature>Page.tsx` (presentation): minimal, composes components and orchestrates effects.
  - `src/application/<feature>/*` (application): pure helpers, builders, and evaluation functions.
  - `src/services/<feature>/*` (infrastructure): platform/adapter code, native bridges.
- Keep naming predictable: `*Helpers.ts`, `*Service.ts`, `*Transport.ts`, `*Store.ts`.
- For screens specifically, prefer the naming pair `use<Screen>Controller.ts` and `<Screen>Controller.ts` over ad hoc hook names when the screen owns substantial behavior.

Examples (must-follow patterns)
------------------------------
- Move heavy pure logic from pages into `src/application/*`.
- Keep BLE mapping and device-specific conversions inside `src/services`/`src/transports`.
- Keep timers, reconnect cycles, toast lifecycles, and route/state orchestration out of `src/pages/*` once they exceed trivial inline behavior.
- If a page ends up mostly destructuring a `vm` object and rendering sections, that is the intended shape, not a smell.

Pre-merge checklist
-------------------
- All tests pass locally: `npm test`.
- TypeScript compiles: `tsc -b` (or `npm run build`).
- Lint/format run where configured (e.g., `npm run format`).
- Commits are small and focused; include a short changelog entry if a large refactor is introduced.

When you can't comply
---------------------
- If a requested generation conflicts with these rules, stop and ask for clarification.
- If tests must be changed (rare), create a clear justification and propose the change for human review.

Checklist for small refactors (quick template)
---------------------------------------------
1. Run `npm test` and confirm green.
2. Draft a 3–5 step TODO (what you'll change, why).
3. Extract logic to `src/application/*` or `src/services/*` as appropriate.
4. Run `tsc -b` and unit tests for the affected modules.
5. Re-run full test suite and `npm run build`.
6. Push a focused commit and add a short summary in PR description.

Notes for maintainers
---------------------
- This file is intended as a repository-level guardrail. If you want to enforce checks automatically, consider adding CI steps that verify function/file size, run tests, and block large bundles.
- Keep this file short and practical — update it when project-wide conventions change.

---
Generated by repository maintainers to guide Copilot and code-generating assistants. Follow these rules strictly for any non-trivial work.
