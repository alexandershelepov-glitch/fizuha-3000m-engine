import {useState} from 'react';
import type {ReactNode} from 'react';
import type {LoadCycleResult} from '../../application/storage.ts';
import {common, load} from '../copy/text.ts';
import {Button} from '../components/Button.tsx';
import {Notice} from '../components/Layout.tsx';

/**
 * Explicit load failures. The application never repairs or discards stored data on its own: a damaged
 * record can only be removed after the user confirms it, and an incompatible one is never removed.
 */
export function LoadError({result, onDiscard}: {result: LoadCycleResult; onDiscard: () => void}): ReactNode {
  const [confirming, setConfirming] = useState(false);
  // Transient read failure has its own non-destructive retry screen in App.
  if (result.kind === 'READY' || result.kind === 'EMPTY' || result.kind === 'STORAGE_UNAVAILABLE') return null;

  const content = {
    DAMAGED: {title: load.damagedTitle, text: load.damagedText, cta: load.damagedCta},
    UNSUPPORTED_FORMAT: {title: load.unsupportedFormatTitle, text: load.unsupportedFormatText, cta: load.unsupportedFormatCta},
    UNSUPPORTED_ENGINE_STATE: {title: load.unsupportedEngineTitle, text: load.unsupportedEngineText, cta: load.unsupportedEngineCta},
    IMPOSSIBLE_STATE: {title: load.impossibleTitle, text: load.impossibleText, cta: load.impossibleCta},
  }[result.kind];

  return (
    <div className="app">
      <main className="app__main">
        <div className="screen screen--centered">
          <Notice tone="danger" title={content.title}>
            <p>{content.text}</p>
          </Notice>

          {result.kind === 'DAMAGED' ? (
            confirming ? (
              <Notice tone="warn" title={load.confirmTitle}>
                <p>{load.confirmText}</p>
                <div className="actions">
                  <Button onClick={onDiscard}>{load.confirmCta}</Button>
                  <Button variant="ghost" onClick={() => setConfirming(false)}>{common.cancel}</Button>
                </div>
              </Notice>
            ) : (
              <div className="actions">
                <Button onClick={() => setConfirming(true)}>{content.cta}</Button>
              </div>
            )
          ) : null}
        </div>
      </main>
    </div>
  );
}
