// MIT. Receive the actual saved Service buyer workbench across two browser origins.
// The caller owns the original case stores, native owners and browser lifetime.
import assert from 'node:assert/strict';
import {createHash,randomUUID} from 'node:crypto';
import {constants} from 'node:fs';
import {mkdir,open,readFile,rename,lstat} from 'node:fs/promises';
import {join,resolve,isAbsolute,basename} from 'node:path';
import {retainCaseArtifact} from './case-store.mjs';
import {serviceCanonical} from './service-commitments.mjs';

const SCHEMA='stellar-forge.service-buyer-workbench-receiving.v1';
const sha=raw=>createHash('sha256').update(raw).digest('hex');
const json=value=>Buffer.from(JSON.stringify(value,null,2)+'\n');
const same=(left,right)=>serviceCanonical(left)===serviceCanonical(right);
const need=(ok,message)=>{if(!ok)throw Object.assign(new Error(message),{code:'SERVICE_BUYER_WORKBENCH_RECEIVING'});};
async function optional(path){try{return await readFile(path);}catch(error){if(error.code==='ENOENT')return null;throw error;}}
async function atomic(path,value){
  const temp=path+'.'+randomUUID()+'.tmp',fd=await open(temp,'wx',0o600);
  try{await fd.writeFile(json(value));await fd.sync();}finally{await fd.close();}
  await rename(temp,path);const parent=await open(resolve(path,'..'),constants.O_RDONLY);
  try{await parent.sync();}finally{await parent.close();}
}
async function downloaded(download){
  const stream=await download.createReadStream();need(stream,'Retain the complete browser download stream.');
  const chunks=[];for await(const chunk of stream)chunks.push(Buffer.from(chunk));
  need(await download.failure()===null,'The complete browser download failed.');return Buffer.concat(chunks);
}
function draftKey(origin,scope){
  return 'service-buyer-draft:'+origin+':'+JSON.stringify([scope.caseId,scope.captureOutcomeId,scope.buyerWorkspace,scope.workspaceId]);
}
async function localDraft(page,scope,custodyKey=null){
  return page.evaluate(async ({key,custodyKey})=>{
    const db=await new Promise((done,fail)=>{const r=indexedDB.open('merchant-service-adjustments',1);r.onsuccess=()=>done(r.result);r.onerror=()=>fail(r.error);});
    try{return await new Promise((done,fail)=>{
      const tx=db.transaction('requests','readonly'),s=tx.objectStore('requests'),draft=s.get(key),history=s.get(key+':receiving'),custody=custodyKey?s.get(custodyKey):null;let records=[];
      history.onsuccess=()=>{for(const row of history.result??[]){const r=s.get(key+':receiving:'+row.id);r.onsuccess=()=>records.push(r.result);}};
      tx.oncomplete=()=>done({draft:draft.result??null,history:history.result??[],records,custody:custody?.result??null});
      tx.onabort=tx.onerror=()=>fail(tx.error??Error('Read the original browser draft custody.'));
    });}finally{db.close();}
  },{key:draftKey(new URL(page.url()).origin,scope),custodyKey});
}
async function formSnapshot(page){
  return page.evaluate(()=>{
    const fields={};for(const node of document.querySelectorAll('#buyer-form input[id],#buyer-form select[id],#buyer-form textarea[id]')){
      if(node.type==='file'||node.id.startsWith('allocation-'))continue;
      fields[node.id]=node.type==='checkbox'?node.checked:node.value;
    }
    const allocations=[...document.querySelectorAll('#allocations tr')].map(row=>({
      center:row.querySelector('.allocation-center').value,amount:row.querySelector('.allocation-amount').value,
      project:row.querySelector('.allocation-project').value,account:row.querySelector('.allocation-account').value}));
    const labels=[...document.querySelectorAll('#asset-labels tr')].map(row=>Object.fromEntries(
      [...row.querySelectorAll('[data-label-field]')].map(node=>[node.dataset.labelField,node.value])));
    return {fields,allocations,labels};
  });
}
async function settled(page){
  await page.waitForFunction(()=>document.getElementById('open-case')&&!document.getElementById('open-case').disabled,{},{timeout:30000});
  const error=await page.locator('#message').getAttribute('data-error');
  need(error!=='true','The real staff page rejected an operation: '+await page.locator('#message').innerText());
}

/** No financial action is prepared or executed here. Every amount, identifier,
 * coding and issued record comes from the completed original case. */
