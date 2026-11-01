/**
 * Segment duration entry for phones: separate digit-only fields for minutes and seconds.
 *
 * The result form expects `М:СС` (for example `1:56`). A single numeric input shows a keypad
 * without a colon, so the athlete cannot type that value on iOS at all. Two numeric fields remove
 * the colon from the task while keeping the stored draft format — and therefore saved drafts,
 * earlier results and the engine contract — exactly as they were.
 */
import {useRef, useState} from 'react';
import type {ReactNode} from 'react';

export interface SegmentTimeParts {
  readonly minutes: string;
  readonly seconds: string;
}

/** `1:56` → `{minutes:'1', seconds:'56'}`. Unknown shapes keep their digits instead of being lost. */
export function splitSegmentTime(raw: string): SegmentTimeParts {
  const value = raw.trim();
  if (value === '') return {minutes: '', seconds: ''};
  const match = /^(\d{1,3}):(\d{1,2})$/.exec(value);
  if (match) return {minutes: match[1]!, seconds: match[2]!};
  if (/^\d+$/.test(value)) return {minutes: value, seconds: ''};
  return {minutes: value.replace(/[^\d]/g, ''), seconds: ''};
}

/** The draft value the engine already understands. Seconds are always two digits. */
export function joinSegmentTime(minutes: string, seconds: string): string {
  const m = minutes.trim();
  const s = seconds.trim();
  if (m === '' && s === '') return '';
  return `${m === '' ? '0' : m}:${(s === '' ? '0' : s).padStart(2, '0')}`;
}

const digits = (raw: string, length = 2): string => raw.replace(/\D/g, '').slice(0, length);

export interface SegmentTimeInputProps {
  readonly id: string;
  readonly value: string;
  readonly onChange: (value: string) => void;
  readonly labelledBy?: string | undefined;
  readonly describedBy?: string | undefined;
}

export function SegmentTimeInput({id, value, onChange, labelledBy, describedBy}: SegmentTimeInputProps): ReactNode {
  const initial = splitSegmentTime(value);
  const [minutes, setMinutes] = useState(initial.minutes);
  // A stored "05" is shown as "5" so the next typed digit is not swallowed by a padded field.
  const [seconds, setSeconds] = useState(initial.seconds.replace(/^0(?=\d)/, ''));
  const secondsRef = useRef<HTMLInputElement>(null);
  const invalidSeconds = seconds !== '' && Number(seconds) > 59;

  const emit = (nextMinutes: string, nextSeconds: string): void => {
    setMinutes(nextMinutes);
    setSeconds(nextSeconds);
    onChange(joinSegmentTime(nextMinutes, nextSeconds));
  };

  return (
    <div className="segment-time" role="group" aria-labelledby={labelledBy} aria-describedby={describedBy}>
      <span className="segment-time__field">
        <input
          id={`${id}-minutes`}
          className="input segment-time__input"
          type="text"
          inputMode="numeric"
          pattern="[0-9]*"
          maxLength={2}
          autoComplete="off"
          aria-label="Минуты"
          aria-invalid={undefined}
          value={minutes}
          onChange={(event) => {
            const next = digits(event.target.value);
            if (next.length === 2) secondsRef.current?.focus();
            emit(next, seconds);
          }}
        />
        <span className="segment-time__unit" aria-hidden="true">мин</span>
      </span>
      <span className="segment-time__colon" aria-hidden="true">:</span>
      <span className="segment-time__field">
        <input
          id={`${id}-seconds`}
          ref={secondsRef}
          className="input segment-time__input"
          type="text"
          inputMode="numeric"
          pattern="[0-9]*"
          maxLength={2}
          autoComplete="off"
          aria-label="Секунды"
          aria-invalid={invalidSeconds ? true : undefined}
          aria-describedby={invalidSeconds ? `${id}-seconds-error` : describedBy}
          value={seconds}
          onChange={(event) => emit(minutes, digits(event.target.value))}
        />
        <span className="segment-time__unit" aria-hidden="true">сек</span>
      </span>
      {invalidSeconds ? <p className="field__error" id={`${id}-seconds-error`} role="alert">Секунды — от 0 до 59.</p> : null}
      <span className="segment-time__preview" aria-live="polite">{minutes === '' && seconds === '' ? '' : joinSegmentTime(minutes, seconds)}</span>
    </div>
  );
}
