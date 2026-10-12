# On the Shoulder: specification

Status: draft v0.2.2, 2026-10-11
Licence: MIT

## 1. Purpose

A self-hosted training system for a long-distance running build, for people coming back to running after time away: plan the week, log it in under a minute, see whether you are progressing, and never have to think about what today is. It runs on a home PC, is used from a phone browser on the same network, and stores nothing in the cloud.

It is built first for one runner preparing for a 100-mile event, and designed so that anyone else can clone it, run the setup screen, and use it for their own build. Public-ready from the start: no personal data in the repo, no hard-coded plans, MIT licence.

Success looks like: every morning the phone shows exactly what today is, logging takes under a minute, the strength screen tells you the weight so you never calculate, and the weekly review answers "am I progressing" without a spreadsheet.

## 2. Constraints and context

- Runs on the user's PC. Served over the LAN. Used from a phone browser. No data on the phone, no cloud, no accounts, single user.
- A fixed weekday morning slot on a walking treadmill (about an hour, usually with a weight vest). Weekends have no treadmill.
- Sunday morning is the long run. Saturday is family time with no sessions. Sunday sessions are expected to be dropped at short notice sometimes; the system treats a done Sunday as a win and a missed one as normal, not as failure.
- Fixed external sessions: an evening turbo ride, a coached swim, two strength sessions.
- Running starts at two sessions a week.
- Runs are recorded on a Garmin Fenix 7. The app logs runs after the fact; it is not the run timer.
- Home gym kit varies per user and must be configured: plates, dumbbell pairs, kettlebells, each possibly none.
- Target event shape for the first starter template: a flat, continuous 100-mile event with a generous time limit (around 48 hours), roughly 48 weeks out. The actual race, dates and cut-offs are entered at setup and live in the database, never in the repo.

## 3. Non-goals (v1)

- Multi-user, accounts, sharing, remote access
- Native app, app store, offline-first sync, PWA install
- Nutrition logging beyond weight and a daily habits checklist
- GPS, route maps, pace analysis (the watch and Garmin Connect do that)
- Injury gating or readiness scores. The app records, it does not judge.
- Auto-generated or adaptive plans. Progression is calendar-driven from rules the user can read and edit.

## 4. Architecture

```
phone browser  --LAN http-->  apps/web (Vite + React, static build served by the api)
                                   |
                                   v  REST, JSON, TypeBox-validated
                              apps/api (Fastify, TypeScript)
                                   |
                                   v
                     SQLite file outside the repo (Drizzle ORM, WAL)
                                   ^
                                   |  POST /import/garmin/*   (optional, stage 8)
                              services/garmin (Python sidecar)
```

Decisions, reasoning kept short:

- **TypeScript end to end.** One language, shared types between web and api via `packages/shared`.
- **SQLite, not Postgres.** Single user, single machine, zero ops. WAL mode. The file lives outside the repo at a path set during setup (default `%LOCALAPPDATA%/ontheshoulder/ots.db` on Windows, `~/.local/share/ontheshoulder/ots.db` elsewhere).
- **Drizzle ORM** for schema-as-code and migrations.
- **Fastify** with TypeBox schemas on every route; the schemas generate the OpenAPI document and the shared types.
- **Python sidecar for Garmin, optional and last.** Garmin has no personal API. The unofficial client can break at any time, so it is isolated, posts to the api, and is never the system of record. The app is complete without it.
- **pnpm workspaces** monorepo.
- **No service worker in v1.** LAN http is not a secure context. Bookmark to home screen.

## 5. Domain model

Canonical names. Use them in code, routes and UI.

### 5.1 Setup and configuration

