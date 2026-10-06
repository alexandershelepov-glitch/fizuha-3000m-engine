/** React bindings for the router. Navigation is History-API based, so reload keeps the screen. */
import {useCallback, useEffect, useState} from 'react';
import {parseRoute, routeToPath} from './routes.ts';
import type {Route} from './routes.ts';

export function navigate(route: Route, options: {replace?: boolean} = {}): void {
  const path = routeToPath(route);
  const current = `${window.location.pathname}${window.location.search}`;
  if (current === path) return;
  if (options.replace) window.history.replaceState(null, '', path);
  else window.history.pushState(null, '', path);
  window.dispatchEvent(new PopStateEvent('popstate'));
}

export function useRoute(): Route {
  const read = useCallback((): Route => parseRoute(window.location.pathname, window.location.search), []);
  const [route, setRoute] = useState<Route>(read);

  useEffect(() => {
    const onChange = (): void => setRoute(read());
    window.addEventListener('popstate', onChange);
    return () => window.removeEventListener('popstate', onChange);
  }, [read]);

  return route;
}