export async function receiveServiceBuyerWorkbench({
  directory,context,sourceUrl,receivingUrl,store,receivingStore,api,receivingApi,
  caseId,captureOutcomeId,buyerResult,sourceRevision,receivingRevision,sourceCommit,actor
}={}){
  need(isAbsolute(directory??'')&&context?.newPage&&api?.buyerRead&&receivingApi?.buyerRead,'Use the original private directory, browser and two case APIs.');
  const sourceOrigin=new URL(sourceUrl).origin,receiverOrigin=new URL(receivingUrl).origin;
  need(sourceOrigin!==receiverOrigin,'Use distinct actual source and receiving browser origins.');
  need(buyerResult?.case?.id===caseId&&buyerResult.capture?.id===captureOutcomeId&&buyerResult.buyer?.workspaceId&&buyerResult.period?.closeId,
    'Select the completed original buyer receiving result and its issued period.');
  const root=resolve(directory);await mkdir(root,{recursive:true,mode:0o700});
  const stat=await lstat(root);need(stat.isDirectory()&&!stat.isSymbolicLink(),'Keep the original receiving directory.');
  await mkdir(join(root,'files'),{recursive:true,mode:0o700});
  const identity={caseId,captureOutcomeId,buyerWorkspace:buyerResult.buyer.alias,workspaceId:buyerResult.buyer.workspaceId,
    sourceOrigin,receiverOrigin,sourceRevision,receivingRevision,buyerResultSha256:sha(json(buyerResult))};
  const path=join(root,'service-buyer-workbench-progress.json'),old=await optional(path);
  const state=old?JSON.parse(old):{schema:SCHEMA,identity,createdAt:new Date().toISOString(),sourceCommits:[],steps:{},artifacts:[],dispatch:null,custodyToken:randomUUID()};
  need(state.schema===SCHEMA&&same(state.identity,identity),'Continue this exact original case, buyer identity, revisions and two origins.');
  if(!state.sourceCommits.includes(sourceCommit))state.sourceCommits.push(sourceCommit);
  const save=()=>atomic(path,state);
  const keep=async(name,raw,type='application/json')=>{
    need(basename(name)===name,'Keep an ordinary complete artifact filename.');const target=join(root,'files',name);
    await retainCaseArtifact(target,raw);const row={path:target,name,bytes:raw.length,sha256:sha(raw),mediaType:type};
    const prior=state.artifacts.find(file=>file.path===target);if(prior)assert.deepEqual(prior,row);else state.artifacts.push(row);
    await save();return row;
  };
  const verify=async()=>{for(const f of state.artifacts){const raw=await readFile(f.path);assert.equal(raw.length,f.bytes);assert.equal(sha(raw),f.sha256);}};
  const phase=async(name,fn)=>{if(state.steps[name])return state.steps[name];const value=await fn();state.steps[name]=value;await save();return value;};
  await save();await verify();
  const source=await store.read(caseId,sourceRevision),received=await receivingStore.read(caseId,receivingRevision);
  need(source.revision===sourceRevision&&received.revision===receivingRevision&&source.workspaceText===received.workspaceText&&
    source.supportText===received.supportText&&same(source.metadata,received.metadata),'The two original named cases must contain the same complete source.');
  const sourceView=await api.buyerRead({id:caseId,revision:sourceRevision}),receiverView=await receivingApi.buyerRead({id:caseId,revision:receivingRevision});
  for(const key of ['captures','intents','outcomes','workflow'])assert.deepEqual(receiverView[key],sourceView[key]);
  const group=sourceView.workflow.groups.find(row=>row.capture.id===captureOutcomeId&&row.buyer.alias===identity.buyerWorkspace&&row.buyer.workspaceId===identity.workspaceId);
  need(group&&group.actions.length,'The complete original buyer workbench is absent.');
  const material=async(section,id)=>{
    const value=await api.buyerRead({id:caseId,revision:sourceRevision,section,recordId:id});
    need(value.records?.length===1&&value.records[0].id===id,'Read the one complete original saved record.');return value.records[0];
  };
  const purchaseRow=group.actions.find(row=>row.action==='coding_save'&&row.outcome),creditRow=group.actions.find(row=>row.action==='credit_coding_save'&&row.outcome);
  need(purchaseRow&&creditRow,'Retain the original saved purchase and return coding intents.');
  const purchase=await material('intents',purchaseRow.id),credit=await material('intents',creditRow.id);
  need(purchase.input.id===buyerResult.purchaseItemId&&credit.input.packetId===buyerResult.packetId&&purchase.input.packetId===buyerResult.packetId,
    'Use the original purchase, packet and verified return coding values.');
  const closeRow=group.actions.find(row=>row.action==='period_close'&&row.reference.closeId===buyerResult.period.closeId);
  const returnRow=group.actions.find(row=>row.action==='accountant_return_save'&&row.reference.buyerReturnId===buyerResult.accountant.buyerReturnId);
  need(closeRow?.outcome&&returnRow?.outcome,'Keep the original issued close and saved accountant return in the workbench.');
  const scope={caseId,captureOutcomeId,buyerWorkspace:identity.buyerWorkspace,workspaceId:identity.workspaceId};
  const custodyKey='service-buyer-workbench-custody:'+sha(json(identity));
  need(typeof state.custodyToken==='string','Retain the original helper/browser custody identity.');
  const originalRecords={group,purchase,credit,buyerResult,sourceView,receiverView};
  await keep('original-workbench-records-'+sha(json(originalRecords))+'.json',json(originalRecords));
  const resultPath=join(root,'service-buyer-workbench-result.json'),done=await optional(resultPath);
  if(done){const value=JSON.parse(done);need(value.result==='PASS'&&same(value.identity,identity),'Retain the original workbench result.');await verify();return {...value,reused:true};}
  let sourcePage,receiverPage;const errors=[],attempt=randomUUID();
  const observe=page=>page.on('pageerror',error=>errors.push(error.message));
  const protect=async page=>page.route('**/api/**',route=>{
    const request=route.request(),url=new URL(request.url());
    const safe=request.method()==='GET'||request.method()==='POST'&&
      (url.pathname==='/api/adjustments/buyer/open'||url.pathname==='/api/cases/'+caseId+'/adjustments/buyer-inspect');
    if(!safe){errors.push('Unexpected native mutation from workbench receiving: '+request.method()+' '+url.pathname);return route.abort('blockedbyclient');}
    return route.continue();
  });
  const openWorkflow=async(page,origin,revision)=>{
    const url=new URL('/adjustments',origin);url.searchParams.set('case',caseId);
    await page.goto(url.href,{waitUntil:'domcontentloaded'});
    await page.waitForFunction(({caseId,revision})=>document.body.dataset.caseReady==='true'&&document.body.dataset.caseId===caseId&&
      document.getElementById('case-revision')?.textContent.trim()===revision&&!document.getElementById('open-case').disabled,{caseId,revision},{timeout:30000});
    await page.locator('#operator-name').fill(actor);
    await page.locator('[data-workbench=group]').selectOption(group.id);
    await page.locator('[data-workbench=open]').click();await settled(page);
    need((await page.locator('[data-workbench=scope]').innerText()).includes(identity.workspaceId),'The visible workflow selected another Buyer workspace.');
    assert.equal(await page.locator('#buyer-capture').inputValue(),captureOutcomeId);
    assert.equal(await page.locator('#buyer-workspace').inputValue(),identity.buyerWorkspace);
    const disclosure=page.locator('details').filter({has:page.locator('#buyer-draft-file')});
    need(await disclosure.count()===1,'Locate the original saved-draft receiving disclosure.');
    if(await disclosure.getAttribute('open')===null)await disclosure.locator('summary').click();
    await page.locator('#buyer-draft-review').waitFor({state:'visible'});
  };
  const click=async(page,selector)=>{await page.locator(selector).click();await settled(page);};
  const download=async(page,selector,label)=>{
    const [event]=await Promise.all([page.waitForEvent('download',{timeout:30000}),page.locator(selector).click()]);
    const raw=await downloaded(event);await settled(page);
    const file=await keep(label+'-'+sha(raw)+'.json',raw);return {file,value:JSON.parse(raw),filename:event.suggestedFilename()};
  };
  const fillCoding=async(page,intent)=>{
    const input=intent.input,payload=input.payload;need(Array.isArray(payload.allocations)&&payload.allocations.length,'Use full original native allocation rows.');
    // Retain real loaded edit bases as well as the visible coding fields.
    await page.locator('#buyer-action').selectOption('labels_save');await click(page,'#read-labels');
    await page.locator('#buyer-action').selectOption('center_save');await page.locator('#center-picker').selectOption(payload.allocations[0].center_id);await settled(page);
    await page.locator('#buyer-action').selectOption('period_save');await page.locator('#period-edit').selectOption(buyerResult.period.id);await settled(page);
    await page.locator('#buyer-action').selectOption(intent.action);
    await page.locator('#buyer-packet').selectOption(input.packetId);
    if(intent.action==='coding_save')await page.locator('#buyer-item-id').fill(input.id);
    else await page.locator('#buyer-credit').selectOption(input.id);
    await click(page,'#read-coding-basis');
    await page.locator('#coding-date').fill(payload.recognition_date);
    await page.locator('#coding-memo').fill(payload.memo??'');
    while(await page.locator('#allocations tr').count()>payload.allocations.length)await page.locator('#allocations tr').last().getByRole('button',{name:'Remove',exact:true}).click();
    while(await page.locator('#allocations tr').count()<payload.allocations.length)await page.locator('#add-allocation').click();
    for(let i=0;i<payload.allocations.length;i++){
      const line=payload.allocations[i],row=page.locator('#allocations tr').nth(i);
      await row.locator('.allocation-center').selectOption(line.center_id);
      for(const [selector,value]of [['.allocation-amount',line.amount],['.allocation-project',line.project??''],['.allocation-account',line.account_code??'']])
        await row.locator(selector).fill(String(value));
    }
  };
  const savedDraft=async(page,intent,label)=>{
    const before=await localDraft(page,scope,custodyKey);await keep(label+'-prior-browser-'+sha(json(before))+'.json',json(before));
    await fillCoding(page,intent);const wanted=await formSnapshot(page);
    await click(page,'#buyer-draft-save');
    const downloaded=await download(page,'#buyer-draft-download',label);
    const draft=downloaded.value;assert.deepEqual(draft.scope,scope);
    for(const key of ['fields','allocations','labels'])assert.deepEqual(draft[key],wanted[key]);
    need(draft.labelBasis&&draft.centerBasis&&draft.periodBasis,'Retain the actual loaded labels, cost centre and period edit bases.');
    assert.equal(draft.fields['buyer-action'],intent.action);
    assert.equal(draft.fields['coding-date'],intent.input.payload.recognition_date);
    assert.equal(draft.fields['coding-memo'],intent.input.payload.memo??'');
    assert.deepEqual(draft.allocations,intent.input.payload.allocations.map(row=>({center:row.center_id,amount:String(row.amount),project:row.project??'',account:row.account_code??''})));
    return downloaded;
  };
  try{
    sourcePage=await context.newPage();receiverPage=await context.newPage();observe(sourcePage);observe(receiverPage);
    await protect(sourcePage);await protect(receiverPage);
    await openWorkflow(sourcePage,sourceOrigin,sourceRevision);await openWorkflow(receiverPage,receiverOrigin,receivingRevision);
    // A helper-owned marker distinguishes this retained browser database from
    // a missing/restored profile; it contains no financial request or draft.
    await receiverPage.evaluate(async ({key,token,create})=>{
      const db=await new Promise((done,fail)=>{const r=indexedDB.open('merchant-service-adjustments',1);r.onsuccess=()=>done(r.result);r.onerror=()=>fail(r.error);});
      try{await new Promise((done,fail)=>{let problem;const tx=db.transaction('requests','readwrite'),s=tx.objectStore('requests'),r=s.get(key);
        r.onsuccess=()=>{if(r.result===undefined&&create)s.add(token,key);else if(r.result!==token){problem=Error('Restore the original receiving browser custody before continuation.');tx.abort();}};
        tx.oncomplete=done;tx.onabort=tx.onerror=()=>fail(problem??tx.error);});}finally{db.close();}
    },{key:custodyKey,token:state.custodyToken,create:!state.dispatch});
    const sourceDraft=await phase('source-draft',()=>savedDraft(sourcePage,purchase,'source-draft'));
    const receiverBefore=await phase('receiver-prior-draft',()=>savedDraft(receiverPage,credit,'receiver-prior-draft'));
    need(same((await localDraft(sourcePage,scope,custodyKey)).draft,sourceDraft.value),'The original source browser draft changed; preserve its current edit before continuation.');
    const receivedDraft=await phase('draft-file-received',async()=>{
      let local=await localDraft(receiverPage,scope,custodyKey);
      const matches=local.records.filter(row=>row&&row.file.sha256===sourceDraft.file.sha256&&same(row.scope,scope)&&
        same(row.receivedDraft,sourceDraft.value)&&same(row.previousDraft,receiverBefore.value));
      need(matches.length<=1,'The original draft receiving receipt is ambiguous.');
      let receipt=matches[0];
      if(!receipt){
        need(local.custody===state.custodyToken&&same(local.draft,receiverBefore.value),'The receiver draft or original browser custody changed; retain both original editions.');
        if(state.dispatch){
          need(same(local.history,state.dispatch.previousHistory)&&same(local.records,state.dispatch.previousRecords),
            'The original draft receiving history changed while its dispatch was uncertain.');
        }else state.dispatch={sourceFile:sourceDraft.file,previousDraftSha256:sha(json(receiverBefore.value)),
          previousHistory:structuredClone(local.history),previousRecords:structuredClone(local.records),attempts:[]};
        await receiverPage.locator('#buyer-draft-file').setInputFiles(sourceDraft.file.path);
        await click(receiverPage,'#buyer-draft-review');
        need((await receiverPage.locator('#buyer-draft-import-review').innerText()).includes(sourceDraft.file.sha256),'The displayed file review selected different bytes.');
        state.dispatch.attempts.push({at:new Date().toISOString(),reviewedFileSha256:sourceDraft.file.sha256,
          displayedReview:await receiverPage.locator('#buyer-draft-import-review').innerText(),
          before:{draftSha256:sha(json(local.draft)),historySha256:sha(json(local.history)),custody:local.custody}});await save();
        await click(receiverPage,'#buyer-draft-receive');
        local=await localDraft(receiverPage,scope,custodyKey);
        const accepted=local.records.filter(row=>row?.file.sha256===sourceDraft.file.sha256&&same(row.receivedDraft,sourceDraft.value)&&same(row.previousDraft,receiverBefore.value));
        need(accepted.length===1,'Receive and retain exactly one original complete draft receipt.');receipt=accepted[0];
      }
      state.dispatch??={sourceFile:sourceDraft.file,previousDraftSha256:sha(json(receiverBefore.value)),attempts:[],reconciledExistingReceipt:true};
      state.dispatch.acceptedReceiptId=receipt.id;await save();
      need(same(local.draft,sourceDraft.value)&&same(receipt.scope,scope),'The complete original draft was not retained in the receiving browser.');
      const raw=await readFile(sourceDraft.file.path);assert.equal(receipt.file.source,raw.toString('utf8'));
      assert.equal(receipt.file.bytes,raw.length);assert.equal(receipt.file.sha256,sha(raw));
      await click(receiverPage,'#buyer-draft-refresh-receipts');
      await receiverPage.locator('#buyer-draft-receipts').selectOption(receipt.id);
      const whole=await download(receiverPage,'#buyer-draft-download-receipt','draft-complete-receipt');
      assert.deepEqual(whole.value,receipt);
      const previous=await download(receiverPage,'#buyer-draft-download-previous','draft-original-previous');
      assert.deepEqual(previous.value,receiverBefore.value);
      return {id:receipt.id,whole,previous,receivedDraftSha256:sha(json(sourceDraft.value)),history:local.history};
    });
    await phase('draft-reopened',async()=>{
      await openWorkflow(receiverPage,receiverOrigin,receivingRevision);await click(receiverPage,'#buyer-draft-restore');
      const visible=await formSnapshot(receiverPage);for(const key of ['fields','allocations','labels'])assert.deepEqual(visible[key],sourceDraft.value[key]);
      const local=await localDraft(receiverPage,scope,custodyKey);assert.deepEqual(local.draft,sourceDraft.value);
      need(local.records.some(row=>same(row,receivedDraft.whole.value)),'Reopen the same complete receiving receipt after navigation.');
      const again=await download(receiverPage,'#buyer-draft-download','draft-reopened');
      assert.deepEqual(again.value,sourceDraft.value);return {draft:again,history:local.history};
    });
    const reviewWorkbench=async(page,label,revision)=>{
      await openWorkflow(page,label==='source'?sourceOrigin:receiverOrigin,revision);
      const expected=[...group.actions].reverse(),seen=[],records=[],pages=[];
      for(let offset=0;offset<expected.length;offset+=20){
        const selected=expected.slice(offset,offset+20),rows=page.locator('[data-workbench=actions] tbody tr');
        assert.equal(await rows.count(),selected.length);
        assert.equal(await page.locator('[data-workbench=page]').innerText(),String(offset+1)+'–'+Math.min(offset+20,expected.length)+' of '+expected.length);
        pages.push({offset,ids:selected.map(row=>row.id)});
        for(let index=0;index<selected.length;index++){
          const action=selected[index],row=rows.nth(index);seen.push(action.id);
          for(const [section,id,button]of [['intents',action.id,'Prepared action'],...(action.outcome?[['outcomes',action.outcome.id,'Original outcome']]:[])]){
            await row.getByRole('button',{name:button,exact:true}).click();await settled(page);
            const full=await material(section,id),display=await page.locator('[data-workbench=record] pre').innerText();
            need((await page.locator('[data-workbench=record]').innerText()).includes(id),'The workbench opened another original record.');
            const file=await download(page,'[data-workbench=record] button',label+'-'+section+'-'+id);
            assert.deepEqual(file.value,full);need(display.length>0,'Show the complete record preview.');
            records.push({section,id,file:file.file});
          }
        }
        if(offset+20<expected.length){need(await page.locator('[data-workbench=next]').isVisible(),'The next original action page is missing.');await page.locator('[data-workbench=next]').click();}
        else need(await page.locator('[data-workbench=next]').isHidden(),'The last original action page has a spurious continuation.');
      }
      assert.deepEqual(seen,expected.map(row=>row.id));
      while(await page.locator('[data-workbench=previous]').isVisible())await page.locator('[data-workbench=previous]').click();
      await page.locator('#buyer-action').selectOption('delivery');
      await page.locator('#saved-delivery-close').selectOption(closeRow.id);await settled(page);
      assert.equal(await page.locator('#delivery-close-id').inputValue(),buyerResult.period.closeId);
      await page.locator('#buyer-action').selectOption('accountant_return_save');
      await page.locator('#saved-return-close').selectOption(closeRow.id);await settled(page);
      assert.equal(await page.locator('#return-close-id').inputValue(),buyerResult.period.closeId);
      const screenshots=[];
      for(const [name,width,height]of [['desktop',1440,1000],['mobile',390,844]]){
        await page.setViewportSize({width,height});const body=await page.screenshot({fullPage:true,animations:'disabled'});
        screenshots.push(await keep(label+'-'+name+'-'+attempt+'.png',body,'image/png'));
      }
      return {revision,pages,records,screenshots,savedCloseId:buyerResult.period.closeId,savedReturnId:buyerResult.accountant.buyerReturnId};
    };
    const sourceWork=await phase('source-workbench',()=>reviewWorkbench(sourcePage,'source',sourceRevision));
    const receiverWork=await phase('receiving-workbench',()=>reviewWorkbench(receiverPage,'receiver',receivingRevision));
    assert.deepEqual(sourceWork.pages,receiverWork.pages);
    for(const item of sourceWork.records){const other=receiverWork.records.find(row=>row.section===item.section&&row.id===item.id);
      need(other&&other.file.sha256===item.file.sha256,'The receiving workbench lost an exact original prepared action or outcome.');}
    const afterSource=await store.read(caseId),afterReceiver=await receivingStore.read(caseId);
    assert.equal(afterSource.revision,sourceRevision);assert.equal(afterReceiver.revision,receivingRevision);
    assert.equal(afterSource.workspaceText,source.workspaceText);assert.equal(afterReceiver.workspaceText,received.workspaceText);
    assert.deepEqual(errors,[],'The original workbench browser encountered an uncaught error or attempted a financial mutation.');
    await verify();
    const result={schema:SCHEMA,result:'PASS',identity,sourceCommits:state.sourceCommits,completedAt:new Date().toISOString(),
      sourceIntentId:purchase.id,priorReceiverIntentId:credit.id,receiptId:receivedDraft.id,
      source:sourceWork,receiver:receiverWork,draft:state.steps['draft-reopened'],artifacts:state.artifacts,steps:state.steps,
      financialMutations:0,originalCasesUnchanged:true};
    await retainCaseArtifact(resultPath,json(result));state.result='PASS';await save();return result;
  }catch(error){state.lastError={at:new Date().toISOString(),message:error.message};await save();throw error;}
  finally{await sourcePage?.close().catch(()=>{});await receiverPage?.close().catch(()=>{});}
}
