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
