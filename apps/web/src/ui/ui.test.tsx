import { act, cleanup, fireEvent, render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { useState } from 'react';
import { MemoryRouter } from 'react-router';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { Button, ButtonLink } from './Button.js';
import { Card } from './Card.js';
import { Chip } from './Chip.js';
import { Segmented, scale } from './Segmented.js';
import { SHEET_CLOSE_MS, Sheet } from './Sheet.js';
import { Stepper } from './Stepper.js';
import { TOAST_MS, ToastProvider, useToast } from './Toast.js';

afterEach(() => {
  cleanup();
  vi.useRealTimers();
});

describe('Button', () => {
  it('is a plain button by default and takes a variant', () => {
    render(
      <>
        <Button>Plain</Button>
        <Button variant="primary">Go</Button>
        <Button variant="ghost">Later</Button>
        <Button variant="danger">Delete</Button>
      </>,
    );
    const plain = screen.getByRole('button', { name: 'Plain' });
    expect(plain.getAttribute('type')).toBe('button');
    expect(plain.className).toBe('');
    expect(screen.getByRole('button', { name: 'Go' }).className).toBe('primary');
    expect(screen.getByRole('button', { name: 'Later' }).className).toBe('quiet');
    expect(screen.getByRole('button', { name: 'Delete' }).className).toBe('danger');
  });

  it('cannot be tapped while loading', async () => {
    const onClick = vi.fn();
    render(
      <Button loading onClick={onClick}>
        Save
      </Button>,
    );
    const button = screen.getByRole('button', { name: 'Save' }) as HTMLButtonElement;
    expect(button.disabled).toBe(true);
    expect(button.getAttribute('aria-busy')).toBe('true');
    await userEvent.setup().click(button);
    expect(onClick).not.toHaveBeenCalled();
  });

  it('as a link goes somewhere and looks like a button', () => {
    render(
      <MemoryRouter>
        <ButtonLink to="/timer/7" variant="primary">
          Start
        </ButtonLink>
      </MemoryRouter>,
    );
    const link = screen.getByRole('link', { name: 'Start' });
    expect(link.getAttribute('href')).toBe('/timer/7');
    expect(link.className).toBe('button primary');
  });
});

describe('Card', () => {
  it('is a region named by its title', () => {
    render(
      <Card title="Check-in">
        <p>inside</p>
      </Card>,
    );
    const card = screen.getByRole('region', { name: 'Check-in' });
    expect(card.textContent).toContain('inside');
    expect(screen.getByRole('heading', { name: 'Check-in' })).toBeTruthy();
  });
});

describe('Chip', () => {
  it('is a label without onClick and carries its tone', () => {
    render(<Chip tone="success">Done</Chip>);
    const chip = screen.getByText('Done');
    expect(chip.tagName).toBe('SPAN');
    expect(chip.className).toBe('chip tone-success');
  });

  it('toggles as a pressed button', async () => {
    const onClick = vi.fn();
    render(
      <Chip selected onClick={onClick}>
        Alcohol free
      </Chip>,
    );
    const chip = screen.getByRole('button', { name: 'Alcohol free' });
    expect(chip.getAttribute('aria-pressed')).toBe('true');
    await userEvent.setup().click(chip);
    expect(onClick).toHaveBeenCalledTimes(1);
  });
});

describe('Segmented', () => {
  it('reports the option tapped and marks the current one', async () => {
    const onChange = vi.fn();
    render(<Segmented label="Sleep" options={scale(1, 5)} value={2} onChange={onChange} />);
    expect(screen.getAllByRole('radio')).toHaveLength(5);
    expect(screen.getByRole('radio', { name: 'Sleep 2' }).getAttribute('aria-checked')).toBe(
      'true',
    );
    await userEvent.setup().click(screen.getByRole('radio', { name: 'Sleep 4' }));
    expect(onChange).toHaveBeenCalledWith(4);
  });

  it('clears on a second tap only when clearable', async () => {
    const onChange = vi.fn();
    const user = userEvent.setup();
    const { rerender } = render(
      <Segmented label="Ankle" options={scale(0, 5)} value={0} onChange={onChange} />,
    );
    await user.click(screen.getByRole('radio', { name: 'Ankle 0' }));
    expect(onChange).toHaveBeenLastCalledWith(0);
    rerender(
      <Segmented label="Ankle" options={scale(0, 5)} value={0} onChange={onChange} clearable />,
    );
    await user.click(screen.getByRole('radio', { name: 'Ankle 0' }));
    expect(onChange).toHaveBeenLastCalledWith(null);
  });

  it('takes text options for a range', async () => {
    const onChange = vi.fn();
    const options = [
      { value: '4w', label: '4 weeks' },
      { value: 'all', label: 'All' },
    ];
    render(<Segmented label="Range" options={options} value="4w" onChange={onChange} />);
    await userEvent.setup().click(screen.getByRole('radio', { name: 'Range All' }));
    expect(onChange).toHaveBeenCalledWith('all');
  });
});

describe('Stepper', () => {
  function Weight({ initial, onChange }: { initial: number | null; onChange: () => void }) {
    const [value, setValue] = useState(initial);
    return (
      <Stepper
        label="Weight"
        value={value}
        step={0.1}
        min={20}
        max={400}
        start={70}
        clearable
        onChange={(v) => {
          setValue(v);
          onChange();
        }}
      />
    );
  }
  const field = () => screen.getByRole('textbox', { name: 'Weight' }) as HTMLInputElement;

  it('steps by 0.1 without floating point drift', async () => {
    const user = userEvent.setup();
    render(<Weight initial={70.1} onChange={vi.fn()} />);
    expect(field().value).toBe('70.1');
    await user.click(screen.getByRole('button', { name: 'Increase Weight' }));
    await user.click(screen.getByRole('button', { name: 'Increase Weight' }));
    expect(field().value).toBe('70.3');
    await user.click(screen.getByRole('button', { name: 'Decrease Weight' }));
    expect(field().value).toBe('70.2');
  });

  it('starts from the start value when empty, and stays inside its limits', async () => {
    const user = userEvent.setup();
    render(<Weight initial={null} onChange={vi.fn()} />);
    expect(field().value).toBe('');
    await user.click(screen.getByRole('button', { name: 'Increase Weight' }));
    expect(field().value).toBe('70.0');
    await user.clear(field());
    await user.type(field(), '999{Enter}');
    expect(field().value).toBe('400.0');
  });

  it('reports a typed value only when the field is left', async () => {
    const onChange = vi.fn();
    const user = userEvent.setup();
    render(<Weight initial={70} onChange={onChange} />);
    await user.clear(field());
    await user.type(field(), '71,5');
    expect(onChange).not.toHaveBeenCalled();
    await user.tab();
    expect(onChange).toHaveBeenCalledTimes(1);
    expect(field().value).toBe('71.5');
  });

  it('puts back the old value when what was typed is not a number', async () => {
    const onChange = vi.fn();
    const user = userEvent.setup();
    render(<Weight initial={70} onChange={onChange} />);
    await user.clear(field());
    await user.type(field(), 'abc');
    await user.tab();
    expect(field().value).toBe('70.0');
    expect(onChange).not.toHaveBeenCalled();
  });
});

describe('Sheet', () => {
  it('shows nothing while closed and a named dialog while open', () => {
    const { rerender } = render(
      <Sheet open={false} title="Why skip?" onClose={vi.fn()}>
        <p>reasons</p>
      </Sheet>,
    );
    expect(screen.queryByRole('dialog')).toBeNull();
    rerender(
      <Sheet open title="Why skip?" onClose={vi.fn()}>
        <p>reasons</p>
      </Sheet>,
    );
    const dialog = screen.getByRole('dialog', { name: 'Why skip?' });
    expect(dialog.getAttribute('aria-modal')).toBe('true');
    expect(dialog.textContent).toContain('reasons');
    expect(document.activeElement).toBe(dialog);
  });

  it('closes on Escape, on Close and on a tap outside, but not on a tap inside', async () => {
    const onClose = vi.fn();
    const user = userEvent.setup();
    render(
      <Sheet open title="Log" onClose={onClose}>
        <p>inside</p>
      </Sheet>,
    );
    await user.click(screen.getByText('inside'));
    expect(onClose).not.toHaveBeenCalled();
    await user.keyboard('{Escape}');
    expect(onClose).toHaveBeenCalledTimes(1);
    await user.click(screen.getByRole('button', { name: 'Close' }));
    expect(onClose).toHaveBeenCalledTimes(2);
    fireEvent.click(document.querySelector('.sheet-scrim') as Element);
    expect(onClose).toHaveBeenCalledTimes(3);
  });

  it('is removed once the closing slide has played', () => {
    vi.useFakeTimers();
    const { rerender } = render(
      <Sheet open title="Log" onClose={vi.fn()}>
        <p>inside</p>
      </Sheet>,
    );
    rerender(
      <Sheet open={false} title="Log" onClose={vi.fn()}>
        <p>inside</p>
      </Sheet>,
    );
    expect(document.querySelector('.sheet.is-closing')).not.toBeNull();
    act(() => void vi.advanceTimersByTime(SHEET_CLOSE_MS));
    expect(document.querySelector('.sheet')).toBeNull();
  });
});

describe('Toast', () => {
  function Demo({ onUndo }: { onUndo: () => void }) {
    const toast = useToast();
    return <Button onClick={() => toast('Saved', { label: 'Undo', onClick: onUndo })}>Save</Button>;
  }

  it('shows a message with its action, then goes away on its own', () => {
    vi.useFakeTimers();
    const onUndo = vi.fn();
    render(
      <ToastProvider>
        <Demo onUndo={onUndo} />
      </ToastProvider>,
    );
    fireEvent.click(screen.getByRole('button', { name: 'Save' }));
    expect(screen.getByRole('status').textContent).toContain('Saved');
    act(() => void vi.advanceTimersByTime(TOAST_MS));
    expect(screen.queryByRole('status')).toBeNull();

    fireEvent.click(screen.getByRole('button', { name: 'Save' }));
    fireEvent.click(screen.getByRole('button', { name: 'Undo' }));
    expect(onUndo).toHaveBeenCalledTimes(1);
    expect(screen.queryByRole('status')).toBeNull();
  });

  it('does nothing outside a provider', () => {
    render(<Demo onUndo={vi.fn()} />);
    fireEvent.click(screen.getByRole('button', { name: 'Save' }));
    expect(screen.queryByText('Saved')).toBeNull();
  });
});
