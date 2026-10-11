# Review: stages 3 to 10

**v1.0.0 landed 2026-10-11.** #10, #12, #14, #18 and #20 are merged in that order and `main` is tagged `v1.0.0`. The "Open" lines below are as written before the landing.

Written 2026-10-11 after an unattended run. Stages 2 and 8 (Garmin) were skipped: they need an interactive login and MFA code. Every stage's PR lists its acceptance criteria with the output that proves each ticked one.

## Look at these first

1. **Merge order.** #10, #12, #14, #18 and #20 are stacked, each containing the one before. All have green CI and merge cleanly. Merging #20 alone brings in everything; merging them in order keeps one merge per stage.
2. **A bug found on the way.** A 0 in any nullable field (an ankle score of 0) was saved as "nothing entered". In `main` since stage 3, found by the stage 9 tests, fixed and merged on its own as #17.
3. **`/health` is now `/api/health`** (stage 10), and the api will not start if `OTS_LAN_GUARD` is anything but `true` or `false`.
4. **`docs/prompts/`** is now `docs/build/`, with the tool name removed from its README (stage 11).
5. **Still only on this PC, never push:** branches `backup/main-pre-squash`, `backup/feat-scaffold-pre-squash`, `docs/spec-v0.2` and `docs/spec-v0.2.1` contain the race specifics. Also local: a gitignored `.personal-terms` I created for the personal-data check; add your own terms.
6. **Not done on the PC:** `corepack enable`, registering the scheduled tasks, any firewall change, a reboot.

## Stage 3: data model, setup and API

- PR: https://github.com/afrugalpenguin/ontheshoulder/pull/6. **Merged.**
- Manual checks outstanding: none.

## Stage 4: plan engine

- PR: https://github.com/afrugalpenguin/ontheshoulder/pull/8. **Merged.**
- Manual checks outstanding: none.

## Stage 5: web app, setup, Today and logging

- PR: https://github.com/afrugalpenguin/ontheshoulder/pull/10. **Open**, CI green.
- Manual checks outstanding: the whole phone run-through on the LAN (setup, check-in, protein prompt, log a vest walk, skip Sunday and see the week still complete), the screenshot of Today, Lighthouse on the device (headless scored 100 on both pages), and whether the protein prompt reads like a mate.

## Stage 6: timer

- PR: https://github.com/afrugalpenguin/ontheshoulder/pull/12. **Open**, CI green.
- Manual checks outstanding: a real 60-minute vest walk against a stopwatch with the screen locked for ten minutes; hearing the cues; the rest demo on the phone.
- Expect this: over plain http the screen will not stay awake and a locked phone delays the half-way cue until unlock. The total stays right. HTTPS on the LAN fixes it and is in the backlog.

## Stage 7: strength

- PR: https://github.com/afrugalpenguin/ontheshoulder/pull/14. **Open**, CI green.
- Manual checks outstanding: a full Strength A at the rack, then a second session to see the progressed loads; the rest timer and highlight in the gym; the long press on the phone (the Adjust button does the same).

## Stage 9: trends

- PR: https://github.com/afrugalpenguin/ontheshoulder/pull/18. **Open**, CI green.
- Manual checks outstanding: the five charts on the phone from two weeks of real logging, with screenshots kept out of the repo; the light theme; timing over the LAN (221 ms in a local browser with 90 synthetic days).

## Stage 10: operations

- PR: https://github.com/afrugalpenguin/ontheshoulder/pull/20. **Open**, CI green.
- Manual checks outstanding: `install-tasks.ps1` for real and a reboot (only run with `-WhatIf`); the live path of `restore.ps1` (restore to a scratch path worked and the api opened it); the runbook's firewall and phone steps; the Linux notes; an `OTS_PERSONAL_TERMS` repository secret if CI should enforce the personal-data check.

## Skipped

- Stage 2 (Garmin spike) and stage 8 (Garmin sync). The import inbox routes exist and only store what they are sent. The app is complete without them.

# v1.1

Written 2026-10-11 after a second unattended run: stages 11 to 15 from `docs/build/v1.1/`. Every PR lists its acceptance criteria with the output that proves each ticked one, and says plainly which were not checked on a phone.

