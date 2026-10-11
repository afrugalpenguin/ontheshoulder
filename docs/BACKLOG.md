# Backlog

Things noticed and deliberately not done yet. Add a line, do not do the work in the current stage.

- Shoe rotation tracking (mileage per pair) for the low-stack shoe reintroduction in Block 2
- Back-to-back long run rules for Block 3
- Garmin CSV import fallback if the unofficial client breaks (SPEC 7.4)
- HTTPS on the LAN so the app can install as a PWA and keep the screen awake. Approach: `mkcert -install` on the PC, `mkcert <pc-lan-address> localhost` for a certificate, pass key and cert to Fastify through `https` options (new `OTS_TLS_KEY` and `OTS_TLS_CERT` settings), then install the mkcert root CA on the phone (emailed or served once) and trust it in the phone settings. Not done in v1; no service worker either
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
- The scheduled-task scripts have only been run with `-WhatIf`; they have not registered real tasks or been through a reboot
- CI runs the personal-data check, but it checks nothing there until an `OTS_PERSONAL_TERMS` repository secret is added
- Linux install (systemd unit, restore steps) is written from the Windows build and has not been run on Linux
- `restore.ps1` has no Linux counterpart script; the runbook gives the manual steps
- The first chart request loads the rules validator with the main bundle (about 10 kB gzipped more); it could load with Settings instead