- **Athlete**: display_name, units (metric only in v1 but stored), week_start (Monday), timezone.
- **Event**: name, date, distance_km, location, url, time_limit_h, priority (A, B, C), status (planned, entered, done, skipped), date_confirmed (bool), result_notes. Exactly one event with priority A is the goal and drives the countdown on Today; B and C events are milestones (a 50k, a 50-miler) shown under the countdown as "next up" and as markers on Week and Trends. Setup asks for the A event only; others are added in Settings.
- **Equipment**: the kit this user owns. Three lists, each may be empty:
  - plates: array of `{ kg, count }` (count is per pair, e.g. two 20kg plates is `{20, 1}`), plus bar_kg (default 20, nullable if no barbell)
  - dumbbells: array of kg values for the pairs owned
  - kettlebells: array of kg values
  - Derived: `achievableLoads(equipmentType)` returns the sorted list of loads that can actually be made. Barbell loads are bar plus symmetric plate combinations. Dumbbell and kettlebell loads are the owned values. Strength suggestions only ever return values from this list.
- **Fixture**: weekday, slot (am, pm), template_id. The repeating shape of the week.
- **HabitDefinition**: key, label, prompt_text (nullable), prompt_until (time of day, nullable), enabled, weekdays (nullable), answer_labels (nullable). Labels, prompts, days and answers are editable.
  - `weekdays` is a JSON array of ISO weekdays, 1 Monday to 7 Sunday; null means every day. The check-in shows a habit only on its days, and so does its prompt. The api accepts unique whole numbers from 1 to 7 and refuses an empty list.
  - `answer_labels` is a JSON pair `[yes, no]`. A habit with labels is two buttons instead of a tick and saves `true` for the first answer and `false` for the second; nothing saved means not answered. A habit without labels is a tick.
  - Seeded with: protein_shake (prompt_text "Oi. Protein.", prompt_until 12:00, every day); alcohol_free (label "Last night", answers "Alcohol-free" and "Had a drink", asked Tuesday to Friday mornings about the night before, so Friday, Saturday and Sunday nights are never asked about); kit_ready (the evening line about tomorrow); and two that are kept for their history but switched off: treadmill_done (finishing a walk is the treadmill morning) and prehab_done (prehab is a session, 5.2).
  - Alcohol is a quiet record. It is never part of "week complete", never a streak, never a prompt or banner.

### 5.2 Plan

- **Block**: name, start_date, end_date, purpose (rebuild, base, build, peak, taper, recovery), progression_rules (JSON, see 6.3), ends_at_event_id (nullable). A block may end at an event instead of a date, so "to the 50k" moves if the event does. Blocks tile the calendar to the A event.
- **SessionTemplate**: kind (run, walk_vest, walk, ride, swim, strength, prehab, mobility, rest), name, default_duration_min, structure (JSON, 5.5), programme_day_id (strength only), notes, tags. A prehab session is not a key session: it is left out of compliance and never counts as a treadmill morning. Within a day and slot it is listed first.
- **WeekPlan**: per ISO week, generated from fixtures and rules. Holds **PlannedSession** rows.
- **PlannedSession**: date, template_id, slot, targets (duration_min, run_block_sec, walk_block_sec, repeats, vest_kg, distance_km), status (planned, done, skipped, modified), skip_reason (tired, sleep, family, injury, time, other), edited_by_user, linked_activity_id, optional (bool, true for Sunday sessions by default).

### 5.3 Log

- **Activity**: date, kind, start_time, duration_min, distance_km, source (manual, garmin), garmin_activity_id, avg_hr, max_hr, elevation_m, rpe (1 to 10), notes, detail (JSON by kind: `{ vest_kg }`, `{ run_block_sec, walk_block_sec, repeats, continuous, surface }`, `{ strength_session_id }`).
- **StrengthSession**: activity_id, programme_day_id, started_at, finished_at, partial (bool), rows of **SetLog**: slot_id, set_no, reps, load_kg, rpe (nullable), done_at, notes.
- **DailyCheckin**: date (unique), sleep_quality (1 to 5), energy (1 to 5), weight_kg (nullable), ankle_score (0 to 5, nullable, display only), sunday_got_up (bool, Sundays only), habits (JSON of key to bool), notes.
- **BodyMetric**: date, metric, value, source. Weight from check-in is mirrored here. Garmin, if enabled, writes here.

