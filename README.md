# On the Shoulder

A self-hosted training system for coming back to running and building toward a long race. Runs on your PC, served over your home network, used from a phone browser. Nothing in the cloud, nothing on the phone, your data stays in a SQLite file you own.

- Plan: blocks, weeks, sessions, calendar-driven progression you can read and edit
- Today: what to do, a one-minute check-in, habit prompts
- Strength: tells you the weight and how to load it from the kit you own, rest timer built in
- Log: runs recorded on your watch, logged here after; vest walks and strength timed here
- Trends: volume, sleep and energy, weight, compliance, main lifts
- Garmin (optional, not built yet): sleep and recovery metrics if you choose to set it up

It records and shows; it does not judge. There are no readiness scores and nothing is gated on how you feel. Progression is on the calendar, in rules you can read and edit.

## Install

You need Node 22 or newer and git. Works on Windows and Linux.

```
git clone <repo url> ontheshoulder
cd ontheshoulder
corepack enable        # once; puts the pinned pnpm on your path
pnpm install
pnpm build
pnpm --filter @ots/api start
```

Open `http://localhost:3001` and follow the setup screen: your name, your goal event, the kit you own, and the shape of your week. Then open `http://<the PC's LAN address>:3001` on your phone and add it to the home screen.

To have it start by itself:

- Windows: `.\scripts\install-tasks.ps1` registers it to start at logon.
- Linux: `scripts/ontheshoulder.service` is a systemd user unit; the steps are in its header.

`docs/RUNBOOK.md` has the full walkthrough: finding the PC's address, the firewall, backups and restore, updating, and moving to a new machine.

## Your data

Everything lives in one folder outside the repo: `%LOCALAPPDATA%\ontheshoulder` on Windows, `~/.local/share/ontheshoulder` on Linux, or wherever `OTS_DATA_DIR` points. It holds the database, the newest 30 backups (one on every start and one each night) and the logs. Settings has buttons to back up now, download the latest backup, and export everything as JSON or CSV.

The app only answers addresses on your own network. It has no accounts and no remote access, on purpose.

## The starter template

Setup offers one starter template, a ten-week rebuild block for a runner returning to a 100-mile build: two runs, two strength sessions, weekday treadmill walks, Sunday optional. It is described in prose in `docs/PLAN.md` and defined as data in `apps/api/src/seed/templates/rebuild-100.ts`. It contains no person, event, kit or loads; those come from your setup. You can also build your week by hand, and everything a template creates is editable afterwards.

## Develop

```
pnpm dev               # api on :3001, web on :5173 with hot reload, both on 0.0.0.0
pnpm lint
pnpm typecheck
pnpm test              # unit and route tests, with coverage
pnpm test:e2e          # builds, then runs the browser flows (needs: pnpm --filter @ots/web exec playwright install chromium)
```

Settings are optional environment variables; see `.env.example`.

```
apps/web            Vite + React + TypeScript, mobile-first
apps/api            Fastify + TypeScript, SQLite through Drizzle
packages/shared     schemas, types and the pure logic both sides use
services/garmin     optional Python sidecar (a skeleton for now)
scripts/            start-at-logon tasks, restore, personal-data check
docs/               spec, plan, decisions, backlog, runbook
```

`docs/SPEC.md` is the specification, `docs/DECISIONS.md` the record of choices made along the way, and `docs/BACKLOG.md` what was noticed and left for later. `CONTRIBUTING.md` is short.

Licence: MIT.