## Look at these first

1. **Four PRs are open and stacked: #26, #28, #30, #32.** Each is based on the one before, all with green CI. None is merged, because each has phone checks only you can do. Merge in that order (retarget each to `main` as the one below it lands), or merge #32's branch alone to take all four.
2. **Your data.** Nothing touched the real data folder. The app I had started for you was stopped before the merges, because the build output it was serving from was about to be overwritten. Next time the api starts it will add two columns (migration `0003_warmups`) and write a `config.json` beside your data. You said the data entered so far needs resetting: do that before or after, it makes no difference.
3. **Runs are time boxes only on a fresh setup.** A block saved before stage 13 keeps the run-walk ladder, so nothing changes under existing data. A reset and a new run through setup gets the time boxes.
4. **Merged remote branches were not deleted.** A permission check on this PC refused it. Still on the remote and safe to delete: `chore/land-v1`, `docs/v1.1-prompts`, `docs/spec-v0.2.2`, `feat/ops`, `feat/strength`, `feat/trends`, `feat/web-timer`, `feat/web-today`. This is the one stage 11 criterion not met.
5. **The spec is behind the app.** Kickoff rule 1 says to stop on a conflict with the spec. Every v1.1 brief conflicts with it by design, so I carried on and recorded each one: `docs/SPEC.md` 6.3 rules 1 and 2 and the run fields in 5.2 and 5.3 (stage 13), 8.2 Today and 8.5 Week (stage 12), 8.4 Strength (stage 14), 8.7 Settings (stage 15). The spec text is untouched.

## Stage 11: land v1

- PR: https://github.com/afrugalpenguin/ontheshoulder/pull/24. **Merged.** #10, #12, #14, #18 and #20 merged in order with merge commits, the four root scripts green on `main` after each; `v1.0.0` tagged; `docs/prompts/` moved to `docs/build/` with the tool name removed.
- Not done: deleting the merged remote branches (item 4 above).
- Manual checks outstanding: none.

## Stage 12: UI foundation and Week as home

- PR: https://github.com/afrugalpenguin/ontheshoulder/pull/26. **Open**, CI green.
- Look at: Week is now `/` and Today is gone. Lighthouse on Week first scored 64 for performance; it is 98 after drawing the page once its data has arrived and serving the bundle split and compressed. The evening prompt is one editable line, not one per session kind.
- Manual checks outstanding: the phone run-through (Week loads with today open, vest walk in two taps: Start then Finish), the feel of the sheets and the week swipe, Lighthouse on the device, the 20:00 prompt on a real evening.

## Stage 13: runs as a time box

- PR: https://github.com/afrugalpenguin/ontheshoulder/pull/28. **Open**, CI green. Based on #26.
- Look at: the mode is `"runs": { "mode": "timebox" }` in the block rules; `"runwalk"` brings the ladder back from its first week. The ladder code and its tests are all still there.
- Manual checks outstanding: log a real run from the phone (Log, a chip, Save).

## Stage 14: strength in the StrongLifts shape

- PR: https://github.com/afrugalpenguin/ontheshoulder/pull/30. **Open**, CI green. Based on #28.
- Look at: "sets plus one tap" (21 for Strength A) holds once starting loads exist; the first session still asks for each once. "Warm-ups on" is one switch that sets every linear slot, since no other schema change was allowed. Per-set RPE, notes and the long press are gone on purpose.
- Manual checks outstanding: a full Strength A at the rack, the rest bar with the screen on and the two cues by ear, the plates sheet at arm's length.

## Stage 15: settings and data folder

- PR: https://github.com/afrugalpenguin/ontheshoulder/pull/32. **Open**, CI green. Based on #30.
- Look at: the move was run end to end in temp folders, including a restart onto the new folder, but never against the real install. While `OTS_DATA_DIR` is set the move is refused. The api task now runs the api in a loop so "Restart now" brings it back.
- Manual checks outstanding: change the folder from the phone on the real install and restart; register the tasks for real (`install-tasks.ps1` has only ever been run with `-WhatIf`) and see the loop restart the api; "Copy diagnostics" over plain http.
