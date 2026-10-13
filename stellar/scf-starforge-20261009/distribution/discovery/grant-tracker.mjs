// MIT. Grant tracker intake and review carried by the maintained OperatingPlan model.
import { createOperatingPlan, inspectOperatingPlan, operatingPlanDraft, operatingPlanRevision,
  createOperatingStep, createOperatingFile, operatingFileBytes, saveOperatingPlanRevision,
  receiveOperatingPlan } from './operating-plan.mjs';
import { createOperatingPlanReturn, compareOperatingPlanReturn, decideOperatingPlanReturn,
  applyOperatingPlanReturn } from './operating-plan-return.mjs';
import { parseDelimited, writeDelimited, decodeText } from '../../sf30-seller-sdk/lab-edd/table.mjs';

export const GRANT_FIELDS = Object.freeze([
  ['funder','Funder'],['program','Program or fund'],['requested','Amount requested'],['stage','Stage'],
  ['loiDue','LOI due'],['proposalDue','Proposal due'],['decisionExpected','Decision expected'],
  ['awardStart','Award start'],['reportDue','Report due'],['owner','Owner'],['contact','Contact'],
  ['notes','Notes'],['awarded','Amount awarded'],['currency','Currency']
].map(([id,label])=>Object.freeze({id,label})));
export const GRANT_STAGES = Object.freeze(['Researching','Eligible','LOI submitted','Invited','Proposal submitted','Awarded','Declined']);
export const GRANT_DISPOSITIONS = Object.freeze(['unresolved','candidate','active-award','historical-award','excluded']);
export const GRANT_SOURCE_KINDS = Object.freeze(['tracker','award-terms','award-history','supporting']);
export const GRANT_OBLIGATION_KINDS = Object.freeze(['loi','proposal','decision','report','renewal','other']);
export const GRANT_OBLIGATION_STATES = Object.freeze(['unconfirmed','confirmed','completed','waived']);
export const GRANT_TRACKER_MAX_BYTES = 32 * 1024 * 1024;
const SOURCE='grant-source.', ROW='grant-row.', META='grant-source-metadata', DATA='grant-row-review', TRACKER='grant-tracker';
const KEYS=GRANT_FIELDS.map(f=>f.id), DATES=['loiDue','proposalDue','decisionExpected','awardStart','reportDue'];
const encoder=new TextEncoder(), decoder=new TextDecoder('utf-8',{fatal:true});
const plain=x=>x!==null&&typeof x==='object'&&!Array.isArray(x);
const clone=x=>JSON.parse(JSON.stringify(x));
const canonical=x=>Array.isArray(x)?x.map(canonical):plain(x)?Object.fromEntries(Object.keys(x).sort().map(k=>[k,canonical(x[k])])):x;
const same=(a,b)=>JSON.stringify(canonical(a))===JSON.stringify(canonical(b));
const need=(test,code,message)=>{if(!test)throw Object.assign(new TypeError(message),{code:'GRANT_TRACKER_'+code});};
function only(x,keys,name){need(plain(x)&&Object.keys(x).every(k=>keys.includes(k)),'FIELDS',name+' contains unsupported fields.');}
function text(x,name,max=32000){need(typeof x==='string'&&x.length<=max&&!x.includes('\0'),'TEXT',name+' must be complete text within '+max+' characters.');return x;}
function id(x,name='ID'){need(typeof x==='string'&&/^[a-zA-Z0-9][a-zA-Z0-9._-]{0,47}$/.test(x),'ID',name+' must contain 1–48 letters, numbers, dots, underscores or hyphens.');return x;}
function realDate(x){return typeof x==='string'&&/^\d{4}-\d{2}-\d{2}$/.test(x)&&Number.isFinite(Date.parse(x+'T00:00:00Z'))&&new Date(x+'T00:00:00Z').toISOString().slice(0,10)===x;}
async function sha(bytes){need(bytes instanceof Uint8Array,'BYTES','Keep complete original byte arrays.');return [...new Uint8Array(await globalThis.crypto.subtle.digest('SHA-256',bytes))].map(x=>x.toString(16).padStart(2,'0')).join('');}
const json=x=>JSON.stringify(x,null,2)+'\n';
function limit(plan){need(encoder.encode(JSON.stringify(plan)).length<=GRANT_TRACKER_MAX_BYTES,'SIZE','The complete Operating plan exceeds 32 MiB. Keep this original intake; no rows were imported.');return plan;}
function fileJSON(file){let value;try{value=JSON.parse(decoder.decode(operatingFileBytes(file)));}catch{need(false,'FILE_JSON','The complete carried review is not valid UTF-8 JSON.');}return value;}
const carriedJSON=(fileId,name,value,note='')=>createOperatingFile({id:fileId,name,mediaType:'application/json',bytes:encoder.encode(json(value)),note});
function oneFile(step,fileId){const files=(step.files??[]).filter(f=>f.id===fileId);need(files.length===1,'FILE_MISSING','Keep exactly one '+fileId+' file in '+step.id+'.');return files[0];}
const rowId=(sourceId,number)=>ROW+sourceId+'.'+number;
function mapping(value,headers){
  only(value,KEYS,'Column mapping');need(KEYS.every(k=>Object.hasOwn(value,k)),'MAPPING','Keep every mapped field, using null for an absent column.');
  for(const [k,v] of Object.entries(value))need(v===null||Number.isSafeInteger(v)&&v>=0&&v<headers.length,'MAPPING','Choose a physical column for '+k+' or explicitly leave it unmapped.');
  return clone(value);
}
export function suggestGrantMapping(headers){
  need(Array.isArray(headers)&&headers.every(x=>typeof x==='string'),'HEADERS','Keep the complete ordered source headers.');
  const mapping={},unresolved=[];
  for(const field of GRANT_FIELDS){const matches=headers.flatMap((h,i)=>h.replace(/^\uFEFF/,'')===field.label?[i]:[]);mapping[field.id]=matches.length===1?matches[0]:null;if(matches.length!==1)unresolved.push({field:field.id,matches});}
  return {mapping,unresolved};
}
function emptyRecord(){return {disposition:'unresolved',reason:'',edits:{},relationship:{kind:'unresolved',target:null,reason:''},obligations:[]};}
function record(value){
  only(value,['disposition','reason','edits','relationship','obligations'],'Row review');
  need(GRANT_DISPOSITIONS.includes(value.disposition),'DISPOSITION','Choose an explicit row disposition.');
  text(value.reason,'Row review reason');need(value.disposition==='unresolved'||value.reason.trim(),'REASON','Record a reason for the selected row disposition.');
  only(value.edits,KEYS,'Explicit field edits');
  for(const [key,edit] of Object.entries(value.edits)){only(edit,['value','reason'],'Field edit');text(edit.value,key);text(edit.reason,'Field-change reason');need(edit.reason.trim(),'REASON','Each explicit field change needs its own reason.');}
  only(value.relationship,['kind','target','reason'],'Row relationship');
  const rel=value.relationship;need(['unresolved','distinct','related','duplicate'].includes(rel.kind),'RELATIONSHIP','Choose a reviewed row relationship.');text(rel.reason,'Relationship reason');
  need((['related','duplicate'].includes(rel.kind)?typeof rel.target==='string'&&rel.target.startsWith(ROW):rel.target===null),'RELATIONSHIP','A related or duplicate choice must select an exact physical row; other choices keep target null.');
  need(rel.kind==='unresolved'||rel.reason.trim(),'REASON','Record the reason for the row relationship.');
  need(Array.isArray(value.obligations)&&value.obligations.length<=100,'OBLIGATIONS','Keep at most 100 explicit obligations on one grant row.');
  const seen=new Set();
  for(const item of value.obligations){
    only(item,['id','kind','due','owner','status','evidenceSourceId','locator','reason','recordedResult'],'Obligation');
    id(item.id,'Obligation ID');need(!seen.has(item.id),'DUPLICATE','Obligation IDs must be unique within their grant.');seen.add(item.id);
    need(GRANT_OBLIGATION_KINDS.includes(item.kind)&&GRANT_OBLIGATION_STATES.includes(item.status),'OBLIGATION','Choose a supported obligation kind and recorded state.');
    text(item.due,'Obligation date',10);need(!item.due||realDate(item.due),'DATE','Use a real YYYY-MM-DD obligation date.');
    for(const k of ['owner','locator','reason','recordedResult'])text(item[k],k,k==='owner'?1000:32000);
    need(item.evidenceSourceId===null||typeof item.evidenceSourceId==='string','EVIDENCE','Select a retained evidence source or leave it unconfirmed.');
    if(item.status!=='unconfirmed')need(item.evidenceSourceId&&item.locator.trim()&&item.reason.trim(),'EVIDENCE','Confirmed, completed and waived obligations require retained source, exact locator and a decision reason.');
    if(['confirmed','completed'].includes(item.status))need(item.due&&item.owner.trim(),'OBLIGATION','Confirmed work needs its actual date and operating owner.');
    if(item.status==='completed')need(item.recordedResult.trim(),'RESULT','Completed work needs its actual recorded result.');
  }
  return clone(value);
}
async function sourceFromStep(step,cache){
  const descriptorFile=oneFile(step,META),original=oneFile(step,'original');
  const key=JSON.stringify(canonical({stepId:step.id,descriptorFile,original}));
  if(cache.has(key))return cache.get(key);
  const d=fileJSON(descriptorFile);
  only(d,['schema','id','kind','name','mediaType','bytes','sha256','url','note','format','encoding','headerRow','mapping'],'Source descriptor');
  need(d.schema==='summitflow.grant-source.v1','SOURCE_SCHEMA','Choose a complete original tracker source.');
  id(d.id,'Source ID');need(step.id===SOURCE+d.id,'SOURCE_ID','Source step identity changed.');
  need(GRANT_SOURCE_KINDS.includes(d.kind)&&['csv','tsv','binary'].includes(d.format),'SOURCE_KIND','Select the original source kind and format.');
  text(d.url,'Source URL',8000);need(!d.url||/^https?:\/\/\S+$/.test(d.url),'SOURCE_URL','Retain an original HTTP(S) source URL or leave it empty.');
  text(d.note,'Source note');
  const bytes=operatingFileBytes(original);
  need(d.name===original.name&&d.mediaType===original.mediaType&&d.bytes===bytes.length&&d.sha256===await sha(bytes),'SOURCE_CHANGED','The retained source descriptor does not match the complete original bytes.');
  let records=[],headers=[];
  if(d.format==='binary'){
    need(d.encoding===null&&d.headerRow===null&&d.mapping===null&&d.kind!=='tracker','SOURCE_FORMAT','Binary evidence has no inferred table or tracker mapping.');
  }else{
    need(['utf-8','windows-1252'].includes(d.encoding),'ENCODING','Select the original UTF-8 or Windows-1252 encoding.');
    const originalText=decodeText(bytes,d.encoding);
    records=parseDelimited(originalText.startsWith('\uFEFF')?originalText.slice(1):originalText,d.format==='tsv'?'\t':',');
    need(Number.isSafeInteger(d.headerRow)&&d.headerRow>0&&d.headerRow<=records.length,'HEADER_ROW','Select the physical header record in the complete original table.');
    headers=records[d.headerRow-1].fields;mapping(d.mapping,headers);
  }
  const result={...clone(d),original:clone(original),descriptorFile:clone(descriptorFile),headers,records,rows:records.slice(d.headerRow??records.length)};
  cache.set(key,result);return result;
}
function mapped(source,physical){return Object.fromEntries(KEYS.map(k=>[k,source.mapping[k]===null||source.mapping[k]>=physical.fields.length?null:physical.fields[source.mapping[k]]]));}
function identityRecord(source,physical,value){return {schema:'summitflow.grant-row.v1',sourceId:source.id,sourceSha256:source.sha256,rowNumber:physical.rowNumber,line:physical.line,original:clone(physical.fields),review:record(value)};}
function displayTitle(values,physical){return (values.funder||'Unlabelled source row')+' · '+(values.program||'record '+physical.rowNumber);}
async function snapshot(revision,cache){
  const sources=[],bySource=new Map(),rows=[],byRow=new Map(),byStep=new Map(revision.steps.map(step=>[step.id,step]));
  const marker=byStep.get(TRACKER);
  need(marker&&same(fileJSON(oneFile(marker,'grant-tracker-identity')),{schema:'summitflow.grant-tracker.v1'}),'IDENTITY','Keep the original grant-tracker identity in every saved revision.');
  for(const step of revision.steps.filter(s=>s.id.startsWith(SOURCE))){
    const source=await sourceFromStep(step,cache);need(!bySource.has(source.id),'DUPLICATE','Source IDs must be unique.');
    sources.push(source);bySource.set(source.id,source);
  }
  for(const source of sources)for(const physical of source.rows){
    const rid=rowId(source.id,physical.rowNumber),step=byStep.get(rid);
    need(step,'ROW_MISSING','Every physical source row must remain in the saved plan: '+rid+'.');
    const full=fileJSON(oneFile(step,DATA));only(full,['schema','sourceId','sourceSha256','rowNumber','line','original','review'],'Physical row');
    const reviewed=record(full.review);
    need(same(full,identityRecord(source,physical,reviewed)),'ROW_CHANGED','A row review does not match its exact original physical row.');
    const originalMapped=mapped(source,physical),values={...originalMapped,...Object.fromEntries(Object.entries(reviewed.edits).map(([k,v])=>[k,v.value]))};
    const row={id:rid,sourceId:source.id,rowNumber:physical.rowNumber,line:physical.line,headers:clone(source.headers),rawFields:clone(physical.fields),mapped:originalMapped,values,record:reviewed,step:clone(step),issues:[],candidates:[]};
    rows.push(row);byRow.set(rid,row);
  }
  need(revision.steps.filter(s=>s.id.startsWith(ROW)).length===rows.length,'ROW_EXTRA','The plan contains a grant row without its complete original source.');
  const candidateKey=row=>{const pair=[row.values.funder,row.values.program].map(v=>typeof v==='string'?v.trim().toLocaleLowerCase('en'):'');return pair.every(Boolean)?JSON.stringify(pair):null;};
  const candidateGroups=new Map();
  for(const row of rows){const key=candidateKey(row);if(key!==null){if(!candidateGroups.has(key))candidateGroups.set(key,[]);candidateGroups.get(key).push(row.id);}}
  for(const row of rows){
    const value=row.record,issue=(code,message)=>row.issues.push({code,message});
    if(row.rawFields.length!==row.headers.length)issue('ROW_WIDTH','The physical row has '+row.rawFields.length+' cells for '+row.headers.length+' headers. Review each positional value; the complete original row remains.');
    if(value.disposition==='unresolved')issue('ROW_UNREVIEWED','Choose whether this row is a candidate, active award, historical award or excluded source row.');
    if(value.disposition!=='excluded'){
      if(!row.values.funder?.trim())issue('FUNDER_MISSING','Record the exact funder or retain this row for review.');
      if(row.values.stage&&!GRANT_STAGES.includes(row.values.stage))issue('STAGE_REVIEW','The original stage is outside the published seven-stage vocabulary.');
      for(const key of DATES)if(row.values[key]&&!realDate(row.values[key]))issue('DATE_REVIEW','Review '+key+' without guessing its day/month order.');
      for(const key of ['requested','awarded'])if(row.values[key]&&!/^(?:0|[1-9]\d*)(?:\.\d+)?$/.test(row.values[key]))issue('AMOUNT_REVIEW','Review '+key+' as exact nonnegative decimal text; its original source remains unchanged.');
      if((row.values.requested||row.values.awarded)&&!/^[A-Z]{3}$/.test(row.values.currency||''))issue('CURRENCY_REVIEW','Record the explicit three-letter currency; do not infer it from an amount.');
      if(value.disposition==='active-award'&&!row.values.awarded)issue('AWARD_AMOUNT_MISSING','Retain the requested amount and record the separate actual awarded amount.');
      if(value.disposition==='historical-award'&&value.obligations.some(o=>o.status==='confirmed'))issue('HISTORICAL_OBLIGATION','A historical published award alone does not establish a current reporting obligation.');
    }
    const rel=value.relationship;
    if(rel.target!==null){need(byRow.has(rel.target)&&rel.target!==row.id,'RELATIONSHIP_TARGET','Select a different retained physical row.');if(rel.kind==='duplicate'&&byRow.get(rel.target).record.disposition==='excluded')issue('DUPLICATE_TARGET','The selected primary row is excluded. Review this relationship.');}
    for(const obligation of value.obligations){
      if(obligation.evidenceSourceId!==null)need(bySource.has(obligation.evidenceSourceId),'EVIDENCE_MISSING','An obligation refers to evidence that is not retained.');
      if(obligation.status==='unconfirmed')issue('OBLIGATION_UNCONFIRMED','Obligation '+obligation.id+' remains unconfirmed.');
      if(obligation.status!=='unconfirmed'&&['report','renewal'].includes(obligation.kind)&&bySource.get(obligation.evidenceSourceId)?.kind!=='award-terms')issue('AWARD_TERMS_REQUIRED','Confirm report or renewal '+obligation.id+' from the retained actual award terms, not a published historical award.');
      if(value.disposition!=='active-award'&&['report','renewal'].includes(obligation.kind)&&obligation.status==='confirmed')issue('ACTIVE_AWARD_REQUIRED','A current reporting or renewal obligation needs an explicitly selected active award.');
    }
    if(value.disposition==='active-award'&&row.values.reportDue&&!value.obligations.some(o=>o.kind==='report'&&o.due===row.values.reportDue&&['confirmed','completed','waived'].includes(o.status)))issue('REPORT_CONFIRMATION','The imported report date needs its explicit obligation and retained award-term evidence.');
    row.candidates=(candidateGroups.get(candidateKey(row))||[]).filter(otherId=>otherId!==row.id);
    if(row.candidates.length&&rel.kind==='unresolved'&&value.disposition!=='excluded')issue('RELATIONSHIP_REVIEW','Similar funder/program text is a candidate only. Review the distinct, related or duplicate relationship.');
  }
  for(const row of rows){const visited=new Set([row.id]);let next=row;while(next.record.relationship.kind==='duplicate'){const target=next.record.relationship.target;need(!visited.has(target),'RELATIONSHIP_CYCLE','Duplicate relationships must not form a cycle.');visited.add(target);next=byRow.get(target);}}
  const counts={sources:sources.length,physicalRows:rows.length,obligations:rows.reduce((n,r)=>n+r.record.obligations.length,0),issues:rows.reduce((n,r)=>n+r.issues.length,0),...Object.fromEntries(GRANT_DISPOSITIONS.map(d=>[d,rows.filter(r=>r.record.disposition===d).length]))};
  return {revision:revision.revision,sources,rows,counts,ready:counts.issues===0};
}
export async function inspectGrantTracker(value,{revision}={}){
  const plan=limit(inspectOperatingPlan(value)),cache=new Map(),retained=new Map();
  let chosen=null;
  const selected=revision??plan.revisions.length;operatingPlanRevision(plan,selected);
  for(const rev of plan.revisions){
    const view=await snapshot(rev,cache);
    for(const [sourceId,original] of retained){const next=view.sources.find(s=>s.id===sourceId);need(next&&same(next.original,original.original)&&same(next.descriptorFile,original.descriptorFile),'SOURCE_HISTORY','An original tracker source was removed or changed. Preserve the entire original source and import a distinct reviewed interpretation.');}
    for(const source of view.sources)retained.set(source.id,source);
    if(rev.revision===selected)chosen=view;
  }
  return {...chosen,plan};
}
export function isGrantTracker(value){return Boolean(value?.revisions?.some(revision=>revision?.steps?.some(step=>step?.id===TRACKER)));}
export async function createGrantTracker(fields){
  only(fields,['id','title','customer','owner','purpose','period','receiving','notes','savedAt'],'Tracker details');
  const marker=createOperatingStep({id:TRACKER,title:'Grant tracking procedure',instruction:'Retain the original source files, physical row review and actual obligation evidence in this complete Operating plan.',expectedResult:'A complete editable procedure and original-history return.',files:[carriedJSON('grant-tracker-identity','grant-tracker.json',{schema:'summitflow.grant-tracker.v1'})]});
  return (await inspectGrantTracker(createOperatingPlan({...fields,steps:[marker]}))).plan;
}
export async function previewGrantSource(input){
  need(input?.bytes instanceof Uint8Array,'BYTES','Read the complete original file first.');
  if(input.format==='binary')return {headers:[],records:[],mapping:null,unresolved:[],bytes:input.bytes.length,sha256:await sha(input.bytes)};
  need(['csv','tsv'].includes(input.format),'SOURCE_FORMAT','Choose the original CSV or TSV format.');
  const text=decodeText(input.bytes,input.encoding||'utf-8'),records=parseDelimited(text.startsWith('\uFEFF')?text.slice(1):text,input.format==='tsv'?'\t':',');
  const headerRow=input.headerRow??1;need(Number.isSafeInteger(headerRow)&&headerRow>0&&headerRow<=records.length,'HEADER_ROW','Select an existing physical header record.');
  const headers=records[headerRow-1].fields;
  return {headers,records:records.map(r=>({rowNumber:r.rowNumber,line:r.line,rawFields:r.fields})),...suggestGrantMapping(headers),bytes:input.bytes.length,sha256:await sha(input.bytes)};
}
function request(plan,options){need(options&&options.expectedRevision===plan.revisions.length,'REVISION_CONFLICT','The saved plan advanced. Keep the original draft and select its current revision.');return operatingPlanDraft(plan);}
export async function importGrantSource(value,input,options){
  const view=await inspectGrantTracker(value),plan=view.plan,draft=request(plan,options);
  only(input,['id','kind','name','mediaType','bytes','url','note','format','encoding','headerRow','mapping'],'Source intake');
  id(input.id,'Source ID');need(!view.sources.some(s=>s.id===input.id),'SOURCE_EXISTS','Keep the existing source identity; choose a new ID only for a distinct source or interpretation.');
  const bytes=input.bytes;need(bytes instanceof Uint8Array,'BYTES','Read the complete original file bytes before import.');
  const format=input.format,original=createOperatingFile({id:'original',name:input.name,mediaType:input.mediaType||'application/octet-stream',bytes,note:input.note||''});
  const d={schema:'summitflow.grant-source.v1',id:input.id,kind:input.kind,name:original.name,mediaType:original.mediaType,bytes:bytes.length,sha256:await sha(bytes),url:input.url||'',note:input.note||'',format,encoding:format==='binary'?null:input.encoding||'utf-8',headerRow:format==='binary'?null:input.headerRow??1,mapping:format==='binary'?null:input.mapping};
  const step=createOperatingStep({id:SOURCE+input.id,title:'Original source · '+input.name,instruction:'Keep the complete original bytes and their explicit source interpretation.',inputs:d.url,expectedResult:'Every physical source record remains available for review.',files:[original,carriedJSON(META,'source.json',d)]});
  const source=await sourceFromStep(step,new Map());draft.content.steps.push(step);
  for(const physical of source.rows){const rid=rowId(source.id,physical.rowNumber),mappedValues=mapped(source,physical);
    draft.content.steps.push(createOperatingStep({id:rid,title:displayTitle(mappedValues,physical).slice(0,300),instruction:'Review the original source row, separate request from award, and confirm each obligation against its retained evidence.',inputs:source.name+' · physical record '+physical.rowNumber+' · line '+physical.line,expectedResult:'Explicit grant disposition, reviewed values and source-backed obligations.',owner:'',files:[carriedJSON(DATA,'grant-record.json',identityRecord(source,physical,emptyRecord()))]}));
  }
  const next=limit(saveOperatingPlanRevision(plan,draft,{savedAt:options.savedAt}));return (await inspectGrantTracker(next)).plan;
}
export async function saveGrantRow(value,selectedId,review,options){
  const view=await inspectGrantTracker(value),draft=request(view.plan,options),row=view.rows.find(r=>r.id===selectedId);
  need(row,'ROW_MISSING','Open an existing physical source row.');
  const parsed=record(review),source=view.sources.find(s=>s.id===row.sourceId),physical=source.rows.find(r=>r.rowNumber===row.rowNumber);
  const step=draft.content.steps.find(s=>s.id===selectedId),old=oneFile(step,DATA);
  step.files=step.files.map(f=>f.id===DATA?carriedJSON(DATA,old.name,identityRecord(source,physical,parsed),old.note):f);
  const next=limit(saveOperatingPlanRevision(view.plan,draft,{savedAt:options.savedAt}));return (await inspectGrantTracker(next)).plan;
}
export async function saveGrantPlanDetails(value,details,options){
  const view=await inspectGrantTracker(value),draft=request(view.plan,options);
  only(details,['title','customer','owner','purpose','period','receiving','notes'],'Plan details');Object.assign(draft.content,clone(details));
  return (await inspectGrantTracker(limit(saveOperatingPlanRevision(view.plan,draft,{savedAt:options.savedAt})))).plan;
}
export async function receiveGrantTracker(incoming,existing=null){
  const received=(await inspectGrantTracker(incoming)).plan,current=existing?(await inspectGrantTracker(existing)).plan:null;
  return receiveOperatingPlan(received,current);
}
export async function createGrantReturn(current,incoming,options){
  await inspectGrantTracker(current);await inspectGrantTracker(incoming);return createOperatingPlanReturn(current,incoming,options);
}
export async function compareGrantReturn(review){
  await inspectGrantTracker(review.current);await inspectGrantTracker(review.incoming);
  const comparison=compareOperatingPlanReturn(review),domainIssues=[];
  try{await inspectGrantTracker(saveOperatingPlanRevision(review.current,comparison.draft,{savedAt:review.current.revisions.at(-1).savedAt}));}catch(error){domainIssues.push({code:error.code||'GRANT_REVIEW',message:error.message});}
  return {...comparison,domainIssues,ready:comparison.ready&&domainIssues.length===0};
}
export async function decideGrantReturn(review,key,decision){const result=decideOperatingPlanReturn(review,key,decision);await compareGrantReturn(result);return result;}
export async function applyGrantReturn(review,options={}){
  const preview=await compareGrantReturn(review);need(preview.ready,'RETURN_REVIEW','Complete the original return choices and preserve every retained grant source.');
  const result=applyOperatingPlanReturn(review,options);await inspectGrantTracker(result.plan);return result;
}

