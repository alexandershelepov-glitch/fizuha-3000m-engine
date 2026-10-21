/**
 * The device's current calendar date, kept up to date while the app stays open.
 *
 * An installed PWA is regularly suspended in the evening and resumed the next day without a reload, so
 * a date captured once at mount would leave Today, INV-1 and the race-date states working with
 * yesterday. The date is refreshed when the app comes back to the foreground, and once per local
 * midnight while it stays open — never by polling.
 *
 * This hook only reports what day it is. Advancing the engine clock is a different operation and stays
 * behind INV-1 (`application/clockOps.ts`).
 */
import {useEffect, useState} from 'react';
import {effectiveToday, IS_QA_BUILD, QA_DATE_EVENT} from '../application/qaMode.ts';

/** Milliseconds until the next local midnight, with a one-second margin so the date has certainly changed. */
export function msUntilNextLocalMidnight(now: Date = new Date()): number {
  const nextMidnight = new Date(now.getFullYear(), now.getMonth(), now.getDate() + 1, 0, 0, 1, 0);
  return Math.max(1000, nextMidnight.getTime() - now.getTime());
}

export function useDeviceDate(): string {
  const [today, setToday] = useState(() => effectiveToday());

  useEffect(() => {
    let timer: ReturnType<typeof setTimeout> | undefined;

    // The state updater keeps the identity of the string stable, so a refresh that changes nothing
    // does not re-render the tree.
    const sync = (): void => {
      setToday((current) => {
        const next = effectiveToday();
        return next === current ? current : next;
      });
    };

    const scheduleMidnight = (): void => {
      if (timer !== undefined) clearTimeout(timer);
      timer = setTimeout(() => {
        sync();
        scheduleMidnight();
      }, msUntilNextLocalMidnight());
    };

    if (IS_QA_BUILD) window.addEventListener(QA_DATE_EVENT, sync);
    document.addEventListener('visibilitychange', sync);
    window.addEventListener('focus', sync);
    // `pageshow` also covers a restore from the back/forward cache.
    window.addEventListener('pageshow', sync);
    scheduleMidnight();

    return () => {
      if (timer !== undefined) clearTimeout(timer);
      if (IS_QA_BUILD) window.removeEventListener(QA_DATE_EVENT, sync);
      document.removeEventListener('visibilitychange', sync);
      window.removeEventListener('focus', sync);
      window.removeEventListener('pageshow', sync);
    };
  }, []);

  return today;
}
