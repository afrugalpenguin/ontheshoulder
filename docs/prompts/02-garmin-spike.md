# Stage 2: Garmin verification spike

Branch: `spike/garmin`. This is throwaway. It may be merged only as a script under `services/garmin/spike/` plus a decision record; nothing from it goes into the api.

## Why first

Garmin has no personal API. The only route is the unofficial `python-garminconnect` library, which reimplemented its own login after Garmin's March 2026 auth change broke `garth`. Until a real login on this account has returned real sleep data, stage 8 cannot be planned with confidence. This spike exists to answer one question: can we get last night's sleep, HRV, resting HR, body battery and training readiness, reliably, with cached tokens and MFA handled once.

## Do

1. `services/garmin/spike/pull.py`. Interactive first run: prompts for email and password (never stored, never logged), handles the MFA callback by prompting for the code, saves tokens to a directory given by `OTS_GARMIN_TOKEN_DIR` (default `%LOCALAPPDATA%/ontheshoulder/garmin`, created 0700 equivalent). Second run uses tokens only and must not prompt.
2. For yesterday and today, fetch and print as JSON: sleep summary and stages, HRV summary, resting HR, body battery (wake value and series if available), training readiness, and the activity list with id, type, start, duration, distance, avg HR.
3. Save every raw response to `services/garmin/spike/fixtures/<endpoint>-<date>.json` after stripping anything that looks like a name, email, or user id. These fixtures become the test data for stage 8.
4. Fail closed: any auth error prints a clear message and exits non-zero. No retry loop. Repeated logins can lock the account.
5. Time each call and print a summary table of endpoint, status, ms.
6. Write `docs/DECISIONS.md` entry: what worked, what did not, which fields are present on this account and watch, token lifetime observed, and the go or no-go for stage 8 as specified. If no-go, describe the CSV fallback in enough detail that stage 8's prompt can be rewritten.

## Do not

- Touch the api or the database.
- Store credentials anywhere, including in test fixtures or logs.
- Add scheduling. That is stage 10.

## Acceptance

- First run: MFA prompted once, data printed. Show the output with values redacted to shape only (e.g. `sleep_score: <int>`).
- Second run, within the hour: no prompt, same data, token file untouched except for refresh. Show it.
- Fixtures present for every endpoint that returned data, with no personal identifiers (grep for `@` and the account's display name and show zero hits).
- `docs/DECISIONS.md` has the go or no-go entry.
