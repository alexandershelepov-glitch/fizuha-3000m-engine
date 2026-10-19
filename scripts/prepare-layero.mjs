/**
 * Prepare the root-hosted Fizuha PWA for Layero.
 *
 * Vite outputs to web/dist, while Layero serves the contents of that folder
 * from /. No GitHub Pages 404.html fallback should be bundled: Layero supplies
 * an HTTP 200 SPA fallback automatically when 404.html is absent.
 *
 * Hash actual build bytes (including images) so a new app version changes the
 * service-worker script; old mobile PWA installations then receive new assets.
 */
import {createHash} from 'node:crypto';
import {execFileSync} from 'node:child_process';
import {readFile, readdir, stat} from 'node:fs/promises';
import {writeFile} from 'node:fs/promises';
import {join, relative, resolve} from 'node:path';

const dist=resolve(import.meta.dirname,'../web/dist');
let sourceCommit=process.env.LAYERO_SOURCE_COMMIT ?? process.env.GITHUB_SHA;
if(!sourceCommit) {
  try {
    sourceCommit=execFileSync('git',['rev-parse','HEAD'],{encoding:'utf8',stdio:['ignore','pipe','ignore']}).trim();
  } catch {
    sourceCommit='unknown';
  }
}
if(sourceCommit!=='unknown' && !/^[0-9a-f]{40}$/i.test(sourceCommit)) {
  throw new Error('Layero build source revision must be a full Git commit SHA');
}
const html=await readFile(join(dist,'index.html'),'utf8');
if(!html.includes('href="/manifest.webmanifest"') ||
   !html.includes('href="/icons/icon-192.png"') ||
   !html.includes('"/assets/')) {
  throw new Error('Layero build must use base / for assets, icons and manifest');
}

const manifest=JSON.parse(await readFile(join(dist,'manifest.webmanifest'),'utf8'));
if(manifest.start_url!=='./' || manifest.scope!=='./' ||
  !manifest.icons?.every((icon)=>icon.src.startsWith('./icons/'))) {
  throw new Error('Layero PWA manifest must have relative start, scope and icons');
}
const swPath=join(dist,'sw.js');
const sw=await readFile(swPath,'utf8');
if(!sw.includes('__FIZUHA_BUILD_ID__'))throw new Error('Missing worker build ID token');
try{
  await stat(join(dist,'404.html'));
  throw new Error('Layero must not publish Pages-specific 404.html: SPA routes would return HTTP 404');
}catch(error){
  if(error.code!=='ENOENT')throw error;
}

for(const icon of ['icon-192.png','icon-512.png','icon-maskable-512.png']){
  await stat(join(dist,'icons',icon));
}
async function files(dir){
  const entries=await readdir(dir,{withFileTypes:true});
  const result=[];
  for(const entry of entries){
    const filename=join(dir,entry.name);
    if(entry.isDirectory())result.push(...await files(filename));
    else if(entry.isFile())result.push(filename);
  }
  return result;
}
const hash=createHash('sha256');
for(const file of (await files(dist)).sort()){
  if(file===swPath)continue;
  hash.update(relative(dist,file));
  hash.update(await readFile(file));
}
hash.update(sw);
const release=hash.digest('hex').slice(0,16);
await writeFile(swPath,sw.replaceAll('__FIZUHA_BUILD_ID__',release));
await writeFile(join(dist,'build-info.json'),`${JSON.stringify({sourceCommit,buildId:release},null,2)}\n`);
console.log(`Layero PWA package ready at /; source ${sourceCommit}; cache version ${release}; no Pages 404 fallback`);
