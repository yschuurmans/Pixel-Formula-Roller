# STORY-014 — Characters (Character Sheet)

Status: backlog

Attached to: STORY-013 — Profiles

## Summary

Add an optional "Character" mode to Profiles that lets a profile own a character sheet: a user-editable list of stats/skills (label + numeric modifier + order). Character profiles expose an editor in profile settings and a read-only "Character Sheet" card on the Main screen that allows quick d20 rolls using each skill's modifier, including long-press Advantage/Disadvantage choices.

## Motivation

Players using Profiles frequently manage character stats and skills (D&D-style). Embedding a small character sheet inside a profile reduces friction: it keeps character data with formulas and history, enables quick skill checks from the Launchpad, and supports roleplaying workflows without adding a separate app.

## User Stories

- As a user I can enable `Is a Character` on a profile to treat that profile as a character sheet.
- As a user I can edit the character's skill list in the profile edit screen: rename skills, edit numeric modifiers, add and remove skills, and reorder skills by drag-and-drop.
- As a user I see a two-column list of skill label + modifier pairs in the profile edit screen when `Is a Character` is enabled.
- As a user edits are saved immediately (autosave) but a visible `Save` button is also present to commit changes explicitly.
- As a user I see a `Character Sheet` box on the Main screen for the active profile when it is a character; the box appears between the `Launchpad` and `Saved Formulas` boxes.
- As a user tapping a skill's modifier button on the Character Sheet launches a roll for `1d20 + modifier` and records the result in the active profile's roll history.
- As a user long-pressing a modifier button opens the Advantage/Disadvantage prompt with three options (Disadvantage / Normal / Advantage) and the corresponding roll is performed when an option is chosen.

## Acceptance Criteria

- Add `isCharacter: boolean` and `skills: ProfileSkill[]` to the `Profile` data model.
- The profile edit UI exposes a toggle `Is a Character` (default off). Enabling the toggle displays a boxed skill editor.
- The skill editor shows skills in two responsive columns, each row with a label (left) and a modifier button (right).
- Clicking a label enters inline-edit mode to change the label; clicking the modifier button edits the numeric modifier.
- Users can add new skills and remove existing skills from the editor.
- Users can reorder skills by dragging and dropping rows; order is persisted.
- Edits autosave immediately (store action on change) and the editor also has a `Save` button for explicit confirmation.
- On the Main screen, when the active profile has `isCharacter === true`, render a `Character Sheet` card between the `Launchpad` and `Saved Formulas` cards showing the same skill list (labels read-only).
- Tapping a modifier button on the Character Sheet performs a `1d20 + modifier` roll and writes the result into the active profile's roll history. The roll evaluation should reuse the existing roll/evaluation engine.
- Long-pressing a modifier button opens a modal with three options: Disadvantage (`2d20kl1 + modifier`), Normal (`1d20 + modifier`), and Advantage (`2d20kh1 + modifier`) presented with the specified icons and labels. Selecting one performs the corresponding roll and records it in history.
- The UI and data are covered by unit/component tests for the editor, long-press behavior, and roll integration.

## UI / UX

Editor (Profile settings — edit screen)
- Placement: the existing Profile edit screen (see STORY-013). Add a toggle `Is a Character` beneath the profile name field.
- When enabled show a boxed area containing the skill list laid out in two columns of rows. Each row: `Label` (editable inline) and `Modifier` (button). Add `+ Add Skill` at the bottom and a trash/remove icon per row.
- Drag handle: show a standard touch-grabbable affordance to reorder rows. Reordering should update the persisted order immediately.
- Autosave: each inline edit (label or modifier) calls the store update for that profile and skill. The visible `Save` button performs a final `updateProfile()` commit (UX parity) and indicates success.