### 5.4 Strength

- **Exercise**: name, pattern (squat, hinge, lunge, calf, carry, core, hip, mobility), equipment (barbell, dumbbell, kettlebell, bodyweight, plate), unilateral (bool), cues, video_url (nullable).
- **ProgrammeDay**: name, ordered **ProgrammeSlot** rows: exercise_id, sets, reps (or seconds), rest_sec, load_rule, increment_kg, start_load_kg (nullable), notes.
- **load_rule** values:
  - `linear`: add increment_kg every completed session. On a failed session (any set below target reps) hold once; on a second consecutive fail deload 10 per cent, rounded to an achievable load, and resume. This is the rule for the main 5x5 lift.
  - `double`: add increment when all sets hit the top of the rep range; otherwise hold. Accessories.
  - `bodyweight`: no load.
  - `fixed`: load set by the user, never changed by the engine (carries at a specific kettlebell, for example).
- Suggested load is always snapped to `achievableLoads` for the slot's equipment type. If a user owns no equipment of that type, the slot shows "no kit" and the exercise library offers a substitute of the same pattern that uses kit they do own.

### 5.5 Session structure JSON

Run and walk templates describe themselves so the log form can pre-fill:

```json
{ "warmup_min": 5, "repeats": 8, "run_sec": 120, "walk_sec": 60, "cooldown_min": 5 }
```

Continuous runs omit repeats and run_sec. Vest walks: `{ "vest_kg": 20 }`. Strength templates reference a programme_day_id instead.

A template can carry a routine, shown on its card in full with nothing to expand: `{ "duration_min": 8, "exercises": [{ "name": "Slow calf raises", "dose": "3 x 12 each leg" }] }`. The starter's prehab template uses it.

## 6. Plan engine

### 6.1 Inputs

A event date, blocks with rules, fixtures, last week's planned sessions with status, and user edits.

### 6.2 Week generation

Runs automatically at 21:00 on Sunday (configurable) and on demand. Fixtures first, then progression applied to run templates from last week's targets. Sessions on Sunday are created with `optional = true`. Generated weeks are editable; `edited_by_user` sessions survive regeneration. Regeneration never deletes a session with a linked activity.

### 6.3 Progression rules

Rules are JSON on the block, validated against a TypeBox schema, interpreted by a pure engine. Calendar-driven: progression happens whether or not last week was completed, because the user said they will judge, and the user can edit any week. The engine's `reasoning` output explains each target in a sentence so edits are informed.

Default rules for the starter template, Block 1 (rebuild, 10 weeks):

1. **Midweek run**: run-walk, repeats fixed at 8, walk_sec fixed at 60. Start run_sec 120. Each week add 30s to run_sec. The week run_sec would reach 300 is instead the first continuous run of 25 min (so week 7 from a week 1 start); from then add 5 min per week to a cap of 45. Warm-up and cool-down stay at 5 min walk throughout.
2. **Long run (Sunday, optional)**: run-walk with run_sec and walk_sec fixed at 120 / 60 for the whole block. Growth is in repeats: add 3 repeats per week (9 min) to a cap of 30 repeats (90 min of run-walk, plus warm-up and cool-down). Blocks do not lengthen in this block.
3. **Vest walks**: weekday default from equipment (vest_kg configurable, default 20). Friday unloaded. No automatic reductions.
4. **Strength**: per slot load_rule (5.4).
5. **Compliance** (the headline for Block 1): a week is complete if the midweek run happened, the two strength sessions happened, and the treadmill slot was done on at least four weekdays. Sunday is reported separately as "bonus done" or "not this week" and never fails the week.

Later blocks add a third run, back-to-back long runs, and continuous long runs. They are rules data, added when Block 1 has real history behind it.

