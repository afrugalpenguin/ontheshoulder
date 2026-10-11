# Stage 12: UI foundation and Week as home

Branch: `feat/ui-foundation`

The v1 UI works but is clunky: inconsistent spacing, too many taps, forms where a button would do, and Today is the wrong home screen. This stage gives the app one visual system and makes Week the place you live.

Reference feel: clean and fast. Dark by default, one accent colour, large targets, no decoration. If a screen needs a legend to read, it is wrong.

## Do

1. **Design tokens** in `apps/web/src/theme.ts` and `styles.css`: a spacing scale (4, 8, 12, 16, 24, 32), three type sizes plus one display size for timers and countdowns, one accent, one success, one warning, surface and border colours for dark and light. Every component uses tokens; no ad hoc pixel values or colours remain (grep for `px` and `#` in component files and justify any survivors).
2. **Primitive components** in `apps/web/src/ui/`: `Button` (primary, secondary, ghost, danger; 48px tall; loading state), `Card`, `Sheet` (bottom sheet for forms on phone, dialog on desktop), `Stepper` (big minus and plus around a value), `Segmented` (1 to 5 scores, ranges), `Chip`, `Toast`. Each with a short story-style demo page at `/dev/ui` (not linked from nav, excluded from the production build).
3. **Week is home.** `/` renders Week. Phone: a vertical list of seven day rows, today expanded and scrolled into view, other days collapsed to one line each (day, sessions as chips with status colour). Desktop: seven columns. Swipe or arrow to previous and next week. The header shows the ISO week, the A event countdown, and this week's compliance as a single short line. The old Today page goes; its content moves into the expanded day row: check-in strip, prompts, session cards.
4. **Session card actions in one tap.** Each card has one primary button whose label depends on kind and state: Start (vest walk, strength), Log (run, ride, swim), Done (prehab and other tick-only sessions), and a small overflow for Skip and Edit. Log opens a Sheet pre-filled from the plan with duration and RPE as Steppers and a notes field; saving is one tap. Skip is a Sheet with reason chips, one tap each.
5. **Check-in in one screen.** Sleep, energy, weight, habits in a single Card with Segmented controls and a weight Stepper (0.1 kg steps, last value prefilled). Saves on each change, no Save button. Ankle score row stays, small, optional.
6. **Next-day prompt.** From 20:00 the expanded day row for tomorrow shows a quiet banner: "Tomorrow: run, 50 to 60 min. Kit out?" with a tick that records `kit_ready` on tomorrow's check-in. Text per kind lives in the habit definitions table so it is editable. This is the only motivational feature; keep it dry.
7. **Streaks** on the Week header: current run of consecutive complete weeks, and consecutive weekday treadmill mornings. Two small numbers, no fireworks.
8. **Navigation**: bottom tabs become Week, Strength, Trends, Settings. Four, not five.
9. Tests: primitives have component tests; the Week page has a test for today-expanded behaviour and for the next-day prompt timing; the Playwright flow is updated to start on Week.

## Do not

- Change the api or schema except adding `kit_ready` to check-in habits.
- Touch the strength session screen beyond making it use the new primitives where trivial; stage 14 rebuilds it.
- Add animations beyond Sheet open and close.

## Acceptance

- `/dev/ui` shows every primitive in dark and light. Screenshot both.
- Open the app on a phone: Week loads, today is expanded, logging a vest walk takes two taps from cold (Start then Finish, or Log then Save). Count the taps in the PR.
- Check-in completed with no Save button; reload shows it persisted.
- Next-day prompt appears after 20:00 (fake the clock in a test) and the tick persists.
- Lighthouse mobile accessibility and performance both 90 or above on Week.
- Bundle for the initial route under 250 kB gzipped.
