// MIT. Read the actual saved document-evidence workspace in the installed browser.
import {mkdir,readFile,writeFile,lstat,realpath,open,link,unlink} from 'node:fs/promises';
import {createHash,randomUUID} from 'node:crypto';
import {join,resolve,isAbsolute} from 'node:path';
import {pathToFileURL} from 'node:url';
const need=(ok,message)=>{if(!ok)throw new Error(message);};
const hash=raw=>createHash('sha256').update(raw).digest('hex');
export async function inspectDocumentEvidenceBrowser({connectionFile,outputDirectory,planId,revision,playwrightModule,executablePath}) {
  for(const path of [connectionFile,outputDirectory,playwrightModule,executablePath])need(typeof path==='string'&&isAbsolute(path),'Use the original absolute browser/source configuration.');
  need(/^[0-9a-f]{64}$/.test(planId)&&Number.isSafeInteger(revision)&&revision>0,'Select the actual saved evidence revision.');
  await mkdir(outputDirectory,{recursive:true,mode:0o700});
  const info=await lstat(outputDirectory);
  need(info.isDirectory()&&!info.isSymbolicLink()&&!(info.mode&0o077)&&await realpath(outputDirectory)===resolve(outputDirectory),'Keep browser output in the original private case.');
  const url=(await readFile(connectionFile,'utf8')).trim(),selected=new URL(url);
  need(selected.protocol==='http:'&&selected.hostname==='127.0.0.1'&&selected.hash.length>20,'Open only the actual private original console.');
  const runtime=await import(pathToFileURL(playwrightModule).href),chromium=runtime.chromium??runtime.default?.chromium;
  need(chromium&&typeof chromium.launch==='function','Use the installed original Playwright Chromium runtime.');
  const browser=await chromium.launch({executablePath,headless:true,args:['--no-sandbox','--disable-dev-shm-usage']});
  const observations=[],errors=[];
  let context;
  try {
    context=await browser.newContext({viewport:{width:1440,height:1000},deviceScaleFactor:1});
    const page=await context.newPage();page.setDefaultTimeout(25000);
    page.on('pageerror',error=>errors.push(String(error.message??error)));
    await page.goto(url,{waitUntil:'domcontentloaded'});
    await page.locator('#ide-open-view').waitFor({state:'visible'});
    await page.locator('#ide-open-view').click();
    await page.locator('#ide-panel').waitFor({state:'visible'});
    await page.locator('#ide-plan-select').selectOption(planId);
    await page.locator('#ide-open-plan').click();
    await page.locator('#ide-plan-revision').selectOption(String(revision));
    await page.locator('#ide-open-revision').click();
    for(const section of ['selection','acquisition','review','comparison','handoff','receive']){
      await page.locator('[data-ide-tab="'+section+'"]').click();
      const text=await page.locator('#ide-panel').innerText();
      need(text.length>100,'The saved document evidence view did not render its full controls.');
      const raw=await page.screenshot({fullPage:true}),name='desktop-'+section+'-'+hash(raw)+'.png';
      await writeFile(join(outputDirectory,name),raw,{flag:'wx',mode:0o600}).catch(async error=>{
        if(error.code!=='EEXIST')throw error;
        need((await readFile(join(outputDirectory,name))).equals(raw),'A retained screenshot has different complete bytes.');
      });
      observations.push({section,viewport:'desktop',name,bytes:raw.length,sha256:hash(raw),renderedCharacters:text.length});
    }
    await page.setViewportSize({width:390,height:844});
    for(const section of ['acquisition','handoff']){
      await page.locator('[data-ide-tab="'+section+'"]').click();
      const width=await page.evaluate(()=>({document:document.documentElement.scrollWidth,viewport:window.innerWidth}));
      need(width.document<=width.viewport+1,'The mobile document workspace overflows the viewport.');
      const raw=await page.screenshot({fullPage:true}),name='mobile-'+section+'-'+hash(raw)+'.png';
      await writeFile(join(outputDirectory,name),raw,{flag:'wx',mode:0o600}).catch(async error=>{
        if(error.code!=='EEXIST')throw error;
        need((await readFile(join(outputDirectory,name))).equals(raw),'A retained screenshot has different complete bytes.');
      });
      observations.push({section,viewport:'mobile',name,bytes:raw.length,sha256:hash(raw),width});
    }
    need(errors.length===0,'The actual installed browser raised: '+errors.join('; '));
    return {state:'COMPLETE',planId,revision,observations,pageErrors:errors,
      semantics:'Read-only browser navigation over the actual saved source/evidence workspace; no new acquisition or review was submitted.'};
  } finally {await context?.close();await browser.close();}
}
