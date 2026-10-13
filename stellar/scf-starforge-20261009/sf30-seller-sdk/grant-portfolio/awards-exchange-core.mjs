// MIT. Shared application exchange rules for the native client and browser.
// Hashes are computed by the caller with its native SHA-256 implementation.
const GRANT_PORTFOLIO_MAX_ACTION_BYTES=1024*1024;
const utf8=text=>new TextEncoder().encode(text);
const SCHEMA='stellar-forge.awards-csv-import-plan.v1';
const UUID=/^[0-9a-f]{8}-[0-9a-f]{4}-4[0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/;
const OPERATION=/^[A-Za-z0-9][A-Za-z0-9._:-]{0,159}$/;
const HASH=/^[0-9a-f]{64}$/;
const plain=value=>value!==null&&typeof value==='object'&&!Array.isArray(value);
const need=(condition,message)=>{if(!condition)throw Object.assign(new Error(message),{code:'GRANT_AWARDS_EXCHANGE'});};
const exact=(value,keys,required=[])=>need(plain(value)&&Object.keys(value).every(k=>keys.includes(k))&&required.every(k=>Object.hasOwn(value,k)),
  'Use the declared complete exchange fields.');
const id=value=>{need(typeof value==='string'&&UUID.test(value),'Use a supplied stable record UUID.');return value;};
export function originalAwardCsvBytes(value){
  need(value instanceof Uint8Array&&value.byteLength>0&&value.byteLength<=8*1024*1024,
    'Select the complete application CSV, from one byte to 8 MiB.');
  return new Uint8Array(value);
}
/** RFC 4180 quoting, exact string cells, UTF-8 text and explicit header identities. */
export function parseAwardCsvText(input){
  need(typeof input==='string'&&!input.includes('\0'),'Use complete CSV text without NUL characters.');
  const text=input.charCodeAt(0)===0xfeff?input.slice(1):input;
  let field='',row=[],quoted=false,closed=false;const rows=[];
  const cell=()=>{row.push(field);field='';closed=false;need(row.length<=1000,'The original CSV exceeds 1,000 columns.');};
  const line=()=>{cell();rows.push(row);row=[];need(rows.length<=2001,'One original import supports at most 2,000 application rows.');};
  for(let i=0;i<text.length;i++){
    const c=text[i];
    if(quoted){
      if(c==='"'){if(text[i+1]==='"'){field+='"';i++;}else{quoted=false;closed=true;}}
      else field+=c;
      continue;
    }
    if(c===','){cell();continue;}
    if(c==='\r'||c==='\n'){line();if(c==='\r'&&text[i+1]==='\n')i++;continue;}
    need(!closed,'Unexpected data after a complete quoted CSV cell.');
    if(c==='"'){need(field==='','A quote inside a CSV cell must use complete CSV quoting.');quoted=true;}
    else field+=c;
  }
  need(!quoted,'The original CSV ends inside a quoted cell.');
  if(field!==''||row.length||closed)line();
  need(rows.length>1,'Supply one header row and at least one complete application.');
  const headers=rows.shift();
  need(headers.every(h=>h.trim())&&new Set(headers).size===headers.length,'CSV headers must be nonempty and distinct.');
  need(rows.every(r=>r.length===headers.length),'Every original CSV record must have exactly the declared columns.');
  return {headers,rows:rows.map(values=>Object.fromEntries(headers.map((key,i)=>[key,values[i]])))};
}
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
export function prepareAwardCsvImportStructure(portfolio,input,sourceSha256){
  need(HASH.test(sourceSha256||''),'Supply the computed SHA-256 of the complete original CSV bytes.');
  exact(input,['operationId','csv','filename','documentId','roundId','actor','mapping','identities','status'],
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
  const documentId=id(input.documentId),parsed=csvInput(input.csv),hash=sourceSha256;
  const map=input.mapping;
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
  const current=portfolio.definition.awards.records.applications,seen=new Set(),ids=new Set(),changes=[];
  for(const original of parsed.rows){
    const reference=original[map.reference];need(reference.trim()&&!seen.has(reference),'CSV application references must be nonempty and distinct.');
    seen.add(reference);const ident=lookup('applications',reference);need(!ids.has(ident),'Different applications cannot share one record identity.');ids.add(ident);
    const partnerId=lookup('partners',original[map.partnerKey]);programmeRecord(portfolio,'partners',partnerId);
    const projectId=map.projectKey&&original[map.projectKey]?lookup('projects',original[map.projectKey]):null;
    if(projectId)need(programmeRecord(portfolio,'nodes',projectId).kind==='project','Select the actual applicant project.');
    const before=current.find(r=>r.id===ident);
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
      evidenceIds:[...new Set([...(before?.evidenceIds||[]),documentId])],supersedesId:before?.supersedesId||null};
    changes.push({collection:'applications',id:ident,expectedRevision:before?.revision||0,fields});
  }
  const descriptor={sha256:hash,bytes:parsed.bytes.length,filename:input.filename,contentType:'text/csv'};
  const document=portfolio.definition.programme.records.documents.find(r=>r.id===documentId);
  need(!document||!document.archived&&document.nodeId===round.programmeNodeId&&document.object&&
    Object.keys(descriptor).every(k=>document.object[k]===descriptor[k]),'The selected original import document ID has different bytes or programme scope.');
  const mappingEvidence={schema:SCHEMA,operationId:input.operationId,roundId:round.id,roundRevision:round.revision,
    roundSha256:round.sha256,columns:map,rows:parsed.rows.length,source:{sha256:hash,bytes:parsed.bytes.length,filename:input.filename}};
  const mappingText=JSON.stringify(mappingEvidence,null,2);
  need(mappingText.length<=16000,'The complete column mapping must fit the original programme document content field.');
  need(!document||document.content===mappingText,'Reuse the exact original import plan, or choose a new document ID for a new mapping operation.');
  const {name,notes,sources,review}=portfolio.definition;
  const payload={id:portfolio.id,expectedPortfolioRevision:portfolio.revision,name,notes,sources,review,
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
  return {schema:SCHEMA,portfolio:{id:portfolio.id,revision:portfolio.revision,snapshot:portfolio.snapshot},
    source:descriptor,documentId,round:{id:round.id,revision:round.revision,sha256:round.sha256},
    rows:parsed.rows.length,mapping:map,action};
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
