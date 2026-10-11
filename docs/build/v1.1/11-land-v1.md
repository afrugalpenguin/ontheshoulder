# Stage 11: land v1

No branch. This is housekeeping on the open v1 stack.

## Do

1. Merge the stacked PRs in order: #10 (web-today), #12 (web-timer), #14 (strength), #18 (trends), #20 (ops). Each should merge cleanly after the one before; if any does not, rebase it on main first and re-run CI before merging. Do not squash; keep the stage history.
2. After each merge, `pnpm lint && pnpm typecheck && pnpm test && pnpm build` on main. Stop and fix if anything is red.
3. Delete the merged remote branches.
4. Tag `v1.0.0` on main with a short annotated message.
5. Move `docs/prompts/` to `docs/build/` and add a one-paragraph `docs/build/README.md` saying these are the staged build briefs the project was constructed from. Kickoff rule 4 is about tool names, not about the briefs themselves; check the briefs for any tool name and remove it.
6. Update `docs/REVIEW.md` with a "v1.0.0 landed" line and the date.

## Acceptance

- `git log --oneline main | head -30` shows all five merges and the tag. Show it.
- All four root scripts green on main. Show output.
- `git branch -r` shows only main and any v1.1 branches. Show it.
