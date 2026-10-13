import { mkdirSync, existsSync } from 'node:fs';
import { join } from 'node:path';
import { pathToFileURL } from 'node:url';
import { assert, canonical } from './model.mjs';
import { hashOriginalFile } from './delivery.mjs';

/** Real Applications navigation over the saved application and its original run. */
export async function openInstalledRozoBrowser({
  directory, startup, application, expectedWorkspace, chromium, playwrightModule,
  onArtifact=()=>{}, onStopRequest=()=>{}
}){
  assert(chromium&&playwrightModule,'APPLICATIONS_BROWSER_RUNTIME',
    'Supply the existing Chromium executable and Playwright module.',409);
  const module=await import(pathToFileURL(playwrightModule).href),playwright=module.chromium?module:module.default;
  assert(playwright?.chromium,'APPLICATIONS_BROWSER_RUNTIME','The selected Playwright module has no Chromium export.');
  mkdirSync(directory,{recursive:true,mode:0o700});
  const browser=await playwright.chromium.launch({executablePath:chromium,headless:true,args:['--no-sandbox','--disable-dev-shm-usage']});
  const context=await browser.newContext({viewport:{width:1440,height:1000},acceptDownloads:true}),page=await context.newPage(),errors=[];
  page.on('pageerror',error=>errors.push(error.message));
  let product,closed=false;
  const artifact=async(target,name)=>{
    const path=join(directory,name);
    if(!existsSync(path))await target.screenshot({path,fullPage:true});
    const value={name,path,...hashOriginalFile(path)};await onArtifact(value);return value;
  };
  const select=async()=>{
    await page.locator('button[data-view="applications"]').click();
    const selected=page.locator('#application-library-results [data-application-id="'+application.id+'"]');
    await selected.waitFor({state:'visible',timeout:30000});await selected.click();
    await page.locator('#applications-workspace').getByRole('heading',{name:application.label,exact:true}).waitFor({state:'visible'});
  };
  try{
    await page.goto(startup.url,{waitUntil:'domcontentloaded'});
    await page.locator('button[data-view="applications"]').waitFor({state:'visible'});
    await select();
    const open=page.getByRole('link',{name:'Open application',exact:true});await open.waitFor({state:'visible',timeout:30000});
    const href=await open.getAttribute('href');
    assert(href===application.current.privateUrl,'APPLICATIONS_BROWSER_BINDING','The actual Open control names another retained run.',409);
    await artifact(page,'Applications_Running.png');
    [product]=await Promise.all([context.waitForEvent('page',{timeout:30000}),open.click()]);
    product.on('pageerror',error=>errors.push(error.message));
    await product.waitForLoadState('domcontentloaded');
    await product.locator('#navigation button').first().waitFor({state:'visible',timeout:30000});
    const address=new URL(href),token=new URLSearchParams(address.hash.slice(1)).get('session');
    const observed=await product.evaluate(async token=>{
      const response=await fetch('/api/state',{headers:{'X-Rozo-Session':token}});
      return {status:response.status,value:await response.json()};
    },token);
    assert(observed.status===200&&observed.value.schema==='stellar-forge.rozo-payments-state.v1'&&
      observed.value.workspace.workspaceId===expectedWorkspace.workspaceId&&observed.value.workspace.originId===expectedWorkspace.originId,
      'APPLICATIONS_BROWSER_WORKSPACE','The installed browser did not open the same original ROZO workspace.',409);
    await artifact(product,'ROZO_Installed_Workspace.png');
    await page.setViewportSize({width:430,height:920});
    await artifact(page,'Applications_Narrow.png');
    await page.setViewportSize({width:1440,height:1000});
    assert(errors.length===0,'APPLICATIONS_BROWSER_SCRIPT','The installed staff interface raised a script error.',500,{errors});
    const receipt={schema:'stellar-forge.rozo-installed-browser.v1',applicationId:application.id,
      applicationRevision:application.revision,operationId:application.current.id,
      workspaceId:observed.value.workspace.workspaceId,originId:observed.value.workspace.originId,
      sourceIdentity:observed.value.sourceIdentity,openedOriginalControl:true};
    return {
      receipt,
      async stop(original){
        assert(original.applicationId===application.id&&original.operationId===application.current.id,
          'APPLICATIONS_STOP_IDENTITY','Stop must retain the original application run.',409);
        const route='**/api/applications/stop';
        let seen=false;
        const intercept=async request=>{
          const body=request.request().postDataJSON();
          assert(canonical(body)===canonical(original),'APPLICATIONS_STOP_IDENTITY','The Stop control changed the original run.',409);
          await onStopRequest(body);seen=true;await request.continue();
        };
        await page.route(route,intercept);
        try{
          const [accepted]=await Promise.all([
            page.waitForResponse(r=>new URL(r.url()).pathname==='/api/applications/stop'&&r.request().method()==='POST',{timeout:30000}),
            page.getByRole('button',{name:'Stop application',exact:true}).click()
          ]);
          const value=await accepted.json();
          assert(seen&&accepted.ok(),'APPLICATIONS_STOP_RESPONSE','The original Stop request requires reconciliation.',409,{status:accepted.status(),value});
          return {status:accepted.status(),value};
        }finally{await page.unroute(route,intercept);}
      },
      async stopped(){
        await page.reload({waitUntil:'domcontentloaded'});await select();
        await page.getByRole('link',{name:'Open application',exact:true}).waitFor({state:'hidden',timeout:30000});
        return artifact(page,'Applications_Stopped.png');
      },
      async close(){if(closed)return;closed=true;await browser.close();}
    };
  }catch(error){await browser.close();throw error;}
}
