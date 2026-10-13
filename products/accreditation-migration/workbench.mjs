import {WorkbenchError,need,own,plain,clone,canonicalJSON,digest,parseCSV,csvExport,safePath,sha256Utf8,sha256Bytes,bytesFromBase64,base64FromBytes,utf8Bytes,utf8Text,rational,add,sub,mul,div,cmp,exact,decimal,rounded,allocateRounded} from './lib/data.mjs';
export {WorkbenchError,canonicalJSON,digest,parseCSV,csvExport};
export const PROJECT_SCHEMA='tjlabs.accreditation-project.v1';
const now=()=>new Date().toISOString();
const list=x=>Array.isArray(x)?x:[];
const json=(files,path)=>JSON.parse(files[path]);
const raw=(files,path)=>parseCSV(files[path]).rows.map(r=>({...r.raw,_row:r.rowNumber,_line:r.lineNumber}));
const label=(e)=>e.replace(/_/g,' ');
export function definition(p,name) { const e=p.contract.entities.find(x=>x.name===name);need(e,'ENTITY','Unknown entity: '+name);return e; }
export function keyOf(p,entity,row) { return canonicalJSON(definition(p,entity).key.map(k=>{need(row[k]!==null&&row[k]!==undefined&&row[k]!=='','KEY','An original key is missing.',{entity,field:k});return row[k];})); }
export function blankRecord(p,entity) { return Object.fromEntries(definition(p,entity).fields.map(f=>[f.name,f.type==='array'?[]:f.type==='boolean'?false:null])); }
function validDate(value,month=false) {
  if(month)return /^\d{4}-(0[1-9]|1[0-2])$/.test(value);
  if(!/^\d{4}-(0[1-9]|1[0-2])-(0[1-9]|[12]\d|3[01])$/.test(value))return false;
  const d=new Date(value+'T00:00:00Z');return Number.isFinite(d.getTime())&&d.toISOString().slice(0,10)===value;
}
export function validateRecord(p,entity,row) {
  need(plain(row),'RECORD','A record must be a complete object.');const e=definition(p,entity),issues=[];
  const issue=(f,message)=>issues.push({entity,field:f.name,message});
  for(const name of Object.keys(row)) if(!e.fields.some(f=>f.name===name))issues.push({entity,field:name,message:'This field is not in the selected entity contract.'});
  for(const f of e.fields) {
    const v=row[f.name],empty=v===null||v===undefined||v==='';
    if(empty){if(f.required)issue(f,'This source field is required.');continue;}
    let ok=true;
    if(['string','foreign-key','enum','date','month','date-or-month','datetime','uri','relative-path','sha256','decimal-string'].includes(f.type))ok=typeof v==='string';
    if(f.type==='integer')ok=Number.isSafeInteger(v);
    if(f.type==='boolean')ok=typeof v==='boolean';
    if(f.type==='array')ok=Array.isArray(v);
    if(f.type==='object')ok=plain(v);
    if(!ok){issue(f,'Expected '+f.type+'.');continue;}
    if(f.type==='date'&&!validDate(v))issue(f,'Use a real ISO calendar date.');
    if(f.type==='month'&&!validDate(v,true))issue(f,'Use the original YYYY-MM precision.');
    if(f.type==='date-or-month'&&!validDate(v)&&!validDate(v,true))issue(f,'Use YYYY-MM or YYYY-MM-DD, preserving original precision.');
    if(f.type==='datetime'&&(!/^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}(?:\.\d+)?(?:Z|[+-]\d{2}:\d{2})$/.test(v)||!Number.isFinite(Date.parse(v))))issue(f,'Use an ISO timestamp with its timezone.');
    if(f.type==='uri'&&!/^[A-Za-z][A-Za-z0-9+.-]*:/.test(v))issue(f,'Use the original absolute URL or a source URN.');
    if(f.type==='sha256'&&!/^[a-f0-9]{64}$/.test(v))issue(f,'Use the SHA-256 of the complete original bytes.');
    if(f.type==='decimal-string'&&!/^[+-]?\d+(?:\.\d+)?$/.test(v))issue(f,'Retain the exact decimal as a string.');
    if(f.type==='relative-path'){try{safePath(v);}catch(err){issue(f,err.message);}}
    if(f.type==='enum'&&f.meaning.includes(' | ')){const choices=f.meaning.split(' | ');if(choices.every(x=>/^[A-Za-z_]+$/.test(x))&&!choices.includes(v))issue(f,'Select one of: '+choices.join(', '));}
    if(f.type==='string'&&typeof v==='string'){try{sha256Utf8(v);}catch{issue(f,'The source contains invalid Unicode.');}}
  }
  return issues;
}
function record(p,entity,value,provenance) {
  const r={...blankRecord(p,entity),...value},issues=validateRecord(p,entity,r);need(!issues.length,'RECORD_FIELDS','Review the source field values.',{issues});
  const k=keyOf(p,entity,r);need(!p.records[entity].some(x=>keyOf(p,entity,x)===k),'DUPLICATE_KEY','The source contains the same original key twice.',{entity,key:k});
  p.records[entity].push(r);if(provenance)p.provenance[entity][k]=provenance;return r;
}
function sourceFiles(packet) {
  need(packet&&Array.isArray(packet.files),'SOURCE_PACKET','A complete source packet must contain files.');const files=Object.create(null),retained=[];
  for(const f of packet.files) {
    safePath(f.path);need(!own(files,f.path),'SOURCE_PACKET','The packet repeats a file path.',{path:f.path});
    const h=sha256Utf8(f.content);need(h.bytes===f.bytes&&h.sha256===f.sha256,'SOURCE_IDENTITY','The source file differs from its complete manifest.',{path:f.path,actual:h});
    files[f.path]=f.content;retained.push({id:'source-'+h.sha256,path:f.path,content:f.content,bytes:h.bytes,sha256:h.sha256,media_type:f.mime_type||'text/plain',role:f.role||'source',visibility:'internal'});
  }
  return {files,retained};
}
function provenance(file,row,edition,fields) {
  return {source_path:file,source_row:row._row,source_line:row._line,source_edition_id:edition,fields:Object.fromEntries(fields.map(f=>[f,{source_path:file,source_row:row._row,source_edition_id:edition}]))};
}
export function createProject(packet,{projectId='ianz-'+digest(packet).slice(0,20),title='Accreditation migration',createdAt=now()}={}) {
  const {files,retained}=sourceFiles(packet),contract=json(files,'contracts/data-contract.json'),register=json(files,'source-register.json'),target=json(files,'contracts/target-mapping-profile.json');
  need(contract.entities.length===15,'CONTRACT','Receive the complete original 15-entity contract.');
  const p={schema:PROJECT_SCHEMA,project_id:projectId,title,revision:0,created_at:createdAt,updated_at:createdAt,contract,source_register:register,source_files:retained,records:Object.fromEntries(contract.entities.map(e=>[e.name,[]])),provenance:Object.fromEntries(contract.entities.map(e=>[e.name,{}])),assets:[],mapping:target,mapping_history:[],source_reviews:json(files,'data/source-change-review.json').reviews,transition:json(files,'data/transition-profile.json'),fee_controls:json(files,'data/fee-controls.json'),fee_calculations:[],form_register:raw(files,'data/forms-register.csv'),edition_groups:{},runs:[],history:[],receiving_contract:json(files,'contracts/reconciliation-contract.json'),document_contract:json(files,'contracts/document-edition-profile.json')};
  const editions=raw(files,'data/source-editions.csv'),editionBySource=Object.fromEntries(editions.map(e=>[e.source_id,e.edition_key]));
  for(const s of register.sources) {
    const ed=editions.find(e=>e.source_id===s.id),id=ed?.edition_key||s.id+'-observed';
    const previous=ed?editions.filter(e=>e.issuer_programme_id===ed.issuer_programme_id&&e.edition_date<ed.edition_date).sort((a,b)=>b.edition_date.localeCompare(a.edition_date))[0]:null;
    record(p,'source_edition',{source_edition_id:id,source_id:s.id,source_kind:s.kind.includes('indexed')?'indexed_excerpt':s.kind.includes('pdf')?'original_pdf_text':'structured_export',source_url:s.url,retrieved_at:s.retrieved_at,declared_issue:ed?.issue||s.edition||null,declared_date:ed?.edition_date||null,original_filename:s.url.split('/').pop()?.split('?')[0]||null,media_type:s.kind.includes('pdf')?'application/pdf':null,original_sha256:s.original_binary_sha256||null,transcription_sha256:digest(s),coverage:ed?.coverage||('Retained source-register observation: '+s.locator),supersedes_edition_id:previous?.edition_key||null,selected_for_current:ed?ed.current_selection==='true':true,provenance_notes:s.locator});
    if(ed)p.edition_groups[id]=ed.issuer_programme_id;
  }
  const sourceId=s=>editionBySource[s]||s+'-observed';
  for(const r of raw(files,'data/public-programmes.csv'))record(p,'programme',{programme_key:r.programme_key,published_label:r.published_label,navigation_group:r.navigation_group,source_edition_id:sourceId(r.source_id),fee_profile_id:r.programme_key==='drinking-water'?'AS19-2026-07':r.programme_key==='inspection-bodies'?'AS14-2026-07':null},provenance('data/public-programmes.csv',r,sourceId(r.source_id),['programme_key','published_label','navigation_group']));
  for(const r of raw(files,'data/public-accreditations.csv')) {
    const edition=sourceId(r.source_id),account=canonicalJSON(['IANZ',r.issuer_client_number]),facility='published-site:'+r.issuer_programme_id;
    const history=editions.filter(e=>e.issuer_programme_id===r.issuer_programme_id).map(e=>({label:e.published_organisation,source_edition_id:e.edition_key,declared_date:e.edition_date}));
    if(r.published_parent_label)history.push({relationship:'published parent label',label:r.published_parent_label,source_edition_id:edition});
    if(!p.records.issuer_account.some(a=>a.issuer_client_number===r.issuer_client_number))record(p,'issuer_account',{issuer_namespace:'IANZ',issuer_client_number:r.issuer_client_number,display_name:r.published_organisation,source_edition_id:edition,label_history:history,merge_decisions:[],visibility:'public'},provenance('data/public-accreditations.csv',r,edition,['issuer_client_number','display_name']));
    record(p,'facility',{facility_key:facility,issuer_account_key:account,published_label:r.facility_label,address_text:r.facility_label,site_kind:'unresolved',source_edition_id:edition,fee_profile_id:r.programme_key==='inspection-bodies'?'AS14-2026-07':'AS19-2026-07'},provenance('data/public-accreditations.csv',r,edition,['published_label','address_text','issuer_account_key']));
    record(p,'accreditation',{issuer_programme_id:r.issuer_programme_id,issuer_account_key:account,accreditation_number:r.accreditation_number,programme_key:r.programme_key,facility_keys:[facility],initial_accreditation_date:r.initial_accreditation_date,selected_scope_edition_id:edition,standard_edition:r.standard_edition,inspection_classification:r.inspection_type||null,publication_observation:r.publication_observation,expiry_date:r.expiry_date||null,source_edition_id:edition},provenance('data/public-accreditations.csv',r,edition,['issuer_programme_id','accreditation_number','standard_edition','inspection_classification','initial_accreditation_date']));
  }
  for(const r of raw(files,'data/public-scope-items.csv')) {
    const a=p.records.accreditation.find(a=>a.accreditation_number===r.accreditation_number),ed=sourceId(r.source_id);
    record(p,'scope_item',{scope_item_key:r.scope_row_key,accreditation_key:a.issuer_programme_id,source_edition_id:ed,activity:r.activity,classification:r.classification,item_label:r.item,method_reference:r.method_reference||null,conditions:r.qualifier?[r.qualifier]:[],facility_keys:a.facility_keys,source_page:Number(r.source_page),source_locator:'Published scope, page '+r.source_page+'; transcription row '+r._row,coverage:r.coverage},provenance('data/public-scope-items.csv',r,ed,['activity','classification','item_label','method_reference','conditions']));
  }
  const tariffs=raw(files,'data/fee-rates.csv');
  for(const id of [...new Set(tariffs.map(t=>t.profile))]) {
    const rates=tariffs.filter(t=>t.profile===id);
    record(p,'fee_profile',{fee_profile_id:id,source_edition_id:sourceId(rates[0].source_id),programme_key:id.startsWith('AS14')?'inspection-bodies':'drinking-water',currency:'NZD',tax_basis:rates[0].tax_basis,published_period:'2026/27',publication_month:rates[0].publication_month,charge_rules:rates.map(({_row,_line,...t})=>t)});
  }
  p.mapping.source_edition_ids=p.records.source_edition.filter(e=>e.selected_for_current).map(e=>e.source_edition_id);
  p.history.push({revision:0,at:createdAt,action:'create_project',message:'Received all '+retained.length+' complete source files and materialised the published cohort.'});
  return sealProject(p);
}
export function sealProject(p) {const body=clone(p);delete body.integrity;body.integrity={sha256:digest(body)};return body;}
export function reopenProject(content) {
  const p=typeof content==='string'?JSON.parse(content):clone(content);need(p.schema===PROJECT_SCHEMA,'PROJECT','Use a complete accreditation project.');
  const h=p.integrity?.sha256,body=clone(p);delete body.integrity;need(h===digest(body),'PROJECT_IDENTITY','The saved project differs from its retained revision.');
  validateProject(p);return p;
}
export function serializeProject(p){return canonicalJSON(sealProject(p))+'\n';}
export function validateProject(p) {
  const issues=[];
  for(const entity of p.contract.entities){const seen=new Set();for(const r of p.records[entity.name]||[]){issues.push(...validateRecord(p,entity.name,r));const k=keyOf(p,entity.name,r);if(seen.has(k))issues.push({entity:entity.name,key:k,message:'Duplicate original key.'});seen.add(k);}}
  need(!issues.length,'PROJECT_FIELDS','The project contains invalid fields.',{issues});
  for(const f of p.source_files){safePath(f.path);const h=sha256Utf8(f.content);need(h.bytes===f.bytes&&h.sha256===f.sha256,'SOURCE_IDENTITY','Retained source bytes changed.',{path:f.path});}
  for(const a of p.assets){safePath(a.path);const h=sha256Bytes(bytesFromBase64(a.base64));need(h.bytes===a.bytes&&h.sha256===a.sha256,'ASSET_IDENTITY','Retained asset bytes changed.',{path:a.path});}
  return {entities:p.contract.entities.length,fields:p.contract.entities.reduce((n,e)=>n+e.fields.length,0),records:Object.values(p.records).reduce((n,a)=>n+a.length,0),source_files:p.source_files.length,assets:p.assets.length};
}
const RELATIONS={
source_edition:{supersedes_edition_id:'source_edition'},
programme:{source_edition_id:'source_edition',fee_profile_id:'fee_profile'},
issuer_account:{parent_account_key:'issuer_account',source_edition_id:'source_edition'},
facility:{issuer_account_key:'issuer_account',fee_profile_id:'fee_profile',source_edition_id:'source_edition'},
accreditation:{issuer_account_key:'issuer_account',programme_key:'programme',facility_keys:'facility',selected_scope_edition_id:'source_edition',status_decision_id:'issuer_decision',source_edition_id:'source_edition'},
scope_item:{accreditation_key:'accreditation',source_edition_id:'source_edition',facility_keys:'facility',decision_id:'issuer_decision'},
document:{document_edition_id:'source_edition',programme_key:'programme',accreditation_key:'accreditation',assessment_key:'assessment',participant_key:'participant',supersedes:'document'},
assessment:{accreditation_key:'accreditation',lead_assessor_key:'participant',participant_keys:'participant',scope_item_keys:'scope_item',criteria_edition_ids:'source_edition',source_edition_id:'source_edition'},
participant:{organisation_key:'issuer_account',assignment_keys:'assessment',competence_scope_keys:'scope_item',source_edition_id:'source_edition'},
finding:{assessment_key:'assessment',response_document_keys:'document',clearance_decision_id:'issuer_decision',source_edition_id:'source_edition'},
issuer_decision:{accreditation_key:'accreditation',affected_scope_keys:'scope_item',source_document_key:'document',private_reason_document_keys:'document'},
fee_profile:{source_edition_id:'source_edition',programme_key:'programme'},
charge_line:{accreditation_key:'accreditation',assessment_key:'assessment',facility_key:'facility',fee_profile_id:'fee_profile',credit_of_line_key:'charge_line',source_document_key:'document'},
mapping_profile:{source_edition_ids:'source_edition'},
receiving_run:{mapping_id:'mapping_profile',source_edition_ids:'source_edition'}
};
function referencedKey(p,entity,value) {
  const d=definition(p,entity);
  if(typeof value==='string'&&value.startsWith('[')){try{const keys=JSON.parse(value);if(Array.isArray(keys)&&keys.length===d.key.length)return canonicalJSON(keys);}catch{}}
  if(d.key.length===1)return canonicalJSON([value]);
  const found=p.records[entity].filter(r=>r[d.key[0]]===value);return found.length===1?keyOf(p,entity,found[0]):null;
}
export function relationships(p) {
  const rows=[],issues=[],indices=Object.fromEntries(p.contract.entities.map(e=>[e.name,new Set(p.records[e.name].map(r=>keyOf(p,e.name,r)))]));
  for(const [entity,fields] of Object.entries(RELATIONS))for(const row of p.records[entity])for(const [field,target] of Object.entries(fields)) {
    const value=row[field];if(value===null||value===undefined||value==='')continue;
    const values=Array.isArray(value)?value:[value];
    for(const v of values) {
      const key=referencedKey(p,target,v),from=keyOf(p,entity,row);
      if(!key||!indices[target].has(key)){issues.push({entity,key:from,field,target,value:v,message:'Original relationship has no unique received target record.'});continue;}
      rows.push({from_entity:entity,from_external_key:from,field,target_entity:target,target_external_key:key});
    }
  }
  return {rows,issues};
}
function storeMappingRecord(p,at) {
  const m=p.mapping,r={mapping_id:m.mapping_id,version:m.version,source_edition_ids:p.records.source_edition.filter(e=>e.selected_for_current).map(e=>e.source_edition_id),target_product:m.target_product,target_environment_id:m.target_environment_id,target_schema_version:m.target_schema_version||null,field_maps:m.entities.map(e=>({entity:e.canonical_entity,native_table:e.native_table,fields:e.field_overrides})),identity_maps:m.entities.flatMap(e=>e.identity_maps||[]),enum_maps:m.entities.flatMap(e=>e.enum_maps||[]),unit_maps:m.entities.flatMap(e=>e.unit_maps||[]),blank_policies:m.entities.flatMap(e=>(e.field_overrides||[]).map(f=>({entity:e.canonical_entity,field:f.canonical_field,policy:f.blank_policy||'preserve'}))),date_policies:m.entities.flatMap(e=>(e.field_overrides||[]).map(f=>({entity:e.canonical_entity,field:f.canonical_field,policy:f.date_policy||'exact'}))),native_import_profile:m.target_schema?{schema:m.target_schema}:null,review:{at,decisions:m.review?.decisions||[]}};
  record(p,'mapping_profile',r);
}
function changeRecord(p,entity,value,{oldKey,reason,at,provenance:origin}={}) {
  const r={...blankRecord(p,entity),...clone(value)},issues=validateRecord(p,entity,r);need(!issues.length,'RECORD_FIELDS','Review the field values.',{issues});
  const key=keyOf(p,entity,r);if(oldKey)need(oldKey===key,'ORIGINAL_KEY','An existing source key is immutable. Receive the distinct source record and save an explicit identity mapping.');
  const i=p.records[entity].findIndex(x=>keyOf(p,entity,x)===key),before=i<0?null:p.records[entity][i];
  p.history.push({revision:p.revision+1,at,action:'record',entity,key,reason:reason||'Operator correction',before,after:r});
  if(i<0)p.records[entity].push(r);else p.records[entity][i]=r;
  if(origin)p.provenance[entity][key]=origin;return r;
}
export function typedCell(field,value) {
  if(value===null||value===undefined||value==='')return null;
  if(field.type==='integer'){need(/^-?\d+$/.test(String(value))&&Number.isSafeInteger(Number(value)),'INTEGER','The original integer is outside the supported exact range.',{field:field.name,value});return Number(value);}
  if(field.type==='boolean'){need(value===true||value===false||value==='true'||value==='false','BOOLEAN','Use the exact boolean true or false.',{field:field.name});return value===true||value==='true';}
  if(field.type==='array'||field.type==='object'){const parsed=typeof value==='string'?JSON.parse(value):clone(value);need(field.type==='array'?Array.isArray(parsed):plain(parsed),'JSON_FIELD','Use a complete JSON '+field.type+'.',{field:field.name});return parsed;}
  return String(value);
}
export function previewImport(p,input) {
  const e=definition(p,input.entity),parsed=parseCSV(input.content,{delimiter:input.delimiter||','}),maps=input.fields||e.fields.filter(f=>parsed.columns.includes(f.name)).map(f=>({field:f.name,source_column:f.name,blank_policy:'preserve'}));
  need(maps.length>0,'FIELD_MAPPING','Select the original source columns.');
  const rows=[],issues=[],seen=new Set(),edition=input.source_edition_id||'import-'+sha256Utf8(input.content).sha256.slice(0,24);
  for(const source of parsed.rows) {
    const value=blankRecord(p,input.entity),policies={};
    for(const m of maps) {
      const field=e.fields.find(f=>f.name===m.field);need(field,'FIELD_MAPPING','Unknown canonical field.',{field:m.field});
      if(m.source_column)need(parsed.columns.includes(m.source_column),'FIELD_MAPPING','The selected original column is absent.',{column:m.source_column});
      let rawValue=own(m,'constant')?m.constant:source.raw[m.source_column];policies[field.name]=m.blank_policy||'preserve';
      try{value[field.name]=typedCell(field,rawValue);}catch(err){issues.push({row:source.rowNumber,field:field.name,message:err.message});}
    }
    if(e.fields.some(f=>f.name==='source_edition_id')&&!value.source_edition_id)value.source_edition_id=edition;
    let key;try{key=keyOf(p,input.entity,value);}catch(err){issues.push({row:source.rowNumber,message:err.message});continue;}
    const before=p.records[input.entity].find(r=>keyOf(p,input.entity,r)===key);
    for(const field of e.fields) {
      if(value[field.name]===null||value[field.name]==='') {
        if(policies[field.name]==='reject')issues.push({row:source.rowNumber,field:field.name,message:'The selected policy rejects a blank source cell.'});
        if(before&&(policies[field.name]||'preserve')==='preserve')value[field.name]=clone(before[field.name]);
      }
    }
    issues.push(...validateRecord(p,input.entity,value).map(i=>({...i,row:source.rowNumber})));
    if(seen.has(key))issues.push({row:source.rowNumber,key,message:'The original source repeats this key.'});seen.add(key);
    rows.push({key,value,before:before||null,row:source.rowNumber,line:source.lineNumber});
  }
  return {entity:input.entity,source_edition_id:edition,columns:parsed.columns,fields:maps,rows,issues};
}
function retainFile(p,input,at) {
  const h=sha256Utf8(input.content),path=safePath(input.filename),id='source-'+h.sha256;
  if(!p.source_files.some(f=>f.id===id&&f.path===path))p.source_files.push({id,path,content:input.content,...h,media_type:input.media_type||'text/csv',role:'received source',visibility:input.visibility||'internal',received_at:at});
  const edition=input.source_edition_id||'import-'+h.sha256.slice(0,24);
  if(!p.records.source_edition.some(e=>e.source_edition_id===edition))record(p,'source_edition',{source_edition_id:edition,source_id:input.source_id||id,source_kind:'structured_export',source_url:input.source_url||'urn:received:'+encodeURIComponent(path),retrieved_at:at,original_filename:path.split('/').pop(),media_type:input.media_type||'text/csv',original_byte_length:h.bytes,original_sha256:h.sha256,coverage:'Complete received original UTF-8 file',retained_asset_path:'sources/'+h.sha256+'/'+path,selected_for_current:true});
  return edition;
}
export function addDocumentAsset(p,input,at=now()) {
  const bytes=bytesFromBase64(input.base64),h=sha256Bytes(bytes);
  if(input.sha256)need(input.sha256===h.sha256,'ASSET_IDENTITY','The complete received document differs from its supplied hash.');
  if(input.bytes!==undefined)need(input.bytes===h.bytes,'ASSET_IDENTITY','The complete received document differs from its supplied byte count.');
  const name=safePath(input.filename),path='assets/'+h.sha256+'/'+name,edition=input.document_edition_id||'document-'+h.sha256,documentKey=input.document_key||name;
  const a={path,...h,base64:input.base64,media_type:input.media_type||'application/octet-stream',visibility:input.visibility||'client_private',associations:[]};
  if(!p.assets.some(x=>x.path===path))p.assets.push(a);
  if(!p.records.source_edition.some(e=>e.source_edition_id===edition))record(p,'source_edition',{source_edition_id:edition,source_id:input.source_id||documentKey,source_kind:'original_binary',source_url:input.source_url||'urn:received:'+encodeURIComponent(name),retrieved_at:at,declared_issue:input.template_edition||null,original_filename:name,media_type:a.media_type,original_byte_length:h.bytes,original_sha256:h.sha256,coverage:'Complete original file',retained_asset_path:path,selected_for_current:true,supersedes_edition_id:input.supersedes_edition_id||null});
  const originalEdition=p.records.source_edition.find(e=>e.source_edition_id===edition);
  if(originalEdition?.original_sha256!==h.sha256){
    need(!originalEdition.original_sha256,'SOURCE_EDITION_IDENTITY','This source edition already retains different original bytes. Save the received file as its own successor edition.');
    changeRecord(p,'source_edition',{...originalEdition,original_filename:name,media_type:a.media_type,original_byte_length:h.bytes,original_sha256:h.sha256,retained_asset_path:path,coverage:'Complete original file retained. '+(originalEdition.coverage||'')},{reason:'Attach complete original to the selected source edition',at});
  }
  const doc={document_key:documentKey,document_edition_id:edition,document_role:input.document_role||'received document',original_filename:name,display_name:input.display_name||name,content_sha256:h.sha256,asset_path:path,visibility:a.visibility,programme_key:input.programme_key||null,accreditation_key:input.accreditation_key||null,assessment_key:input.assessment_key||null,participant_key:input.participant_key||null,template_id:input.template_id||null,template_edition:input.template_edition||null,content_control_map:input.content_control_map||null,submitted_at:input.submitted_at||null,supersedes:input.supersedes||null};
  changeRecord(p,'document',doc,{reason:'Receive original complete document',at});
  const actual=p.assets.find(x=>x.path===path),association={entity:'document',external_key:canonicalJSON([documentKey,edition]),field:'asset_path'};
  if(!actual.associations.some(x=>canonicalJSON(x)===canonicalJSON(association)))actual.associations.push(association);
  return {asset:actual,document:doc};
}

