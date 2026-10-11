# Stage 4: plan engine

Branch: `feat/plan-engine`

Implement SPEC section 6: week generation from fixtures, calendar-driven progression from rules stored as JSON, and strength load suggestion. No gating of any kind.

## Do

1. `apps/api/src/engine/`: pure functions, no database access inside. Inputs are plain objects: block with rules, fixtures, the previous week's planned sessions, user edits. Output: planned sessions for the target week, and a `reasoning` array of one-line human sentences explaining each run target ("Midweek run: run block 150s, up 30s from last week"). No flags, no holds, no warnings about readiness.
2. Rules schema in TypeBox covering SPEC 6.3: midweek run progression (increment, switch-to-continuous threshold, continuous increment, cap), long run progression (increment, cap), vest default, compliance definition (which fixtures are required, treadmill days needed, which weekday is optional). Invalid rules JSON on a block is rejected at save with a clear error naming the key.
3. Week generation: `POST /weeks/:isoWeek/generate`. Fixtures first; Sunday sessions get `optional = true` (driven by the rules, not hard-coded to Sunday). Progression applies from the previous week's targets, not from whether they were completed. If the week exists with any session not in `planned` status, refuse with 409 unless `?force=true`; never delete a session with a linked activity; preserve `edited_by_user` sessions.
4. Scheduled generation: a small in-process scheduler (`node-cron` or a `setInterval` with a persisted last-run marker) runs generation for next week at the time in athlete settings (default Sunday 21:00). Idempotent if the api restarts.
5. `GET /weeks/:isoWeek/compliance`: per SPEC 6.3 rule 5, returning the booleans and counts, with `optional_done` reported separately and never affecting `complete`.
6. Strength: `suggestLoad(slot, lastSessionSets, equipment)` in `packages/shared` implementing the four load rules in SPEC 5.4 and snapping to `achievableLoads`. Returns `{ load_kg, how: string, reason: string }`. For `linear`: completed means every set hit target reps; one fail holds; two consecutive fails deload 10 per cent snapped down. For `double`: all sets at top of range progresses. For no kit of that type: returns `{ load_kg: null, reason: "no kit" }`.
7. Tests, table-driven: midweek run from 120s to 300s and the switch to continuous and the cap; long run cadence and cap; optional flag follows the rules; regeneration preserves edits and linked sessions; compliance with and without the optional session; `suggestLoad` for every rule including hold, deload, snap down when the increment lands on an unachievable load, dumbbell step to the next owned pair, and no kit.

## Do not

- Build UI.
- Read check-in or ankle data anywhere in the engine. Not even to log it.

## Acceptance

- `pnpm --filter api test engine` and `pnpm --filter shared test` green; show the named cases, one per bullet in point 7.
- Generate a week from the starter template, PATCH one session, regenerate with force: the edit survives and `reasoning` says so. Show the three responses.
- `suggestLoad` worked example in the PR: squat at 60kg, 5x5 all hit, bar plus 20/10/5/2.5/1.25 pairs, returns 62.5 with the plate breakdown.
- Saving a block with a malformed rules JSON returns 400 naming the bad key.