Character Sheet (Main screen)
- Placement: between `Launchpad` and `Saved Formulas` on the `MainScreen` when the active profile has `isCharacter` enabled.
- Layout: two-column responsive grid; labels shown as static text, modifiers as buttons styled like roll buttons used in other parts of the app.
- Tap a modifier button: perform `1d20 + modifier` and show roll result as normal flow (bottom sheet/modal or existing roll result UI). Results are stored in profile history.
- Long-press a modifier button: present modal with three choices — Disadvantage, Normal Roll, Advantage — with the three icon options (red double-d20 with '-' overlay, single d20, green double-d20 with '+' overlay) as described. Selecting one performs corresponding roll (`2d20kl1 + modifier`, `1d20 + modifier`, `2d20kh1 + modifier`).

## Data model

Add (informational) types in `src/types/profile.ts`:

```ts
export type ProfileSkill = {
  id: string; // uuid
  label: string; // e.g., "STR", "Acrobatics", "Cooking"
  modifier: number; // integer, may be negative
}

export type Profile = {
  id: string;
  name: string;
  isCharacter?: boolean;
  skills?: ProfileSkill[]; // ordered
  // existing fields: formulas, history, createdAt, updatedAt...
}
```

Seed data
- When creating a new profile with `Is a Character` enabled (or when enabling the toggle), seed skills with a recommended default set to match common D&D usage: six stats (STR, DEX, CON, INT, WIS, CHA) and the typical skill list (Acrobatics, Animal Handling, Arcana, Athletics, Deception, History, Insight, Intimidation, Investigation, Medicine, Nature, Perception, Performance, Persuasion, Religion, Sleight of Hand, Stealth, Survival) plus any project-specific examples (e.g., Cooking) as optional extras. Allow users to remove any seeded skill.

## Persistence & Migration

- Persist the `profiles` slice in `useAppStore` (follow STORY-013 guidance). Add `skills` and `isCharacter` to persisted `Profile` objects.
- Migration: when enabling Profiles migration, if a profile is toggled to `isCharacter` and has no `skills` array, auto-seed the default skill list.

## Developer tasks

- Add `ProfileSkill` and update `Profile` types (create `src/types/profile.ts`).
- Extend `useAppStore` with profile skill actions: `addProfileSkill`, `updateProfileSkillLabel`, `updateProfileSkillModifier`, `removeProfileSkill`, `reorderProfileSkills`. Persist changes.
- Add `ProfileEdit` page/component or extend existing Profile edit UI to include `Is a Character` toggle and the `SkillListEditor` component.
- Implement `SkillListEditor` component with inline editing, add/remove, and drag-to-reorder. Use a lightweight DnD library (e.g., `@dnd-kit/core`) or HTML5 drag events for reorder.
- Add `CharacterSheet` component and render on `MainScreen` between `Launchpad` and `Saved Formulas` when active profile has `isCharacter`.
- Implement `LongPressButton` behavior (tap vs long-press) and `AdvantagePrompt` modal used by Character Sheet.
- Reuse `src/services/formulaParser.ts` to evaluate `1d20+{modifier}`, `2d20kh1+{modifier}`, `2d20kl1+{modifier}` and record results into current profile's roll history.
- Add unit and component tests for store actions and the UI behaviors.

## Testing

- Unit tests: `useAppStore` profile skill actions and persistence.
- Component tests: `SkillListEditor` (edit, add, remove, reorder), `CharacterSheet` (tapping rolls, long-press prompt), `LongPressButton` (tap vs long-press behavior).
- Manual QA: create a character profile, add/remove/reorder skills on mobile, verify autosave and Save button, open Main screen and execute normal/advantage/disadvantage rolls, confirm roll history entries.

## Open questions

- Should we limit the number of skills per profile? (MVP: no limit.)
- Long-press timing and drag thresholds should be tuned for Android touch devices — what feel is preferred (e.g., 400ms long-press)?
- Should the Character Sheet allow compact single-column layout on very narrow screens, or always force two columns? (Recommend responsive two-column → single-column below 420px.)

## Related

- Attached to [STORY-013 — Profiles](STORY-013-profiles.md)
- See [STORY-005 — Formula screen patterns](../done/STORY-005-formula-screen.md) for editor guard patterns and formula editing UX.
