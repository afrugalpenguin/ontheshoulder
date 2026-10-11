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
- Timer on plain LAN http: the Screen Wake Lock API needs a secure context, so the screen is not kept awake, and a locked phone suspends page timers so cues sound on unlock. HTTPS on the LAN (mkcert, above) fixes the wake lock
- Timer on iOS Safari: no Vibration API; audio only starts after a tap and is cut when the page is backgrounded or the ring switch is on silent; wake lock needs iOS 16.4 or later and HTTPS. Not worked around
- Timer state is in memory only: reloading the page mid-session loses it
- Strength session state is in memory: leaving the screen before Finish loses the sets logged so far
- Timed and carried sets are logged with reps of 1; a seconds or distance field per set would be truer
- Applying the starter template to a database set up before stage 7 adds the new alternative exercises (re-run apply-template); nothing does that automatically
- Trends: the last bar of the volume chart sits against the right edge; give the x scale some padding
- Trends: B and C event markers on the charts (SPEC 5.1 mentions them on Trends) are not drawn yet; they are on Week
- Trends: the charts have text legends with latest values but no way to read off an earlier point
