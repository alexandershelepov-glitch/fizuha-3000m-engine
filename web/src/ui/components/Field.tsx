import {Children, cloneElement, isValidElement} from 'react';
import type {ReactElement, ReactNode} from 'react';
import {formatNumericTimeInput} from '../../application/format.ts';

interface Labellable {
  readonly labelledBy?: string | undefined;
  readonly describedBy?: string | undefined;
}

/**
 * One field: a visible label, an optional hint, the control and an optional error.
 *
 * The label is associated through `aria-labelledby` rather than `htmlFor`, because a field can hold a
 * plain input or a group of buttons. A group is wrapped so screen readers announce the same name, and
 * an error is always tied to the control that caused it.
 */
export function Field({id, label, hint, error, children}: {id: string; label: string; hint?: string; error?: string; children: ReactNode}): ReactNode {
  const labelId = `${id}-label`;
  const describedBy = error ? `${id}-error` : hint ? `${id}-hint` : undefined;
  const single = Children.count(children) === 1 && isValidElement(children);
  const control = single
    ? cloneElement(children as ReactElement<Labellable>, {labelledBy: labelId, describedBy})
    : <div role="group" aria-labelledby={labelId} aria-describedby={describedBy}>{children}</div>;

  return (
    <div className={['field', error ? 'field--invalid' : null].filter(Boolean).join(' ')}>
      <span className="field__label" id={labelId}>{label}</span>
      {hint ? <p className="field__hint" id={`${id}-hint`}>{hint}</p> : null}
      {control}
      {error ? <p className="field__error" id={`${id}-error`} role="alert">{error}</p> : null}
    </div>
  );
}

interface TextInputProps {
  readonly id: string;
  readonly value: string;
  readonly onChange: (value: string) => void;
  readonly inputMode?: 'numeric' | 'decimal' | 'text';
  readonly type?: 'text' | 'date' | 'number';
  readonly placeholder?: string;
  readonly describedBy?: string | undefined;
  readonly labelledBy?: string | undefined;
  readonly autoFocus?: boolean;
  /** Formats 1430 → 14:30 on number-only mobile keyboards, without changing validation. */
  readonly numericTime?: boolean;
}

export function TextInput({id, value, onChange, inputMode = 'text', type = 'text', placeholder, describedBy, labelledBy, autoFocus, numericTime = false}: TextInputProps): ReactNode {
  return (
    <input
      id={id}
      className="input"
      type={type}
      inputMode={inputMode}
      value={value}
      placeholder={placeholder}
      aria-describedby={describedBy}
      aria-labelledby={labelledBy}
      autoFocus={autoFocus}
      onChange={(event) => onChange(numericTime ? formatNumericTimeInput(event.target.value) : event.target.value)}
      onBlur={numericTime ? (event) => {
        const formatted = formatNumericTimeInput(event.target.value, true);
        if (formatted !== event.target.value) onChange(formatted);
      } : undefined}
    />
  );
}

export function Toggle({id, value, onChange, yes, no, labelledBy}: {id: string; value: boolean; onChange: (next: boolean) => void; yes: string; no: string; labelledBy?: string | undefined}): ReactNode {
  return (
    <div className="toggle" role="group" id={id} aria-labelledby={labelledBy}>
      <button type="button" className={`toggle__option${value ? ' toggle__option--active' : ''}`} aria-pressed={value} onClick={() => onChange(true)}>
        {yes}
      </button>
      <button type="button" className={`toggle__option${value ? '' : ' toggle__option--active'}`} aria-pressed={!value} onClick={() => onChange(false)}>
        {no}
      </button>
    </div>
  );
}

export function Scale({id, value, onChange, min, max, labelFor, labelledBy}: {id: string; value: number; onChange: (next: number) => void; min: number; max: number; labelFor: (value: number) => string; labelledBy?: string | undefined}): ReactNode {
  const options: number[] = [];
  for (let option = min; option <= max; option += 1) options.push(option);
  return (
    <div className="scale" id={id} role="group" aria-labelledby={labelledBy}>
      {options.map((option) => (
        <button
          key={option}
          type="button"
          className={`scale__option${option === value ? ' scale__option--active' : ''}`}
          aria-pressed={option === value}
          aria-label={labelFor(option)}
          onClick={() => onChange(option)}
        >
          {option}
        </button>
      ))}
    </div>
  );
}

export function Choice<T extends string>({id, value, options, onChange, labelledBy}: {id: string; value: T; options: readonly {value: T; label: string; hint?: string}[]; onChange: (next: T) => void; labelledBy?: string | undefined}): ReactNode {
  return (
    <div className="choice" id={id} role="radiogroup" aria-labelledby={labelledBy}>
      {options.map((option) => (
        <button
          key={option.value}
          type="button"
          role="radio"
          aria-checked={option.value === value}
          className={`choice__option${option.value === value ? ' choice__option--active' : ''}`}
          onClick={() => onChange(option.value)}
        >
          <span className="choice__label">{option.label}</span>
          {option.hint ? <span className="choice__hint">{option.hint}</span> : null}
        </button>
      ))}
    </div>
  );
}

export function Checkbox({id, checked, onChange, label, hint}: {id: string; checked: boolean; onChange: (next: boolean) => void; label: string; hint?: string}): ReactNode {
  return (
    <label className="checkbox" htmlFor={id}>
      <input id={id} type="checkbox" checked={checked} onChange={(event) => onChange(event.target.checked)} />
      <span>
        {label}
        {hint === undefined ? null : <span className="checkbox__hint">{hint}</span>}
      </span>
    </label>
  );
}
