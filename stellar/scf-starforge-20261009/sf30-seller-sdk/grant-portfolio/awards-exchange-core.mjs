// MIT. Shared application exchange rules for the native client and browser.
// Hashes are computed by the caller with its native SHA-256 implementation.
import {materializeAwardCsvRowReview,encodeAwardCsvRowReview} from './awards-import-row-review.mjs';
import {sha256Bytes} from './awards-import-hash.mjs';
const GRANT_PORTFOLIO_MAX_ACTION_BYTES=1024*1024;
import {originalAwardCsvBytes,parseAwardCsvText,AWARD_CSV_MAX_SOURCE_BYTES,AWARD_CSV_MAX_ROWS} from './awards-csv-source.mjs';
export {originalAwardCsvBytes,parseAwardCsvText,AWARD_CSV_MAX_SOURCE_BYTES,AWARD_CSV_MAX_ROWS};
const utf8=text=>new TextEncoder().encode(text);
const SCHEMA='stellar-forge.awards-csv-import-plan.v1';
const REVIEWED_SCHEMA='stellar-forge.awards-csv-import-plan.v2';
const canonical=value=>Array.isArray(value)?value.map(canonical):value!==null&&typeof value==='object'?
  Object.fromEntries(Object.keys(value).sort().map(key=>[key,canonical(value[key])])):value;
