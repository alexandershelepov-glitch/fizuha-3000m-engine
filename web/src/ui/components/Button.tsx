import type {ButtonHTMLAttributes, MouseEvent, ReactNode} from 'react';

type Variant = 'primary' | 'secondary' | 'ghost';

interface Props extends ButtonHTMLAttributes<HTMLButtonElement> {
  readonly variant?: Variant;
  readonly children: ReactNode;
  /**
   * Ignore the 2nd (and later) click of a multi-click. The screen after "save" shows a button at the same
   * place as the save button, so the second click of an accidental double click would land on it and skip the
   * screen the user has not read yet (QA issue #23, DEF-003). Keyboard and single clicks are unaffected.
   */
  readonly ignoreRepeatedClicks?: boolean;
}

export function Button({variant = 'primary', children, className, ignoreRepeatedClicks = false, onClick, ...rest}: Props): ReactNode {
  const handleClick = ignoreRepeatedClicks && onClick
    ? (event: MouseEvent<HTMLButtonElement>): void => { if (event.detail > 1) return; onClick(event); }
    : onClick;
  return (
    <button type="button" className={['btn', `btn--${variant}`, className].filter(Boolean).join(' ')} onClick={handleClick} {...rest}>
      {children}
    </button>
  );
}
