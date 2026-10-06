import {useState} from 'react';
import type {ReactNode} from 'react';
import {Button} from '../components/Button.tsx';
import {Card, Notice} from '../components/Layout.tsx';
import {app, firstRun, lifecycle} from '../copy/text.ts';

export function FirstRun({onStart, onHistory}: {onStart: () => void; onHistory?: () => void}): ReactNode {
  const [showHow, setShowHow] = useState(false);

  return (
    <div className="screen screen--centered">
      <div className="hero">
        <p className="hero__badge">{app.moduleLabel}</p>
        <h1 className="hero__title">{firstRun.title}</h1>
        <p className="hero__subtitle">{firstRun.subtitle}</p>
      </div>

      <Card>
        <ul className="list">
          {firstRun.intro.map((line) => (
            <li key={line} className="list__item">{line}</li>
          ))}
        </ul>
      </Card>

      {showHow ? (
        <Card title={firstRun.howItWorks.title}>
          {firstRun.howItWorks.paragraphs.map((paragraph) => (
            <p key={paragraph} className="paragraph">{paragraph}</p>
          ))}
          <Button variant="secondary" onClick={() => setShowHow(false)}>{firstRun.howItWorks.cta}</Button>
        </Card>
      ) : null}

      <div className="actions">
        <Button onClick={onStart}>{firstRun.primaryCta}</Button>
        <Button variant="ghost" onClick={() => setShowHow((open) => !open)} aria-expanded={showHow}>
          {firstRun.secondaryCta}
        </Button>
      </div>

      {onHistory ? <Button variant="secondary" onClick={onHistory}>{lifecycle.history}</Button> : null}
      <Notice tone="info">
        Все данные хранятся только на этом устройстве. Приложение работает без сети.
      </Notice>
    </div>
  );
}
