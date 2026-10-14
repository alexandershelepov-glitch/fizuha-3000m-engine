/**
 * Stage the built Vite application for GitHub Pages without changing the source tree.
 * GitHub Pages serves 404.html for deep SPA URLs; the shell must use base-absolute assets.
 * The release id invalidates old service-worker asset caches after a new deployment.
 */
import {readFile, writeFile, copyFile, stat} from 'node:fs/promises';
import {resolve} from 'node:path';

const dist = resolve(import.meta.dirname, '../web/dist');
const base = process.env.PWA_BASE ?? '/fizuha-3000m-engine/';
const release = (process.env.GITHUB_SHA ?? 'local-preview').slice(0, 12);
if (!/^\/[a-z0-9][\w-]*\/$/i.test(base))
  throw new Error('PWA_BASE must be a project path such as /fizuha-3000m-engine/');
if (!/^[\w-]{4,40}$/.test(release)) throw new Error('Invalid PWA build id');

const html = await readFile(resolve(dist, 'index.html'), 'utf8');
if (!html.includes(`href="${base}manifest.webmanifest"`) ||
    !html.includes(`href="${base}icons/icon-192.png"`) ||
    !html.includes(`${base}assets/`)) {
  throw new Error('Production build does not contain expected project-base asset URLs');
}
if (html.includes('href="/manifest.webmanifest"'))
  throw new Error('A root-absolute manifest URL is not supported on GitHub Pages');

const manifest = JSON.parse(await readFile(resolve(dist, 'manifest.webmanifest'), 'utf8'));
if (manifest.start_url !== './' || manifest.scope !== './' ||
    !manifest.icons.every((icon) => icon.src.startsWith('./icons/')))
  throw new Error('PWA manifest must use paths relative to the project scope');

const swPath = resolve(dist, 'sw.js');
const sw = await readFile(swPath, 'utf8');
if (!sw.includes('__FIZUHA_BUILD_ID__')) throw new Error('Missing service-worker build token');
await writeFile(swPath, sw.replaceAll('__FIZUHA_BUILD_ID__', release));

for (const icon of ['icon-192.png', 'icon-512.png', 'icon-maskable-512.png'])
  await stat(resolve(dist, 'icons', icon));

// GitHub Pages serves this document even when a deep link returns HTTP 404.
// The browser can still boot the SPA; later visits are handled by the service worker.
await copyFile(resolve(dist, 'index.html'), resolve(dist, '404.html'));
await writeFile(resolve(dist, '.nojekyll'), '');
console.log(`Pages package ready at ${base}; build ${release}; 404 fallback and scoped PWA verified`);
