# Stage 10: operations

Branch: `feat/ops`

SPEC section 9. Make it start itself, back itself up, and be editable without a code change.

## Do

1. Production serve: `pnpm build` produces the web bundle; the api serves it as static files from `/` with SPA fallback, api routes under `/api`. One process, one port (`OTS_PORT`, default 3001). Dev mode unchanged.
2. Backups: on api start and at 02:00 daily, copy the SQLite file using the online backup API (`better-sqlite3` `.backup()`), not a file copy, to `<OTS_DATA_DIR>/backups` as `ots-YYYYMMDD-HHmm.db`. Keep 30, delete older. Log each. `POST /admin/backup` triggers one; `GET /health` reports the last backup time and the count. A `scripts/restore.ps1` that stops the service, swaps the file, and restarts, with a confirmation prompt.
3. Windows Task Scheduler: `scripts/install-tasks.ps1` registers three tasks under the current user: api at logon (restart on failure, 1 minute delay), Garmin sync at 06:00 and 21:00 (`ots-garmin sync`), and a weekly `pnpm --filter api db:vacuum`. `scripts/uninstall-tasks.ps1` removes them. Both idempotent. Document the LAN IP discovery and the home-screen bookmark steps in `docs/RUNBOOK.md`.
4. LAN guard: the api rejects requests whose remote address is not loopback or RFC 1918 with 403, configurable off with `OTS_LAN_GUARD=false`. Log the first rejection per address per hour, not every one.
5. Rules editor: Settings gets a JSON editor for the current block's progression rules with schema validation on save (reuse the stage 4 TypeBox schema), a diff view against the saved version, and a "dry run next week" button that calls the engine without persisting and shows the resulting sessions and reasoning.
6. Block editing: create, edit and reorder blocks in Settings with overlap validation. Fixtures editing: which weekday maps to which template and slot.
7. Export: already exists; add a "download backup file" button that streams the latest backup.
8. Public release checklist from SPEC 11: run it, fix what it finds, add LICENSE check to CI (fail if missing), add a `scripts/check-no-personal-data.sh` grep that CI runs against a list in `.personal-terms` (gitignored, local only).
9. Logging: pino to stdout and a rolling file (`pino-roll`) in `OTS_LOG_DIR`, 14 days. Log level from env.
10. `docs/RUNBOOK.md`: first-time setup on the PC from clean, daily operation, what to do when Garmin sync goes red, how to restore a backup, how to move the database to a new machine.

## Do not

- Add HTTPS or a service worker. Note in BACKLOG.md with the mkcert approach for later.
- Add remote access of any kind.

## Acceptance

- Reboot the PC. Within two minutes the app is reachable on the phone without touching anything, and Garmin sync runs at the next scheduled time. Describe and show the Task Scheduler history.
- Backup appears on start; `scripts/restore.ps1` restores yesterday's backup to a scratch path and the api opens it. Show it.
- A request from a non-LAN address is rejected (simulate with `OTS_LAN_GUARD` test and a unit test on the guard function with a table of addresses).
- Rules dry run from Settings shows next week's sessions and reasoning without writing anything; verify by checking the week endpoint before and after.
- `docs/RUNBOOK.md` followed from a clean clone on the PC produces a working install.
- Public release checklist items all ticked in the PR description.
