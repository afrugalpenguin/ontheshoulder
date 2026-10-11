import { useState } from 'react';
import { COLOUR, SPACE, TEXT, type Theme } from '../theme.js';
import {
  Button,
  ButtonLink,
  Card,
  Chip,
  Segmented,
  Sheet,
  Stepper,
  scale,
  useToast,
} from '../ui/index.js';

const THEMES: Theme[] = ['dark', 'light'];
const SCORES = scale(1, 5);
const RANGES = [
  { value: '4w', label: '4 weeks' },
  { value: '12w', label: '12 weeks' },
  { value: 'all', label: 'All' },
];

/** Every primitive once, in one theme. */
function Primitives({ theme }: { theme: Theme }) {
  const toast = useToast();
  const [score, setScore] = useState<number | null>(3);
  const [range, setRange] = useState<string | null>('12w');
  const [weight, setWeight] = useState<number | null>(70);
  const [minutes, setMinutes] = useState<number | null>(null);
  const [picked, setPicked] = useState(true);
  const [sheet, setSheet] = useState(false);

  return (
    <div className="demo-theme" data-theme={theme}>
      <h2>{theme}</h2>

      <Card title="Button">
        <div className="row wrap">
          <Button variant="primary">Primary</Button>
          <Button>Secondary</Button>
          <Button variant="ghost">Ghost</Button>
          <Button variant="danger">Danger</Button>
        </div>
        <div className="row wrap">
          <Button variant="primary" loading>
            Loading
          </Button>
          <Button disabled>Disabled</Button>
          <ButtonLink to="/dev/ui">Link</ButtonLink>
        </div>
      </Card>

      <Card title="Card">
        <p>A surface with a border and a title.</p>
        <p className="muted small">Muted small text sits under it.</p>
      </Card>

      <Card title="Segmented">
        <Segmented
          label="Score"
          options={SCORES}
          value={score}
          onChange={setScore}
          ends={['low', 'high']}
        />
        <Segmented label="Range" options={RANGES} value={range} onChange={setRange} clearable />
      </Card>

      <Card title="Stepper">
        <Stepper
          label="Weight"
          unit="kg"
          value={weight}
          onChange={setWeight}
          step={0.1}
          min={20}
          max={400}
        />
        <Stepper
          label="Minutes"
          value={minutes}
          onChange={setMinutes}
          step={5}
          min={0}
          start={30}
          clearable
        />
      </Card>

      <Card title="Chip">
        <div className="chips">
          <Chip>Planned</Chip>
          <Chip tone="success">Done</Chip>
          <Chip tone="warning">Skipped</Chip>
          <Chip tone="accent">Event</Chip>
        </div>
        <div className="chips">
          <Chip selected={picked} onClick={() => setPicked(!picked)}>
            Toggle
          </Chip>
          <Chip onClick={() => toast('Chip tapped')}>Action</Chip>
        </div>
      </Card>

      <Card title="Sheet and Toast">
        <div className="row wrap">
          <Button onClick={() => setSheet(true)}>Open sheet</Button>
          <Button onClick={() => toast('Saved', { label: 'Undo', onClick: () => undefined })}>
            Show toast
          </Button>
        </div>
      </Card>
      <Sheet open={sheet} title="A sheet" onClose={() => setSheet(false)}>
        <p>Bottom sheet on a phone, a dialog on a desktop.</p>
        <Button variant="primary" onClick={() => setSheet(false)}>
          Save
        </Button>
      </Sheet>

      <Card title="Tokens">
        <div className="row wrap">
          {Object.entries(COLOUR).map(([name, value]) => (
            <div key={name} className="stack small">
              <div className="demo-swatch" style={{ background: value }} />
              {name}
            </div>
          ))}
        </div>
        {Object.entries(SPACE).map(([name, value]) => (
          <div key={name} className="row small">
            <span>space {name}</span>
            <div className="demo-space" style={{ width: value }} />
          </div>
        ))}
        {Object.entries(TEXT).map(([name, value]) => (
          <p key={name} style={{ fontSize: value, lineHeight: 1.1 }}>
            {name === 'display' ? '59:59' : `Text ${name}`}
          </p>
        ))}
      </Card>
    </div>
  );
}

/** Development-only page showing every primitive in dark and in light, side by side. */
export function UiDemo() {
  return (
    <main className="wide">
      <header className="page-head">
        <h1>Components</h1>
      </header>
      <div className="demo-themes">
        {THEMES.map((theme) => (
          <Primitives key={theme} theme={theme} />
        ))}
      </div>
    </main>
  );
}
