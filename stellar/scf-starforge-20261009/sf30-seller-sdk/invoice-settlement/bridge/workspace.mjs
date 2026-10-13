// MIT. Bridge control documents live in the original Invoice workspace sources
// and original source.import request journal. This module owns no database.
import {createHash} from 'node:crypto';
import {stableJSON,sourceHash} from '../../settlement-audit/native-http.mjs';
import {BridgeContractError,describeTransfer,describeVirtualAccountActivity,describeWebhookEvent} from './bridge-provider.mjs';
import {parseProviderJSON,verifyBridgeDelivery} from './bridge-webhook.mjs';
import {renderBridgeDesk} from './desk.mjs';

export const BRIDGE_WORKSPACE_SCHEMA='stellar-forge.invoice-settlement.bridge.v1';
const PREFIX='bridge.';
const sha=value=>createHash('sha256').update(value).digest('hex');
const json=value=>Buffer.from(stableJSON(value)+'\n');
const copy=value=>JSON.parse(stableJSON(value));
const need=(ok,code,message,details={})=>{if(!ok)throw new BridgeContractError(code,message,details);};
function text(value,name,max=1024){need(typeof value==='string'&&value.length>0&&value.length<=max&&!/[\u0000-\u001f\u007f]/.test(value),'INVALID_INPUT',name+' must be nonempty text.');return value;}
function uuid(value){need(typeof value==='string'&&/^[a-f0-9]{8}-[a-f0-9]{4}-[1-5][a-f0-9]{3}-[89ab][a-f0-9]{3}-[a-f0-9]{12}$/i.test(value),'REQUEST_ID_REQUIRED','Keep the original UUID request ID.');return value;}
export function bridgeRequestId(value){const h=sha(Buffer.from(value));return h.slice(0,8)+'-'+h.slice(8,12)+'-5'+h.slice(13,16)+'-8'+h.slice(17,20)+'-'+h.slice(20,32);}
function publicError(error){return {code:String(error?.code??'BRIDGE_OPERATION_FAILED'),message:String(error?.message??error),details:copy(error?.details??{})};}
function b64(value){need(typeof value==='string','SOURCE_REQUIRED','Supply original bytes as canonical base64.');const raw=Buffer.from(value,'base64');need(raw.toString('base64')===value,'INVALID_BASE64','Supply complete canonical base64.');return raw;}
function check(signal){if(signal?.aborted)throw signal.reason??new BridgeContractError('INTERRUPTED','The original operation was interrupted.');}

/**
 * workspace is the original openInvoiceWorkspace instance (borrowed, not owned).
 * source is the matching openBridgeSource instance (borrowed).
 * The surrounding operator owns their lifetime. close() stops and drains only
 * operations admitted by this facade; it never closes somebody else's owner.
 */
