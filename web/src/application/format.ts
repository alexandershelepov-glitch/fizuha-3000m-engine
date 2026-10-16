/**
 * Presentation-only formatting. No sport decisions live here: this module converts numbers and dates
 * into strings and back, and never derives a training pace, load or verdict.
 */

const pad = (value: number): string => String(value).padStart(2, '0');

/** Seconds → `ММ:СС` (or `Ч:ММ:СС` beyond an hour). */
/** Minutes and seconds without a padded minute field: "1:36", "5:26". */
export function shortTime(totalSeconds: number): string {
  const seconds = Math.round(totalSeconds);
  const hours = Math.floor(seconds / 3600);
  const minutes = Math.floor((seconds % 3600) / 60);
  const rest = seconds % 60;
  return hours > 0 ? `${hours}:${pad(minutes)}:${pad(rest)}` : `${minutes}:${pad(rest)}`;
}

export function formatTime(totalSeconds: number): string {
  const seconds = Math.round(totalSeconds);
  const hours = Math.floor(seconds / 3600);
  const minutes = Math.floor((seconds % 3600) / 60);
  const rest = seconds % 60;
  return hours > 0 ? `${hours}:${pad(minutes)}:${pad(rest)}` : `${pad(minutes)}:${pad(rest)}`;
}

/**
 * Let an iPhone number pad enter a 3 km result without typing ':' (which it does not have).
 * '1430' -> '14:30' while typing. A three-digit time '930' becomes '9:30' on blur.
 * Pre-existing colon-separated text and invalid punctuation stay intact for parseTime validation.
 * This is only a UI input convenience, not a new sport/time validation rule.
 */
export function formatNumericTimeInput(raw: string, onBlur = false): string {
  if (/^\\d{4}$/.test(raw)) return `${raw.slice(0, 2)}:${raw.slice(2)}`;
  if (onBlur && /^\\d{3}$/.test(raw)) return `${raw.slice(0, 1)}:${raw.slice(1)}`;
  return raw;
}

export type TimeParseError = 'EMPTY' | 'FORMAT' | 'IMPOSSIBLE';
export type TimeParseResult = {ok: true; seconds: number} | {ok: false; error: TimeParseError};

/**
 * Parse a user-typed 3000 m time. Structural mistakes are caught here; the allowed *range* is left to
 * the engine (`NUMBER_OUT_OF_RANGE`), so no engine threshold is duplicated in the UI.
 */
export function parseTime(raw: string): TimeParseResult {
  const value = raw.trim();
  if (value.length === 0) return {ok: false, error: 'EMPTY'};

  const twoPart = /^(\d{1,2}):(\d{2})$/.exec(value);
  if (twoPart) {
    const minutes = Number(twoPart[1]);
    const seconds = Number(twoPart[2]);
    if (seconds > 59) return {ok: false, error: 'IMPOSSIBLE'};
    return {ok: true, seconds: minutes * 60 + seconds};
  }

  const threePart = /^(\d{1,2}):(\d{2}):(\d{2})$/.exec(value);
  if (threePart) {
    const minutes = Number(threePart[2]);
    const seconds = Number(threePart[3]);
    if (seconds > 59 || minutes > 59) return {ok: false, error: 'IMPOSSIBLE'};
    return {ok: true, seconds: Number(threePart[1]) * 3600 + minutes * 60 + seconds};
  }

  return {ok: false, error: 'FORMAT'};
}

/** Today's calendar date on the user's device, as `YYYY-MM-DD` (the engine works in plain dates). */
export function deviceToday(now: Date = new Date()): string {
  return `${now.getFullYear()}-${pad(now.getMonth() + 1)}-${pad(now.getDate())}`;
}

export function deviceTimestamp(now: Date = new Date()): string {
  return now.toISOString();
}

/** `2026-11-25` → `25 ноября 2026 г.` */
export function formatDateLong(iso: string, locale = 'ru-RU'): string {
  return new Intl.DateTimeFormat(locale, {day: 'numeric', month: 'long', year: 'numeric', timeZone: 'UTC'}).format(new Date(`${iso}T00:00:00Z`));
}

/** `2026-11-25` → `25 нояб.` */
export function formatDateShort(iso: string, locale = 'ru-RU'): string {
  return new Intl.DateTimeFormat(locale, {day: 'numeric', month: 'short', timeZone: 'UTC'}).format(new Date(`${iso}T00:00:00Z`));
}

/** Whole calendar days between two `YYYY-MM-DD` dates (to − from). */
export function daysBetween(fromIso: string, toIso: string): number {
  const from = Date.parse(`${fromIso}T00:00:00Z`);
  const to = Date.parse(`${toIso}T00:00:00Z`);
  return Math.round((to - from) / 86400000);
}

export function addDays(iso: string, days: number): string {
  return new Date(Date.parse(`${iso}T00:00:00Z`) + days * 86400000).toISOString().slice(0, 10);
}

/** Seconds per kilometre → `4:35`. */
export function formatPaceSecondsPerKm(secondsPerKm: number): string {
  return formatTime(secondsPerKm);
}

/** Rounded metres for display, e.g. `1250` → `1250 м`. */
export function formatMeters(meters: number): string {
  return `${Math.round(meters)}`;
}

export function formatDecimal(value: number, fractionDigits = 1): string {
  return value.toFixed(fractionDigits);
}
