# Stage 1: scaffold

Branch: `feat/scaffold`

Set up the monorepo so that every later stage has somewhere to land and CI from day one.

## Do

1. `pnpm` workspace with `apps/web`, `apps/api`, `packages/shared`, `services/garmin`. Root `package.json` with scripts: `dev` (api and web concurrently), `build`, `test`, `lint`, `typecheck`, `format`.
2. `apps/api`: Fastify 5, TypeScript strict, `tsx` for dev, `pino` logging to stdout, `GET /health` returning `{ ok: true, version, uptime_s }`. Bind to `0.0.0.0:3001`. Read port and host from env with `.env.example` documenting them.
3. `apps/web`: Vite + React 18 + TypeScript strict. Dev server bound to `0.0.0.0:5173` with a proxy for `/api` to the api. A single page that calls `/api/health` and shows the result. Dark theme default via `prefers-color-scheme` with a manual override stub. Viewport meta for phones.
4. `packages/shared`: empty `index.ts` exporting a `Health` type used by both sides, to prove the wiring.
5. `services/garmin`: `pyproject.toml` with `python-garminconnect` pinned to the current 0.3.x, `ruff`, `pytest`. A `README.md` saying it is built in stage 8. A `main.py` that prints the library version. Use `uv` if present, else `venv` plus `pip`.
6. Tooling: ESLint flat config with typescript-eslint, Prettier, `.editorconfig`, `.nvmrc` at 22. Vitest configured in api and web with one trivial passing test each.
7. GitHub Actions: `ci.yml` on push and pull_request. Jobs: node (install, lint, typecheck, test, build) and python (ruff, pytest). Cache pnpm and pip.
8. `docs/DECISIONS.md` and `docs/BACKLOG.md` created with headers.
9. `.gitignore` already exists; extend it if the scaffold needs more, do not replace it.

## Do not

- Add any domain code, schema or UI beyond the health check.
- Add a service worker or PWA manifest.
- Add auth.

## Acceptance

- `pnpm install` from clean completes without warnings about peer deps.
- `pnpm lint && pnpm typecheck && pnpm test` all green. Show output.
- `pnpm dev` starts both; `curl http://<lan-ip>:3001/health` from another machine on the network returns ok; `http://<lan-ip>:5173` on a phone shows the health result. Show the curl output and describe the phone check.
- CI run on the PR is green. Link it.
- `python -m services.garmin.main` or equivalent prints the garminconnect version.