export function openBridgeWorkspace({workspace,source,signal:ownerSignal,maximumBodyBytes=64*1024*1024}) {
  need(workspace&&typeof workspace.sourceImport==='function'&&typeof workspace.sourceRead==='function'&&typeof workspace.sourceFile==='function',
    'ORIGINAL_WORKSPACE_REQUIRED','Supply the maintained Invoice workspace.');
  need(source&&typeof source.read==='function'&&typeof source.describe==='function'&&typeof source.normalizeRead==='function','ORIGINAL_SOURCE_REQUIRED','Supply the original Bridge source.');
  need(Number.isSafeInteger(maximumBodyBytes)&&maximumBodyBytes>0&&maximumBodyBytes<=256*1024*1024,'INVALID_BOUND','Select a finite complete source bound.');
  const selection=source.describe(),pending=new Set(),life=new AbortController();
  let closing=false,closed=false,closeTask=null;
  const ownerAborted=()=>life.abort(ownerSignal.reason??new BridgeContractError('INTERRUPTED','The original host interrupted Bridge intake.'));
  if(ownerSignal?.aborted)ownerAborted();else ownerSignal?.addEventListener('abort',ownerAborted,{once:true});
  async function owned(work,externalSignal) {
    need(!closing&&!closed,'BRIDGE_WORKSPACE_CLOSED','Reopen the Bridge intake facade.');
    const signal=externalSignal?AbortSignal.any([life.signal,externalSignal]):life.signal;
    check(signal);const task=Promise.resolve().then(()=>work(signal));pending.add(task);
    try{return await task;}finally{pending.delete(task);}
  }
  async function body(sourceId,part='body') {
    let offset=0,expected=null,parts=[];
    while(true){
      const row=await workspace.sourceFile({sourceId,part,offset,length:1024*1024});
      need(row.sourceId===sourceId&&row.part===part&&row.offset===offset,'SOURCE_CHANGED','Original source range changed.');
      const raw=b64(row.base64);
      need(row.bytes===raw.length&&row.file&&Number.isSafeInteger(row.file.bytes)&&row.file.bytes<=maximumBodyBytes,'SOURCE_BOUND','Original source exceeds the selected complete bound.');
      if(expected)need(stableJSON(expected)===stableJSON(row.file),'SOURCE_CHANGED','Original range descriptor changed.');
      else expected=row.file;
      need(offset+raw.length<=expected.bytes,'SOURCE_CHANGED','Original source extent changed.');
      parts.push(raw);offset+=raw.length;
      if(row.eof){need(offset===expected.bytes,'SOURCE_INCOMPLETE','Original source ended early.');break;}
      need(raw.length>0,'SOURCE_STALLED','Original source range did not advance.');
    }
    const raw=Buffer.concat(parts,offset);need(sha(raw)===expected.sha256,'SOURCE_CHANGED','Original complete source hash changed.');return raw;
  }
  async function records() {
    const state=await workspace.describe(),rows=[];
    for(const row of Object.values(state.sources)) {
      if(row.provider!=='document'||!row.kind?.startsWith(PREFIX)||row.sourceScope!==selection.id)continue;
      const full=await workspace.sourceRead({sourceId:row.id}),request=parseProviderJSON(new TextDecoder('utf-8',{fatal:true}).decode(await body(row.id,'request')));
      const bridge=request.bridge;
      need(bridge?.schema===BRIDGE_WORKSPACE_SCHEMA&&bridge.selectionSha256===sourceHash(selection),'SOURCE_CHANGED','Bridge source belongs to another original binding.');
      rows.push({summary:row,source:full.source,meta:bridge});
    }
    return {state,rows};
  }
  async function document(row){return parseProviderJSON(new TextDecoder('utf-8',{fatal:true}).decode(await body(row.summary.id)));}
  async function importSource({requestId,expectedRevision,kind,label,raw,metadata,programmeId,programmeVersion,contentType='application/json'}) {
    uuid(requestId);need(Number.isSafeInteger(expectedRevision)&&expectedRevision>=0,'REVISION_REQUIRED','Select the original workspace revision.');
    need(Buffer.isBuffer(raw)&&raw.length<=maximumBodyBytes,'SOURCE_BOUND','Retain the complete bounded original body.');
    return workspace.sourceImport({requestId,expectedRevision,provider:'document',kind:PREFIX+kind,label,
      bodyBase64:raw.toString('base64'),sourceScope:selection.id,network:selection.network,
      contentType,...(programmeId?{programmeId,programmeVersion}:{}),
      request:{bridge:{schema:BRIDGE_WORKSPACE_SCHEMA,selectionSha256:sourceHash(selection),selection,
        requestId,kind,...copy(metadata),body:{bytes:raw.length,sha256:sha(raw)}}}});
  }
  async function byRequest(requestId,{kind,metadata}={}) {
    const snapshot=await records(),row=snapshot.rows.find(x=>x.meta.requestId===requestId);
    if(row) {
      need(!kind||row.meta.kind===kind,'REQUEST_ID_CONFLICT','The original request names a different Bridge operation.');
      if(metadata)for(const [key,value] of Object.entries(metadata))need(stableJSON(row.meta[key])===stableJSON(value),
        'REQUEST_ID_CONFLICT','The original Bridge request changed.',{field:key});
    }
    return {snapshot,row};
  }
  async function importDocument(args,kind,value,metadata={}) {
    return importSource({...args,kind,raw:json(value),metadata,contentType:'application/json'});
  }
  async function captureState(captureId) {
    const snapshot=await records(),row=snapshot.rows.find(x=>x.summary.id===captureId&&x.meta.kind==='capture');
    need(row,'CAPTURE_NOT_FOUND','Select an original Bridge capture source.');
    const capture=await document(row);
    need(capture.schema===BRIDGE_WORKSPACE_SCHEMA+'.capture'&&stableJSON(capture.selection)===stableJSON(selection),'CAPTURE_CHANGED','Original capture selection changed.');
    const steps=[];
    for(const item of snapshot.rows.filter(x=>x.meta.kind==='capture-step'&&x.meta.captureId===captureId))steps.push({row:item,value:await document(item)});
    steps.sort((a,b)=>a.value.ordinal-b.value.ordinal);
    let previous=null,nextRead=capture.read,status='READY',rows=0,successfulPages=0;
    const seenIds=new Set();
    for(let n=0;n<steps.length;n++) {
      const {row:item,value}=steps[n];
      need(value.schema===BRIDGE_WORKSPACE_SCHEMA+'.capture-step'&&value.ordinal===n&&value.previous===previous&&
        value.captureId===captureId,'CAPTURE_CHAIN_CHANGED','The original capture step chain is discontinuous.');
      need(stableJSON(value.read)===stableJSON(nextRead),'CAPTURE_CHAIN_CHANGED','The capture changed its exact selected page.');
      if(value.status==='RETAINED') {
        need(Array.isArray(value.objectIds)&&new Set(value.objectIds).size===value.objectIds.length,'CAPTURE_CHAIN_CHANGED','A retained page has invalid original IDs.');
        for(const id of value.objectIds){need(!seenIds.has(id),'REPEATED_HISTORY_ID','Original successful pages repeat an ID.');seenIds.add(id);}
        nextRead=value.nextRead;rows+=value.objectIds.length;successfulPages++;status=value.terminal?'COMPLETED':'READY';
      }else {need(value.status==='FAILED','CAPTURE_CHAIN_CHANGED','Unknown capture step status.');status='FAILED';}
      previous=item.summary.id;
    }
    const admissions=[];
    for(const item of snapshot.rows.filter(x=>x.meta.kind==='capture-admission'&&x.meta.captureId===captureId)) {
      const value=await document(item);
      if(!steps.some(step=>step.value.admissionId===item.summary.id))admissions.push({row:item,value});
    }
    need(admissions.length<=1,'CAPTURE_CONFLICT','Multiple original unfinished capture admissions need operator review.');
    const active=admissions[0]??null;
    if(active)need(active.value.ordinal===steps.length&&active.value.previous===previous&&stableJSON(active.value.read)===stableJSON(nextRead),
      'CAPTURE_CHAIN_CHANGED','The original pending admission changed its predecessor.');
    return {workspaceId:snapshot.state.workspaceId,revision:snapshot.state.revision,captureId,capture,
      status:active?'INFLIGHT':status,nextRead,previous,ordinal:steps.length,rows,successfulPages,
      steps:steps.map(x=>({sourceId:x.row.summary.id,...x.value})),active:active?{sourceId:active.row.summary.id,...active.value}:null,
      seenIds:[...seenIds]};
  }
  function captureCreate(args){return owned(async signal=>{
    check(signal);uuid(args.requestId);
    const maxPages=args.maxPages??10000;need(Number.isSafeInteger(maxPages)&&maxPages>0&&maxPages<=100000,'INVALID_BOUND','Select a finite capture page bound.');
    // The original source validates the full read without making a request.
    const read=source.normalizeRead(args.read);
    const value={schema:BRIDGE_WORKSPACE_SCHEMA+'.capture',name:text(args.name,'Capture name'),selection,read,maxPages,
      programmeId:args.programmeId??null,programmeVersion:args.programmeVersion??null,createdBy:text(args.actor,'Recording operator'),
      note:text(args.note,'Capture note',12000)};
    const result=await importDocument({...args,label:value.name},'capture',value,{});
    return {...result,captureId:result.sourceId};
  });}
  function captureDescribe({captureId}){return owned(()=>captureState(captureId));}
  function captureNext(args,{signal:externalSignal}={}){return owned(async signal=>{
    uuid(args.requestId);let state=await captureState(args.captureId);
    const prior=state.steps.find(x=>x.requestId===args.requestId);
    if(prior) {
      const stepRequestId=bridgeRequestId(args.requestId+':step');
      const retained=(await byRequest(stepRequestId,{kind:'capture-step',metadata:{captureId:args.captureId}})).row;
      need(retained&&retained.summary.id===prior.sourceId,'CAPTURE_CHAIN_CHANGED','The original completed step request changed.');
      const step=await document(retained);
      const receipt=await importDocument({requestId:stepRequestId,expectedRevision:args.expectedRevision,
        label:state.capture.name+' retained page',programmeId:state.capture.programmeId,programmeVersion:state.capture.programmeVersion},
        'capture-step',step,{captureId:args.captureId});
      return {...receipt,step,capture:state};
    }
    if(state.active)need(state.active.requestId===args.requestId,'CAPTURE_INFLIGHT','Resume the original pending page request.',{originalArguments:{captureId:args.captureId,requestId:state.active.requestId,expectedRevision:state.revision}});
    else {
      need(state.status!=='COMPLETED','CAPTURE_COMPLETED','This original capture already retained its terminal empty page.');
      need(state.status!=='FAILED'||args.resumeFailure===true,'CAPTURE_REVIEW_REQUIRED','Review the retained failed response, then explicitly resume the same selected page with a new request.');
      need(state.successfulPages<state.capture.maxPages,'PAGE_BOUND_REACHED','The selected complete-source bound is reached; retain the original incomplete capture.');
      check(signal);
      const admitted={schema:BRIDGE_WORKSPACE_SCHEMA+'.capture-admission',captureId:args.captureId,
        requestId:args.requestId,ordinal:state.ordinal,previous:state.previous,read:state.nextRead,
        resumeFailure:args.resumeFailure===true};
      await importDocument({requestId:args.requestId,expectedRevision:args.expectedRevision,
        label:state.capture.name+' page admission',programmeId:state.capture.programmeId,programmeVersion:state.capture.programmeVersion},
        'capture-admission',admitted,{captureId:args.captureId});
      state=await captureState(args.captureId);
    }
    const active=state.active;need(active&&active.requestId===args.requestId,'CAPTURE_CHANGED','Retain the admitted original page request.');
    const responseId=bridgeRequestId(args.requestId+':response'),found=await byRequest(responseId,{kind:'capture-response',metadata:{captureId:args.captureId,admissionId:active.sourceId}});
    let responseSource=found.row,analysis;
    if(!responseSource) {
      check(signal);const response=await source.read(active.read,{signal});
      // Even an interrupted/failed HTTP body is retained before another page can
      // start. Original transport has already drained the actual body owner.
      analysis={read:active.read,request:response.request,response:{...response.response,body:undefined},
        records:response.records,excluded:response.excluded??[],page:response.page??null,
        continuation:response.continuation,error:response.error};
      delete analysis.response.body;
      const revision=(await workspace.describe()).revision;
      const receipt=await importSource({requestId:responseId,expectedRevision:revision,kind:'capture-response',
        label:state.capture.name+' original response',raw:response.response.body,
        metadata:{captureId:args.captureId,admissionId:active.sourceId,analysis},
        programmeId:state.capture.programmeId,programmeVersion:state.capture.programmeVersion});
      responseSource=(await byRequest(responseId,{kind:'capture-response'})).row;
      need(responseSource?.summary.id===receipt.sourceId,'SOURCE_CHANGED','Retain the original response receipt.');
    }
    analysis=responseSource.meta.analysis;
    need(stableJSON(analysis.read)===stableJSON(active.read),'CAPTURE_CHANGED','Retained response belongs to another selected read.');
    await body(responseSource.summary.id); // Full source integrity before cursor commit.
    let error=analysis.error,ids=analysis.page?analysis.records.map(x=>x.id):analysis.records.map(x=>x.id);
    if(analysis.page&&!error) {
      const original=parseProviderJSON(new TextDecoder('utf-8',{fatal:true}).decode(await body(responseSource.summary.id)));
      ids=original.data.map(x=>x.id); // Include unselected rows in the global cursor walk.
    }
    if(!error&&ids.some(id=>state.seenIds.includes(id)))error={code:'REPEATED_HISTORY_ID',message:'The original historical cursor repeated an ID.',details:{ids:ids.filter(id=>state.seenIds.includes(id))}};
    const terminal=!error&&analysis.continuation.done===true;
    const value={schema:BRIDGE_WORKSPACE_SCHEMA+'.capture-step',captureId:args.captureId,requestId:args.requestId,
      admissionId:active.sourceId,ordinal:active.ordinal,previous:active.previous,read:active.read,
      responseSourceId:responseSource.summary.id,responseSha256:responseSource.source.bodyFile.sha256,
      status:error?'FAILED':'RETAINED',error:error??null,objectIds:error?[]:ids,
      selectedRecords:analysis.records.length,excludedRecords:analysis.excluded.length,terminal,
      nextRead:error?active.read:analysis.continuation.next};
    const receipt=await importDocument({requestId:bridgeRequestId(args.requestId+':step'),expectedRevision:(await workspace.describe()).revision,
      label:state.capture.name+' retained page',programmeId:state.capture.programmeId,programmeVersion:state.capture.programmeVersion},
      'capture-step',value,{captureId:args.captureId});
    return {...receipt,step:value,capture:await captureState(args.captureId)};
  },externalSignal);}
  function receiveDelivery(args){return owned(async()=>{
    uuid(args.requestId);const raw=b64(args.rawBodyBase64);
    const verified=verifyBridgeDelivery({rawBody:raw,signatureHeader:args.signatureHeader,publicKeyPem:args.publicKeyPem,
      endpointId:args.endpointId,binding:selection.binding,receivedAtMs:args.receivedAtMs,
      maxAgeMs:args.maxAgeMs??600000,maxFutureSkewMs:args.maxFutureSkewMs??60000,maxBodyBytes:Math.min(maximumBodyBytes,8388608)});
    const verification={...verified};delete verification.rawBody;delete verification.document;delete verification.event;
    const inputSha256=sourceHash({endpointId:args.endpointId,signatureHeader:args.signatureHeader,publicKeyPem:args.publicKeyPem,
      receivedAtMs:args.receivedAtMs,maxAgeMs:args.maxAgeMs??600000,maxFutureSkewMs:args.maxFutureSkewMs??60000,
      source:verified.source,binding:selection.binding});
    const attempt=await importSource({requestId:args.requestId,expectedRevision:args.expectedRevision,
      kind:'webhook-delivery',label:'Bridge signed delivery '+verified.event.eventId,raw,
      metadata:{inputSha256,verification,publicKeyPem:args.publicKeyPem,eventId:verified.event.eventId,developerId:verified.event.developerId},
      programmeId:args.programmeId,programmeVersion:args.programmeVersion});
    const eventRequestId=bridgeRequestId('bridge:event:'+selection.id+':'+verified.event.developerId+':'+verified.event.eventId);
    // A changed body under the same original developer/event key conflicts in
    // the maintained source.import journal. The signed attempt remains retained.
    const event=await importSource({requestId:eventRequestId,expectedRevision:(await workspace.describe()).revision,
      kind:'webhook-event',label:'Bridge event '+verified.event.eventId,raw,
      metadata:{eventId:verified.event.eventId,developerId:verified.event.developerId},
      programmeId:args.programmeId,programmeVersion:args.programmeVersion});
    return {schema:BRIDGE_WORKSPACE_SCHEMA+'.delivery-receipt',status:'DURABLY_RETAINED',acknowledge:true,
      eventId:verified.event.eventId,deliverySourceId:attempt.sourceId,eventSourceId:event.sourceId,
      originalRequestId:args.requestId,eventRequestId,source:verified.source,eventReplayed:event.replayed===true,
      ledgerAction:'NONE',workspaceId:event.workspaceId,revision:event.revision};
  });}
  async function observations(sourceIds) {
    need(Array.isArray(sourceIds)&&sourceIds.length>0&&new Set(sourceIds).size===sourceIds.length,'SOURCE_SELECTION_REQUIRED','Select each full original source once.');
    const snapshot=await records(),result=[];
    for(const sourceId of sourceIds) {
      const row=snapshot.rows.find(x=>x.summary.id===sourceId);need(row,'SOURCE_NOT_FOUND','Select a Bridge source in this original workspace.',{sourceId});
      const raw=await body(sourceId),sourceRef={sourceId,bytes:raw.length,sha256:sha(raw),kind:row.meta.kind,observedAt:row.source.observedAt};
      if(row.meta.kind==='webhook-event') {
        const event=describeWebhookEvent(parseProviderJSON(new TextDecoder('utf-8',{fatal:true}).decode(raw)),selection.binding);
        result.push({source:sourceRef,event:{eventId:event.eventId,eventCreatedAt:event.eventCreatedAt,sequence:event.sequence},observation:event.observation});
      }else if(row.meta.kind==='capture-response') {
        const a=row.meta.analysis;
        if(a.error){result.push({source:sourceRef,error:a.error,observation:null});continue;}
        const document=parseProviderJSON(new TextDecoder('utf-8',{fatal:true}).decode(raw));
        for(const original of (a.read.kind==='transfer'?[document]:document.data)) {
          const observation=a.read.kind==='virtualAccountActivities'?describeVirtualAccountActivity(original):describeTransfer(original);
          if(selection.binding.customerIds.includes(observation.customerId))result.push({source:sourceRef,event:null,observation});
        }
      }else throw new BridgeContractError('SOURCE_KIND_MISMATCH','Select original retained provider response or deduplicated webhook-event sources.',{sourceId,kind:row.meta.kind});
    }
    return result;
  }
  async function previewEdition(args){
    const asOfDate=text(args.asOfDate,'UTC assessment timestamp'),when=Date.parse(asOfDate);
    need(Number.isFinite(when)&&new Date(when).toISOString()===asOfDate,'INVALID_DATE','Use a complete canonical UTC timestamp.');
    const pendingHours=args.pendingHours??48;need(Number.isFinite(pendingHours)&&pendingHours>=0,'INVALID_PENDING_AGE','Use an explicit nonnegative pending-age assessment.');
    const rows=await observations(args.sourceIds),incidents=[];
    const add=(code,severity,row,detail={})=>{
      const evidence={source:row.source,objectId:row.observation?.id??null,kind:row.observation?.kind??null,code,detail};
      incidents.push({id:sourceHash(evidence),code,severity,...evidence});
    };
    const groups=new Map();
    for(const row of rows) {
      if(row.error){add('PROVIDER_READ_FAILED','REVIEW',row,{error:row.error});continue;}
      const o=row.observation,key=o.kind+':'+o.id;
      const list=groups.get(key)??[];list.push(row);groups.set(key,list);
      for(const finding of o.findings)add(finding.code,'REVIEW',row,finding);
      if(o.status==='EXCEPTION')add('PROVIDER_EXCEPTION','REVIEW',row,{state:o.state??o.type,customerId:o.customerId,depositId:o.depositId??null});
      if(o.status==='PENDING') {
        const timestamp=o.updatedAt??o.createdAt,created=timestamp?Date.parse(timestamp):NaN;
        if(!Number.isFinite(created))add('PENDING_AGE_UNKNOWN','REVIEW',row,{state:o.state??o.type});
        else if(when-created>=pendingHours*3600000)add('PENDING_AGE_THRESHOLD','REVIEW',row,{state:o.state??o.type,providerTimestamp:timestamp,pendingHours});
      }
    }
    for(const list of groups.values())if(new Set(list.map(row=>sourceHash(row.observation.original))).size>1) {
      const times=list.map(row=>row.observation.updatedAt??row.event?.eventCreatedAt??row.observation.createdAt??null);
      if(times.some(x=>!x||!Number.isFinite(Date.parse(x)))||new Set(times).size!==times.length)
        add('OBSERVATION_ORDER_REQUIRES_REVIEW','REVIEW',list[0],{sources:list.map(x=>x.source),providerTimes:times});
    }
    const value={schema:BRIDGE_WORKSPACE_SCHEMA+'.edition',name:text(args.name,'Edition name'),asOfDate,pendingHours,
      selection,sourceIds:[...args.sourceIds],observations:rows,incidents,ledgerAction:'NONE',
      note:text(args.note,'Assessment note',20000)};
    return {...value,previewSha256:sourceHash(value)};
  }
  function editionPreview(args){return owned(()=>previewEdition(args));}
  function editionSave(args){return owned(async()=>{
    const preview=await previewEdition(args);
    need(preview.previewSha256===args.expectedPreviewSha256,'PREVIEW_CHANGED','Save the exact reviewed full provider edition.');
    return importDocument({...args,label:preview.name},'edition',preview,{previewSha256:preview.previewSha256});
  });}
  async function readEdition({editionId}){
    const {rows}=await records(),row=rows.find(x=>x.summary.id===editionId&&x.meta.kind==='edition');
    need(row,'EDITION_NOT_FOUND','Select the retained Bridge edition.');const value=await document(row),unsigned={...value};delete unsigned.previewSha256;
    need(sourceHash(unsigned)===value.previewSha256,'EDITION_CHANGED','Original full edition hash changed.');
    return {editionId,source:row.source,document:value};
  }
  function editionRead(args){return owned(()=>readEdition(args));}
  function incidentDecision(args){return owned(async()=>{
    const edition=await readEdition({editionId:args.editionId}),incident=edition.document.incidents.find(x=>x.id===args.incidentId);
    need(incident,'INCIDENT_NOT_FOUND','Select an incident in this exact retained edition.');
    need(['ACKNOWLEDGE','INVESTIGATE','EXTERNAL_RESOLUTION_RECORDED'].includes(args.action),'INVALID_DECISION','Use a supported recorded review decision.');
    const value={schema:BRIDGE_WORKSPACE_SCHEMA+'.incident-decision',editionId:args.editionId,
      editionSha256:edition.source.bodyFile.sha256,incidentId:args.incidentId,incident,
      action:args.action,actor:text(args.actor,'Recording operator'),at:text(args.at,'Decision timestamp'),
      note:text(args.note,'Decision explanation',20000),reference:args.reference??null,ledgerAction:'NONE'};
    need(new Date(value.at).toISOString()===value.at,'INVALID_DATE','Use a complete canonical UTC decision timestamp.');
    if(args.action==='EXTERNAL_RESOLUTION_RECORDED')text(args.reference,'Original external resolution reference',4096);
    return importDocument({...args,label:'Bridge incident '+args.action},'incident-decision',value,{editionId:args.editionId,incidentId:args.incidentId});
  });}
  async function readOverview(){
    const snapshot=await records();
    return {schema:BRIDGE_WORKSPACE_SCHEMA+'.overview',workspaceId:snapshot.state.workspaceId,revision:snapshot.state.revision,
      selection,sources:snapshot.rows.map(row=>({id:row.summary.id,kind:row.meta.kind,label:row.summary.label,
        bytes:row.source.bodyFile.bytes,sha256:row.source.bodyFile.sha256,observedAt:row.source.observedAt,
        requestId:row.meta.requestId,captureId:row.meta.captureId??null,editionId:row.meta.editionId??null})),ledgerAction:'NONE'};
  }
  function overview(){return owned(readOverview);}
  function reportSave(args){return owned(async()=>{
    const prior=await byRequest(uuid(args.requestId),{kind:'report',metadata:{editionId:args.editionId}});
    if(prior.row)return importSource({requestId:args.requestId,expectedRevision:args.expectedRevision,kind:'report',
      label:prior.row.source.label,raw:await body(prior.row.summary.id),metadata:{editionId:args.editionId},
      contentType:'text/html; charset=utf-8'});
    const edition=await readEdition({editionId:args.editionId}),overview=await readOverview();
    need(overview.revision===args.expectedRevision,'REVISION_CONFLICT','Review the current original revision before saving the incident desk.',
      {expectedRevision:args.expectedRevision,actualRevision:overview.revision});
    // sourceImport commits exactly one original revision. Keep the observed
    // snapshot distinct from the revision that will own this saved report.
    const rendered=renderBridgeDesk({overview,edition,commandRevision:overview.revision+1});
    return importSource({requestId:args.requestId,expectedRevision:args.expectedRevision,kind:'report',
      label:edition.document.name+' incident desk',raw:rendered.body,metadata:{editionId:args.editionId},
      contentType:rendered.contentType});
  });}
  function close() {
    if(closed)return Promise.resolve({state:'CLOSED'});if(closeTask)return closeTask;
    closing=true;life.abort(new BridgeContractError('BRIDGE_CLOSING','The original Bridge facade is closing.'));
    closeTask=(async()=>{while(pending.size)await Promise.allSettled([...pending]);ownerSignal?.removeEventListener('abort',ownerAborted);closed=true;return {state:'CLOSED'};})();
    closeTask.catch(()=>{closeTask=null;});return closeTask;
  }
  return {overview,captureCreate,captureDescribe,captureNext,receiveDelivery,editionPreview,editionSave,editionRead,incidentDecision,reportSave,close};
}
