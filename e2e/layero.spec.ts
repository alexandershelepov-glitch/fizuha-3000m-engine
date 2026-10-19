import {test,expect} from '@playwright/test';

/**
 * Layero serves a root-hosted SPA with HTTP 200 fallback and no 404.html.
 * Verify the REAL bundled app, local storage and service-worker offline shell.
 */
test('Layero root PWA: install cache and nested-route offline reload',async({page})=>{
  const errors:string[]=[];
  page.on('pageerror',e=>errors.push(e.message));
  await page.goto('/');
  const buildInfoResponse=await page.request.get('/build-info.json');
  expect(buildInfoResponse.ok()).toBe(true);
  const buildInfo=await buildInfoResponse.json() as {sourceCommit:string;buildId:string};
  expect(buildInfo.sourceCommit).toMatch(/^[0-9a-f]{40}$/i);
  expect(buildInfo.buildId).toMatch(/^[0-9a-f]{16}$/);
  await expect(page.getByRole('button',{name:'Начать подготовку'})).toBeVisible();

  await expect.poll(async()=>page.evaluate(async()=>{
    const reg=await navigator.serviceWorker.getRegistration();
    return Boolean(reg?.active && navigator.serviceWorker.controller);
  }),{timeout:15000}).toBe(true);

  const packageInfo=await page.evaluate(async()=>{
    const registration=await navigator.serviceWorker.ready;
    const cacheNames=await caches.keys();
    return {scope:registration.scope,cacheNames};
  });
  expect(packageInfo.scope).toBe('http://127.0.0.1:4173/');
  expect(packageInfo.cacheNames.some(key=>
    /^fizuha-shell-[0-9a-f]{16}$/.test(key))).toBe(true);

  await page.getByRole('button',{name:'Начать подготовку'}).click();
  await expect(page).toHaveURL(/\/questionnaire\?step=RESULT$/);
  await expect(page.getByLabel('Ваш результат')).toBeVisible();

  // An already-controlled document should first reload online, as happens when
  // an installed PWA is re-opened later, before the user goes offline.
  await page.reload();
  await expect(page.getByLabel('Ваш результат')).toBeVisible();
  await expect.poll(async()=>page.evaluate(()=>
    navigator.serviceWorker.controller!==null)).toBe(true);
  await page.context().setOffline(true);
  await page.reload({waitUntil:'domcontentloaded'});
  await expect(page.getByLabel('Ваш результат')).toBeVisible();
  await page.context().setOffline(false);
  expect(errors).toEqual([]);
});

test('Layero root PWA: direct deep link loads as SPA and no 404 document',async({page})=>{
  const response=await page.goto('/questionnaire?step=RESULT');
  expect(response?.status()).toBe(200);
  await expect(page.getByLabel('Ваш результат')).toBeVisible();
  const fallback=await page.request.get('/404.html');
  // The Vite preview has an index fallback; a real Layero deployment returns 200.
  // The important deployment assertion is that no physical 404.html was packaged.
  expect((await fallback.text()).includes('Физуха')).toBe(true);
});
