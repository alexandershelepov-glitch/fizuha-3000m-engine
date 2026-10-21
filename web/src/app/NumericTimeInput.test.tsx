import {useState} from 'react';
import {afterEach, expect, test} from 'vitest';
import {cleanup, render, screen} from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import {parseTime} from '../application/format.ts';
import {Field, TextInput} from '../ui/components/Field.tsx';

afterEach(cleanup);

function TimeField() {
  const [value, setValue] = useState('');
  return <Field id="time" label="Ваш результат" hint="Формат ММ:СС, например 14:30">
    <TextInput id="time" value={value} onChange={setValue} inputMode="text" placeholder="14:30" />
  </Field>;
}

test('iPhone uses ordinary text keyboard so the athlete can type the colon', async () => {
  render(<TimeField />);
  const input = screen.getByRole('textbox', {name: 'Ваш результат'}) as HTMLInputElement;
  expect(input.inputMode).toBe('text');
  await userEvent.type(input, '14:30');
  expect(input).toHaveValue('14:30');
  expect(parseTime(input.value)).toEqual({ok: true, seconds: 870});
});

test('text input preserves typed punctuation and existing time validation rejects invalid seconds', async () => {
  render(<TimeField />);
  const input = screen.getByRole('textbox', {name: 'Ваш результат'}) as HTMLInputElement;
  await userEvent.type(input, '14:75');
  expect(input).toHaveValue('14:75');
  expect(parseTime(input.value)).toEqual({ok: false, error: 'IMPOSSIBLE'});
  await userEvent.clear(input);
  await userEvent.type(input, '15.20');
  expect(input).toHaveValue('15.20');
  expect(parseTime(input.value)).toEqual({ok: false, error: 'FORMAT'});
});
