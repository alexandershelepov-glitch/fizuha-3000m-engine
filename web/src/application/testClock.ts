/**
 * Virtual calendar ONLY for the isolated testing build.
 *
 * Production bundles compile VITE_TEST_MODE without the explicit value "1".
 * No testing controls, date override or synthetic progress are available there.
 *
 * The test site's localStorage and user sessions must be hosted on a separate
 * Layero domain. This module does not alter any engine training decisions.
 */
export const IS_TEST_BUILD = import.meta.env.VITE_TEST_MODE === '1';
export const TEST_DATE_KEY = 'fizuha.test.virtualDate.v1';
export const TEST_DATE_EVENT = 'fizuha:test-date-changed';

function validDate(value: string): boolean {
  return /^\d{4}-\d{2}-\d{2}$/.test(value) &&
    !Number.isNaN(Date.parse(value + 'T00:00:00Z')) &&
    new Date(value + 'T00:00:00Z').toISOString().slice(0,10) === value;
}

/** Return null outside the private tester build or when no override was selected. */
export function virtualToday(): string | null {
  if (!IS_TEST_BUILD || typeof window === 'undefined') return null;
  try {
    const stored=window.localStorage.getItem(TEST_DATE_KEY);
    return stored !== null && validDate(stored) ? stored : null;
  } catch {
    return null;
  }
}

/** A date change never mutates training state or pretends a session was completed. */
export function setVirtualToday(value: string): boolean {
  if (!IS_TEST_BUILD || typeof window === 'undefined' || !validDate(value)) return false;
  try {
    window.localStorage.setItem(TEST_DATE_KEY,value);
    window.dispatchEvent(new Event(TEST_DATE_EVENT));
    return true;
  } catch {
    return false;
  }
}
