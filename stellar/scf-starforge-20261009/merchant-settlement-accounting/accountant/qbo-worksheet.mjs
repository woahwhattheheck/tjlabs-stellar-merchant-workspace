// MIT. Reviewed allocation worksheets for the original buyer QuickBooks draft.
// This module reads source and returns draft choices. It never writes books or a workspace.
import {parseReturnCsv} from './engine.mjs';
import {qboBuyerRows,qboBuyerDecisions} from './qbo-buyer.mjs';
import {validateQboCompany} from './qbo-company.mjs';
import {qboCanonical as canonical,qboHash as hash,qboCheck as need,qboId} from './qbo.mjs';

export const QBO_WORKSHEET_SCHEMA='stellar-forge.qbo-allocation-worksheet.v1';
export const QBO_WORKSHEET_PREVIEW_SCHEMA='stellar-forge.qbo-allocation-worksheet-preview.v1';
export const QBO_WORKSHEET_CSV_BYTES=16*1024*1024;
export const QBO_WORKSHEET_FIELDS=Object.freeze([
  'decision','amount','debitAccountId','creditAccountId','valuationNote','reason','description'
]);
export const QBO_WORKSHEET_COLUMNS=Object.freeze([
  'worksheetSha256','rowType','rowId','realmId','environment','homeCurrency',
  'kind','recognitionDate','network','asset','nativeAmountAtomic','sourceLineId',
  'sourceRowSha256','economicId','costCenter','project','sourceAccountCode',
  'bookkeepingStatus','bookReference',...QBO_WORKSHEET_FIELDS,'valuationBasis'
]);
const SHA=/^[a-f0-9]{64}$/,plain=value=>value!==null&&typeof value==='object'&&!Array.isArray(value);
const copy=value=>structuredClone(value),digest=value=>hash(canonical(value));
const limits={decision:20,amount:64,debitAccountId:64,creditAccountId:64,valuationNote:2000,reason:2000,description:2000,valuationBasis:2000};
const same=(a,b)=>canonical(a)===canonical(b);
function fields(value,keys,label){
  need(plain(value)&&Object.keys(value).every(key=>keys.includes(key))&&keys.every(key=>Object.hasOwn(value,key)),
    'QBO_WORKSHEET_SHAPE','Keep the complete '+label+' fields.');
}
function string(value,key){
  need(typeof value==='string'&&value.length<=limits[key]&&!/[\u0000-\u0008\u000b\u000c\u000e-\u001f\u007f]/.test(value),
    'QBO_WORKSHEET_TEXT','Keep '+key+' as text of at most '+limits[key]+' characters.');return value;
}
function timestamp(value){
  need(typeof value==='string'&&/^\d{4}-\d{2}-\d{2}T/.test(value)&&/(?:Z|[+-]\d{2}:\d{2})$/.test(value)&&Number.isFinite(Date.parse(value)),
    'QBO_WORKSHEET_TIME','Use the worksheet’s original creation time with its time zone.');return value;
}
const seal=value=>({...value,integrity:{sha256:digest(value)}});
function verified(value,schema){
  need(plain(value)&&value.schema===schema&&plain(value.integrity)&&SHA.test(value.integrity.sha256??''),
    'QBO_WORKSHEET_REQUIRED','Choose the complete exported worksheet record.');
  const {integrity,...body}=value;
  need(Object.keys(integrity).length===1&&digest(body)===integrity.sha256,'QBO_WORKSHEET_CHANGED',
    'The worksheet record changed. Reopen its original saved record.',409);return value;
}
function normalizeDraft(value,rows){
  fields(value,['valuationBasis','rows'],'worksheet draft');string(value.valuationBasis,'valuationBasis');
  need(Array.isArray(value.rows)&&value.rows.length===rows.length,'QBO_WORKSHEET_COVERAGE',
    'Keep exactly one draft decision for every original allocation.',409);
  const expected=new Set(rows.map(row=>row.rowId)),seen=new Map();
  for(const row of value.rows){
    fields(row,['rowId',...QBO_WORKSHEET_FIELDS],'allocation decision');
    need(SHA.test(row.rowId??'')&&expected.has(row.rowId)&&!seen.has(row.rowId),'QBO_WORKSHEET_COVERAGE',
      'Every worksheet decision must name one distinct original allocation.',409);
    for(const key of QBO_WORKSHEET_FIELDS)string(row[key],key);
    need(['pending','include','exclude'].includes(row.decision),'QBO_WORKSHEET_DECISION',
      'Use pending, include or exclude for each allocation.');
    seen.set(row.rowId,copy(row));
  }
  return {valuationBasis:value.valuationBasis,rows:rows.map(row=>seen.get(row.rowId))};
}
function contextFor({handoff,revision=null,workspaceBinding,companySnapshot,environment}){
  need(plain(workspaceBinding)&&SHA.test(workspaceBinding.workspaceId??'')&&SHA.test(workspaceBinding.sourcesSha256??''),
    'QBO_WORKSHEET_WORKSPACE','Read the original accounting workspace and source binding.');
  const rows=qboBuyerRows(handoff,revision);
  need(rows.length>0&&rows.length<=22000,'QBO_WORKSHEET_COVERAGE','Choose a buyer handoff with 1–22,000 original allocations.');
  validateQboCompany(companySnapshot);
  need(['sandbox','production'].includes(environment),'QBO_WORKSHEET_ENVIRONMENT','Choose the original QuickBooks sandbox or production target.');
  return {rows,binding:{
    workspaceId:workspaceBinding.workspaceId,sourcesSha256:workspaceBinding.sourcesSha256,
    handoffId:handoff.id,handoffSha256:handoff.integrity.sha256,
    accountantRevisionId:revision?.id??null,accountantRevisionSha256:revision?.integrity.sha256??null,
    sourceRowsSha256:digest(rows),companySha256:companySnapshot.integrity.sha256,
    realmId:companySnapshot.realmId,companyName:companySnapshot.companyName,
    baseCurrency:companySnapshot.baseCurrency,environment
  }};
}
const cell=value=>value===null||value===undefined?'':typeof value==='object'?canonical(value):String(value);
const longNumeric=value=>/^(?:\d+(?:\.\d*)?|\.\d+)(?:[eE][+\-]?\d+)?$/.test(value)&&value.replace(/\D/g,'').length>15;
const escaped=value=>/^['\t\r\n]/.test(value)||/^\s*[=+\-@]/u.test(value)||longNumeric(value);
const encodeCell=value=>escaped(value)?"'"+value:value;
const decodeCell=value=>value.startsWith("'")&&escaped(value.slice(1))?value.slice(1):value;
const quote=value=>'"'+encodeCell(cell(value)).replace(/"/g,'""')+'"';
function protectedRow(worksheet,row){
  const b=worksheet.binding;
  return {worksheetSha256:worksheet.integrity.sha256,rowType:'ALLOCATION',rowId:row.rowId,
    realmId:b.realmId,environment:b.environment,homeCurrency:b.baseCurrency,
    kind:row.kind,recognitionDate:row.recognitionDate,network:row.network,asset:cell(row.asset),
    nativeAmountAtomic:row.amountAtomic,sourceLineId:row.sourceLineId,sourceRowSha256:row.sourceRowSha256,
    economicId:row.economicId,costCenter:row.costCenter,project:row.project,sourceAccountCode:row.sourceAccountCode,
    bookkeepingStatus:row.externalStatus,bookReference:row.externalBookRef,valuationBasis:''};
}
function journalRow(worksheet,basis){
  return {...Object.fromEntries(QBO_WORKSHEET_COLUMNS.map(key=>[key,''])),
    worksheetSha256:worksheet.integrity.sha256,rowType:'JOURNAL',rowId:'JOURNAL',
    realmId:worksheet.binding.realmId,environment:worksheet.binding.environment,
    homeCurrency:worksheet.binding.baseCurrency,valuationBasis:basis};
}
function renderCsv(worksheet,rows){
  const decisions=new Map(worksheet.base.rows.map(row=>[row.rowId,row]));
  const values=[journalRow(worksheet,worksheet.base.valuationBasis),
    ...rows.map(row=>({...protectedRow(worksheet,row),...decisions.get(row.rowId)}))];
  const csv=QBO_WORKSHEET_COLUMNS.map(quote).join(',')+'\r\n'+values.map(row=>
    QBO_WORKSHEET_COLUMNS.map(key=>quote(row[key])).join(',')).join('\r\n')+'\r\n';
  need(Buffer.byteLength(csv,'utf8')<=QBO_WORKSHEET_CSV_BYTES,'QBO_WORKSHEET_SIZE',
    'The complete allocation worksheet exceeds 16 MiB. Shorten draft explanations or use the original native JSON workflow.');
  return csv;
}
function accountReference(worksheet,company){
  const columns=['worksheetSha256','companySha256','realmId','accountId','name','type','currency','active','selectable','reasons'];
  const rows=company.accounts.map(account=>[
    worksheet.integrity.sha256,company.integrity.sha256,company.realmId,account.value,account.name,
    account.AccountType,account.CurrencyRef?.value??'',account.Active,account.selectable,
    account.reasons.map(reason=>reason.code+': '+reason.message).join('\n')
  ]);
  const csvText=columns.map(quote).join(',')+'\r\n'+rows.map(row=>row.map(quote).join(',')).join('\r\n')+'\r\n';
  need(Buffer.byteLength(csvText,'utf8')<=QBO_WORKSHEET_CSV_BYTES,'QBO_WORKSHEET_SIZE','The complete company account reference exceeds 16 MiB.');
  return {companySha256:company.integrity.sha256,realmId:company.realmId,csvText,
    csvSha256:hash(csvText),csvBytes:Buffer.byteLength(csvText,'utf8')};
}
/** Export before editing. Keep the returned worksheet JSON beside its editable CSV. */
export function createQboWorksheet({id,createdAt,draft,...context}={}){
  qboId(id);timestamp(createdAt);
  const {rows,binding}=contextFor(context),base=normalizeDraft(draft,rows);
  const worksheet=seal({schema:QBO_WORKSHEET_SCHEMA,id,createdAt,binding,
    columns:[...QBO_WORKSHEET_COLUMNS],sourceCount:rows.length,base});
  const csvText=renderCsv(worksheet,rows);
  return {worksheet,csvText,csvSha256:hash(csvText),csvBytes:Buffer.byteLength(csvText,'utf8'),accountReference:accountReference(worksheet,context.companySnapshot)};
}
/** Source validation never treats the checksum as a signature or another review. */
export function validateQboWorksheet(worksheet,context){
  verified(worksheet,QBO_WORKSHEET_SCHEMA);
  fields(worksheet,['schema','id','createdAt','binding','columns','sourceCount','base','integrity'],'worksheet record');
  qboId(worksheet.id);timestamp(worksheet.createdAt);
  const current=contextFor(context);
  need(same(worksheet.columns,QBO_WORKSHEET_COLUMNS)&&worksheet.sourceCount===current.rows.length&&same(worksheet.binding,current.binding),
    'QBO_WORKSHEET_SOURCE_CHANGED',
    'This worksheet belongs to another workspace, handoff, accountant return or company chart. Export a worksheet from the current selected source; keep the old files for review.',409);
  const normalized=normalizeDraft(worksheet.base,current.rows);
  need(same(normalized,worksheet.base),'QBO_WORKSHEET_CHANGED','Retain the exported worksheet row order and base choices.',409);
  return current;
}
/** Reopen the same exported base through the original source, without recreating its identity. */
export function openQboWorksheet({worksheet,...context}={}){
  const {rows}=validateQboWorksheet(worksheet,context),csvText=renderCsv(worksheet,rows);
  return {worksheet:copy(worksheet),csvText,csvSha256:hash(csvText),csvBytes:Buffer.byteLength(csvText,'utf8'),accountReference:accountReference(worksheet,context.companySnapshot)};
}
function sourceProblem(code,message,record,extra={}){
  return {code,message,rowNumber:record?.rowNumber??null,lineNumber:record?.lineNumber??null,...extra};
}
function parseEdited(worksheet,rows,csvBytes){
  need(typeof csvBytes==='string'||Buffer.isBuffer(csvBytes)||csvBytes instanceof Uint8Array,'QBO_WORKSHEET_CSV','Choose the complete UTF-8 CSV file.');
  const raw=typeof csvBytes==='string'?Buffer.from(csvBytes,'utf8'):Buffer.from(csvBytes);
  need(raw.length>0&&raw.length<=QBO_WORKSHEET_CSV_BYTES,'QBO_WORKSHEET_SIZE','Choose the complete worksheet CSV up to 16 MiB.');
  const parsed=parseReturnCsv(raw,{columns:QBO_WORKSHEET_COLUMNS}),known=new Map(rows.map(row=>[row.rowId,row]));
  const original=new Map(worksheet.base.rows.map(row=>[row.rowId,row])),seen=new Set(),issues=[],returned=new Map();
  let basis=null;
  for(const record of parsed.records){
    if(record.values.every(value=>value===''))continue;
    if(record.values.length!==parsed.headers.length){issues.push(sourceProblem('ROW_LENGTH','Keep every worksheet column in this row.',record));continue;}
    const values=Object.fromEntries(parsed.headers.map((key,index)=>[key,record.values[index]]));
    const rowId=decodeCell(values.rowId),type=decodeCell(values.rowType),key=type+':'+rowId;
    if(seen.has(key)){issues.push(sourceProblem('DUPLICATE_ROW','Keep exactly one copy of this worksheet row.',record,{rowId}));continue;}
    seen.add(key);
    if(type==='JOURNAL'&&rowId==='JOURNAL'){
      const expected=journalRow(worksheet,worksheet.base.valuationBasis);
      const changed=QBO_WORKSHEET_COLUMNS.filter(key=>key!=='valuationBasis'&&decodeCell(values[key])!==cell(expected[key]));
      if(changed.length)issues.push(sourceProblem('PROTECTED_FIELDS','Keep the journal source cells unchanged.',record,{rowId,fields:changed}));
      const incoming=values.valuationBasis===encodeCell(worksheet.base.valuationBasis)?worksheet.base.valuationBasis:decodeCell(values.valuationBasis);
      try{basis=string(incoming,'valuationBasis');}catch(error){issues.push(sourceProblem(error.code,error.message,record,{rowId,field:'valuationBasis'}));}
      continue;
    }
    const row=known.get(rowId);
    if(type!=='ALLOCATION'||!row){issues.push(sourceProblem('UNKNOWN_ROW','This row is not an original allocation in the selected worksheet.',record,{rowId}));continue;}
    const expected=protectedRow(worksheet,row),changed=Object.keys(expected).filter(key=>decodeCell(values[key])!==cell(expected[key]));
    if(changed.length)issues.push(sourceProblem('PROTECTED_FIELDS','An original allocation or worksheet source cell changed. Restore its exact text from the exported file.',record,{rowId,fields:changed}));
    const value={rowId},base=original.get(rowId);
    for(const field of QBO_WORKSHEET_FIELDS){
      const incoming=values[field]===encodeCell(base[field])?base[field]:decodeCell(values[field]);
      try{value[field]=string(incoming,field);}catch(error){issues.push(sourceProblem(error.code,error.message,record,{rowId,field}));}
    }
    if(!['pending','include','exclude'].includes(value.decision))issues.push(sourceProblem('QBO_WORKSHEET_DECISION','Use pending, include or exclude explicitly.',record,{rowId,field:'decision'}));
    returned.set(rowId,value);
  }
  if(basis===null)issues.push(sourceProblem('MISSING_JOURNAL','Keep the one JOURNAL row and its common valuation basis.'));
  const missing=rows.filter(row=>!returned.has(row.rowId)).map(row=>row.rowId);
  if(missing.length)issues.push(sourceProblem('MISSING_ALLOCATIONS','Keep every original allocation, including pending or excluded rows.',null,{rowIds:missing}));
  return {parsed,issues,draft:issues.length?null:{valuationBasis:basis,rows:rows.map(row=>returned.get(row.rowId))}};
}
function decisionProblems(draft,rows,company,context){
  const accounts=new Map(company.accounts.map(row=>[row.value,row])),source=new Map(rows.map(row=>[row.rowId,row])),issues=[];
  for(const row of draft.rows){
    const add=(code,message,field)=>issues.push({code,message,rowId:row.rowId,field});
    if(row.decision==='pending'){add('PENDING_DECISION','Choose Include or Exclude before preparing a journal.','decision');continue;}
    if(row.decision==='exclude'){if(!row.reason.trim())add('EXCLUSION_REASON','Enter the reason for this exclusion.','reason');continue;}
    if(!/^(?:0|[1-9]\d{0,8})(?:\.\d{1,2})?$/.test(row.amount.trim())||!/[\d]*[1-9]/.test(row.amount.trim()))
      add('VALUATION_REQUIRED','Enter a positive amount with at most two decimal places, up to 999999999.99.','amount');
    for(const field of ['debitAccountId','creditAccountId'])if(accounts.get(row[field].trim())?.selectable!==true)
      add('ACCOUNT_REQUIRED','Choose an eligible account ID from this retained company chart.',field);
    if(row.debitAccountId.trim()&&row.debitAccountId.trim()===row.creditAccountId.trim())add('DISTINCT_ACCOUNTS','Choose different debit and credit accounts.','creditAccountId');
    if(!row.valuationNote.trim())add('VALUATION_NOTE','Enter the source and treatment of this allocation valuation.','valuationNote');
    if(row.description.trim().length>1000)add('DESCRIPTION_LENGTH','The native journal description permits at most 1,000 characters.','description');
    if(['BOOKED','EXCLUDED'].includes(source.get(row.rowId).externalStatus))add('ALREADY_ACCOUNTED','This allocation is already booked or excluded in the original accountant return.','decision');
  }
  if(!draft.valuationBasis.trim())issues.push({code:'VALUATION_BASIS',message:'Enter the common valuation basis and tax treatment.',rowId:'JOURNAL',field:'valuationBasis'});
  const included=draft.rows.filter(row=>row.decision==='include').length;
  if(!included||included>500)issues.push({code:'JOURNAL_ROW_LIMIT',message:'A native journal requires 1–500 included allocations.',rowId:'JOURNAL',field:'decision'});
  if(!issues.length){
    // The existing buyer compiler owns zero-allocation and production-source policy.
    try{qboBuyerDecisions({...context,...qboWorksheetSelections(draft)});}
    catch(error){issues.push({code:error.code??'QBO_BUYER_REVIEW_REQUIRED',message:error.message,rowId:'JOURNAL',field:'decision'});}
  }
  return issues;
}
/**
 * Three-way merge: exported base, returned file, and the complete current draft.
 * Every conflicting field needs an explicit current/returned choice. Malformed or
 * incomplete source coverage returns no candidate, so valid rows cannot partly apply.
 */
export function inspectQboWorksheet({worksheet,csvBytes,currentDraft,resolutions=[],...context}={}){
  const {rows,binding}=validateQboWorksheet(worksheet,context),current=normalizeDraft(currentDraft,rows);
  const edited=parseEdited(worksheet,rows,csvBytes);
  need(Array.isArray(resolutions),'QBO_WORKSHEET_RESOLUTIONS','Use the explicit conflict choices from this preview.');
  const chosen=new Map();
  for(const row of resolutions){
    fields(row,['id','choice'],'conflict choice');
    need(SHA.test(row.id??'')&&!chosen.has(row.id)&&['current','returned'].includes(row.choice),
      'QBO_WORKSHEET_RESOLUTIONS','Choose the current or returned value once for each original conflict.',409);
    chosen.set(row.id,row.choice);
  }
  const changes=[],conflicts=[],used=new Set();let candidate=null;
  const merge=(rowId,field,base,now,incoming)=>{
    if(incoming===base){if(now!==base)changes.push({rowId,field,base,current:now,returned:incoming,value:now,status:'CURRENT'});return now;}
    if(now===base||now===incoming){
      changes.push({rowId,field,base,current:now,returned:incoming,value:incoming,status:now===incoming?'SAME':'RETURNED'});return incoming;
    }
    const id=digest({worksheetSha256:worksheet.integrity.sha256,rowId,field,base,current:now,returned:incoming});
    const choice=chosen.get(id)??null;used.add(id);
    const item={id,rowId,field,base,current:now,returned:incoming,choice};
    conflicts.push(item);
    const value=choice==='returned'?incoming:now;
    changes.push({...item,value,status:choice?'RESOLVED_'+choice.toUpperCase():'CONFLICT'});
    return value;
  };
  if(edited.draft){
    const base=new Map(worksheet.base.rows.map(row=>[row.rowId,row])),now=new Map(current.rows.map(row=>[row.rowId,row]));
    candidate={valuationBasis:merge('JOURNAL','valuationBasis',worksheet.base.valuationBasis,current.valuationBasis,edited.draft.valuationBasis),
      rows:edited.draft.rows.map(row=>({rowId:row.rowId,...Object.fromEntries(QBO_WORKSHEET_FIELDS.map(field=>
        [field,merge(row.rowId,field,base.get(row.rowId)[field],now.get(row.rowId)[field],row[field])]))}))};
  }
  need([...chosen.keys()].every(id=>used.has(id)),'QBO_WORKSHEET_RESOLUTIONS_CHANGED',
    'The conflict set changed. Inspect the current draft and choose its conflict resolutions again.',409);
  const unresolved=conflicts.filter(row=>!row.choice).length,readyToAdopt=Boolean(candidate&&!unresolved);
  const changedRows=new Set(changes.filter(row=>row.value!==row.current).map(row=>row.rowId));
  const selection=candidate??current,draftIssues=candidate?decisionProblems(candidate,rows,context.companySnapshot,context):[];
  const body={schema:QBO_WORKSHEET_PREVIEW_SCHEMA,worksheetId:worksheet.id,worksheetSha256:worksheet.integrity.sha256,
    binding,csv:{sha256:edited.parsed.sha256,bytes:edited.parsed.bytes},currentDraftSha256:digest(current),
    resolutions:[...chosen].sort(([a],[b])=>a.localeCompare(b)).map(([id,choice])=>({id,choice})),
    summary:{allocations:rows.length,included:selection.rows.filter(row=>row.decision==='include').length,
      excluded:selection.rows.filter(row=>row.decision==='exclude').length,pending:selection.rows.filter(row=>row.decision==='pending').length,
      changedRows:changedRows.size,changedFields:changes.filter(row=>row.value!==row.current).length,
      conflicts:conflicts.length,unresolved,sourceIssues:edited.issues.length},
    readyToAdopt,readyForPlan:readyToAdopt&&!draftIssues.length,sourceIssues:edited.issues,changes,conflicts,
    draftIssues,candidate};
  return seal(body);
}
/** Convert reviewed draft choices to the existing compiler's row input, unchanged in meaning. */
export function qboWorksheetSelections(draft){
  fields(draft,['valuationBasis','rows'],'worksheet draft');
  need(Array.isArray(draft.rows),'QBO_WORKSHEET_COVERAGE','Keep all original allocation decisions.');
  return {valuationBasis:string(draft.valuationBasis,'valuationBasis').trim(),rows:draft.rows.map(row=>{
    fields(row,['rowId',...QBO_WORKSHEET_FIELDS],'allocation decision');
    for(const key of QBO_WORKSHEET_FIELDS)string(row[key],key);
    need(SHA.test(row.rowId??'')&&['include','exclude'].includes(row.decision),'QBO_WORKSHEET_DECISION',
      'Finish every pending decision before preparing the native journal.');
    if(row.decision==='exclude')return {rowId:row.rowId,decision:'exclude',reason:row.reason.trim()};
    return {rowId:row.rowId,decision:'include',amount:row.amount.trim(),
      debitAccount:{value:row.debitAccountId.trim()},creditAccount:{value:row.creditAccountId.trim()},
      valuationNote:row.valuationNote.trim(),description:row.description.trim()};
  })};
}
