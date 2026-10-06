import type {ReactNode} from 'react';
import {storageUnavailable} from '../copy/text.ts';
import {Button} from '../components/Button.tsx';
import {Notice} from '../components/Layout.tsx';

/**
 * Blocking state for a device that cannot keep data.
 *
 * Starting a cycle here would be a lie: it would not survive a reload. The shell therefore refuses to
 * work instead of falling back to temporary memory.
 */
export function StorageUnavailable({onRetry}: {onRetry: () => void}): ReactNode {
  return (
    <div className="app">
      <main className="app__main">
        <div className="screen screen--centered">
          <Notice tone="danger" title={storageUnavailable.title}>
            <p>{storageUnavailable.text}</p>
          </Notice>
          <p className="hint">{storageUnavailable.hint}</p>
          <div className="actions">
            <Button onClick={onRetry}>{storageUnavailable.cta}</Button>
          </div>
        </div>
      </main>
    </div>
  );
}