## 7. Garmin (optional, stage 8, last)

Unchanged in intent from v0.1 but demoted: the app ships complete without it. If built, it pulls sleep, HRV, resting HR, body battery and training readiness into BodyMetric and imports activities for after-the-fact linking to planned runs. It fails closed on any auth problem and shows its status on Today. Details stay in `docs/build/08-garmin-sync.md`. The verification spike is still worth doing early because it is cheap and decides whether stage 8 exists.

## 8. Web app

Mobile-first, dark by default, large targets, no precise taps. Five tabs: Today, Week, Strength, Trends, Settings.

### 8.1 First run

If no Athlete row exists, the app shows setup: name, A event (name, date, distance, time limit), equipment (plates, bar, dumbbells, kettlebells, vest; each can be none), fixtures (pick a starter template or build the week by hand), data folder confirmation. Finishes by generating the first week. Everything is editable later in Settings.

### 8.2 The day

There is no Today tab: Week (8.5) is home and today's row is open. An open day shows, in this order:

- Prompts strip (today only): any enabled habit with `prompt_text` whose `prompt_until` has not passed and whose tick is not set shows as a single-line banner with a Done button and a "not today" dismiss. Protein shake is the seeded one. It is a nag and stays first.
- Session cards in slot order, prehab first within its slot. Each has one primary button that depends on the kind: Start for strength (opens the session screen), Log for a run, ride or swim (a short form pre-filled from the plan), Done for everything else. A walk or vest walk is Done in one tap, which logs the planned duration and the planned vest weight with no form; a smaller Start timer button beside it opens the timer. The overflow holds Skip (reason list) and "Log different time" (the log form). Sunday cards show an "optional" tag. The buttons work on any day, so an earlier day's session can be done, logged or skipped late.
- Check-in card last (today only): weight, one chip per tick habit asked today, a two-button choice for each two-answer habit asked today, and on Sundays a "got up for it" chip. Only enabled habits whose weekdays include today are shown, so Monday is weight and protein, and Tuesday adds "Last night". The two answers look the same until one is chosen and the chosen one takes the plain selected style: no warning or success colour, no tick or cross. Every tap saves; there is no Save. Once a weight is saved and every two-answer habit asked today has its answer, the card folds to one line that says what is recorded ("77.0 kg · alcohol-free · protein shake"); a tap opens it again. Sleep, energy and the ankle score are no longer asked for: the columns, any saved values and the api fields stay.
- Garmin strip only if the sidecar is configured; otherwise absent.

### 8.3 Timer

One screen, two modes:

- **Interval**: for vest walks and any structured session done without the watch. Phases from the template structure, big digits, wake lock, Web Audio tones and vibration where supported, pause, skip phase, end early. Finish pre-fills the log. A timer finished with less than 5 minutes on the clock was probably a slip, so its time is not saved without asking: "Log the planned 60 min instead?" offers the planned duration or the actual time, and nothing is saved until one is chosen. From 5 minutes on, ending early logs the time on the clock as before.
- **Rest**: embedded in the strength screen. Starts on set completion, counts down the slot's rest_sec, cue at 10s and 0s, tap to skip.

### 8.4 Strength

The screen that must require no thinking:

- Programme day list with last done date and a one-line "next session: squat 62.5kg" summary.
- Session screen: one card per slot. Shows exercise, target sets x reps, the suggested load (from load_rule snapped to achievable loads), and how to make it ("bar + 2 x 20 + 2 x 1.25"). Big plus and minus that step through achievable loads only. Tap a set row to log it at the shown numbers; long-press to adjust reps or add RPE. Rest timer starts on each logged set.
- Finish: saves the StrengthSession and an Activity, marks the planned session done, shows next session's loads.
- Equipment settings reachable from the screen header.

### 8.5 Week

Home. One layout at every width: a single centred column about 480px wide, the phone layout; there is no seven-column desktop view.