export function formLocations(map) {
  need(map?.schema==='tjlabs.accreditation-docx-form-map.v1','FORM_MAP','Read this original Word form before selecting its fields.');
  const output=[],seen=new Set(),local=n=>String(n||'').split('}').pop().split(':').pop();
  const push=value=>{if(!value.part||!value.locator)return;const id=canonicalJSON([value.part,value.locator]);if(!seen.has(id)){seen.add(id);output.push({...value,id});}};
  for(const c of map.controls||[])push({part:c.part,locator:c.locator,kind:'control',label:c.alias||c.tag||c.native_id||c.kinds.join(', '),text:c.text||'',choices:(c.choices||[]).map(x=>({value:x.value,label:x.display_text||x.value})),native_kinds:c.kinds||[]});
  for(const f of map.fields||[]){
    const choices=(f.legacy_form?.dropdown?.children||[]).filter(x=>local(x.name)==='listEntry').map(x=>{const value=Object.entries(x.attributes||{}).find(([k])=>local(k)==='val')?.[1];return {value,label:value};}).filter(x=>typeof x.value==='string');
    push({part:f.part,locator:f.locator,kind:'field',label:f.legacy_form?.name||f.instruction||'Original field',text:f.result||'',choices,instruction:f.instruction||'',status:f.status});
  }
  for(const paragraph of map.paragraphs||[]){
    push({part:paragraph.part,locator:paragraph.locator,kind:'paragraph',label:paragraph.text||'Empty original paragraph',text:paragraph.text||'',choices:[],content_control:paragraph.content_control||null});
    for(const run of paragraph.runs||[])push({part:paragraph.part,locator:run.locator,kind:'run',label:run.text||'Empty original run',text:run.text||'',choices:[],paragraph:paragraph.locator});
  }
  return output;
}
export function prepareFormFill(p,input) {
  const document=p.records.document.find(d=>keyOf(p,'document',d)===input.document_key);
  need(document,'DOCUMENT','Select one retained original document edition.');
  const map=document.content_control_map;
  need(map?.original?.sha256===document.content_sha256,'DOCUMENT_IDENTITY','Read the form map for this exact original document.');
  const locations=new Map(formLocations(map).map(x=>[x.id,x])),bindings=[];
  need(Array.isArray(input.bindings)&&input.bindings.length>0,'FORM_BINDINGS','Select at least one original location and its replacement.');
  const changes=input.bindings.map(binding=>{
    const selected=locations.get(canonicalJSON([binding.part,binding.locator]));
    need(selected,'FORM_LOCATION','Select an actual location from this original form.',{part:binding.part,locator:binding.locator});
    let value,origin=null;
    if(binding.source){
      const s=binding.source,entity=definition(p,s.entity);need(entity.fields.some(f=>f.name===s.field),'FORM_SOURCE','Select an existing canonical field.');
      const row=p.records[s.entity].find(r=>keyOf(p,s.entity,r)===s.external_key);
      need(row,'FORM_SOURCE','The selected original source record is absent.',{source:s});
      const original=row[s.field];
      need(original!==null&&original!==undefined||binding.blank_policy==='clear','FORM_SOURCE_EMPTY','This selected source field is empty. Choose an explicit blank value or another field.',{source:s});
      value=original===null||original===undefined?'':typeof original==='string'?original:canonicalJSON(original);
      origin={...clone(s),value:clone(original??null),project_revision:p.revision};
    }else{
      value=binding.mode==='choice'?binding.choice_value:binding.text;
      need(typeof value==='string','FORM_VALUE','Enter the explicit replacement text or choose an original native choice.');
    }
    const change={part:selected.part,locator:selected.locator,expected_text:selected.text};
    if(binding.mode==='choice'){
      need(selected.choices.some(c=>c.value===value),'FORM_CHOICE','Choose one actual original native choice.',{value,choices:selected.choices});change.choice_value=value;
    }else{sha256Utf8(value);change.text=value;}
    bindings.push({part:selected.part,locator:selected.locator,kind:selected.kind,mode:binding.mode==='choice'?'choice':'text',source:origin,literal:origin?null:value,expected_text:selected.text});
    return change;
  });
  const mapping={schema:'tjlabs.accreditation-docx-fill.v1',original_sha256:document.content_sha256,changes},mapping_text=canonicalJSON(mapping)+'\n',identity=sha256Utf8(mapping_text);
  return {id:'fill-'+identity.sha256,project_id:p.project_id,project_revision:p.revision,document_key:input.document_key,original_sha256:document.content_sha256,bindings,mapping,mapping_text,mapping_sha256:identity.sha256,mapping_bytes:identity.bytes};
}
function acceptFormFill(p,action,at) {
  const prepared=action.prepared,result=action.result;
  need(prepared&&prepared.project_id===p.project_id&&typeof prepared.mapping_text==='string','FORM_OPERATION','Receive the saved original form operation.');
  need(sha256Utf8(prepared.mapping_text).sha256===prepared.mapping_sha256&&canonicalJSON(JSON.parse(prepared.mapping_text))===canonicalJSON(prepared.mapping),'FORM_OPERATION','The saved form mapping changed.');
  const original=p.records.document.find(d=>keyOf(p,'document',d)===prepared.document_key);
  need(original?.content_sha256===prepared.original_sha256,'DOCUMENT_IDENTITY','The original template edition changed.');
  need(result?.schema==='tjlabs.accreditation-docx-fill-result.v1'&&result.original?.sha256===original.content_sha256,'DOCUMENT_IDENTITY','The completed document must refer to its retained original template.');
  need(result.mapping_sha256===prepared.mapping_sha256&&canonicalJSON(result.mapping)===canonicalJSON(prepared.mapping),'FORM_OPERATION','The returned document used a different saved mapping.');
  const out=result.output,hash=sha256Bytes(bytesFromBase64(out?.base64));
  need(hash.sha256===out.sha256&&hash.bytes===out.bytes,'DOCUMENT_IDENTITY','The complete filled document differs from its native output identity.');
  need(hash.sha256!==original.content_sha256,'FORM_UNCHANGED','This selected mapping made no document change. Retain the original edition.');
  const received=addDocumentAsset(p,{...original,filename:out.filename,base64:out.base64,bytes:out.bytes,sha256:out.sha256,document_edition_id:'document-'+out.sha256,document_key:original.document_key,display_name:original.display_name+' · filled',document_role:original.document_role,media_type:out.media_type,source_url:'urn:filled:'+prepared.mapping_sha256,source_id:original.document_key,content_control_map:action.map||null,supersedes:prepared.document_key,supersedes_edition_id:original.document_edition_id},at);
  if(action.map)need(action.map.original?.sha256===out.sha256,'DOCUMENT_IDENTITY','The successor form map refers to another file.');
  p.form_fills=p.form_fills||[];
  const operation={...clone(prepared),received_at:at,document:keyOf(p,'document',received.document),result:clone(result)};
  const existing=p.form_fills.find(x=>x.id===operation.id);if(existing)need(existing.result.output.sha256===out.sha256,'FORM_OPERATION','A saved form operation has another output.');else p.form_fills.push(operation);
  return {operation_id:operation.id,document:operation.document,asset:received.asset.path,bytes:out.bytes,sha256:out.sha256,changes:result.changes,counts:result.counts};
}