const same=(left,right)=>JSON.stringify(canonical(left))===JSON.stringify(canonical(right));
const UUID=/^[0-9a-f]{8}-[0-9a-f]{4}-4[0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/;
const OPERATION=/^[A-Za-z0-9][A-Za-z0-9._:-]{0,159}$/;
const HASH=/^[0-9a-f]{64}$/;
const plain=value=>value!==null&&typeof value==='object'&&!Array.isArray(value);
const need=(condition,message)=>{if(!condition)throw Object.assign(new Error(message),{code:'GRANT_AWARDS_EXCHANGE'});};
const exact=(value,keys,required=[])=>need(plain(value)&&Object.keys(value).every(k=>keys.includes(k))&&required.every(k=>Object.hasOwn(value,k)),
  'Use the declared complete exchange fields.');
const id=value=>{need(typeof value==='string'&&UUID.test(value),'Use a supplied stable record UUID.');return value;};
function csvInput(value){
  const bytes=originalAwardCsvBytes(value);let text;
  try{text=new TextDecoder('utf-8',{fatal:true}).decode(bytes);}
  catch{throw new Error('The complete original CSV must use UTF-8.');}
  return {bytes,...parseAwardCsvText(text)};
}
function programmeRecord(portfolio,name,ident){
  const row=portfolio.definition.programme.records[name].find(r=>r.id===ident);
  need(row&&!row.archived,'Choose the original active programme '+name+' record.');return row;
}
/**
 * Prepare a reviewable complete saved action. All IDs and column meanings come
 * from the caller; this function does not allocate identities or submit work.
 */
function prepareStructure(portfolio,input,sourceSha256,cache){
  need(HASH.test(sourceSha256||''),'Supply the computed SHA-256 of the complete original CSV bytes.');
  exact(input,['operationId','csv','filename','documentId','roundId','actor','mapping','identities','status','rowIndexes','rowReview','reviewDocumentId'],
    ['operationId','csv','filename','documentId','roundId','actor','mapping','identities']);
  need(plain(portfolio?.definition?.programme)&&Number.isSafeInteger(portfolio.revision)&&portfolio.revision>0,
    'Open the exact original programme portfolio revision.');
  need(typeof input.actor==='string'&&input.actor.trim()&&input.actor.length<=240,'Supply the actual recording actor.');
  need(typeof input.operationId==='string'&&OPERATION.test(input.operationId),'Retain one original import operation ID.');
  need(typeof input.filename==='string'&&/^[A-Za-z0-9][A-Za-z0-9._-]{0,199}$/.test(input.filename),
    'Use an original CSV filename made of letters, numbers, dots, dashes and underscores.');
  const status=input.status??'draft';need(['draft','submitted'].includes(status),'Select imported draft or actual submitted applications.');
  const round=portfolio.definition.awards?.records.rounds.find(r=>r.id===id(input.roundId));
  need(round&&!round.archived&&['published','closed'].includes(round.status)&&round.publication,'Select the original published funding round.');
  const documentId=id(input.documentId),originalParsed=cache?.parsed??csvInput(input.csv),hash=sourceSha256;
  const review=input.rowReview?(cache?.reviewSource??canonical(input.rowReview)):null,reviewed=review?(cache?.reviewed??materializeAwardCsvRowReview(review,input.csv)):null;
  const parsed=reviewed?{...originalParsed,rows:reviewed.rows}:originalParsed;
  const reviewDocumentId=review?id(input.reviewDocumentId):null;
  need(review||input.reviewDocumentId===undefined,'A review evidence document requires the complete row review.');
  if(review){
    need(reviewDocumentId!==documentId,'Use distinct original CSV mapping and row-review document identities.');
    need(review.portfolio.id===portfolio.id&&same(review.round,{id:round.id,revision:round.revision,sha256:round.sha256}),
      'The row review belongs to a different portfolio or published funding round.');
    need(review.source.sha256===hash&&review.source.bytes===originalParsed.bytes.length&&review.source.filename===input.filename&&
      review.actor===input.actor&&review.status===status&&same(review.mapping,input.mapping)&&
      same(review.identities.partners,input.identities.partners)&&same(review.identities.projects??{},input.identities.projects??{}),
      'Keep the exact original row review, source, mapping, actor and programme identity selection.');
  }
  const map=review?canonical(input.mapping):input.mapping;
  exact(map,['reference','title','legalName','partnerKey','projectKey','profile','amount','currency','answers','notes','submittedDate'],
    ['reference','title','legalName','partnerKey','answers']);
  exact(map.profile??{},['organisationIdentifier','contactName','contactEmail','country','summary']);
  need(plain(map.answers),'Map answer columns to the actual published criterion keys.');
  const criterionKeys=new Set(round.criteria.map(c=>c.id));
  need(Object.keys(map.answers).every(key=>criterionKeys.has(key)),'An answer mapping names a criterion outside the published round.');
  const columns=[map.reference,map.title,map.legalName,map.partnerKey,map.projectKey,map.amount,map.currency,map.notes,map.submittedDate,
    ...Object.values(map.profile??{}),...Object.values(map.answers)].filter(v=>v!==undefined);
  need(columns.every(v=>typeof v==='string'&&parsed.headers.includes(v)),'Every mapped field must select an exact original CSV header.');
  need((map.amount===undefined)===(map.currency===undefined),'Map both original amount and currency columns together.');
  need(status!=='submitted'||map.submittedDate!==undefined,'Map the actual submission date before importing submitted applications.');
  exact(input.identities,['applications','partners','projects'],['applications','partners']);
  need(plain(input.identities.applications)&&plain(input.identities.partners)&&
    (input.identities.projects===undefined||plain(input.identities.projects)),'Supply explicit stable application and programme identity maps.');
  const lookup=(group,key)=>{need(Object.hasOwn(input.identities[group]??{},key),'No selected '+group+' identity for '+key);return id(input.identities[group][key]);};
  const accepted=reviewed?.acceptedRowIndexes??null,acceptedSet=accepted?new Set(accepted):null;
  const applicationFor=(index,reference)=>reviewed?id(reviewed.applicationIds[index]):lookup('applications',reference);
  const selected=input.rowIndexes??accepted??undefined;
  need(selected===undefined||Array.isArray(selected)&&(selected.length>0||reviewed&&accepted.length===0)&&selected.length<=parsed.rows.length&&
    selected.every((index,position)=>Number.isSafeInteger(index)&&index>=0&&index<parsed.rows.length&&
      (position===0||selected[position-1]<index)&&(!acceptedSet||acceptedSet.has(index))),
    'Review nonempty, distinct CSV data-row indexes in their original increasing order (zero based).');
  need((selected?.length??parsed.rows.length)<=2000,
    'Review the complete source through explicit batches of at most 2,000 applications.');
  const seen=new Set(),ids=new Set(),changes=[];
  if(!cache?.referencesValidated){
    for(const rowIndex of accepted??Array.from({length:parsed.rows.length},(_,i)=>i)){
      const original=parsed.rows[rowIndex],reference=original[map.reference];
      need(parsed.rows.length<=2000||reference===reference.trim(),
        'A large-source reference contains surrounding whitespace. Correct the original explicitly; references are never silently trimmed.');
      need(reference.trim()&&!seen.has(reference),'CSV application references must be nonempty and distinct.');
      seen.add(reference);const ident=applicationFor(rowIndex,reference);
      need(!ids.has(ident),'Different applications cannot share one record identity.');ids.add(ident);
    }
    if(cache)cache.referencesValidated=true;
  }
  const current=cache?.applications??new Map(portfolio.definition.awards.records.applications.map(r=>[r.id,r]));
  const programmes=cache?.programmes??Object.fromEntries(['partners','nodes','documents'].map(name=>[name,
    new Map(portfolio.definition.programme.records[name].map(r=>[r.id,r]))]));
  const selectedProgramme=(name,ident)=>{
    const row=programmes[name].get(ident);
    need(row&&!row.archived,'Choose the original active programme '+name+' record.');return row;
  };
  const indexes=selected??Array.from({length:parsed.rows.length},(_,i)=>i);
  for(const rowIndex of indexes){
    const original=parsed.rows[rowIndex],reference=original[map.reference],ident=applicationFor(rowIndex,reference);
    const partnerId=lookup('partners',original[map.partnerKey]);selectedProgramme('partners',partnerId);
    const projectId=map.projectKey&&original[map.projectKey]?lookup('projects',original[map.projectKey]):null;
    if(projectId)need(selectedProgramme('nodes',projectId).kind==='project','Select the actual applicant project.');
    const before=current.get(ident);
    need(!before||!before.archived&&before.status==='draft'&&before.roundId===round.id&&before.reference===reference,
      'An import can create an application or update its exact original draft. Recorded editions use a following record.');
    const applicantProfile={legalName:original[map.legalName],summary:''};
    for(const [key,column]of Object.entries(map.profile??{}))applicantProfile[key]=original[column]||null;
    if(applicantProfile.summary===null)applicantProfile.summary='';
    let requestedAmount=null;
    if(map.amount!==undefined){
      const amount=original[map.amount],currency=original[map.currency];
      need((amount==='')===(currency===''),'Each requested amount must retain both its original value and currency.');
      if(amount!==''){need(/^[A-Z]{3}$/.test(currency),'Keep each requested amount in its original uppercase three-letter currency.');
        requestedAmount={value:amount,currency};}
    }
    const fields={roundId:round.id,partnerId,projectId,reference,title:original[map.title],applicantProfile,
      answers:Object.entries(map.answers).map(([criterionId,column])=>({criterionId,response:original[column]})),
      requestedAmount,submittedDate:map.submittedDate&&original[map.submittedDate]||null,status,
      notes:map.notes?original[map.notes]:'',sourceRefs:before?.sourceRefs||[],
      evidenceIds:[...new Set([...(before?.evidenceIds||[]),documentId,...(review?[reviewDocumentId]:[])])],supersedesId:before?.supersedesId||null};
    changes.push({collection:'applications',id:ident,expectedRevision:before?.revision||0,fields});
  }
  const descriptor={sha256:hash,bytes:parsed.bytes.length,filename:input.filename,contentType:'text/csv'};
  const document=programmes.documents.get(documentId);
  need(!document||!document.archived&&document.nodeId===round.programmeNodeId&&document.object&&
    Object.keys(descriptor).every(k=>document.object[k]===descriptor[k]),'The selected original import document ID has different bytes or programme scope.');
  const mappingEvidence={schema:review?REVIEWED_SCHEMA:SCHEMA,operationId:input.operationId,roundId:round.id,roundRevision:round.revision,
    roundSha256:round.sha256,columns:map,rows:parsed.rows.length,source:{sha256:hash,bytes:parsed.bytes.length,filename:input.filename},
    ...(review?{rowReview:{schema:review.schema,reviewId:review.reviewId,sha256:review.sha256,documentId:reviewDocumentId,counts:review.counts}}:{}),
    ...(selected===undefined?{}:parsed.rows.length<=2000?{selectedRowIndexes:[...selected],selectedRows:changes.length}:
      {rowSelectionSchema:'stellar-forge.csv-row-ranges.v1',selectedRowRanges:awardCsvRowRanges(selected),selectedRows:changes.length})};
  const mappingText=JSON.stringify(mappingEvidence,null,2);
  need(mappingText.length<=16000,'The complete column mapping must fit the original programme document content field.');
  need(!document||document.content===mappingText,'Reuse the exact original import plan, or choose a new document ID for a new mapping operation.');
  const definition=portfolio.definition;
  const {name,notes,sources}=definition;
  let reviewEvidence=cache?.reviewEvidence??null;
  if(review&&!reviewEvidence){
    const bytes=encodeAwardCsvRowReview(review);
    reviewEvidence={object:{sha256:sha256Bytes(bytes),bytes:bytes.length,
      filename:'Award_Row_Review_'+review.reviewId+'.json',contentType:'application/json'},
      content:JSON.stringify({schema:review.schema,reviewId:review.reviewId,sha256:review.sha256,
        source:review.source,round:review.round,counts:review.counts},null,2)};
    if(cache)cache.reviewEvidence=reviewEvidence;
  }
  const reviewObject=review?{...reviewEvidence.object}:null,reviewContent=review?reviewEvidence.content:null;
  const retainedReview=review?programmes.documents.get(reviewDocumentId):null;
  need(!retainedReview||!retainedReview.archived&&retainedReview.nodeId===round.programmeNodeId&&
    same(retainedReview.object,reviewObject)&&retainedReview.content===reviewContent,
    'The selected row-review document already retains another review or programme scope.');
  const payload={id:portfolio.id,expectedPortfolioRevision:portfolio.revision,name,notes,sources,review:definition.review,
    ...(document?{}:{programme:{schema:'stellar-forge.grant-programme.v1',
      expectedProgrammeRevision:portfolio.definition.programme.revision,actor:input.actor,changes:[{collection:'documents',id:documentId,
        expectedRevision:0,fields:{nodeId:round.programmeNodeId,title:'Original applications · '+input.filename,
          category:'other',owner:input.actor,status:'current',object:descriptor,
          description:'Complete original application CSV and the explicit published-round column mapping.',content:mappingText}}]}}),
    awards:{schema:'stellar-forge.grant-awards.v1',expectedAwardsRevision:portfolio.definition.awards.revision,
      actor:input.actor,changes}};
  const action={operationId:input.operationId,action:'portfolio.save',payload};
  need(utf8(JSON.stringify(action)).byteLength<=GRANT_PORTFOLIO_MAX_ACTION_BYTES,
    'The complete mapped action exceeds the original request limit. Prepare separate explicit import operations with retained source evidence.');
  if(review){
    const programmeChanges=payload.programme?.changes??[];
    if(!retainedReview)programmeChanges.push({collection:'documents',id:reviewDocumentId,expectedRevision:0,
      fields:{nodeId:round.programmeNodeId,title:'Reviewed original rows · '+input.filename,category:'other',owner:input.actor,status:'current',
        object:reviewObject,description:'Every original source row, explicit disposition and reason, and literal working corrections.',content:reviewContent}});
    if(programmeChanges.length)payload.programme={schema:'stellar-forge.grant-programme.v1',
      expectedProgrammeRevision:portfolio.definition.programme.revision,actor:input.actor,changes:programmeChanges};
    if(!changes.length)delete payload.awards;
    need(utf8(JSON.stringify(action)).byteLength<=GRANT_PORTFOLIO_MAX_ACTION_BYTES,
      'The complete mapped action exceeds the original request limit. Prepare separate explicit import operations with retained source evidence.');
  }
  return {schema:review?REVIEWED_SCHEMA:SCHEMA,portfolio:{id:portfolio.id,revision:portfolio.revision,snapshot:portfolio.snapshot},
    source:descriptor,documentId,round:{id:round.id,revision:round.revision,sha256:round.sha256},
    rows:changes.length,mapping:JSON.parse(JSON.stringify(map)),...(selected===undefined?{}:{sourceRows:parsed.rows.length,rowIndexes:[...selected]}),
    ...(review?{rowReview:{sha256:review.sha256,documentId:reviewDocumentId,object:reviewObject,counts:{...review.counts}}}:{}),action};
}
/** Exact half-open data-row ranges. The full source and saved plan keep every row. */
export function awardCsvRowRanges(indexes){
  const ranges=[];
  for(const index of indexes){
    const previous=ranges[ranges.length-1];
    if(previous&&previous[1]===index)previous[1]=index+1;else ranges.push([index,index+1]);
  }
  return ranges;
}
/** A detached, synchronous planning scope parses and indexes one full source once.
 * Every plan still validates its exact supplied operation, row selection and basis. */
export function createAwardCsvImportPlanner(portfolio,input,sourceSha256){
  const basis=JSON.parse(JSON.stringify(portfolio)),csv=originalAwardCsvBytes(input.csv);
  const {csv:ignored,...fields}=input,common=JSON.parse(JSON.stringify(fields));
  const cache={parsed:csvInput(csv),reviewSource:common.rowReview?canonical(common.rowReview):null,
    reviewed:common.rowReview?materializeAwardCsvRowReview(common.rowReview,csv):null,reviewEvidence:null,
    applications:new Map(basis.definition.awards.records.applications.map(r=>[r.id,r])),
    programmes:Object.fromEntries(['partners','nodes','documents'].map(name=>[name,
      new Map(basis.definition.programme.records[name].map(r=>[r.id,r]))])),referencesValidated:false};
  return Object.freeze({rows:cache.parsed.rows.length,headers:Object.freeze([...cache.parsed.headers]),
    ...(cache.reviewed?{acceptedRowIndexes:Object.freeze([...cache.reviewed.acceptedRowIndexes])}:{}),
    plan(selection={}){
      exact(selection,['operationId','documentId','rowIndexes']);
      return prepareStructure(basis,{...common,...selection,csv},sourceSha256,cache);
    }});
}
export function prepareAwardCsvImportStructure(portfolio,input,sourceSha256){
  return prepareStructure(portfolio,input,sourceSha256);
}
function csvCell(value,spreadsheetSafe){
  let text=value===null||value===undefined?'':String(value);
  if(spreadsheetSafe&&/^[\t\r\n ]*[=+\-@]/.test(text))text="'"+text;
  return '"'+text.replace(/"/g,'""')+'"';
}
/** Structured exchange is separate from the original complete workspace handoff. */
export function encodeAwardApplications(portfolio,{roundId,format='json',spreadsheetSafe=true}={}){
  need(plain(portfolio?.definition?.awards),'Select an original awards portfolio revision.');
  const model=portfolio.definition.awards;
  if(roundId!==undefined)need(model.records.rounds.some(r=>r.id===id(roundId)),'Select an original funding round.');
  const rounds=model.records.rounds.filter(r=>!roundId||r.id===roundId);
  const applications=model.records.applications.filter(r=>!roundId||r.roundId===roundId);
  const selection={portfolioId:portfolio.id,revision:portfolio.revision,snapshot:portfolio.snapshot,awardsRevision:model.revision};
  need(['json','csv'].includes(format),'Select the JSON or CSV exchange format.');
  let body,contentType;
  if(format==='json'){
    body=JSON.stringify({schema:'stellar-forge.awards-application-exchange.v1',...selection,rounds,applications},null,2)+'\n';
    contentType='application/json';
  }else{
    const criteria=[...new Set(rounds.flatMap(r=>r.criteria.map(c=>c.id)))].sort();
    const headers=['recordId','recordRevision','recordSha256','roundId','reference','title','status','archived','partnerId','projectId',
      'legalName','organisationIdentifier','contactName','contactEmail','country','summary','requestedAmount','currency','submittedDate',
      'notes','evidenceIds','supersedesId',...criteria.map(key=>'answer:'+key)];
    const lines=[headers.map(v=>csvCell(v,false)).join(',')];
    for(const row of applications){
      const answers=Object.fromEntries(row.answers.map(a=>[a.criterionId,a.response])),profile=row.applicantProfile;
      const values=[row.id,row.revision,row.sha256,row.roundId,row.reference,row.title,row.status,row.archived,row.partnerId,row.projectId,
        profile.legalName,profile.organisationIdentifier,profile.contactName,profile.contactEmail,profile.country,profile.summary,
        row.requestedAmount?.value,row.requestedAmount?.currency,row.submittedDate,row.notes,JSON.stringify(row.evidenceIds),row.supersedesId,
        ...criteria.map(key=>answers[key]??'')];
      lines.push(values.map(v=>csvCell(v,spreadsheetSafe)).join(','));
    }
    body=lines.join('\r\n')+'\r\n';contentType='text/csv';
  }
  const bytes=utf8(body);
  return {schema:'stellar-forge.awards-exchange-file.v1',...selection,format,contentType,
    spreadsheetSafe:format==='csv'?spreadsheetSafe:false,rows:applications.length,bytes};
}
