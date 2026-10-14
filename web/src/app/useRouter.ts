/** React bindings for the router. Navigation is History-API based, so reload keeps the screen. */
import {useCallback, useEffect, useState} from 'react';
import {appPath, deploymentPath, parseRoute, routeToPath} from './routes.ts';
import type {Route} from './routes.ts';

export function navigate(route: Route, options: {replace?: boolean} = {}): void {
  const path = deploymentPath(routeToPath(route), import.meta.env.BASE_URL);
  const current = `${window.location.pathname}${window.location.search}`;
  if (current === path) return;
  if (options.replace) window.history.replaceState(null, '', path);
  else window.history.pushState(null, '', path);
  window.dispatchEvent(new PopStateEvent('popstate'));
}

export function useRoute(): Route {
  const read = useCallback((): Route => parseRoute(appPath(window.location.pathname, import.meta.env.BASE_URL), window.location.search), []);
  const [route, setRoute] = useState<Route>(read);

  useEffect(() => {
    const onChange = (): void => setRoute(read());
    window.addEventListener('popstate', onChange);
    return () => window.removeEventListener('popstate', onChange);
  }, [read]);

  return route;
}
