import type { Habit } from '@ots/shared';
import { Button } from '../ui/index.js';

interface Props {
  prompts: Habit[];
  onDone: (key: string) => void;
  onDismiss: (key: string) => void;
}

/** One-line nudges for habits not yet ticked today. Which ones show is decided by activePrompts. */
export function PromptsStrip({ prompts, onDone, onDismiss }: Props) {
  if (prompts.length === 0) return null;
  return (
    <section aria-label="Prompts" className="prompts">
      {prompts.map((h) => (
        <div key={h.key} className="prompt">
          <span className="grow prompt-text">{h.prompt_text}</span>
          <Button variant="primary" aria-label={`Done: ${h.label}`} onClick={() => onDone(h.key)}>
            Done
          </Button>
          <Button
            variant="ghost"
            aria-label={`Not today: ${h.label}`}
            onClick={() => onDismiss(h.key)}
          >
            Not today
          </Button>
        </div>
      ))}
    </section>
  );
}
