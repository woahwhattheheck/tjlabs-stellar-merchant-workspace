// MIT. Customer-owned source selection; the existing provider validators remain authoritative.
import {resolve,dirname,join} from 'node:path';
import {fileURLToPath} from 'node:url';
import {validateCrossrefEdition} from '../crossref.mjs';
import {validateCrossrefDocumentEdition} from '../crossref-documents.mjs';
import {inspectSourceBundle} from '../source-bundles.mjs';
import {validateCustomerChronology} from './chronology.mjs';
import {validateCustomerEuropePmcSelection} from './europe-pmc.mjs';
import {absolute,key,member,need,object,read,checked,parseJson,digest,same,exists} from './retention.mjs';
export const CUSTOMER_PROGRAMME_SCHEMA='sf88.research-customer-programme.v1';
export const IMPLEMENTATION_FILES=Object.freeze(['retention.mjs','selection.mjs','citation.mjs','programme.mjs',
  'europe-pmc.mjs','EUROPE_PMC.md','chronology.mjs','receiving.mjs','receive-customer.py','README.md']);
const nonempty=(value,maximum,code)=>need(typeof value==='string'&&value.trim()&&value.length<=maximum,code);
function unique(rows,field,code){
  need(Array.isArray(rows)&&rows.every(object),'CUSTOMER_SELECTION_ROWS_REQUIRED');
  const values=rows.map(row=>key(row[field]));need(new Set(values).size===values.length,code);return values;
}
export async function readCustomerSelection(file,sha256,{retainedDirectory}={}){
  absolute(file);need(/^[a-f0-9]{64}$/.test(sha256??''),'CUSTOMER_SELECTION_SHA256_REQUIRED');
  if(retainedDirectory)absolute(retainedDirectory);
  const selectedFile=await exists(file)?file:retainedDirectory?join(retainedDirectory,'selection.original.json'):file;
  const bytes=await read(selectedFile,16*1024*1024,sha256),selection=parseJson(bytes);
  need(object(selection)&&selection.schema===CUSTOMER_PROGRAMME_SCHEMA,'CUSTOMER_SELECTION_SCHEMA_INVALID');
  key(selection.operation_id);nonempty(selection.customer_label,240,'CUSTOMER_LABEL_REQUIRED');
  nonempty(selection.reviewer,200,'CUSTOMER_REVIEWER_REQUIRED');
  const dossier=selection.dossier;
  need(object(dossier)&&['create','existing'].includes(dossier.mode),'CUSTOMER_DOSSIER_SELECTION_REQUIRED');
  if(dossier.mode==='create'){
    nonempty(dossier.title,240,'CUSTOMER_DOSSIER_TITLE_REQUIRED');
    need(typeof dossier.description==='string'&&dossier.description.length<=20000,'CUSTOMER_DOSSIER_DESCRIPTION_REQUIRED');
  }else need(/^d_[a-f0-9-]{36}$/.test(dossier.id??'')&&
    Number.isSafeInteger(dossier.expected_revision)&&dossier.expected_revision>=1,'CUSTOMER_EXISTING_DOSSIER_REQUIRED');
  const questionKeys=unique(selection.questions,'key','CUSTOMER_QUESTION_KEY_REPEATED');
  need(questionKeys.length>0&&questionKeys.length<=100,'CUSTOMER_QUESTION_SELECTION_REQUIRED');
  for(const question of selection.questions){
    need((question.id!==undefined)!==(question.text!==undefined),'CUSTOMER_QUESTION_ID_OR_TEXT_REQUIRED');
    if(question.id!==undefined)need(/^q_[a-f0-9-]{36}$/.test(question.id),'CUSTOMER_QUESTION_ID_INVALID');
    else nonempty(question.text,4000,'CUSTOMER_QUESTION_TEXT_REQUIRED');
    need(dossier.mode!=='create'||question.id===undefined,'CUSTOMER_NEW_DOSSIER_EXISTING_QUESTION');
  }
  const documentKeys=unique(selection.documents,'document_key','CUSTOMER_DOCUMENT_KEY_REPEATED');
  need(documentKeys.length>0&&documentKeys.length<=2048,'CUSTOMER_DOCUMENT_SELECTION_REQUIRED');
  const documents=new Map();let originalBytes=0;
  for(const row of selection.documents){
    member(row.filename);need(!row.filename.includes('/'),'CUSTOMER_DOCUMENT_FILENAME_REQUIRED');
    nonempty(row.media_type,240,'CUSTOMER_DOCUMENT_MEDIA_TYPE_REQUIRED');
    need(['native-http-capture','retained-provider-document','customer-supplied-document'].includes(row.source_kind),'CUSTOMER_SOURCE_KIND_REQUIRED');
    need(Object.hasOwn(row,'provenance')&&(row.provenance===null||object(row.provenance))&&Object.hasOwn(row,'license'),'CUSTOMER_ORIGINAL_PROVENANCE_REQUIRED');
    need(row.source_url===null||typeof row.source_url==='string','CUSTOMER_SOURCE_URL_REQUIRED');
    need(typeof row.file==='string'&&row.file,'CUSTOMER_DOCUMENT_FILE_REQUIRED');
    const selectedFile=row.file.startsWith('/')?absolute(row.file):resolve(dirname(file),member(row.file));
    const retainedFile=retainedDirectory?join(retainedDirectory,'original',key(row.document_key),row.filename):null;
    const actualFile=retainedFile&&await exists(retainedFile)?retainedFile:selectedFile;
    const original=await checked({file:actualFile,bytes:row.bytes,sha256:row.sha256},64*1024*1024);
    originalBytes+=original.length;documents.set(row.document_key,{...row,file:actualFile,selectedFile,original});
  }
  const importKeys=unique(selection.imports,'key','CUSTOMER_IMPORT_KEY_REPEATED');
  need(importKeys.length>0,'CUSTOMER_SOURCE_IMPORT_REQUIRED');
  for(const row of selection.imports){
    need(documents.has(row.document_key)&&questionKeys.includes(row.question_key),'CUSTOMER_IMPORT_BINDING_INVALID');
    need(['crossref','crossref-document','source-bundle'].includes(row.provider),'CUSTOMER_IMPORT_PROVIDER_INVALID');
    nonempty(row.label,240,'CUSTOMER_IMPORT_LABEL_REQUIRED');
    need(typeof row.source_reference==='string'&&row.source_reference.length<=4000,'CUSTOMER_SOURCE_REFERENCE_REQUIRED');
    const doc=documents.get(row.document_key);
    if(row.provider==='source-bundle')need(inspectSourceBundle(doc.original).preview.label===row.label,'CUSTOMER_SOURCE_BUNDLE_LABEL_CHANGED');
    else{
      const edition=parseJson(doc.original);
      need(edition.provider===row.provider,'CUSTOMER_PROVIDER_SELECTION_CHANGED');
      row.provider==='crossref'?validateCrossrefEdition(edition):validateCrossrefDocumentEdition(edition);
    }
  }
  unique(selection.occurrences,'key','CUSTOMER_OCCURRENCE_KEY_REPEATED');
  for(const row of selection.occurrences){
    need(importKeys.includes(row.import_key)&&typeof row.source_key==='string'&&row.source_key.length>0,'CUSTOMER_OCCURRENCE_BINDING_INVALID');
    nonempty(row.citation_locator,4000,'CUSTOMER_CITATION_LOCATOR_REQUIRED');
  }
  unique(selection.findings,'key','CUSTOMER_FINDING_KEY_REPEATED');
  for(const row of selection.findings){
    need((row.native_id!==undefined)!==(row.import_key!==undefined),'CUSTOMER_FINDING_BINDING_REQUIRED');
    if(row.native_id!==undefined)need(/^f_[a-f0-9-]{36}$/.test(row.native_id),'CUSTOMER_FINDING_ID_INVALID');
    else need(importKeys.includes(row.import_key)&&typeof row.source_key==='string'&&row.source_key,'CUSTOMER_FINDING_BINDING_INVALID');
  }
  unique(selection.reviews,'key','CUSTOMER_REVIEW_KEY_REPEATED');
  need(selection.reviews.length>0,'CUSTOMER_EXPLICIT_CITATION_REVIEW_REQUIRED');
  const requests=new Set();
  for(const row of selection.reviews){
    need(/^[A-Za-z0-9_-]{8,100}$/.test(row.request_id??'')&&!requests.has(row.request_id),'CUSTOMER_REVIEW_REQUEST_ID_INVALID');
    requests.add(row.request_id);need(row.actor===selection.reviewer,'CUSTOMER_REVIEW_ACTOR_CHANGED');
    need(object(row.notice)&&((typeof row.notice.id==='string')!==Object.hasOwn(row.notice,'notice_doi')),'CUSTOMER_NOTICE_SELECTION_REQUIRED');
    if(row.notice.id!==undefined)need(/^cu_[a-f0-9]{64}$/.test(row.notice.id),'CUSTOMER_NOTICE_ID_INVALID');
    else for(const field of ['notice_doi','target_doi','type'])nonempty(row.notice[field],1000,'CUSTOMER_NOTICE_SELECTION_REQUIRED');
    need(['retain','revise','exclude','follow-up'].includes(row.decision),'CUSTOMER_REVIEW_DECISION_REQUIRED');
    nonempty(row.reason,20000,'CUSTOMER_REVIEW_REASON_REQUIRED');
    need(['evidence_changes','finding_changes','finding_dispositions'].every(field=>Array.isArray(row[field])),
      'CUSTOMER_REVIEW_CHANGES_REQUIRED');
  }
  need(object(selection.chronology)&&documents.has(selection.chronology.document_key)&&
    questionKeys.includes(selection.chronology.question_key),'CUSTOMER_CHRONOLOGY_SELECTION_REQUIRED');
  const chronologyDocument=documents.get(selection.chronology.document_key);
  const chronologyInput=parseJson(chronologyDocument.original);
  need(Array.isArray(chronologyInput.documents),'CUSTOMER_CHRONOLOGY_DOCUMENT_SELECTION_REQUIRED');
  const chronologyKeys=new Set(chronologyInput.documents.map(row=>row.document_key));
  const chronologyAuthority=selection.documents.filter(row=>row.document_key!==selection.chronology.document_key&&chronologyKeys.has(row.document_key))
    .map(({file,...metadata})=>metadata);
  const chronology=validateCustomerChronology(chronologyInput,{documents:chronologyAuthority});
  need(object(selection.analyst)&&selection.analyst.enabled===true&&selection.analyst.workbook===true,
    'CUSTOMER_COMPLETE_ANALYST_SELECTION_REQUIRED');
  need(object(selection.europe_pmc)&&selection.europe_pmc.schema==='sf88.research-customer-europe-pmc.v1',
    'CUSTOMER_EUROPE_PMC_SELECTION_REQUIRED');
  const europePmcSelection=JSON.parse(JSON.stringify(selection.europe_pmc));
  for(const operation of europePmcSelection.operations??[]){
    if(operation.import){
      const selected=operation.import;
      need(typeof selected.file==='string','CUSTOMER_EPMC_DOCUMENT_REQUIRED');
      selected.file=selected.file.startsWith('/')?absolute(selected.file):resolve(dirname(file),member(selected.file));
      const document=[...documents.values()].find(row=>row.selectedFile===selected.file&&row.bytes===selected.bytes&&row.sha256===selected.sha256);
      need(document,'CUSTOMER_EPMC_SOURCE_NOT_IN_ORIGINAL_DOCUMENT_SELECTION');
      selected.file=document.file;
    }
    for(const receipt of operation.receives??[])need(questionKeys.includes(receipt.question),'CUSTOMER_EPMC_QUESTION_NOT_SELECTED');
  }
  validateCustomerEuropePmcSelection(europePmcSelection);
  need(object(selection.output)&&key(selection.output.filename_stem)&&
    Number.isSafeInteger(selection.output.maximum_archive_bytes)&&selection.output.maximum_archive_bytes>0&&
    selection.output.maximum_archive_bytes<=256*1024*1024,'CUSTOMER_COMPLETE_OUTPUT_SELECTION_REQUIRED');
  need(object(selection.volume)&&Number.isSafeInteger(selection.volume.original_document_bytes)&&
    selection.volume.original_document_bytes===originalBytes&&selection.volume.occurrences===selection.occurrences.length&&
    selection.volume.selected_questions===selection.questions.length&&selection.volume.selected_reviews===selection.reviews.length,
    'CUSTOMER_MEASURED_SELECTION_CHANGED');
  return {selection,bytes,sha256:digest(bytes),documents,chronology,europePmcSelection,originalBytes};
}
export async function readEngineSelection({root,manifestFile,manifestSha256}){
  absolute(root);absolute(manifestFile);need(/^[a-f0-9]{64}$/.test(manifestSha256??''),'CUSTOMER_ENGINE_MANIFEST_SHA256_REQUIRED');
  const bytes=await read(manifestFile,8*1024*1024,manifestSha256),manifest=parseJson(bytes);
  need(manifest.schema==='sf88-research-ris-engine-source-v1'&&Array.isArray(manifest.files)&&
    manifest.sourceFiles===manifest.files.length&&manifest.sourceFiles>0&&
    typeof manifest.repository==='string'&&typeof manifest.ref==='string','CUSTOMER_ORIGINAL_ENGINE_MANIFEST_REQUIRED');
  const files=[],seen=new Set();let total=0;
  for(const row of manifest.files){
    member(row.path);need(!seen.has(row.path)&&['100644','100755'].includes(row.mode),'CUSTOMER_ENGINE_MEMBERSHIP_CHANGED');
    seen.add(row.path);const file=join(root,...row.path.split('/'));
    await checked({file,bytes:row.bytes,sha256:row.sha256});
    total+=row.bytes;files.push({...row,file});
  }
  need(total===manifest.sourceBytes,'CUSTOMER_ENGINE_TOTAL_CHANGED');
  const p='stellar/scf-starforge-20261009/sf88-operator-buyer-cli/';
  for(const name of ['research-dossiers/server.mjs','research-dossiers/dossier.mjs','research-dossiers/workspace-client.mjs',
    'research-dossiers/citation-updates.mjs','research-dossiers/europe-pmc-workspace.mjs',
    'python/examples/research_citation_analyst.py','python/stellar_forge_buyer/research_citation_analysis.py'])
    need(seen.has(p+name),'CUSTOMER_ORIGINAL_ENGINE_INCOMPLETE');
  need([...seen].some(name=>/(^|\/)LICENSE(?:[.]|$)/i.test(name)),'CUSTOMER_ENGINE_LICENSE_MISSING');
  const implementationRoot=dirname(fileURLToPath(import.meta.url)),implementation=[];
  for(const name of IMPLEMENTATION_FILES){
    const file=join(implementationRoot,name),body=await read(file);
    implementation.push({path:p+'research-dossiers/customer-programme/'+name,file,bytes:body.length,sha256:digest(body),mode:'100644'});
  }
  return {manifest,manifestBytes:bytes,manifestSha256:digest(bytes),root,files,implementation};
}
