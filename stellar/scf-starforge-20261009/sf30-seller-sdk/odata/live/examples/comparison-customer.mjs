// MIT. One original collection-pair customer operation and its receiving continuation.
import { readFile,mkdir,open,lstat,readdir,unlink } from 'node:fs/promises';
import { join,resolve,dirname,basename } from 'node:path';
import { pathToFileURL } from 'node:url';
import { spawnSync } from 'node:child_process';
import { createHash } from 'node:crypto';
import { openODataWorkspace } from '../../workspace.mjs';
import { openODataLiveOperations } from '../../live-operations.mjs';
import { startODataServer } from '../../server.mjs';
import { openCollectionComparison,restoreCollectionComparison,comparisonRetainedFiles,comparisonAnalysisMapping } from '../collection-comparison.mjs';
import { atomic,stable,writeNew } from '../../state.mjs';

const need=(condition,message)=>{if(!condition)throw new Error(message);};
const sha=raw=>createHash('sha256').update(raw).digest('hex');
const formatted=value=>Buffer.from(JSON.stringify(value,null,2)+'\n');
async function selected(path,expected){const raw=await readFile(path);
  need(raw.length===expected.bytes&&sha(raw)===expected.sha256,'The retained customer input changed: '+path);return raw;}
async function immutable(path,raw){
  await mkdir(dirname(path),{recursive:true,mode:0o700});
  try{const prior=await readFile(path);need(prior.equals(raw),'A completed customer output differs: '+path);}
  catch(error){if(error.code!=='ENOENT')throw error;
    try{await writeNew(path,raw);}catch(error){if(error.code!=='EEXIST')throw error;
      need((await readFile(path)).equals(raw),'Another customer output differs: '+path);}}
  const selected=await lstat(path),prefix=basename(path)+'.';
  // Settle only this original writer's same-inode alias after an interrupted
  // exclusive publication. Unrelated staging and retained sources stay selected.
  for(const name of await readdir(dirname(path))){
    if(!name.startsWith(prefix)||!/[.][a-f0-9-]{36}[.]part$/.test(name))continue;
    const candidate=join(dirname(path),name),info=await lstat(candidate);
    if(info.isFile()&&info.dev===selected.dev&&info.ino===selected.ino)await unlink(candidate);
  }
  const directory=await open(dirname(path),'r');try{await directory.sync();}finally{await directory.close();}
}
async function readOptional(path){try{return await readFile(path);}catch(error){if(error.code!=='ENOENT')throw error;return null;}}

