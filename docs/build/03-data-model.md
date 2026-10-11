# Stage 3: data model, setup and API

Branch: `feat/data-model`

Implement SPEC section 5 as a Drizzle schema with migrations, ship the starter template from `docs/PLAN.md` as seed data, and expose validated routes including first-run setup.

## Do

1. `apps/api/src/db/schema.ts`: every entity in SPEC 5.1 to 5.4. Integer primary keys, ISO date strings for dates, ISO timestamps for times, JSON columns typed via `$type`. Unique constraints: `daily_checkin.date`, `body_metric (date, metric, source)`, `activity.garmin_activity_id` where not null, `planned_session (date, template_id, slot)`, `habit_definition.key`.
2. Drizzle Kit migrations under `apps/api/drizzle/`. `pnpm --filter api db:migrate`. WAL and `foreign_keys = on` on open. Database path from `OTS_DATA_DIR` (default per SPEC 4), created if missing. The repo tree must never be the default.
3. Starter template: `apps/api/src/seed/templates/rebuild-100.ts` exports a plain object describing session templates, fixtures, block with rules, exercises, programme days and habit definitions exactly as PLAN.md. No athlete, no events, no equipment, no loads: those come from setup. `POST /setup/apply-template/:name` loads it for the current athlete. Idempotent.
4. Setup routes: `GET /setup/status` (`{ complete: bool, missing: [...] }`), `PUT /athlete`, CRUD `/events` (with a check that exactly one has priority A), `PUT /equipment`, `PUT /fixtures`, `GET /templates/starters`. Setup is complete when athlete, one A event and fixtures exist; equipment may be empty.
5. Equipment logic in `packages/shared` (pure, tested): `achievableLoads(equipment, type)` and `snapLoad(load, achievable, direction)`. Barbell loads are bar plus every symmetric plate combination within the counts owned, deduplicated and sorted. Dumbbell and kettlebell loads are the owned values. Empty equipment returns an empty list. Include `describeLoad(load, equipment)` returning text like "bar + 2 x 20 + 2 x 1.25".
6. Routes, JSON, TypeBox-validated, OpenAPI at `GET /docs/json`:
   - CRUD for `/blocks`, `/session-templates`, `/exercises`, `/programme-days`, `/habits`
   - `GET /weeks/:isoWeek`, CRUD `/planned-sessions`
   - CRUD `/activities` with nested strength sessions and sets
   - `GET /checkins/:date`, `PUT /checkins/:date` (mirrors weight into body_metric)
   - `GET /metrics?from&to&metric`, `PUT /metrics`
   - `POST /import/garmin/daily`, `POST /import/garmin/activity`, `GET/POST /import/garmin/status` (store and 202; matching is stage 8)
   - `GET /export/json`, `GET /export/csv/:table`
7. Shared types generated from the TypeBox schemas into `packages/shared`.
8. Tests: route tests against a temp-file SQLite per file. Cover create, read, validation failure (400 naming the field), conflict (409), template idempotency, setup status transitions, and `achievableLoads` with a table: no kit, bar only, bar plus one pair of 20s, a full plate set, dumbbells only, mixed.
9. `GET /health` extended with db status and migration version.

## Do not

- Implement week generation or progression. Stage 4.
- Hard-code any athlete, event, date, weight or location anywhere in `src/`. Test fixtures use obviously synthetic values.
- Build UI.

## Acceptance

- Fresh clone with `OTS_DATA_DIR` pointed at a temp folder: migrate, apply template twice; second apply reports zero changes. Show both.
- `pnpm test` green; coverage above 80 per cent on `apps/api/src/routes` and 100 per cent on the equipment functions. Show the table.
- `achievableLoads` for bar 20 plus plates `{20,1},{10,1},{5,1},{2.5,1},{1.25,1}` returns the expected 32 values; show them.
- `GET /setup/status` reports missing items on a fresh db and `complete: true` after athlete, an A event and fixtures are set. Creating a second A event returns 409.
- `grep -ri` for any personal value in `apps/` and `packages/` returns nothing (state what you grepped for).
