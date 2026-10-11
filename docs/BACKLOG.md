# Backlog

Things noticed and deliberately not done yet. Add a line, do not do the work in the current stage.

- Shoe rotation tracking (mileage per pair) for the Escalante reintroduction in Block 2
- Back-to-back long run rules for Block 3
- Garmin CSV import fallback if the unofficial client breaks (SPEC 7.4)
- HTTPS on the LAN via mkcert so the app can install as a PWA
- iOS Safari audio and vibration limitations in the timer, if an iPhone is ever used
- Read-only progress view for someone else
- Stage 10: when api routes move under `/api`, remove the prefix rewrite in `apps/web/vite.config.ts`
- Stage 10: until the LAN guard exists the dev api on `0.0.0.0` has no address filter
- Install Python 3.12 (or `uv`) on the dev PC; the sidecar scaffold was checked locally on a newer interpreter and on 3.12 only in CI
- Public release: `docs/prompts/README.md` names the tool the prompts are written for, `docs/DECISIONS.md` carries a placeholder race date, and the first line of this file names a shoe model; decide whether each stays
- "SPEC 7.4" in the Garmin CSV line above no longer exists; section 7 has no subsections
- Skipped: stage 2 (Garmin spike). Needs an interactive Garmin login and MFA code, so it was not run unattended
- Skipped: stage 8 (Garmin sync). Depends on the stage 2 go or no-go; the import inbox routes exist and only store payloads
- Shared test files are not typechecked by `tsc` (they are excluded from the shared build); Vitest still runs them
- `corepack enable` has not been run on the dev PC, so `pnpm` is not on the path outside the pinned shim
- Today and Week have no way to undo a logged session from the UI (the api supports deleting the activity)
- Settings cannot add or delete habits, or edit session templates, yet; the api can
- The theme override function still has no control in Settings
- Lighthouse accessibility could run in CI against the Playwright servers