export async function main(args=process.argv.slice(2)){
  const [phase,inputPath]=args;need(['prepare','receive-analysis'].includes(phase)&&inputPath,'Choose prepare or receive-analysis and the original input descriptor.');
  const input=JSON.parse(await readFile(resolve(inputPath),'utf8'));
  need(input.schema==='stellar-forge.odata-comparison-customer-input.v1','Select the original customer comparison descriptor.');
  const out=resolve(input.outputDirectory);await mkdir(out,{recursive:true,mode:0o700});
  const selection={operationId:input.operationId,baseline:input.baseline,serviceId:input.serviceId,
    beforeCollectionId:input.beforeCollectionId,beforeSha256:input.beforeSha256,expectedRows:input.expectedRows,
    afterCollectionId:input.afterCollectionId,afterFields:input.afterFields,comparisonId:input.comparisonId,title:input.title,actor:input.actor};
  const selectionSha256=sha(formatted(selection)),journalPath=join(out,'comparison-native.json');
  let journal;try{journal=JSON.parse(await readFile(journalPath,'utf8'));need(journal.selectionSha256===selectionSha256,'The original selected customer operation differs.');}
  catch(error){if(error.code!=='ENOENT')throw error;journal={schema:'stellar-forge.odata-comparison-customer-operation.v1',
    selection,selectionSha256,state:'RUNNING',steps:{},requests:{},browserErrors:[]};}
  const save=()=>atomic(journalPath,journal),progress=(phase,detail={})=>process.stdout.write(JSON.stringify({phase,...detail})+'\n');
  const file=async path=>{const raw=await readFile(path);return {path,bytes:raw.length,sha256:sha(raw)};};
  const take=async(label,operation)=>{
    if(journal.steps[label])return journal.steps[label];
    journal.active=label;await save();const result=await operation();journal.steps[label]=result;delete journal.active;await save();progress(label);return result;
  };
  const comparisonDirectory=join(out,'merchant-workspace','live','products',input.serviceId,'comparisons',input.comparisonId);
  let workspace,live,server,browser;
  async function close(){
    try{await browser?.close();}finally{browser=null;try{await server?.close();}finally{server=null;try{await live?.close();}finally{live=null;await workspace?.close();workspace=null;}}}
  }
  const cli=async(command,options)=>{
    const cliPath=resolve(new URL('../collection-comparison-cli.mjs',import.meta.url).pathname);
    const argv=[cliPath,command,...Object.entries(options).flatMap(([key,value])=>['--'+key,String(value)])];
    const result=spawnSync(process.execPath,argv,{encoding:'utf8',maxBuffer:32*1024*1024,env:process.env});
    need(result.status===0,'Original comparison CLI '+command+' failed: '+(result.stderr||result.error||''));
    return JSON.parse(result.stdout);
  };
  const reviewedRequest=async(path,decision)=>{
    const requestId=selectionSha256.slice(0,24)+':'+decision.name;
    const intent={requestId,actor:input.actor,...decision.value};
    const prior=await readOptional(path);
    if(prior){const value=JSON.parse(prior);const {expectedRevision,...observed}=value;
      need(Number.isSafeInteger(expectedRevision)&&expectedRevision>=0&&stable(observed)===stable(intent),
        'A retained original CLI review request differs.');return value;}
    const current=await openCollectionComparison(comparisonDirectory);
    const value={...intent,expectedRevision:current.reviews.revision};await immutable(path,formatted(value));return value;
  };
  try{
    if(phase==='prepare'){
      const saved=await readOptional(join(out,'comparison-prepared.json'));
      if(saved){const prepared=JSON.parse(saved);need(prepared.selectionSha256===selectionSha256,'The completed comparison preparation differs.');
        await selected(prepared.workspaceTransfer.path,prepared.workspaceTransfer);
        await selected(prepared.screenshot.path,prepared.screenshot);
        await selected(prepared.edition.sourceManifest,prepared.edition);
        await selected(prepared.earlierEdition.sourceManifest,prepared.earlierEdition);
        const reopened=await openCollectionComparison(comparisonDirectory);
        need(reopened.manifestSha256===prepared.comparisonSha256&&reopened.reviews.revision>=prepared.edition.reviewRevision,
          'The original complete comparison preparation changed.');
        if(journal.state!=='COMPLETE'){journal.state='ANALYSIS_READY';delete journal.active;await save();}
        progress('comparison-preparation-reopened',prepared.counts);return prepared;
      }
    }
    if(phase==='receive-analysis'){
      const prepared=JSON.parse(await readFile(join(out,'comparison-prepared.json'),'utf8'));
      need(input.analysisManifest&&input.analysisSourceSha256===prepared.edition.sha256,'Select the actual Analysis-held complete comparison source.');
      const result=await restoreCollectionComparison({directory:join(out,'analysis-received-comparison'),
        sourceManifest:input.analysisManifest,expectedSha256:input.analysisSourceSha256});
      need(result.manifestSha256===prepared.comparisonSha256&&result.reviews.revision===prepared.edition.reviewRevision,
        'Native analytical receiving changed the selected comparison or review.');
      const old=prepared.earlierEdition;
      const earlier=await restoreCollectionComparison({directory:result.directory,sourceManifest:old.sourceManifest,expectedSha256:old.sha256});
      need(earlier.reviews.revision===result.reviews.revision,'Receiving an earlier edition discarded later saved review work.');
      const retained=await comparisonRetainedFiles(result.directory);
      const received={comparisonSha256:result.manifestSha256,reviewRevision:result.reviews.revision,
        counts:result.counts,retainedFiles:retained.files,earlierReviewRevision:old.reviewRevision};
      await immutable(join(out,'comparison-analysis-received.json'),formatted(received));
      journal.steps['analysis-source-receiving']=received;journal.state='COMPLETE';await save();progress('comparison-native-complete',received.counts);return received;
    }
    const baseline=JSON.parse(await selected(input.baseline.path,input.baseline));
    workspace=await openODataWorkspace({directory:join(out,'merchant-workspace')});
    await workspace.restore(baseline);
    live=await openODataLiveOperations({workspace});
    const before=await live.collection({id:input.serviceId,collectionId:input.beforeCollectionId});
    need(before.manifestSha256===input.beforeSha256&&before.rows===input.expectedRows,'The selected original before collection differs.');
    const detail=await live.detail(input.serviceId),responseIds=new Map(detail.received.map(page=>[page.originalResponse.sha256,page.id]));
    const pages=before.pages.map(page=>({receivedId:responseIds.get(page.files.response.sha256)}));
    need(pages.every(page=>page.receivedId),'The original service omits a received page from the selected complete chain.');
    const after=await live.collect({id:input.serviceId,collectionId:input.afterCollectionId,
      title:'Original Orders: customer country projection',pages,fields:input.afterFields});
    need(after.rows===before.rows&&after.queryFingerprint===before.queryFingerprint,'The customer projection changed the original complete selected rows.');
    const omitted=before.mapping.filter(field=>!after.mapping.some(next=>next.path===field.path));
    need(omitted.length>0,'Select a real narrower customer projection for this worked source comparison.');
    await immutable(join(out,'comparison-input-scope.json'),formatted({
      beforeSha256:before.manifestSha256,afterSha256:after.manifestSha256,rows:before.rows,pages:before.pageCount,
      queryFingerprint:before.queryFingerprint,omittedFields:omitted.map(field=>field.path),afterFields:after.mapping.map(field=>field.path),
      meaning:'Both collections derive from the same complete original acquisition. Changes below are explicit customer projection differences.'
    }));
    server=await startODataServer({workspace,liveOperations:live,closeWorkspace:false,port:0});
    const playwright=await import(pathToFileURL(resolve(input.playwright)));
    browser=await playwright.chromium.launch({executablePath:input.chromium,headless:true,args:['--no-sandbox','--disable-dev-shm-usage','--disable-gpu']});
    const context=await browser.newContext({viewport:{width:1480,height:1050}}),page=await context.newPage();
    page.on('pageerror',error=>journal.browserErrors.push(error.message));
    let reviewLabel=null;
    await page.route('**/api/live/comparison/review',async route=>{
      const request=JSON.parse(route.request().postData()||'{}');
      need(reviewLabel,'The browser sent an unselected review operation.');
      const prior=journal.requests[reviewLabel];
      need(!prior||JSON.stringify(prior)===JSON.stringify(request),'The original browser review request body changed.');
      journal.requests[reviewLabel]=request;await save();await route.continue();
    });
    await page.goto(server.url,{waitUntil:'networkidle'});
    await page.locator('[data-section="live"]').click();
    await page.locator('[data-live-open="'+input.serviceId+'"]').click();
    await page.locator('#comparison-refresh').click();
    await page.waitForFunction(()=>document.querySelector('#comparison-before')?.options.length>0);
    const existing=(await live.comparisons({id:input.serviceId})).find(value=>value.id===input.comparisonId);
    if(existing?.status!=='COMPLETE'){
      await page.locator('#comparison-before').selectOption(input.beforeCollectionId);
      await page.locator('#comparison-after').selectOption(input.afterCollectionId);
      await page.locator('#comparison-create input[name="comparisonId"]').fill(input.comparisonId);
      await page.locator('#comparison-create input[name="title"]').fill(input.title);
      const response=page.waitForResponse(value=>value.url().endsWith('/api/live/comparison')&&value.request().method()==='POST');
      await page.locator('#comparison-create button[type="submit"]').click();need((await response).status()===200,'The original comparison create form failed.');
    }else await page.locator('[data-comparison-open="'+input.comparisonId+'"]').click();
    await page.locator('#comparison-detail h3').waitFor();
    let current=await live.comparison({id:input.serviceId,comparisonId:input.comparisonId});
    need(current.counts.matched===before.rows&&current.counts.beforeOnly===0&&current.counts.afterOnly===0&&
      current.counts.changedCells===before.rows*omitted.length&&current.counts.changes.selection_changed===current.counts.changedCells,
      'The native comparison differs from the exact original customer projection.');
    const cell=(await live.comparisonRows({id:input.serviceId,comparisonId:input.comparisonId,kind:'cells',limit:1})).rows[0];
    need(cell?.change==='selection_changed','The original changed cell is unavailable.');
    const label='browser-cell-review';reviewLabel=label;
    const savedBody=journal.requests[label];
    const prior=savedBody&&current.reviews.history.find(value=>value.requestId===savedBody.requestId);
    if(!prior){
      if(savedBody){
        const {id,comparisonId,...request}=savedBody;
        await live.reviewComparison({id,comparisonId,...request});
      }else{
        await page.locator('[data-comparison-cell="0"]').click();
        await page.locator('#comparison-review input[name="actor"]').fill(input.actor);
        await page.locator('#comparison-review select[name="status"]').selectOption('accepted');
        await page.locator('#comparison-review textarea[name="note"]').fill('This original field is outside the selected country-only customer projection. Its original before value remains retained with the complete source.');
        const response=page.waitForResponse(value=>value.url().endsWith('/api/live/comparison/review')&&value.request().method()==='POST');
        await page.locator('#comparison-review button[type="submit"]').click();need((await response).status()===200,'The original review form failed.');
      }
    }
    current=await live.comparison({id:input.serviceId,comparisonId:input.comparisonId});
    const originalRequest=journal.requests[label],review=current.reviews.history.find(value=>value.requestId===originalRequest?.requestId);
    need(review?.scope==='cell'&&review.entityKey===cell.entityKey&&review.field===cell.field,'The browser review changed its original selected cell.');
    const {id,comparisonId,...retryBody}=originalRequest;
    await immutable(join(out,'Original_Cell_Review_Request.json'),formatted(retryBody));
    const repeated=await live.reviewComparison(originalRequest);
    need(repeated.reused&&repeated.review.version===review.version,'The exact original browser review retry did not reopen its saved version.');
    await page.locator('#comparison-detail').scrollIntoViewIfNeeded();
    await take('browser-comparison-screenshot',async()=>{
      const path=join(out,'OData_Collection_Comparison.png'),prior=await readOptional(path);
      if(prior)need(prior.subarray(0,8).equals(Buffer.from([137,80,78,71,13,10,26,10]))&&
        prior.subarray(-12).equals(Buffer.from([0,0,0,0,73,69,78,68,174,66,96,130])),'The original selected screenshot is incomplete.');
      else await immutable(path,await page.screenshot());
      return file(path);
    });
    need(journal.browserErrors.length===0,'The original operator produced a browser error: '+journal.browserErrors.join('; '));
    await close();
    const decisions=[
      ['entity',{scope:'entity',entityKey:cell.entityKey,status:'note',note:'The same original key remains present on both sides. The changed cells describe selected fields, while the original row identity is unchanged.'}],
      ['column',{scope:'column',field:cell.field,status:'investigate',note:'The complete customer comparison retains this original field as field_not_selected on the country-only side. Reintroduce it in a new selected collection if the customer needs it.'}],
      ['comparison',{scope:'comparison',status:'accepted',note:'Both sides retain all original rows and the same source query. This review accepts the explicit narrower country projection and retains every original input and null state.'}]
    ];
    for(const [name,decision]of decisions){
      await take('cli-review-'+name,async()=>{
        const path=join(out,'Review_'+name+'.json'),request=await reviewedRequest(path,{name,value:decision});
        const result=await cli('review',{directory:comparisonDirectory,input:path});return {request,review:result.review};
      });
    }
    const retry=await cli('review',{directory:comparisonDirectory,input:join(out,'Original_Cell_Review_Request.json')});
    need(retry.reused&&retry.review.version===review.version,'The original CLI retry created another review version.');
    const earlierEdition=await take('publish-first-reviewed-edition',async()=>{
      const value=await openCollectionComparison(comparisonDirectory);
      return cli('publish',{directory:comparisonDirectory,revision:value.reviews.revision});
    });
    await selected(earlierEdition.sourceManifest,earlierEdition);
    await take('later-customer-review',async()=>{
      const path=join(out,'Review_handover.json'),request=await reviewedRequest(path,{name:'handover',value:{
        scope:'comparison',status:'note',
        note:'Customer handover includes the complete original source pair, the earlier reviewed edition and this later receiving note. An older matching edition must preserve this later review.'}});
      const result=await cli('review',{directory:comparisonDirectory,input:path});return {request,review:result.review};
    });
    const edition=await take('publish-complete-customer-edition',async()=>{
      const value=await openCollectionComparison(comparisonDirectory);
      return cli('publish',{directory:comparisonDirectory,revision:value.reviews.revision});
    });
    await selected(edition.sourceManifest,edition);
    const standalone=await cli('restore',{manifest:edition.sourceManifest,sha256:edition.sha256,out:join(out,'received-comparison')});
    const older=await cli('restore',{manifest:earlierEdition.sourceManifest,sha256:earlierEdition.sha256,out:join(out,'received-comparison')});
    need(older.reviews.revision===standalone.reviews.revision&&older.manifestSha256===standalone.manifestSha256,
      'The earlier analytical edition changed the later receiving review.');
    const rows=await cli('rows',{directory:join(out,'received-comparison'),kind:'cells',offset:0,limit:100});
    need(rows.comparisonSha256===current.manifestSha256&&rows.total===current.counts.changedCells,'The received original comparison row selection differs.');
    workspace=await openODataWorkspace({directory:join(out,'merchant-workspace')});
    const transferPath=join(out,'OData_Comparison_Workspace.json');
    await take('publish-workspace-transfer',async()=>{
      const current=await workspace.backup(),prior=await readOptional(transferPath);
      if(prior){
        const retained=JSON.parse(prior),normalize=value=>({...value,exportedAt:null,files:[...value.files].sort((a,b)=>a.path<b.path?-1:a.path>b.path?1:0)});
        need(stable(normalize(retained))===stable(normalize(current)),'The retained complete workspace transfer differs from the selected original state.');
      }else await immutable(transferPath,formatted(current));
      return file(transferPath);
    });
    await selected(transferPath,journal.steps['publish-workspace-transfer']);await workspace.close();workspace=null;
    workspace=await openODataWorkspace({directory:join(out,'received-odata-workspace')});
    server=await startODataServer({workspace,closeWorkspace:false,port:0});
    browser=await playwright.chromium.launch({executablePath:input.chromium,headless:true,args:['--no-sandbox','--disable-dev-shm-usage','--disable-gpu']});
    const receivedPage=await browser.newPage({viewport:{width:1480,height:1050}});
    receivedPage.on('pageerror',error=>journal.browserErrors.push(error.message));
    await receivedPage.goto(server.url,{waitUntil:'networkidle'});
    const response=receivedPage.waitForResponse(value=>value.url().endsWith('/api/restore')&&value.request().method()==='POST');
    await receivedPage.locator('#restore-file').setInputFiles(transferPath);
    const restoredResponse=await response;need(restoredResponse.status()===200,'The original complete workspace Restore control failed.');
    const restored=await restoredResponse.json();
    need(restored.comparisons===1&&restored.collections>=2,'The complete original workspace restore omitted the selected collections or comparison.');
    const receivingLive=await openODataLiveOperations({workspace});
    try{const received=await receivingLive.comparison({id:input.serviceId,comparisonId:input.comparisonId});
      need(received.manifestSha256===current.manifestSha256&&received.reviews.revision===edition.reviewRevision,'The original received workspace comparison changed.');
      const original=await receivingLive.collection({id:input.serviceId,collectionId:input.beforeCollectionId});
      need(original.manifestSha256===input.beforeSha256,'The customer operation changed its original retained baseline collection.');
    }finally{await receivingLive.close();}
    await close();
    const inventory=await comparisonRetainedFiles(comparisonDirectory);
    const mapping=comparisonAnalysisMapping('customer_orders_comparison',1);
    await immutable(join(out,'comparison-mapping.json'),formatted(mapping));
    const prepared={schema:'stellar-forge.odata-comparison-customer-prepared.v1',operationId:input.operationId,
      selectionSha256,comparisonSha256:current.manifestSha256,counts:current.counts,
      before:{sha256:before.manifestSha256,rows:before.rows},after:{sha256:after.manifestSha256,rows:after.rows},
      omittedFields:omitted.map(field=>field.path),edition,earlierEdition,mapping,workspaceRestore:restored,
      originalReviewRetry:{requestId:review.requestId,version:review.version,reused:retry.reused},
      retainedFiles:inventory.files,browserErrors:journal.browserErrors,
      workspaceTransfer:await file(transferPath),screenshot:await file(join(out,'OData_Collection_Comparison.png'))};
    await immutable(join(out,'comparison-prepared.json'),formatted(prepared));
    journal.state='ANALYSIS_READY';delete journal.active;await save();progress('comparison-ready-for-analysis',prepared.counts);return prepared;
  }catch(error){journal.state='NEEDS_ATTENTION';journal.error={name:error.name,code:error.code??null,message:error.message};await save();throw error;}
  finally{await close();}
}
if(process.argv[1]&&import.meta.url===pathToFileURL(resolve(process.argv[1])).href)
  main().catch(error=>{process.stderr.write(JSON.stringify({error:error.code??'ODATA_COMPARISON_CUSTOMER_FAILED',message:error.message,stack:error.stack})+'\n');process.exitCode=1;});
