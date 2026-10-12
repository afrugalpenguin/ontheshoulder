# Stage 16: Week home, the day first

Branch: `feat/week-home`

Opening the app should answer "what am I doing today" without scrolling. Today it shows a five-line header and the whole check-in card first; today's sessions are below the fold on a phone. Walks are usually done out of habit without touching the app, and the only way to log one without the timer is hidden behind "..." then "Edit".

Supersedes: `docs/SPEC.md` 8.5 Week (header and day order), 8.2 (check-in fields), 8.3 (timer finish), and 8.6 (the sleep and energy chart). Update those sections in this PR.

## Do

1. **Header.** The title is the date range ("12 to 18 Oct"); the ISO week becomes small muted text under it. Below: the A event countdown, then one line combining compliance and streaks, for example "Key sessions 1 of 3 · mornings 2 of 4 · run 45 min · 3 weeks in a row". Leave out any part that has nothing to say yet: no "Bonus: not this week", no streak of 0, no "run 0 min". The previous and next week buttons stay.
2. **Day order.** In the expanded day row: the protein nag strip (unchanged, still a nag), then the session cards, then the check-in card last.
3. **Check-in card trimmed.** Remove sleep, energy and the ankle score from the card. Remove the "Treadmill done" habit (finishing a walk already counts as the treadmill morning). The card is now weight plus the remaining habit chips. Once weight has been saved for the day, the card collapses to one line ("77.0 kg · protein done"); tapping it opens it again. Keep the database columns `sleep_quality`, `energy`, `ankle_score` and any saved values; the api keeps accepting them; only the UI stops asking. Disable the `treadmill_done` habit in the starter template and in existing installs (a migration that sets `enabled = false`, not a delete).
4. **Walks in one tap.** For `walk` and `walk_vest` sessions the primary button becomes **Done**: one tap logs the planned duration (and the planned vest weight) as done, with no sheet. A smaller secondary **Start timer** button sits beside it and opens the timer as Start does today. The overflow keeps Skip and renames "Edit" to **Log different time**, which opens the existing log sheet.
5. **Timer safety net.** If the timer is finished with less than 5 minutes elapsed, do not save the elapsed time. Ask: "Log the planned 60 min instead?" with two choices: the planned duration, or the actual time. The threshold is a constant in one place. "Ended early" after 5 minutes behaves as today.
6. **Past days.** Done, Log and Skip work on any earlier day of the current week, so Tuesday's walk can be ticked on Wednesday. Collapsed past days with an undone planned session show it as a chip that expands the day on tap.
7. **One layout at every width.** Drop the seven-column desktop layout. Every width gets the phone layout in a centred column (max width around 480px). Remove the `DESKTOP` branch from Week and anything only it used.
8. **Trends.** Remove the "Sleep and energy" chart. If run RPE is drawn nowhere else, it goes with it; the data stays in the database.
9. **Small fixes.** The Trends compliance grid shows weeks before the first planned week as empty, not "Open". Add a favicon (a plain monogram SVG, no external assets) so the console has no 404.
10. **Tests.** Week page: today's sessions render before the check-in; header omits empty parts; walk Done logs the planned minutes in one call; the check-in collapses after weight is saved. Timer: finishing under the threshold offers the planned duration and saves nothing until a choice is made. Update the Playwright flow to log a walk with Done.

## Do not

- Change the plan engine, compliance rules or strength screens.
- Delete any column or any saved check-in data.
- Add a new habit model; stage 17 does that.

## Acceptance

- At 390 x 844, a fresh load of Week with two sessions today shows both session cards' primary buttons without scrolling. Screenshot it in the PR.
- Header with a brand-new install shows no zeros and no "not this week". Screenshot.
- A vest walk logged with one tap from cold; the activity row shows the planned minutes and vest weight. Show the row.
- Start timer, Finish after a few seconds: the prompt appears and the elapsed seconds are not saved unless chosen. Show the test output.
- Check-in card shows only weight and the remaining habit chips; `treadmill_done` is disabled, not deleted (show the row).
- Week at 1440px wide renders the single centred column.
- The four root scripts pass.
