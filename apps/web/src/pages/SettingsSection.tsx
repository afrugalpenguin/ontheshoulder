import { useState, type ReactNode } from 'react';

const KEY = 'ots.settings.open';

function readOpen(): string[] {
  try {
    const saved: unknown = JSON.parse(localStorage.getItem(KEY) ?? '[]');
    return Array.isArray(saved) ? saved.filter((id): id is string => typeof id === 'string') : [];
  } catch {
    return [];
  }
}

function writeOpen(id: string, open: boolean): void {
  try {
    const others = readOpen().filter((other) => other !== id);
    localStorage.setItem(KEY, JSON.stringify(open ? [...others, id] : others));
  } catch {
    // Private browsing: the section still opens, it is just not remembered.
  }
}

interface Props {
  /** Stable name the open state is remembered under. */
  id: string;
  title: string;
  children: ReactNode;
}

/**
 * One section of Settings: a card that opens and closes on its title, and
 * remembers which way it was left. Closed, its contents are not drawn at all.
 */
export function SettingsSection({ id, title, children }: Props) {
  const [open, setOpen] = useState(() => readOpen().includes(id));
  const toggle = () => {
    writeOpen(id, !open);
    setOpen(!open);
  };
  return (
    <section className="card settings-section" aria-label={title}>
      <h2>
        <button
          type="button"
          className="section-toggle"
          aria-expanded={open}
          aria-controls={`settings-${id}`}
          onClick={toggle}
        >
          <span className="grow">{title}</span>
          <span className="muted small" aria-hidden="true">
            {open ? 'Hide' : 'Show'}
          </span>
        </button>
      </h2>
      {open && (
        <div className="stack" id={`settings-${id}`}>
          {children}
        </div>
      )}
    </section>
  );
}
