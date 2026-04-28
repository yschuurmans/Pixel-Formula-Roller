# BUG: Mass disconnects before reconnecting remembered dice (roll -> reconnect)

**Status:** Open
**Priority:** High
**Area:** BLE / Roll availability (UI) — `src/pages/FormulaScreen.tsx`

## Summary
When attempting a roll that requires a remembered die (example: requesting `3d20` while 2 `d20` are connected and a third `d20` is remembered but disconnected), the app performs many sequential `disconnect` operations across unrelated dice before successfully reconnecting the remembered `d20`. Expected behaviour: disconnect the minimal number of dice (one in this case) and reconnect the needed die quickly.

## Reproduction
1. Pair ~15 dice including two connected `d20` and a remembered/unconnected `d20`.
2. Open the app, enter `3d20`, press Roll.
3. Run logcat: `adb logcat -c && adb logcat -s PixelsBle *:S` and observe repeated `PixelsService.disconnectDie requested ... {"reason":"required-for-roll-disconnect"}` messages across many pixel IDs before the remembered `d20` is reconnected.

Relevant log excerpt (timestamps preserved):

```
04-28 13:22:40.824 ... PixelsService.disconnectDie requested for CA:0A:11:EE:8F:72 {"reason":"required-for-roll-disconnect"}
04-28 13:22:41.265 ... PixelsService.disconnectDie requested for D6:5C:AE:7B:EF:F9 {"reason":"required-for-roll-disconnect"}
04-28 13:22:42.255 ... PixelsService.disconnectDie requested for D3:05:8B:F5:95:28 {"reason":"required-for-roll-disconnect"}
... (many more disconnects over ~20s) ...
04-28 13:23:02.457 ... Connecting to device address=D6:75:FA:EF:87:7E name='Pixelb268c477' timeoutMs=6000
04-28 13:23:03.686 ... Native connect succeeded for D6:75:FA:EF:87:7E {"systemId":"D6:75:FA:EF:87:7E","name":"Pixelb268c477"}
```

## Code pointers
- Availability plan generation: `buildAvailabilityPlan` — [src/pages/FormulaScreen.tsx](src/pages/FormulaScreen.tsx#L674)
- Sync + retry logic that performs disconnects then reconnects: `syncRememberedDice` in the Roll effect — [src/pages/FormulaScreen.tsx](src/pages/FormulaScreen.tsx#L1493)
- Disconnect/connect APIs: `src/services/pixelsService.ts` (`disconnectDie`, `connectRegisteredPixel`)

## Root cause (analysis)
- `buildAvailabilityPlan` correctly computes a minimal set of `disconnectIds` and `connectIds` for a single evaluation.
- `syncRememberedDice` executes a two-step flow: (1) disconnect `plan.disconnectIds` (await Promise.allSettled), then (2) attempt `plan.connectIds` (await Promise.allSettled).
- The logic runs on a retry interval (`REMEMBERED_DICE_RETRY_INTERVAL_MS`), so if step (2) fails or is slow (e.g., `repeatConnect` delays, scanning/connect timeouts, or platform resource limits), the next retry recomputes a plan and may select additional devices to disconnect (because allowedDisconnect is computed per-iteration). Over multiple retries this escalates into disconnecting many dice.
- In short: a failed or slow reconnect causes repeated retries that escalate the number of disconnected devices beyond the minimal required.

## Proposed fixes (recommended order)
1. Connect-first (single attempt, no retries): For each roll-sync, attempt to connect the candidate remembered dice in `plan.connectIds` exactly once. Do not schedule repeated automatic connect retries — repeated retries are the primary cause of long-running escalation. If a connect succeeds, proceed normally. If a connect fails, do not continuously retry; surface a status to the user and treat the slot as unrecoverable for this sync (see #3 for controlled disconnect behaviour).

2. Respect a 12-connection cap and preemptive disconnects: Define `MAX_CONNECTED = 12`. If the current number of connected dice is greater than `MAX_CONNECTED` (or if connecting the needed dice would exceed the allowed limit), do not attempt the connect-first step. Instead, disconnect exactly the number of currently-connected dice equal to the number of dice that need to be additionally connected (prefer least-recently-used, non-assigned dice), then attempt connecting the remembered dice once. This prevents trying connects when the radio/stack is saturated.

3. Prevent disconnect escalation across retries: Compute and persist the initial disconnect plan for the lifetime of the roll session and do not increase planned disconnects across subsequent sync iterations. Add a hard cap (for example, `maxDisconnectsPerRollAttempt = plan.connectIds.length`) so repeated sync cycles cannot disconnect more devices than were planned initially.

4. Improve failure diagnostics and logging: Ensure transport/`repeatConnect` surfaces structured failure reasons (e.g., `not-found`, `timeout`, `resource-limit`, `permission-denied`) so the UI can decide deterministically whether to disconnect. Log failure reason and timing in dev/debug builds to help triage.

5. Reduce aggressive sync retry frequency and add jitter: Lower the aggressiveness of the roll-sync retry loop (or add a small backoff/jitter). Note: this backoff is for the sync/retry loop only — connection attempts themselves must remain single-shot per sync (see #1).

6. Add tests and integration verification: Unit tests for `buildAvailabilityPlan` verifying minimal disconnect selection, exclusion of assigned pixels, the 12-connection cap behaviour, and that the disconnect plan cannot escalate across retries. Add a device verification plan with ~15 paired dice to confirm only minimal disconnects happen and remembered dice reconnect promptly.

## Concrete next tasks
- [ ] Implement connect-first single-attempt behavior in `syncRememberedDice` (small PR). Requirements:
	- Attempt connects once per planned sync; do not retry individual connects in a loop.
	- If `connectedCount > MAX_CONNECTED` or connecting would breach the cap, preemptively disconnect the exact number of dice needed to make room and then attempt connects once.
	- Persist the initial disconnect plan for the roll session and do not escalate disconnects across retries.
	- Surface clear status messages for failed connect attempts (no retry) so users can fallback to manual entry.
- [ ] Add a per-roll-session guard to persist and cap disconnects (`maxDisconnectsPerRollAttempt`).
- [ ] Update transport / `repeatConnect` to return or surface structured failure reasons so the UI can decide (not-found vs resource-limit vs timeout).
- [ ] Add unit tests for `buildAvailabilityPlan` and for the 12-connection preemptive-disconnect behaviour.
- [ ] QA: Reproduce the original scenario on a device with ~15 paired dice and verify minimal disconnects and prompt reconnect for the remembered die.

## Risks / Notes
- Some Android BLE stacks have strict limits on concurrent GATT connections; depending on device/drivers, connecting a new peripheral may require freeing multiple resources. The connect-first approach will detect resource-limit failures and then disconnect minimally — this prevents blind escalation.
- The `repeatConnect` implementation in `pixelsService` may need to return explicit error codes for resource-limit/timeouts so the UI can act deterministically.

## Attachments / References
- Logs captured by reporter (excerpt above)
- See `buildAvailabilityPlan` and `syncRememberedDice` for the exact flow to change.

---

Please assign to the BLE owner for a small patch and tests. If you want, I can open the PR to implement the `connect-first` change and add unit tests for `buildAvailabilityPlan`.
