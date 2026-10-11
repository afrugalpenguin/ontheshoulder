# Kickoff (paste at the top of every session)

You are working in the `ontheshoulder` repo, a personal training system for a 100-mile build. The spec is `docs/SPEC.md`, the training content is `docs/PLAN.md`, and the stage you are doing is the prompt I paste after this.

Rules:

1. Read `docs/SPEC.md` and `docs/PLAN.md` first. Do not start coding until you have. If this stage's prompt conflicts with the spec, stop and tell me which lines conflict.
2. Branch from main with the branch name given in the stage. Open a PR when the stage's acceptance criteria pass. Never commit to main.
3. Conventional commits: `type(scope): description`, subject 72 characters or fewer. Commit after each acceptance criterion passes.
4. Nothing in the repo describes or credits how the code was produced. No tool names in commits, comments, PR text or files.
5. No em dashes or en dashes anywhere. Use a hyphen or rewrite the sentence.
6. Prefer reliable and repeatable over fast. Fail closed on anything to do with Garmin credentials or data import. Log progress so a human can see what is happening without a debugger.
7. Before saying anything works, run the command that proves it and include the output. If you cannot run it, say so and say why.
8. Keep each PR to the stage. Note anything you spot for a later stage in `docs/BACKLOG.md` rather than doing it now.
9. SQL keywords lowercase in any raw SQL.
10. The repo will be public. No personal values (names, dates, weights, locations, race entries) anywhere in `src/`, tests, fixtures, docs or screenshots. User data comes from the setup screen and lives in the database outside the repo.
11. When a decision is needed that the spec does not make, make the smallest reversible one, write one line in `docs/DECISIONS.md` with the date, and carry on.

Stack, fixed: pnpm workspaces, TypeScript strict everywhere, Vite + React for `apps/web`, Fastify + Drizzle + better-sqlite3 for `apps/api`, Python 3.12 + `python-garminconnect` for `services/garmin`, Vitest for tests, Playwright for the one end-to-end flow, GitHub Actions for CI.
