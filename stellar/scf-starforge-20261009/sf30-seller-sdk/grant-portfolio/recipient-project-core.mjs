// MIT. Source-backed applicant project handover over the original programme writer.
// Native and browser callers hash the exact received file; no eligibility or award is inferred.
export const ENGRANT_PROJECT_PLAN_SCHEMA='stellar-forge.engrant-project-import-plan.v1';
export const ENGRANT_SOURCE_LIMIT=8*1024*1024;
const MAX_ACTION=1024*1024;
const UUID=/^[0-9a-f]{8}-[0-9a-f]{4}-4[0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/;
const OPERATION=/^[A-Za-z0-9][A-Za-z0-9._:-]{0,159}$/;
const HASH=/^[0-9a-f]{64}$/;
const plain=v=>v!==null&&typeof v==='object'&&!Array.isArray(v);
const need=(ok,message)=>{if(!ok)throw Object.assign(new Error(message),{code:'GRANT_RECIPIENT_INPUT'});};
const copy=v=>JSON.parse(JSON.stringify(v));
const canonical=v=>Array.isArray(v)?v.map(canonical):plain(v)?
  Object.fromEntries(Object.keys(v).sort().map(k=>[k,canonical(v[k])])):v;
export const sameRecipientValue=(a,b)=>JSON.stringify(canonical(a))===JSON.stringify(canonical(b));
function text(v,label,maximum=240,empty=false){
  need(typeof v==='string'&&v.length<=maximum&&!v.includes('\0')&&(empty||v.trim()),'Supply '+label+' within '+maximum+' characters.');
  return v;
}
function exact(v,keys,label){
  need(plain(v)&&Object.keys(v).every(k=>keys.includes(k)),'Use only the declared '+label+' fields.');
}
function ident(v){need(typeof v==='string'&&UUID.test(v),'Retain a stable version-four programme record UUID.');return v;}
function date(v,label,optional=false){
  if(optional&&(v===null||v===''))return null;
  need(typeof v==='string'&&/^\d{4}-\d{2}-\d{2}$/.test(v),'Use an actual ISO date for '+label+'.');
  const d=new Date(v+'T00:00:00.000Z');
  need(Number.isFinite(d.getTime())&&d.toISOString().slice(0,10)===v,'Use a valid calendar date for '+label+'.');return v;
}
function natural(v,label){need(Number.isSafeInteger(v)&&v>0,'Retain the positive original '+label+' edition.');return v;}
function code(v,label){text(v,label);need(/^[A-Za-z0-9][A-Za-z0-9._:-]{0,239}$/.test(v),'Use letters, numbers, dots, dashes, colons or underscores for '+label+'.');return v;}
export function originalEngrantPlanBytes(value){
  need(value instanceof Uint8Array&&value.byteLength>0&&value.byteLength<=ENGRANT_SOURCE_LIMIT,
    'Select the complete application-plan JSON, from one byte to 8 MiB.');
  return new Uint8Array(value);
}
/** Read the one recorded export. Unknown source facts remain in the original file. */
export function parseEngrantApplicationPlan(value){
  const bytes=originalEngrantPlanBytes(value);let p;
  try{p=JSON.parse(new TextDecoder('utf-8',{fatal:true}).decode(bytes));}
  catch{throw Object.assign(new Error('The complete application-plan file must be UTF-8 JSON.'),{code:'GRANT_RECIPIENT_INPUT'});}
  exact(p,['format','source','organisation','brief','candidate','decision','plan'],'application-plan export');
  need(p.format==='engrant.application-plan.v1','Export a recorded application plan from the research desk.');
  need(plain(p.source)&&plain(p.organisation)&&plain(p.brief)&&plain(p.candidate)&&plain(p.decision)&&plain(p.plan),
    'Retain the complete source, organisation, brief, candidate, decision and recorded plan.');
  text(p.source.source_id,'original source identity',ENGRANT_SOURCE_LIMIT);need(HASH.test(p.source.source_sha256||''),'Retain the original declared source digest.');
  text(p.organisation.lead_id,'original organisation identity',ENGRANT_SOURCE_LIMIT);text(p.organisation.organisation,'original organisation name',ENGRANT_SOURCE_LIMIT);
  need(Array.isArray(p.organisation.records),'Retain all original organisation funding-context records.');
  text(p.candidate.id,'original candidate identity',12000);
  text(p.decision.id,'recorded decision identity',500);natural(p.decision.edition,'decision');
  text(p.decision.reviewer,'recorded reviewer',500);date(p.decision.reviewed_on,'decision date');
  need(p.decision.decision==='Pursue'&&p.candidate.decision==='Pursue','Choose an explicitly recorded Pursue decision. Other decisions do not create project planning.');
  text(p.decision.rationale,'recorded decision rationale',16000);
  need(plain(p.decision.candidate)&&plain(p.decision.brief)&&Array.isArray(p.decision.criteria),
    'Keep the original decision snapshots and explicit criteria.');
  need(sameRecipientValue(p.candidate,p.decision.candidate)&&sameRecipientValue(p.brief,p.decision.brief),
    'The exported candidate and brief must be the editions captured by the recorded decision.');
  text(p.plan.id,'recorded plan identity',500);natural(p.plan.edition,'plan');
  text(p.plan.prepared_by,'plan author',500);date(p.plan.prepared_on,'plan date');
  text(p.plan.note,'recorded plan note',16000);
  need(p.plan.decision_id===p.decision.id,'The recorded plan selects a different original decision.');
  const plan=p.plan.plan;need(plain(plan),'Retain the complete recorded application work plan.');
  for(const k of ['title','objective','owner','currency','requested_amount','deadline_note'])text(plan[k],k,16000,!['title','objective'].includes(k));
  for(const k of ['start','end','deadline'])date(plan[k],k,true);
  need(!plan.start||!plan.end||plan.start<=plan.end,'The original plan end precedes its start.');
  need(Array.isArray(plan.tasks)&&plan.tasks.length<=500,'Keep at most 500 original application tasks.');
  const ids=new Set();
  for(const task of plan.tasks){
    need(plain(task),'Keep each complete original task.');text(task.id,'task identity',500);
    need(!ids.has(task.id),'The original plan repeats a task identity.');ids.add(task.id);
    for(const k of ['title','description','owner','effort_hours','source_url','evidence_url','completion_note'])
      text(task[k],k,16000,true);
    text(task.title,'original task title',16000);
    date(task.due,'task due date',true);date(task.completed_on,'task completion date',true);
    need(['Planned','In progress','Waiting','Completed','Cancelled'].includes(task.status),'Keep the original task status.');
    if(task.status==='Completed')need(task.completed_on&&task.completion_note.trim(),'A completed original task needs its dated completion evidence.');
    else need(!task.completed_on,'Only a completed original task has a completion date.');
  }
  return copy(p);
}
function active(model,collection,id,label){
  const record=model.records[collection].find(r=>r.id===ident(id));
  need(record&&!record.archived,'Select an existing active '+label+'.');return record;
}
/**
 * Prepare one complete original save. IDs, mappings and recipient choices come
 * from the caller; this function allocates no identity and performs no action.
 */
export function prepareRecipientProjectStructure(portfolio,input,sourceSha256){
  need(HASH.test(sourceSha256||''),'Supply the SHA-256 of the complete original received JSON bytes.');
  exact(input,['operationId','bytes','filename','actor','programmeId','partnerId','recipientConfirmed','project','documentId','milestones'],'recipient handover');
  need(plain(portfolio?.definition?.programme)&&Number.isSafeInteger(portfolio.revision)&&portfolio.revision>0,
    'Open the exact existing programme portfolio revision.');
  const model=portfolio.definition.programme,bytes=originalEngrantPlanBytes(input.bytes),original=parseEngrantApplicationPlan(bytes);
  need(model.schema==='stellar-forge.grant-programme.v1'&&plain(model.records),'Use the original programme model.');
  need(typeof input.operationId==='string'&&OPERATION.test(input.operationId),'Retain one original handover operation ID.');
  text(input.actor,'recording actor');need(/^[A-Za-z0-9][A-Za-z0-9._-]{0,199}$/.test(input.filename||''),'Use a safe retained JSON filename.');
  const programme=active(model,'nodes',input.programmeId,'parent programme');
  need(programme.kind==='programme','Select a programme as the new project parent.');
  const partner=active(model,'partners',input.partnerId,'recipient organisation');
  need(input.recipientConfirmed===true,'Explicitly confirm that the selected partner represents the original organisation.');
  exact(input.project,['id','code','title','owner','description','startDate','endDate'],'project');
  const project=copy(input.project),projectId=ident(project.id),documentId=ident(input.documentId);
  code(project.code,'project code');text(project.title,'project title');text(project.owner,'project owner');
  text(project.description,'project description',14000,true);
  project.startDate=date(project.startDate,'project start',true);project.endDate=date(project.endDate,'project end',true);
  need(!project.startDate||!project.endDate||project.startDate<=project.endDate,'The project end precedes its start.');
  need(!model.records.nodes.some(r=>r.id===projectId||r.code.toLowerCase()===project.code.toLowerCase()),
    'Choose a new project identity and code. Existing project editions remain unchanged.');
  need(!model.records.documents.some(r=>r.id===documentId),'Choose a new document identity for this original handover.');
  need(Array.isArray(input.milestones)&&input.milestones.length<=500,'Supply the complete explicit task-to-milestone selection.');
  const used=new Set([projectId,documentId]),tasks=new Set(),selected=[],changes=[];
  need(used.size===2,'Project and source document need distinct identities.');
  for(const m of input.milestones){
    exact(m,['taskId','id','code','title','owner','dueDate','status','completedDate','progress','description'],'milestone');
    const task=original.plan.plan.tasks.find(t=>t.id===m.taskId);
    need(task&&task.due&&!tasks.has(task.id),'Select each original task once, with its explicit due date. Undated work stays in the source document.');
    tasks.add(task.id);const recordId=ident(m.id);need(!used.has(recordId),'Every new handover record needs its distinct retained identity.');used.add(recordId);
    code(m.code,'milestone code');text(m.title,'milestone title');text(m.owner,'milestone owner');text(m.description,'milestone description',14000,true);
    need(!model.records.milestones.some(r=>r.id===recordId||r.code.toLowerCase()===m.code.toLowerCase())&&
      !selected.some(r=>r.code.toLowerCase()===m.code.toLowerCase()),'Choose distinct new milestone identities and codes.');
    need(date(m.dueDate,'milestone due date')===task.due,'Retain the original explicit task due date.');
    need(['planned','in-progress','submitted','complete','cancelled'].includes(m.status),'Select the programme milestone status explicitly.');
    const complete=date(m.completedDate,'milestone completion',true);
    need(typeof m.progress==='string'&&/^(?:100(?:\.0+)?|[0-9]{1,2}(?:\.[0-9]+)?)$/.test(m.progress),
      'Use an explicit exact progress percentage between zero and one hundred.');
    if(m.status==='complete'){
      need(task.status==='Completed'&&complete===task.completed_on&&/^100(?:\.0+)?$/.test(m.progress),
        'A complete milestone must retain the original dated completed task and 100 percent progress.');
    }else need(complete===null,'Only a complete milestone has a completion date.');
    const taskPointer='Complete original task and completion evidence: programme document '+documentId+
      ', plan.plan.tasks['+original.plan.plan.tasks.findIndex(t=>t.id===task.id)+'].';
    let description=[m.description,'Original application task: '+task.id+'; original status: '+task.status,
      task.completion_note?'Original completion note: '+task.completion_note:'',taskPointer].filter(Boolean).join('\n\n');
    if(description.length>16000)description=[m.description,'Original application task: '+task.id+
      '; original status: '+task.status,taskPointer].filter(Boolean).join('\n\n');
    text(description,'complete milestone description',16000,true);
    selected.push(copy(m));
    changes.push({collection:'milestones',id:recordId,expectedRevision:0,fields:{nodeId:projectId,grantId:null,
      code:m.code,title:m.title,owner:m.owner,startDate:null,dueDate:m.dueDate,completedDate:complete,
      status:m.status,progress:m.progress,dependencyIds:[],documentIds:[documentId],description}});
  }
  const source={sha256:sourceSha256,bytes:bytes.byteLength,filename:input.filename,contentType:'application/json'};
  const binding={schema:ENGRANT_PROJECT_PLAN_SCHEMA,operationId:input.operationId,
    original:{sourceId:original.source.source_id,declaredSourceSha256:original.source.source_sha256,
      leadId:original.organisation.lead_id,candidateId:original.candidate.id,
      decisionId:original.decision.id,decisionEdition:original.decision.edition,
      planId:original.plan.id,planEdition:original.plan.edition},
    portfolio:{id:portfolio.id,revision:portfolio.revision,snapshot:portfolio.snapshot},
    programme:{id:programme.id,revision:programme.revision,sha256:programme.sha256},
    recipient:{id:partner.id,revision:partner.revision,sha256:partner.sha256,name:partner.name},
    projectId,documentId,source,selectedTaskCount:selected.length,
    retainedOnlyTaskCount:original.plan.plan.tasks.length-selected.length};
  const description=[project.description,'Recipient planning for '+partner.name+' ('+partner.id+').',
    'Source-backed application plan '+original.plan.id+' / edition '+original.plan.edition+
    '. This project records selected application work; it does not record an award or payment.',
    'Complete original plan and recipient binding: programme document '+documentId+'.'].filter(Boolean).join('\n\n');
  text(description,'complete project description',16000,true);
  let bindingText=JSON.stringify(binding,null,2);
  if(bindingText.length>16000){
    // Long original source identifiers stay complete inside the retained file.
    // The bounded original document metadata points to their exact JSON fields.
    bindingText=JSON.stringify({...binding,original:{sourceDocumentSha256:sourceSha256,
      identityFields:['source.source_id','source.source_sha256','organisation.lead_id','candidate.id',
        'decision.id','decision.edition','plan.id','plan.edition']}},null,2);
  }
  changes.unshift({collection:'nodes',id:projectId,expectedRevision:0,fields:{kind:'project',code:project.code,
    title:project.title,parentId:programme.id,owner:project.owner,description,countries:[],
    startDate:project.startDate,endDate:project.endDate,corporateRegistrationMode:'unrecorded'}},
    {collection:'documents',id:documentId,expectedRevision:0,fields:{nodeId:projectId,grantId:null,
      title:project.title,category:'concept-note',owner:input.actor,status:'current',
      object:source,documentDate:original.plan.prepared_on,
      sourceEdition:original.plan.id+' / '+original.plan.edition,description:'Complete received research decision and selected application plan; original source meaning retained.',
      content:bindingText}});
  text(changes[1].fields.title,'source document title');text(changes[1].fields.sourceEdition,'source plan edition');
  need(changes[1].fields.content.length<=16000,'The recipient binding exceeds the original document content field.');
  const {name,notes,sources,review}=portfolio.definition;
  const action={operationId:input.operationId,action:'portfolio.save',payload:{id:portfolio.id,
    expectedPortfolioRevision:portfolio.revision,name,notes,sources,review,
    programme:{schema:'stellar-forge.grant-programme.v1',expectedProgrammeRevision:model.revision,actor:input.actor,changes}}};
  need(new TextEncoder().encode(JSON.stringify(action)).byteLength<=MAX_ACTION,
    'The complete handover exceeds the original saved action limit. Select fewer dated milestones; the full source file stays retained.');
  const selection={operationId:input.operationId,filename:input.filename,actor:input.actor,programmeId:programme.id,
    partnerId:partner.id,recipientConfirmed:true,project,documentId,milestones:selected};
  return {schema:ENGRANT_PROJECT_PLAN_SCHEMA,portfolio:binding.portfolio,source,binding,selection,
    retainedOnlyTasks:original.plan.plan.tasks.filter(t=>!tasks.has(t.id)).map(t=>({id:t.id,title:t.title,due:t.due,status:t.status})),
    action};
}
/** Rebuild from the exact historical basis; a saved plan never authorizes arbitrary actions. */
export function verifyRecipientProjectStructure(portfolio,saved,bytes,sourceSha256){
  need(plain(saved)&&saved.schema===ENGRANT_PROJECT_PLAN_SCHEMA&&plain(saved.selection),'Open the complete original recipient import plan.');
  const rebuilt=prepareRecipientProjectStructure(portfolio,{...saved.selection,bytes},sourceSha256);
  const retained={...saved};delete retained.actionSha256;
  need(sameRecipientValue(retained,rebuilt),'The saved recipient plan differs from its original source, selected records or complete action.');
  return rebuilt;
}
