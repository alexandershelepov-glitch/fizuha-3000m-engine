/**
 * The device date must not freeze at mount: an installed PWA is suspended in the evening and resumed
 * the next day without a reload. These tests drive the clock directly.
 */
import {act, renderHook} from '@testing-library/react';
import {afterEach, describe, expect, test, vi} from 'vitest';
import {msUntilNextLocalMidnight, useDeviceDate} from './useDeviceDate.ts';

const at = (year: number, month: number, day: number, hours = 12, minutes = 0, seconds = 0): Date =>
  new Date(year, month - 1, day, hours, minutes, seconds, 0);

afterEach(() => {
  vi.useRealTimers();
});

describe('msUntilNextLocalMidnight', () => {
  test('is never negative and stays inside a day', () => {
    expect(msUntilNextLocalMidnight(at(2026, 10, 5, 0, 0, 0))).toBeLessThanOrEqual(24 * 3600 * 1000 + 1000);
    expect(msUntilNextLocalMidnight(at(2026, 10, 5, 23, 59, 59))).toBeGreaterThan(0);
    expect(msUntilNextLocalMidnight(at(2026, 10, 5, 12, 0, 0))).toBeGreaterThan(11 * 3600 * 1000);
  });
});

describe('useDeviceDate', () => {
  test('starts on the current local date', () => {
    vi.useFakeTimers();
    vi.setSystemTime(at(2026, 10, 5, 9, 30));

    const {result} = renderHook(() => useDeviceDate());
    expect(result.current).toBe('2026-10-05');
  });

  test('picks up a new date when the app returns to the foreground', () => {
    vi.useFakeTimers();
    vi.setSystemTime(at(2026, 10, 5, 23, 50));

    const {result} = renderHook(() => useDeviceDate());
    expect(result.current).toBe('2026-10-05');

    // The app was suspended overnight and is resumed without a reload.
    vi.setSystemTime(at(2026, 10, 6, 7, 15));
    act(() => void document.dispatchEvent(new Event('visibilitychange')));
    expect(result.current).toBe('2026-10-06');
  });

  test('also reacts to focus and to a restore from the back/forward cache', () => {
    vi.useFakeTimers();
    vi.setSystemTime(at(2026, 10, 5, 23, 50));

    const {result} = renderHook(() => useDeviceDate());

    vi.setSystemTime(at(2026, 10, 6, 0, 10));
    act(() => void window.dispatchEvent(new Event('focus')));
    expect(result.current).toBe('2026-10-06');

    vi.setSystemTime(at(2026, 10, 7, 8, 0));
    act(() => void window.dispatchEvent(new Event('pageshow')));
    expect(result.current).toBe('2026-10-07');
  });

  test('updates by itself at the next local midnight, without any event', () => {
    vi.useFakeTimers();
    vi.setSystemTime(at(2026, 10, 5, 23, 59, 50));

    const {result} = renderHook(() => useDeviceDate());
    expect(result.current).toBe('2026-10-05');

    act(() => void vi.advanceTimersByTime(21_000));
    expect(result.current).toBe('2026-10-06');
  });

  test('does not re-render when nothing changed', () => {
    vi.useFakeTimers();
    vi.setSystemTime(at(2026, 10, 5, 12, 0));
    let renders = 0;

    renderHook(() => {
      renders += 1;
      return useDeviceDate();
    });
    expect(renders).toBe(1);

    act(() => void document.dispatchEvent(new Event('visibilitychange')));
    act(() => void window.dispatchEvent(new Event('focus')));
    expect(renders).toBe(1);
  });
});