function bindSchema(p,schema,at) {
  need(schema.schema==='tjlabs.accreditation-native-schema.v1'&&Array.isArray(schema.tables),'TARGET_SCHEMA','Receive the actual complete target schema.');
  const previous=clone(p.mapping),m=clone(previous);p.mapping_history.push(previous);m.version++;m.target_product=schema.target_product;m.target_environment_id=schema.target_environment_id;m.target_schema_version=schema.schema_version||digest(schema);m.target_schema=clone(schema);
  for(const e of m.entities) {
    const table=schema.tables.find(t=>t.entity===e.canonical_entity||t.table===e.native_table);
    e.native_table=table?.table||null;e.native_external_key=table?.external_key_field||null;
    e.field_overrides=definition(p,e.canonical_entity).fields.map(f=>({canonical_field:f.name,native_field:table?.columns.find(c=>c.canonical===f.name||c.name===f.name)?.name||null,blank_policy:'preserve',date_policy:'exact',array_policy:'order'}));
  }
  m.review={...m.review,reviewed_at:at,source_editions:p.records.source_edition.filter(e=>e.selected_for_current).map(e=>e.source_edition_id)};
  p.mapping=m;storeMappingRecord(p,at);
}
function mapValue(value,field) {
  if(value===null||value===undefined)return null;
  let result=clone(value);
  if(field.enum_map&&Object.keys(field.enum_map).length){need(own(field.enum_map,String(result)),'ENUM_MAPPING','Map this exact original enum value.',{field:field.canonical_field,value:result});result=field.enum_map[String(result)];}
  if(field.unit_factor&&field.unit_factor!=='1')result=decimal(mul(result,field.unit_factor));
  if(field.date_policy==='utc'&&result!==null){need(typeof result==='string'&&/(Z|[+-]\d\d:\d\d)$/.test(result),'DATE_MAPPING','UTC conversion requires the original timezone.');result=new Date(result).toISOString();}
  if(field.array_policy==='set'&&Array.isArray(result))result=[...new Map(result.map(v=>[canonicalJSON(v),v])).values()].sort((a,b)=>canonicalJSON(a).localeCompare(canonicalJSON(b)));
  return result;
}
export function allAssets(p) {
  const files=p.source_files.map(f=>({path:'sources/'+f.sha256+'/'+f.path,bytes:f.bytes,sha256:f.sha256,base64:base64FromBytes(utf8Bytes(f.content)),media_type:f.media_type,visibility:f.visibility,role:f.role,associations:p.records.source_edition.filter(e=>e.original_sha256===f.sha256).map(e=>({entity:'source_edition',external_key:canonicalJSON([e.source_edition_id]),field:'retained_asset_path'}))}));
  return [...files,...clone(p.assets)];
}
export function prepareReceiving(p,{requestId,at=now()}={}) {
  validateProject(p);const m=p.mapping;need(m.target_product&&m.target_environment_id&&m.target_schema,'TARGET_MAPPING','Receive the target schema and save its actual field bindings.');
  const links=relationships(p);need(!links.issues.length,'RELATIONSHIPS','Receive or correct the original related records.',{issues:links.issues});
  const previous=[...p.runs].reverse().find(r=>r.result&&r.request.mapping.target_environment_id===m.target_environment_id)?.result;
  const tables=[];
  for(const entity of m.import_order||p.contract.entities.map(e=>e.name)) {
    const e=m.entities.find(e=>e.canonical_entity===entity),native=m.target_schema.tables.find(t=>t.table===e?.native_table);
    need(e&&native&&e.native_external_key,'TARGET_MAPPING','Select a native table and original external key.',{entity});
    const columns=[],used=new Set();
    for(const f of definition(p,entity).fields) {
      const binding=e.field_overrides.find(x=>x.canonical_field===f.name)||{canonical_field:f.name,native_field:f.name};
      need(binding.native_field&&native.columns.some(c=>c.name===binding.native_field),'TARGET_MAPPING','Select an actual native field.',{entity,field:f.name});
      need(!used.has(binding.native_field.toLowerCase()),'TARGET_MAPPING','Two canonical fields cannot write the same native field.',{entity,field:binding.native_field});used.add(binding.native_field.toLowerCase());
      columns.push({canonical:f.name,name:binding.native_field,type:f.type});
    }
    const old=new Map((previous?.tables.find(t=>t.entity===entity)?.records||[]).map(r=>[r.external_key,r]));
    const records=p.records[entity].map(row=>{
      const external_key=keyOf(p,entity,row),prior=old.get(external_key),values=Object.create(null);
      for(const column of columns) {
        const field=e.field_overrides.find(f=>f.canonical_field===column.canonical)||{canonical_field:column.canonical};
        const value=row[column.canonical];
        if(value===null&&field.blank_policy==='reject')throw new WorkbenchError('BLANK_MAPPING','The target policy rejects this source blank.',{entity,field:column.canonical,key:external_key});
        if(value===null&&field.blank_policy==='preserve'&&prior){if(own(prior.values,column.name))values[column.name]=clone(prior.values[column.name]);continue;}
        values[column.name]=mapValue(value,field);
      }
      return {external_key,native_id:prior?.native_id||null,expected_native_version:prior?.native_version??null,values};
    });
    tables.push({entity,table:e.native_table,external_key_field:e.native_external_key,columns,records});
  }
  const request={schema:'tjlabs.accreditation-native-request.v1',request_id:requestId||'receive-'+digest({project:p.project_id,revision:p.revision,mapping:m,tables}).slice(0,32),project_id:p.project_id,project_revision:String(p.revision),mapping:{mapping_id:m.mapping_id,version:m.version,target_product:m.target_product,target_environment_id:m.target_environment_id},tables,relations:links.rows,assets:allAssets(p)};
  need(/^[A-Za-z0-9][A-Za-z0-9_.-]{0,127}$/.test(request.request_id),'REQUEST_ID','Use a request identifier containing letters, digits, underscores, dots or hyphens.');
  need(!p.runs.some(r=>r.request_id===request.request_id),'REQUEST_ID','Reopen the existing original request.',{request_id:request.request_id});
  const request_text=canonicalJSON(request)+'\n',hash=sha256Utf8(request_text);
  return {request_id:request.request_id,prepared_at:at,project_revision:p.revision,mapping_version:m.version,request,request_text,request_sha256:hash.sha256,request_bytes:hash.bytes,status:'prepared',result:null,reconciliation:null,decisions:[]};
}
function compareValue(a,b,type) {
  if(a===null||b===null||a===undefined||b===undefined)return a===b;
  if(type==='decimal-string'){try{return cmp(a,b)===0;}catch{return false;}}
  return canonicalJSON(a)===canonicalJSON(b);
}
function financialGroups(tables) {
  const table=tables.find(t=>t.entity==='charge_line');if(!table)return [];
  const fields=Object.fromEntries((table.columns||[]).map(c=>[c.canonical,c.name])),groups=new Map();
  for(const row of table.records) {
    const v=row.values,get=f=>v[fields[f]||f],dims={profile:get('fee_profile_id'),currency:get('currency'),account:get('billing_account_key'),period:get('billing_period'),document:get('source_document_key')},key=canonicalJSON(dims);
    const g=groups.get(key)||{key,dimensions:dims,lines:0,net:'0',tax:'0',gross:'0',tax_present:0,gross_present:0};g.lines++;
    for(const [f,k] of [['net_amount','net'],['tax_amount','tax'],['gross_amount','gross']])if(get(f)!==null&&get(f)!==undefined&&get(f)!==''){g[k]=exact(add(g[k],get(f)));if(k!=='net')g[k+'_present']++;}
    groups.set(key,g);
  }
  return [...groups.values()];
}
export function reconcile(run,result) {
  need(result?.schema==='tjlabs.accreditation-native-result.v1'&&Array.isArray(result.tables),'TARGET_RETURN','Receive the complete actual target result.');
  need(result.project_id===run.request.project_id,'TARGET_RETURN','The target return belongs to another project.');
  if(result.status!=='EXTRACTED'&&result.request_id)need(result.request_id===run.request_id,'TARGET_RETURN','The native result belongs to another saved request.');
  if(result.status!=='EXTRACTED'&&result.request_sha256)need(result.request_sha256===run.request_sha256,'TARGET_RETURN','The target result refers to different original request bytes.');
  if(result.target_environment_id)need(result.target_environment_id===run.request.mapping.target_environment_id,'TARGET_RETURN','The returned data belongs to another native environment.');
  const differences=[],counts={expected_records:0,returned_records:0,matched_records:0,matched_fields:0,assets:0,relations:0};
  function difference(kind,detail){const d={kind,...detail};differences.push({id:'difference-'+digest(d).slice(0,24),...d});}
  const seenTables=new Set();
  for(const t of result.tables){if(seenTables.has(t.entity))difference('duplicate_table',{entity:t.entity});seenTables.add(t.entity);}
  for(const expected of run.request.tables) {
    const actual=result.tables.find(t=>t.entity===expected.entity),source=new Map(expected.records.map(r=>[r.external_key,r])),returned=new Map();
    counts.expected_records+=expected.records.length;
    if(!actual){difference('missing_table',{entity:expected.entity});continue;}
    if(actual.table!==expected.table)difference('table_identity',{entity:expected.entity,expected:expected.table,actual:actual.table});
    for(const r of actual.records){counts.returned_records++;if(returned.has(r.external_key))difference('duplicate_key',{entity:expected.entity,key:r.external_key});returned.set(r.external_key,r);if(!source.has(r.external_key))difference('extra_record',{entity:expected.entity,key:r.external_key,actual:r.values});}
    for(const [key,r] of source) {
      const a=returned.get(key);if(!a){difference('missing_record',{entity:expected.entity,key,expected:r.values});continue;}
      let equal=true;if(!a.native_id){difference('native_identity',{entity:expected.entity,key,actual:a.native_id});equal=false;}
      for(const col of expected.columns)if(own(r.values,col.name)){
        if(!compareValue(r.values[col.name],a.values?.[col.name],col.type)){difference('field_value',{entity:expected.entity,key,field:col.canonical,native_field:col.name,expected:r.values[col.name],actual:a.values?.[col.name]??null,actual_present:own(a.values||{},col.name)});equal=false;}
        else counts.matched_fields++;
      }
      if(equal)counts.matched_records++;
    }
  }
  for(const a of result.tables)if(!run.request.tables.some(t=>t.entity===a.entity))difference('extra_table',{entity:a.entity});
  const actualAssets=new Map(list(result.assets).map(a=>[a.path,a]));
  for(const expected of run.request.assets) {
    const a=actualAssets.get(expected.path);if(!a){difference('missing_asset',{path:expected.path,expected:expected.sha256});continue;}
    let h=null;try{h=sha256Bytes(bytesFromBase64(a.base64));}catch(err){difference('asset_bytes',{path:a.path,message:err.message});}
    if(!h||h.sha256!==expected.sha256||h.bytes!==expected.bytes||a.sha256!==h.sha256||a.bytes!==h.bytes)difference('asset_identity',{path:a.path,expected:{sha256:expected.sha256,bytes:expected.bytes},actual:h});
    else counts.assets++;
    if(a.visibility!==expected.visibility)difference('asset_visibility',{path:a.path,expected:expected.visibility,actual:a.visibility});
    const as=x=>list(x).map(v=>canonicalJSON({entity:v.entity,external_key:v.external_key,field:v.field})).sort();
    if(canonicalJSON(as(a.associations))!==canonicalJSON(as(expected.associations)))difference('asset_associations',{path:a.path,expected:expected.associations,actual:a.associations||[]});
  }
  for(const a of result.assets||[])if(!run.request.assets.some(e=>e.path===a.path))difference('extra_asset',{path:a.path});
  const relationValue=r=>({from_entity:r.from_entity,from_external_key:r.from_external_key,field:r.field,target_entity:r.target_entity,target_external_key:r.target_external_key});
  const rels=new Set(list(result.relations).map(r=>canonicalJSON(relationValue(r))));
  for(const r of run.request.relations){const key=canonicalJSON(r);if(!rels.has(key))difference('missing_relationship',{relationship:r});else counts.relations++;}
  for(const r of result.relations||[])if(!run.request.relations.some(e=>canonicalJSON(e)===canonicalJSON(relationValue(r))))difference('extra_relationship',{relationship:relationValue(r)});
  const expectedGroups=financialGroups(run.request.tables),actualGroups=financialGroups(result.tables.map(t=>({...t,columns:run.request.tables.find(e=>e.entity===t.entity)?.columns||[]})));
  for(const g of expectedGroups){const a=actualGroups.find(x=>x.key===g.key);if(!a||['net','tax','gross'].some(k=>cmp(g[k],a[k])!==0)||g.lines!==a.lines||g.tax_present!==a.tax_present||g.gross_present!==a.gross_present)difference('billing_group',{key:g.key,expected:g,actual:a||null});}
  for(const a of actualGroups)if(!expectedGroups.some(g=>g.key===a.key))difference('extra_billing_group',{key:a.key,actual:a});
  return {schema:'tjlabs.accreditation-comparison.v1',request_id:run.request_id,request_sha256:run.request_sha256,result_sha256:digest(result),counts,differences,financial_groups:{expected:expectedGroups,actual:actualGroups},status:differences.length?'review':'matched'};
}
export function calculateFees(p,input) {
  need(Array.isArray(input.lines)&&input.lines.length>0,'FEE_LINES','Add an original charge or a fee calculation line.');
  const rounding=input.rounding||{decimal_places:2,mode:'half_even',scope:'invoice'},places=rounding.decimal_places??2,mode=rounding.mode||'half_even';
  const lines=input.lines.map((line,index)=>{
    const profile=p.records.fee_profile.find(p=>p.fee_profile_id===line.profile_id);need(profile,'FEE_PROFILE','Select a received published tariff edition.');
    const tariff=profile.charge_rules.find(r=>r.tariff_key===line.tariff_key);need(tariff&&tariff.mode!=='cap','TARIFF','Select an applicable charge, rather than a cap control.');
    const quantity=exact(line.quantity??'1');need(cmp(quantity,'0')>=0||line.credit_of_line_key,'CREDIT','A negative quantity must retain its original credit line.');
    let amount,rate=tariff.amount_nzd_ex_gst,waiver=null;
    if(tariff.mode==='pass_through'){need(line.original_amount!==undefined&&line.original_amount!==null&&line.original_amount!=='','ACTUAL_COST','Retain the original actual-cost amount.');amount=rational(line.original_amount);rate=null;}
    else amount=mul(quantity,rate);
    if(line.waiver?.existing_accredited_business_unit){need(tariff.tariff_key.endsWith(':initial-application'),'FEE_WAIVER','This exception applies to the initial application fee.');need(line.waiver.accreditation_key&&p.records.accreditation.some(a=>a.issuer_programme_id===line.waiver.accreditation_key),'FEE_WAIVER','Link the original existing accreditation supporting the business-unit exception.');waiver=clone(line.waiver);amount=rational('0');}
    return {line_id:line.line_id||'line-'+(index+1),profile_id:profile.fee_profile_id,source_edition_id:profile.source_edition_id,tariff_key:tariff.tariff_key,label:tariff.label,currency:line.currency||profile.currency,tax_basis:profile.tax_basis,quantity,quantity_unit:tariff.charge_unit,rate,assessment_unit_factor:tariff.assessment_unit_factor||null,billing_account_key:line.billing_account_key||'calculation',billing_period:line.billing_period||profile.published_period,invoice_key:line.invoice_key||'calculation',cap_group_key:line.cap_group_key||line.invoice_key||'calculation',credit_of_line_key:line.credit_of_line_key||null,source_document_key:line.source_document_key||null,waiver,uncapped_net:exact(amount),exact_net:exact(amount),cap_reduction:'0'};
  });
  need(new Set(lines.map(l=>l.line_id)).size===lines.length,'FEE_LINES','Fee line identifiers must be unique.');
  const capGroups=[];
  const caps=new Map();
  lines.forEach((line,index)=>{if(line.tariff_key.endsWith(':international-recognition')&&cmp(line.exact_net,'0')>=0&&!line.credit_of_line_key){const key=canonicalJSON([line.profile_id,line.currency,line.tax_basis,line.billing_account_key,line.billing_period,line.cap_group_key]);if(!caps.has(key))caps.set(key,[]);caps.get(key).push(index);}});
  for(const [key,indices] of caps) {
    const first=lines[indices[0]],profile=p.records.fee_profile.find(p=>p.fee_profile_id===first.profile_id),cap=profile.charge_rules.find(r=>r.mode==='cap');
    need(first.currency===profile.currency,'CAP_CURRENCY','Recognition caps use the source currency; retain a separate explicit FX conversion.');
    const total=indices.reduce((sum,i)=>add(sum,lines[i].uncapped_net),rational('0')),capped=cmp(total,cap.amount_nzd_ex_gst)>0?rational(cap.amount_nzd_ex_gst):total;
    for(const i of indices){const allocated=cmp(total,'0')===0?rational('0'):mul(div(lines[i].uncapped_net,total),capped);lines[i].exact_net=exact(allocated);lines[i].cap_reduction=exact(sub(lines[i].uncapped_net,allocated));}
    capGroups.push({key,lines:indices.map(i=>lines[i].line_id),source_edition_id:first.source_edition_id,uncapped_net:exact(total),published_cap:cap.amount_nzd_ex_gst,exact_net:exact(capped),reduction:exact(sub(total,capped))});
  }
  const groups=new Map();
  lines.forEach((l,i)=>{const key=canonicalJSON([l.profile_id,l.currency,l.tax_basis,l.billing_account_key,l.billing_period,l.invoice_key]);if(!groups.has(key))groups.set(key,[]);groups.get(key).push(i);});
  const totals=[];
  for(const [key,indices] of groups) {
    const net=indices.reduce((sum,i)=>add(sum,lines[i].exact_net),rational('0')),taxRate=input.tax?.rate??null;
    if(taxRate!==null)need(cmp(taxRate,'0')>=0,'TAX','Use an explicit nonnegative tax rate.');
    const exactTaxes=indices.map(i=>taxRate===null?null:mul(lines[i].exact_net,taxRate)),tax=taxRate===null?null:exactTaxes.reduce((a,b)=>add(a,b),rational('0'));
    const netRounded=rounding.scope==='line'?indices.map(i=>rounded(lines[i].exact_net,places,mode)):allocateRounded(indices.map(i=>lines[i].exact_net),net,places,mode);
    const taxRounded=tax===null?indices.map(()=>null):rounding.scope==='line'?exactTaxes.map(t=>rounded(t,places,mode)):allocateRounded(exactTaxes,tax,places,mode);
    indices.forEach((index,j)=>{const l=lines[index];l.rounded_net=netRounded[j];l.exact_tax=exactTaxes[j]===null?null:exact(exactTaxes[j]);l.rounded_tax=taxRounded[j];l.rounded_gross=taxRounded[j]===null?null:rounded(add(netRounded[j],taxRounded[j]),places,'toward_zero');});
    totals.push({key,currency:lines[indices[0]].currency,tax_basis:lines[indices[0]].tax_basis,exact_net:exact(net),rounded_net:rounded(netRounded.reduce((a,b)=>add(a,b),'0'),places,'toward_zero'),exact_tax:tax===null?null:exact(tax),rounded_tax:tax===null?null:rounded(taxRounded.reduce((a,b)=>add(a,b),'0'),places,'toward_zero'),line_ids:indices.map(i=>lines[i].line_id)});
  }
  const result={schema:'tjlabs.accreditation-fee-calculation.v1',purpose:input.purpose||'Fee calculation',input:clone(input),rounding:clone(rounding),tax:input.tax||null,lines,cap_groups:capGroups,totals};result.sha256=digest(result);return result;
}
export function sourceChanges(p) {return clone(p.source_reviews);}
export function report(p) {
  const validation=validateProject(p),links=relationships(p),latest=p.runs[p.runs.length-1];
  return {schema:'tjlabs.accreditation-project-report.v1',project_id:p.project_id,title:p.title,revision:p.revision,...validation,record_counts:Object.fromEntries(p.contract.entities.map(e=>[e.name,p.records[e.name].length])),selected_editions:p.records.source_edition.filter(e=>e.selected_for_current).map(e=>e.source_edition_id),mapping:{id:p.mapping.mapping_id,version:p.mapping.version,product:p.mapping.target_product,environment:p.mapping.target_environment_id},relationships:{count:links.rows.length,issues:links.issues},latest_receiving:latest?{request_id:latest.request_id,status:latest.status,comparison:latest.reconciliation}:null,source_changes:sourceChanges(p),fee_calculations:p.fee_calculations.length};
}
export function applyAction(project,action,{at=now()}={}) {
  need(action&&action.expected_revision===project.revision,'PROJECT_CONFLICT','The saved project changed. Refresh it before applying this edit.',{expected:action?.expected_revision,actual:project.revision});
  const p=clone(project),type=action.type;let detail=null;
  if(type==='save_record')detail=changeRecord(p,action.entity,action.record,{oldKey:action.old_key,reason:action.reason,at});
  else if(type==='import_csv') {
    const preview=previewImport(p,action);need(!preview.issues.length,'IMPORT_FIELDS','Correct the original column mapping.',{issues:preview.issues});
    const edition=retainFile(p,{...action,source_edition_id:preview.source_edition_id},at);
    for(const r of preview.rows)changeRecord(p,action.entity,r.value,{reason:'Receive original CSV edition '+edition,at,provenance:{source_path:action.filename,source_row:r.row,source_line:r.line,source_edition_id:edition,field_mapping:preview.fields}});
    detail={records:preview.rows.length,source_edition_id:edition};
  }
  else if(type==='retain_source')detail=retainFile(p,action,at);
  else if(type==='add_asset')detail=addDocumentAsset(p,action,at);
  else if(type==='document_controls') {
    const doc=p.records.document.find(r=>keyOf(p,'document',r)===action.document_key);need(doc,'DOCUMENT','Select an existing original document edition.');
    need(action.map?.original?.sha256===doc.content_sha256||action.map?.source_sha256===doc.content_sha256||action.map?.sha256===doc.content_sha256,'DOCUMENT_IDENTITY','The control map must refer to the complete retained original.');
    doc.content_control_map=clone(action.map);detail={document:keyOf(p,'document',doc)};
  }
  else if(type==='document_filled')detail=acceptFormFill(p,action,at);
  else if(type==='bind_target')bindSchema(p,action.schema,at);
  else if(type==='save_mapping') {
    const previous=clone(p.mapping),m=clone(action.mapping);need(m.mapping_id===previous.mapping_id,'MAPPING','Keep this mapping identity and save a new edition.');
    need(m.entities.length===p.contract.entities.length,'MAPPING','Save all 15 entity mappings.');
    m.version=previous.version+1;p.mapping_history.push(previous);p.mapping=m;storeMappingRecord(p,at);
  }
  else if(type==='select_edition') {
    const e=p.records.source_edition.find(e=>e.source_edition_id===action.source_edition_id);need(e,'EDITION','Select a retained source edition.');
    const group=p.edition_groups[e.source_edition_id];
    if(group)for(const item of p.records.source_edition)if(p.edition_groups[item.source_edition_id]===group)item.selected_for_current=false;
    e.selected_for_current=action.selected!==false;
    if(group&&e.selected_for_current){const acc=p.records.accreditation.find(a=>a.issuer_programme_id===group);if(acc)acc.selected_scope_edition_id=e.source_edition_id;}
  }
  else if(type==='fee_calculation') {detail=calculateFees(p,action.input);p.fee_calculations.push({id:'fees-'+detail.sha256.slice(0,24),at,result:detail});}
  else if(type==='prepare_receiving') {detail=prepareReceiving(p,{requestId:action.request_id,at});p.runs.push(detail);}
  else if(type==='native_started') { const run=p.runs.find(r=>r.request_id===action.request_id);need(run,'REQUEST','Select the saved request.');run.status='running';run.native_started_at=at; }
  else if(type==='native_failure') { const run=p.runs.find(r=>r.request_id===action.request_id);need(run,'REQUEST','Select the saved request.');run.status='error';run.native_error=clone(action.error);run.native_finished_at=at; }
  else if(type==='receive_result') {
    const run=p.runs.find(r=>r.request_id===action.request_id);need(run,'REQUEST','Reopen the saved original request.');
    const comparison=reconcile(run,action.result);if(action.result.status==='APPLIED'&&!run.accepted_result)run.accepted_result=clone(action.result);run.observations=run.observations||[];run.observations.push({received_at:at,result:clone(action.result),comparison:clone(comparison)});run.result=clone(action.result);run.returned_at=at;run.reconciliation=comparison;run.status=comparison.status;delete run.native_error;detail=comparison;
  }
  else if(type==='review_difference') {
    const run=p.runs.find(r=>r.request_id===action.request_id),difference=run?.reconciliation?.differences.find(d=>d.id===action.difference_id);
    need(difference,'DIFFERENCE','Select a difference from the current complete comparison.');
    need(typeof action.reason==='string'&&action.reason.trim().length>0&&typeof action.reviewer==='string'&&action.reviewer.trim().length>0,'REVIEW','Save the reviewer and concrete reason.');
    need(['correct mapping','receive corrected original source edition','accept specified target representation with a saved reversible mapping','record explicit scope change','keep difference visible'].includes(action.choice),'REVIEW','Select a defined review action.');
    run.decisions.push({difference_id:difference.id,difference:clone(difference),choice:action.choice,reason:action.reason,reviewer:action.reviewer,at,project_revision:p.revision+1,mapping_version:p.mapping.version});
  }
  else if(type==='rename_project'){need(typeof action.title==='string'&&action.title.trim(),'TITLE','Enter a project title.');p.title=action.title.trim();}
  else throw new WorkbenchError('ACTION','Unknown project action: '+type);
  p.revision++;p.updated_at=at;p.history.push({revision:p.revision,at,action:type,reason:action.reason||null});validateProject(p);return {project:sealProject(p),detail};
}
export function portableMembers(p) {
  const members=[],add=(path,content)=>{safePath(path);const h=sha256Utf8(content);members.push({path,content,encoding:'utf8',...h});};
  add('project.json',serializeProject(p));add('mapping.json',canonicalJSON(p.mapping)+'\n');add('report.json',canonicalJSON(report(p))+'\n');add('contracts/data-contract.json',canonicalJSON(p.contract)+'\n');
  for(const e of p.contract.entities)add('canonical/'+e.name+'.csv',csvExport(e.fields.map(f=>f.name),p.records[e.name]));
  for(const f of p.source_files)add('sources/'+f.sha256+'/'+f.path,f.content);
  for(const asset of p.assets)members.push({path:asset.path,base64:asset.base64,encoding:'base64',bytes:asset.bytes,sha256:asset.sha256,media_type:asset.media_type});
  for(const run of p.runs){const dir='receiving/'+run.request_id.replace(/[^A-Za-z0-9_.-]/g,'_')+'/';add(dir+'request.json',run.request_text);if(run.accepted_result)add(dir+'accepted.json',canonicalJSON(run.accepted_result)+'\n');if(run.result)add(dir+'returned.json',canonicalJSON(run.result)+'\n');for(const [index,observation] of (run.observations||[]).entries())add(dir+'observations/'+String(index+1).padStart(4,'0')+'.json',canonicalJSON(observation)+'\n');if(run.reconciliation)add(dir+'comparison.json',canonicalJSON(run.reconciliation)+'\n');add(dir+'review.json',canonicalJSON(run.decisions)+'\n');}
  for(const fill of p.form_fills||[]){const dir='forms/'+fill.id+'/';add(dir+'mapping.json',fill.mapping_text);add(dir+'operation.json',canonicalJSON(fill)+'\n');}
  add('manifest.json',canonicalJSON({schema:'tjlabs.accreditation-handover-manifest.v1',project_id:p.project_id,revision:p.revision,members:members.map(({path,bytes,sha256,encoding})=>({path,bytes,sha256,encoding}))})+'\n');
  return members;
}
