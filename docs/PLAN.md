# Starter template: 100-mile rebuild, Block 1

This is the first starter template that ships with the app, written as prose. The seed in `apps/api/src/seed/templates/rebuild-100.ts` is the source of truth; if they disagree, fix this file.

Who it is for: a returning runner with a weekday treadmill slot, a long ride and a swim already in the week, home strength kit, and a flat 100-mile event roughly 48 weeks out. Block 1 is ten weeks.

## Principles

1. Consistency is the only metric. A complete week is the midweek run, both strength sessions, and four of five treadmill mornings.
2. Sunday is optional. Done is a bonus. Missed is normal. It never fails the week.
3. Progression is on the calendar. The user judges whether to follow it and edits the week when not.
4. Saturday is empty and Friday is light so Sunday has a chance.
5. Swim and ride hold at current levels. They shrink from Block 3.
6. Strength is two sessions, one heavy 5x5 lift each plus running-specific work. Loads are calculated and snapped to the kit you own; you never work it out.

## The week

| Day | Treadmill slot (weekday, about 60 min) | Main session |
|---|---|---|
| Mon | Vest walk, 60 min | Turbo long ride, conversational |
| Tue | Prehab 8 min, then midweek run inside the slot (slot stretches to 90 min; movable to any weekday) | none |
| Wed | Vest walk, 60 min | Strength A |
| Thu | Vest walk, 60 min | Coached swim |
| Fri | Prehab 8 min, then walk 50 min, no vest | Strength B |
| Sat | none | none (family) |
| Sun | none | Long run, early, optional |

## Run progression

Week 1, both runs: 5 min walk warm-up, repeats of 2 min run / 1 min walk, 5 min walk cool-down.

- Midweek: 8 repeats, run block starts at 2 min, walk block 1 min throughout. Add 30 seconds to the run block each week. The week the run block would reach 5 min (week 7) becomes the first continuous run, 25 min; then add 5 min a week to a cap of 45.
- Sunday: 2 min run / 1 min walk blocks for the whole block, never lengthened. Start 10 repeats (30 min) plus warm-up and cool-down. Add 3 repeats a week (9 min) to a cap of 30 repeats (90 min).

Endpoint at week 10 if followed: 40 min continuous midweek; Sunday at 28 repeats (84 min) in week 7 and capped at 30 repeats from week 8.

The watch records the runs. Log them in the app afterwards; the form is pre-filled from the plan and you adjust what actually happened.

## Prehab (8 minutes, Tuesday and Friday)

| Exercise | Dose |
|---|---|
| Single-leg balance, eyes open then closed | 30 s each, both legs |
| Slow calf raises off a step, two up one down | 3 x 12 each leg |
| Edge walking, outside then inside edges | 20 m each |
| Toe spreads and towel scrunches | 2 min |
| Ankle circles and alphabet | 1 min each |

Logged as a habit tick, not a session.

## Strength

Two sessions. One main lift per session on a linear 5x5: add 2.5kg every session it is completed, hold once on a fail, deload 10 per cent on a second fail. Everything else on double progression. All loads snapped to achievable combinations from the equipment settings.

Bias for a flat 100-miler: calves, hips, single-leg endurance, carries. Not a lot of heavy eccentric work, because there are no descents to prepare for.

### Strength A (Wednesday, about 40 min)

| Slot | Exercise | Sets x reps | Rule | Rest |
|---|---|---|---|---|
| 1 | Back squat | 5 x 5 | linear +2.5kg | 150 s |
| 2 | Romanian deadlift | 3 x 8 | double +2.5kg | 90 s |
| 3 | Reverse lunge | 3 x 8 each | double, next dumbbell pair | 75 s |
| 4 | Standing calf raise in rack | 3 x 12 | double +2.5kg | 60 s |
| 5 | Suitcase carry | 3 x 30 m each | fixed, heaviest kettlebell | 60 s |
| 6 | Dead bug | 3 x 45 s | bodyweight | 45 s |

### Strength B (Friday, about 35 min)

| Slot | Exercise | Sets x reps | Rule | Rest |
|---|---|---|---|---|
| 1 | Deadlift | 5 x 5 | linear +2.5kg | 150 s |
| 2 | Bulgarian split squat | 3 x 8 each | double, next dumbbell pair | 90 s |
| 3 | Single-leg Romanian deadlift | 3 x 8 each | double, next kettlebell | 75 s |
| 4 | Step-up, knee height | 3 x 10 each | double, next dumbbell pair | 75 s |
| 5 | Kettlebell swing | 3 x 15 | fixed, 15kg or nearest owned | 60 s |
| 6 | Seated calf raise, plate on knees | 3 x 15 | double +5kg | 60 s |

Starting loads are entered at setup (or left blank and set on the first session). If a slot's equipment is not owned, the app offers a same-pattern substitute from the library using kit that is.

## Later blocks (outline only)

Offsets are from the start of Block 1. Blocks 3 and 4 are intended to end at B events (a 50k and a 50-miler) entered in Settings; the week numbers are placeholders until those are chosen.

- Block 2, weeks 11 to 18: third short run midweek, Sunday to 2 hours, low-stack shoes reintroduced for strides then one short run
- Block 3, weeks 19 to 28: Sunday to 3 hours, a 50k event, swim and ride to maintenance
- Block 4, weeks 29 to 40: back-to-back long weekend runs, a 50-mile event, vest walks become power-hike practice
- Block 5, weeks 41 to 48: event-specific prep for a long flat course with a night section, then taper
