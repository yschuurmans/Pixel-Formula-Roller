# STORY-013 — Profiles

Status: backlog

## Summary

A Profile is a named collection of saved formulas plus its own roll history. Users can create, switch, rename, and delete profiles from the hamburger menu. When a profile is active the app shows only that profile's formulas and roll history. App-level settings and connected Pixels (BLE devices) remain shared across profiles.

## Motivation

Players may want separate formula sets and histories for different games/characters/contexts (for example: "Campaign A", "House Rules", "Solo Practice"). Profiles let users switch context quickly without changing device connections or app-level settings.

## User Stories

- As a user I can create a new profile with a name so I can keep formulas and history separate.
- As a user I can switch between profiles from the hamburger menu and see the formulas/history for that profile.
- As a user I can rename or delete profiles; deleting requires confirmation and cannot remove the last profile.
- As a returning user my active profile and all profiles persist across restarts.

## Acceptance Criteria

- There is always at least one profile (create a `Default` profile on first run or migration).
- Creating a profile requires a non-empty, unique name and immediately switches the app to the new profile.
- Switching profiles loads that profile's formulas and roll history into the UI.
- Roll results are written into the currently active profile's history.
- Formulas are saved per-profile; editing/saving affects only the active profile.
- App-level settings (including connected Pixels devices) remain shared and are not profile-scoped.
- Deleting a profile prompts for confirmation and prevents deleting the last remaining profile.
- Existing app data (pre-profile formulas/history) is migrated into the `Default` profile on upgrade.

## UI / UX

- Add a `Profiles` entry to the hamburger menu. The entry opens a lightweight management screen or modal that lists profiles and actions: Create, Rename, Delete, Select.
- Show the active profile name prominently in the app header (compact label).
- Creating: open a small modal, enter name, Save -> create profile and switch to it.
- Switching: tap a profile in the list -> quick switch (no changes to BLE connections or global settings).
- Deleting: long-press or action menu -> Delete -> confirmation dialog. If deleting active profile, pick a fallback profile (Default) to become active.
- Guard unsaved changes in formula editor when switching profiles (use existing unsaved-changes guard pattern).

## Data model

Suggested types (informational):

```ts
type Profile = {
  id: string; // uuid
  name: string;
  formulas: Record<string, SavedFormula>; // follow existing formula card shape
  history: RollResult[]; // same RollResult used elsewhere
}

// In the store:
profiles: Record<string, Profile>
activeProfileId: string
```

Implementation notes:
- Add `profiles` and `activeProfileId` to `useAppStore.ts` and persist them. Keep the `pixels` slice (connected devices) out of profile persistence — Pixels remains global.
- Components that read formulas/history should read from `profiles[activeProfileId]`.
- On first-run (or migration path) create a `Default` profile and migrate existing formulas/history into it.

## Persistence & Migration

- Persist `profiles` and `activeProfileId` with the existing persistence middleware. Exclude slices that are intentionally global (pixels device list, transient UI state).
- Migration: when upgrading to a profiles-enabled build, if no profiles exist, create `Default` and move existing persisted formulas/history into it.

## Developer tasks (high level)

- Add `profiles` + `activeProfileId` to `useAppStore.ts` and wire persistence.
- Update formula-list and history consumers to read from the active profile.
- Add Profiles management UI (hamburger menu entry + modal/list + create/rename/delete actions).
- Add migration logic to create `Default` profile and move legacy data.
- Add unit tests for store and UI flows.

## Testing

- Unit tests: store actions and persistence/migration.
- Integration test: create profile -> create formula -> roll -> switch profile -> verify history and formulas differ; switch back -> verify data preserved.

## Open questions

- Export/import or sharing of profiles — out of scope for MVP, consider later.
- Limit on number of profiles — MVP: no enforced limit.

## Related

- See [STORY-005](../done/STORY-005-formula-screen.md) for formula editing patterns and unsaved-changes guard.
 - See [STORY-014 — Characters (Character Sheet)](STORY-014-characters.md) for character-sheet features attached to Profiles.
