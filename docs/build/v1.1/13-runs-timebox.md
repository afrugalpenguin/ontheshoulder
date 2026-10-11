# Stage 13: runs as a time box

Branch: `feat/runs-timebox`

The run-walk progression in v1 is more plan than the user wants right now. Run days become a time box: go out, run for 50 to 60 minutes however you like, the watch records it, the app logs it. The structured progression stays available as an option in the rules but is no longer the default.

## Do

1. Add a run template structure kind `timebox`: `{ "min_min": 50, "max_min": 60 }`. The card target reads "50 to 60 min, your pace". The Log sheet pre-fills duration at the midpoint, with a Stepper.
2. Starter template `rebuild-100` changes: both run fixtures use a `timebox` template. Midweek 40 to 50, Sunday 50 to 60. No progression on run templates in Block 1; the rules object for runs becomes `{ "mode": "timebox" }` and the engine passes targets through unchanged. The existing `runwalk` progression remains implemented and selectable by setting `mode` to `runwalk` on the rules.
3. Keep the run-walk template structures in the library so a user can pick them for a fixture if they want structure.
4. Engine tests: a `timebox` run generates identical targets week on week; switching the mode to `runwalk` restores the v1 behaviour; the rules schema rejects an unknown mode.
5. Log form for runs: duration, RPE, and an optional "how was it" chip row (good, fine, grim). Nothing else. Garmin import, when it exists, will fill distance and HR; until then the fields do not appear.
6. Compliance: unchanged (a run counts if an activity is linked, whatever its duration). Add a per-week "run minutes" total to the Week header line.
7. Update `docs/PLAN.md` run section to describe the time box as the default and the run-walk ladder as the optional structured path.

## Do not

- Add pace, distance or heart-rate fields to the manual log.
- Remove the run-walk engine code or its tests.

## Acceptance

- Apply the starter template on a fresh db, generate two consecutive weeks: run targets are identical both weeks and read "40 to 50 min" and "50 to 60 min". Show the week JSON.
- Switch the block rules to `runwalk` mode via the Settings JSON editor, regenerate, and show the v1 ladder comes back.
- Log a run from the phone in two taps plus the chip. Count them.
- Engine tests green; show names.
