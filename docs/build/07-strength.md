# Stage 7: strength

Branch: `feat/strength`

SPEC 5.4 and 8.4. The screen must require no arithmetic and no decisions: it says the weight, how to load it, and when to go again.

## Do

1. Strength tab: programme days with last done date and a one-line next-session summary ("Squat 62.5kg, RDL 50kg").
2. Session screen: one card per slot in order. Shows exercise, pattern and equipment, target sets x reps, suggested load from `suggestLoad` snapped to achievable loads, and `describeLoad` text ("bar + 2 x 20 + 2 x 1.25"). Plus and minus step through achievable loads only. Tap a set row to log it at the shown numbers; long-press to change reps or add RPE and a note. Logging a set starts the `RestTimer` with the slot's rest_sec. The next set row is highlighted when the rest ends.
3. Equipment awareness: if the slot's equipment type has no kit, the card shows "no kit for this" and offers same-pattern substitutes from the exercise library that use kit the user owns; picking one swaps the slot for this session and offers to make it permanent.
4. Starting loads: if a slot has no history and no start_load_kg, the card asks once ("What did you last squat for 5?") and snaps the answer.
5. Finish: creates the StrengthSession, the Activity and marks the planned session done. Partial sessions save with `partial = true`. Shows next session's suggested loads as a closing summary.
6. Exercise library: list, detail with cues, add and edit. Pattern and equipment are required so substitution works.
7. Settings: equipment editor already exists from stage 5; add a "preview achievable loads" panel per type so users can sanity-check their plate list.
8. Tests: set logging flow, substitution when kit is missing, start-load prompt, rest timer integration, and a snapshot of `describeLoad` for several loads.

## Do not

- Add percentages of 1RM, periodisation or RPE-driven loading.
- Add strength charts beyond what stage 9 specifies.

## Acceptance

- Log a full Strength A on the phone at the rack. Second session shows the correct progressed loads with plate breakdowns. Show both activity JSONs and the diff.
- Set equipment to dumbbells only and open Strength A: squat slot offers a goblet or dumbbell substitute; show it.
- Set equipment to none and open Strength B: every slot offers a bodyweight substitute or says none available; nothing crashes.
- Rest timer runs between sets and the next set highlights at zero (describe).
