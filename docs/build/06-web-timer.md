# Stage 6: timer

Branch: `feat/web-timer`

SPEC 8.3. Runs are recorded on the watch, so this is not a run timer. Two jobs: an interval timer for vest walks and any structured session done without the watch, and a rest timer component that stage 7 embeds in the strength screen.

## Do

1. Timer state machine as a pure module in `apps/web/src/timer/`: phases built from a template structure (warm-up, repeats of work and rest, cool-down) or from a single duration with an optional halfway cue. Driven by elapsed time from `performance.now`, not interval counting, so backgrounding does not drift; on resume, fast-forward through elapsed phases and cue once.
2. Interval screen: full screen, phase name, phase time remaining in very large digits, total elapsed, repeat counter, progress ring, distinct colour per phase. Pause, skip phase, end early. Screen Wake Lock on start, released on finish, silent degrade if unavailable.
3. Cues: Web Audio tones generated in code, distinct per transition, 3-second countdown beeps before each. Vibration API pattern alongside where supported. Note iOS Safari limitations in BACKLOG.md; do not work around them now.
4. Finish: pre-fill the activity log with what was executed (actual phases, total time, vest kg from the plan), ask RPE and notes, save, link to the planned session, return to Today.
5. `RestTimer` component: props `seconds`, `onDone`, `autoStart`. Compact, shows remaining, cue at 10s and 0s, tap to skip, can be reset by the parent when the next set is logged. Exported for stage 7.
6. Tests: state machine including a simulated 10-minute background gap; RestTimer cue timing; finish form payload.

## Do not

- Record GPS, pace or distance.
- Build the run-walk experience; the watch does it.

## Acceptance

- Time a 60-minute vest walk on the phone with the screen locked for at least ten minutes; halfway cue fires; total within 2 seconds of a stopwatch. Show the saved activity JSON.
- Background and resume test green; show names.
- RestTimer demo page renders and cues at 10 and 0 with a 30-second rest.
