// MIT. Original Research edition commerce through the existing economic workspace.
import { isAbsolute } from 'node:path';
import { key, text, need } from '../../stellar/scf-starforge-20261009/sf30-seller-sdk/fred/research/model.mjs';
import { normalizeResearchMerchantTerms, validateResearchMerchantPlan,
  validateResearchPublicationRecord, validateResearchReceivingRecord } from '../../stellar/scf-starforge-20261009/sf30-seller-sdk/fred/research/commerce-model.mjs';
export const RESEARCH_PACKAGE_MAX_BYTES = 256 * 1024 * 1024;
export const RESEARCH_PACKAGE_REQUEST_BYTES = Math.ceil(RESEARCH_PACKAGE_MAX_BYTES / 3) * 4 + 1024 * 1024;
const HASH = /^[a-f0-9]{64}$/;
const OPERATION = /^[A-Za-z0-9][A-Za-z0-9_-]{0,95}$/;
const plain = v => v !== null && typeof v === 'object' && !Array.isArray(v);
const copy = v => JSON.parse(JSON.stringify(v));
const hash = (v,label) => { need(HASH.test(v ?? ''),'Choose the original '+label+'.'); return v; };
function revision(value) { need(Number.isSafeInteger(value) && value >= 1,'Retain the original project revision.'); return value; }
function destination(value,nullable=false) {
  if(nullable && (value===undefined||value===null))return null;
  need(typeof value==='string' && value.length<=4096 && isAbsolute(value) && !/[\x00-\x1f]/.test(value),
    'Choose an absolute original customer receiving directory.');
  return value;
}
export function researchCommerceInput(value={}) {
  need(plain(value),'Use a complete original Research commerce selection.');
  return copy(value);
}
export function researchCommerceAction(action,value) {
  const input=researchCommerceInput(value);
  need(OPERATION.test(input.id??''),'Keep the original operation ID.');
  revision(input.expectedRevision);
  if(input.resume===true)return {id:input.id,expectedRevision:input.expectedRevision,resume:true};
  if(action==='research-publish') {
    const terms=normalizeResearchMerchantTerms(input);
    return {id:input.id,expectedRevision:input.expectedRevision,productId:key(input.productId),
      editionId:hash(input.editionId,'issued edition'),note:text(input.note??'',12000),...terms};
  }
  need(action==='research-receive','Choose the original Research commerce action.');
  need(typeof input.bodyBase64==='string' && input.bodyBase64.length<=Math.ceil(RESEARCH_PACKAGE_MAX_BYTES/3)*4,
    'Receive the complete original Research package within 256 MiB.');
  const bytes=Buffer.from(input.bodyBase64,'base64');
  need(bytes.length>0 && bytes.length<=RESEARCH_PACKAGE_MAX_BYTES && bytes.toString('base64')===input.bodyBase64,
    'The complete original Research package encoding changed.');
  return {id:input.id,expectedRevision:input.expectedRevision,
    receivingDirectory:destination(input.receivingDirectory),bodyBase64:input.bodyBase64};
}
export function researchCommerceQuery(input) {
  input=researchCommerceInput(input);
  const section=input.section??'publications',offset=input.offset??0,limit=input.limit??20;
  need(['publications','receivings'].includes(section) && Number.isSafeInteger(offset)&&offset>=0 &&
    Number.isSafeInteger(limit)&&limit>=1&&limit<=100,'Choose an original commerce inventory page.');
  if(offset>0)revision(input.expectedRevision);
  const query=new URLSearchParams({section,offset:String(offset),limit:String(limit)});
  if(input.expectedRevision!==undefined)query.set('expectedRevision',String(revision(input.expectedRevision)));
  return query;
}
export function researchCommercePage(value,input,projectId) {
  const query=researchCommerceQuery(input),offset=Number(query.get('offset')),limit=Number(query.get('limit'));
  need(value?.projectId===projectId && value.section===query.get('section') &&
    Number.isSafeInteger(value.revision)&&value.revision>=1 && value.offset===offset && value.limit===limit &&
    Number.isSafeInteger(value.total)&&value.total>=offset && Array.isArray(value.rows) &&
    value.rows.length===Math.min(limit,value.total-offset) &&
    value.nextOffset===(offset+limit<value.total?offset+limit:null),
    'The complete original Research commerce page changed.');
  need(input.expectedRevision===undefined||value.revision===input.expectedRevision,
    'The original economic project changed; reopen the selected commerce inventory.');
  for(const record of value.rows)(value.section==='publications'?validateResearchPublicationRecord:validateResearchReceivingRecord)(record);
  return value;
}
export function researchPublicationSelection(value) {
  const input=researchCommerceInput(value);
  return {...input,publicationId:hash(input.publicationId,'Research publication')};
}
export function researchPublicationView(value,input,projectId) {
  need(value?.projectId===projectId && value.record?.id===input.publicationId,
    'The Research publication belongs to another original project.');
  validateResearchPublicationRecord(value.record);
  validateResearchMerchantPlan(value.plan,{record:value.record});
  need(value.record.sourceProjectId===projectId,'The publication belongs to another economic project.');
  return value;
}
export function researchPurchaseReceivingInput(value) {
  const input=researchPublicationSelection(value);
  need(OPERATION.test(input.intentId??''),'Keep the original paid customer intent.');
  hash(input.expectedPurchaseSha256,'prepared customer purchase identity');
  return {publicationId:input.publicationId,intentId:input.intentId,
    expectedPurchaseSha256:input.expectedPurchaseSha256,receivingDirectory:destination(input.receivingDirectory,true)};
}
export function researchReceivedQuery(value) {
  const input=researchPublicationSelection(value);
  need(OPERATION.test(input.intentId??''),'Choose the original received customer intent.');
  return new URLSearchParams({publication:input.publicationId,intent:input.intentId});
}
export function researchPublicationMember(view,selection) {
  const file=selection.file??'research-package.json.gz';
  const member=view.plan.downloads.find(item=>item.path===file);
  need(member,'Choose an original advertised Research file.');
  return member;
}
export function researchReceivedMember(view,selection) {
  need(view?.kind==='RESEARCH' && Array.isArray(view.files),'Receive the original complete Research purchase first.');
  const file=selection.file??'research-package.json.gz';
  const member=view.files.find(item=>item.path===file);
  need(member && HASH.test(member.sha256??'') && Number.isSafeInteger(member.bytes)&&member.bytes>=0,
    'Choose an original received Research file.');
  if(selection.editionId!==undefined)need(view.edition?.editionId===selection.editionId||view.edition?.id===selection.editionId,
    'The selected received Research edition changed.');
  return member;
}

export function researchCommerceSources(value) {
  const sources=value?.sourceRecords;
  need(Array.isArray(sources) && Number.isSafeInteger(value.edition?.sources) &&
    value.edition.sources>=0 && sources.length===value.edition.sources &&
    new Set(sources.map(source=>source?.id)).size===sources.length &&
    sources.every(source=>plain(source)&&HASH.test(source.id??'')),
    'Retain every original Research source descriptor and its issued-edition count.');
  return sources;
}
