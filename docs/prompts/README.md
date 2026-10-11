# Build prompts

Each file is a self-contained prompt for one Claude Code session. Hand them over in order. Each ends with acceptance criteria and the commands that prove them; a stage is not done until those commands have been run and their output shown.

Paste `00-kickoff.md` at the top of every session.

| Stage | File | Branch | Gate before next stage |
|---|---|---|---|
| 1 | 01-scaffold.md | feat/scaffold | `pnpm dev` serves hello pages on the LAN, CI green |
| 2 | 02-garmin-spike.md | spike/garmin | optional, cheap, do it early: go or no-go recorded for stage 8 |
| 3 | 03-data-model.md | feat/data-model | migrations clean, starter template seeds, setup endpoints work, route tests green |
| 4 | 04-plan-engine.md | feat/plan-engine | every rule in SPEC 6.3 and `achievableLoads` have passing table tests |
| 5 | 05-web-today.md | feat/web-today | setup, check-in, prompts and logging work from the phone |
| 6 | 06-web-timer.md | feat/web-timer | interval timer for a vest walk and rest timer component done |
| 7 | 07-strength.md | feat/strength | Strength A logged set by set on the phone with calculated loads |
| 8 | 08-garmin-sync.md | feat/garmin-sync | optional; only if stage 2 said go |
| 9 | 09-trends.md | feat/trends | charts render from real data |
| 10 | 10-ops.md | feat/ops | backups, start-at-logon, runbook, public release checklist |

Stage 8 is optional and last among the functional stages. The app is complete without it.
