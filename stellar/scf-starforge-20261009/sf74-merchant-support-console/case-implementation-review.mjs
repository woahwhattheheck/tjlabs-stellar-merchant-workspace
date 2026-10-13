// MIT. Source-bound recipient review through the original SF74 case writer.
import {createHash} from 'node:crypto';
import {readPrivateFile} from '../sf93-seller-support-bundle/incident-store.mjs';
import {parseWorkspace} from './workspace-file.mjs';
import {newCommissioning,commissioningWorkorder,commissioningOriginalFiles,commissioningFileBytes,
  commissioningReceivingSubject,commissioningReceivingMatches,commissioningSummary,
  applyCommissioningCommand,encodeCommissioningBytes,commissioningError} from './commissioning.mjs';
import {operateCaseCommissioning} from './case-commissioning.mjs';
import {PACKET_SCHEMA,MAX_REVIEW_BYTES,canonical,digest,serialize,validatePacket,validateReturn} from './implementation-review-model.mjs';

const copy=v=>JSON.parse(JSON.stringify(v));
const sha=v=>createHash('sha256').update(v).digest('hex');
const ID=/^[A-Za-z0-9][A-Za-z0-9._:-]{0,159}$/,SHA=/^[a-f0-9]{64}$/;
function ensure(value,message,code='INVALID_IMPLEMENTATION_REVIEW',status=422){
  if(!value)throw commissioningError(code,message,status);
}
function fields(value,keys){ensure(value&&typeof value==='object'&&!Array.isArray(value)&&
  Object.keys(value).every(key=>keys.includes(key)),'Use only the declared review request fields.');}
function identity(record){return {id:record.id,revision:record.revision,workspaceSha256:sha(record.workspaceText),
  supportSha256:record.supportText===null?null:sha(record.supportText)};}
function sortedIds(value,label){ensure(Array.isArray(value)&&value.length<=2000&&value.every(x=>typeof x==='string'&&ID.test(x))&&
  new Set(value).size===value.length,'Use distinct original '+label+'.');return value.slice().sort();}
function stop(signal){if(signal?.aborted)throw commissioningError('IMPLEMENTATION_REVIEW_ABORTED','The review operation was stopped.',409);}
function originalReturn(text){
  ensure(typeof text==='string'&&Buffer.byteLength(text)<=MAX_REVIEW_BYTES&&
    Buffer.from(text).toString('utf8')===text,'Supply the exact original UTF-8 return file (up to 24 MiB).');
  return Buffer.from(text);
}

/** No second persistence engine. All durable changes use the original case,
 * original materials, receiving records and native operation receipt. */
