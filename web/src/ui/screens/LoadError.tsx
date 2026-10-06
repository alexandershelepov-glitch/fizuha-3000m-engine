import type {ReactNode} from 'react';
import type {LoadCycleResult} from '../../application/storage.ts';
import {load} from '../copy/text.ts';
import {Button} from '../components/Button.tsx';
import {Notice} from '../components/Layout.tsx';

/** Explicit load failures: the application never repairs or discards stored data silently. */
export function LoadError({result, onStartOver}: {result: LoadCycleResult; onStartOver: () => void}): ReactNode {
  if (result.kind === 'READY' || result.kind === 'EMPTY') return null;

  const content = {
    DAMAGED: {title: load.damagedTitle, text: load.damagedText, cta: load.damagedCta},
    UNSUPPORTED_FORMAT: {title: load.unsupportedFormatTitle, text: load.unsupportedFormatText, cta: load.unsupportedFormatCta},
    UNSUPPORTED_ENGINE_STATE: {title: load.unsupportedEngineTitle, text: load.unsupportedEngineText, cta: load.unsupportedEngineCta},
    IMPOSSIBLE_STATE: {title: load.impossibleTitle, text: load.impossibleText, cta: load.impossibleCta},
  }[result.kind];

  return (
    <div className="screen screen--centered">
      <Notice tone="danger" title={content.title}>
        <p>{content.text}</p>
      </Notice>
      {result.kind === 'DAMAGED' ? (
        <div className="actions">
          <Button onClick={onStartOver}>{content.cta}</Button>
        </div>
      ) : null}
    </div>
  );
}