- Header: the title is the date range ("12 to 18 Oct") with the ISO week as small muted text under it, between the previous and next week buttons. Below it the A event countdown, then one line combining compliance, run minutes and streaks, for example "Key sessions 1 of 3 · mornings 2 of 4 · run 45 min · 3 weeks in a row". Any part with nothing to say yet is left out: no count of zero, no streak of zero, no "run 0 min", and nothing about an optional session that has not been done. A brand-new week shows no line at all.
- Seven day rows. A closed day is one line: the day and a chip per session, coloured by status. Today is open (8.2); any day opens on a tap. On an earlier day of the current week a session still planned says "to do" on its chip, and opening the day lets it be done, logged or skipped.
- From 20:00 tomorrow's row opens with a quiet line about what is planned and a kit tick.
- Under the days: why these targets, and the plan actions: generate next, regenerate this (confirm on edits).

### 8.6 Trends

- Weekly run minutes and vest-walk hours, stacked bars, ankle score mean as a faint line if any scores exist
- Weight with 7-day rolling mean
- Compliance grid per week, Sunday shown as a separate dot. A week with nothing planned, such as one before the first planned week, is an empty cell
- Main lift working weights over time (squat, deadlift)
- A weekly review card with templated sentences comparing this week to last
- Weeknights: one plain text line per week under the review, "AF weeknights: 3 of 4", counting the "Alcohol-free" answers out of the four mornings asked. A morning with no answer is not recorded, not a drink: "3 of 4, 1 not recorded". A morning still to come is not mentioned. No chart, no colour, no target, and nothing before the first week with an answer

There is no sleep and energy chart: the check-in stopped asking for them (8.2). Run RPE was only drawn there, so it is no longer charted; it is still stored and still in the weekly review.

### 8.7 Settings

Athlete, events (list, add, edit, set priority and status, record results), equipment, fixtures, habits (labels, prompts, cut-off times), blocks and rules (JSON editor with validation and a dry run), data folder and backups, export (JSON and CSV), Garmin on/off.

## 9. Operations

### 9.1 Serving

Dev: `pnpm dev`, api on 3001 and web on 5173, both on `0.0.0.0`. Prod: `pnpm build` and the api serves the static bundle on one port. Scripts register the api as a Task Scheduler job at logon on Windows; a systemd unit is provided for Linux.

### 9.2 Data and backups

Database and backups live outside the repo in the data folder chosen at setup. The api takes an online backup (`better-sqlite3` `.backup()`) on start and nightly, keeps 30, and exposes `POST /admin/backup` and a download button. Export produces JSON and CSV for leaving the app with your data. Nothing personal is ever written inside the repo tree.

### 9.3 Security

LAN only. The api rejects non-loopback, non-RFC-1918 addresses with 403 (`OTS_LAN_GUARD`, default on). No secrets in the repo. Garmin credentials are never stored; only tokens, outside the repo.

### 9.4 Observability

pino structured logs to stdout and a rolling file in the data folder. `GET /health` reports db, migration version, last backup, last Garmin sync.

## 10. Testing

- api: table-driven tests for every progression rule and for `achievableLoads` and load snapping; route tests against a temp SQLite.
- web: component tests for check-in, log form, strength set logging, timer state machine; one Playwright flow through setup, check-in, log, strength session.
- garmin: fixture-based, no live calls in CI.
- CI: GitHub Actions on push and PR: lint, typecheck, test, build.

## 11. Public release checklist (before the repo goes public)

- No personal values anywhere: grep for the first user's name, race name, event dates, weights, locations
- README covers setup from clean on Windows and Linux
- Starter templates are generic and documented
- LICENSE present, CONTRIBUTING short, issue template
- Screenshots use synthetic data

## 12. Open questions

1. Whether a second starter template (for a 50k or marathon build) ships in v1 or waits for a second user
2. Whether `optional` Sunday sessions should also apply to a user with a different rest day; probably a per-fixture flag rather than a weekday rule