const escape=value=>String(value??'').replace(/[&<>"']/g,c=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'})[c]);
const scalar=value=>value===null?'<span class="muted">Unmapped or absent cell</span>':value===''?'<span class="muted">Empty source value</span>':escape(value);
const table=(headers,rows)=>'<div class="table"><table><thead><tr>'+headers.map(h=>'<th>'+escape(h)+'</th>').join('')+'</tr></thead><tbody>'+rows.map(r=>'<tr>'+r.map(c=>'<td>'+c+'</td>').join('')+'</tr>').join('')+'</tbody></table></div>';
function projection(view){
  return {schema:'summitflow.grant-tracker-review.v1',planId:view.plan.id,revision:view.revision,counts:clone(view.counts),ready:view.ready,
    sources:view.sources.map(({original,descriptorFile,records,rows,...source})=>({...clone(source),records:clone(records)})),
    rows:view.rows.map(({step,...row})=>({...clone(row),operatingStep:{id:step.id,title:step.title,owner:step.owner,due:step.due,status:step.status,recordedResult:step.recordedResult}}))};
}
function report(view){
  const selected=operatingPlanRevision(view.plan,view.revision);
  const sources=view.sources.map(source=>'<article><h3>'+escape(source.name)+'</h3><p>'+escape(source.id)+' · '+escape(source.kind)+' · '+source.bytes+' bytes</p>'+
    (source.url?'<p><a href="'+escape(source.url)+'">'+escape(source.url)+'</a></p>':'')+
    '<p class="text">'+escape(source.note)+'</p><p class="hash">SHA-256 '+source.sha256+'</p><p><a download="'+escape(source.original.name)+'" href="data:application/octet-stream;base64,'+source.original.content+'">Download complete original source</a></p>'+
    (source.format==='binary'?'':table(['Position','Original header','Reviewed field'],source.headers.map((h,i)=>[String(i+1),scalar(h),GRANT_FIELDS.filter(f=>source.mapping[f.id]===i).map(f=>escape(f.label)).join(', ')||'<span class="muted">Retained, unmapped</span>'])))+'</article>').join('');
  const rows=view.rows.map(row=>'<article id="'+escape(row.id)+'"><h3>'+escape(row.values.funder||'Unlabelled source row')+' · '+escape(row.values.program||row.id)+'</h3><p>'+escape(row.id)+' · '+escape(row.record.disposition)+' · original line '+row.line+'</p><p class="text">'+escape(row.record.reason)+'</p>'+
    table(['Field','Original mapped value','Reviewed value','Explicit change reason'],GRANT_FIELDS.map(field=>[escape(field.label),scalar(row.mapped[field.id]),scalar(row.values[field.id]),escape(row.record.edits[field.id]?.reason||'')]))+
    '<h4>Complete physical source record</h4>'+table(['Position','Header','Original value'],Array.from({length:Math.max(row.headers.length,row.rawFields.length)},(_,i)=>[String(i+1),i<row.headers.length?scalar(row.headers[i]):'<span class="muted">No header at this position</span>',i<row.rawFields.length?scalar(row.rawFields[i]):'<span class="muted">Cell absent from source row</span>']))+
    '<h4>Reviewed relationship</h4><p>'+escape(row.record.relationship.kind)+(row.record.relationship.target?' · '+escape(row.record.relationship.target):'')+'</p><p class="text">'+escape(row.record.relationship.reason)+'</p>'+
    (row.candidates.length?'<p>Similar funder/program text (not automatically matched): '+row.candidates.map(escape).join(', ')+'</p>':'')+
    '<h4>Obligations</h4>'+(row.record.obligations.length?table(['ID / kind','Actual date','Owner / state','Original evidence','Decision / actual result'],row.record.obligations.map(o=>[escape(o.id+' · '+o.kind),escape(o.due||'Unconfirmed'),escape(o.owner+' · '+o.status),escape((o.evidenceSourceId||'No evidence selected')+'\n'+o.locator),escape(o.reason+'\n'+o.recordedResult)])):'<p>No obligation has been recorded for this physical row.</p>')+
    '<h4>Items requiring review</h4>'+(row.issues.length?'<ul>'+row.issues.map(i=>'<li>'+escape(i.code+': '+i.message)+'</li>').join('')+'</ul>':'<p>No outstanding row review items.</p>')+
    '<p>Operating step status: '+escape(row.step.status)+' · '+escape(row.step.recordedResult)+'</p></article>').join('');
  const full=json(view.plan).replace(/[<>&\u2028\u2029]/g,c=>'\\u'+c.charCodeAt(0).toString(16).padStart(4,'0'));
  return '<!doctype html>\n<html lang="en"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1"><title>'+escape(selected.title)+'</title><style>'+
    'body{font:15px/1.55 Arial,sans-serif;color:#202020;background:#fff;max-width:1200px;margin:auto;padding:2rem}header{border-bottom:2px solid #303030}h1{font-size:1.9rem}h2{margin-top:2rem}h3{font-size:1.2rem}article{border:1px solid #bcbcbc;padding:1rem;margin:1rem 0;break-inside:avoid}table{border-collapse:collapse;width:100%;font-size:.9rem}th,td{border:1px solid #c7c7c7;padding:.5rem;vertical-align:top;white-space:pre-wrap;overflow-wrap:anywhere}th{background:#f1f1f1;text-align:left}.table{overflow:auto}.text{white-space:pre-wrap}.hash{font:12px monospace;overflow-wrap:anywhere}.muted{color:#666666}button,a{color:inherit}button{background:#f3f3f3;border:1px solid #555;padding:.6rem;font:inherit;cursor:pointer}nav{display:flex;gap:1rem;flex-wrap:wrap;margin:1rem 0}@media(max-width:700px){body{padding:1rem}article{padding:.6rem}}@media print{body{max-width:none;padding:0}button{display:none}}'+
    '</style></head><body><header><p>GRANT TRACKER · COMPLETE OPERATING HANDOVER</p><h1>'+escape(selected.title)+'</h1><p>'+escape(selected.customer)+' · Revision '+view.revision+' of '+view.plan.revisions.length+' · '+escape(selected.savedAt)+'</p><p>'+view.counts.physicalRows+' physical records · '+view.counts.obligations+' recorded obligations · '+view.counts.issues+' review items</p></header><nav><a href="#sources">Original sources</a><a href="#rows">Complete grant review</a><button id="download-plan" type="button">Download complete editable plan</button></nav>'+
    '<p class="text">'+escape(selected.purpose)+'</p><p>Requested and awarded amounts remain separate. Published award history does not establish a current reporting obligation. Original dates and values remain visible alongside each explicit review. This document records work; it sends no reminders or messages.</p>'+
    '<p>Owner: '+escape(selected.owner)+' · Period: '+escape(selected.period)+'</p><p class="text">'+escape(selected.receiving)+'</p><section id="sources"><h2>Complete original sources</h2>'+sources+'</section><section id="rows"><h2>Every physical grant record</h2>'+rows+'</section>'+
    '<script id="complete-plan" type="application/json">'+full+'</script><script>document.getElementById("download-plan").addEventListener("click",()=>{const value=JSON.parse(document.getElementById("complete-plan").textContent);const url=URL.createObjectURL(new Blob([JSON.stringify(value,null,2)+"\\n"],{type:"application/json"}));const a=document.createElement("a");a.href=url;a.download="grant-tracker.json";a.click();setTimeout(()=>URL.revokeObjectURL(url),1000);});</script></body></html>\n';
}
export async function renderGrantReport(plan,options={}){return report(await inspectGrantTracker(plan,options));}
const csvValue=value=>{const text=String(value??'');return /^[\s]*[=+@-]/.test(text)||/^[\t\r]/.test(text)?"'"+text:text;};
export async function exportGrantTracker(value,options={}){
  const view=await inspectGrantTracker(value,options),detail=projection(view);
  const headings=['Source ID','Physical row','Disposition',...GRANT_FIELDS.map(f=>f.label),'Disposition reason','Relationship','Related physical row','Relationship reason','Review items'];
  const tracker=[headings,...view.rows.map(r=>[r.sourceId,String(r.rowNumber),r.record.disposition,...KEYS.map(k=>r.values[k]??''),r.record.reason,r.record.relationship.kind,r.record.relationship.target??'',r.record.relationship.reason,r.issues.map(i=>i.code+': '+i.message).join('\n')])];
  const obligations=[['Physical grant row','Obligation ID','Kind','Actual date','Owner','State','Evidence source ID','Evidence locator','Decision reason','Actual recorded result'],
    ...view.rows.flatMap(r=>r.record.obligations.map(o=>[r.id,o.id,o.kind,o.due,o.owner,o.status,o.evidenceSourceId??'',o.locator,o.reason,o.recordedResult]))];
  return {plan:view.plan,view,files:[
    {name:'grant-tracker.json',mediaType:'application/json',content:json(view.plan)},
    {name:'grant-tracker-reviewed.csv',mediaType:'text/csv',content:writeDelimited(tracker.map(r=>r.map(csvValue)))},
    {name:'grant-obligations.csv',mediaType:'text/csv',content:writeDelimited(obligations.map(r=>r.map(csvValue)))},
    {name:'grant-tracker-review.json',mediaType:'application/json',content:json({...detail,csvEncoding:'Spreadsheet-dangerous leading formula text is prefixed with an apostrophe only in reviewed CSV exports. Exact text and null/empty distinctions remain in this JSON and the original files.'})},
    {name:'grant-tracker-report.html',mediaType:'text/html',content:report(view)}
  ]};
}
