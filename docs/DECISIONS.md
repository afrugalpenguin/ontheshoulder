# Decisions

One line per decision, newest at the bottom. Date, decision, reason. Reversible unless marked.

- 2026-10-11: TypeScript monorepo (pnpm) with a Python sidecar only for Garmin. One language for the app; the only maintained Garmin client is Python.
- 2026-10-11: SQLite with Drizzle, WAL mode. Single user, single machine, backup is a file.
- 2026-10-11: Garmin via `python-garminconnect` 0.3.x, treated as a best-effort feed. Garmin offers no personal API; the March 2026 auth change killed `garth`, so isolate the risk in its own process and fail closed.
- 2026-10-11: No service worker or PWA install in v1. LAN http is not a secure context; bookmark is enough.
- 2026-10-11: Progression rules stored as JSON on the block, interpreted by a pure engine with table tests. Tuning without deploying.
- 2026-10-11: Race date is a placeholder (2027-09-25) flagged unconfirmed until the event is chosen.
- 2026-10-11: v0.2. No injury gating anywhere; the app records and shows, the user judges. Progression is calendar-driven and editable.
- 2026-10-11: Runs are recorded on the watch. The app timer covers vest walks and strength rest only.
- 2026-10-11: Sunday sessions are optional by rule: done is a bonus, missed never fails the week. Compliance is weekday-based.
- 2026-10-11: Main lifts on linear 5x5 (+2.5kg per session, hold once, deload 10 per cent on second fail); accessories on double progression. All loads snapped to kit the user owns.
- 2026-10-11: Equipment is configured per user (plates, bar, dumbbells, kettlebells, vest), each possibly none. Substitutes offered when kit is missing.
- 2026-10-11: Habit prompts (protein shake seeded) shown on Today until ticked or the cut-off time; text and times editable.
- 2026-10-11: Repo is public-ready from the start: MIT, no personal data in the tree, database and backups outside the repo. Rejected committing the database or a text dump for the same reason.
- 2026-10-11: Garmin sidecar demoted to optional and last.
- 2026-10-11: v0.2.1. Midweek run: the week run_sec would hit 300 is the first 25 min continuous run (week 7), not a final run-walk week. Long run grows by repeats (+3 per week to 30) with 120/60 blocks fixed. Race specifics removed from docs; only the event shape is described.
- 2026-10-11: pnpm pinned to 10.34.6 through `packageManager` and run via corepack. The corepack bundled with Node 22 and 24 could not launch pnpm 12; revisit when it can.
- 2026-10-11: TypeScript held at 6.0.x. typescript-eslint 8 does not accept TypeScript 7 yet.
- 2026-10-11: `packages/shared` compiles to `dist` and the root `dev`, `test` and `typecheck` scripts build it first. Keeps the api build rooted at `apps/api/src` and works once shared holds runtime code.
- 2026-10-11: `services/garmin` is a plain Python project, not a pnpm workspace member. It has no Node code.
- 2026-10-11: One `.env` in the repo root, read by the api and by the web dev proxy, so the port cannot drift. Names: `OTS_HOST`, `OTS_PORT`, `OTS_LOG_LEVEL`.
- 2026-10-11: api routes are unprefixed for now (`/health`); the web dev proxy strips `/api`. Stage 10 moves routes under `/api`.
- 2026-10-11: Sidecar declares `requires-python >=3.12` and CI runs 3.12. Lets a newer local interpreter work until 3.12 is installed.
- 2026-10-11: Prettier ignores `docs/`. Hand-written tables stay as written.
