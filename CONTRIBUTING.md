# Contributing

This is a small personal project that others are welcome to use and improve. A few rules keep it that way.

## Before you open a pull request

- Open an issue first for anything bigger than a fix, so the idea can be talked through.
- Work on a branch, one change per pull request.
- `pnpm lint`, `pnpm typecheck`, `pnpm test` and `pnpm build` must pass. Add tests for what you change; pure logic goes in `packages/shared` or `apps/api/src/engine` with table tests.
- Commit messages: `type(scope): description`, 72 characters or fewer.

## House rules

- No personal data anywhere in the repo: no real names, events, dates, weights, locations or screenshots of real logs. Tests use obviously synthetic values. `scripts/check-no-personal-data.sh` checks tracked files against your own list in `.personal-terms`.
- The app records and shows. Do not add readiness scores, injury gating, load ratios, targets or advice.
- Progression stays in rules data the user can read and edit, interpreted by pure functions.
- Phone first: large targets, no precise taps, readable at arm's length, dark by default.
- SQL keywords lowercase in raw SQL. No em dashes or en dashes in text.

## Where things go

- A decision the spec did not make: one dated line in `docs/DECISIONS.md`.
- Something noticed but out of scope: one line in `docs/BACKLOG.md`.
