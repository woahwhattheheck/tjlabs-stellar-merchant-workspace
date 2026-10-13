// MIT. One immutable review on the already-open original accounting workspace.
import {need,json,sha} from './core.mjs';
import {normalizeCashRealization,projectCashRealization,cashRealizationFiles} from './cash-realization.mjs';
const names=['realization.json','realization.html','invoices.csv','dates.csv','events.csv','receipts.csv','manifest.json'];
/**
 * load/save belong to the existing private receiving case. save must retain the
 * complete JSON value durably before resolving. The original owner supplies its
 * opened ReceivablesClient/controller and remains responsible for its lease.
 * reopen, if supplied, drains/closes that original owner and returns its newly
 * opened client/controller for the SAME workspace; this function starts no host.
 */
export async function receiveCashRealization({receivables,selection,actor,operationId,reviewAttempt='first',load,save,reopen=null}){
 need(typeof load==='function'&&typeof save==='function','CASH_REALIZATION_RECEIVING_FILES','Use the original complete case readers and writers.');
 need(typeof actor==='string'&&actor.trim()&&typeof operationId==='string'&&/^[A-Za-z0-9][A-Za-z0-9._:-]{0,119}$/.test(operationId),
   'CASH_REALIZATION_RECEIVING_ID','Keep the original operator and operation identity.');
 need(typeof reviewAttempt==='string'&&/^[A-Za-z0-9][A-Za-z0-9_-]{0,23}$/.test(reviewAttempt),
   'CASH_REALIZATION_RECEIVING_ATTEMPT','Use an explicit review attempt of at most 24 letters, digits, underscores or hyphens.');
 const request=normalizeCashRealization(selection),prefix='reviews/'+reviewAttempt+'/',source={
   schema:'stellar-forge.merchant-cash-realization-receiving-input.v1',operationId,actor,reviewAttempt,request};
 let owner=await load('original-operation.json');
 const binding={schema:'stellar-forge.merchant-cash-realization-receiving-operation.v1',operationId,actor,
   planId:request.planId,editionId:request.editionId};
 if(owner)need(json(owner)===json(binding),'CASH_REALIZATION_RECEIVING_CHANGED','Continue the same original plan edition and operator.',409);
 else await save('original-operation.json',binding);
 const previous=await load(prefix+'input.json');
 if(previous)need(json(previous)===json(source),'CASH_REALIZATION_RECEIVING_CHANGED','Retain the exact through date and note for this attempt; use a following attempt for a new review.',409);
 else await save(prefix+'input.json',source);
 const reportError=error=>({code:error.code??null,message:String(error.message),status:error.status??null,
   applied:error.applied??null,outcomeUnknown:error.outcomeUnknown??null});
 async function retain(name,work){
   const retained=await load(prefix+name+'.json');if(retained?.state==='COMPLETE')return retained.result;
   try{const result=await work();await save(prefix+name+'.json',{state:'COMPLETE',result});return result;}
   catch(error){await save(prefix+name+'.json',{state:'INCOMPLETE',error:reportError(error)});throw error;}
 }
 const preview=await retain('preview',async()=>{
   const state=await receivables.state();
   return receivables.previewCashRealization({workspaceId:state.workspaceId,...request});
 });
 need(json(preview.request)===json(request),'CASH_REALIZATION_RECEIVING_PREVIEW','The retained preview belongs to another original input.',409);
 const requestId=operationId+'.'+reviewAttempt+'.save';
 let saveRequest=await load(prefix+'save-request.json');
 const expected={workspaceId:preview.workspaceId,...preview.request,reviewSha256:preview.reviewSha256,
   actor,requestId,revision:preview.revision};
 if(saveRequest)need(json(saveRequest)===json(expected),'CASH_REALIZATION_RECEIVING_REQUEST','Preserve the original prepared save request.',409);
 else{saveRequest=expected;await save(prefix+'save-request.json',saveRequest);}
 const saved=await retain('save',()=>receivables.saveCashRealization(saveRequest));
 const replay=await receivables.saveCashRealization(saveRequest);
 need(replay.realization.id===saved.realization.id&&json(replay.realization)===json(saved.realization),
   'CASH_REALIZATION_RECEIVING_REPLAY','The same native request must return its exact immutable review.',409);
 await save(prefix+'save-replay.json',replay);
 const id=saved.realization.id,detail=await receivables.cashRealization(id),row=detail.realization;
 need(json(row)===json(saved.realization),'CASH_REALIZATION_RECEIVING_SOURCE','The original saved report changed.',409);
 need(json(projectCashRealization(row.report.source,row.report.plan,row.request))===json(row.report),
   'CASH_REALIZATION_RECEIVING_SOURCE','The full retained ledger does not reproduce the original report.',409);
 const expectedFiles=new Map(cashRealizationFiles(row).map(file=>[file.name,file])),inventory=[];
 async function fileBytes(client,name){
   const value=await client.cashRealizationFile(id,name);
   return value.bytes?Buffer.from(value.bytes):Buffer.from(await value.arrayBuffer());
 }
 for(const name of names){
   const bytes=await fileBytes(receivables,name),expected=expectedFiles.get(name);
   need(bytes.equals(expected.bytes),'CASH_REALIZATION_RECEIVING_FILE','The original '+name+' differs from the retained complete review.',409);
   const identity={name,bytes:bytes.length,sha256:sha(bytes),type:expected.type};
   await save(prefix+'files/'+name+'.source.json',{...identity,contentBase64:bytes.toString('base64')});inventory.push(identity);
 }
 const before=await receivables.cashPlans(),originalPlan=await receivables.cashPlan(request.planId,{editionId:request.editionId});
 need(json(originalPlan.edition)===json(row.report.plan),'CASH_REALIZATION_RECEIVING_PLAN','The selected original forecast changed.',409);
 let reopened=null;
 if(reopen){
   const next=await reopen({workspaceId:preview.workspaceId,operationId,reviewAttempt});
   need(next&&typeof next.cashRealization==='function','CASH_REALIZATION_RECEIVING_REOPEN','Return the original reopened receivables controller/client.');
   const same=await next.cashRealization(id),samePlan=await next.cashPlan(request.planId,{editionId:request.editionId});
   need(same.workspaceId===preview.workspaceId&&json(same.realization)===json(row)&&json(samePlan.edition)===json(originalPlan.edition),
     'CASH_REALIZATION_RECEIVING_REOPEN','The reopened original workspace must retain the exact source and immutable review.',409);
   const replayAfter=await next.saveCashRealization(saveRequest);
   need(json(replayAfter.realization)===json(row),'CASH_REALIZATION_RECEIVING_REPLAY','The reopened journal returned a different review.',409);
   for(const item of inventory)need(sha(await fileBytes(next,item.name))===item.sha256,
     'CASH_REALIZATION_RECEIVING_FILE','The reopened original '+item.name+' differs.',409);
   reopened={workspaceId:same.workspaceId,revision:same.revision,realization:same.realization,plan:samePlan.edition,replay:replayAfter};
   await save(prefix+'reopened.json',reopened);
 }
 const result={schema:'stellar-forge.merchant-cash-realization-native-receiving.v1',operationId,reviewAttempt,
   state:reopened?'NATIVE_COMPLETE':'NATIVE_COMPLETE_REOPEN_PENDING',browserState:'AVAILABLE_TO_CONTINUE',
   inputSha256:sha(json(source)),requestId,workspaceId:preview.workspaceId,realizationId:id,
   preview,saved,originalPlan,planInventory:before,files:inventory,reopened};
 await save(prefix+'native-result.json',result);return result;
}
