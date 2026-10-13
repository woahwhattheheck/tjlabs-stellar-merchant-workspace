// MIT. Curity evidence applied through the unchanged SF74 case and incident APIs.
import {join} from 'node:path';
import {caseMetadata} from '../case-store.mjs';
import {parseWorkspace} from '../workspace-file.mjs';
import {SHA,ID,UUID,hash,bytes,ensure,fields,text,same,canonical,privateDirectory,optional,readJson,retain,locked,listFolders} from './case-io.mjs';

const SCHEMA='stellar-forge.curity-case-operation.v1';
const KEYS=['merchant','owner','status','followUpOn','nextAction','notes'];
const pin=record=>({id:record.id,revision:record.revision,workspaceSha256:hash(record.workspaceText),
  supportSha256:record.supportText===null?null:hash(record.supportText)});
function changes(before,after){return KEYS.filter(k=>before[k]!==after[k]).map(key=>({key,before:before[key],after:after[key]}));}
function inputId(value){ensure(ID.test(value??''),'OPERATION','Use a lowercase operation ID of at most 64 characters.');return value;}
function snapshot(record){return {...pin(record),workspaceText:record.workspaceText,supportText:record.supportText,metadata:record.metadata};}
function savedInput(plan){return {id:plan.case.id,expectedRevision:plan.case.revision,workspaceText:plan.before.workspaceText,
  supportText:plan.before.supportText,metadata:plan.after};}
function matches(record,plan){return record.workspaceText===plan.before.workspaceText&&record.supportText===plan.before.supportText&&
  canonical(record.metadata)===canonical(plan.after);}
function observedFields(record,rows){
  return rows.map(row=>({...row,current:record.metadata[row.key],
    state:record.metadata[row.key]===row.after?'UNCHANGED_ACCEPTED':record.metadata[row.key]===row.before?'BEFORE_VALUE':'STAFF_CHANGED'}));
}
/**
 * source.reviewedSelection({editionId,reviewId,eventKeys}) must receive the exact
 * immutable source/review selection, including references and dispositions.
 * The provider adapter owns parsing/mapping; this bridge never reinterprets logs.
 */
