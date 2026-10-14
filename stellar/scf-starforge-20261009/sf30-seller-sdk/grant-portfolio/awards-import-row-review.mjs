// MIT. Complete original-row decisions for reviewed application CSV intake.
// Original CSV parsing is shared with the reviewed planner through one parser leaf.
import {parseAwardCsvText,originalAwardCsvBytes} from './awards-csv-source.mjs';
import {sha256Bytes,sha256Text} from './awards-import-hash.mjs';

export const AWARD_CSV_ROW_REVIEW_SCHEMA='stellar-forge.awards-csv-row-review.v1';
export const AWARD_CSV_ROW_REVIEW_MAX_BYTES=32*1024*1024;
const UUID=/^[0-9a-f]{8}-[0-9a-f]{4}-4[0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/;
const HASH=/^[0-9a-f]{64}$/;
const DISPOSITIONS=new Set(['accepted','exception','non_application']);
const utf8=value=>new TextEncoder().encode(value);
const plain=value=>value!==null&&typeof value==='object'&&!Array.isArray(value);
const clone=value=>JSON.parse(JSON.stringify(value));
const canonical=value=>Array.isArray(value)?value.map(canonical):plain(value)?
  Object.fromEntries(Object.keys(value).sort().map(key=>[key,canonical(value[key])])):value;
const same=(a,b)=>JSON.stringify(canonical(a))===JSON.stringify(canonical(b));
function need(ok,message,details){
  if(!ok)throw Object.assign(new Error(message),{code:'GRANT_AWARDS_ROW_REVIEW',...(details?{details}:{})});
}
function exact(value,keys,required=keys){
  need(plain(value)&&Object.keys(value).every(key=>keys.includes(key))&&
    required.every(key=>Object.hasOwn(value,key)),'Use the complete declared row-review fields.');
}
function uuid(value,label){need(typeof value==='string'&&UUID.test(value),'Supply the stable '+label+' UUID.');return value;}
function digest(value){return sha256Text(JSON.stringify(canonical(value)));}
function freeze(value){
  if(value&&typeof value==='object'&&!Object.isFrozen(value)){
    for(const item of Object.values(value))freeze(item);
    Object.freeze(value);
  }
  return value;
}
function seal(value){return freeze({...value,sha256:digest(value)});}
function checkSize(review){
  need(utf8(JSON.stringify(canonical(review))+'\n').length<=AWARD_CSV_ROW_REVIEW_MAX_BYTES,
    'Keep the complete row review within 32 MiB; retain the original CSV separately.');
}
function original(csv,descriptor){
  const bytes=originalAwardCsvBytes(csv);
  if(descriptor)need(bytes.length===descriptor.bytes&&sha256Bytes(bytes)===descriptor.sha256,
    'Select the same complete original CSV for this row review.');
  let text;
  try{text=new TextDecoder('utf-8',{fatal:true}).decode(bytes);}
  catch{throw Object.assign(new Error('The complete original CSV must use UTF-8.'),{code:'GRANT_AWARDS_ROW_REVIEW'});}
  return {bytes,...parseAwardCsvText(text)};
}
function originalRowSha256(headers,row){
  return digest({headers,values:headers.map(header=>row[header])});
}
function mapping(value,headers,round,status){
  exact(value,['reference','title','legalName','partnerKey','projectKey','profile','amount','currency',
    'answers','notes','submittedDate'],['reference','title','legalName','partnerKey','answers']);
  exact(value.profile??{},['organisationIdentifier','contactName','contactEmail','country','summary'],[]);
  need(plain(value.answers),'Map answer columns to actual published criterion identifiers.');
  const columns=[value.reference,value.title,value.legalName,value.partnerKey,value.projectKey,value.amount,
    value.currency,value.notes,value.submittedDate,...Object.values(value.profile??{}),...Object.values(value.answers)]
    .filter(item=>item!==undefined);
  need(columns.every(column=>typeof column==='string'&&headers.includes(column)),
    'Every selected field must name an exact original CSV header.');
  need((value.amount===undefined)===(value.currency===undefined),'Map requested amount and currency together.');
  need(status!=='submitted'||value.submittedDate!==undefined,'Map the actual submission date for submitted applications.');
  if(round){
    const criteria=new Set(round.criteria.map(item=>item.id));
    need(Object.keys(value.answers).every(key=>criteria.has(key)),
      'An answer mapping names a criterion outside the published funding round.');
  }
  return canonical(clone(value));
}
function identityMaps(value){
  exact(value,['partners','projects','applications'],['partners']);
  const result={partners:{},projects:{},applications:{}};
  for(const name of Object.keys(result)){
    need(plain(value[name]??{}),'Supply declared programme and application identity maps.');
    result[name]=Object.fromEntries(Object.entries(value[name]??{}).map(([key,value])=>[key,uuid(value,name+' record')]));
  }
  return canonical(result);
}
function basis(portfolio,roundId){
  need(plain(portfolio)&&plain(portfolio.definition?.programme)&&plain(portfolio.definition?.awards),
    'Open the complete original programme and awards portfolio.');
  uuid(portfolio.id,'portfolio');
  need(Number.isSafeInteger(portfolio.revision)&&portfolio.revision>0&&HASH.test(portfolio.snapshot??''),
    'Select the exact original saved portfolio revision and snapshot.');
  const round=portfolio.definition.awards.records.rounds.find(item=>item.id===uuid(roundId,'funding round'));
  need(round&&!round.archived&&['published','closed'].includes(round.status)&&round.publication,
    'Select the original published funding round.');
  need(Number.isSafeInteger(round.revision)&&round.revision>0&&HASH.test(round.sha256??''),
    'Keep the complete original published-round identity.');
  return round;
}
function suppliedDecision(value,index,headers,originalRow,map,identities){
  exact(value,['rowIndex','disposition','reason','applicationId','corrections'],
    ['rowIndex','disposition','reason']);
  need(value.rowIndex===index,'Provide exactly one decision per original row, in original index order.',
    {rowIndex:index});
  need(DISPOSITIONS.has(value.disposition),'Choose accepted, exception or non_application.',{rowIndex:index});
  need(typeof value.reason==='string'&&value.reason.length<=4000&&
    (value.disposition==='accepted'||Boolean(value.reason.trim())),
    'Retain a reason for every exception or non-application row.',{rowIndex:index});
  need(plain(value.corrections??{}),'Corrections must map exact original headers to literal strings.',{rowIndex:index});
  for(const [header,cellValue]of Object.entries(value.corrections??{})){
    need(headers.includes(header)&&typeof cellValue==='string'&&!cellValue.includes('\0'),
      'A correction must preserve a literal string under its exact original header.',{rowIndex:index,header});
  }
  const corrections=canonical(clone(value.corrections??{}));
  need(Object.keys(corrections).length===0||Boolean(value.reason.trim()),
    'Retain the reason for explicit corrections to an original row.',{rowIndex:index});
  const effective=Object.fromEntries(headers.map(header=>[header,
    Object.hasOwn(corrections,header)?corrections[header]:originalRow[header]]));
  let applicationId=null;
  if(value.disposition==='accepted'){
    const reference=effective[map.reference];
    need(typeof reference==='string'&&pythonStrip(reference)&&reference===pythonStrip(reference),
      'An accepted reference must be nonempty and free of surrounding whitespace; retain an explicit correction.',
      {rowIndex:index,header:map.reference});
    applicationId=uuid(value.applicationId??identities.applications[reference],'accepted application');
    need(!Object.hasOwn(identities.applications,reference)||identities.applications[reference]===applicationId,
      'The accepted row and supplied application identity map disagree.',{rowIndex:index});
  }else{
    need(value.applicationId===undefined||value.applicationId===null,
      'Retained exceptions and non-application rows do not create application records.',{rowIndex:index});
  }
  return {decision:{rowIndex:index,originalRowSha256:originalRowSha256(headers,originalRow),
    disposition:value.disposition,reason:value.reason,applicationId,corrections},effective};
}
function acceptedIdentities(rows,effective,map){
  const references=new Map(),ids=new Map();
  for(const row of rows){
    if(row.disposition!=='accepted')continue;
    const reference=effective[row.rowIndex][map.reference];
    need(!references.has(reference),'Accepted application references must be distinct after explicit corrections.',
      {rowIndex:row.rowIndex,otherRowIndex:references.get(reference),header:map.reference});
    need(!ids.has(row.applicationId),'Distinct accepted rows must retain distinct application UUIDs.',
      {rowIndex:row.rowIndex,otherRowIndex:ids.get(row.applicationId)});
    references.set(reference,row.rowIndex);ids.set(row.applicationId,row.rowIndex);
  }
}
// Match the retained Python model's codepoint lengths and whitespace rules.
// These checks inspect effective working values; original cells remain untouched.
const codepoints=value=>Array.from(value).length;
const pythonStrip=value=>value.replace(/^[\u0009-\u000d\u001c-\u0020\u0085\u00a0\u1680\u2000-\u200a\u2028\u2029\u202f\u205f\u3000]+|[\u0009-\u000d\u001c-\u0020\u0085\u00a0\u1680\u2000-\u200a\u2028\u2029\u202f\u205f\u3000]+$/gu,'');
function checkedText(value,maximum,empty,rowIndex,header){
  need(typeof value==='string'&&codepoints(value)<=maximum&&(empty||Boolean(pythonStrip(value))),
    'The accepted '+header+' must contain '+(empty?'0':'1')+'–'+maximum+' characters.',
    {rowIndex,header});
}
function calendarDate(value,rowIndex,header){
  const match=/^(\d{4})-(\d{2})-(\d{2})$/.exec(value);
  need(match,'Use a complete ISO calendar date in the accepted row.',{rowIndex,header});
  const year=Number(match[1]),month=Number(match[2]),day=Number(match[3]);
  const leap=year%4===0&&(year%100!==0||year%400===0);
  const days=[31,leap?29:28,31,30,31,30,31,31,30,31,30,31];
  need(year>=1&&month>=1&&month<=12&&day>=1&&day<=days[month-1],
    'The accepted submission date must be an actual calendar date.',{rowIndex,header});
}
function decimalDigit(character){
  if(character>='0'&&character<='9')return character;
  if(!/\p{Decimal_Number}/u.test(character))return character;
  // Unicode Nd sets run in ordered decimal groups; adjacent mathematical sets
  // may be contiguous, so modulo ten preserves each group's digit value.
  const point=character.codePointAt(0);let start=point;
  while(start>0&&/\p{Decimal_Number}/u.test(String.fromCodePoint(start-1)))start--;
  return String((point-start)%10);
}
function finiteDecimal(value,rowIndex,header){
  need(typeof value==='string'&&codepoints(value)<=128,
    'Keep the accepted amount as its original decimal string, up to 128 characters.',{rowIndex,header});
  const numeric=Array.from(pythonStrip(value).replace(/_/g,'')).map(decimalDigit).join('');
  const match=/^[+-]?(?:(\d+)(?:\.(\d*))?|\.(\d+))(?:[eE]([+-]?\d+))?$/.exec(numeric);
  need(match,'Use a finite original decimal amount in the accepted row.',{rowIndex,header});
  const fraction=match[2]??match[3]??'',digits=((match[1]??'')+fraction).replace(/^0+/,'')||'0';
  need(!(numeric.startsWith('-')&&/[1-9]/.test((match[1]??'')+(match[2]??match[3]??''))),
    'Use a nonnegative requested amount in the accepted row.',{rowIndex,header});
  const exponent=BigInt(match[4]??'0')-BigInt(fraction.length),adjusted=exponent+BigInt(digits.length-1);
  need(exponent>=-999999n&&exponent<=999999n&&adjusted>=-999999n&&adjusted<=999999n,
    'The accepted amount exceeds the supported decimal exponent range [-999999, 999999].',
    {rowIndex,header});
}
function acceptedFields(rows,effective,map,status,round){
  for(const decision of rows){
    if(decision.disposition!=='accepted')continue;
    const rowIndex=decision.rowIndex,values=effective[rowIndex];
    for(const header of [map.reference,map.title,map.legalName])checkedText(values[header],240,false,rowIndex,header);
    for(const [field,header]of Object.entries(map.profile??{})){
      const value=values[header];
      if(field==='summary'){checkedText(value,16000,true,rowIndex,header);continue;}
      if(value==='')continue; // The original CSV planner represents this as null.
      checkedText(value,field==='contactEmail'?254:240,false,rowIndex,header);
      if(field==='contactEmail')need(/^[^\u0009-\u000d\u001c-\u0020\u0085\u00a0\u1680\u2000-\u200a\u2028\u2029\u202f\u205f\u3000@]+@[^\u0009-\u000d\u001c-\u0020\u0085\u00a0\u1680\u2000-\u200a\u2028\u2029\u202f\u205f\u3000@]+\.[^\u0009-\u000d\u001c-\u0020\u0085\u00a0\u1680\u2000-\u200a\u2028\u2029\u202f\u205f\u3000@]+$/u.test(pythonStrip(value)),
        'Use a complete contact email in the accepted row.',{rowIndex,header});
    }
    if(map.notes!==undefined)checkedText(values[map.notes],16000,true,rowIndex,map.notes);
    for(const header of Object.values(map.answers))checkedText(values[header],16000,true,rowIndex,header);
    if(map.amount!==undefined){
      const amount=values[map.amount],currency=values[map.currency];
      need((amount==='')===(currency===''),'Keep requested amount and currency together.',{rowIndex,header:map.amount});
      if(amount!==''){
        finiteDecimal(amount,rowIndex,map.amount);
        need(/^[A-Z]{3}$/.test(currency),'Use the original uppercase three-letter currency.',
          {rowIndex,header:map.currency});
      }
    }
    if(map.submittedDate!==undefined&&values[map.submittedDate]!=='')
      calendarDate(values[map.submittedDate],rowIndex,map.submittedDate);
    if(status==='submitted'){
      need(map.submittedDate!==undefined&&Boolean(values[map.submittedDate]),
        'A submitted application needs its actual submission date.',{rowIndex,header:map.submittedDate});
      if(round)for(const criterion of round.criteria){
        if(!criterion.required)continue;
        const header=map.answers[criterion.id];
        need(Object.hasOwn(map.answers,criterion.id)&&Boolean(pythonStrip(values[header])),
          'Retain a nonempty answer for each required published criterion.',
          {rowIndex,header:header??null,criterionId:criterion.id});
      }
    }
  }
}
function programmeIdentities(portfolio,rows,effective,map,identities,round){
  const records=portfolio.definition.programme.records;
  const partners=new Map(records.partners.map(item=>[item.id,item]));
  const nodes=new Map(records.nodes.map(item=>[item.id,item]));
  for(const row of rows){
    if(row.disposition!=='accepted')continue;
    const values=effective[row.rowIndex],partnerKey=values[map.partnerKey];
    need(Object.hasOwn(identities.partners,partnerKey),'Select one actual partner for each accepted row.',
      {rowIndex:row.rowIndex,header:map.partnerKey});
    const partner=partners.get(identities.partners[partnerKey]);
    need(partner&&!partner.archived,'Choose an active original programme partner.',{rowIndex:row.rowIndex});
    if(map.projectKey&&values[map.projectKey]){
      const key=values[map.projectKey];
      need(Object.hasOwn(identities.projects,key),'Select one actual project for each accepted project key.',
        {rowIndex:row.rowIndex,header:map.projectKey});
      const project=nodes.get(identities.projects[key]);
      need(project&&!project.archived&&project.kind==='project',
        'Choose an active original programme project.',{rowIndex:row.rowIndex});
      const ancestors=new Set();let cursor=project.id;
      while(cursor!==null&&cursor!==undefined&&!ancestors.has(cursor)){
        ancestors.add(cursor);const node=nodes.get(cursor);
        need(node,'The selected project ancestry is incomplete.',{rowIndex:row.rowIndex});
        cursor=node.parentId;
      }
      need(ancestors.has(round.programmeNodeId),
        'The accepted project must belong to the published round programme scope.',{rowIndex:row.rowIndex});
    }
  }
}
function counts(rows){
  return {total:rows.length,accepted:rows.filter(row=>row.disposition==='accepted').length,
    exception:rows.filter(row=>row.disposition==='exception').length,
    non_application:rows.filter(row=>row.disposition==='non_application').length};
}
function filename(value){
  need(typeof value==='string'&&/^[A-Za-z0-9][A-Za-z0-9._-]{0,199}$/.test(value),
    'Use a retained CSV filename made of letters, numbers, dots, dashes and underscores.');
  return value;
}
/** Prepare a complete operator review. No application is written or uploaded.
 * All original rows receive a disposition; corrections are separate from source.
 */
export function prepareAwardCsvRowReview(portfolio,input){
  exact(input,['reviewId','filename','roundId','actor','status','mapping','identities','csv','decisions',
    'previousReviewSha256'],['reviewId','filename','roundId','actor','mapping','identities','csv','decisions']);
  const round=basis(portfolio,input.roundId),parsed=original(input.csv);
  const status=input.status??'draft';
  need(['draft','submitted'].includes(status),'Choose draft or submitted application status.');
  need(typeof input.actor==='string'&&input.actor.trim()&&input.actor.length<=240,
    'Supply the actual row-review actor.');
  const map=mapping(input.mapping,parsed.headers,round,status),identities=identityMaps(input.identities);
  need(Array.isArray(input.decisions)&&input.decisions.length===parsed.rows.length,
    'Account for every original CSV row with an explicit disposition.');
  const prepared=input.decisions.map((value,index)=>suppliedDecision(value,index,parsed.headers,
    parsed.rows[index],map,identities));
  const rows=prepared.map(item=>item.decision),effective=prepared.map(item=>item.effective);
  acceptedIdentities(rows,effective,map);
  acceptedFields(rows,effective,map,status,round);
  programmeIdentities(portfolio,rows,effective,map,identities,round);
  if(input.previousReviewSha256!==undefined)need(HASH.test(input.previousReviewSha256),
    'Retain the exact preceding review digest for a deliberate successor review.');
  const review=seal({schema:AWARD_CSV_ROW_REVIEW_SCHEMA,reviewId:uuid(input.reviewId,'row-review'),
    source:{sha256:sha256Bytes(parsed.bytes),bytes:parsed.bytes.length,filename:filename(input.filename)},
    portfolio:{id:portfolio.id,revision:portfolio.revision,snapshot:portfolio.snapshot},
    round:{id:round.id,revision:round.revision,sha256:round.sha256},
    actor:input.actor,status,mapping:map,identities,rows,counts:counts(rows),
    ...(input.previousReviewSha256===undefined?{}:{previousReviewSha256:input.previousReviewSha256})});
  checkSize(review);
  return review;
}
function sealedReview(review){
  exact(review,['schema','reviewId','source','portfolio','round','actor','status','mapping','identities',
    'rows','counts','previousReviewSha256','sha256'],
    ['schema','reviewId','source','portfolio','round','actor','status','mapping','identities','rows','counts','sha256']);
  need(review.schema===AWARD_CSV_ROW_REVIEW_SCHEMA&&HASH.test(review.sha256??''),
    'Open the complete sealed row review.');
  uuid(review.reviewId,'row-review');
  exact(review.source,['sha256','bytes','filename']);
  need(HASH.test(review.source.sha256??'')&&Number.isSafeInteger(review.source.bytes)&&review.source.bytes>0,
    'Keep the complete original CSV identity.');
  filename(review.source.filename);
  exact(review.portfolio,['id','revision','snapshot']);
  uuid(review.portfolio.id,'portfolio');
  need(Number.isSafeInteger(review.portfolio.revision)&&review.portfolio.revision>0&&HASH.test(review.portfolio.snapshot??''),
    'Keep the exact original portfolio identity.');
  exact(review.round,['id','revision','sha256']);uuid(review.round.id,'funding round');
  need(Number.isSafeInteger(review.round.revision)&&review.round.revision>0&&HASH.test(review.round.sha256??''),
    'Keep the exact original round identity.');
  need(typeof review.actor==='string'&&review.actor.trim()&&review.actor.length<=240,
    'Keep the actual row-review actor.');
  need(['draft','submitted'].includes(review.status),'Keep the selected application status.');
  if(review.previousReviewSha256!==undefined)need(HASH.test(review.previousReviewSha256),
    'Keep the preceding review digest.');
  const {sha256,...body}=review;
  need(digest(body)===sha256,'The saved row review has changed. Prepare an explicit successor review.');
  checkSize(review);
}
/** Exact portable JSON bytes used by the native programme-document attachment. */
export function encodeAwardCsvRowReview(review){
  sealedReview(review);
  return utf8(JSON.stringify(canonical(review))+'\n');
}
/** Validate source and every original row; derive detached effective working cells.
 * This does not require the current portfolio to equal the initial saved basis.
 */
export function materializeAwardCsvRowReview(review,csv){
  sealedReview(review);
  const parsed=original(csv,review.source),map=mapping(review.mapping,parsed.headers,null,review.status);
  const identities=identityMaps(review.identities);
  need(Array.isArray(review.rows)&&review.rows.length===parsed.rows.length,
    'The review must retain every original CSV row.');
  const rows=[],decisions=[],applicationIds=Object.create(null),acceptedRowIndexes=[];
  for(const [index,row]of review.rows.entries()){
    exact(row,['rowIndex','originalRowSha256','disposition','reason','applicationId','corrections']);
    need(HASH.test(row.originalRowSha256??'')&&row.originalRowSha256===originalRowSha256(parsed.headers,parsed.rows[index]),
      'An original row differs from its retained row identity.',{rowIndex:index});
    const {originalRowSha256:ignored,...input}=row;
    const prepared=suppliedDecision(input,index,parsed.headers,parsed.rows[index],map,identities);
    need(same(prepared.decision,row),'Keep the complete normalized original row decision.',{rowIndex:index});
    rows.push(prepared.effective);decisions.push(prepared.decision);
    if(row.disposition==='accepted'){acceptedRowIndexes.push(index);applicationIds[index]=row.applicationId;}
  }
  acceptedIdentities(decisions,rows,map);
  acceptedFields(decisions,rows,map,review.status,null);
  exact(review.counts,['total','accepted','exception','non_application']);
  need(same(counts(decisions),review.counts),'The complete disposition counts differ.');
  return {headers:[...parsed.headers],rows,acceptedRowIndexes,applicationIds};
}
/** Rebuild against the exact retained historical basis before native dispatch. */
export function verifyAwardCsvRowReview(portfolio,review,csv){
  sealedReview(review);
  need(same({id:portfolio?.id,revision:portfolio?.revision,snapshot:portfolio?.snapshot},review.portfolio),
    'Open the exact original portfolio revision selected by this review.');
  materializeAwardCsvRowReview(review,csv);
  const expected=prepareAwardCsvRowReview(portfolio,{reviewId:review.reviewId,filename:review.source.filename,
    roundId:review.round.id,actor:review.actor,status:review.status,mapping:review.mapping,
    identities:review.identities,csv,decisions:review.rows.map(({originalRowSha256,...decision})=>decision),
    ...(review.previousReviewSha256===undefined?{}:{previousReviewSha256:review.previousReviewSha256})});
  need(same(expected,review),'The saved row review differs from its original source, programme or published round.');
  return expected;
}
