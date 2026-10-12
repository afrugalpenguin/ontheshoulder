# Stage 17: habits by day, prehab card, alcohol without a score

Branch: `feat/habits-by-day`

Habits have no days. Every enabled habit shows every day, so "Prehab done" appears on Monday when prehab is Tuesday and Friday, and the routine itself is never shown in the app. Alcohol-free needs recording, but as a quiet record of weeknights, not a daily pass or fail.

Supersedes: `docs/SPEC.md` 5.1 (habit definitions), 8.2 (check-in), the prehab section of `docs/PLAN.md`, and 8.6 (the alcohol line in Trends). Update those in this PR.

## Do

1. **Habits get days.** Add a nullable `weekdays` column to `habit_definition`: a JSON array of ISO weekdays (1 Monday to 7 Sunday); null means every day. Migration `0004`. The check-in card shows a habit only when today's weekday is in its list. The protein nag follows the same rule. The api validates the array (unique integers 1 to 7, not empty).
2. **Two-answer habits.** Add nullable `answer_labels` to `habit_definition`: a JSON pair `[yes, no]`. A habit with labels renders as a two-button segmented control instead of a chip, saving `true` for the first answer and `false` for the second; nothing saved means not answered. Neither answer uses a warning or success colour; both look the same until chosen, then the chosen one uses the plain selected style.
3. **Alcohol.** The starter's `alcohol_free` habit becomes: label "Last night", `answer_labels` `["Alcohol-free", "Had a drink"]`, `weekdays` `[2, 3, 4, 5]` (asked Tuesday to Friday mornings, about Monday to Thursday nights). Friday, Saturday and Sunday nights are never asked about. The existing install gets the same values by migration. Never part of "week complete", never a streak, never a prompt or banner.
4. **Trends line for alcohol.** One quiet text line per week in Trends: "AF weeknights: 3 of 4", counting `true` answers. Unanswered nights count as unanswered, not as drinks: "3 of 4, 1 not recorded". No chart, no colour, no target.
5. **Prehab as a session, not a habit.** Add a `prehab` session template to the starter: "Prehab, 8 min", kind `prehab`, scheduled Tuesday and Friday in the am slot before the treadmill session. Its card lists the five exercises with their doses from `docs/PLAN.md` (single-leg balance, slow calf raises, edge walking, toe spreads and towel scrunches, ankle circles and alphabet), always visible, no expanding. One **Done** button. The exercise list is data on the template (structure or notes), not hard-coded in the component, so it is editable later. Disable the `prehab_done` habit (not delete). Prehab is not a key session and does not change compliance.
6. **Existing install.** Applying the starter template to an existing database adds the prehab template and its two schedule entries without touching anything else; the current and future generated weeks pick it up on regenerate. Document the command in `docs/RUNBOOK.md`.
7. **Settings.** Habits and prompts shows each habit's days as seven small toggles and its labels; editable.
8. **Tests.** A habit with days shows only on those days; the alcohol control saves `true` and `false` and shows nothing on Saturday to Monday; the Trends line counts answered and unanswered nights; the prehab card lists the exercises from data and logs with one tap; applying the template twice adds prehab once.

## Do not

- Add a drinks count, units, or anything for weekend nights.
- Use red, green, ticks or crosses on the alcohol control or its Trends line.
- Delete any habit or any saved check-in value.

## Acceptance

- Monday check-in shows weight and protein only; Tuesday shows weight, protein and "Last night". Screenshot both at 390 x 844.
- Tuesday and Friday show the prehab card above the treadmill walk, with the five exercises readable without a tap. Screenshot.
- Trends shows the AF weeknights line for a week with two answers recorded. Screenshot.
- Migration `0004` applied to a copy of a v1.1 database: `prehab_done` and `treadmill_done` disabled, `alcohol_free` has its days and labels, no rows deleted. Show the before and after counts.
- The four root scripts pass.