export async function openCurityCaseBridge({store,directory,source,incidentDesk=null}={}){
  ensure(store&&typeof store.read==='function'&&typeof store.save==='function'&&typeof store.history==='function',
    'CASE_STORE','Open the original SF74 case store.');
  ensure(source&&typeof source.reviewedSelection==='function','SOURCE','Supply the original Curity review workspace.');
  const root=await privateDirectory(directory);
  async function load(id){return readJson(join(root,inputId(id),'PLAN.json'));}
  async function result(id){return optional(join(root,inputId(id),'APPLIED.json'));}
  async function list(){
    const rows=[];
    for(const id of await listFolders(root)){
      const plan=await optional(join(root,id,'PLAN.json'));if(!plan)continue;
      const applied=await optional(join(root,id,'APPLIED.json')),rollback=await optional(join(root,id,'ROLLED_BACK.json'));
      rows.push({id,kind:plan.kind,case:plan.case,actor:plan.actor,createdAt:plan.createdAt,
        source:plan.source?{editionId:plan.source.editionId,reviewId:plan.source.reviewId,sha256:plan.sourceSha256}:null,
        state:rollback?'ROLLED_BACK':applied?'APPLIED':'PREPARED',applied,rollback});
    }
    return {operations:rows};
  }
  async function prepare(input){
    fields(input,['operationId','caseId','expectedRevision','editionId','reviewId','eventKeys','actor','note','metadata','incident'],'case evidence');
    const id=inputId(input.operationId);
    ensure(UUID.test(input.caseId??'')&&SHA.test(input.expectedRevision??''),'CASE','Select the original case and current revision.');
    text(input.actor,200,'operator');text(input.note??'',4000,'review note',{empty:true});
    ensure(Array.isArray(input.eventKeys)&&input.eventKeys.length>0&&input.eventKeys.length<=1000&&
      input.eventKeys.every(x=>typeof x==='string'&&x.length>0&&x.length<=512)&&new Set(input.eventKeys).size===input.eventKeys.length,
      'EVENTS','Select distinct reviewed event identities.');
    fields(input.metadata??{},KEYS.filter(k=>k!=='notes'),'case metadata changes');
    return locked(root,async()=>{
      const folder=await privateDirectory(join(root,id)),old=await optional(join(folder,'PLAN.json'));
      const selectedInput=JSON.parse(JSON.stringify(input)),inputSha256=hash(canonical(selectedInput));
      if(old){ensure(old.inputSha256===inputSha256,'OPERATION_CHANGED','This operation already has another reviewed selection.',409);
        await retain(join(folder,'SOURCE_SELECTION.json'),bytes(old.source));
        if(old.incident)await retain(join(folder,'INCIDENT_BEFORE.json'),old.incident.observation);
        return old;}
      const current=await store.read(input.caseId);
      ensure(current.revision===input.expectedRevision,'CASE_CHANGED','Read the current case before preparing this import.',409);
      await parseWorkspace(current.workspaceText);
      const selection=await source.reviewedSelection({editionId:input.editionId,reviewId:input.reviewId,eventKeys:input.eventKeys});
      ensure(selection&&selection.editionId===input.editionId&&selection.reviewId===input.reviewId,
        'SOURCE_CHANGED','The Curity source returned another review.',409);
      const sourceBytes=bytes(selection),sourceSha256=hash(sourceBytes);
      let incident=null;
      if(input.incident!==undefined&&input.incident!==null){
        fields(input.incident,['sourceId','incidentId','expectedRevision','configurationSha256'],'incident binding');
        ensure(incidentDesk&&typeof incidentDesk.view==='function','INCIDENT_SOURCE','Open the selected original incident source.');
        const actual=await incidentDesk.view(input.incident.sourceId,input.incident.incidentId);
        ensure(actual.incident?.id===input.incident.incidentId&&actual.incident.revision===input.incident.expectedRevision&&
          actual.configHash===input.incident.configurationSha256,'INCIDENT_CHANGED','The selected incident or configuration changed.',409);
        incident={selection:input.incident,observation:actual};
      }
      const block=['[Curity evidence '+id+']','Review: '+selection.reviewId,'Source edition: '+selection.editionId,
        'Selection SHA-256: '+sourceSha256,'Selected events: '+input.eventKeys.length,
        ...(incident?['Original incident: '+incident.selection.sourceId+'/'+incident.selection.incidentId]:[]),
        'Reviewed by: '+input.actor,...(input.note?['Review note: '+input.note]:[])].join('\n');
      const after=caseMetadata({...current.metadata,...input.metadata,
        notes:current.metadata.notes+(current.metadata.notes?'\n\n':'')+block});
      const plan={schema:SCHEMA,kind:'ATTACH_EVIDENCE',id,inputSha256,input:selectedInput,createdAt:new Date().toISOString(),
        actor:input.actor,case:pin(current),before:snapshot(current),after,changes:changes(current.metadata,after),
        source:selection,sourceSha256,incident};
      // The complete original plan freezes timestamps and incident observations
      // before any derived companion can be published.
      await retain(join(folder,'PLAN.json'),plan);
      await retain(join(folder,'SOURCE_SELECTION.json'),sourceBytes);
      if(incident)await retain(join(folder,'INCIDENT_BEFORE.json'),incident.observation);
      return plan;
    });
  }
  async function findCommitted(plan){
    let before=null;
    for(;;){
      const page=await store.history(plan.case.id,{before,limit:100});
      for(const row of page.revisions){
        if(row.previousRevision===plan.case.revision){
          const record=await store.read(plan.case.id,row.revision);
          return matches(record,plan)?record:null;
        }
        if(row.revision===plan.case.revision)return null;
      }
      if(!page.nextBefore)return null;before=page.nextBefore;
    }
  }
  async function finish(folder,plan,record,reconciled){
    const receipt={schema:SCHEMA,kind:plan.kind,id:plan.id,inputSha256:plan.inputSha256,
      sourceSha256:plan.sourceSha256??null,case:pin(record),previousRevision:plan.case.revision,
      changes:plan.changes,actor:plan.actor,reconciled,completedAt:record.updatedAt};
    await retain(join(folder,'APPLIED.json'),receipt);return receipt;
  }
  async function apply({operationId}){
    const id=inputId(operationId);
    return locked(root,async()=>{
      const folder=join(root,id),plan=await load(id),done=await result(id);
      ensure(plan.kind==='ATTACH_EVIDENCE','OPERATION','Select an evidence import.');
      if(done)return {...done,current:await compare({operationId:id})};
      const committed=await findCommitted(plan);
      if(committed)return finish(folder,plan,committed,true);
      const current=await store.read(plan.case.id);
      ensure(current.revision===plan.case.revision,'CASE_CHANGED','Later staff work exists. Prepare a new reviewed import from that current case.',409);
      // Original source bytes were frozen before preparing the case change.
      same(await source.reviewedSelection({editionId:plan.input.editionId,reviewId:plan.input.reviewId,eventKeys:plan.input.eventKeys}),plan.source);
      const outcome=await store.save(savedInput(plan));
      const accepted=await store.read(plan.case.id,outcome.case.revision);
      ensure(matches(accepted,plan),'CASE_RESULT','The native case result differs from the selected field change.',409);
      return finish(folder,plan,accepted,false);
    });
  }
  async function compare({operationId}){
    const plan=await load(operationId),done=await result(operationId),current=await store.read(plan.case.id);
    const rows=observedFields(current,plan.changes);
    return {case:pin(current),accepted:done?.case??null,fields:rows,
      laterRevision:Boolean(done&&current.revision!==done.case.revision),
      conflictingFields:rows.filter(row=>row.state!=='UNCHANGED_ACCEPTED').map(row=>row.key),
      workspaceChanged:hash(current.workspaceText)!==plan.case.workspaceSha256,
      supportChanged:(current.supportText===null?null:hash(current.supportText))!==plan.case.supportSha256};
  }
  async function rollback({operationId,rollbackId,expectedRevision,actor}){
    const id=inputId(operationId),rid=inputId(rollbackId);text(actor,200,'operator');
    ensure(SHA.test(expectedRevision??''),'CASE','Select the current case revision for rollback.');
    return locked(root,async()=>{
      const folder=join(root,id),plan=await load(id),done=await result(id);
      ensure(done,'NOT_APPLIED','Receive the original completed import before rollback.',409);
      const rolled=await optional(join(folder,'ROLLED_BACK.json'));
      if(rolled){same(rolled.selection,{rollbackId:rid,expectedRevision,actor});return {...rolled,current:await compare({operationId:id})};}
      const path=join(folder,'ROLLBACK_PLAN.json'),old=await optional(path);
      let reverse=old;
      if(old)same(old.input,{rollbackId:rid,expectedRevision,actor});
      else{
        const current=await store.read(plan.case.id);
        ensure(current.revision===expectedRevision,'CASE_CHANGED','The target changed after rollback review.',409);
        const restorable=plan.changes.filter(row=>current.metadata[row.key]===row.after);
        const skipped=plan.changes.filter(row=>current.metadata[row.key]!==row.after).map(row=>({
          key:row.key,accepted:row.after,intended:row.before,current:current.metadata[row.key],
          reason:current.metadata[row.key]===row.before?'ALREADY_RESTORED':'STAFF_CHANGED'}));
        const after=caseMetadata({...current.metadata,...Object.fromEntries(restorable.map(x=>[x.key,x.before]))});
        reverse={schema:SCHEMA,kind:'ROLLBACK_FIELDS',id:rid,input:{rollbackId:rid,expectedRevision,actor},
          inputSha256:hash(canonical({rollbackId:rid,expectedRevision,actor})),actor,case:pin(current),
          before:snapshot(current),after,changes:changes(current.metadata,after),skipped,originalOperation:id,preparedAt:new Date().toISOString()};
        await retain(path,reverse);
      }
      let record=reverse.changes.length?await findCommitted(reverse):await store.read(reverse.case.id,reverse.case.revision),reconciled=Boolean(record);
      if(!record){
        const current=await store.read(reverse.case.id);
        ensure(current.revision===reverse.case.revision,'CASE_CHANGED','The target changed after the original rollback was prepared.',409);
        const saved=await store.save(savedInput(reverse));record=await store.read(reverse.case.id,saved.case.revision);
        ensure(matches(record,reverse),'CASE_RESULT','The returned rollback differs from the reviewed native fields.',409);
      }
      const receipt={schema:SCHEMA,kind:'ROLLBACK_FIELDS',operationId:id,selection:reverse.input,
        case:pin(record),previousRevision:reverse.case.revision,fields:reverse.changes.map(x=>x.key),
        restored:reverse.changes.map(row=>({key:row.key,accepted:row.before,restored:row.after})),
        skipped:reverse.skipped??[],unchanged:reverse.changes.length===0,
        originalSourcesRetained:true,incidentAcknowledgmentReverted:false,reconciled,completedAt:reverse.changes.length?record.updatedAt:reverse.preparedAt};
      await retain(join(folder,'ROLLED_BACK.json'),receipt);return receipt;
    });
  }
  async function acknowledge({operationId,by,notes=''}){
    const id=inputId(operationId);text(by,200,'acknowledging operator');text(notes,4000,'acknowledgment notes',{empty:true});
    return locked(root,async()=>{
      const folder=join(root,id),plan=await load(id);
      ensure(!plan.received&&plan.incident&&incidentDesk,'INCIDENT_SOURCE','Select a locally configured original incident binding before acknowledgment.');
      const selected={by,notes},requestPath=join(folder,'ACK_REQUEST.json'),previous=await optional(requestPath);
      if(previous)same(previous.selection,selected);
      const done=await optional(join(folder,'ACKNOWLEDGED.json'));if(done){same(done.selection,selected);return done;}
      const binding=plan.incident.selection;
      let actual=await incidentDesk.view(binding.sourceId,binding.incidentId);
      let request=previous;
      if(!request){
        ensure(actual.incident.revision===binding.expectedRevision&&actual.configHash===binding.configurationSha256,
          'INCIDENT_CHANGED','The incident changed since the selected review.',409);
        request={selection:selected,binding,before:actual};await retain(requestPath,request);
      }
      const ack=actual.incident.acknowledgment;
      let reconciled=false;
      if(actual.incident.revision!==request.before.incident.revision){
        ensure(actual.incident.revision>request.before.incident.revision&&ack?.by===by&&ack?.notes===notes,
          'INCIDENT_CHANGED','The original acknowledgment outcome differs or later incident work exists.',409);
        reconciled=true;
      }else{
        await incidentDesk.acknowledge(binding.sourceId,binding.incidentId,
          {expectedRevision:request.before.incident.revision,by,notes});
        actual=await incidentDesk.view(binding.sourceId,binding.incidentId);
        ensure(actual.incident.acknowledgment?.by===by&&actual.incident.acknowledgment?.notes===notes,
          'INCIDENT_RESULT','The original incident acknowledgment must be reconciled.',409);
      }
      const receipt={schema:SCHEMA,kind:'INCIDENT_ACKNOWLEDGMENT',operationId:id,selection:selected,binding,
        actual,reconciled};
      await retain(join(folder,'ACKNOWLEDGED.json'),receipt);return receipt;
    });
  }

  async function receiveBinding({sourcePlan,sourceApplied,sourceCase,sourceMetadata,sourceHistory,nativeReceipt,packageId}){
    ensure(SHA.test(packageId??'')&&sourcePlan?.schema===SCHEMA&&sourceApplied?.id===sourcePlan.id,
      'RECEIVING','Select the original packaged case operation.');
    ensure(nativeReceipt?.state==='COMPLETE'&&sourceCase?.id===sourceApplied.case.id,
      'RECEIVING','The native receiver returned another source case.',409);
    same(nativeReceipt.sourceCase,sourceCase);
    ensure(sourceHistory?.packageId===packageId&&SHA.test(sourceHistory.manifestSha256??''),
      'RECEIVING','Retain the complete received provider history.');
    const historySha256=hash(bytes(sourceHistory));
    const local=nativeReceipt.case;
    ensure(UUID.test(local?.id??'')&&SHA.test(local?.importedRevision??''),'RECEIVING','The native receiver has no original local case identity.',409);
    const id='received-'+hash(packageId+'\0'+local.id).slice(0,40);
    return locked(root,async()=>{
      const folder=await privateDirectory(join(root,id)),prior=await optional(join(folder,'PLAN.json'));
      const binding={packageId,sourceOperationId:sourcePlan.id,sourceCase,
        acceptedOperationCase:sourceApplied.case,historySha256,
        localCaseId:local.id,importedRevision:local.importedRevision};
      if(prior)same(prior.received,binding);
      const accepted=await store.read(local.id,local.importedRevision);
      same(accepted.metadata,sourceMetadata);
      ensure(hash(accepted.workspaceText)===sourceCase.workspaceSha256&&
        (accepted.supportText===null?null:hash(accepted.supportText))===sourceCase.supportSha256,
        'RECEIVING','The imported native case differs from the original accepted source.',409);
      // The imported first revision is an existing accepted baseline. It is not
      // a fictional local pre-import state. Only original selected metadata
      // beforeimages are offered for a later explicit field rollback.
      const plan={...sourcePlan,id,received:binding,case:pin(accepted),
        before:{...snapshot(accepted),metadata:sourcePlan.before.metadata},
        inputSha256:hash(canonical(binding)),input:{received:binding}};
      const applied={...sourceApplied,id,inputSha256:plan.inputSha256,case:pin(accepted),
        previousRevision:null,received:binding,reconciled:true};
      await retain(join(folder,'RECEIVED_HISTORY.json'),sourceHistory);
      await retain(join(folder,'SOURCE_SELECTION.json'),bytes(sourcePlan.source));
      await retain(join(folder,'ORIGINAL_PLAN.json'),sourcePlan);
      await retain(join(folder,'ORIGINAL_APPLIED.json'),sourceApplied);
      await retain(join(folder,'PLAN.json'),plan);await retain(join(folder,'APPLIED.json'),applied);
      return {operationId:id,case:pin(await store.read(local.id)),reused:Boolean(prior)};
    });
  }
  async function withCaseHistory(caseId,work){
    ensure(UUID.test(caseId??'')&&typeof work==='function','CASE_HISTORY','Select the original case history callback.');
    return locked(root,async()=>{
      const operations=[];
      for(const id of await listFolders(root)){
        const plan=await optional(join(root,id,'PLAN.json'));
        if(!plan||plan.case.id!==caseId)continue;
        await retain(join(root,id,'SOURCE_SELECTION.json'),bytes(plan.source));
        if(plan.incident&&!plan.received)await retain(join(root,id,'INCIDENT_BEFORE.json'),plan.incident.observation);
        const files=[];
        for(const name of ['SOURCE_SELECTION.json','INCIDENT_BEFORE.json','PLAN.json','APPLIED.json','ROLLBACK_PLAN.json',
          'ROLLED_BACK.json','ACK_REQUEST.json','ACKNOWLEDGED.json','ORIGINAL_PLAN.json','ORIGINAL_APPLIED.json','RECEIVED_HISTORY.json']){
          const value=await optional(join(root,id,name));if(value)files.push({name,value});
        }
        operations.push({id,plan,applied:files.find(row=>row.name==='APPLIED.json')?.value??null,files});
      }
      return work({caseId,operations});
    });
  }
  return Object.freeze({directory:root,prepare,apply,compare,rollback,acknowledge,list,read:load,result,receiveBinding,withCaseHistory,
    async originalFiles(id){
      inputId(id);const folder=join(root,id),names=['SOURCE_SELECTION.json','INCIDENT_BEFORE.json','PLAN.json','APPLIED.json',
        'ROLLBACK_PLAN.json','ROLLED_BACK.json','ACK_REQUEST.json','ACKNOWLEDGED.json','ORIGINAL_PLAN.json','ORIGINAL_APPLIED.json','RECEIVED_HISTORY.json'],found=[];
      for(const name of names){const value=await optional(join(folder,name));if(value)found.push({name,value});}
      return found;
    }});
}
