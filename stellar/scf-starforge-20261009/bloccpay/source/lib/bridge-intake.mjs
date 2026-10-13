// MIT. Bridge evidence and incident reviews in the original Bloccpay workspace.
// Provider interpretation is the unchanged, pinned Invoice SDK module.
import {describeTransfer,describeVirtualAccountActivity,describeWebhookEvent,
  BRIDGE_CONTRACT_VERSION} from '../vendor/invoice-bridge-provider.mjs';
import {need,hash,canonical,jsonBytes,clone} from './files.mjs';
import {parseSourceJSON} from './source-json.mjs';

export const BRIDGE_INTAKE_SCHEMA='bloccpay.bridge-intake.v1';
const REVIEW='bloccpay.bridge-intake-review.v1',DECISION='bloccpay.bridge-intake-decision.v1';
const id=value=>{need(typeof value==='string'&&value.length>0&&value.length<1024&&!/[\u0000-\u001f]/.test(value),'BRIDGE_ID_REQUIRED');return value;};
const words=(value,name,max=16000)=>{need(typeof value==='string'&&value.trim()&&value.length<=max,'BRIDGE_TEXT_REQUIRED',{field:name});return value;};
const ids=(values,name,maximum=2000)=>{
  need(Array.isArray(values)&&values.length<=maximum,'BRIDGE_SELECTION_REQUIRED',{field:name});
  const result=values.map(id);need(new Set(result).size===result.length,'BRIDGE_DUPLICATE_SELECTION',{field:name});return result.sort();
};
const sha=value=>hash(Buffer.from(canonical(value)));
const safeError=error=>({code:String(error?.code??'BRIDGE_INTERPRETATION_FAILED'),message:String(error?.message??error)});
function selectedScope(row){return row.sourceScope??row.context?.sourceScope??row.context?.providerScope;}
function normalizeSelection(value) {
  need(value&&typeof value==='object'&&!Array.isArray(value),'BRIDGE_SELECTION_REQUIRED');
  const allowed=['connectionAlias','environment','sourceScope','developerId','customerIds','virtualAccounts','versionIds','sourceIds','webhookIds','captureIds'];
  need(Object.keys(value).every(key=>allowed.includes(key)),'BRIDGE_UNKNOWN_SELECTION');
  const result={connectionAlias:id(value.connectionAlias),environment:value.environment,sourceScope:id(value.sourceScope),
    developerId:id(value.developerId),customerIds:ids(value.customerIds,'customerIds'),virtualAccounts:[],
    versionIds:ids(value.versionIds??[],'versionIds'),sourceIds:ids(value.sourceIds??[],'sourceIds'),
    webhookIds:ids(value.webhookIds??[],'webhookIds'),captureIds:ids(value.captureIds??[],'captureIds')};
  need(['sandbox','production'].includes(result.environment)&&result.customerIds.length,'BRIDGE_BINDING_REQUIRED');
  need(Array.isArray(value.virtualAccounts??[])&&(value.virtualAccounts??[]).length<=2000,'BRIDGE_VIRTUAL_ACCOUNTS_REQUIRED');
  result.virtualAccounts=(value.virtualAccounts??[]).map(row=>{
    const customerId=id(row.customerId),virtualAccountId=id(row.virtualAccountId);
    need(result.customerIds.includes(customerId),'BRIDGE_CUSTOMER_MISMATCH');
    return {customerId,virtualAccountId};
  }).sort((a,b)=>canonical(a).localeCompare(canonical(b)));
  need(new Set(result.virtualAccounts.map(canonical)).size===result.virtualAccounts.length,'BRIDGE_DUPLICATE_SELECTION');
  need(result.sourceIds.length+result.versionIds.length+result.webhookIds.length+result.captureIds.length>0,'BRIDGE_EMPTY_REVIEW');
  return result;
}
function originalCommandArguments(document,fileId) {
  return {fileId,bridgeIntake:{schema:BRIDGE_INTAKE_SCHEMA,kind:document.schema===REVIEW?'review':'decision',
    documentSha256:hash(jsonBytes(document)),selectionSha256:document.selectionSha256??document.review.selectionSha256,
    reviewRequestId:document.review?.requestId??null}};
}
export function createBridgeIntake({workspace}) {
  need(workspace&&['describe','privateList','privateItem','file','fileBytes','retainFile','command','list','item'].every(k=>typeof workspace[k]==='function'),
    'ORIGINAL_BLOCCPAY_WORKSPACE_REQUIRED');
  const tasks=new Set();let closing=false,closed=false,closePromise;
  const track=work=>{
    need(!closing&&!closed,'BRIDGE_INTAKE_CLOSING');
    let task;try{task=Promise.resolve(work());}catch(error){task=Promise.reject(error);}
    tasks.add(task);task.then(()=>tasks.delete(task),()=>tasks.delete(task));return task;
  };
  function requestRow(requestId) {
    try{return workspace.item('requests',requestId);}
    catch(error){if(error.code==='RECORD_NOT_FOUND')return null;throw error;}
  }
  function allRequests() {
    const rows=[];let cursor=null;const seen=new Set();
    do {
      const page=workspace.list({table:'requests',limit:500,...(cursor?{cursor}:{})});
      rows.push(...page.rows);cursor=page.nextCursor;
      if(cursor){need(!seen.has(cursor),'BRIDGE_REQUEST_CURSOR_CYCLE');seen.add(cursor);}
    }while(cursor);
    return rows;
  }
  function identity() {return clone(workspace.describe().workspace);}
  function basis(expectedRevision) {
    const current=identity();need(Number.isSafeInteger(expectedRevision)&&expectedRevision===current.revision,'REVISION_CONFLICT',{actualRevision:current.revision});
    return current;
  }
  async function checkedFile(fileId) {
    const descriptor=workspace.file(fileId,{private:true});
    const body=await workspace.fileBytes(fileId,{private:true});
    need(body.length===descriptor.bytes&&hash(body)===descriptor.sha256,'BRIDGE_ORIGINAL_FILE_CHANGED',{fileId});
    return {descriptor,body};
  }
  function scope(row,selection) {
    need(row.provider==='bridge'||row.kind?.startsWith('bridge-')||row.context?.provider==='bridge','BRIDGE_SOURCE_REQUIRED',{id:row.id});
    need((row.connectionAlias??row.context?.connectionAlias)===selection.connectionAlias,'BRIDGE_CONNECTION_MISMATCH',{id:row.id});
    need(row.environment===selection.environment&&selectedScope(row)===selection.sourceScope,'BRIDGE_SCOPE_MISMATCH',{id:row.id});
  }
  function summary() {
    const current=workspace.describe();
    const sources=workspace.privateList('sources').filter(row=>row.provider==='bridge');
    const versions=workspace.privateList('resourceVersions').filter(row=>row.kind?.startsWith('bridge-'));
    const webhooks=workspace.privateList('webhooks').filter(row=>row.provider==='bridge');
    const captures=workspace.privateList('captures').filter(row=>row.action?.startsWith('bridge.'));
    const requests=allRequests().filter(row=>row.method==='file.retain'&&row.args?.bridgeIntake?.schema===BRIDGE_INTAKE_SCHEMA);
    return {schema:BRIDGE_INTAKE_SCHEMA,workspace:current.workspace,
      connections:current.connections.filter(row=>row.provider==='bridge'),
      sources:sources.map(row=>({id:row.id,connectionAlias:row.connectionAlias,environment:row.environment,
        sourceScope:row.sourceScope,kind:row.kind,status:row.status,bodyComplete:row.bodyComplete,
        bodySha256:row.bodySha256,bytes:row.bytes,projectionError:row.projectionError??null,createdAt:row.createdAt})),
      versions:versions.map(row=>({id:row.id,resourceId:row.resourceId,sourceId:row.sourceId,kind:row.kind,
        connectionAlias:row.connectionAlias??row.context?.connectionAlias,environment:row.environment,
        sourceScope:selectedScope(row),customerId:row.context?.customerId??null,
        virtualAccountId:row.context?.virtualAccountId??null,contentSha256:row.contentSha256,
        state:row.value?.state??row.value?.type??null,eventId:row.eventId,observedAt:row.observedAt})),
      webhooks:webhooks.map(row=>({id:row.id,connectionAlias:row.connectionAlias,subscriptionId:row.subscriptionId,
        verified:row.verified,eventType:row.eventType,status:row.status,rawSha256:row.rawSha256,bytes:row.bytes,
        sourceId:row.sourceId??null,error:row.error??null,receptions:clone(row.receptions??[]),createdAt:row.createdAt})),
      captures:captures.map(row=>({id:row.id,connectionAlias:row.connectionAlias,action:row.action,status:row.status,
        pages:row.pages.length,next:clone(row.next),error:row.error??null})),
      reviews:requests.map(row=>({id:row.id,status:row.status,kind:row.args.bridgeIntake.kind,
        documentSha256:row.args.bridgeIntake.documentSha256,reviewRequestId:row.args.bridgeIntake.reviewRequestId,
        fileId:row.args.fileId,createdAt:row.createdAt,error:row.error??null})),
      ledgerAction:'NONE'};
  }
  async function previewReview({expectedRevision,selection,actor,note,preparedAt}) {
    const before=basis(expectedRevision),normalized=normalizeSelection(selection);
    words(actor,'actor',512);words(note,'note');need(typeof preparedAt==='string'&&Number.isFinite(Date.parse(preparedAt)),'BRIDGE_PREPARED_TIME_REQUIRED');
    const sourceMap=new Map(),versions=[],webhooks=[],captures=[],incidents=[],files=new Map();
    const add=(code,severity,target,detail={})=>{
      const row={code,severity,target,...clone(detail)};row.id=sha(row);incidents.push(row);
    };
    const getSource=sourceId=>{
      if(sourceMap.has(sourceId))return sourceMap.get(sourceId);
      const row=clone(workspace.privateItem('sources',sourceId));scope(row,normalized);sourceMap.set(sourceId,row);return row;
    };
    for(const sourceId of normalized.sourceIds)getSource(sourceId);
    for(const versionId of normalized.versionIds) {
      const row=clone(workspace.privateItem('resourceVersions',versionId));scope(row,normalized);
      getSource(row.sourceId);versions.push(row);
    }
    for(const captureId of normalized.captureIds) {
      const row=clone(workspace.privateItem('captures',captureId));
      need(row.connectionAlias===normalized.connectionAlias&&row.action?.startsWith('bridge.'),'BRIDGE_CAPTURE_SCOPE_MISMATCH');
      need(row.connection?.environment===normalized.environment,'BRIDGE_CAPTURE_ENVIRONMENT_MISMATCH');
      need(row.connection?.sourceScope===normalized.sourceScope,'BRIDGE_CAPTURE_SOURCE_SCOPE_MISMATCH');
      captures.push(row);for(const page of row.pages)getSource(page.sourceId);
      for(const sourceId of row.rejectedSourceIds??[])getSource(sourceId);
      if(row.status!=='COMPLETE')add('CAPTURE_INCOMPLETE','REVIEW',{table:'captures',id:row.id},{status:row.status,next:row.next,error:row.error??null});
    }
    for(const webhookId of normalized.webhookIds) {
      const row=clone(workspace.privateItem('webhooks',webhookId));
      need(row.provider==='bridge'&&row.connectionAlias===normalized.connectionAlias,'BRIDGE_WEBHOOK_SCOPE_MISMATCH');
      const {descriptor,body}=await checkedFile(row.bodyFileId);files.set(descriptor.id,descriptor);
      need(descriptor.sha256===row.rawSha256,'BRIDGE_WEBHOOK_BODY_CHANGED');
      if(row.sourceId)getSource(row.sourceId);
      if(!row.verified)add('WEBHOOK_SIGNATURE_REJECTED','REVIEW',{table:'webhooks',id:row.id},{error:row.error??null});
      else {
        try {
          const parsed=parseSourceJSON(body,{maxBytes:32*1024*1024});
          // The original native verifier owns cryptographic acceptance. This only
          // checks that this review's explicit account scope matches its event.
          const described=describeWebhookEvent(parsed.value,normalized);
          row.observation=described;row.originalNumberTokens=parsed.numberTokens;
        }catch(error){add('WEBHOOK_REVIEW_BINDING','REVIEW',{table:'webhooks',id:row.id},{error:safeError(error)});}
        if(row.status!=='PROJECTED')add('WEBHOOK_NOT_PROJECTED','REVIEW',{table:'webhooks',id:row.id},{status:row.status});
      }
      webhooks.push(row);
    }
    for(const row of [...sourceMap.values()].sort((a,b)=>a.id.localeCompare(b.id))) {
      if(row.responseFileId) {
        const {descriptor}=await checkedFile(row.responseFileId);files.set(descriptor.id,descriptor);
        if(row.bodySha256)need(descriptor.sha256===row.bodySha256,'BRIDGE_SOURCE_BODY_CHANGED',{sourceId:row.id});
      }else add('ORIGINAL_BODY_UNAVAILABLE','REVIEW',{table:'sources',id:row.id});
      if(row.bodyComplete!==true)add('SOURCE_INCOMPLETE','REVIEW',{table:'sources',id:row.id},{status:row.status,error:row.error??null});
      if(row.projectionError)add('SOURCE_PROJECTION_ERROR','REVIEW',{table:'sources',id:row.id},{error:row.projectionError});
      if(row.classification&&row.classification.outcome!=='accepted')add('SOURCE_NOT_ACCEPTED','REVIEW',{table:'sources',id:row.id},{classification:row.classification});
    }
    const observations=[];
    for(const row of versions) {
      let observation=null;
      try {
        if(row.kind==='bridge-transfer')observation=describeTransfer(row.value);
        else if(row.kind==='bridge-virtual-account-event')observation=describeVirtualAccountActivity(row.value);
        if(observation) {
          if(!normalized.customerIds.includes(observation.customerId))add('CUSTOMER_OUTSIDE_REVIEW','REVIEW',{table:'resourceVersions',id:row.id},{customerId:observation.customerId});
          if(observation.kind==='virtual_account.activity'&&!normalized.virtualAccounts.some(x=>x.customerId===observation.customerId&&x.virtualAccountId===observation.virtualAccountId))
            add('VIRTUAL_ACCOUNT_OUTSIDE_REVIEW','REVIEW',{table:'resourceVersions',id:row.id},{customerId:observation.customerId,virtualAccountId:observation.virtualAccountId});
          if(['EXCEPTION','UNRECOGNIZED_STATE','UNRECOGNIZED_ACTIVITY'].includes(observation.status))
            add('PROVIDER_EXCEPTION','REVIEW',{table:'resourceVersions',id:row.id},{status:observation.status,state:observation.state??observation.type});
          if(observation.status==='PENDING')add('PROVIDER_PENDING','INFORMATION',{table:'resourceVersions',id:row.id},{state:observation.state??observation.type});
          for(const finding of observation.findings)add(finding.code,'REVIEW',{table:'resourceVersions',id:row.id},{finding});
        }
      }catch(error){add('RESOURCE_INTERPRETATION_UNAVAILABLE','REVIEW',{table:'resourceVersions',id:row.id},{error:safeError(error)});}
      const resource=workspace.privateList('resources').find(x=>x.id===row.localResourceId);
      if(resource?.conflict)add('ORIGINAL_RESOURCE_CONFLICT','REVIEW',{table:'resourceVersions',id:row.id},{resourceId:resource.id,currentVersionId:resource.currentVersionId});
      observations.push({version:row,observation});
    }
    // All inferred source dependencies are explicit in the frozen normalized selection.
    normalized.sourceIds=[...sourceMap.keys()].sort();
    const current=identity();need(current.id===before.id&&current.revision===before.revision&&current.head===before.head,'REVISION_CONFLICT',{actualRevision:current.revision});
    const document={schema:REVIEW,providerContract:BRIDGE_CONTRACT_VERSION,workspace:{id:before.id,revision:before.revision,head:before.head},
      preparedAt,actor,note,selection:normalized,selectionSha256:sha(normalized),
      sources:[...sourceMap.values()].sort((a,b)=>a.id.localeCompare(b.id)),observations,webhooks,captures,
      files:[...files.values()].sort((a,b)=>a.id.localeCompare(b.id)),incidents,
      ledgerAction:'NONE',creditAuthorization:false};
    need(jsonBytes(document).length<=32*1024*1024,'BRIDGE_REVIEW_TOO_LARGE');
    return {document,documentSha256:hash(jsonBytes(document)),previewSha256:sha(document)};
  }
  async function readStored(requestId) {
    id(requestId);const request=requestRow(requestId);
    need(request?.method==='file.retain'&&request.args?.bridgeIntake?.schema===BRIDGE_INTAKE_SCHEMA,'BRIDGE_REVIEW_REQUEST_REQUIRED');
    const {descriptor,body}=await checkedFile(request.args.fileId),document=parseSourceJSON(body,{maxBytes:32*1024*1024}).value;
    need([REVIEW,DECISION].includes(document.schema)&&hash(body)===request.args.bridgeIntake.documentSha256,'BRIDGE_REVIEW_CHANGED');
    need(canonical(originalCommandArguments(document,descriptor.id))===canonical(request.args),'BRIDGE_REVIEW_COMMAND_CHANGED');
    if(request.status==='COMPLETE')need(request.result?.requestId===request.id&&request.result.result?.file?.id===descriptor.id,'BRIDGE_REVIEW_RESULT_CHANGED');
    return {request,document,file:descriptor,documentSha256:hash(body)};
  }
  async function previewDecision({expectedRevision,reviewRequestId,incidentIds,action,actor,note,evidenceFileIds=[],supersedes=null,preparedAt}) {
    const before=basis(expectedRevision),review=await readStored(reviewRequestId);
    need(review.request.status==='COMPLETE'&&review.document.schema===REVIEW,'BRIDGE_COMPLETE_REVIEW_REQUIRED');
    need(['ACKNOWLEDGE','ESCALATE','RESOLVED_EXTERNALLY','REOPEN'].includes(action),'BRIDGE_DECISION_REQUIRED');
    words(actor,'actor',512);words(note,'note');need(typeof preparedAt==='string'&&Number.isFinite(Date.parse(preparedAt)),'BRIDGE_PREPARED_TIME_REQUIRED');
    incidentIds=ids(incidentIds,'incidentIds');need(incidentIds.length&&incidentIds.every(x=>review.document.incidents.some(row=>row.id===x)),'BRIDGE_INCIDENT_SELECTION_REQUIRED');
    const evidence=[];for(const fileId of ids(evidenceFileIds,'evidenceFileIds',100)){const {descriptor}=await checkedFile(fileId);evidence.push(descriptor);}
    if(action==='RESOLVED_EXTERNALLY')need(evidence.length>0,'BRIDGE_RESOLUTION_EVIDENCE_REQUIRED');
    let previous=null;
    if(supersedes) {
      const prior=await readStored(id(supersedes));
      need(prior.request.status==='COMPLETE'&&prior.document.schema===DECISION&&prior.document.review.requestId===reviewRequestId&&
        canonical(prior.document.incidentIds)===canonical(incidentIds),'BRIDGE_DECISION_SCOPE_MISMATCH');
      const next=allRequests().filter(row=>row.status==='COMPLETE'&&row.args?.bridgeIntake?.kind==='decision');
      for(const row of next){const old=await readStored(row.id);need(old.document.supersedes?.requestId!==supersedes,'BRIDGE_DECISION_ALREADY_SUPERSEDED');}
      previous={requestId:supersedes,documentSha256:prior.documentSha256};
    }
    const after=identity();need(after.id===before.id&&after.revision===before.revision&&after.head===before.head,'REVISION_CONFLICT',{actualRevision:after.revision});
    const document={schema:DECISION,workspace:{id:before.id,revision:before.revision,head:before.head},preparedAt,actor,note,
      review:{requestId:reviewRequestId,documentSha256:review.documentSha256,selectionSha256:review.document.selectionSha256},
      incidentIds,action,evidence,supersedes:previous,ledgerAction:'NONE',creditAuthorization:false};
    return {document,documentSha256:hash(jsonBytes(document)),previewSha256:sha(document)};
  }
  async function save({requestId,expectedRevision,document,expectedPreviewSha256,signal}) {
    id(requestId);need(document&&[REVIEW,DECISION].includes(document.schema),'BRIDGE_DOCUMENT_REQUIRED');
    need(sha(document)===expectedPreviewSha256,'BRIDGE_PREVIEW_CHANGED');
    const bytes=jsonBytes(document),fileId='private-'+hash(bytes),args=originalCommandArguments(document,fileId);
    const prior=requestRow(requestId);
    if(prior) {
      need(prior.method==='file.retain'&&canonical(prior.args)===canonical(args),'REQUEST_ID_CONFLICT');
      await checkedFile(fileId);
      return workspace.command({requestId,expectedRevision,method:'file.retain',args,signal});
    }
    signal?.throwIfAborted();need(document.workspace.id===identity().id&&document.workspace.revision===expectedRevision,'BRIDGE_WORKSPACE_CHANGED');
    const checked=document.schema===REVIEW?
      await previewReview({expectedRevision,selection:document.selection,actor:document.actor,note:document.note,preparedAt:document.preparedAt}):
      await previewDecision({expectedRevision,reviewRequestId:document.review.requestId,incidentIds:document.incidentIds,
        action:document.action,actor:document.actor,note:document.note,evidenceFileIds:document.evidence.map(x=>x.id),
        supersedes:document.supersedes?.requestId??null,preparedAt:document.preparedAt});
    need(checked.previewSha256===expectedPreviewSha256&&canonical(checked.document)===canonical(document),'BRIDGE_PREVIEW_CHANGED');
    signal?.throwIfAborted();
    const retained=await workspace.retainFile(bytes,{filename:document.schema===REVIEW?'bridge-intake-review.json':'bridge-intake-decision.json',
      contentType:'application/json; charset=utf-8',private:true});
    need(retained.id===fileId,'BRIDGE_FILE_IDENTITY_CHANGED');
    return workspace.command({requestId,expectedRevision,method:'file.retain',args,signal});
  }
  async function originalBody({table,id:recordId}) {
    need(['sources','webhooks'].includes(table),'BRIDGE_DOWNLOAD_SELECTION_REQUIRED');
    const row=workspace.privateItem(table,id(recordId));
    need(row.provider==='bridge','BRIDGE_SOURCE_REQUIRED');
    const selected=await checkedFile(table==='sources'?row.responseFileId:row.bodyFileId);
    need(selected.descriptor.sha256===(table==='sources'?row.bodySha256:row.rawSha256),'BRIDGE_ORIGINAL_FILE_CHANGED');
    return selected;
  }
  async function inspectReceiving({requestIds=null}={}) {
    const before=identity(),selected=requestIds===null?allRequests().filter(row=>
      row.status==='COMPLETE'&&row.args?.bridgeIntake?.schema===BRIDGE_INTAKE_SCHEMA).map(row=>row.id):
      ids(requestIds,'requestIds',10000);
    const records=[],files=new Map();
    for(const requestId of selected) {
      const retained=await readStored(requestId),document=retained.document;
      need(retained.request.status==='COMPLETE','BRIDGE_COMPLETE_REVIEW_REQUIRED');
      files.set(retained.file.id,retained.file);
      for(const descriptor of [...(document.files??[]),...(document.evidence??[])]) {
        const actual=await checkedFile(descriptor.id);
        need(actual.descriptor.bytes===descriptor.bytes&&actual.descriptor.sha256===descriptor.sha256,
          'BRIDGE_RECEIVED_EVIDENCE_CHANGED',{fileId:descriptor.id});
        files.set(descriptor.id,actual.descriptor);
      }
      if(document.schema===DECISION) {
        const original=await readStored(document.review.requestId);
        need(original.request.status==='COMPLETE'&&original.documentSha256===document.review.documentSha256&&
          original.document.selectionSha256===document.review.selectionSha256,'BRIDGE_RECEIVED_REVIEW_CHANGED');
        if(document.supersedes) {
          const previous=await readStored(document.supersedes.requestId);
          need(previous.request.status==='COMPLETE'&&previous.documentSha256===document.supersedes.documentSha256,
            'BRIDGE_RECEIVED_DECISION_CHANGED');
        }
      }
      records.push(retained);
    }
    const after=identity();need(before.id===after.id&&before.revision===after.revision&&before.head===after.head,'REVISION_CONFLICT');
    return {schema:'bloccpay.bridge-receiving-inspection.v1',workspace:before,
      records,files:[...files.values()].sort((a,b)=>a.id.localeCompare(b.id)),
      ledgerAction:'NONE',providerRequests:0};
  }
  function close() {
    if(closed)return Promise.resolve({state:'CLOSED'});
    if(closePromise)return closePromise;closing=true;
    closePromise=(async()=>{while(tasks.size)await Promise.allSettled([...tasks]);closed=true;return {state:'CLOSED',borrowedWorkspace:true};})();
    closePromise.catch(()=>{closePromise=null;});return closePromise;
  }
  return {summary:()=>track(summary),previewReview:args=>track(()=>previewReview(args)),previewDecision:args=>track(()=>previewDecision(args)),
    save:args=>track(()=>save(args)),read:requestId=>track(()=>readStored(requestId)),inspect:args=>track(()=>inspectReceiving(args)),originalBody:args=>track(()=>originalBody(args)),close};
}
