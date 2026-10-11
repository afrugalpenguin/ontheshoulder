# Stage 14: strength in the StrongLifts shape

Branch: `feat/strength-5x5`

The v1 strength screen does the right things with the wrong shape. Rebuild the session screen to match how StrongLifts 5x5 works, which is the pattern the user already knows: one screen per session, a row per exercise, a circle per set, tap to count, rest bar at the bottom, plates on demand. Keep the api; this is a web rebuild plus small api additions.

## Do

1. **Session screen layout.** Vertical list, one block per slot. Each block: exercise name left, working load right in large type. Under it a row of set circles, one per target set, each showing the target reps. Nothing else visible by default.
2. **Set circles.** Tap an empty circle: it fills with the target reps, logs the set, and starts the rest timer. Tap again: reps decrement by one (5, 4, 3 ... 0, then back to empty), updating the logged set each time. That is the whole logging interaction; no sheets, no long press. A small pencil beside the load opens a Stepper if the user wants to change the weight for this session.
3. **Rest bar.** Fixed to the bottom of the screen while a rest is running: remaining seconds in large type, a progress bar, the next set's exercise and load, and a Skip. Rest duration from the slot. Cue at 10 and 0. When rest ends the bar collapses and the next empty circle is highlighted.
4. **Plates on demand.** Tapping the load opens a Sheet showing the plate breakdown per side ("20 + 2.5" each side, bar 20) from `describeLoad`, and for dumbbell or kettlebell slots just the pair or bell to pick up. A toggle on the sheet switches to "total kg" for people who think that way.
5. **Warm-up sets** for linear-rule barbell slots: a collapsible row above the working sets with the standard ramp (empty bar 2 x 5, then 40 per cent and 60 per cent of working load x 5, snapped to achievable loads). Warm-ups are logged but excluded from progression and tonnage. Configurable off per slot.
6. **Progression as StrongLifts does it.** Linear rule unchanged (+increment on success, hold on first fail, deload 10 per cent on the second). Add a visible "next session: 62.5 kg" line under each linear slot at the end of a session, and a small up or down arrow on the home list showing whether last session progressed.
7. **Home list** (`StrengthHome`): programme days as big cards with "last done", "next up" loads for the main lift, and a Start button. Below, a compact history list of the last ten sessions with date, day name, and main-lift load with a tick or cross for success.
8. **Finish** is a single button at the bottom once any set is logged. Partial sessions save with `partial = true` and a quiet toast.
9. Settings: the equipment editor gains a plate-pairs quick view, and a per-athlete "warm-ups on" default.
10. Tests: set circle state machine (tap cycles), rest bar timing and next-set highlight, warm-up ramp snapping, home list next-up values.

## Do not

- Add RPE prompts per set; RPE is optional on the Finish toast only.
- Add percentages, 1RM, or programme editing beyond what exists in Settings.
- Change the api schema except for a `warmup` flag on set logs and `warmups_enabled` on slots.

## Acceptance

- Log a full Strength A from the phone at the rack using only set circles and the Finish button. Count taps in the PR; target is sets plus one.
- Second session shows progressed loads and the correct plate breakdown. Show both session JSONs.
- Fail a set (tap down to 3) and show the next-session line holds; fail again next session and show the deload, snapped to an achievable load.
- Rest bar visible and counting with the phone screen on; next circle highlights at zero.
- Equipment set to dumbbells only: squat slot shows the substitute flow from v1 unchanged.
