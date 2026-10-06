import {StrictMode} from 'react';
import {createRoot} from 'react-dom/client';
import {App} from './app/App.tsx';
import './styles.css';

const container = document.getElementById('root');
if (container === null) throw new Error('root container is missing');

createRoot(container).render(
  <StrictMode>
    <App />
  </StrictMode>,
);

// The service worker makes the shell available offline; the cycle itself is already local.
if ('serviceWorker' in navigator && import.meta.env.PROD) {
  window.addEventListener('load', () => {
    void navigator.serviceWorker.register('/sw.js').catch(() => undefined);
  });
}
