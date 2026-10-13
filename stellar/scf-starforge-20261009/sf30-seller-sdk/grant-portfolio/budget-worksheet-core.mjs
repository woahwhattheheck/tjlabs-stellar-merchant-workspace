// MIT. Reviewed spreadsheet returns use the original portfolio draft and writer.
import {parseTable,decodeSource,sha256} from './budget-worksheet-table.mjs';
export {parseTable,decodeSource};
export const WORKSHEET_SCHEMA='stellar-forge.grant-budget-worksheet.v1';
export const REVIEW_SCHEMA='stellar-forge.grant-budget-worksheet-review.v1';
export const SOURCE_SCHEMA='stellar-forge.grant-budget-worksheet-source.v1';
export const FIELDS=Object.freeze(['scenarioId','nodeId','grantId','code','title','direction','category','period','amount','currency','classification','commitmentReference','cashDate','milestoneId','documentIds','sourceRefs','notes']);
export const HEADERS=Object.freeze(['id','revision','action','archive_reason',...FIELDS]);
const LIMIT=2*1024*1024, clone=v=>JSON.parse(JSON.stringify(v)), own=(v,k)=>Object.prototype.hasOwnProperty.call(v,k);
const plain=v=>v!==null&&typeof v==='object'&&!Array.isArray(v), fail=m=>{throw Object.assign(new Error(m),{code:'BUDGET_WORKSHEET_INPUT'});};
const need=(v,m)=>{if(!v)fail(m);}, bytes=s=>new TextEncoder().encode(s).length;
const uuid=v=>typeof v==='string'&&/^[0-9a-f]{8}-[0-9a-f]{4}-4[0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/.test(v);
const hex=v=>typeof v==='string'&&/^[0-9a-f]{64}$/.test(v);
const canonical=v=>JSON.stringify(sort(v));
function sort(v){return Array.isArray(v)?v.map(sort):plain(v)?Object.fromEntries(Object.keys(v).sort().map(k=>[k,sort(v[k])])):v;}
const same=(a,b)=>canonical(a)===canonical(b);
const hash=v=>sha256(canonical(v));
const fields=r=>Object.fromEntries(FIELDS.map(k=>[k,clone(r[k]??(['documentIds','sourceRefs'].includes(k)?[]:['amount','grantId','milestoneId','cashDate'].includes(k)?null:''))]));
const basis=c=>({workspaceId:c.workspaceId,portfolioId:c.portfolioId,revision:c.revision,snapshot:c.snapshot,planningRevision:c.planningRevision,programmeRevision:c.programmeRevision});
const nativeBasis=c=>({portfolioId:c.portfolioId,revision:c.revision,snapshot:c.snapshot,planningRevision:c.planningRevision,programmeRevision:c.programmeRevision});
function context(c){
 need(plain(c)&&uuid(c.portfolioId)&&typeof c.workspaceId==='string'&&c.workspaceId&&Number.isSafeInteger(c.revision)&&c.revision>0&&hex(c.snapshot)&&Number.isSafeInteger(c.planningRevision)&&c.planningRevision>=0&&Number.isSafeInteger(c.programmeRevision)&&c.programmeRevision>0,'Open the original complete saved portfolio and program.');
 need(Array.isArray(c.lines)&&Array.isArray(c.scenarios)&&Array.isArray(c.originalLines)&&Array.isArray(c.originalScenarios)&&plain(c.programme),'Retain the full saved and staged planning registers.');
 need(c.lines.length+c.scenarios.length<=10000,'The original planning register exceeds 10,000 records.');
 for(const rows of [c.lines,c.scenarios,c.originalLines,c.originalScenarios])need(new Set(rows.map(r=>r.id)).size===rows.length&&rows.every(r=>uuid(r.id)),'Retain distinct original planning IDs.');
 if(c.draft){need(!c.draft.operation,'Receive the original pending planning save first.');need(c.draft.basis.portfolioId===c.portfolioId&&c.draft.basis.revision===c.revision&&c.draft.basis.snapshot===c.snapshot&&c.draft.basis.planningRevision===c.planningRevision,'Review the existing planning draft against the current revision before returning a worksheet.');}
 return c;
}
function stamp(value){need(typeof value==='string'&&Number.isFinite(Date.parse(value)),'Retain the actual worksheet preparation time.');return value;}
function csv(rows,separator=','){return '\uFEFF'+rows.map(r=>r.map(v=>'"'+String(v??'').replaceAll('"','""')+'"').join(separator)).join('\r\n')+'\r\n';}
function cell(v){return v===null||v===undefined?'':typeof v==='object'?JSON.stringify(v):String(v);}
function exportedRow(r){return [r.id,String(r.revision),'upsert','',...FIELDS.map(k=>cell(r.fields[k]))];}
function baseRow(r,original){return {id:r.id,revision:original?.revision||0,sha256:original?.sha256||null,fields:fields(r)};}
export async function prepareWorksheet(c,{scenarioId,at=new Date().toISOString(),id=crypto.randomUUID()}={}){
 context(c);need(uuid(id),'Use a stable worksheet ID.');
 const scenario=c.scenarios.find(r=>r.id===scenarioId),original=c.originalScenarios.find(r=>r.id===scenarioId);
 need(scenario&&!scenario.archived&&original&&!original.archived,'Save and select an active scenario before preparing its worksheet.');
 const originals=new Map(c.originalLines.map(r=>[r.id,r]));
 const lines=c.lines.filter(r=>r.scenarioId===scenarioId&&!r.archived).map(r=>baseRow(r,originals.get(r.id)));
 need(lines.length<=1999,'Select a scenario with at most 1,999 active lines; each complete source also retains its scenario document link.');
 const w={schema:WORKSHEET_SCHEMA,id,createdAt:stamp(at),basis:basis(c),scenario:{id:scenarioId,revision:original.revision,sha256:original.sha256,fields:clone(scenario)},lines};
 w.csv={filename:'budget-worksheet-'+id+'.csv',text:csv([HEADERS,...lines.map(exportedRow)]),delimiter:','};
 w.csv.sha256=await sha256(w.csv.text);w.csv.bytes=bytes(w.csv.text);need(w.csv.bytes<=LIMIT,'The complete worksheet exceeds 2 MiB.');
 return {...w,sha256:await hash(w)};
}
export async function receiveWorksheet(value){
 const w=clone(value);need(plain(w)&&w.schema===WORKSHEET_SCHEMA&&uuid(w.id)&&plain(w.basis)&&uuid(w.basis.portfolioId)&&typeof w.basis.workspaceId==='string'&&hex(w.basis.snapshot)&&plain(w.scenario)&&uuid(w.scenario.id)&&Array.isArray(w.lines)&&w.lines.length<=1999,'Select one complete original worksheet JSON.');
 const expected=w.sha256;delete w.sha256;need(hex(expected)&&await hash(w)===expected,'The original worksheet JSON differs from its complete retained identity.');w.sha256=expected;
 stamp(w.createdAt);need(Number.isSafeInteger(w.basis.revision)&&w.basis.revision>0&&Number.isSafeInteger(w.basis.planningRevision)&&w.basis.planningRevision>=0&&Number.isSafeInteger(w.basis.programmeRevision)&&w.basis.programmeRevision>0&&Number.isSafeInteger(w.scenario.revision)&&w.scenario.revision>0&&hex(w.scenario.sha256)&&plain(w.scenario.fields)&&w.scenario.fields.id===w.scenario.id&&uuid(w.scenario.fields.nodeId),'Retain the complete original portfolio, program and scenario basis.');need(plain(w.csv)&&typeof w.csv.text==='string'&&bytes(w.csv.text)<=LIMIT&&bytes(w.csv.text)===w.csv.bytes&&await sha256(w.csv.text)===w.csv.sha256,'The original worksheet CSV is incomplete.');
 const ids=new Set();for(const r of w.lines){need(uuid(r.id)&&!ids.has(r.id)&&Number.isSafeInteger(r.revision)&&r.revision>=0&&(r.revision===0?r.sha256===null:hex(r.sha256))&&plain(r.fields)&&Object.keys(r.fields).length===FIELDS.length&&Object.keys(r.fields).every(k=>FIELDS.includes(k))&&r.fields.scenarioId===w.scenario.id,'Preserve each original line, revision, scenario and complete fields.');ids.add(r.id);}
 need(w.csv.text===csv([HEADERS,...w.lines.map(exportedRow)]),'The retained export rows differ from the complete worksheet basis.');
 return w;
}
export async function startReview(worksheet,{text,name='returned-budget.csv',delimiter=',',at=new Date().toISOString(),id=crypto.randomUUID()}={}){
 const w=await receiveWorksheet(worksheet);need(uuid(id)&&typeof text==='string'&&bytes(text)<=LIMIT&&typeof name==='string'&&name.length>0&&name.length<=500,'Select one complete UTF-8 returned worksheet up to 2 MiB.');
 const parsed=parseTable(text,{delimiter});need(parsed.rows.length<=1999,'Review up to 1,999 source rows in one worksheet.');
 const mapping=Object.fromEntries(HEADERS.map(k=>{const matches=parsed.headings.flatMap((h,i)=>h===k?[i]:[]);return[k,matches.length===1?matches[0]:null];}));
 return {schema:REVIEW_SCHEMA,id,worksheet:w,createdAt:stamp(at),source:{name,text,delimiter:parsed.delimiter,bytes:bytes(text),sha256:await sha256(text)},mapping,
   rowIds:Object.fromEntries(parsed.rows.map(r=>[String(r.record),crypto.randomUUID()])),choices:{},excluded:{},status:'review',applied:null};
}
export function remapReview(s,mapping){need(s.status==='review','Create a new return review after applying this source.');const next=clone(s);next.mapping=clone(mapping);next.choices={};return next;}
export function chooseConflict(s,conflict,decision){need(s.status==='review'&&['current','returned'].includes(decision)&&typeof conflict.key==='string'&&hex(conflict.basis),'Select a current reviewed conflict.');const n=clone(s);n.choices[conflict.key]={basis:conflict.basis,decision};return n;}
export function excludeRecord(s,record,reason){need(s.status==='review'&&Number.isSafeInteger(record)&&record>1&&typeof reason==='string'&&reason.length<=1000,'Select an original source record and reason.');const n=clone(s);if(reason.trim())n.excluded[record]=reason;else delete n.excluded[record];n.choices={};return n;}
export async function receiveReview(value){
 const s=clone(value);need(plain(s)&&s.schema===REVIEW_SCHEMA&&uuid(s.id)&&['review','applied'].includes(s.status)&&plain(s.source)&&plain(s.mapping)&&plain(s.rowIds)&&plain(s.choices)&&plain(s.excluded),'Select the complete worksheet review JSON.');
 s.worksheet=await receiveWorksheet(s.worksheet);stamp(s.createdAt);
 need(typeof s.source.text==='string'&&bytes(s.source.text)<=LIMIT&&bytes(s.source.text)===s.source.bytes&&await sha256(s.source.text)===s.source.sha256,'The returned source is incomplete or changed.');
 const parsed=parseTable(s.source.text,{delimiter:s.source.delimiter});need(parsed.rows.length<=1999,'Review up to 1,999 source rows.');
 const used=Object.values(s.mapping).filter(v=>v!==null);need(Object.keys(s.mapping).every(k=>HEADERS.includes(k))&&used.every(v=>Number.isInteger(v)&&v>=0&&v<parsed.width)&&new Set(used).size===used.length,'Map each returned column to at most one declared field.');
 need(parsed.rows.every(r=>uuid(s.rowIds[r.record]))&&new Set(Object.values(s.rowIds)).size===Object.values(s.rowIds).length,'Retain one stable new ID per source row.');
 for(const [k,v]of Object.entries(s.excluded))need(parsed.rows.some(r=>String(r.record)===k)&&typeof v==='string'&&v.trim()&&v.length<=1000,'Retain the reason and original row for each exclusion.');
 for(const v of Object.values(s.choices))need(plain(v)&&hex(v.basis)&&['current','returned'].includes(v.decision),'Retain each exact conflict decision.');
 if(s.status==='applied')need(plain(s.applied)&&uuid(s.applied.documentId)&&hex(s.applied.sourceSha256)&&plain(s.applied.basis),'Retain the complete original application receipt.');
 return s;
}
function calendar(v){
 if(typeof v!=='string'||!/^\d{4}-\d{2}-\d{2}$/.test(v))return false;const [y,m,d]=v.split('-').map(Number);
 const days=[31,y%4===0&&(y%100!==0||y%400===0)?29:28,31,30,31,30,31,31,30,31,30,31];
 return y>=1&&m>=1&&m<=12&&d>=1&&d<=days[m-1];
}
function parsedCell(key,v){
 if(['code','title','category'].includes(key))return v.trim();
 if(['grantId','milestoneId','cashDate','amount'].includes(key)&&v==='')return null;
 if(['documentIds','sourceRefs'].includes(key)){if(v==='')return [];try{return JSON.parse(v);}catch{fail(key+' requires its complete JSON array.');}}
 return v;
}
function parents(rows,id,field){
 const result=new Set(),map=new Map(rows.map(r=>[r.id,r]));while(id!=null&&!result.has(id)){result.add(id);id=map.get(id)?.[field]??null;}return result;
}
function lineErrors(r,c,scenario){
 const e=[],bad=(yes,m)=>{if(yes)e.push(m);},program=c.programme,active=(kind,id)=>program[kind]?.find(x=>x.id===id&&!x.archived);
 for(const k of ['code','title','category'])bad(typeof r[k]!=='string'||!r[k].trim()||r[k].length>240,k+' needs 1–240 characters.');
 for(const k of ['commitmentReference','notes'])bad(typeof r[k]!=='string'||r[k].length>16000,k+' needs at most 16,000 characters.');
 bad(r.scenarioId!==scenario.id,'Keep this original scenario ID; move a line through its original editor.');bad(!uuid(r.nodeId)||!active('nodes',r.nodeId),'Select an active original program/project.');
 const scope=parents(program.nodes||[],r.nodeId,'parentId');bad(!scope.has(scenario.nodeId),'The line is outside this scenario.');
 bad(!['inflow','outflow'].includes(r.direction),'Select inflow or outflow.');bad(!['forecast','committed'].includes(r.classification),'Select forecast or committed.');
 bad(r.classification==='committed'&&!r.commitmentReference?.trim(),'A commitment needs its actual agreement/order reference.');
 bad(typeof r.currency!=='string'||!/^[A-Z]{3}$/.test(r.currency),'Currency requires three uppercase letters.');
 bad(r.amount!==null&&(typeof r.amount!=='string'||r.amount.length>64||!/^[+-]?\d+(?:\.\d{1,18})?$/.test(r.amount)),'Amount must be an exact plain decimal, up to 64 characters and 18 decimal places; blank is unknown.');
 const periodValid=typeof r.period==='string'&&(/^\d{4}$/.test(r.period)?calendar(r.period+'-01-01'):/^\d{4}-\d{2}$/.test(r.period)&&calendar(r.period+'-01'));
 bad(!periodValid,'Budget period requires YYYY or YYYY-MM.');
 if(periodValid){const start=r.period.length===4?r.period+'-01':r.period,end=r.period.length===4?r.period+'-12':r.period;bad(start<scenario.startMonth||end>scenario.endMonth,'The complete annual/monthly period is outside the scenario horizon.');}
 bad(r.cashDate!==null&&(!calendar(r.cashDate)||r.cashDate.slice(0,7)<scenario.startMonth||r.cashDate.slice(0,7)>scenario.endMonth),'Cash date must be a real date within this horizon, or blank.');
 if(r.grantId!==null){const g=active('grants',r.grantId);bad(!uuid(r.grantId)||!g||g.projectId!==r.nodeId,'The selected grant must belong to this original project.');}
 if(r.milestoneId!==null){const m=active('milestones',r.milestoneId);bad(!uuid(r.milestoneId)||!m||m.nodeId!==r.nodeId||m.grantId!=null&&m.grantId!==r.grantId,'The selected milestone must belong to this original project/grant.');}
 bad(!Array.isArray(r.documentIds)||r.documentIds.length>2000||new Set(r.documentIds).size!==r.documentIds.length,'Document IDs require a complete distinct JSON array.');
 if(Array.isArray(r.documentIds))for(const id of r.documentIds){const d=active('documents',id);bad(!uuid(id)||!d||!scope.has(d.nodeId)||d.grantId!=null&&!parents(program.grants||[],r.grantId,'parentGrantId').has(d.grantId),'Document '+id+' is outside the current project/grant.');}
 bad(!Array.isArray(r.sourceRefs)||r.sourceRefs.length>256,'Source references require their complete JSON array, up to 256.');
 if(Array.isArray(r.sourceRefs)){const keys=new Set();for(const ref of r.sourceRefs){bad(!plain(ref)||Object.keys(ref).sort().join(',')!=='entityKey,sha256,sourceId'||!['entityKey','sha256','sourceId'].every(k=>hex(ref[k])),'Retain exact sourceId, entityKey and sha256 for every source reference.');const key=ref?.sourceId+':'+ref?.entityKey;bad(keys.has(key),'A source reference is repeated.');keys.add(key);}}
 return [...new Set(e)];
}
export async function contextFingerprint(c){context(c);return hash({basis:basis(c),lines:c.lines,scenarios:c.scenarios,draft:c.draft||null,programme:c.programme});}
export async function reviewWorksheet(value,c){
 const s=await receiveReview(value);context(c);need(s.worksheet.basis.portfolioId===c.portfolioId&&s.worksheet.basis.workspaceId===c.workspaceId,'Open the worksheet’s original workspace and portfolio.');
 const scenario=c.scenarios.find(r=>r.id===s.worksheet.scenario.id);need(scenario&&!scenario.archived,'Open the original active scenario.');
 const parsed=parseTable(s.source.text,{delimiter:s.source.delimiter}),base=new Map(s.worksheet.lines.map(r=>[r.id,r])),current=new Map(c.lines.map(r=>[r.id,r])),seen=new Set(),conflicts=[],rows=[],changes=[],archive=[];
 const usedChoices=new Set(),read=(r,k)=>s.mapping[k]==null?undefined:r.cells[s.mapping[k]];
 async function reconcile(key,old,incoming,live){
  if(same(incoming,old)||same(live,incoming))return clone(live);
  if(same(live,old))return clone(incoming);
  const conflict={key,base:clone(old),returned:clone(incoming),current:clone(live),basis:await hash({key,old,incoming,live,source:s.source.sha256,mapping:s.mapping})};
  const choice=s.choices[key];if(choice&&choice.basis===conflict.basis){usedChoices.add(key);conflict.decision=choice.decision;}else conflict.decision=null;
  conflicts.push(conflict);return clone(conflict.decision==='returned'?incoming:live);
 }
 for(const sourceRow of parsed.rows){
  const rr={record:sourceRow.record,line:sourceRow.line,id:'',action:'',status:'unchanged',errors:[],changes:[],before:null,after:null};
  rows.push(rr);if(s.excluded[sourceRow.record]){rr.status='excluded';rr.reason=s.excluded[sourceRow.record];continue;}
  const supplied=read(sourceRow,'id'),id=supplied||s.rowIds[sourceRow.record],old=base.get(id),live=current.get(id),action=read(sourceRow,'action')??'upsert';rr.id=id;rr.action=action;
  if(!uuid(id)||seen.has(id)){rr.errors.push('Retain a distinct original UUID, or leave a new row ID blank.');continue;}seen.add(id);
  if(!['upsert','archive','skip'].includes(action)){rr.errors.push('Action must be upsert, archive or skip.');continue;}
  if(action==='skip'){rr.status='excluded';rr.reason='Explicit source action: skip';continue;}
  if(supplied&&!old){rr.errors.push('This ID is not in the original exported worksheet. Leave the ID blank for a new row.');continue;}
  if(old){if(read(sourceRow,'revision')!==String(old.revision)){rr.errors.push('Keep the original exported revision '+old.revision+'; current changes are reviewed separately.');continue;}if(!live){rr.errors.push('The original line is absent from the current register.');continue;}}
  else if(live){rr.errors.push('The stable new-row ID already exists. Reopen the original applied review or prepare a current worksheet.');continue;}
  if(old&&live.scenarioId!==scenario.id){rr.errors.push('The original line moved to a different scenario. Review it in its current editor.');continue;}
  if(action==='archive'){
   if(!old){rr.errors.push('Archive only a saved original line.');continue;}
   const native=c.originalLines.find(r=>r.id===id);
   if(!native){rr.errors.push('Remove an unsaved new line in the original draft editor.');continue;}
   if(live.archived){rr.status='already archived';continue;}
   if(c.draft?.changes.some(r=>r.collection==='lines'&&r.id===id)){rr.errors.push('Save this line’s existing staged edits before archiving it.');continue;}
   const reason=read(sourceRow,'archive_reason')||'';if(!reason.trim()||reason.length>8000){rr.errors.push('Retain an explicit archive reason of 1–8,000 characters.');continue;}
   rr.before=fields(live);rr.after=fields(live);
   const decision=await reconcile(id+'/archive',{archived:false,fields:old.fields},{archived:true,fields:old.fields},{archived:false,fields:fields(live)});
   if(decision.archived){archive.push({collection:'lines',id,expectedRevision:native.revision,reason});rr.status='archive';rr.changes.push({field:'archived',before:false,after:true});}
   continue;
  }
  if(live?.archived){rr.errors.push('This original line is archived. Its earlier editions remain retained.');continue;}
  const incoming=old?clone(old.fields):{scenarioId:scenario.id,nodeId:scenario.nodeId,grantId:null,code:'',title:'',direction:'outflow',category:'',period:'',amount:null,currency:'',classification:'forecast',commitmentReference:'',cashDate:null,milestoneId:null,documentIds:[],sourceRefs:[],notes:''};
  for(const k of FIELDS){const v=read(sourceRow,k);if(v!==undefined)try{incoming[k]=parsedCell(k,v);}catch(error){rr.errors.push(error.message);}}
  rr.before=live?fields(live):null;const result=live?fields(live):clone(incoming);
  if(live)for(const k of FIELDS)result[k]=await reconcile(id+'/'+k,old.fields[k],incoming[k],result[k]);
  rr.after=result;rr.errors.push(...lineErrors(result,c,scenario));if(rr.errors.length)continue;
  const delta=Object.fromEntries(FIELDS.filter(k=>!live||!same(result[k],fields(live)[k])).map(k=>[k,result[k]]));
  rr.changes=Object.entries(delta).map(([field,after])=>({field,before:live?fields(live)[field]:null,after}));
  if(Object.keys(delta).length){changes.push({collection:'lines',id,expectedRevision:c.originalLines.find(r=>r.id===id)?.revision||0,fields:delta});rr.status=live?'edit':'add';}
 }
 const projected=new Map(c.lines.filter(r=>!r.archived&&r.scenarioId===scenario.id).map(r=>[r.id,fields(r)]));
 for(const r of rows)if(!r.errors.length&&r.after&&['add','edit'].includes(r.status))projected.set(r.id,r.after);
 for(const r of archive)projected.delete(r.id);
 const codes=new Map();for(const [id,r]of projected){const code=r.code.trim().toLocaleLowerCase('en');if(codes.has(code)){for(const row of rows.filter(x=>x.id===id||x.id===codes.get(code)))row.errors.push('Line code repeats another active line in this scenario.');}else codes.set(code,id);}
 const errors=rows.flatMap(r=>r.errors.map(message=>({record:r.record,line:r.line,id:r.id,message})));
 const staleChoices=Object.keys(s.choices).filter(k=>!usedChoices.has(k));
 // Choices are only effective for their exact three-way basis; obsolete ones are displayed, never silently applied.
 return {schema:'stellar-forge.grant-budget-worksheet-preview.v1',reviewId:s.id,sourceSha256:s.source.sha256,worksheetSha256:s.worksheet.sha256,basis:basis(c),contextSha256:await contextFingerprint(c),
   rows,conflicts,staleChoices,errors,changes,archive,unresolved:conflicts.filter(r=>!r.decision).length,
   summary:{sourceRows:parsed.rows.length,added:rows.filter(r=>r.status==='add').length,edited:rows.filter(r=>r.status==='edit').length,archived:archive.length,excluded:rows.filter(r=>r.status==='excluded').length,unchanged:rows.filter(r=>['unchanged','already archived'].includes(r.status)).length},
   canStage:s.status==='review'&&!errors.length&&!conflicts.some(r=>!r.decision)&&(changes.length+archive.length)>0};
}
function stageChange(d,c,change){
 const originals=change.collection==='scenarios'?c.originalScenarios:c.originalLines,original=originals.find(r=>r.id===change.id),key=change.collection+':'+change.id;
 const i=d.changes.findIndex(r=>r.collection===change.collection&&r.id===change.id),prior=i<0?{}:d.changes[i].fields;
 const next={...change,expectedRevision:original?.revision||0,fields:{...prior,...clone(change.fields)}};
 if(i<0)d.changes.push(next);else d.changes[i]=next;
 d.archive=d.archive.filter(r=>r.collection!==change.collection||r.id!==change.id);d.recordBases[key]=original?{revision:original.revision,sha256:original.sha256}:null;
}
export async function stageWorksheet(value,c,{actor,at=new Date().toISOString(),documentId=crypto.randomUUID(),expectedContextSha256}={}){
 const s=await receiveReview(value);need(s.status==='review','This return has already been staged; receive or save its original draft.');context(c);
 need(typeof actor==='string'&&actor.trim()&&actor.trim().length<=240&&uuid(documentId),'Enter the original budget editor and retain a new source document ID.');
 const review=await reviewWorksheet(s,c);need(review.canStage,'Resolve the complete source errors/conflicts and select at least one change before staging.');
 need(!expectedContextSha256||review.contextSha256===expectedContextSha256,'The current draft changed during source preparation. Review the complete current changes again.');
 const scenario=c.scenarios.find(r=>r.id===s.worksheet.scenario.id);
 need(!c.draft?.changes.some(r=>r.collection==='scenarios'&&r.id===scenario.id&&r.fields.reviewStatus==='reviewed'),'Save these budget changes before recording separate Finance clearance.');
 const d=clone(c.draft||{schema:'stellar-forge.grant-budget-planning-draft.v1',basis:nativeBasis(c),actor:actor.trim(),changes:[],archive:[],recordBases:{},createdAt:stamp(at)});
 d.basis.programmeRevision=c.programmeRevision;d.actor=actor.trim();
 for(const r of review.changes)stageChange(d,c,r);
 for(const r of review.archive){d.changes=d.changes.filter(x=>x.collection!=='lines'||x.id!==r.id);d.archive=d.archive.filter(x=>x.collection!=='lines'||x.id!==r.id);d.archive.push(clone(r));const original=c.originalLines.find(x=>x.id===r.id);d.recordBases['lines:'+r.id]={revision:original.revision,sha256:original.sha256};}
 stageChange(d,c,{collection:'scenarios',id:scenario.id,fields:{documentIds:[...new Set([...(scenario.documentIds||[]),documentId])]}});
 need(d.changes.length+d.archive.length<=2000,'The complete existing draft plus this worksheet exceeds 2,000 changed records.');
 const applied={reviewId:s.id,documentId,at:stamp(at),actor:actor.trim(),basis:basis(c),scenario:{id:scenario.id,nodeId:scenario.nodeId},contextSha256:review.contextSha256,sourceSha256:s.source.sha256,worksheetSha256:s.worksheet.sha256,summary:review.summary};
 const content=JSON.stringify({schema:SOURCE_SCHEMA,applied,review:s,preview:review},null,2)+'\n',source={filename:'budget-worksheet-'+s.id+'.json',content,bytes:bytes(content),sha256:await sha256(content)};
 need(source.bytes<=12*1024*1024,'The complete source/review exceeds 12 MiB. Retain it and prepare smaller explicit source selections.');
 d.worksheetDocuments=[...(d.worksheetDocuments||[]),{documentId,nodeId:scenario.nodeId,title:'Budget worksheet '+s.source.name.slice(0,180),createdAt:applied.at,source,object:null}];
 need(!c.programme.documents.some(r=>r.id===documentId)&&new Set(d.worksheetDocuments.map(x=>x.documentId)).size===d.worksheetDocuments.length,'Keep distinct original worksheet document IDs.');
 need(bytes(JSON.stringify(d))<=16*1024*1024,'The full portable planning draft exceeds 16 MiB. Save its current complete sources before adding another.');
 return {draft:d,review,source,session:{...s,status:'applied',applied}};
}
export function worksheetProgramme(draft){
 if(!draft.worksheetDocuments?.length)return null;
 return {schema:'stellar-forge.grant-programme.v1',actor:draft.actor,expectedProgrammeRevision:draft.basis.programmeRevision,
   changes:draft.worksheetDocuments.map(d=>({collection:'documents',id:d.documentId,expectedRevision:0,fields:{nodeId:d.nodeId,grantId:null,title:d.title,category:'workplan-budget',owner:draft.actor,status:'current',
     object:d.object,documentDate:d.createdAt.slice(0,10),sourceEdition:d.source.sha256,description:'Complete returned worksheet, original export basis, column mapping, exclusions, conflict choices and staged changes.',content:'',notes:'Original source retained through the same portfolio save.',sourceRefs:[]}})),archive:[]};
}
export async function verifyWorksheetDocuments(draft){
 for(const d of draft.worksheetDocuments||[]){
  need(uuid(d.documentId)&&uuid(d.nodeId)&&plain(d.source)&&typeof d.source.content==='string'&&bytes(d.source.content)===d.source.bytes&&await sha256(d.source.content)===d.source.sha256,'The complete worksheet source in this draft changed.');
  const parsed=JSON.parse(d.source.content);need(parsed.schema===SOURCE_SCHEMA&&plain(parsed.applied)&&parsed.applied.documentId===d.documentId,'The source document belongs to another worksheet application.');
  const review=await receiveReview(parsed.review),a=parsed.applied;stamp(d.createdAt);
  need(a.reviewId===review.id&&a.sourceSha256===review.source.sha256&&a.worksheetSha256===review.worksheet.sha256&&a.basis?.portfolioId===draft.basis.portfolioId&&a.basis?.workspaceId===review.worksheet.basis.workspaceId&&a.scenario?.id===review.worksheet.scenario.id&&a.scenario?.nodeId===d.nodeId,'Preserve the original worksheet source, portfolio and selected scenario scope.');
  need(d.createdAt===a.at&&d.title==='Budget worksheet '+review.source.name.slice(0,180)&&d.source.filename==='budget-worksheet-'+review.id+'.json'&&typeof a.actor==='string'&&a.actor.trim()&&a.actor.length<=240,'Preserve the original worksheet document title, source name, author and application time.');
  need(parsed.preview?.reviewId===review.id&&parsed.preview?.sourceSha256===review.source.sha256&&parsed.preview?.worksheetSha256===review.worksheet.sha256&&same(parsed.preview?.basis,a.basis)&&parsed.preview?.contextSha256===a.contextSha256,'Retain the full original staging preview with its source.');
  if(d.object)need(d.object.sha256===d.source.sha256&&d.object.bytes===d.source.bytes&&d.object.filename===d.source.filename&&d.object.contentType==='application/json','Retain the exact uploaded worksheet source descriptor.');
 }
 return true;
}
