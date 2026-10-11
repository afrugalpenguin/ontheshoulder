import { weekdayOf, type Checkin, type CheckinInput, type Habit } from '@ots/shared';
import { KIT_READY } from '../lib/kit.js';
import { Button, Card, Chip, Segmented, Stepper, scale } from '../ui/index.js';

interface Props {
  checkin: Checkin;
  habits: Habit[];
  /** Most recent weight, used as the starting point for the stepper. */
  lastWeight: number | null;
  /** Called with just what changed, every time something changes. There is no Save. */
  onSave: (changes: CheckinInput) => void;
}

const SLEEP = scale(1, 5);
const ANKLE = scale(0, 5);

/** The day's check-in on one card: sleep, energy, weight, habits, and a small ankle row. */
export function CheckinCard({ checkin, habits, lastWeight, onSave }: Props) {
  const isSunday = weekdayOf(checkin.date) === 7;
  const unsavedWeight = checkin.weight_kg === null && lastWeight !== null;

  return (
    <Card title="Check-in">
      <Segmented
        label="Sleep"
        options={SLEEP}
        value={checkin.sleep_quality}
        onChange={(v) => onSave({ sleep_quality: v })}
        ends={['poor', 'great']}
      />
      <Segmented
        label="Energy"
        options={SLEEP}
        value={checkin.energy}
        onChange={(v) => onSave({ energy: v })}
        ends={['flat', 'full']}
      />
      <Stepper
        label="Weight"
        unit="kg"
        value={checkin.weight_kg ?? lastWeight}
        onChange={(v) => onSave({ weight_kg: v })}
        step={0.1}
        min={20}
        max={400}
        start={70}
        clearable
      />
      {unsavedWeight && (
        <div className="row">
          <p className="muted small grow">Last weight shown. Not recorded for today yet.</p>
          <Button onClick={() => onSave({ weight_kg: lastWeight })}>Same today</Button>
        </div>
      )}
      <div className="chips" role="group" aria-label="Habits">
        {habits
          .filter((h) => h.enabled && h.key !== KIT_READY)
          .map((h) => {
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
      <Segmented
        className="small"
        label="Ankle"
        options={ANKLE}
        value={checkin.ankle_score}
        onChange={(v) => onSave({ ankle_score: v })}
        ends={['fine', 'sore']}
        clearable
      />
    </Card>
  );
}
