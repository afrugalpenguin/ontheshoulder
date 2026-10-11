import type { Equipment } from '@ots/shared';
import { cleanup, render, screen, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { useState } from 'react';
import { afterEach, describe, expect, it } from 'vitest';
import { EquipmentEditor, NO_EQUIPMENT, loadSummary } from './EquipmentEditor.js';

afterEach(cleanup);

/** Renders the editor with real state and exposes the latest value. */
function setup(initial: Equipment = NO_EQUIPMENT) {
  const latest: { value: Equipment } = { value: initial };
  function Harness() {
    const [value, setValue] = useState(initial);
    latest.value = value;
    return <EquipmentEditor value={value} onChange={setValue} />;
  }
  render(<Harness />);
  return { latest, user: userEvent.setup() };
}

const preview = () => within(screen.getByRole('region', { name: 'Loads you can make' }));

describe('EquipmentEditor', () => {
  it('starts with every section at none', () => {
    setup();
    expect(screen.getByRole('checkbox', { name: 'I have a barbell' })).toHaveProperty(
      'checked',
      false,
    );
    expect(screen.getByRole('checkbox', { name: 'I have a vest' })).toHaveProperty(
      'checked',
      false,
    );
    expect(screen.getByText('No plates.')).toBeTruthy();
    expect(screen.getByText('No dumbbells.')).toBeTruthy();
    expect(screen.getByText('No kettlebells.')).toBeTruthy();
    expect(screen.queryByLabelText('Bar weight (kg)')).toBeNull();
    expect(preview().getAllByText('none')).toHaveLength(3);
  });

  it('quick-adds the standard plate set and previews the achievable loads', async () => {
    const { latest, user } = setup();
    await user.click(screen.getByRole('checkbox', { name: 'I have a barbell' }));
    expect(preview().getAllByText('20kg').length).toBeGreaterThan(0);

    await user.click(screen.getByRole('button', { name: 'Add standard set' }));
    expect(latest.value.bar_kg).toBe(20);
    expect(latest.value.plates).toEqual([
      { kg: 20, count: 1 },
      { kg: 10, count: 1 },
      { kg: 5, count: 1 },
      { kg: 2.5, count: 1 },
      { kg: 1.25, count: 1 },
    ]);
    expect(preview().getByText('32 loads, 20 to 97.5kg')).toBeTruthy();
  });

  it('adds and removes single pairs, and does not duplicate the standard set', async () => {
    const { latest, user } = setup({ ...NO_EQUIPMENT, bar_kg: 20, plates: [{ kg: 20, count: 1 }] });
    await user.click(screen.getByRole('button', { name: 'Add a pair of 20kg plates' }));
    expect(latest.value.plates).toEqual([{ kg: 20, count: 2 }]);
    expect(screen.getByText('20kg x 2 pairs')).toBeTruthy();

    await user.click(screen.getByRole('button', { name: 'Add standard set' }));
    expect(latest.value.plates.find((p) => p.kg === 20)?.count).toBe(2);
    expect(latest.value.plates).toHaveLength(5);

    await user.click(screen.getByRole('button', { name: 'One pair of 20kg fewer' }));
    await user.click(screen.getByRole('button', { name: 'One pair of 20kg fewer' }));
    expect(latest.value.plates.some((p) => p.kg === 20)).toBe(false);
  });

  it('sets plates, dumbbells and kettlebells back to none', async () => {
    const { latest, user } = setup({
      bar_kg: 20,
      plates: [{ kg: 10, count: 1 }],
      dumbbells: [10, 15],
      kettlebells: [16],
      vest_kg: 20,
    });
    expect(screen.getByText('Owned: 10kg, 15kg')).toBeTruthy();
    await user.click(screen.getByRole('button', { name: 'No plates' }));
    await user.click(screen.getByRole('button', { name: 'No dumbbells' }));
    await user.click(screen.getByRole('button', { name: 'No kettlebells' }));
    await user.click(screen.getByRole('checkbox', { name: 'I have a barbell' }));
    await user.click(screen.getByRole('checkbox', { name: 'I have a vest' }));
    expect(latest.value).toEqual(NO_EQUIPMENT);
  });

  it('toggles dumbbell pairs and accepts a custom weight', async () => {
    const { latest, user } = setup();
    await user.click(screen.getByRole('button', { name: '10kg dumbbells' }));
    await user.click(screen.getByRole('button', { name: '15kg dumbbells' }));
    await user.click(screen.getByRole('button', { name: '10kg dumbbells' }));
    expect(latest.value.dumbbells).toEqual([15]);

    await user.type(screen.getByLabelText('Other dumbbells weight in kg'), '13.5');
    const section = screen.getByRole('group', { name: 'Dumbbells (pairs)' });
    await user.click(within(section).getByRole('button', { name: 'Add' }));
    expect(latest.value.dumbbells).toEqual([15, 13.5]);
    expect(preview().getByText('2 loads, 13.5 to 15kg')).toBeTruthy();
  });

  it('edits the bar and vest weights, keeping decimals while typing', async () => {
    const { latest, user } = setup({ ...NO_EQUIPMENT, bar_kg: 20, vest_kg: 20 });
    const bar = screen.getByLabelText('Bar weight (kg)');
    await user.clear(bar);
    await user.type(bar, '17.5');
    expect(latest.value.bar_kg).toBe(17.5);
    const vest = screen.getByLabelText('Vest weight (kg)');
    await user.clear(vest);
    await user.type(vest, '12');
    expect(latest.value.vest_kg).toBe(12);
  });
});

describe('loadSummary', () => {
  it('describes none, one and many loads', () => {
    expect(loadSummary(NO_EQUIPMENT, 'barbell')).toBe('none');
    expect(loadSummary({ ...NO_EQUIPMENT, kettlebells: [16] }, 'kettlebell')).toBe('16kg');
    expect(loadSummary({ ...NO_EQUIPMENT, dumbbells: [10, 20, 15] }, 'dumbbell')).toBe(
      '3 loads, 10 to 20kg',
    );
  });
});
