import type {ButtonHTMLAttributes, ReactNode} from 'react';

type Variant = 'primary' | 'secondary' | 'ghost';

interface Props extends ButtonHTMLAttributes<HTMLButtonElement> {
  readonly variant?: Variant;
  readonly children: ReactNode;
}

export function Button({variant = 'primary', children, className, ...rest}: Props): ReactNode {
  return (
    <button type="button" className={['btn', `btn--${variant}`, className].filter(Boolean).join(' ')} {...rest}>
      {children}
    </button>
  );
}
