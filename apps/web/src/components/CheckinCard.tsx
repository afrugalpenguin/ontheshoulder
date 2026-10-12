import { weekdayOf, type Checkin, type CheckinInput, type Habit } from '@ots/shared';
import { useEffect, useRef, useState } from 'react';
import { KIT_READY } from '../lib/kit.js';
import { Button, Card, Chip, Stepper } from '../ui/index.js';

interface Props {
  checkin: Checkin;
  habits: Habit[];
  /** Most recent weight, used as the starting point for the stepper. */
  lastWeight: number | null;
  /** Called with just what changed, every time something changes. There is no Save. */
  onSave: (changes: CheckinInput) => void;
}

/** How long after the last change to the weight the card folds to one line. */
export const COLLAPSE_AFTER_MS = 2500;

/**
 * The day's check-in: weight and the habit chips. Once a weight is saved for
 * the day the card folds to one line saying what is recorded; a tap opens it
 * again and it then stays open.
 */
export function CheckinCard({ checkin, habits, lastWeight, onSave }: Props) {
  const isSunday = weekdayOf(checkin.date) === 7;
  const weight = checkin.weight_kg;
  const [open, setOpen] = useState(weight === null);
  const openedByHand = useRef(false);

  // Plus and minus save on every tap, so the fold waits for the taps to stop.
  useEffect(() => {
    if (weight === null || openedByHand.current) return;
    const timer = setTimeout(() => setOpen(false), COLLAPSE_AFTER_MS);
    return () => clearTimeout(timer);
  }, [weight]);

  const shown = habits.filter((h) => h.enabled && h.key !== KIT_READY);

  if (!open && weight !== null) {
    const ticked = shown.filter((h) => checkin.habits[h.key] === true).map((h) => h.label);
    if (isSunday && checkin.sunday_got_up === true) ticked.push('Got up for it');
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
          {[`${weight.toFixed(1)} kg`, ...ticked.map((label) => label.toLowerCase())].join(' · ')}
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
              setOpen(false);
            }}
          >
            Same today
          </Button>
        </div>
      )}
      <div className="chips" role="group" aria-label="Habits">
        {shown.map((h) => {
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
    </Card>
  );
}
