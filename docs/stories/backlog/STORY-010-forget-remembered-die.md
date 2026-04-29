# STORY-010: Settings Screen — Forget Remembered Die

Status Update: Partially done — the forget/remove-from-remembered flow is implemented and wired to Settings; confirmation modal flow and end-to-end acceptance checks need final QA.

## Goal
Let users permanently remove a remembered Pixel die from the app so it no longer appears in Settings and will not auto-connect again until it is paired manually.

## Acceptance Criteria

### Known Dice section
- [ ] Each remembered die row exposes a [Forget] action in addition to [Disconnect]
- [ ] [Forget] is available for both connected and disconnected remembered dice
- [ ] Forgetting a connected die disconnects it first, then removes it from the remembered-dice registry
- [ ] Forgetting a disconnected die removes it from the remembered-dice registry without requiring a reconnect

### Confirmation UX
- [ ] Tapping [Forget] opens a confirmation modal
- [ ] Modal copy: title `"Forget die?"`; body `"This die will be removed from remembered devices and will not auto-connect until you connect it again."`
- [ ] Actions: [Cancel] | [Forget] where [Forget] is destructive
- [ ] [Cancel] closes the modal and leaves live state plus remembered state unchanged
- [ ] While a forget request is in flight, the affected die row disables repeated destructive actions

### Persistence and reconnect behaviour
- [ ] On confirm, the die's `pixelId` is removed from the remembered-dice registry used during launch/resume auto-connect
- [ ] The forgotten die is removed from the Settings list immediately after a successful forget
- [ ] Forgotten dice are not auto-reconnected on the next launch or resume scan
- [ ] Forget state persists across app restart
- [ ] If the same physical die is later connected again through [Connect new die], it is treated as a new remembered die and resumes normal auto-connect behaviour

### Error handling
- [ ] If forget fails, show the existing BLE/app error surface and leave the die listed as remembered
- [ ] Existing [Disconnect] behaviour remains unchanged when the user does not choose [Forget]

### Validation
- [ ] Add tests for forgetting a connected die, forgetting a disconnected die, cancelling the modal, and preventing auto-reconnect after forget

## Notes
- Follow-up to STORY-007.
- The product spec already assumes remembered dice can be explicitly forgotten; this story closes the implementation-planning gap.
- Depends on STORY-003 and STORY-007.