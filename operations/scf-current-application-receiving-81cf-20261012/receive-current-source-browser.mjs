// MIT. Continue the current source case through its existing browser and writers.
// The equipped owner supplies its running source-selected page and keeps the
// original process, archive and guarded same-case save.
import { readFile, writeFile, mkdir, open, link, unlink } from 'node:fs/promises';
import { resolve, dirname, join, relative, isAbsolute } from 'node:path';
import { pathToFileURL } from 'node:url';
import { createHash, randomUUID } from 'node:crypto';

const OPERATION='SCF-GRANT-CURRENT-REVIEW-81CF-20261012';
const sha=value=>createHash('sha256').update(value).digest('hex');
const same=(left,right)=>JSON.stringify(left)===JSON.stringify(right);
const json=value=>JSON.stringify(value,null,2)+'\n';
const need=(value,message)=>{if(!value)throw new Error(message);};


async function retainedJSON(path){
  try{return JSON.parse(await readFile(path,'utf8'));}
  catch(error){if(error.code==='ENOENT')return null;throw error;}
}

// A complete receipt becomes visible in one link operation. An interrupted
// partial temporary file is never interpreted as an issued or accepted save.
async function retainJSON(path,value){
  const body=json(value),temporary=path+'.'+randomUUID()+'.tmp';
  const existing=await retainedJSON(path);
  if(existing!==null){need(same(existing,value),'Keep the different retained receipt: '+path);return existing;}
  let handle;
  try{
    handle=await open(temporary,'wx',0o600);await handle.writeFile(body);await handle.sync();
    await handle.close();handle=null;
    try{await link(temporary,path);}
    catch(error){if(error.code!=='EEXIST')throw error;
      need(same(await retainedJSON(path),value),'Keep the different retained receipt: '+path);}
    const directory=await open(dirname(path),'r');
    try{await directory.sync();}finally{await directory.close();}
    return value;
  }finally{
    if(handle)await handle.close().catch(()=>{});
    await unlink(temporary).catch(error=>{if(error.code!=='ENOENT')throw error;});
  }
}

// Reconcile the effect of the original CAS writer, never another draft version.
// The actual selected model supplies retainVersion; its saved timestamp comes
// from the observed native record rather than a new time or fabricated request.
function workingSaveDisposition(intent,candidate,retainVersion){
  const before=intent.before;
  need(candidate&&candidate.id===before.id,'Reconnect to the original browser save record.');
  if(same(candidate,before))return 'pending';
  need(candidate.revision===before.revision+1&&
    Array.isArray(candidate.input?.versions)&&
    candidate.input.versions.length===before.input.versions.length+1,
    'The original browser record has later or different work. Preserve it before continuing this save.');
  const version=candidate.input.versions.at(-1);
  need(typeof version.savedAt==='string'&&Number.isFinite(Date.parse(version.savedAt))&&
    typeof candidate.updatedAt==='string'&&Number.isFinite(Date.parse(candidate.updatedAt)),
    'Keep the actual original saved-version and native record timestamps.');
  const input=retainVersion(before.input,'Saved submission version',version.savedAt);
  const expected={id:before.id,revision:before.revision+1,
    name:input.folder||'Untitled merchant',
    resources:Array.isArray(input.resources)?input.resources.length:0,
    updatedAt:candidate.updatedAt,input};
  need(same(candidate,expected),
    'The next browser revision differs from the original working save. Preserve every later edit.');
  return 'complete';
}