export function createImplementationReview({store,sourceDelivery}={}){
  ensure(store&&typeof store.read==='function'&&typeof store.save==='function','Supply the original case store.');
  let closed=false;const pending=new Set();
  function run(operation){
    ensure(!closed,'This review service is closed.','IMPLEMENTATION_REVIEW_CLOSED',409);
    const promise=Promise.resolve().then(()=>{ensure(!closed,'This review service is closed.','IMPLEMENTATION_REVIEW_CLOSED',409);return operation();});
    pending.add(promise);promise.finally(()=>pending.delete(promise)).catch(()=>{});return promise;
  }
  async function read(caseId,revision=null){
    const record=await store.read(caseId,revision),workspace=await parseWorkspace(record.workspaceText);
    return {record,state:workspace.commissioning??newCommissioning()};
  }
  function packetSource(context,args){
    const {record,state}=context;
    const taskIds=sortedIds(args.taskIds,'tasks'),extraMaterialIds=sortedIds(args.extraMaterialIds??[],'additional materials'),
      embedMaterialIds=sortedIds(args.embedMaterialIds??[],'embedded materials');
    ensure(taskIds.length,'Select at least one original saved task.');
    const taskSet=new Set(taskIds),tasks=taskIds.map(id=>state.tasks.find(t=>t.id===id));
    ensure(tasks.every(Boolean),'A selected task is missing from the saved source.');
    const editionId=args.editionId===undefined?state.activeEditionId:args.editionId;
    ensure(editionId===null||state.editions.some(e=>e.id===editionId),'Select an original workorder edition.');
    if(editionId===null)ensure(tasks.every(t=>t.editionId===null&&t.sourceKey===null),
      'Review without a workorder is limited to original operator-created tasks.');
    const receiving=state.receiving.filter(r=>r.taskIds.some(id=>taskSet.has(id)));
    const selected=new Set(extraMaterialIds);
    for(const material of state.materials)if(material.taskIds.some(id=>taskSet.has(id))&&
      (editionId===null||material.editionId===null||material.editionId===editionId))selected.add(material.id);
    for(const row of receiving)for(const materialId of row.materialIds)selected.add(materialId);
    const inventory=commissioningOriginalFiles(state);
    const materials=[...selected].sort().map(id=>{
      const original=state.materials.find(m=>m.id===id);ensure(original,'An additional original material is missing.');
      const file=state.blobs[original.sha256]??inventory.find(f=>f.sha256===original.sha256&&
        (!original.sourceFile||canonical(f.sourceFile)===canonical(original.sourceFile)));
      ensure(file&&Number.isSafeInteger(file.bytes),'The complete original material length is missing.');
      return {...copy(original),bytes:file.bytes,embedded:embedMaterialIds.includes(id)};
    });
    ensure(embedMaterialIds.every(id=>selected.has(id)),'Embed only material in this original selection.');
    return {schema:PACKET_SCHEMA,reviewId:args.reviewId,createdAt:args.createdAt,recipient:args.recipient??'',
      selection:{taskIds,extraMaterialIds,embedMaterialIds},
      source:{case:identity(record),implementationRevision:state.revision,editionId,plan:copy(state.plan),
        tasks:copy(tasks),materials,receiving:copy(receiving),
        workorder:editionId===null?null:copy(commissioningWorkorder(state,editionId))},files:[]};
  }
  async function prepare(args){
    fields(args,['caseId','revision','reviewId','createdAt','recipient','taskIds','extraMaterialIds','embedMaterialIds','editionId','signal']);
    ensure(SHA.test(args.revision??''),'Pin the original saved case revision.');
    const context=await read(args.caseId,args.revision),packet=packetSource(context,args),done=new Set();
    let total=Buffer.byteLength(serialize(packet));
    for(const id of packet.selection.embedMaterialIds){
      stop(args.signal);const material=packet.source.materials.find(m=>m.id===id);
      if(done.has(material.sha256))continue;done.add(material.sha256);
      ensure(material.bytes<=MAX_REVIEW_BYTES&&total+4*Math.ceil(material.bytes/3)<=MAX_REVIEW_BYTES,
        'Embedded originals exceed 24 MiB. Keep them in the original complete case/source package or select fewer embedded files.');
      let bytes;
      if(context.state.blobs[material.sha256])bytes=commissioningFileBytes(context.state,material.sha256);
      else{
        ensure(sourceDelivery&&material.sourceFile,'Receive the original native source bundle before embedding this material.',
          'ORIGINAL_SOURCE_BUNDLE_REQUIRED',409);
        const file=await sourceDelivery.resolveFile(material.sourceFile);stop(args.signal);
        ensure(file.sha256===material.sha256&&file.bytes===material.bytes,'Original source member changed.','REVIEW_SOURCE_CHANGED',409);
        bytes=await readPrivateFile(file.path,MAX_REVIEW_BYTES);
      }
      ensure(bytes.length===material.bytes&&sha(bytes)===material.sha256,'Original file bytes changed.','REVIEW_SOURCE_CHANGED',409);
      packet.files.push({sha256:material.sha256,bytes:bytes.length,data:Buffer.from(bytes).toString('base64')});
      total+=4*Math.ceil(bytes.length/3);
    }
    packet.files.sort((a,b)=>a.sha256<b.sha256?-1:a.sha256>b.sha256?1:0);
    await validatePacket(packet);stop(args.signal);
    return {packet,packetSha256:await digest(packet)};
  }
  async function parsed(text){const bytes=originalReturn(text);return {value:await validateReturn(text),bytes,returnSha256:sha(bytes)};}
  async function verifySource(value){
    const packet=value.packet,original=await read(packet.source.case.id,packet.source.case.revision);
    const expected=packetSource(original,{...packet.selection,reviewId:packet.reviewId,createdAt:packet.createdAt,
      recipient:packet.recipient,editionId:packet.source.editionId});
    // Embedded data were hashed by validateReturn; compare all metadata against
    // the retained original case, without demanding that a later external file
    // service is still online merely to verify an already embedded original.
    expected.files=copy(packet.files);
    ensure(canonical(expected)===canonical(packet),'Returned definitions or material selection differ from the retained original case.',
      'REVIEW_SOURCE_CHANGED',409);
    return original;
  }
  function observationPayload(value,row,returnMaterialId){
    return {id:'review-observation-'+sha(value.returnId+'\0'+row.id).slice(0,32),
      editionId:value.packet.source.editionId,taskIds:copy(row.taskIds),
      materialIds:[...new Set([...row.materialIds,returnMaterialId])].sort(),
      outcome:row.outcome,kind:row.kind,observedAt:row.observedAt,reference:row.reference,notes:row.notes,
      supersedesId:row.supersedesId};
  }
  function command(args,parsed,current){
    ensure(typeof args.requestId==='string'&&ID.test(args.requestId),'Retain the original request identifier.');
    ensure(typeof args.actor==='string'&&args.actor.trim()&&args.actor.length<=200,'Record the importing operator.');
    ensure(typeof args.recordedAt==='string'&&/^\d{4}-\d\d-\d\dT\d\d:\d\d:\d\d(?:\.\d{1,3})?Z$/.test(args.recordedAt)&&
      Number.isFinite(Date.parse(args.recordedAt))&&new Date(args.recordedAt).toISOString().slice(0,19)===args.recordedAt.slice(0,19),
      'Retain the actual original UTC import time.');
    const {value,bytes,returnSha256}=parsed;
    ensure(args.caseId===value.packet.source.case.id,'Return this review to its original selected case.','REVIEW_CASE_DIFFERENT',409);
    const materialId='review-return-'+sha(value.returnId).slice(0,32),
      taskIds=[...new Set(value.observations.flatMap(row=>row.taskIds))].sort();
    return {type:'record_receiving_batch',requestId:args.requestId,expectedRevision:current.state.revision,
      actor:args.actor,recordedAt:args.recordedAt,payload:{
        material:{id:materialId,name:'implementation-review-'+value.returnId+'.json',mediaType:'application/json',
          data:encodeCommissioningBytes(bytes),kind:'observation',
          description:'Original recipient return '+value.returnId+' by '+value.reviewer+
            '; saved case '+value.packet.source.case.revision+'; review '+value.packet.reviewId,
          taskIds,editionId:value.packet.source.editionId,reference:'urn:sha256:'+returnSha256},
        observations:value.observations.map(row=>({actor:row.actor,payload:observationPayload(value,row,materialId)}))}};
  }
  async function previewValue(args,parsed,current){
    const {value,returnSha256}=parsed;
    ensure(args.caseId===value.packet.source.case.id,'Choose the exact original case for this returned review.','REVIEW_CASE_DIFFERENT',409);
    const original=await verifySource(value),issues=[],observations=[];
    for(const row of value.observations){
      const problems=[],warnings=[];let subject=null,currentSubject=null;
      try{
        if(row.supersedesId){
          const prior=original.state.receiving.find(r=>r.id===row.supersedesId),now=current.state.receiving.find(r=>r.id===row.supersedesId);
          ensure(prior&&now&&canonical(prior)===canonical(now),'Original observation to correct is missing or changed.');
          ensure(!current.state.receiving.some(r=>r.supersedesId===prior.id),'The original observation has already been corrected.');
          subject=copy(prior.subject);
          subject.materials=commissioningReceivingSubject(original.state,prior.editionId,row.taskIds,row.materialIds).materials;
          currentSubject={...copy(prior.subject),materials:commissioningReceivingSubject(current.state,prior.editionId,row.taskIds,row.materialIds).materials};
          if(!commissioningReceivingMatches(current.state,{...prior,materialIds:row.materialIds,subject:currentSubject}))
            warnings.push('This corrects a historical definition; it does not accept the changed current delivery.');
        }else{
          subject=commissioningReceivingSubject(original.state,value.packet.source.editionId,row.taskIds,row.materialIds);
          currentSubject=commissioningReceivingSubject(current.state,value.packet.source.editionId,row.taskIds,row.materialIds);
          if(canonical(subject)!==canonical(currentSubject))problems.push('Task acceptance, dependencies, delivery definition or linked deliverables changed.');
          if(current.state.activeEditionId!==value.packet.source.editionId)
            problems.push('The selected workorder is no longer the active original edition. Prepare a new current review.');
        }
        if(current.state.receiving.some(r=>r.id==='review-observation-'+sha(value.returnId+'\0'+row.id).slice(0,32)))
          problems.push('This returned observation is already retained. Reopen its original request.');
        if(row.taskIds.some(id=>current.state.tasks.find(t=>t.id===id)?.retired))
          warnings.push('A selected task is retired; its observation remains historical.');
      }catch(error){problems.push(error.message);}
      if(problems.length)issues.push({observationId:row.id,messages:problems});
      observations.push({id:row.id,taskIds:copy(row.taskIds),kind:row.kind,outcome:row.outcome,actor:row.actor,
        observedAt:row.observedAt,materialIds:copy(row.materialIds),reference:row.reference,notes:row.notes,
        supersedesId:row.supersedesId,subjectSha256:subject?await digest(subject):null,
        currentSubjectSha256:currentSubject?await digest(currentSubject):null,ready:problems.length===0,warnings});
    }
    const valueOut={schema:'stellar-forge.implementation-review-preview.v1',case:identity(current.record),
      implementationRevision:current.state.revision,sourceCase:copy(value.packet.source.case),
      reviewId:value.packet.reviewId,returnId:value.returnId,reviewer:value.reviewer,returnSha256,
      ready:issues.length===0,issues,observations};
    return {...valueOut,previewSha256:await digest(valueOut)};
  }
  async function preview(args){
    fields(args,['caseId','returned','signal']);stop(args.signal);
    const original=await parsed(args.returned),current=await read(args.caseId);
    const result=await previewValue(args,original,current);stop(args.signal);return result;
  }
  async function status(args){
    fields(args,['caseId','requestId','actor','recordedAt','returned','signal']);stop(args.signal);
    const original=await parsed(args.returned),current=await read(args.caseId),cmd=command(args,original,current),
      receipt=current.state.events.find(r=>r.id===args.requestId);
    if(!receipt){
      const prior=current.state.materials.find(r=>r.id===cmd.payload.material.id);
      ensure(!prior,'This recipient return is already retained under another original request.','REVIEW_ALREADY_RECEIVED',409);
      return {state:'NOT_STARTED',case:identity(current.record),requestId:args.requestId,returnSha256:original.returnSha256};
    }
    const replay=await applyCommissioningCommand(current.state,cmd);ensure(replay.replayed,'The original receiving receipt is missing.');
    return {state:'COMPLETE',case:identity(current.record),revision:replay.revision,requestId:args.requestId,
      returnSha256:original.returnSha256,result:replay.result,replayed:true,summary:commissioningSummary(replay.state)};
  }
  async function apply(args){
    fields(args,['caseId','expectedRevision','requestId','actor','recordedAt','returned','previewSha256','signal']);
    ensure(SHA.test(args.expectedRevision??'')&&SHA.test(args.previewSha256??''),'Retain the exact reviewed case revision and preview hash.');
    stop(args.signal);
    const original=await parsed(args.returned),current=await read(args.caseId),cmd=command(args,original,current);
    if(current.state.events.some(r=>r.id===args.requestId)){
      // Native receipt first: later changes never turn a completed request into
      // a new observation or require its old source service to remain online.
      stop(args.signal);
      const result=await operateCaseCommissioning(store,{id:args.caseId,expectedRevision:args.expectedRevision,command:cmd});
      return {state:'COMPLETE',...result,requestId:args.requestId,returnSha256:original.returnSha256};
    }
    ensure(current.record.revision===args.expectedRevision,'The case changed since review. Keep this attempt and preview the current case.',
      'CASE_CONFLICT',409);
    ensure(!current.state.materials.some(r=>r.id===cmd.payload.material.id),
      'This recipient return is already retained under another original request.','REVIEW_ALREADY_RECEIVED',409);
    const reviewed=await previewValue(args,original,current);
    ensure(reviewed.previewSha256===args.previewSha256,'The selected review changed. Read the current preview.','REVIEW_PREVIEW_CONFLICT',409);
    ensure(reviewed.ready,'The returned review no longer matches the current delivery. Resolve its listed changes first.',
      'REVIEW_SOURCE_CONFLICT',409);
    stop(args.signal);
    const result=await operateCaseCommissioning(store,{id:args.caseId,expectedRevision:args.expectedRevision,command:cmd});
    return {state:'COMPLETE',...result,requestId:args.requestId,returnSha256:original.returnSha256};
  }
  return {prepare:args=>run(()=>prepare(args)),preview:args=>run(()=>preview(args)),
    apply:args=>run(()=>apply(args)),status:args=>run(()=>status(args)),
    async close(){closed=true;await Promise.allSettled([...pending]);}};
}
