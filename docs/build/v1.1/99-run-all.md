# Run v1.1 unattended

Paste `../00-kickoff.md`, then this.

Run stages 11, 12, 13, 14, 15 from docs/build/v1.1/ in order, unattended.

Stage 11 is housekeeping on main: do it exactly as written, including the tag.

For stages 12 to 15: branch from main, build to acceptance, commit per criterion, run the four root scripts, push, open a PR with the acceptance checklist. Any phone or LAN check gets the closest automated substitute and is listed under "Manual checks outstanding"; never claim it passed. Merge a PR yourself only when CI is green and there are no outstanding manual checks; otherwise leave it open and base the next stage on it.

If a stage cannot meet acceptance after a serious attempt, write what blocks it in the PR and move on.

Finish by appending a "v1.1" section to docs/REVIEW.md: per stage, PR, status, manual checks, and the two or three things to look at first.