export async function receiveCurrentSourceBrowser(page,{
  inputPath,outputDirectory,expectedOrigin,ownedProcesses=[],checkpoint=null
}={}){
  const actualInputPath=resolve(inputPath);
  const selectedInput=JSON.parse(await readFile(actualInputPath,'utf8'));
  const input={...selectedInput};
  need(input.schema==='stellar-forge.source-package-browser-receiving-input.v1'&&
    input.operationId===OPERATION,'Continue the original current-source browser input.');
  const inputRelative=input.caseRelativeInput||'receiving/source-package-continuation/browser-receiving-input.json';
  need(typeof inputRelative==='string'&&!isAbsolute(inputRelative)&&
    !inputRelative.includes('\\')&&inputRelative.split('/').every(part=>part&&part!=='.'&&part!=='..')&&
    inputRelative.endsWith('/browser-receiving-input.json'),
    'Retain the exact source phase input location inside this same case.');
  const inputParts=inputRelative.split('/');
  const caseUp=Array(inputParts.length-1).fill('..');
  const selectedCase=resolve(dirname(input.currentDraftPath),...caseUp);
  const currentCase=resolve(dirname(actualInputPath),...caseUp);
  need(relative(currentCase,actualInputPath)===inputRelative&&
    relative(selectedCase,input.currentDraftPath)===inputParts.slice(0,-1).join('/')+'/draft.json',
    'Open the actual retained source-phase input and complete draft location.');
  // Archive reopening changes locations while retaining the same source and case.
  for(const key of ['sourceRoot','currentDraftPath','currentReviewPath','sourcePackagePath',
    'originalRecordPath','originalDraftPath','originalReviewPath']){
    need(typeof input[key]==='string'&&isAbsolute(input[key]),
      'Retain the original absolute case location for '+key+'.');
    const within=relative(selectedCase,input[key]);
    need(within&&!isAbsolute(within)&&within!=='..'&&!within.startsWith('../'),
      'Select '+key+' within the original retained case.');
    input[key]=resolve(currentCase,within);
  }
  const origin=new URL(expectedOrigin).origin;
  need(/^https:\/\//.test(origin)||/^http:\/\/(127\.0\.0\.1|localhost|\[::1\])(?::\d+)?$/.test(origin),
    'Use the existing secure or loopback source-selected reader.');
  const output=resolve(outputDirectory||join(dirname(actualInputPath),'browser'));
  await mkdir(output,{recursive:true,mode:0o700});
  const stages=ownedProcesses.length?[{name:'browser-process-started',at:new Date().toISOString(),owned_processes:ownedProcesses}]:[];
  const files=[],pageErrors=[];
  need(checkpoint===null||typeof checkpoint==='function','Use the original equipped browser checkpoint callback.');
  let independent=null,releaseRead=null,readRoute=null;
  const applicationURL=new URL('/grant-data/application.md',origin).href;
  const write=async(name,body)=>{
    const path=join(output,name);await mkdir(dirname(path),{recursive:true,mode:0o700});
    await writeFile(path,body,{mode:0o600});
    const result={path:name,bytes:Buffer.byteLength(body),sha256:sha(body)};
    files.push(result);return result;
  };
  const stage=async(name,details={})=>{
    const entry={name,at:new Date().toISOString(),...details};stages.push(entry);
    await writeFile(join(output,'progress.json'),json({operationId:OPERATION,stages}),{mode:0o600});
    if(checkpoint)await checkpoint();
    console.log('SCF_CURRENT_SOURCE_BROWSER '+name);
  };
  const onError=error=>pageErrors.push({stage:stages.at(-1)?.name||'START',message:error.message});
  page.on('pageerror',onError);
  const settle=async(p,kind='editor')=>{
    const root=kind==='review'?'#review-workspace':'#workspace-root';
    const error=kind==='review'?'#review-error':'#error';
    await p.waitForFunction(selector=>{
      const value=document.querySelector(selector);return value&&!value.inert;
    },root,{timeout:30000});
    if(await p.locator(error).isVisible())throw new Error(await p.locator(error).textContent());
  };
  const choose=async(p,button,text,name)=>{
    const selected=p.waitForEvent('filechooser',{timeout:30000});
    await button.click();await (await selected).setFiles({
      name,mimeType:'application/json',buffer:Buffer.from(text)
    });
  };
  const download=async(p,button,name)=>{
    const selected=p.waitForEvent('download',{timeout:30000});await button.click();
    const item=await selected,stream=await item.createReadStream();
    need(stream,'Open the complete browser download: '+name);
    const parts=[];let size=0;
    for await(const part of stream){size+=part.length;need(size<=80*1024*1024,
      'Keep the browser export within its original receiving allowance.');parts.push(part);}
    need(!(await item.failure()),'Complete the original browser export: '+name);
    const body=Buffer.concat(parts);await write('downloads/'+name,body);await item.delete();
    return body.toString('utf8');
  };
  const record=async(p,kind='editor')=>{
    await settle(p,kind);
    const selector=kind==='review'?'#review-workspace':'#workspace-root';
    const attribute=kind==='review'?'data-review-record-id':'data-saved-draft-id';
    const id=await p.locator(selector).getAttribute(attribute);
    need(id,'Save the current complete '+kind+' through its original writer.');
    const found=await p.evaluate(async key=>(await import('./drafts.mjs')).loadDraft(key),id);
    need(found?.input,'Retain the actual local '+kind+' binding.');
    return found;
  };
  const openSavedDraft=async(p,id)=>{
    await p.locator('#view').selectOption('saved');
    const row=p.locator('#editor article[data-saved-draft-id="'+id+'"]');
    await row.getByRole('button',{name:'Open this draft',exact:true}).click();
    await settle(p);return record(p);
  };
  const reopenReview=async(p,saved)=>{
    const target=new URL(input.routes.review,origin);
    target.searchParams.set('review',saved.id);
    await p.goto(target.href,{waitUntil:'domcontentloaded'});
    await settle(p,'review');return record(p,'review');
  };
  const retainedSave=(before,after)=>{
    for(const key of Object.keys(before))if(!['versions','updatedAt'].includes(key))
      need(same(after[key],before[key]),'Browser saving changed the authored '+key+'.');
    need(after.versions.length>=before.versions.length&&
      same(after.versions.slice(0,before.versions.length),before.versions),
      'Retain every full preceding working version.');
  };
  try{
    const sourceRoot=resolve(input.sourceRoot),dist=join(sourceRoot,'stellar-forge/developer-site/dist');
    const [draftText,roundText,packageText,originalRecordText,resultText,manifestText]=await Promise.all([
      readFile(input.currentDraftPath,'utf8'),readFile(input.currentReviewPath,'utf8'),
      readFile(input.sourcePackagePath,'utf8'),readFile(input.originalRecordPath,'utf8'),
      readFile(join(dirname(input.currentDraftPath),'RESULT.json'),'utf8'),
      readFile(join(dirname(sourceRoot),'manifest.json'),'utf8')
    ]);
    const result=JSON.parse(resultText),manifest=JSON.parse(manifestText);
    need(result.state==='COMPLETE'&&result.operationId===OPERATION&&
      result.sourcePackageSha256===input.sourcePackageSha256,
      'Open the independently completed current native source phase.');
    need(sha(packageText)===input.sourcePackageSha256,
      'Select the same complete native reviewer source package.');
    const handover=await import(pathToFileURL(join(dist,'grant-handover-source.mjs')));
    const submission=await import(pathToFileURL(join(dist,'grant-submission-core.mjs')));
    const review=await import(pathToFileURL(join(dist,'grant-review-round-core.mjs')));
    const currentDraft=await handover.openDraftEnvelope(draftText);
    const currentRound=await review.importReviewRound(roundText);
    const currentView=await review.reviewRoundView(currentRound);
    const packageSource=await handover.openReviewerSourcePackage(packageText);
    need(currentRound.id===result.originalReviewId&&currentDraft.id===result.originalDraftId&&
      currentRound.events.length===result.reviewActions,
      'Continue the same original completed draft and review history.');
    need(same(JSON.parse(currentView.capture.exportText).draft,currentDraft),
      'Retain the actual full submission selected by the current review.');
    need(currentDraft.handover.selection.bundleId===packageSource.bundle.id,
      'Open the actual selected four-file source edition.');

    const saveSelection={operationId:OPERATION,phaseId:input.phaseId,origin,
      sourcePackageSha256:input.sourcePackageSha256,reviewedDraftSHA256:sha(draftText),
      originalBrowserRecordSHA256:sha(originalRecordText),originalDraftId:currentDraft.id};
    const saveIntentPath=join(output,'working-save-intent.json');
    const saveReceiptPath=join(output,'working-save-accepted.json');
    let saveIntent=await retainedJSON(saveIntentPath),saveReceipt=await retainedJSON(saveReceiptPath);
    if(saveIntent){
      need(saveIntent.schema==='stellar-forge.current-source-working-save.v1'&&
        same(saveIntent.selection,saveSelection)&&
        saveIntent.before?.id&&Number.isSafeInteger(saveIntent.before.revision)&&
        saveIntent.before.revision>=1&&same(saveIntent.before.input,currentDraft),
        'Keep the original complete save preimage and its selected native edition.');
    }
    if(saveReceipt)need(saveIntent&&
      saveReceipt.schema==='stellar-forge.current-source-working-save-accepted.v1'&&
      same(saveReceipt.selection,saveSelection)&&
      workingSaveDisposition(saveIntent,saveReceipt.record,submission.retainVersion)==='complete',
      'Retain the accepted result of this exact original browser save.');

    const completed=await retainedJSON(join(output,'RESULT.json'));
    if(completed){
      need(completed.state==='COMPLETE'&&completed.operationId===OPERATION&&
        completed.phaseId===input.phaseId&&completed.origin===origin&&
        completed.sourcePackageSha256===input.sourcePackageSha256&&
        completed.reviewedDraftSHA256===sha(draftText)&&
        completed.originalDraftId===currentDraft.id&&completed.originalReviewId===currentRound.id&&
        completed.retainedReviewActions===currentRound.events.length&&Array.isArray(completed.files),
        'Keep the completed original browser result for its own source selection.');
      for(const selected of completed.files){
        need(typeof selected.path==='string'&&!isAbsolute(selected.path)&&
          !selected.path.includes('\\')&&selected.path.split('/').every(p=>p&&p!=='.'&&p!=='..'),
          'Retain each complete browser output inside its original directory.');
        const body=await readFile(join(output,selected.path));
        need(body.length===selected.bytes&&sha(body)===selected.sha256,
          'Retain the complete original browser output: '+selected.path);
      }
      return completed;
    }
    const retainAccepted=async candidate=>{
      need(workingSaveDisposition(saveIntent,candidate,submission.retainVersion)==='complete',
        'Accept only the exact committed original working save.');
      // Preserve the observed committed browser store before publishing its
      // portable acceptance receipt, so a receipt never advances that snapshot.
      if(checkpoint)await checkpoint();
      const accepted={schema:'stellar-forge.current-source-working-save-accepted.v1',
        selection:saveSelection,record:candidate};
      await retainJSON(saveReceiptPath,accepted);saveReceipt=accepted;
      // The portable native record is preserved before any remaining export.
      await retainJSON(join(output,'saved-submission-record.json'),candidate);
      return candidate;
    };

    // Verify this already running listener serves the same selected current code
    // and complete reviewer files before it writes anything in the browser.
    const routes=['/grant-submission.html','/grant-submission-workspace.mjs',
      '/grant-review-round.html','/grant-review-round-workspace.mjs',
      '/grant-review-round-core.mjs','/grant-submission-core.mjs','/drafts.mjs',
      '/grant-data/application.md','/grant-data/source-index.json',
      '/grant-data/budget.csv','/grant-data/product-and-finance.md'];
    const hasReviewerPaths=Object.hasOwn(input,'reviewerPaths');
    need(hasReviewerPaths===Object.hasOwn(manifest.selection||{},'reviewerPaths')&&
      (!hasReviewerPaths||(input.reviewerPaths&&typeof input.reviewerPaths==='object'&&
        !Array.isArray(input.reviewerPaths)&&same(input.reviewerPaths,manifest.selection.reviewerPaths))),
      'Use the exact reviewer path selection retained in the complete native source edition.');
    if(hasReviewerPaths){
      const expectedRoles=['application','source-index','budget','product-and-finance'];
      need(same(Object.keys(input.reviewerPaths).sort(),expectedRoles.slice().sort()),
        'Retain exactly four selected reviewer carrier paths.');
      const selectedPaths=expectedRoles.map(role=>input.reviewerPaths[role]);
      need(new Set(selectedPaths).size===4,'Select each original reviewer carrier file once.');
      for(const selectedPath of selectedPaths){
        const prefix='stellar-forge/developer-site/dist/';
        need(typeof selectedPath==='string'&&selectedPath.startsWith(prefix+'grant-data/')&&
          !selectedPath.includes('\\')&&
          !selectedPath.includes(String.fromCharCode(0))&&
          selectedPath.split('/').every(part=>part&&part!=='.'&&part!=='..'),
          'Select an exact source-relative reviewer file.');
        routes.push('/'+selectedPath.slice(prefix.length).split('/').map(encodeURIComponent).join('/'));
      }
    }
    for(const route of new Set(routes)){
      const selected=manifest.files.find(row=>row.path==='stellar-forge/developer-site/dist'+decodeURIComponent(route));
      need(selected,'Retain the selected native source for '+route);
      const response=await page.request.get(new URL(route,origin).href);
      need(response.ok(),'Open the existing source-selected route: '+route);
      const body=await response.body();
      need(body.length===selected.bytes&&sha(body)===selected.sha256,
        'The running listener differs from the selected current source: '+route);
    }
    await stage('current-native-case-and-running-reader',{
      sourceRecords:input.sourceRecords,draftId:currentDraft.id,reviewId:currentRound.id,
      reviewActions:currentRound.events.length,reviewStatus:currentView.status
    });

    // Delay the real first source request, retaining its actual local response.
    // This opens the existing saved record while the original reader is pending.
    let encountered;
    const started=new Promise(resolveStarted=>{encountered=resolveStarted;});
    const released=new Promise(resolveRead=>{releaseRead=resolveRead;});
    readRoute=async route=>{encountered();await released;await route.continue();};
    await page.route(applicationURL,readRoute,{times:1});
    await page.goto(new URL(input.routes.editor,origin).href,{waitUntil:'domcontentloaded'});
    let requestTimer;
    try{await Promise.race([started,new Promise((_,reject)=>{requestTimer=setTimeout(
      ()=>reject(new Error('Open the actual pending published-source request.')),30000);})]);}
    finally{clearTimeout(requestTimer);}
    await settle(page);
    need(await page.locator('#workspace-root').getAttribute('data-source-read-state')==='reading',
      'Keep the saved-draft controls available during the actual source read.');
    const originRecord=JSON.parse(originalRecordText);
    let local;
    if(saveIntent){
      const candidate=await page.evaluate(async id=>(await import('./drafts.mjs')).loadDraft(id),saveIntent.before.id);
      const disposition=workingSaveDisposition(saveIntent,candidate,submission.retainVersion);
      if(saveReceipt)need(same(candidate,saveReceipt.record),'The accepted browser record has later edits; preserve them unchanged.');
      if(disposition==='complete')await retainAccepted(candidate);
      local={record:candidate,mode:saveIntent.bindingMode};
    }else local=await page.evaluate(async ({draft,original})=>{
      const store=await import('./drafts.mjs');
      const same=(a,b)=>JSON.stringify(a)===JSON.stringify(b);
      const prior=await store.loadDraft(original.id);
      if(prior){
        if(same(prior.input,draft))return {record:prior,mode:'existing-current-record'};
        if(prior.revision!==original.revision||!same(prior.input,original.input))
          throw new Error('The original browser record advanced. Open its current saved work before receiving this edition.');
        return {record:await store.saveDraft({id:prior.id,revision:prior.revision,input:draft}),
          mode:'received-original-record'};
      }
      const current=[];
      for(const metadata of await store.listDrafts())if(metadata.name===draft.folder){
        const candidate=await store.loadDraft(metadata.id);
        if(candidate&&same(candidate.input,draft))current.push(candidate);
      }
      if(current.length>1)throw new Error('Multiple current local bindings exist. Keep each original record and select its retained save intent.');
      if(current.length===1)return {record:current[0],mode:'existing-current-record'};
      return {record:await store.saveDraft({input:draft}),mode:'new-local-binding'};
    },{draft:currentDraft,original:originRecord});
    const opened=await openSavedDraft(page,local.record.id);
    need(same(opened,local.record),'Open the entire selected native or reconciled working record in the original editor.');
    const openedView=await page.locator('#view').inputValue();
    releaseRead();releaseRead=null;
    await page.waitForFunction(()=>document.querySelector('#workspace-root')?.dataset.sourceReadState==='idle',
      null,{timeout:30000});
    await settle(page);
    const afterRead=await record(page);
    need(afterRead.id===opened.id&&afterRead.revision===opened.revision&&
      same(afterRead.input,opened.input)&&await page.locator('#view').inputValue()===openedView,
      'A late published-source response changed the selected saved draft or view.');
    await stage('saved-draft-opened-during-original-source-read',{
      recordId:opened.id,revision:opened.revision,bindingMode:local.mode
    });

    await page.locator('#view').selectOption('source');await settle(page);
    await choose(page,page.getByRole('button',{name:'Open source package',exact:true}),
      packageText,'Current_Complete_Source_Package.json');await settle(page);
    need(await page.locator('[data-reviewer-source-bundle-id="'+packageSource.bundle.id+'"]').count()>0,
      'Open all four selected reviewer files in the original source view.');
    const openedPackage=await download(page,
      page.getByRole('button',{name:'Download source package',exact:true}),
      'Current_Reviewer_Source_Package.json');
    const reopenedPackage=await handover.openReviewerSourcePackage(openedPackage);
    need(same(reopenedPackage.bundle,packageSource.bundle)&&
      same(reopenedPackage.objects,packageSource.objects),
      'Retain the complete original four-file package through the browser export.');
    let saved;
    if(saveReceipt){
      saved=await record(page);
      need(same(saved,saveReceipt.record),'Preserve the accepted record and any genuine later edit.');
    }else{
      const before=await record(page);
      need(same(before,opened)&&same(before.input,currentDraft),
        'Keep the complete original record and revision before its working save.');
      const beforeText=await download(page,page.locator('#export-draft'),'Before_Original_Working_Save.json');
      need(same(await handover.openDraftEnvelope(beforeText),before.input),
        'Preserve a later unsaved edit instead of saving a different body.');
      const intent={schema:'stellar-forge.current-source-working-save.v1',
        selection:saveSelection,bindingMode:local.mode,before};
      await retainJSON(saveIntentPath,intent);saveIntent=intent;
      if(checkpoint)await checkpoint();
      await page.locator('#save').click();await settle(page);
      saved=await record(page);
      await retainAccepted(saved);
    }
    retainedSave(currentDraft,saved.input);
    // Include the immutable save journal in this complete portable result on
    // both first execution and recovery after a committed but unreported save.
    for(const name of ['working-save-intent.json','working-save-accepted.json','saved-submission-record.json']){
      const body=await readFile(join(output,name));
      files.push({path:name,bytes:body.length,sha256:sha(body)});
    }
    const workingText=await download(page,page.locator('#export-draft'),'Current_Browser_Submission.json');
    need(same((await handover.openDraftEnvelope(workingText)),saved.input),
      'Export the entire saved working draft.');
    const comparison=await review.compareReviewDraft(currentRound,
      await review.readSubmissionExport(workingText,{fileName:'Current_Browser_Submission.json'}));
    need(comparison.rows.every(row=>row.change==='unchanged'),
      'The browser working save changed source-specific reviewed content.');
    await write('reviewed-working-version-comparison.json',json(comparison));
    await page.locator('#view').selectOption('answers');
    await page.locator('#format').selectOption('markdown');await settle(page);
    const answers=await download(page,page.locator('#export-answers'),'Current_Application_Answers.md');
    need(answers===submission.applicationOutput(saved.input,{format:'markdown'}),
      'Retain the exact complete working answers in the customer export.');
    await page.reload({waitUntil:'domcontentloaded'});await settle(page);
    const reopened=await openSavedDraft(page,saved.id);
    need(same(reopened,saved),'Reopen the same complete original browser draft record.');
    await retainJSON(join(output,'saved-submission-record.json'),reopened);
    await write('origin-and-local-binding.json',json({
      operationId:OPERATION,phaseId:input.phaseId,
      originalBrowserBinding:input.originalBrowserBinding,
      localBrowserBinding:{id:saved.id,revision:saved.revision,mode:local.mode},
      nativeReviewedDraftSHA256:sha(draftText),browserWorkingDraftSHA256:sha(workingText),
      unchangedReviewedTargets:comparison.rows.length
    }));
    await stage('complete-source-working-save-and-reopen',{
      recordId:saved.id,revision:saved.revision,versions:saved.input.versions.length,
      retainedNativeReviewActions:currentRound.events.length
    });

    await page.goto(new URL(input.routes.review,origin).href,{waitUntil:'domcontentloaded'});
    await settle(page,'review');
    const reviewSelection={...saveSelection,originalReviewId:currentRound.id,
      reviewSHA256:sha(roundText)};
    const reviewIntentPath=join(output,'review-save-intent.json');
    const reviewReceiptPath=join(output,'review-save-accepted.json');
    const reviewRecordPath=join(output,'saved-review-record.json');
    let reviewIntent=await retainedJSON(reviewIntentPath);
    const reviewReceipt=await retainedJSON(reviewReceiptPath);
    const retainedReview=await retainedJSON(reviewRecordPath);
    const localReviews=async()=>page.evaluate(async reviewId=>{
      const store=await import('./drafts.mjs'),metadata=await store.listDrafts(),records=[];
      for(const row of metadata){
        const value=await store.loadDraft(row.id);
        if(value?.input?.id===reviewId)records.push(value);
      }
      return {ids:metadata.map(row=>row.id),records};
    },currentRound.id);
    const validReviewRecord=value=>value&&typeof value.id==='string'&&value.id&&
      Number.isSafeInteger(value.revision)&&value.revision>=1&&
      typeof value.updatedAt==='string'&&Number.isFinite(Date.parse(value.updatedAt))&&
      same(value.input,currentRound);
    const observed=await localReviews();
    if(!reviewIntent){
      need(!reviewReceipt,'Retain the intent belonging to the accepted review save.');
      let selected=retainedReview;
      if(selected){
        need(validReviewRecord(selected)&&
          same(observed.records.find(row=>row.id===selected.id),selected),
          'Reopen the exact saved review binding; preserve its later local edits.');
      }else{
        const matching=observed.records.filter(row=>same(row.input,currentRound));
        need(matching.length<=1,'Keep the multiple current review bindings and select the original saved record.');
        selected=matching[0]||null;
      }
      reviewIntent={schema:'stellar-forge.current-source-review-save.v1',
        selection:reviewSelection,beforeIds:observed.ids,existingRecord:selected};
      await retainJSON(reviewIntentPath,reviewIntent);
      // Persist the complete original store before the original save-copy action.
      if(checkpoint)await checkpoint();
    }
    need(reviewIntent.schema==='stellar-forge.current-source-review-save.v1'&&
      same(reviewIntent.selection,reviewSelection)&&Array.isArray(reviewIntent.beforeIds)&&
      reviewIntent.beforeIds.every(id=>typeof id==='string'&&id)&&
      new Set(reviewIntent.beforeIds).size===reviewIntent.beforeIds.length&&
      (!reviewIntent.existingRecord||validReviewRecord(reviewIntent.existingRecord)),
      'Retain this exact review-save intent and the original local preimage.');
    if(reviewReceipt)need(
      reviewReceipt.schema==='stellar-forge.current-source-review-save-accepted.v1'&&
      same(reviewReceipt.selection,reviewSelection)&&validReviewRecord(reviewReceipt.record),
      'Retain the accepted native record for this exact current review.');
    let reviewRecord=reviewReceipt?.record||retainedReview||reviewIntent.existingRecord;
    if(reviewRecord){
      need(validReviewRecord(reviewRecord)&&
        same(observed.records.find(row=>row.id===reviewRecord.id),reviewRecord)&&
        (!retainedReview||same(retainedReview,reviewRecord))&&
        (!reviewIntent.existingRecord||same(reviewIntent.existingRecord,reviewRecord)),
        'The saved review has changed or disappeared. Preserve its actual local binding and later edits.');
    }else{
      const following=observed.records.filter(row=>!reviewIntent.beforeIds.includes(row.id));
      need(following.length<=1,
        'Multiple review saves followed this intent. Preserve each record before selecting the original effect.');
      if(following.length){
        reviewRecord=following[0];
        need(validReviewRecord(reviewRecord)&&reviewRecord.revision===1,
          'The review save has later or different work. Preserve its actual local record.');
      }else{
        await choose(page,page.locator('#review-open-round'),roundText,'Current_Complete_Review.json');
        await settle(page,'review');
        if(checkpoint)await checkpoint();
        await page.locator('#review-save-copy').click();await settle(page,'review');
        reviewRecord=await record(page,'review');
        need(validReviewRecord(reviewRecord)&&reviewRecord.revision===1&&
          !reviewIntent.beforeIds.includes(reviewRecord.id),
          'Accept the actual new record from the original review save-copy action.');
      }
    }
    const openedReview=await reopenReview(page,reviewRecord);
    need(same(openedReview,reviewRecord),'Open the entire selected original review record before accepting its save.');
    // A portable receipt must never precede the browser snapshot containing it.
    if(checkpoint)await checkpoint();
    await retainJSON(reviewReceiptPath,{
      schema:'stellar-forge.current-source-review-save-accepted.v1',
      selection:reviewSelection,record:reviewRecord
    });
    await retainJSON(reviewRecordPath,reviewRecord);
    for(const name of ['review-save-intent.json','review-save-accepted.json','saved-review-record.json']){
      const body=await readFile(join(output,name));
      files.push({path:name,bytes:body.length,sha256:sha(body)});
    }
    const reviewExport=await download(page,page.locator('#review-export'),'Current_Browser_Review.json');
    const reviewReport=await download(page,page.locator('#review-report'),'Current_Review_Report.md');
    const reviewedDraft=await download(page,page.locator('#review-draft-export'),'Current_Reviewed_Submission.json');
    need(same(await review.importReviewRound(reviewExport),currentRound)&&
      same(await handover.openDraftEnvelope(reviewedDraft),currentDraft),
      'Retain the full source-specific review and the exact draft it selected.');
    need(reviewReport===await review.reviewReport(currentRound),
      'Download the complete current review report.');
    const reopenedReview=await reopenReview(page,reviewRecord);
    need(same(reopenedReview,reviewRecord),'Reopen the saved complete original review record.');
    await retainJSON(reviewRecordPath,reopenedReview);
    await stage('current-source-review-saved-exported-and-reopened',{
      reviewId:currentRound.id,reviewActions:currentRound.events.length,
      recordId:reviewRecord.id,revision:reviewRecord.revision,status:currentView.status
    });

    const browser=page.context().browser();
    need(browser,'Use the original equipped browser for the independent receiving store.');
    independent=await browser.newContext({viewport:{width:390,height:844},acceptDownloads:true});
    const second=await independent.newPage();second.on('pageerror',onError);
    await second.goto(new URL(input.routes.editor,origin).href,{waitUntil:'domcontentloaded'});
    await settle(second);
    await choose(second,second.locator('#import-draft'),workingText,'Current_Browser_Submission.json');
    await settle(second);
    const beforeSave=await download(second,second.locator('#export-draft'),'Independently_Opened_Submission.json');
    need(same(await handover.openDraftEnvelope(beforeSave),saved.input),
      'Open every source, version, field and plan in the independent browser store.');
    await second.locator('#save').click();await settle(second);
    const otherDraft=await record(second);retainedSave(saved.input,otherDraft.input);
    await second.reload({waitUntil:'domcontentloaded'});await settle(second);
    need(same(await openSavedDraft(second,otherDraft.id),otherDraft),
      'Independently reopen the entire saved working application.');
    const otherExport=await download(second,second.locator('#export-draft'),'Independently_Saved_Submission.json');
    need(same(await handover.openDraftEnvelope(otherExport),otherDraft.input),
      'Export every independently saved working version.');
    await second.goto(new URL(input.routes.review,origin).href,{waitUntil:'domcontentloaded'});
    await settle(second,'review');
    await choose(second,second.locator('#review-open-round'),reviewExport,'Current_Browser_Review.json');
    await settle(second,'review');await second.locator('#review-save-copy').click();await settle(second,'review');
    const otherReview=await record(second,'review');
    need(same(otherReview.input,currentRound),'Independently receive the entire original review history.');
    const otherReviewExport=await download(second,second.locator('#review-export'),'Independently_Received_Review.json');
    need(same(await review.importReviewRound(otherReviewExport),currentRound),
      'Independently export the same complete current review.');
    need(same(await reopenReview(second,otherReview),otherReview),
      'Independently reopen the saved current review.');
    await write('independent-local-records.json',json({draft:otherDraft,review:otherReview}));
    await stage('independent-current-application-and-review-reopened',{
      draftId:otherDraft.input.id,reviewId:otherReview.input.id,
      draftRecordId:otherDraft.id,reviewRecordId:otherReview.id,
      sourceRecords:input.sourceRecords,reviewActions:currentRound.events.length
    });
    need(!pageErrors.length,'Resolve the actual source workspace browser errors: '+JSON.stringify(pageErrors));
    const complete={schema:'stellar-forge.current-source-browser-receiving.v1',state:'COMPLETE',
      operationId:OPERATION,phaseId:input.phaseId,completedAt:new Date().toISOString(),
      origin,sourceLocation:{selectedCase,currentCase},sourceRecords:input.sourceRecords,sourcePackageSha256:input.sourcePackageSha256,
      originalDraftId:currentDraft.id,originalReviewId:currentRound.id,
      retainedReviewActions:currentRound.events.length,reviewStatus:currentView.status,
      originalBrowserBinding:input.originalBrowserBinding,
      localBrowserBinding:{id:saved.id,revision:saved.revision},
      reviewedDraftSHA256:sha(draftText),workingDraftSHA256:sha(workingText),
      unchangedReviewedTargets:comparison.rows.length,stages,files,pageErrors};
    await retainJSON(join(output,'RESULT.json'),complete);
    return complete;
  }catch(error){
    await writeFile(join(output,'INCOMPLETE.json'),json({
      operationId:OPERATION,phaseId:input.phaseId,stage:stages.at(-1)?.name||'START',
      error:error.message,stack:error.stack,stages,files,pageErrors
    }),{mode:0o600});
    throw error;
  }finally{
    if(releaseRead)releaseRead();
    if(readRoute)await page.unroute(applicationURL,readRoute).catch(()=>{});
    page.off('pageerror',onError);
    if(independent)await independent.close().catch(()=>{});
  }
}
