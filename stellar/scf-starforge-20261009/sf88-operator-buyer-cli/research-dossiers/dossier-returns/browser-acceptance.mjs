// MIT. Browser acceptance at the original dossier-return programme's saved-request checkpoint.
import {stat} from 'node:fs/promises';
import {resolve,join,isAbsolute,basename} from 'node:path';
import {pathToFileURL,fileURLToPath} from 'node:url';
import {createHash} from 'node:crypto';
import {startDossierWorkspace} from '../server.mjs';
import {ResearchWorkspaceClient} from '../workspace-client.mjs';
import {openResearchSource} from '../workspace-files.mjs';
import {privateDirectory,readJson,writeJson,readBytes,writeBytes,jsonBytes,need} from '../../node/store.mjs';

const SCHEMA='sf88-research-dossier-return-browser-acceptance-v1';
const MAX_FILE=256*1024*1024,MAX_JSON=64*1024*1024;
const plain=value=>value!==null&&typeof value==='object'&&!Array.isArray(value);
const canonical=value=>Array.isArray(value)?value.map(canonical):plain(value)?
  Object.fromEntries(Object.keys(value).sort().map(key=>[key,canonical(value[key])])):value;
const same=(a,b)=>JSON.stringify(canonical(a))===JSON.stringify(canonical(b));
const stamp=()=>new Date().toISOString();
const sha=value=>createHash('sha256').update(value).digest('hex');
const checkedPath=value=>{need(typeof value==='string'&&isAbsolute(value)&&resolve(value)===value,
  'RETURN_BROWSER_ACCEPTANCE_ABSOLUTE_PATH_REQUIRED');return value;};
const optionalJson=async file=>{try{return await readJson(file,MAX_JSON);}catch(error){if(error.code==='ENOENT')return null;throw error;}};
const optionalBytes=async file=>{try{return await readBytes(file,MAX_FILE);}catch(error){if(error.code==='ENOENT')return null;throw error;}};
const descriptor=async file=>{
  const source=await openResearchSource(file,MAX_FILE);
  try{return{file,bytes:source.bytes,sha256:source.sha256};}finally{await source.close();}
};
function validReceipt(value,request,review){
  need(value&&/^drr_[a-f0-9]{64}$/.test(value.id??'')&&value.requestId===request.requestId&&
    value.reviewId===request.reviewId&&value.sourceId===review.source.id&&
    value.comparisonSha256===request.comparisonSha256&&value.revision===request.expectedRevision+1&&
    /^[a-f0-9]{64}$/.test(value.revisionSha256??'')&&value.reviewedBy===request.reviewedBy&&
    value.reviewNote===(request.reviewNote??'')&&same(value.decisions,request.decisions)&&
    same(value.current,review.current)&&same(value.base,review.base)&&same(value.returned,review.returned)&&
    value.source?.id===review.source.id&&value.source.sha256===review.source.sha256&&value.source.bytes===review.source.bytes,
    'RETURN_BROWSER_ACCEPTANCE_RECEIPT_CHANGED');
  return value;
}

/**
 * Called immediately before the original acceptance programme's first review.
 * It uses the already prepared native draft and exact request, retains source
 * through the product UI, deliberately loses one accepted response, and recovers
 * that same receipt after a real browser reload. No provider acquisition occurs.
 * The private browser profile and listener token are never returned as outputs.
 */
