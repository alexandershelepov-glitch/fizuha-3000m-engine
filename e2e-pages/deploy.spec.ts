import {test, expect} from '@playwright/test';

const ROOT='/fizuha-3000m-engine/';

test('project path, deep link and offline reload work in a real mobile browser',async({page})=>{
  const runtimeErrors:string[]=[];
  page.on('pageerror', error=>runtimeErrors.push(error.message));

  await page.goto(ROOT);
  await expect(page.getByRole('button',{name:'Начать подготовку'})).toBeVisible();
  await page.getByRole('button',{name:'Начать подготовку'}).click();
  await expect(page).toHaveURL(/\/fizuha-3000m-engine\/questionnaire\?step=RESULT$/);
  await expect(page.getByLabel('Ваш результат')).toBeVisible();

  // Opening a deep route (or refreshing it) must not lose the project prefix.
  await page.reload();
  await expect(page.getByLabel('Ваш результат')).toBeVisible();

  const registration=await page.evaluate(async()=>{
    if(!('serviceWorker' in navigator))throw new Error('Service worker unsupported');
    const active=await navigator.serviceWorker.ready;
    return active.scope;
  });
  expect(registration).toBe('http://127.0.0.1:4174'+ROOT);

  const manifestResponse=await page.request.get(ROOT+'manifest.webmanifest');
  expect(manifestResponse.ok()).toBe(true);
  const manifest=await manifestResponse.json();
  expect(manifest.start_url).toBe('./');
  expect(manifest.scope).toBe('./');

  // The worker precaches JS/CSS at install, including files initially requested
  // before it took control. A real offline reload of a nested route must work.
  await page.context().setOffline(true);
  await page.reload({waitUntil:'domcontentloaded'});
  await expect(page.getByLabel('Ваш результат')).toBeVisible();
  await page.context().setOffline(false);
  expect(runtimeErrors).toEqual([]);
});

test('direct project URL without a cycle redirects into project root, not domain root',async({page})=>{
  await page.goto(ROOT+'profile');
  await expect(page).toHaveURL('http://127.0.0.1:4174'+ROOT);
  await expect(page.getByRole('button',{name:'Начать подготовку'})).toBeVisible();

  const fallback=await page.request.get(ROOT+'404.html');
  expect(fallback.ok()).toBe(true);
  expect(await fallback.text()).toContain('Физуха');
});
