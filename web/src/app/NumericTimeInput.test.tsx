import {useState} from 'react';
import {afterEach, expect, test} from 'vitest';
import {cleanup, render, screen} from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import {formatNumericTimeInput, parseTime} from '../application/format.ts';
import {Field, TextInput} from '../ui/components/Field.tsx';

afterEach(cleanup);

function TimeField() {
  const [value, setValue] = useState('');
  return <Field id="time" label="Ваш результат" hint="Введите 1430 — получится 14:30">
    <TextInput id="time" value={value} onChange={setValue} numericTime inputMode="numeric" />
  </Field>;
}

test('iPhone number pad: four digits become MM:SS, still parsed by existing validator', async () => {
  render(<TimeField />);
  const input = screen.getByRole('textbox', {name: 'Ваш результат'}) as HTMLInputElement;
  expect(input.inputMode).toBe('numeric');
  await userEvent.type(input, '1430');
  expect(input).toHaveValue('14:30');
  expect(parseTime(input.value)).toEqual({ok: true, seconds: 870});
});

test('three digit time is formatted when the user leaves the field', async () => {
  render(<TimeField />);
  const input = screen.getByRole('textbox', {name: 'Ваш результат'});
  await userEvent.type(input, '930');
  expect(input).toHaveValue('930');
  await userEvent.tab();
  expect(input).toHaveValue('9:30');
});

test('invalid times and punctuation are not silently rewritten into a valid result', () => {
  expect(formatNumericTimeInput('1475')).toBe('14:75');
  expect(parseTime(formatNumericTimeInput('1475'))).toEqual({ok: false, error: 'IMPOSSIBLE'});
  expect(formatNumericTimeInput('15.20')).toBe('15.20');
  expect(parseTime(formatNumericTimeInput('15.20'))).toEqual({ok: false, error: 'FORMAT'});
  expect(formatNumericTimeInput('14:30')).toBe('14:30');
  expect(formatNumericTimeInput('')).toBe('');
  expect(formatNumericTimeInput('0930')).toBe('09:30');
  expect(formatNumericTimeInput('930', true)).toBe('9:30');
});