export async function runDossierReturnBrowserAcceptance({
  workspaceDirectory,dossierId,reviewId,source,originalSourceFile,request,directory,
  playwrightModule,chromiumExecutable,signal
}={}){
  for(const value of [workspaceDirectory,originalSourceFile,directory,playwrightModule,chromiumExecutable])checkedPath(value);
  need(/^d_[a-f0-9-]{36}$/.test(dossierId??'')&&/^drv_[a-f0-9]{64}$/.test(reviewId??'')&&
    source?.id==='drs_'+source?.sha256&&Number.isSafeInteger(source.bytes)&&source.bytes>0&&
    request?.reviewId===reviewId&&typeof request.requestId==='string'&&Array.isArray(request.decisions),
    'RETURN_BROWSER_ACCEPTANCE_SELECTION_REQUIRED');
  const sourceFile=await descriptor(originalSourceFile);
  need(sourceFile.bytes===source.bytes&&sourceFile.sha256===source.sha256,'RETURN_BROWSER_ACCEPTANCE_SOURCE_CHANGED');
  await privateDirectory(directory);
  const privateRoot=join(directory,'private');await privateDirectory(privateRoot);
  const stateFile=join(privateRoot,'state.json');
  const binding={workspaceDirectory,dossierId,reviewId,source:{id:source.id,bytes:source.bytes,sha256:source.sha256},
    originalSourceFile,request:structuredClone(request)};
  let state=await optionalJson(stateFile);
  if(!state)state={schema:SCHEMA,binding,stage:'PREPARED',createdAt:stamp(),attempts:[],artifacts:{},preparedArtifacts:{}};
  need(state.schema===SCHEMA&&same(state.binding,binding),'RETURN_BROWSER_ACCEPTANCE_ORIGINAL_SELECTION_CHANGED');
  let saveQueue=Promise.resolve();
  const save=()=>{const snapshot=structuredClone(state);saveQueue=saveQueue.then(()=>writeJson(stateFile,snapshot),()=>writeJson(stateFile,snapshot));return saveQueue;};
  const retained=async name=>{
    const selection=state.artifacts[name]??state.preparedArtifacts[name],file=join(directory,name),bytes=await optionalBytes(file);
    if(!bytes){need(!state.artifacts[name],'RETURN_BROWSER_ACCEPTANCE_ARTIFACT_MISSING');return null;}
    need(selection&&selection.bytes===bytes.length&&selection.sha256===sha(bytes),'RETURN_BROWSER_ACCEPTANCE_ARTIFACT_CHANGED');
    if(!state.artifacts[name]){state.artifacts[name]=selection;await save();}
    return bytes;
  };
  let token=null;
  const retain=async(name,body)=>{
    need(/^[a-z0-9][a-z0-9._-]*$/.test(name)&&!name.includes('..'),'RETURN_BROWSER_ACCEPTANCE_ARTIFACT_NAME_INVALID');
    const bytes=Buffer.isBuffer(body)?body:Buffer.from(body);
    need(bytes.length<=MAX_FILE&&(!token||!bytes.includes(Buffer.from(token))),'RETURN_BROWSER_ACCEPTANCE_PRIVATE_OR_OVERSIZE_ARTIFACT');
    const old=await retained(name);
    if(old){need(old.length===bytes.length&&sha(old)===sha(bytes),'RETURN_BROWSER_ACCEPTANCE_ARTIFACT_CHANGED');return state.artifacts[name];}
    const value={filename:name,path:join(directory,name),bytes:bytes.length,sha256:sha(bytes)};
    state.preparedArtifacts[name]=value;await save();
    try{await writeBytes(value.path,bytes,{exclusive:true});}
    catch(error){if(error.code!=='EEXIST')throw error;const raced=await readBytes(value.path,MAX_FILE);
      need(raced.length===bytes.length&&sha(raced)===value.sha256,'RETURN_BROWSER_ACCEPTANCE_ARTIFACT_CHANGED');}
    const verified=await descriptor(value.path);need(verified.bytes===value.bytes&&verified.sha256===value.sha256,
      'RETURN_BROWSER_ACCEPTANCE_ARTIFACT_CHANGED');
    state.artifacts[name]=value;await save();return value;
  };
  const outputs=()=>Object.values(state.artifacts).map(value=>({...value}));
  // A closed, complete artifact can precede its final marker if the last
  // checkpoint was interrupted. Reuse that exact result before another browser
  // allocation or timestamped output is attempted.
  const finishedBytes=await retained('browser-acceptance-result.json');
  if(finishedBytes){
    const finished=JSON.parse(finishedBytes.toString('utf8'));
    need(finished.schema===SCHEMA&&finished.dossierId===dossierId&&finished.reviewId===reviewId&&
      finished.requestId===request.requestId&&finished.checks?.browserAndListenerClosed===true&&
      finished.receipt?.requestId===request.requestId&&finished.receipt.reviewId===reviewId&&
      finished.receipt.sourceId===source.id&&finished.receipt.comparisonSha256===request.comparisonSha256&&
      same(finished.receipt.decisions,request.decisions),'RETURN_BROWSER_ACCEPTANCE_COMPLETION_CHANGED');
    state.result=finished;state.stage='COMPLETE';state.completedAt??=stamp();await save();
  }
  if(state.stage==='COMPLETE'){
    for(const name of Object.keys(state.artifacts))await retained(name);
    return{...state.result,files:outputs(),nativeOutputs:outputs()};
  }
  for(const runtimeFile of [playwrightModule,chromiumExecutable]){
    const value=await stat(runtimeFile);need(value.isFile()&&(runtimeFile!==chromiumExecutable||(value.mode&0o111)!==0),'RETURN_BROWSER_ACCEPTANCE_RUNTIME_MISSING');
  }
  const loaded=await import(pathToFileURL(playwrightModule).href),chromium=loaded.chromium??loaded.default?.chromium;
  need(typeof chromium?.launchPersistentContext==='function','RETURN_BROWSER_ACCEPTANCE_PLAYWRIGHT_REQUIRED');
  let listener,client,context,page,mainError,routeError,result;
  const jobs=new Set(),denied=[],pageErrors=[],routeObservations=[];
  const persist=save;
  const attempt={index:state.attempts.length+1,startedAt:stamp(),stage:state.stage,
    runtime:{playwrightModule,chromiumExecutable}};
  state.attempts.push(attempt);await persist();
  const filePrefix='attempt-'+String(attempt.index).padStart(3,'0')+'-';
  let stopping=false;
  const onAbort=()=>{stopping=true;for(const job of jobs)void job.catch(()=>{});if(context)void context.close().catch(()=>{});};
  if(signal){if(signal.aborted)throw Object.assign(new Error('RETURN_BROWSER_ACCEPTANCE_ABORTED'),{code:'RETURN_BROWSER_ACCEPTANCE_ABORTED'});
    signal.addEventListener('abort',onAbort,{once:true});}
  try{
    listener=await startDossierWorkspace({directory:workspaceDirectory,port:state.port??0});
    token=listener.token;
    if(state.workspaceId)need(state.workspaceId===listener.workspaceId,'RETURN_BROWSER_ACCEPTANCE_WORKSPACE_CHANGED');
    state.workspaceId=listener.workspaceId;state.port=new URL(listener.origin).port?Number(new URL(listener.origin).port):null;
    await persist();
    client=new ResearchWorkspaceClient({url:listener.url,directory:workspaceDirectory,expectedWorkspaceId:listener.workspaceId});
    await client.status();const service=client.dossierReturns(dossierId);
    const review=await service.list({reviewId,offset:0,limit:100});
    need(review.reviewId===reviewId&&review.dossierId===dossierId&&review.source.id===source.id&&
      review.source.sha256===source.sha256&&review.source.bytes===source.bytes&&
      review.current.revision===request.expectedRevision&&review.comparisonSha256===request.comparisonSha256,
      'RETURN_BROWSER_ACCEPTANCE_COMPARISON_CHANGED');
    const items=[];
    for(let offset=0;offset<review.total;offset+=100){
      const value=offset===0?review:await service.list({reviewId,offset,limit:100});
      need(value.total===review.total&&value.offset===offset&&value.items.length===Math.min(100,review.total-offset)&&
        value.comparisonSha256===review.comparisonSha256,'RETURN_BROWSER_ACCEPTANCE_COMPARISON_PAGE_CHANGED');
      items.push(...value.items);
    }
    need(items.length===review.total&&new Set(items.map(item=>item.id)).size===items.length&&
      request.decisions.length===items.length&&request.decisions.every(value=>items.some(item=>
        item.id===value.itemId&&item.allowedChoices.includes(value.choice))),'RETURN_BROWSER_ACCEPTANCE_COMPLETE_CHOICES_REQUIRED');
    const nativeDraft=await service.draft({reviewId});
    need(nativeDraft.draftVersion>=1&&same(nativeDraft.draft?.pendingRequest??nativeDraft.draft?.request,request),
      'RETURN_BROWSER_ACCEPTANCE_ORIGINAL_NATIVE_DRAFT_REQUIRED');
    const before=await client.metadata(dossierId),acceptedBefore=(await service.list({requestId:request.requestId})).return;
    if(acceptedBefore)validReceipt(acceptedBefore,request,review);
    else need(before.revision===request.expectedRevision,'RETURN_BROWSER_ACCEPTANCE_BASE_CHANGED');
    await retain('original-reviewed-request.json',jsonBytes(request));
    const originalNativeDraft=await retained('original-native-workspace-draft.json');
    if(originalNativeDraft)need(same(JSON.parse(originalNativeDraft.toString('utf8')),nativeDraft),
      'RETURN_BROWSER_ACCEPTANCE_NATIVE_DRAFT_CHANGED');
    else await retain('original-native-workspace-draft.json',jsonBytes(nativeDraft));
    await retain(filePrefix+'initial-review.json',jsonBytes(review));
    const executionRoot=fileURLToPath(new URL('../',import.meta.url)),sourcePins=[];
    for(const name of ['dossier-returns/browser-acceptance.mjs','dossier-returns/client.mjs','dossier-returns/routes.mjs',
      'public/dossier-returns.js','public/dossier-return-drafts.js','public/dossier-returns.css','server.mjs','workspace-client.mjs',
      'public/app.js','public/index.html']){
      const selected=await descriptor(join(executionRoot,name));sourcePins.push({path:name,bytes:selected.bytes,sha256:selected.sha256});
    }
    await retain(filePrefix+'executed-source.json',jsonBytes({schema:SCHEMA,files:sourcePins}));
    context=await chromium.launchPersistentContext(join(privateRoot,'profile'),{
      executablePath:chromiumExecutable,headless:true,acceptDownloads:true,serviceWorkers:'block',
      viewport:{width:1440,height:1000},args:['--no-sandbox','--disable-dev-shm-usage','--disable-background-networking',
        '--disk-cache-size=1048576','--media-cache-size=1048576'],
    });
    attempt.runtime.browserVersion=context.browser()?.version()??null;
    attempt.runtime.nodeVersion=process.version;attempt.runtime.platform=process.platform;attempt.runtime.arch=process.arch;
    await persist();
    context.setDefaultTimeout(25000);context.setDefaultNavigationTimeout(45000);
    page=await context.newPage();
    for(const other of context.pages())if(other!==page)await other.close();
    page.on('pageerror',error=>pageErrors.push(String(error?.message??error).split(token).join('[session]')));
    const origin=listener.origin,base='/api/dossiers/'+encodeURIComponent(dossierId)+'/returns';
    const inspectStorage=async()=>page.evaluate(async({workspaceId,dossierId,requestId,sourceId})=>{
      const db=await new Promise((resolve,reject)=>{
        const req=indexedDB.open('research-dossier-returns-v1',1);
        req.onsuccess=()=>resolve(req.result);req.onerror=()=>reject(req.error);
        req.onupgradeneeded=()=>{req.transaction.abort();reject(new Error('Original product database is not yet initialized.'));};
      });
      try{
        const read=(table,id)=>new Promise((resolve,reject)=>{
          const tx=db.transaction(table,'readonly'),get=tx.objectStore(table).get(JSON.stringify([workspaceId,dossierId,id]));
          get.onsuccess=()=>resolve(get.result??null);get.onerror=()=>reject(get.error);
        });
        const pending=await read('requests',requestId),draft=pending?await read('drafts',pending.value.draftId):null;
        const source=await read('sources',sourceId);let bytes=null,sha256=null;
        if(source?.blob){const value=await source.blob.arrayBuffer();bytes=value.byteLength;
          sha256=[...new Uint8Array(await crypto.subtle.digest('SHA-256',value))].map(v=>v.toString(16).padStart(2,'0')).join('');}
        return{pending,draft,source:source?{id:source.id,meta:source.value,bytes,sha256}:null};
      }finally{db.close();}
    },{workspaceId:listener.workspaceId,dossierId,requestId:request.requestId,sourceId:source.id});
    const checkStored=(value,{pending=false,complete=false}={})=>{
      need(value.source?.id===source.id&&value.source.bytes===source.bytes&&value.source.sha256===source.sha256,
        'RETURN_BROWSER_ACCEPTANCE_ORIGINAL_BLOB_NOT_RETAINED');
      if(pending||complete){
        need(value.pending?.value.requestId===request.requestId&&same(value.pending.value.body,request)&&
          value.draft?.value.pendingRequestId===request.requestId&&
          same(value.draft.value.originalWorkspaceDraft,nativeDraft),'RETURN_BROWSER_ACCEPTANCE_ORIGINAL_REQUEST_NOT_RETAINED');
        if(complete)validReceipt(value.pending.value.receipt,request,review);
      }
      return value;
    };

    const waitFor=async(work,code,{timeout=30000}={})=>{
      const end=Date.now()+timeout;let value;
      while(Date.now()<end){
        if(routeError)throw routeError;
        need(!stopping&&!signal?.aborted,'RETURN_BROWSER_ACCEPTANCE_ABORTED');
        value=await work();if(value)return value;
        await new Promise(resolve=>setTimeout(resolve,100));
      }
      need(false,code);
    };
    const ready=async()=>{
      await page.locator('#view-dossier-returns').waitFor({state:'visible'});
      await waitFor(()=>page.locator('[data-dr-focus="source-file"]').isEnabled(),
        'RETURN_BROWSER_ACCEPTANCE_UI_NOT_READY');
    };
    const waitStorage=async(predicate,code)=>waitFor(async()=>{
      const value=await inspectStorage();return predicate(value)?value:null;
    },code);
    const pendingCard=()=>page.locator('.dr-request').filter({hasText:request.requestId});
    const click=async label=>{await page.getByRole('button',{name:label,exact:true}).click();await ready();};
    const download=async(name,action)=>{
      const prior=await retained(name);
      if(prior)return prior;
      const [item]=await Promise.all([page.waitForEvent('download'),Promise.resolve().then(action)]);
      const failure=await item.failure();need(!failure,'RETURN_BROWSER_ACCEPTANCE_DOWNLOAD_FAILED');
      const file=await item.path();need(file,'RETURN_BROWSER_ACCEPTANCE_DOWNLOAD_PATH_MISSING');
      const bytes=await readBytes(file,MAX_FILE);
      await retain(name,bytes);await item.delete();
      return bytes;
    };
    const screenshot=async name=>{
      if(await retained(name))return;
      const body=await page.screenshot({fullPage:true});await retain(name,body);
    };
    let reviewPosts=0;
    const routeHandler=route=>{
      const job=(async()=>{
        try{
          const incoming=route.request(),url=new URL(incoming.url()),method=incoming.method();
          if(['data:','blob:','about:'].includes(url.protocol)){await route.continue();return;}
          if(url.origin!==origin){
            denied.push({method,origin:url.origin,path:url.pathname});await route.abort('blockedbyclient');return;
          }
          if(method==='GET'||method==='HEAD'){await route.continue();return;}
          if(method==='POST'&&url.pathname===base+'/sources'){
            checkStored(await inspectStorage());
            const body=incoming.postDataBuffer();
            need(url.searchParams.get('sha256')===source.sha256&&Number(url.searchParams.get('bytes'))===source.bytes&&
              body?.length===source.bytes&&sha(body)===source.sha256,'RETURN_BROWSER_ACCEPTANCE_SOURCE_POST_CHANGED');
            routeObservations.push({method,path:url.pathname,bytes:body.length,sha256:sha(body),sourceInIndexedDb:true});
            await route.continue();return;
          }
          const body=incoming.postDataJSON();
          if(method==='POST'&&url.pathname===base+'/preview'){
            need(!acceptedBefore&&same(body,{sourceId:source.id,expectedRevision:request.expectedRevision}),
              'RETURN_BROWSER_ACCEPTANCE_PREVIEW_CHANGED');
            routeObservations.push({method,path:url.pathname,body});await route.continue();return;
          }
          if(method==='POST'&&url.pathname===base+'/reviews'){
            const stored=checkStored(await inspectStorage(),{pending:true});
            need(!acceptedBefore&&++reviewPosts===1&&same(body,request)&&same(stored.pending.value.body,body),
              'RETURN_BROWSER_ACCEPTANCE_REVIEW_POST_CHANGED');
            // This is the one exact original native request. Observe its real
            // accepted reply before deliberately making that reply unavailable
            // to the page. Do not replace the native result or its decisions.
            const response=await route.fetch({maxRedirects:0,timeout:45000});
            const bytes=await response.body();
            need(bytes.length<=MAX_JSON,'RETURN_BROWSER_ACCEPTANCE_REPLY_TOO_LARGE');
            const value=JSON.parse(new TextDecoder('utf-8',{fatal:true}).decode(bytes));
            if(!response.ok()){
              await retain(filePrefix+'native-review-error.json',bytes);
              await route.fulfill({response});
              need(false,'RETURN_BROWSER_ACCEPTANCE_NATIVE_REVIEW_REJECTED');
            }
            const receipt=validReceipt(value.return,request,review);
            state.acceptedReply={result:value,bytes:bytes.length,sha256:sha(bytes),observedAt:stamp()};
            state.stage='ACCEPTED_REPLY_CAPTURED';
            await retain('first-accepted-native-response.json',bytes);
            await persist();
            await route.abort('failed');
            state.lostReply={requestId:request.requestId,returnId:receipt.id,observedAt:stamp(),
              mechanism:'Original accepted HTTP response aborted before page delivery'};
            routeObservations.push({method,path:url.pathname,requestId:request.requestId,returnId:receipt.id,
              acceptedStatus:response.status(),acceptedReplySha256:sha(bytes),replyAborted:true});
            await persist();return;
          }
          denied.push({method,origin:url.origin,path:url.pathname});
          await route.abort('blockedbyclient');
        }catch(error){
          routeError??=error;await route.abort('failed').catch(()=>{});
        }
      })();
      jobs.add(job);void job.finally(()=>jobs.delete(job)).catch(()=>{});
      return job;
    };
    await context.route('**/*',routeHandler);
    page.on('dialog',dialog=>{
      if(dialog.type()==='beforeunload')void dialog.accept().catch(()=>{});
      else{pageErrors.push('Unexpected browser dialog: '+dialog.type());void dialog.dismiss().catch(()=>{});}
    });
    const pageUrl=new URL(listener.origin);
    pageUrl.hash=new URLSearchParams({token,dossier:dossierId,view:'dossier-returns'}).toString();
    await page.goto(pageUrl.href,{waitUntil:'domcontentloaded'});await ready();

    // Use the original source bytes with their native filename. The browser
    // product, not this driver, creates and persists the complete Blob record.
    let selectedBytes=await readBytes(originalSourceFile,MAX_FILE);
    need(selectedBytes.length===source.bytes&&sha(selectedBytes)===source.sha256,
      'RETURN_BROWSER_ACCEPTANCE_SOURCE_CHANGED');
    await page.locator('[data-dr-focus="source-file"]').setInputFiles({
      name:source.filename,mimeType:source.contentType??'application/octet-stream',buffer:selectedBytes,
    });
    selectedBytes=null;
    await ready();
    checkStored(await waitStorage(value=>value.source?.sha256===source.sha256,
      'RETURN_BROWSER_ACCEPTANCE_SOURCE_NOT_SAVED'));
    const [sourceResponse]=await Promise.all([
      page.waitForResponse(value=>value.request().method()==='POST'&&new URL(value.url()).pathname===base+'/sources'),
      page.getByRole('button',{name:'Retain original source',exact:true}).click(),
    ]);
    const sourceReply=await sourceResponse.json();
    need(sourceResponse.ok()&&same(sourceReply.source,review.source),'RETURN_BROWSER_ACCEPTANCE_NATIVE_SOURCE_CHANGED');
    await retain(filePrefix+'source-receiving.json',jsonBytes(sourceReply));await ready();

    let localState=await inspectStorage();
    if(localState.pending){
      checkStored(localState,{pending:true});
      await pendingCard().getByRole('button',{name:'Open this review',exact:true}).click();await ready();
    }else{
      if(acceptedBefore){
        await page.getByRole('textbox',{name:'Original return request ID',exact:true}).fill(request.requestId);
        await click('Find request');
      }else await click('Compare with current dossier');
      await waitFor(()=>page.locator('.dr-comparison').getByText(reviewId,{exact:true}).count(),
        'RETURN_BROWSER_ACCEPTANCE_REVIEW_NOT_OPEN');
      await click('Open workspace draft as branch');
      localState=checkStored(await waitStorage(value=>!!value.pending&&!!value.draft,
        'RETURN_BROWSER_ACCEPTANCE_NATIVE_DRAFT_NOT_SAVED'),{pending:true});
    }
    await retain(filePrefix+'indexeddb-before-reload.json',jsonBytes(localState));
    await page.reload({waitUntil:'domcontentloaded'});await ready();
    checkStored(await inspectStorage(),{pending:true});
    await pendingCard().getByRole('button',{name:'Open this review',exact:true}).click();await ready();

    const domItems=[];
    for(let offset=0;offset<items.length;offset+=25){
      const expected=items.slice(offset,offset+25);
      await waitFor(async()=>same(await page.locator('.dr-item').evaluateAll(nodes=>nodes.map(node=>node.id)),
        expected.map(item=>'dr-item-'+item.id)),'RETURN_BROWSER_ACCEPTANCE_DOM_PAGE_CHANGED');
      for(const item of expected){
        const card=page.locator('#dr-item-'+item.id),decision=request.decisions.find(row=>row.itemId===item.id);
        const selected=card.locator('[data-dr-focus="choice-'+item.id+'-'+decision.choice+'"]');
        need(await selected.isChecked()&&await selected.isDisabled(),'RETURN_BROWSER_ACCEPTANCE_VISIBLE_DECISION_CHANGED');
        const label=typeof item.choiceLabels?.[decision.choice]==='string'?item.choiceLabels[decision.choice]:
          item.choiceLabels?.[decision.choice]?.label;
        if(label)need(await card.getByText(label,{exact:true}).count()>0,'RETURN_BROWSER_ACCEPTANCE_CHOICE_LABEL_CHANGED');
        const effect=typeof item.effect==='string'?item.effect:item.effect?.[decision.choice]??
          item.choiceLabels?.[decision.choice]?.effect;
        if(effect)need(await card.locator('.dr-effect').textContent()===effect,'RETURN_BROWSER_ACCEPTANCE_CHOICE_EFFECT_CHANGED');
        if(decision.choice==='EDIT'){
          const actual=await card.locator('[data-dr-focus="edit-'+item.id+'"]').inputValue();
          need(same(JSON.parse(actual),decision.value),'RETURN_BROWSER_ACCEPTANCE_EDIT_CHANGED');
        }
        const sides=await card.locator('.dr-side').evaluateAll(nodes=>nodes.map(node=>({
          title:node.querySelector('h4')?.textContent??'',
          presence:node.querySelector('.dr-tag')?.textContent??'',
          sha256:node.querySelector('.dr-digest')?.textContent??null,
        })));
        for(const [index,side]of ['base','current','returned'].entries()){
          need(sides[index]?.presence===(item[side].present?'Present':'Absent')&&
            sides[index]?.sha256===(item[side].sha256??null),'RETURN_BROWSER_ACCEPTANCE_VISIBLE_SIDE_CHANGED');
        }
        domItems.push({id:item.id,treatment:item.treatment,choice:decision.choice,label:label??null,
          effect:effect??null,sides});
      }
      if(offset+25<items.length)await click('Next changes');
    }
    need(domItems.length===items.length,'RETURN_BROWSER_ACCEPTANCE_VISIBLE_ITEMS_INCOMPLETE');
    await retain(filePrefix+'visible-comparison-items.json',jsonBytes({reviewId,comparisonSha256:review.comparisonSha256,items:domItems}));
    await screenshot(filePrefix+'reviewed-comparison.png');
    checkStored(await inspectStorage(),{pending:true});
    const recordedBefore=(await service.list({requestId:request.requestId})).return;
    if(!recordedBefore){
      state.stage='ORIGINAL_REVIEW_PENDING';await persist();
      await pendingCard().getByRole('button',{name:'Retry exact saved request',exact:true}).click();
      await waitStorage(value=>value.pending?.value.state==='OUTCOME_UNKNOWN',
        'RETURN_BROWSER_ACCEPTANCE_UNKNOWN_OUTCOME_NOT_RETAINED');
      await ready();
      need(state.lostReply?.requestId===request.requestId,'RETURN_BROWSER_ACCEPTANCE_REPLY_NOT_ABORTED');
      checkStored(await inspectStorage(),{pending:true});
      await retain(filePrefix+'indexeddb-unknown-outcome.json',jsonBytes(await inspectStorage()));
      await screenshot(filePrefix+'unknown-outcome.png');
    }else validReceipt(recordedBefore,request,review);
    await page.reload({waitUntil:'domcontentloaded'});await ready();
    checkStored(await inspectStorage(),{pending:true});
    await pendingCard().getByRole('button',{name:'Check original request',exact:true}).click();
    const completed=checkStored(await waitStorage(value=>value.pending?.value.state==='COMPLETE',
      'RETURN_BROWSER_ACCEPTANCE_ORIGINAL_RECEIPT_NOT_RECOVERED'),{complete:true});
    await ready();
    const receipt=validReceipt(completed.pending.value.receipt,request,review);
    await pendingCard().getByRole('button',{name:'Open this review',exact:true}).click();await ready();
    await screenshot(filePrefix+'accepted-return.png');
    await retain(filePrefix+'indexeddb-after-recovery.json',jsonBytes(completed));
    const recoveryBytes=await download(filePrefix+'original-request-recovery.json',()=>
      pendingCard().getByRole('button',{name:'Download original request',exact:true}).click());
    const recovery=JSON.parse(recoveryBytes.toString('utf8'));
    need(same(recovery.pending?.body,request)&&same(recovery.draft?.originalWorkspaceDraft,nativeDraft)&&
      same(recovery.pending?.receipt,receipt),'RETURN_BROWSER_ACCEPTANCE_RECOVERY_EXPORT_CHANGED');
    const completeRecovery=await download(filePrefix+'full-browser-recovery.json',()=>
      page.getByRole('button',{name:'Download full recovery',exact:true}).click());
    const completeRecoveryValue=JSON.parse(completeRecovery.toString('utf8'));
    need(completeRecoveryValue.workspaceId===listener.workspaceId&&completeRecoveryValue.dossierId===dossierId,
      'RETURN_BROWSER_ACCEPTANCE_RECOVERY_EXPORT_CHANGED');

    const comparisonJson=await download('comparison.json',()=>page.getByRole('button',{name:'Comparison JSON',exact:true}).click());
    const comparison=JSON.parse(comparisonJson.toString('utf8'));
    const immutableIdentity={reviewId,returnId:null,sourceId:source.id,comparisonSha256:review.comparisonSha256,revisionSha256:null};
    need(same(comparison.identity,immutableIdentity)&&comparison.return===null&&
      comparison.comparison.id===reviewId&&comparison.comparison.comparisonSha256===review.comparisonSha256&&
      same(comparison.comparison.base,review.base)&&same(comparison.comparison.current,review.current)&&
      same(comparison.comparison.returned,review.returned)&&comparison.comparison.items.length===items.length,
      'RETURN_BROWSER_ACCEPTANCE_COMPARISON_EXPORT_CHANGED');
    await download('comparison.md',()=>page.getByRole('button',{name:'Comparison Markdown',exact:true}).click());
    await download('comparison.html',()=>page.getByRole('button',{name:'Comparison HTML',exact:true}).click());
    const original=await download('original-returned-dossier.bin',()=>page.getByRole('button',{name:'Original returned dossier',exact:true}).click());
    need(original.length===source.bytes&&sha(original)===source.sha256,'RETURN_BROWSER_ACCEPTANCE_SOURCE_DOWNLOAD_CHANGED');
    const acceptedJson=await download('accepted-return.json',()=>page.getByRole('button',{name:'Accepted return JSON',exact:true}).click());
    const accepted=JSON.parse(acceptedJson.toString('utf8'));
    need(same(accepted.identity,{...immutableIdentity,returnId:receipt.id,revisionSha256:receipt.revisionSha256})&&
      same(accepted.comparison,comparison.comparison)&&same(accepted.return,receipt),
      'RETURN_BROWSER_ACCEPTANCE_ACCEPTED_EXPORT_CHANGED');
    await download('accepted-return.md',()=>page.getByRole('button',{name:'Accepted return Markdown',exact:true}).click());
    await download('accepted-return.html',()=>page.getByRole('button',{name:'Accepted return HTML',exact:true}).click());

    // Inspect every side of the actual reviewed edit through the original
    // value download, keeping its native component identity separate from the
    // JSON file's bytes/SHA. No fabricated preview value enters the evidence.
    const edited=request.decisions.find(row=>row.choice==='EDIT');
    need(edited,'RETURN_BROWSER_ACCEPTANCE_REVIEWED_EDIT_REQUIRED');
    const selectedIndex=items.findIndex(item=>item.id===edited.itemId),item=items[selectedIndex];
    for(let offset=0;offset<Math.floor(selectedIndex/25)*25;offset+=25)await click('Next changes');
    const card=page.locator('#dr-item-'+item.id);
    await card.waitFor({state:'visible'});
    for(const [index,side]of ['base','current','returned'].entries()){
      const bytes=await download('reviewed-edit-'+side+'.json',()=>card.locator('.dr-side').nth(index)
        .getByRole('button',{name:'Download value',exact:true}).click());
      const value=JSON.parse(bytes.toString('utf8')),native=await service.value({reviewId,itemId:item.id,side});
      need(same(value,native)&&value.present===item[side].present&&value.sha256===item[side].sha256,
        'RETURN_BROWSER_ACCEPTANCE_VALUE_EXPORT_CHANGED');
    }
    const finalReceipt=(await service.list({requestId:request.requestId})).return,after=await client.metadata(dossierId);
    validReceipt(finalReceipt,request,review);
    need(same(finalReceipt,receipt)&&after.revision===request.expectedRevision+1&&
      same(await service.draft({reviewId}),nativeDraft),'RETURN_BROWSER_ACCEPTANCE_ORIGINAL_NATIVE_STATE_CHANGED');
    if(routeError)throw routeError;
    need(!denied.length&&!pageErrors.length,'RETURN_BROWSER_ACCEPTANCE_UNEXPECTED_BROWSER_ACTIVITY');
    const checks={
      workspaceId:listener.workspaceId,dossierId,reviewId,requestId:request.requestId,
      sourceBlob:{bytes:source.bytes,sha256:source.sha256,retainedAcrossReload:true},
      originalNativeDraft:true,exactSubmittedDecisionOrder:true,visibleItems:domItems.length,
      originalRequestRecovered:true,lostReplyObserved:state.lostReply?.requestId===request.requestId,
      entryReceipt:acceptedBefore?.id??null,receiptId:receipt.id,acceptedRevision:receipt.revision,
      sourceDownload:true,immutableComparisonExports:true,acceptedReturnExports:true,
      fullEditedSideValues:true,reviewedNativeDraftUnchanged:true,
      providerRequests:0,unexpectedMutations:0,originalReviewPosts:reviewPosts,pageErrors:[],browserAndListenerClosed:false,
    };
    await retain(filePrefix+'request-observations.json',jsonBytes({requests:routeObservations,denied,pageErrors}));
    await retain(filePrefix+'checks-before-close.json',jsonBytes(checks));
    result={schema:SCHEMA,dossierId,reviewId,requestId:request.requestId,receipt,checks};
    state.stage='VERIFIED';state.result=result;await persist();
  }catch(error){
    mainError=error;attempt.error={code:typeof error?.code==='string'?error.code:'RETURN_BROWSER_ACCEPTANCE_FAILED',
      message:String(error?.message??error).split(token??'\0').join('[session]')};
    state.stage='INTERRUPTED';
  }finally{
    const cleanup=[];
    // The route owns its original response until finished; let it retain the
    // observed result before closing the context or original listener.
    const active=await Promise.allSettled([...jobs]);
    for(const value of active)if(value.status==='rejected')cleanup.push(value.reason);
    if(context)try{await context.close();}catch(error){cleanup.push(error);}
    if(client)try{await client.close();}catch(error){cleanup.push(error);}
    if(listener)try{await listener.close();}catch(error){cleanup.push(error);}
    if(signal)signal.removeEventListener('abort',onAbort);
    if(cleanup.length){
      mainError??=cleanup[0];
      attempt.cleanupErrors=cleanup.map(error=>({code:typeof error?.code==='string'?error.code:'RETURN_BROWSER_ACCEPTANCE_CLOSE_FAILED'}));
      state.stage='INTERRUPTED';
    }
    attempt.finishedAt=stamp();attempt.outcome=mainError?'INTERRUPTED':'VERIFIED';
    try{await persist();}catch(error){mainError??=error;}
  }
  if(mainError){
    // Preserve an actually observed accepted reply in the original caller's
    // error result if a later local checkpoint cannot be written.
    Object.assign(mainError,{browserAcceptance:{schema:SCHEMA,dossierId,reviewId,requestId:request.requestId,
      acceptedReply:state.acceptedReply??null,lostReply:state.lostReply??null,files:outputs(),attempt}});
    throw mainError;
  }
  result.checks.browserAndListenerClosed=true;
  await retain('browser-acceptance-result.json',jsonBytes(result));
  state.stage='COMPLETE';state.completedAt=stamp();state.result=result;await persist();
  return{...result,files:outputs(),nativeOutputs:outputs()};
}
