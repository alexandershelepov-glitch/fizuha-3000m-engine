import type {ReactNode} from 'react';

export function AppBar({title, subtitle, onBack}: {title: string; subtitle?: string; onBack?: () => void}): ReactNode {
  return (
    <header className="appbar">
      {onBack ? (
        <button type="button" className="appbar__back" onClick={onBack} aria-label="Назад">
          ←
        </button>
      ) : null}
      <div>
        <h1 className="appbar__title">{title}</h1>
        {subtitle ? <p className="appbar__subtitle">{subtitle}</p> : null}
      </div>
    </header>
  );
}

export function Card({title, children, tone}: {title?: string; children: ReactNode; tone?: 'info' | 'warn' | 'danger' | 'ok'}): ReactNode {
  return (
    <section className={['card', tone ? `card--${tone}` : null].filter(Boolean).join(' ')}>
      {title ? <h2 className="card__title">{title}</h2> : null}
      {children}
    </section>
  );
}

export function Notice({tone = 'info', title, children}: {tone?: 'info' | 'warn' | 'danger' | 'ok'; title?: string; children: ReactNode}): ReactNode {
  return (
    <div className={`notice notice--${tone}`} role={tone === 'danger' ? 'alert' : undefined}>
      {title ? <p className="notice__title">{title}</p> : null}
      <div className="notice__body">{children}</div>
    </div>
  );
}

export function EmptyState({title, text, children}: {title: string; text?: string; children?: ReactNode}): ReactNode {
  return (
    <div className="empty">
      <p className="empty__title">{title}</p>
      {text ? <p className="empty__text">{text}</p> : null}
      {children}
    </div>
  );
}

export function KeyValue({label, value}: {label: string; value: ReactNode}): ReactNode {
  return (
    <div className="kv">
      <span className="kv__label">{label}</span>
      <span className="kv__value">{value}</span>
    </div>
  );
}

export function Progress({value, max}: {value: number; max: number}): ReactNode {
  return (
    <div className="progress" role="progressbar" aria-valuenow={value} aria-valuemin={1} aria-valuemax={max}>
      <div className="progress__bar" style={{width: `${Math.round((value / max) * 100)}%`}} />
    </div>
  );
}

export function Sign({sign, label}: {sign: string; label: string}): ReactNode {
  return (
    <p className="sign">
      <span className="sign__glyph" aria-hidden="true">{sign}</span>
      <span className="sign__label">{label}</span>
    </p>
  );
}
