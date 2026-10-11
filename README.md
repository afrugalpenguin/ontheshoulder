# On the Shoulder

A self-hosted training system for coming back to running and building toward a long race. Runs on your PC, served over your home network, used from a phone browser. Nothing in the cloud, nothing on the phone, your data stays in a SQLite file you own.

- Plan: blocks, weeks, sessions, calendar-driven progression you can read and edit
- Today: what to do, a one-minute check-in, habit prompts
- Strength: tells you the weight and how to load it from the kit you own, rest timer built in
- Log: runs recorded on your watch, logged here after; vest walks and strength timed here
- Trends: volume, sleep and energy, weight, compliance, main lifts
- Garmin (optional): sleep and recovery metrics if you choose to set it up

Start with `docs/SPEC.md`. Build order and hand-off prompts are in `docs/prompts/`.

## Layout (target)

```
apps/web            Vite + React + TypeScript, mobile-first
apps/api            Node + TypeScript, Fastify, SQLite via Drizzle
services/garmin     Python sidecar, python-garminconnect, writes to the API
docs/               spec, decisions, plan seed, build prompts
```

## Run (target)

```
pnpm install
pnpm dev            # api on :3001, web on :5173, both bound to 0.0.0.0
```

Open `http://<pc-lan-ip>:5173` on the phone and follow the setup screen.

Licence: MIT.
