import {afterEach, expect, test, vi} from 'vitest';
import {cleanup, fireEvent, render, screen} from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import {Button} from './Button.tsx';

afterEach(cleanup);

test('QA #23 DEF-003: ignoreRepeatedClicks drops the 2nd click of a double click but keeps single clicks', async () => {
  const onClick = vi.fn();
  render(<Button ignoreRepeatedClicks onClick={onClick}>Продолжить</Button>);
  const button = screen.getByRole('button', {name: 'Продолжить'});
  await userEvent.click(button);
  expect(onClick).toHaveBeenCalledTimes(1);
  onClick.mockClear();
  await userEvent.dblClick(button); // click #1 (detail 1) acts, click #2 (detail 2) is ignored
  expect(onClick).toHaveBeenCalledTimes(1);
  onClick.mockClear();
  fireEvent.click(button, {detail: 2});
  expect(onClick).not.toHaveBeenCalled();
});

test('a plain Button keeps every click (the guard is opt-in)', async () => {
  const onClick = vi.fn();
  render(<Button onClick={onClick}>Ок</Button>);
  await userEvent.dblClick(screen.getByRole('button', {name: 'Ок'}));
  expect(onClick).toHaveBeenCalledTimes(2);
});
