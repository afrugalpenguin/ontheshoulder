# Stage 5: web app, setup, Today and logging

Branch: `feat/web-today`

The screens used every morning on a phone: first-run setup, Today with prompts and check-in, logging, and the Week view. SPEC 8.1, 8.2, 8.5, and the parts of 8.7 needed to make them usable.

## Do

1. App shell: bottom tab bar (Today, Week, Strength, Trends, Settings), React Router, TanStack Query against `/api`, dark theme default, 44px minimum targets, no modals that need precise taps. Strength and Trends are placeholders.
2. Setup wizard, shown whenever `GET /setup/status` is not complete: athlete name; race name, date, distance, time limit; equipment (bar weight or none, plates as a list of kg and count with quick-add buttons for common sets, dumbbell pairs, kettlebells, vest kg; every section has a "none" option); fixtures (pick a starter template, preview the week, or build by hand); data folder shown read-only with the path. Finish generates the first week and lands on Today.
3. Today:
   - Header: weekday and date, race countdown in weeks and days, this week's compliance so far.
   - Prompts strip: for each enabled habit with `prompt_text` whose `prompt_until` has not passed today and whose tick is unset, a one-line banner with the prompt text, a Done button (sets the tick) and "not today" (hides until tomorrow). The seeded protein prompt should feel like a mate, not a notification.
   - Check-in strip until done: sleep and energy as 1 to 5 rows, weight with last value prefilled, habit checkboxes, ankle 0 to 5 as a small optional row, Sunday "got up for it" toggle. One Save, optimistic.
   - Session cards in slot order: kind icon, name, target text ("8 x 2:00 / 1:00", "60 min, 20kg", "Strength A"), optional tag where set. Actions: Log (inline form pre-filled from the template structure; kind-specific fields; RPE 1 to 10; notes), Skip (reason list), Start (routes to the timer for vest walks, to Strength for strength; disabled for runs with the hint "recorded on your watch").
4. Week: vertical list on phone, seven columns above 900px. Status colours. Tap a session for Log or Skip. Generate next and Regenerate this with the 409 handled by a confirm. Compliance line with Sunday shown separately as bonus.
5. Settings: athlete, race (date_confirmed flag visible), equipment editor (same component as setup), fixtures editor, habits editor (label, prompt text, cut-off time, enabled), export buttons, read-only rules JSON view.
6. Tests: component tests for the equipment editor (none states, quick-add, achievable load preview), the check-in strip, the prompts strip timing logic, and the log form per kind. One Playwright flow: fresh db, complete setup with the starter template, complete check-in, dismiss the protein prompt, log the vest walk, see compliance change.

## Do not

- Build the timer or strength logging.
- Add a service worker.
- Put any real person's details in fixtures or screenshots.

## Acceptance

- On a phone on the LAN: run setup from a fresh db, complete a check-in, tick the protein prompt, log a vest walk, skip the Sunday run with a reason and see the week still marked complete. Describe and include a screenshot of Today after logging.
- Playwright flow green in CI. Link it.
- Lighthouse mobile accessibility 90 or above on Today and on the setup wizard.
- Web build under 300 kB gzipped for the initial route.
