# v1.2 briefs

v1.1 has been used for a day. These briefs fix what that showed: the home screen leads with a form instead of the day, the check-in asks for things that are not used, and habits show on days they do not apply. Same rules as `../00-kickoff.md`; paste it first in every session.

| Stage | File | Branch | What it fixes |
|---|---|---|---|
| 16 | 16-week-home.md | feat/week-home | Week opens on the day's sessions, a short header, walks logged in one tap, a smaller check-in |
| 17 | 17-habits-by-day.md | feat/habits-by-day | Habits with days, a prehab card on its days, alcohol recorded without keeping score |

Order matters: 17 builds on the check-in card as 16 leaves it.

These briefs change the spec on purpose. Each one lists the SPEC sections it supersedes; update those sections in the same PR rather than stopping on the conflict.
