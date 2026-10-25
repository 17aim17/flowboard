import type { FieldDefinition, FieldType } from '@flowboard/contracts';
import { screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { useState } from 'react';
import { describe, expect, it } from 'vitest';
import { renderWithMantine } from '../test/render.tsx';
import { CustomFieldInput } from './CustomFieldInput.tsx';

const field = (type: FieldType, extra: Partial<FieldDefinition> = {}): FieldDefinition => ({
  id: '01a16a09-0000-7000-8000-000000000001',
  key: 'f',
  name: 'Field',
  type,
  required: false,
  options: [
    { id: 'low', label: 'Low' },
    { id: 'high', label: 'High' },
  ],
  ownerType: 'list',
  ownerId: '01a16a09-0000-7000-8000-000000000002',
  position: 'a0',
  ...extra,
});

/** Renders the input as the drawer does (controlled) and records every value it reports. */
function setup(definition: FieldDefinition, initial: unknown = null, error?: string) {
  const reported: unknown[] = [];
  function Harness() {
    const [value, setValue] = useState(initial);
    return (
      <CustomFieldInput
        field={definition}
        value={value}
        error={error}
        onChange={(next) => {
          reported.push(next);
          setValue(next);
        }}
      />
    );
  }
  renderWithMantine(<Harness />);
  return { reported, user: userEvent.setup() };
}

describe('CustomFieldInput', () => {
  it('text: reports the string, and null when emptied', async () => {
    const { reported, user } = setup(field('text'));
    const input = screen.getByRole('textbox', { name: 'Field' });
    await user.type(input, 'ab');
    await user.clear(input);
    expect(reported).toEqual(['a', 'ab', null]);
  });

  it('number: reports a number, not a string', async () => {
    const { reported, user } = setup(field('number'));
    await user.type(screen.getByRole('textbox', { name: 'Field' }), '42');
    expect(reported.at(-1)).toBe(42);
  });

  it('single select: offers the options and reports the option id', async () => {
    const { reported, user } = setup(field('single_select'));
    await user.click(screen.getByRole('combobox', { name: 'Field' }));
    expect(screen.getAllByRole('option').map((o) => o.textContent)).toEqual(['Low', 'High']);
    await user.click(screen.getByRole('option', { name: 'High' }));
    expect(reported).toEqual(['high']);
  });

  it('multi select: reports an array of option ids', async () => {
    const { reported, user } = setup(field('multi_select'), ['low']);
    await user.click(screen.getByRole('combobox', { name: 'Field' }));
    await user.click(screen.getByRole('option', { name: 'High' }));
    expect(reported).toEqual([['low', 'high']]);
  });

  it('checkbox: reports a boolean', async () => {
    const { reported, user } = setup(field('checkbox'));
    await user.click(screen.getByRole('checkbox', { name: 'Field' }));
    expect(reported).toEqual([true]);
  });

  it('date: shows the stored day in a readable format', () => {
    setup(field('date'), '2026-11-02');
    expect(screen.getByRole('textbox', { name: 'Field' })).toHaveProperty('value', 'Nov 2, 2026');
  });

  it('marks required fields and shows the error', () => {
    setup(field('text', { required: true }), null, 'Required');
    expect(screen.getByRole('textbox', { name: 'Field' })).toHaveProperty('required', true);
    expect(screen.getByText('Required')).toBeTruthy();
  });
});
