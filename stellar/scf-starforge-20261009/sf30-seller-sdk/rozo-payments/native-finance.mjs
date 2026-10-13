// Following financial programme over one original ROZO report and configured native owners.
import { mkdirSync, existsSync, readFileSync, realpathSync } from 'node:fs';
import { join, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import { assert, fields, id, text, sha, canonical, digest, jsonDigest, clone } from './model.mjs';
import { acquireLease } from './lease.mjs';
import { startRozoServer } from './server.mjs';
import { putOriginal, hashOriginalFile, receiveDelivery } from './delivery.mjs';
import { nativeInventory } from './native-inventory.mjs';
import { accountantColumns, parseReturnCsv } from '../../merchant-settlement-accounting/accountant/engine.mjs';
import { FINANCE_OPERATION, PRODUCT, jsonBytes, originalJSON, retainFinance, copyFinanceTree,
  financeFiles, financeChild, recordFinanceProcess, originalFinanceHostSources, financeUUID, openFinanceJournal } from './finance-native-support.mjs';

function planInput(plan,service){
  fields(plan,['schema','operationId','workspaceId','originId','actor','report','source','accounting','buyer','accountant','browser','handover','maintenance'],'finance receiving plan');
  assert(plan.schema==='stellar-forge.rozo-finance-plan.v1','FINANCE_PLAN','Use the retained complete finance plan.');
  id(plan.operationId,'finance operation');text(plan.actor,'operator',160);
  const m=service.workspace.meta();assert(plan.workspaceId===m.workspaceId&&plan.originId===m.originId,'FINANCE_PLAN_CASE','Use the original selected ROZO case.');
  assert(typeof plan.handover==='boolean','FINANCE_PLAN_HANDOVER','Choose working export or explicit permanent custody handover.');
  assert(plan.accounting&&Array.isArray(plan.accounting.codings)&&Array.isArray(plan.accounting.dispositions),'FINANCE_PLAN_ACCOUNTING','Review every selected movement and its intended coding or disposition.');
  assert(plan.maintenance?.externalWritersStopped===true,'FINANCE_PLAN_WRITERS','Confirm the original Accounting input writers are stopped for its complete native backup.');
  assert(plan.browser?.movementId&&plan.accounting.codings.some(c=>c.movementId===plan.browser.movementId),'FINANCE_PLAN_BROWSER','Choose one planned merchant coding operation for the actual staff form.');
  assert(plan.accountant?.status==='REVIEWED'&&typeof plan.accountant.note==='string','FINANCE_PLAN_ACCOUNTANT','The receiving programme marks reviewed evidence only; select the explicit review note.');
  const facts=service.finance.report(plan.report),unique=new Set();
  for(const c of [...plan.accounting.codings,...plan.accounting.dispositions]){
    id(c.movementId);sha(c.basisSha256);assert(!unique.has(c.movementId),'FINANCE_PLAN_DUPLICATE','One original movement has two planned decisions.');unique.add(c.movementId);
    const row=facts.movements.find(m=>m.id===c.movementId);assert(row?.basisSha256===c.basisSha256,'FINANCE_PLAN_SOURCE','A planned movement is absent or changed.');
  }
  return facts;
}
export function prepareRozoFinancePlan(service,{report,actor,source,operationId=FINANCE_OPERATION}){
  const captured=service.finance.capture(report),facts=service.finance.report(report),m=service.workspace.meta();
  return {plan:{schema:'stellar-forge.rozo-finance-plan.v1',operationId,workspaceId:m.workspaceId,originId:m.originId,actor,report,
    source,accounting:{binding:null,period:null,codings:facts.movements.filter(m=>m.providerConfirmed&&m.amountObserved).map(m=>({
      movementId:m.id,basisSha256:m.basisSha256,recognitionDate:m.sourceDay,reason:null,providerEvidenceAcknowledged:false,
      allocations:[{amount:m.amount.units,accountCode:null,costCenter:'',project:'',memo:''}]})),dispositions:[]},
    buyer:null,accountant:{status:'REVIEWED',note:null},browser:{movementId:null},handover:false,maintenance:{externalWritersStopped:false}},
    source:{name:captured.descriptor.name,bytes:captured.raw.length,sha256:digest(captured.raw)},sourceBytes:captured.raw,
    movements:facts.movements};
}
async function ownerPage(finance,binding,path){
  const rows=[];let offset=0;
  for(;;){const page=await finance.read({target:'buyer',binding,path:path+(path.includes('?')?'&':'?')+'offset='+offset+'&limit=200'});
    assert(Array.isArray(page.items)&&Number.isSafeInteger(page.total),'FINANCE_NATIVE_PAGE','Read the original full native page.');
    rows.push(...page.items);if(page.next===null||page.next===undefined&&rows.length>=page.total)return rows;
    const next=page.next;assert(Number.isSafeInteger(next)&&next>offset,'FINANCE_NATIVE_CURSOR','The original native page did not advance.');offset=next;
  }
}
function reviewedCsv(bytes,handoff,{status,note}){
  const parsed=parseReturnCsv(bytes,{columns:accountantColumns(handoff)}),positions=Object.fromEntries(parsed.headers.map((v,i)=>[v,i]));
  for(const key of ['externalStatus','externalNote'])assert(Number.isInteger(positions[key]),'FINANCE_CSV','The original accountant template columns are missing.');
  for(const row of parsed.records){row.values[positions.externalStatus]=status;row.values[positions.externalNote]=note;}
  const quote=value=>'"'+String(value).replaceAll('"','""')+'"';
  return Buffer.from([parsed.headers,...parsed.records.map(r=>r.values)].map(row=>row.map(quote).join(',')).join('\r\n')+'\r\n');
}
export async function runRozoFinance({service,directory,plan,backupRoot,passEnv='STARFORGE_ACCOUNTING_BACKUP_PASSPHRASE',
  python='python3',chromium,playwrightModule,onProgress,maintenanceContinuation=null,merchantConfig,accountingAlias}){
  if(maintenanceContinuation){
    fields(maintenanceContinuation,['schema','operationId','jobs'],'maintenance continuation');
    assert(maintenanceContinuation.schema==='stellar-forge.rozo-finance-maintenance-continuation.v1'&&maintenanceContinuation.operationId===plan.operationId&&maintenanceContinuation.jobs&&typeof maintenanceContinuation.jobs==='object','FINANCE_MAINTENANCE_CONTINUATION','Choose explicit following requests for this original finance programme.');
  }
  const facts=planInput(plan,service),finance=service.finance,w=service.workspace;
  directory=resolve(directory);const lease=acquireLease(w,'finance-native:'+jsonDigest({operationId:plan.operationId}));
  const journal=openFinanceJournal(service,directory,plan),{progress,save,step,invoke}=journal;
  const a=plan.accounting.binding,b=plan.buyer?.binding??null;let server=null;
  const packageCompleted=async result=>{
    const out=join(directory,'Rozo_Finance_Complete.zip'),entry=fileURLToPath(new URL('./finance-archive.py',import.meta.url));
    const response=await financeChild(python,['-B',entry,'pack','--directory',directory,'--out',out]);
    assert(response.code===0,'FINANCE_PACKAGE','The original complete financial package was not preserved.',500,{stderr:response.stderr});
    const packet=JSON.parse(response.stdout);retainFinance(join(directory,'FINANCE_PACKAGE_RECEIPT.json'),packet);
    return {...result,package:packet};
  };
  const state=()=>finance.state(),aState=()=>finance.read({target:'accounting',binding:a}),bState=()=>finance.buyerRead(b,'/api/state');
  const aMutate=(label,command,payload)=>invoke(label,'finance.accounting.mutate',async()=>({binding:a,nativeRevision:(await aState()).revision,command,payload}));
  const bMutate=(label,path,payload)=>invoke(label,'finance.buyer.mutate',async()=>({binding:b,nativeRevision:(await bState()).revision,path,payload}));
  const saveBytes=(name,bytes)=>{putOriginal(join(directory,'files',name),bytes);return {path:'files/'+name,bytes:bytes.length,sha256:digest(bytes)};};
  const nativeFiles=async(label,payload)=>{
    const delivered=await invoke(label,'finance.delivery',payload),rows=delivered.result.files;
    assert(Array.isArray(rows),'FINANCE_DELIVERY','The original delivery has no complete file list.');
    for(const row of rows){const raw=w.wholeObject(row.sha256);assert(raw.length===row.bytes&&digest(raw)===row.sha256,'FINANCE_DELIVERY','An original delivered file differs.');saveBytes(jsonDigest({label}).slice(0,16)+'-'+row.name,raw);}
    return delivered;
  };
  const accountant=async(label,kind,close)=>{
    const created=await step(label+'.create',()=>invoke(label+'.create',kind==='buyer'?'finance.buyer.accountant':'finance.accountant.create',async()=>({
      binding:a,...(kind==='buyer'?{buyerBinding:b}:{}),nativeRevision:(await state()).accounting.accountant.revision,
      closeId:close.id,sourceSha256:close.sha256,name:plan.source.name+' '+kind+' accountant'})));
    const handoffId=created.result.record.id;
    await step(label+'.initial-files',()=>nativeFiles(label+'.initial-files',{binding:a,target:'accountant',id:handoffId,revisionId:'initial'}));
    const preview=await step(label+'.preview',async()=>{
      const detail=await finance.read({target:'accountant',binding:a,id:handoffId}),descriptors=detail.record.files;
      const template=descriptors.find(f=>f.name==='accountant.csv');assert(template,'FINANCE_CSV','Retain the original editable accountant CSV.');
      const original=await finance.file({target:'accountant',binding:a,id:handoffId,name:template.name,revisionId:'initial'});
      const full=await finance.file({target:'accountant',binding:a,id:handoffId,name:'handoff.json',revisionId:'initial'});
      const csv=reviewedCsv(original.bytes,JSON.parse(full.bytes),plan.accountant),saved=saveBytes(label+'-reviewed.csv',csv);
      const parent=detail.record.revisions.at(-1)?.id??null;
      const value=await finance.accountantPreview({binding:a,handoffId,csvBase64:csv.toString('base64'),name:label+' reviewed evidence',
        actor:plan.actor,expectedParentId:parent,id:financeUUID(plan.operationId,label+'.return'),createdAt:new Date().toISOString()});
      return {file:saved,csvBase64:csv.toString('base64'),preview:value,parent};
    });
    const accepted=await step(label+'.return',()=>invoke(label+'.return','finance.accountant.return',{
      binding:a,nativeRevision:preview.preview.workspaceRevision,handoffId,return:{
        id:preview.preview.revision.id,createdAt:preview.preview.revision.createdAt,csvBase64:preview.csvBase64,
        name:label+' reviewed evidence',expectedParentId:preview.parent,previewSha256:preview.preview.revision.integrity.sha256}}));
    const revisionId=accepted.result.savedReturn.id;
    await step(label+'.return-files',()=>nativeFiles(label+'.return-files',{binding:a,target:'accountant',id:handoffId,revisionId}));
    return {handoffId,revisionId,rows:accepted.result.savedReturn.summary,source:close};
  };
  try{
    if(progress.state==='complete'&&existsSync(join(directory,'FINANCE_RESULT.json'))){
      const previous=originalJSON(join(directory,'FINANCE_RESULT.json'));
      assert(previous.operationId===plan.operationId&&previous.planSha256===journal.planHash,'FINANCE_COMPLETION','The completed native result belongs to another exact plan.');
      return await packageCompleted(previous);
    }
    await step('originals',async()=>{
      const current=await state();
      assert(canonical(current.accounting?.binding)===canonical(a)&&current.accounting.sourceMode==='merchant','FINANCE_OWNER','Use the configured original merchant accounting owner.');
      if(b)assert(canonical(current.buyer?.binding)===canonical(b),'FINANCE_OWNER','Use the selected original Buyer owner.');
      const captured=finance.capture(plan.report);saveBytes('original-rozo-finance-source.json',captured.raw);
      retainFinance(join(directory,'ORIGINAL_FINANCE_STATE.json'),current);return {sourceId:captured.source.sourceId,sourceSha256:digest(captured.raw),movementCount:facts.movements.length};
    });
    const sourceId=progress.steps.originals.sourceId;
    const capture=await step('merchant.capture',async()=>{
      const input=clone(plan.source),preview=await finance.preview({kind:'accounting',binding:a,report:plan.report,input,actor:plan.actor});
      return invoke('merchant.capture','finance.accounting.capture',{binding:a,report:plan.report,
        input:{...input,previewSha256:preview.preview.previewSha256},nativeRevision:preview.preview.revision});
    });
    await step('merchant.accept',()=>aMutate('merchant.accept','source.review',{captureId:capture.result.capture.id,decision:'accept',reason:plan.accounting.reviewReason??plan.source.provenance}));
    const period=await step('merchant.period',()=>invoke('merchant.period','finance.accounting.period',async()=>({
      binding:a,nativeRevision:(await aState()).revision,period:{...plan.accounting.period,select:true}})));
    const periodSelection={id:period.result.definition.id,version:period.result.version.version};
    if(!progress.steps['staff.coding']){
      server=await startRozoServer({service,host:'127.0.0.1',port:0});
      const {runFinanceBrowser}=await import('./finance-browser.mjs');
      const coding=plan.accounting.codings.find(c=>c.movementId===plan.browser.movementId);
      await step('staff.coding',()=>runFinanceBrowser({service,startup:server.startup,directory:join(directory,'browser'),plan,coding,chromium,playwrightModule,phase:'coding'}));
    }
    for(const coding of plan.accounting.codings){
      if(coding.movementId===plan.browser.movementId)continue;
      const label='merchant.coding.'+coding.movementId;
      await step(label,async()=>{const row=(await aState()).rows.find(r=>r.movement.id===coding.movementId);assert(row,'FINANCE_CODING','The selected original movement is absent.');
        return aMutate(label,'coding.save',{...coding,expectedVersion:row.coding?.version??0});});
    }
    for(const decision of plan.accounting.dispositions){
      const label='merchant.disposition.'+decision.movementId;
      await step(label,async()=>{const row=(await aState()).rows.find(r=>r.movement.id===decision.movementId);assert(row,'FINANCE_DISPOSITION','The selected original movement is absent.');
        return aMutate(label,'disposition.save',{...decision,missing:row.missing,period:periodSelection});});
    }
    const reviewed=await step('merchant.review',async()=>{
      const selected={period:periodSelection,sourceIds:[sourceId],dataContext:plan.source.dataContext};
      const preview=await finance.periodPreview({binding:a,...selected});
      retainFinance(join(directory,'MERCHANT_REVIEW.json'),preview);
      assert(preview.ready,'FINANCE_PERIOD_EXCEPTIONS','Complete the original period exceptions; the retained plan does not silently invent dispositions.',409,preview.issues);
      return aMutate('merchant.review','period.review',{...selected,contextSha256:preview.contextSha256,note:plan.accounting.reviewReason??plan.source.provenance});
    });
    const closed=await step('merchant.close',()=>aMutate('merchant.close','period.close',{
      reviewId:reviewed.result.review.id,contextSha256:reviewed.result.review.contextSha256,note:plan.accounting.closeNote??plan.source.provenance}));
    await step('merchant.close-file',()=>nativeFiles('merchant.close-file',{target:'accounting-close',binding:a,id:closed.result.close.id,expectedSha256:closed.result.close.sha256}));
    const merchantAccountant=await accountant('merchant.accountant','accounting',closed.result.close);
    let buyerAccountant=null;
    if(plan.buyer){
      const captured=await step('buyer.capture',async()=>{
        const input={...plan.source,selection:plan.buyer.purchaseSelection};
        const preview=await finance.preview({kind:'buyer',binding:b,report:plan.report,input,actor:plan.actor});
        if(plan.buyer.rozoSource){
          const configured=await finance.buyer.call('merchant_buyer_expense_rozo_preview',{workspace:b.alias,rozoSource:plan.buyer.rozoSource,
            operator:plan.actor,purchaseSelection:plan.buyer.purchaseSelection});
          retainFinance(join(directory,'CONFIGURED_BUYER_PREVIEW.json'),configured);
          assert(canonical(configured)===canonical(preview.preview),'FINANCE_CONFIGURED_SOURCE','The configured source path, metadata, operator and full explicit purchase preview must match this original report intake.');
        }
        return invoke('buyer.capture','finance.buyer.capture',{binding:b,report:plan.report,input:{...input,previewSha256:preview.preview.preview_sha256},nativeRevision:preview.revision});
      });
      const buyerSource=captured.result.result.id,captureId=captured.result.result.capture.id;
      await step('buyer.accept',()=>captured.result.result.capture.status==='ACCEPTED'?{reused:true,captureId}:bMutate('buyer.accept','/api/captures/'+captureId+'/decision',{decision:'ACCEPT',reason:plan.buyer.reviewReason??plan.source.provenance,operator:plan.actor}));
      for(const center of plan.buyer.centers??[])await step('buyer.center.'+center.code,()=>bMutate('buyer.center.'+center.code,'/api/centers',center));
      if(plan.buyer.labels)await step('buyer.labels',()=>bMutate('buyer.labels','/api/labels',{assets:plan.buyer.labels}));
      const bp=await step('buyer.period',()=>bMutate('buyer.period','/api/periods',plan.buyer.period)),periodId=bp.result.result.id;
      for(const coding of plan.buyer.codings){
        const label='buyer.coding.'+coding.movementId;
        await step(label,async()=>{
          const items=await ownerPage(finance,b,'/api/expenses?source='+encodeURIComponent(buyerSource)),item=items.find(i=>i.row.native_detail?.rozo_movement_id===coding.movementId||i.row.request_id===coding.movementId);
          assert(item,'FINANCE_BUYER_PURCHASE','The explicitly selected original buyer movement is absent.');
          const current=await bState(),allocations=coding.allocations.map(line=>{
            const c=current.centers.find(x=>x.id===line.center_id||x.code===line.center_code);assert(c?.active,'FINANCE_CENTER','Choose an existing active original cost center.');
            const {center_code,...rest}=line;return {...rest,center_id:c.id};
          });
          return bMutate(label,'/api/items/'+item.id+'/coding',{basis:item.basis,recognition_date:coding.recognition_date,memo:coding.memo??'',operator:plan.actor,allocations});
        });
      }
      for(const decision of plan.buyer.dispositions??[]){
        const label='buyer.disposition.'+jsonDigest(decision);
        await step(label,async()=>{
          const report=await finance.buyerRead(b,'/api/periods/'+periodId+'/report'),issue=report.issues.find(i=>i.code===decision.code&&i.item_id===decision.item_id);
          assert(issue?.allowed_kinds.includes(decision.kind),'FINANCE_BUYER_EXCEPTION','Select an actual original permitted disposition.');
          return bMutate(label,'/api/periods/'+periodId+'/disposition',{item_id:issue.item_id,code:issue.code,basis:issue.basis,kind:decision.kind,reason:decision.reason,operator:plan.actor});
        });
      }
      const br=await step('buyer.review',()=>bMutate('buyer.review','/api/periods/'+periodId+'/review',{reviewer:plan.actor,role:'Original finance receiving reviewer',notes:plan.buyer.reviewReason??plan.source.provenance}));
      assert(br.result.result.decision==='READY','FINANCE_BUYER_EXCEPTIONS','The Buyer period still has original exceptions; preserve and review them.');
      const bc=await step('buyer.close',()=>bMutate('buyer.close','/api/periods/'+periodId+'/close',{review_id:br.result.result.id})),closeId=bc.result.result.id;
      const buyerSourceFile=await finance.file({target:'buyer',binding:b,path:'/api/closes/'+closeId+'/accountant-source',name:'original-buyer-source.json'});
      saveBytes('original-buyer-source.json',buyerSourceFile.bytes);
      buyerAccountant=await accountant('buyer.accountant','buyer',{id:closeId,sha256:digest(buyerSourceFile.bytes)});
      const returnPreview=await step('buyer.return-preview',()=>finance.buyerReturnPreview({binding:b,accountingBinding:a,closeId,
        handoffId:buyerAccountant.handoffId,revisionId:buyerAccountant.revisionId,name:'Original accountant review',actor:plan.actor,
        reason:plan.accountant.note,supersedes:null}));
      await step('buyer.return',()=>invoke('buyer.return','finance.buyer.return',{binding:b,accountingBinding:a,nativeRevision:returnPreview.state.revision,
        closeId,handoffId:buyerAccountant.handoffId,revisionId:buyerAccountant.revisionId,fileSha256:returnPreview.file.sha256,
        input:{name:'Original accountant review',reason:plan.accountant.note,supersedes:null,previewSha256:returnPreview.preview.preview_sha256}}));
      await step('buyer.complete-project',()=>nativeFiles('buyer.complete-project',async()=>({target:'buyer',binding:b,nativeRevision:(await bState()).revision})));
    }
    if(!server)server=await startRozoServer({service,host:'127.0.0.1',port:0});
    const {runFinanceBrowser}=await import('./finance-browser.mjs');
    await step('staff.delivery',()=>runFinanceBrowser({service,startup:server.startup,directory:join(directory,'browser'),plan,chromium,playwrightModule,phase:'delivery'}));
    const final=await step('native.final-state',async()=>{const view=await state();retainFinance(join(directory,'FINAL_FINANCE_STATE.json'),view);return {accountingRevision:view.accounting.accountant.revision,buyerRevision:view.buyer?.state.revision??null};});
    const hostRecovery=await originalFinanceHostSources({merchantConfig,accountingAlias});
    const maintenance=async(name,operation,args={})=>{
      let selected=progress.maintenance[name];
      if(!selected){selected={workspace:a.alias,actor:plan.actor,requestId:financeUUID(plan.operationId,'maintenance.'+name),...args};progress.maintenance[name]=selected;save();}
      const following=maintenanceContinuation?.jobs?.[name];
      if(following&&following.requestId!==selected.requestId){
        fields(following,['previousRequestId','requestId'],'following maintenance request');
        assert(following.previousRequestId===selected.requestId&&/^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i.test(following.requestId),'FINANCE_MAINTENANCE_CONTINUATION','Bind the explicit following UUID to its actual original request.');
        const previous=(await finance.accounting.call('merchant_accounting_maintenance_job',{workspace:a.alias,jobId:selected.requestId})).job;
        assert(previous?.id===selected.requestId&&['FAILED','CANCELLED','INTERRUPTED'].includes(previous.status),'FINANCE_MAINTENANCE_CONTINUATION','Only a confirmed terminal original maintenance job permits an explicit following request.');
        retainFinance(join(directory,'maintenance',name+'-'+previous.id+'.json'),previous);
        progress.maintenanceHistory??=[];progress.maintenanceHistory.push({name,request:clone(selected),job:clone(previous)});
        selected={...selected,requestId:following.requestId};progress.maintenance[name]=selected;save();
      }
      const response=await finance.accounting.call('merchant_accounting_maintenance_'+operation,selected);
      let job=response.job;assert(job?.id===selected.requestId,'FINANCE_MAINTENANCE','The original maintenance job identity differs.');
      while(['QUEUED','RUNNING'].includes(job.status)){
        onProgress?.({operationId:plan.operationId,phase:'accounting.'+operation,jobId:job.id,status:job.status});
        await new Promise(resolve=>setTimeout(resolve,250));job=(await finance.accounting.call('merchant_accounting_maintenance_job',{workspace:a.alias,jobId:job.id})).job;
      }
      retainFinance(join(directory,'maintenance',name+'-'+job.id+'.json'),job);
      assert(job.status==='COMPLETE','FINANCE_MAINTENANCE_INCOMPLETE','Retain the original native maintenance outcome before continuing.',409,job);
      return job;
    };
    await step('accounting.pause',()=>maintenance('pause','pause'));
    const review=await step('accounting.review',()=>maintenance('review','review'));
    const backup=await step('accounting.backup',()=>maintenance('backup','backup',{expectedReviewId:review.result.reviewId,externalWritersStopped:true,label:plan.operationId}));
    await step('accounting.verify',()=>maintenance('verify','verify',{backupId:'backup-'+backup.id,expectedSha256:backup.result.manifestSha256}));
    const originalBackup=join(realpathSync(backupRoot),'backup-'+backup.id);
    await step('accounting.copy',async()=>{
      const rows=copyFinanceTree(originalBackup,join(directory,'accounting-backup'));
      return {manifestSha256:backup.result.manifestSha256,files:rows};
    });
    await step('accounting.resume',()=>maintenance('resume','resume'));
    const exported=await step('rozo.export',()=>invoke('rozo.export',plan.handover?'workspace.handover':'workspace.export',{
      id:'finance-'+jsonDigest({operationId:plan.operationId}).slice(0,24),title:plan.source.name+' complete financial workspace'}));
    assert(exported.delivery?.path,'FINANCE_ROZO_EXPORT','Retain the actual complete ROZO archive descriptor.');
    const archiveRaw=readFileSync(exported.delivery.path);saveBytes('Rozo_Workspace.zip',archiveRaw);
    const snapshot=nativeInventory(w);retainFinance(join(directory,'ROZO_INVENTORY.json'),snapshot);
    const descriptor={schema:'stellar-forge.rozo-finance-receiving.v1',operationId:plan.operationId,planSha256:journal.planHash,
      rozo:{archive:'files/Rozo_Workspace.zip',sha256:digest(archiveRaw),bytes:archiveRaw.length,inventory:'ROZO_INVENTORY.json',handover:plan.handover},
      accounting:{binding:a,backup:'accounting-backup',manifestSha256:backup.result.manifestSha256,passEnv,revision:final.accountingRevision,hostConfiguration:hostRecovery.identity},
      buyer:b?{binding:b,delivery:progress.steps['buyer.complete-project'].result,revision:final.buyerRevision}:null,
      accountant:{merchant:merchantAccountant,buyer:buyerAccountant},finalState:'FINAL_FINANCE_STATE.json'};
    retainFinance(join(directory,'FINANCE_RECEIVING.json'),descriptor);
    await step('cold.receiving',async()=>{
      const restored=await receiveDelivery(join(directory,descriptor.rozo.archive),join(directory,'cold-rozo'),{sha256:descriptor.rozo.sha256,python});
      const entry=join(restored.sourceRoot,PRODUCT,'finance-receiving.mjs');
      const response=await financeChild(process.execPath,[entry,'--directory',directory,'--receiver',join(directory,'cold-finance'),'--python',python,...(hostRecovery.identity?['--merchant-config',merchantConfig,'--accounting',accountingAlias]:[])],{onOutput:chunk=>onProgress?.({operationId:plan.operationId,phase:'cold.receiving',output:chunk})});
      recordFinanceProcess(directory,'COLD_RECEIVING_PROCESS',response);
      assert(response.code===0,'FINANCE_RECEIVING_FAILED','The original independent receiver did not complete.',500,{code:response.code,stderr:response.stderr});
      return originalJSON(join(directory,'cold-finance','FINANCE_RECEIVED.json'));
    });
    progress.state='complete';progress.phase='complete';save();
    const result={schema:'stellar-forge.rozo-finance-native-result.v1',operationId:plan.operationId,workspaceId:w.meta().workspaceId,
      planSha256:journal.planHash,steps:Object.keys(progress.steps),accounting:descriptor.accounting,buyer:descriptor.buyer,
      accountant:descriptor.accountant,receiving:progress.steps['cold.receiving'],browser:progress.steps['staff.delivery'],
      directory,completedAt:new Date().toISOString()};
    retainFinance(join(directory,'FINANCE_RESULT.json'),result);const delivered=await packageCompleted(result);onProgress?.(delivered);return delivered;
  }catch(error){if(!existsSync(join(directory,'FINANCE_RESULT.json'))){progress.state='awaiting-original-continuation';progress.error={code:error.code??'FINANCE_NATIVE',message:String(error.message)};save();}throw error;}
  finally{if(server)await server.close();lease.release();}
}
