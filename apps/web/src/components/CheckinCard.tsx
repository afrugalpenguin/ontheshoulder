import { weekdayOf, type Checkin, type CheckinInput, type Habit } from '@ots/shared';
import { useEffect, useRef, useState } from 'react';
import { answerLabel, habitsFor, isTwoAnswer } from '../lib/habits.js';
import { Button, Card, Chip, Segmented, Stepper } from '../ui/index.js';

interface Props {
  checkin: Checkin;
  habits: Habit[];
  /** Most recent weight, used as the starting point for the stepper. */
  lastWeight: number | null;
  /** Called with just what changed, every time something changes. There is no Save. */
  onSave: (changes: CheckinInput) => void;
}

/** How long after the last change the card folds to one line. */
export const COLLAPSE_AFTER_MS = 2500;

const ANSWERS = [
  { value: 'yes', label: '' },
  { value: 'no', label: '' },
] as const;

/**
 * The day's check-in: weight, any two-answer habit asked today, and the habit
 * chips. Only habits asked on this weekday are shown. Once a weight is saved
 * and every two-answer habit has its answer, the card folds to one line saying
 * what is recorded; a tap opens it again and it then stays open.
 */
export function CheckinCard({ checkin, habits, lastWeight, onSave }: Props) {
  const isSunday = weekdayOf(checkin.date) === 7;
  const weight = checkin.weight_kg;
  const shown = habitsFor(habits, checkin.date);
  const choices = shown.filter(isTwoAnswer);
  const ticks = shown.filter((h) => !isTwoAnswer(h));
  const answered = choices.filter((h) => checkin.habits[h.key] !== undefined).length;
  const complete = weight !== null && answered === choices.length;

  const [open, setOpen] = useState(!complete);
  const openedByHand = useRef(false);

  // Plus and minus save on every tap, so the fold waits for the taps to stop.
  useEffect(() => {
    if (!complete || openedByHand.current) return;
    const timer = setTimeout(() => setOpen(false), COLLAPSE_AFTER_MS);
    return () => clearTimeout(timer);
  }, [complete, weight, answered]);

  if (!open && weight !== null) {
    const recorded = [
      ...choices.map((h) => answerLabel(h, checkin)).filter((label) => label !== null),
      ...ticks.filter((h) => checkin.habits[h.key] === true).map((h) => h.label),
    ];
    if (isSunday && checkin.sunday_got_up === true) recorded.push('Got up for it');
    return (
      <section aria-label="Check-in">
        <button
          type="button"
          className="checkin-line"
          aria-expanded={false}
          onClick={() => {
            openedByHand.current = true;
            setOpen(true);
          }}
        >
          {[`${weight.toFixed(1)} kg`, ...recorded.map((label) => label.toLowerCase())].join(' · ')}
        </button>
      </section>
    );
  }

  return (
    <Card title="Check-in">
      <Stepper
        label="Weight"
        unit="kg"
        value={weight ?? lastWeight}
        onChange={(v) => onSave({ weight_kg: v })}
        step={0.1}
        min={20}
        max={400}
        start={70}
        clearable
      />
      {weight === null && lastWeight !== null && (
        <div className="row">
          <p className="muted small grow">Last weight shown. Not recorded for today yet.</p>
          <Button
            onClick={() => {
              onSave({ weight_kg: lastWeight });
              if (answered === choices.length) setOpen(false);
            }}
          >
            Same today
          </Button>
        </div>
      )}
      <div className="chips" role="group" aria-label="Habits">
        {ticks.map((h) => {
          const ticked = checkin.habits[h.key] === true;
          return (
            <Chip
              key={h.key}
              selected={ticked}
              onClick={() => onSave({ habits: { [h.key]: !ticked } })}
            >
              {h.label}
            </Chip>
          );
        })}
        {isSunday && (
          <Chip
            selected={checkin.sunday_got_up === true}
            onClick={() => onSave({ sunday_got_up: checkin.sunday_got_up !== true })}
          >
            Got up for it
          </Chip>
        )}
      </div>
      {/* Two plain buttons, the same until one is chosen: a record, not a score. */}
      {choices.map((h) => {
        const answer = checkin.habits[h.key];
        return (
          <Segmented
            key={h.key}
            label={h.label}
            options={ANSWERS.map((a, i) => ({ ...a, label: h.answer_labels[i] as string }))}
            value={answer === undefined ? null : answer ? 'yes' : 'no'}
            onChange={(v) => {
              if (v !== null) onSave({ habits: { [h.key]: v === 'yes' } });
            }}
          />
        );
      })}
    </Card>
  );
}
