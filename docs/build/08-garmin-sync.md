# Stage 8: Garmin sync service (optional)

Branch: `feat/garmin-sync`

Optional. The app is complete without it. Only start this once stage 2's decision in `docs/DECISIONS.md` says go, and only after stages 9 and 10 if time is short. If stage 2 said no-go, skip this stage entirely; the Garmin strip simply never appears.

Implements SPEC section 7 as described in the v0.1 detail below. Matching links imported runs to planned sessions after the fact; the watch remains the recorder.

## Do

1. `services/garmin/ots_garmin/`: a proper package. `cli.py` with subcommands `login` (interactive, MFA, saves tokens), `sync [--since YYYY-MM-DD] [--dry-run]`, `status`. Config from env: `OTS_API_URL` (default `http://127.0.0.1:3001`), `OTS_GARMIN_TOKEN_DIR`, `OTS_GARMIN_MAX_DAYS` (default 30).
2. `sync`: determine the last successful date from `GET /import/garmin/status`, pull each missing day up to today for the metrics in SPEC 7.2, post each day to `POST /import/garmin/daily` and each new activity to `POST /import/garmin/activity`. Idempotent: re-running for the same days changes nothing on the api side (the api upserts). Log one line per day with counts. At the end, `POST /import/garmin/status` with ok or error, the last date covered, and the error message if any.
3. Fail closed: any authentication failure logs a clear message, posts status error, exits 2, and does not retry. Any HTTP error from Garmin other than auth is retried once after 30 seconds, then recorded and skipped for that day so the rest of the sync can proceed. Never loop on login.
4. Payload adapters: pure functions that turn the raw Garmin JSON (shape as captured in the stage 2 fixtures) into the api's import schema. Unit tests use the fixtures. If a field is missing on this account (stage 2 will have said), the adapter omits it rather than sending null.
5. API side: implement matching per SPEC 7.3. On `import/garmin/activity`, if a planned run or walk session exists on that date, unlinked, same kind, and duration within 25 per cent, link it and mark done with `source: garmin`. Otherwise store as unlinked. `GET /activities/unmatched` lists unlinked Garmin activities; `POST /activities/:id/link` with a planned session id links by hand. Daily metrics upsert into `body_metric` with `source: garmin`.
6. Web: the Garmin strip on Today shows last night's sleep score and duration, HRV, body battery at wake, training readiness, and the sync status with time. A red state when the last sync is older than 36 hours or errored, with the error text. An "Unmatched activities" card appears when there are any, with a link-to-session picker.
7. Logging: Python `logging` with a JSON formatter, to stdout and to a rolling file in the token directory's parent. One line per day processed, one summary line.
8. Tests: adapter tests against fixtures; a fake api (small `http.server`) for an end-to-end dry run in CI with no network to Garmin.

## Do not

- Store credentials. Tokens only, outside the repo.
- Import more than 30 days of history by default.
- Schedule it. Stage 10.

## Acceptance

- `ots-garmin login` once, then `ots-garmin sync` twice: second run reports zero new rows. Show both outputs with values redacted to shape.
- Today's Garmin strip populated on the phone after a sync. Screenshot.
- Kill the network and run sync: exits non-zero, status shows error, Today shows the red state. Show it.
- CI green including the fake-api end-to-end test.
