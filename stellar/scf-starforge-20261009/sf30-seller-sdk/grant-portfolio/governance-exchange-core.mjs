// MIT. Complete original governance intake and exchange, shared by browser and Node.
import {parseAwardCsvText} from './awards-exchange-core.mjs';
import {parseExactJSON} from '../stellar-expert/exact-json.mjs';

export const GOVERNANCE_IMPORT_SCHEMA='stellar-forge.governance-import-plan.v1';
export const GOVERNANCE_SCHEMA='stellar-forge.grant-governance.v1';
export const GOVERNANCE_COLLECTIONS=Object.freeze(['committees','meetings','decisions','evaluations','findings','responses','followups']);
const UUID=/^[0-9a-f]{8}-[0-9a-f]{4}-4[0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/;
const HASH=/^[0-9a-f]{64}$/;
const OPERATION=/^[A-Za-z0-9][A-Za-z0-9._:-]{0,159}$/;
const COMMON=['nodeId','grantId','title','owner','notes','sourceRefs','documentIds','supersedesId','status','recordedDate'];
const EXTRA=Object.freeze({
 committees:['terms','members','reviewFrequency','nextReviewDate'],
 meetings:['committeeId','kind','meetingDate','chair','attendees','agenda','minutes','nextReviewDate'],
 decisions:['meetingId','topic','decision','rationale','responsible','dueDate','outcome','issueIds','milestoneIds'],
 evaluations:['kind','stage','periodStart','periodEnd','commissionedBy','evaluators','questions','methodology','limitations','summary','issuedDate'],
 findings:['evaluationId','question','finding','recommendation','priority','recommendationOwner','dueDate'],
 responses:['findingId','respondent','outcome','response','actionPlan','responsible','dueDate','issueIds','milestoneIds'],
 followups:['decisionId','responseId','reviewer','reviewDate','outcome','progress','verification','issueIds','milestoneIds','nextReviewDate'],
});
const REQUIRED=Object.freeze({
 committees:['terms','members'],meetings:['committeeId','kind','meetingDate','chair'],
 decisions:['meetingId','topic','decision','responsible','outcome'],
 evaluations:['kind','stage','commissionedBy','questions','methodology'],
 findings:['evaluationId','question','finding','recommendation'],
 responses:['findingId','respondent','outcome','response'],
 followups:['reviewer','reviewDate','outcome','progress'],
});
const TEXT_FIELDS=new Set(['notes','terms','reviewFrequency','agenda','minutes','decision','rationale','methodology','limitations','summary','finding','recommendation','response','actionPlan','progress','verification']);
const ARRAY_FIELDS=new Set(['sourceRefs','documentIds','members','attendees','evaluators','questions','issueIds','milestoneIds']);
const ID_FIELDS=new Set(['nodeId','grantId','supersedesId','committeeId','meetingId','evaluationId','findingId','decisionId','responseId']);
const OPTIONAL_FIELDS=new Set(['grantId','supersedesId','recordedDate','nextReviewDate','dueDate','periodStart','periodEnd','issuedDate','priority','recommendationOwner','responsible','decisionId','responseId']);
const own=(v,k)=>Object.prototype.hasOwnProperty.call(v,k);
const plain=v=>v!==null&&typeof v==='object'&&!Array.isArray(v);
function need(ok,message){if(!ok)throw Object.assign(new Error(message),{code:'GRANT_GOVERNANCE_EXCHANGE'});}
function exact(v,allowed,required=[]){need(plain(v)&&Object.keys(v).every(k=>allowed.includes(k))&&required.every(k=>own(v,k)),'Use the complete declared governance exchange fields.');}
function text(v,label,max=16000,empty=false){need(typeof v==='string'&&v.length<=max&&!v.includes('\0')&&(empty||v.trim()),'Supply '+label+' as complete ordinary text.');for(const c of v){const cp=c.codePointAt(0);need(cp<0xd800||cp>0xdfff,'Retain complete Unicode scalar text in '+label+'.');}return v;}
const id=v=>{need(typeof v==='string'&&UUID.test(v),'Select a supplied stable record UUID.');return v;};
const revision=v=>{need(Number.isSafeInteger(v)&&v>=0,'Select an exact nonnegative record revision.');return v;};
const clone=v=>JSON.parse(JSON.stringify(v));
function json(v){need(v!==undefined,'Keep an explicit complete JSON value.');return JSON.stringify(v);}
const encoder=new TextEncoder();
const utf8=s=>encoder.encode(s);
const same=(a,b)=>json(a)===json(b);
function sourceBytes(value){need(value instanceof Uint8Array&&value.byteLength>0&&value.byteLength<=8*1024*1024,'Select one complete original file from one byte through 8 MiB.');return new Uint8Array(value);}
function decode(bytes){try{return new TextDecoder('utf-8',{fatal:true}).decode(bytes);}catch{throw Object.assign(new Error('The complete original file must be UTF-8.'),{code:'GRANT_GOVERNANCE_EXCHANGE'});}}
function pointer(root,p){
 text(p,'an RFC 6901 pointer',2000,true);
 if(p==='')return root;
 need(p.startsWith('/'),'Use an absolute RFC 6901 pointer or the empty root pointer.');
 let value=root;
 for(const encoded of p.slice(1).split('/')){
  need(!/~(?:[^01]|$)/.test(encoded),'Use valid RFC 6901 escape sequences.');
  const key=encoded.replace(/~1/g,'/').replace(/~0/g,'~');
  if(Array.isArray(value))need(/^(0|[1-9][0-9]*)$/.test(key),'Select an exact array index.');
  need(value!==null&&typeof value==='object'&&own(value,key),'The selected original JSON pointer is absent: '+p);
  value=value[key];
 }
 return value;
}
function normalizeSelection(selection){
 exact(selection,['format','recordsPointer'],['format']);
 need(['csv','json'].includes(selection.format),'Choose the original CSV or JSON representation.');
 if(selection.format==='csv'){need(!own(selection,'recordsPointer'),'CSV uses its actual first header row.');return {format:'csv'};}
 return {format:'json',recordsPointer:text(selection.recordsPointer??'','the original records pointer',2000,true)};
}
/** Complete rows are retained, including blank cells and exact JSON number text. */
export function inspectGovernanceSource(bytes,selection){
 const original=sourceBytes(bytes),selected=normalizeSelection(selection),body=decode(original);
 if(selected.format==='csv'){
  const parsed=parseAwardCsvText(body);
  return {selection:selected,headers:parsed.headers,rows:parsed.rows,bytes:original.byteLength};
 }
 const document=parseExactJSON(body.charCodeAt(0)===0xfeff?body.slice(1):body),rows=pointer(document,selected.recordsPointer);
 need(Array.isArray(rows)&&rows.length>0&&rows.length<=2000&&rows.every(plain),'Select the complete array of one to 2,000 original JSON objects.');
 return {selection:selected,headers:null,rows,bytes:original.byteLength};
}
function mappingRule(rule,selected,headers){
 exact(rule,['column','pointer','value','encoding','empty'],[]);
 const modes=['column','pointer','value'].filter(k=>own(rule,k));
 need(modes.length===1,'Each mapped field chooses one original column, JSON pointer, or explicit supplied constant.');
 const mode=modes[0],encoding=rule.encoding??'text';
 need(['text','json'].includes(encoding),'Choose literal text or a complete JSON array/object cell.');
 if(mode==='column')need(selected.format==='csv'&&typeof rule.column==='string'&&headers.includes(rule.column),'Select an exact original CSV header.');
 if(mode==='pointer')need(selected.format==='json'&&typeof rule.pointer==='string','Select an original JSON field pointer.');
 if(own(rule,'empty'))need(['null','array'].includes(rule.empty),'Choose explicit null or empty-array handling for a blank original cell.');
 if(mode==='value'){need(!own(rule,'encoding')&&!own(rule,'empty'),'An explicit supplied constant retains its original JSON type.');json(rule.value);}
 return clone(rule);
}
function mapped(row,rule){
 if(own(rule,'value'))return clone(rule.value);
 const value=own(rule,'column')?row[rule.column]:pointer(row,rule.pointer);
 if(value===''&&rule.empty==='null')return null;
 if(value===''&&rule.empty==='array')return [];
 if((rule.encoding??'text')==='json'){
  if(typeof value==='string')return parseExactJSON(value);
  need(value!==undefined,'The mapped original JSON value is absent.');return clone(value);
 }
 need(typeof value==='string'||value===null,'A literal mapped field must retain original text or null. Use JSON for a structured value.');
 return value;
}
function validateMapped(field,value){
 if(ARRAY_FIELDS.has(field)){
  need(Array.isArray(value)&&value.length<=2000,'Retain '+field+' as a complete JSON array.');
  if(field==='members')for(const member of value){exact(member,['name','role','organization','notes'],['name','role']);text(member.name,'member name',240);text(member.role,'member role',240);if(own(member,'organization'))text(member.organization,'member organization',240,true);if(own(member,'notes'))text(member.notes,'member notes',16000,true);}
  else if(field==='sourceRefs')for(const ref of value){exact(ref,['sourceId','entityKey','sha256'],['sourceId','entityKey','sha256']);need(Object.values(ref).every(v=>typeof v==='string'&&HASH.test(v)),'Select complete original source record identities.');}
  else for(const item of value){if(field.endsWith('Ids'))id(item);else text(item,field+' item',240);}
 }else if(value===null)need(OPTIONAL_FIELDS.has(field),'This mapped field does not accept null: '+field);
 else if(ID_FIELDS.has(field))id(value);
 else text(value,field,16000,true);
 return clone(value);
}
function selectedPortfolio(portfolio){
 need(plain(portfolio?.definition?.programme)&&Number.isSafeInteger(portfolio.revision)&&portfolio.revision>0&&HASH.test(portfolio.snapshot||''),'Open the complete selected original programme portfolio.');
 id(portfolio.id);
 return {id:portfolio.id,revision:portfolio.revision,snapshot:portfolio.snapshot};
}
function activeProgramme(portfolio,collection,ident){
 const row=portfolio.definition.programme.records[collection]?.find(r=>r.id===ident);
 need(row&&!row.archived,'Select an active original programme '+collection+' record.');return row;
}
function recordPin(row){return {id:row.id,revision:row.revision,sha256:row.sha256};}
function safeFilename(value){text(value,'original filename',200);need(/^[A-Za-z0-9][A-Za-z0-9._-]{0,199}$/.test(value),'Use a complete download filename of letters, numbers, dots, dashes and underscores.');return value;}
function fieldNames(collection){return [...COMMON,...EXTRA[collection]];}
function keyOf(row,rule){return text(mapped(row,rule),'a distinct original record key',500);}
function csvCell(value,safe){let v=value==null?'':typeof value==='object'?JSON.stringify(value):String(value);if(safe&&/^[\t\r\n ]*[=+\-@]/.test(v))v="'"+v;return '"'+v.replace(/"/g,'""')+'"';}
/**
 * SHA-256 is injected from Node crypto or browser SubtleCrypto. Its argument is
 * a complete Uint8Array; it must return the lowercase hexadecimal digest.
 */
export function createGovernanceExchange({sha256}){
 need(typeof sha256==='function','Provide the original runtime SHA-256 implementation.');
 const pin=async bytes=>{const digest=await sha256(bytes);need(typeof digest==='string'&&HASH.test(digest),'The SHA-256 implementation returned an invalid identity.');return {bytes:bytes.byteLength,sha256:digest};};
 async function prepare(portfolio,input,original){
  portfolio=clone(portfolio);input=clone(input);
  exact(input,['operationId','actor','filename','documentId','nodeId','grantId','collection','selection','recordKey','mapping','identities'],
   ['operationId','actor','filename','documentId','nodeId','collection','selection','recordKey','mapping','identities']);
  const selected=selectedPortfolio(portfolio),bytes=sourceBytes(original),source=await pin(bytes),parsed=inspectGovernanceSource(bytes,input.selection);
  const operationId=text(input.operationId,'one retained operation ID',160);need(OPERATION.test(operationId),'Use a valid original operation ID.');
  const actor=text(input.actor,'actual recording actor',240),filename=safeFilename(input.filename),documentId=id(input.documentId),nodeId=id(input.nodeId),grantId=input.grantId==null?null:id(input.grantId);
  activeProgramme(portfolio,'nodes',nodeId);if(grantId)need(activeProgramme(portfolio,'grants',grantId).projectId===nodeId,'The selected grant belongs to another project.');
  const collection=input.collection;need(GOVERNANCE_COLLECTIONS.includes(collection),'Select a governance register.');
  const fields=fieldNames(collection);
  need(plain(input.mapping)&&Object.keys(input.mapping).length>0&&Object.keys(input.mapping).every(k=>fields.includes(k)&&!['nodeId','grantId','supersedesId'].includes(k)),'Map declared governance fields; scope and following-edition identities are selected separately.');
  const recordKey=mappingRule(input.recordKey,parsed.selection,parsed.headers),mapping=Object.fromEntries(Object.entries(input.mapping).map(([k,v])=>[k,mappingRule(v,parsed.selection,parsed.headers)]));
  need(plain(input.identities),'Supply the complete stable record identity map.');
  const model=portfolio.definition.governance;
  need(model===undefined||model.schema===GOVERNANCE_SCHEMA,'The selected governance schema differs.');
  const current=model?.records?.[collection]??[],seenKeys=new Set(),seenIds=new Set(),changes=[],rows=[];
  for(let index=0;index<parsed.rows.length;index++){
   const originalRow=parsed.rows[index],key=keyOf(originalRow,recordKey);
   need(!seenKeys.has(key),'The original selected rows repeat record key '+key);seenKeys.add(key);
   need(own(input.identities,key),'Supply a stable target identity for original row '+key);
   const identity=input.identities[key];exact(identity,['id','expectedRevision','supersedesId'],['id','expectedRevision']);
   const ident=id(identity.id),expectedRevision=revision(identity.expectedRevision);
   need(!seenIds.has(ident),'Distinct original rows cannot select the same target record.');seenIds.add(ident);
   const before=current.find(r=>r.id===ident);
   need((before?.revision??0)===expectedRevision,'The chosen original draft revision changed for '+key);
   need(!before||(!before.archived&&before.status==='draft'&&before.nodeId===nodeId&&(before.grantId??null)===grantId),'Only the same scoped original draft can be updated; recorded editions require a new ID.');
   let predecessor=null;
   if(identity.supersedesId!=null){predecessor=current.find(r=>r.id===id(identity.supersedesId));need(predecessor&&predecessor.status==='recorded'&&predecessor.nodeId===nodeId&&(predecessor.grantId??null)===grantId&&predecessor.id!==ident,'Select an original recorded predecessor in this same scope.');need(!before||before.supersedesId===predecessor.id,'Keep the original draft predecessor.');}
   else if(before?.supersedesId)predecessor=current.find(r=>r.id===before.supersedesId);
   const base=before??predecessor;
   const target={};
   for(const field of fields){if(ARRAY_FIELDS.has(field))target[field]=[];else if(TEXT_FIELDS.has(field))target[field]='';else if(OPTIONAL_FIELDS.has(field))target[field]=null;}
   if(base)for(const field of fields)if(own(base,field))target[field]=clone(base[field]);
   target.nodeId=nodeId;target.grantId=grantId;target.supersedesId=predecessor?.id??null;
   if(!before){target.status='draft';target.recordedDate=null;}
   for(const [field,rule]of Object.entries(mapping))target[field]=validateMapped(field,mapped(originalRow,rule));
   target.documentIds=[...new Set([...(target.documentIds??[]),documentId])];
   target.sourceRefs=target.sourceRefs??[];target.notes=target.notes??'';
   need(typeof target.title==='string'&&target.title.trim()&&typeof target.owner==='string'&&target.owner.trim(),'Every proposed record needs a supplied title and accountable owner.');
   need(REQUIRED[collection].every(field=>own(target,field)&&target[field]!==null&&((TEXT_FIELDS.has(field)||ARRAY_FIELDS.has(field))||typeof target[field]==='string'&&target[field].trim())),'Supply all required original '+collection+' fields.');
   need(['draft','recorded'].includes(target.status),'Select draft or recorded explicitly.');
   if(target.status==='recorded')need(typeof target.recordedDate==='string'&&/^\d{4}-\d{2}-\d{2}$/.test(target.recordedDate),'Recording needs the actual complete date; the original model validates the whole record.');
   const change={collection,id:ident,expectedRevision,fields:target};changes.push(change);
   rows.push({index,key,original:clone(originalRow),before:before?recordPin(before):null,supersedes:predecessor?recordPin(predecessor):null,change});
  }
  need(Object.keys(input.identities).length===seenKeys.size&&Object.keys(input.identities).every(k=>seenKeys.has(k)),'The identity map must cover exactly the complete selected source rows.');
  const descriptor={...source,filename,contentType:parsed.selection.format==='csv'?'text/csv':'application/json'};
  const mappingEvidence={schema:GOVERNANCE_IMPORT_SCHEMA,operationId,source:descriptor,collection,nodeId,grantId,selection:parsed.selection,recordKey,mapping,rowCount:rows.length};
  const mappingText=JSON.stringify(mappingEvidence,null,2);need(mappingText.length<=16000,'Keep the full mapping within the original document content limit.');
  const document=portfolio.definition.programme.records.documents.find(r=>r.id===documentId);
  need(!document||(!document.archived&&document.nodeId===nodeId&&(document.grantId??null)===grantId&&same(document.object,descriptor)&&document.content===mappingText),'The original document ID has different content, mapping or scope; choose a new document ID.');
  const definition=portfolio.definition;
  const payload={id:portfolio.id,expectedPortfolioRevision:portfolio.revision,name:definition.name,notes:definition.notes,sources:clone(definition.sources),review:clone(definition.review),
   ...(document?{}:{programme:{schema:'stellar-forge.grant-programme.v1',expectedProgrammeRevision:definition.programme.revision,actor,changes:[{collection:'documents',id:documentId,expectedRevision:0,fields:{nodeId,grantId,title:'Original governance intake · '+filename,category:'other',owner:actor,status:'current',object:descriptor,description:'Complete original committee or evaluation source and its explicit reviewed record mapping.',content:mappingText}}]}}),
   governance:{schema:GOVERNANCE_SCHEMA,expectedGovernanceRevision:model?.revision??0,actor,changes}};
  const action={operationId,action:'portfolio.save',payload},actionBytes=utf8(JSON.stringify(action));need(actionBytes.byteLength<=1024*1024,'The complete reviewed action exceeds the original one MiB request limit; select separate retained source files and operations.');
  const plan={schema:GOVERNANCE_IMPORT_SCHEMA,portfolio:selected,source:descriptor,selection:parsed.selection,input:clone({...input,selection:parsed.selection}),rows,action,actionSha256:(await pin(actionBytes)).sha256};
  const planBytes=utf8(JSON.stringify(plan));need(planBytes.byteLength<=16*1024*1024,'The complete source preview exceeds 16 MiB.');
  return plan;
 }
 async function verify(portfolio,plan,original){
  portfolio=clone(portfolio);plan=clone(plan);original=sourceBytes(original);
  need(plain(plan)&&plan.schema===GOVERNANCE_IMPORT_SCHEMA&&same(selectedPortfolio(portfolio),plan.portfolio),'Reopen the exact historical portfolio selected by the original plan.');
  const rebuilt=await prepare(portfolio,plan.input,original);
  need(same(rebuilt,plan),'The complete original mapping, source, identities, preview or action changed.');return rebuilt;
 }
 async function reopen(client,plan,original,options={}){
  plan=clone(plan);original=sourceBytes(original);
  need(plain(plan?.portfolio),'Select the complete retained import plan.');
  const portfolio=await client.portfolio(plan.portfolio.id,{revision:plan.portfolio.revision,signal:options.signal});
  return verify(portfolio,plan,original);
 }
 async function submit(client,plan,original,options={}){
  const bytes=sourceBytes(original),verified=await reopen(client,plan,bytes,options);
  const uploaded=await client.uploadProgrammeDocument({body:bytes,bytes:bytes.byteLength,sha256:verified.source.sha256},options);
  need(uploaded.bytes===verified.source.bytes&&uploaded.sha256===verified.source.sha256,'The complete original document upload differs.');
  return client.action(verified.action,options);
 }
 async function exportRecords(portfolio,{collection,nodeId,grantId,format='json',spreadsheetSafe=true}={}){
  portfolio=clone(portfolio);
  const selected=selectedPortfolio(portfolio),model=portfolio.definition.governance;need(model?.schema===GOVERNANCE_SCHEMA,'Select an original governance revision.');
  if(collection!==undefined)need(GOVERNANCE_COLLECTIONS.includes(collection),'Select a governance register.');
  if(nodeId!==undefined)activeProgramme(portfolio,'nodes',id(nodeId));
  if(grantId!==undefined)activeProgramme(portfolio,'grants',id(grantId));
  need(['csv','json'].includes(format),'Choose complete JSON or CSV exchange.');need(typeof spreadsheetSafe==='boolean','Select explicit spreadsheet safety.');
  const collections=collection?[collection]:GOVERNANCE_COLLECTIONS;
  const records=Object.fromEntries(collections.map(name=>[name,model.records[name].filter(r=>(nodeId===undefined||r.nodeId===nodeId)&&(grantId===undefined||r.grantId===grantId))]));
  const selection={portfolio:selected,governanceRevision:model.revision,...(nodeId?{nodeId}:{}),...(grantId?{grantId}:{})};
  let body;
  if(format==='json')body=JSON.stringify({schema:'stellar-forge.governance-record-exchange.v1',...selection,records},null,2)+'\n';
  else{
   need(collection!==undefined,'CSV exports one complete selected register; use JSON for all seven.');
   const primary=['id','revision','sha256','archived','archiveReason','createdAt','updatedAt','updatedBy',...fieldNames(collection)];
   const headers=[...primary,...[...new Set(records[collection].flatMap(row=>Object.keys(row)))].filter(k=>!primary.includes(k)).sort()];
   body=[headers.map(v=>csvCell(v,false)).join(','),...records[collection].map(row=>headers.map(key=>csvCell(row[key],spreadsheetSafe)).join(','))].join('\r\n')+'\r\n';
  }
  const bytes=utf8(body);return {schema:'stellar-forge.governance-exchange-file.v1',...selection,format,contentType:format==='json'?'application/json':'text/csv',filename:'governance-'+(collection??'all')+'-r'+selected.revision+'.'+format,spreadsheetSafe:format==='csv'?spreadsheetSafe:false,rows:Object.values(records).reduce((n,list)=>n+list.length,0),...await pin(bytes),content:bytes};
 }
 return Object.freeze({prepare,verify,reopen,submit,exportRecords,inspect:inspectGovernanceSource});
}
