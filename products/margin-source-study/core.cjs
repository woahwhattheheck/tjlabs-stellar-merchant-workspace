'use strict';
const SHA=require('./sha256.cjs'),CSV=require('./csv.cjs'),Binary=require('./binary.cjs'),Margin=require('./margin.cjs');
const SCHEMA='margin.source-study/v1';
const FIELDS={"sites":["id","name","system_label","currency","external_ref"],"periods":["id","label","starts_at","ends_at","calendar_basis","external_ref"],"skus":["id","site_id","local_sku","comparison_key","process_spec","output_basis","good_definition","yield_definition","external_ref"],"units":["id","sku_id","source_unit","basis_unit","factor_numerator","factor_denominator","source_ref"],"production":["id","site_id","sku_id","period_id","slice_key","good_quantity","good_unit_id","input_quantity","input_unit_id","output_scope","input_scope","included","exclusion_reason","source_ref"],"costs":["id","site_id","period_id","economic_pool_id","cost_category","currency","amount","accounting_basis","included","exclusion_reason","source_ref"],"allocations":["id","cost_id","sku_id","share_numerator","share_denominator","allocation_basis","source_ref"],"hours":["id","site_id","sku_id","period_id","economic_pool_id","worker_type","active_hours","entry_type","included","exclusion_reason","source_ref"],"coverage":["id","site_id","period_id","dataset","status","reviewed_by","reviewed_at","source_ref"],"finance":["id","site_id","period_id","economic_pool_id","net_sales","cogs","currency","accounting_basis","included","exclusion_reason","source_ref"],"benefits":["id","site_id","period_id","economic_pool_id","kind","amount","currency","capacity_quantity","capacity_unit","status","accepted_by","accepted_at","independence_basis","source_ref"]};
const KINDS=Object.keys(FIELDS),RELATIONS=[["skus","site_id","sites",false],["units","sku_id","skus",false],["production","site_id","sites",false],["production","sku_id","skus",false],["production","period_id","periods",false],["production","good_unit_id","units",false],["production","input_unit_id","units",true],["costs","site_id","sites",true],["costs","period_id","periods",false],["allocations","cost_id","costs",false],["allocations","sku_id","skus",false],["hours","site_id","sites",false],["hours","sku_id","skus",false],["hours","period_id","periods",false],["coverage","site_id","sites",false],["coverage","period_id","periods",false],["finance","site_id","sites",false],["finance","period_id","periods",false],["benefits","site_id","sites",false],["benefits","period_id","periods",false]];
const clone=x=>JSON.parse(JSON.stringify(x)),hash=x=>SHA.sha256Utf8(JSON.stringify(x)).sha256,json=x=>JSON.stringify(x,null,2)+'\n';
function assert(v,m){if(!v)throw Error(m);}
function text(v,n){assert(typeof v==='string',n+' must be text');return v;}
function id(v,n){text(v,n);assert(/^[A-Za-z0-9][A-Za-z0-9_.-]{0,99}$/.test(v),'Use a simple '+n);return v;}
function stamp(v){assert(typeof v==='string'&&/^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}(?:\.\d{3})?Z$/.test(v)&&Number.isFinite(Date.parse(v))&&(new Date(v).toISOString()===v||new Date(v).toISOString().replace('.000Z','Z')===v),'Use a real UTC ISO timestamp');return v;}
function empty(label='New multi-site margin study'){return{schema:SCHEMA,id:'study-'+Date.now()+'-'+Math.random().toString(36).slice(2,7),config:{label,data_class:'operational',source_scope:'',returned_scope:'',authority_notes:'',margin:Margin.empty(),selection:{source:Object.fromEntries(KINDS.map(k=>[k,''])),returned:Object.fromEntries(KINDS.map(k=>[k,'']))}},originals:[],documents:[],document_links:[],extracts:[],crosswalks:[],reviews:[],notes:''};}
function validate(w){
 assert(w&&w.schema===SCHEMA,'Unsupported margin study');id(w.id,'study ID');assert(w.config&&typeof w.config==='object','Study configuration missing');
 for(const k of ['label','data_class','source_scope','returned_scope','authority_notes'])text(w.config[k],k);
 assert(['operational','authored_course'].includes(w.config.data_class),'Unknown data class');
 for(const a of ['originals','documents','document_links','extracts','crosswalks','reviews'])assert(Array.isArray(w[a]),'Missing '+a);text(w.notes,'Notes');
 const seen=new Set();for(const o of w.originals){id(o.id,'original ID');assert(!seen.has(o.id),'Duplicate original ID');seen.add(o.id);text(o.name,'Original name');text(o.content,'Original text');stamp(o.captured_at);assert(SHA.sha256Utf8(o.content).sha256===o.sha256,'Original content digest mismatch');}
 seen.clear();for(const o of w.documents){id(o.id,'Document ID');assert(!seen.has(o.id),'Duplicate document ID');seen.add(o.id);text(o.name,'Document filename');text(o.media_type,'Document media type');text(o.notes,'Document notes');stamp(o.captured_at);const bytes=Binary.decode(o.base64);assert(bytes.length===o.bytes&&SHA.sha256Bytes(bytes).sha256===o.sha256,'Original document integrity mismatch');}
 for(const l of w.document_links){assert(['source','returned'].includes(l.side),'Document link side');assert(KINDS.includes(l.kind),'Linked record kind required');text(l.record_id,'Linked record ID');assert(l.record_id,'Record identity required');assert(w.documents.some(d=>d.id===l.document_id),'Linked document missing');text(l.notes,'Document link notes');}
 seen.clear();for(const e of w.extracts){id(e.id,'extract ID');assert(!seen.has(e.id),'Duplicate extract ID');seen.add(e.id);assert(KINDS.includes(e.kind)&&['source','returned'].includes(e.side),'Unknown extract kind/side');const o=w.originals.find(x=>x.id===e.original_id);assert(o,'Extract original is missing');const t=CSV.table(o.content);assert(e.mapping&&typeof e.mapping==='object','Mapping missing');assert(Object.keys(e.mapping).sort().join()===FIELDS[e.kind].slice().sort().join(),'Mapping must define every canonical field');for(const [k,v]of Object.entries(e.mapping))assert(typeof v==='string'&&(v===''&&k!=='id'||t.header.includes(v)),'Unknown original column for '+k);assert(new Set(Object.values(e.mapping).filter(Boolean)).size===Object.values(e.mapping).filter(Boolean).length,'A source column cannot silently serve two canonical fields');text(e.label,'Extract label');stamp(e.available_at);if(e.derivation){const d=e.derivation;assert(d.source_extract_id===null||w.extracts.some(x=>x.id===d.source_extract_id),'Derived extract predecessor missing');text(d.reason,'Derivation reason');assert(d.reason.trim(),'Derivation reason required');stamp(d.at);}}
 for(const side of ['source','returned'])for(const kind of KINDS){const v=w.config.selection?.[side]?.[kind];text(v,'Selected extract');if(v)assert(w.extracts.some(e=>e.id===v&&e.side===side&&e.kind===kind),'Selected extract kind/side mismatch');}
 const maps=new Set();for(const x of w.crosswalks){assert(KINDS.includes(x.kind),'Crosswalk kind');text(x.source_id,'Source ID');text(x.target_id,'Returned ID');assert(x.source_id&&x.target_id,'Crosswalk IDs cannot be blank');const key=x.kind+'\0'+x.source_id;assert(!maps.has(key),'Duplicate source crosswalk');maps.add(key);}
 for(const r of w.reviews){assert(typeof r.study_sha256==='string'&&/^[a-f0-9]{64}$/.test(r.study_sha256),'Review digest');text(r.role,'Review role');assert(/^[a-z][a-z0-9_-]*$/.test(r.role),'Invalid review role');text(r.reviewer,'Reviewer');text(r.notes,'Review notes');stamp(r.at);assert(['accepted','revise'].includes(r.decision),'Review decision');}
 Margin.validate(w);return w;
}
function digest(w){validate(w);return hash({...w,reviews:[]});}
function inspectCSV(content){return CSV.table(content);}
function importExtract(w,{kind,side,name,content,mapping,label,at,available_at=at,derivation=null}){
 validate(w);assert(KINDS.includes(kind)&&['source','returned'].includes(side),'Select kind and side');text(name,'Filename');text(content,'Original');stamp(at);stamp(available_at);CSV.table(content);
 const x=clone(w),sha=SHA.sha256Utf8(content).sha256,oid='original-'+hash([name,sha]).slice(0,32);
 if(!x.originals.some(o=>o.id===oid))x.originals.push({id:oid,name,content,sha256:sha,captured_at:at});
 const eid='extract-'+hash([oid,kind,side,mapping,available_at,derivation]).slice(0,32);
 if(!x.extracts.some(e=>e.id===eid))x.extracts.push({id:eid,kind,side,original_id:oid,mapping:clone(mapping),label:label||name,available_at,...(derivation?{derivation:clone(derivation)}:{})});
 x.config.selection[side][kind]=eid;return validate(x);
}
function addDocument(w,{name,media_type,bytes,at,notes=''}){validate(w);assert(bytes instanceof Uint8Array,'Document bytes required');text(name,'Filename');assert(name.trim(),'Document filename required');text(media_type,'Media type');stamp(at);text(notes,'Document notes');const d=SHA.sha256Bytes(bytes),record={id:'document-'+hash([name,d.sha256]).slice(0,32),name,media_type,bytes:d.bytes,sha256:d.sha256,base64:Binary.encode(bytes),captured_at:at,notes};const x=clone(w);if(!x.documents.some(o=>o.id===record.id))x.documents.push(record);return validate(x);}
function linkDocument(w,{side,kind,record_id,document_id,notes=''}){const x=clone(w),link={side,kind,record_id,document_id,notes};x.document_links=x.document_links.filter(o=>!(o.side===side&&o.kind===kind&&o.record_id===record_id&&o.document_id===document_id));x.document_links.push(link);return validate(x);}
function unlinkDocument(w,{side,kind,record_id,document_id}){validate(w);const x=clone(w);assert(x.document_links.some(l=>l.side===side&&l.kind===kind&&l.record_id===record_id&&l.document_id===document_id),'Exact link not found');x.document_links=x.document_links.filter(l=>!(l.side===side&&l.kind===kind&&l.record_id===record_id&&l.document_id===document_id));return validate(x);}
function availability(w){return{schema:'margin.source-availability/v1',guide:'Mapped blank is an observed empty string. Unmapped columns are null/unobserved in rows(); selected CSV blanks alone do not express this distinction. Preserve this manifest with selected tables.',tables:KINDS.flatMap(kind=>['source','returned'].map(side=>{const e=selected(w,kind,side);return{kind,side,extract_id:e?.id||null,original_id:e?.original_id||null,fields:Object.fromEntries(FIELDS[kind].map(field=>[field,{observed:!!e?.mapping[field],column:e?.mapping[field]||null}])),rows:rows(w,kind,side).map(row=>({id:row.values.id,source:row.source}))};}))};}
function selected(w,kind,side){return w.extracts.find(e=>e.id===w.config.selection[side][kind])||null;}
function rows(w,kind,side){
 const e=selected(w,kind,side);if(!e)return[];
 const o=w.originals.find(x=>x.id===e.original_id),t=CSV.table(o.content),idx=Object.fromEntries(t.header.map((v,i)=>[v,i]));
 return t.rows.map(r=>({values:Object.fromEntries(FIELDS[kind].map(k=>[k,e.mapping[k]?r.values[idx[e.mapping[k]]]:null])),source:{original_id:o.id,sha256:o.sha256,extract_id:e.id,name:o.name,line_start:r.line_start,line_end:r.line_end}}));
}
function choose(w,kind,side,extractId){const x=clone(w);x.config.selection[side][kind]=extractId;return validate(x);}
function crosswalk(w,kind,pairs){const x=clone(w);x.crosswalks=x.crosswalks.filter(r=>r.kind!==kind).concat(pairs.map(r=>({kind,source_id:r.source_id,target_id:r.target_id})));return validate(x);}
function matchIds(w,kind){validate(w);const s=rows(w,kind,'source'),t=rows(w,kind,'returned'),sc=new Map(),tc=new Map();for(const r of s)sc.set(r.values.id,(sc.get(r.values.id)||0)+1);for(const r of t)tc.set(r.values.id,(tc.get(r.values.id)||0)+1);const prior=w.crosswalks.filter(x=>x.kind===kind),usedSources=new Set(prior.map(x=>x.source_id)),usedTargets=new Set(prior.map(x=>x.target_id));return crosswalk(w,kind,[...prior,...s.filter(r=>r.values.id&&sc.get(r.values.id)===1&&tc.get(r.values.id)===1&&!usedSources.has(r.values.id)&&!usedTargets.has(r.values.id)).map(r=>({source_id:r.values.id,target_id:r.values.id}))]);}
function analyze(w){
 validate(w);const findings=[],counts={},indexes={},data={},maps={};let complete=true;
 const add=(code,kind,side,row,field,expected,actual,detail)=>findings.push({code,kind,side,record_id:row?.values?.id||'',field:field||'',expected:expected??null,actual:actual??null,detail,source:row?.source||null});
 for(const kind of KINDS){
  data[kind]={};indexes[kind]={};counts[kind]={};maps[kind]=new Map();
  for(const side of ['source','returned']){
   const e=selected(w,kind,side);if(!e){complete=false;add('EXTRACT_MISSING',kind,side,null,'',null,null,'Select an exact original extract.');}
   const list=rows(w,kind,side),idx=new Map();data[kind][side]=list;counts[kind][side]=list.length;
   for(const r of list){const key=r.values.id;if(!key)add('ID_EMPTY',kind,side,r,'id',null,key,'A row has no stable ID.');else{if(!idx.has(key))idx.set(key,[]);idx.get(key).push(r);}}
   for(const [key,rs]of idx)if(rs.length>1)for(const r of rs)add('ID_DUPLICATE',kind,side,r,'id','Unique ID',key,'Every repeated row remains retained; resolve identity in the selected source.');
   indexes[kind][side]=idx;
   if(e)for(const field of FIELDS[kind])if(!e.mapping[field])add('FIELD_UNMAPPED',kind,side,null,field,'Explicit original column',null,'This field is unavailable; it is not an empty or verified value.');
  }
  const targets=new Map();for(const x of w.crosswalks.filter(r=>r.kind===kind)){
   maps[kind].set(x.source_id,x.target_id);targets.set(x.target_id,(targets.get(x.target_id)||0)+1);
   if(!indexes[kind].source.has(x.source_id)||!indexes[kind].returned.has(x.target_id))add('CROSSWALK_DANGLING',kind,'both',null,'id',x.source_id,x.target_id,'A mapping names an ID outside the selected editions.');
  }
  for(const [key,n]of targets)if(n>1)add('CROSSWALK_TARGET_REUSED',kind,'both',null,'id','One source ID',key,'Multiple original identities map to the same returned identity.');
 }
 for(const side of ['source','returned']){
  for(const [kind,field,parent,optional]of RELATIONS){
   for(const r of data[kind][side]){const key=r.values[field];if(key===null||optional&&key==='')continue;if(!key||!indexes[parent][side].has(key))add('REFERENCE_MISSING',kind,side,r,field,parent+' ID',key,'Linked parent identity is missing.');else if(indexes[parent][side].get(key).length!==1)add('REFERENCE_AMBIGUOUS',kind,side,r,field,'Unique parent',key,'The parent ID selects more than one record.');}
  }
 }
 for(const kind of KINDS){
  const mappedTargets=new Set();
  for(const r of data[kind].source){
   const originalId=r.values.id;if(!originalId||indexes[kind].source.get(originalId)?.length!==1)continue;
   const targetId=maps[kind].get(originalId);if(!targetId){add('SOURCE_UNMAPPED',kind,'source',r,'id','Explicit crosswalk',null,'Original identity has no selected returned counterpart.');continue;}
   mappedTargets.add(targetId);const matches=indexes[kind].returned.get(targetId)||[];
   if(matches.length!==1){add('RETURNED_ID_UNRESOLVED',kind,'source',r,'id','One returned row',matches.length,'The crosswalk does not resolve one returned row.');continue;}
   const target=matches[0];
   for(const field of FIELDS[kind].filter(x=>x!=='id')){
    let expected=r.values[field],actual=target.values[field];if(expected===null||actual===null)continue;
    const relation=RELATIONS.find(x=>x[0]===kind&&x[1]===field),parent=relation?.[2];
    if(parent&&!(relation[3]&&expected==='')){const mapped=maps[parent].get(expected);if(!mapped){add('PARENT_CROSSWALK_MISSING',kind,'source',r,field,expected,actual,'Parent IDs need their own explicit crosswalk.');continue;}expected=mapped;}
    if(expected!==actual)add('VALUE_CHANGED',kind,'returned',target,field,expected,actual,'Exact original value differs in the returned edition.');
   }
  }
  for(const r of data[kind].returned)if(r.values.id&&!mappedTargets.has(r.values.id))add('RETURNED_UNEXPECTED',kind,'returned',r,'id','Mapped original',r.values.id,'Returned row has no original counterpart in this selected scope.');
 }

 for(const l of w.document_links){const found=indexes[l.kind][l.side].get(l.record_id)||[];if(found.length!==1)add('DOCUMENT_RECORD_UNRESOLVED',l.kind,l.side,null,'document_ref','One selected record',l.record_id,'Retained bytes link to an unresolved record identity.');}
 const document_comparisons=[];
 for(const kind of KINDS)for(const r of data[kind].source){const sourceId=r.values.id,targetId=maps[kind].get(sourceId);if(!targetId||indexes[kind].source.get(sourceId)?.length!==1||indexes[kind].returned.get(targetId)?.length!==1)continue;
  const hashes=side=>[...new Set(w.document_links.filter(l=>l.kind===kind&&l.side===side&&l.record_id===(side==='source'?sourceId:targetId)).map(l=>w.documents.find(d=>d.id===l.document_id).sha256))].sort();
  const original=hashes('source'),returned=hashes('returned'),missing=original.filter(h=>!returned.includes(h)),additional=returned.filter(h=>!original.includes(h)),state=!original.length&&!returned.length?'unobserved':missing.length||additional.length?'different':'exact_bytes_match';
  document_comparisons.push({kind,source_id:sourceId,returned_id:targetId,source_sha256:original,returned_sha256:returned,missing_sha256:missing,additional_sha256:additional,state});
  if(missing.length)add('DOCUMENT_BYTES_MISSING',kind,'returned',indexes[kind].returned.get(targetId)[0],'document_bytes',original,returned,'Original photo/document bytes are absent or changed at this returned record link.');
  if(additional.length)add('DOCUMENT_BYTES_ADDITIONAL',kind,'returned',indexes[kind].returned.get(targetId)[0],'document_bytes',original,returned,'Returned record has additional or changed linked bytes; review the source and link explicitly.');
 }

 const d=digest(w),reviews=w.reviews.filter(x=>x.study_sha256===d).sort((a,b)=>Date.parse(a.at)-Date.parse(b.at)),latest=reviews.at(-1),role_reviews=w.config.margin.required_review_roles.map(role=>({role,latest:reviews.filter(x=>x.role===role).at(-1)||null}));
 return{schema:'margin.source-comparison/v1',study_sha256:d,data_class:w.config.data_class,scope:{source:w.config.source_scope,returned:w.config.returned_scope},complete_extract_selection:complete,margin:Margin.analyze(w,rows,selected),counts,document_comparisons,findings,comparison_state:!complete?'incomplete':findings.length?'differences_for_review':'selected_fields_match',reviews,role_reviews,decision:role_reviews.some(x=>x.latest?.decision==='revise')?'revision_requested':role_reviews.every(x=>x.latest?.decision==='accepted')?'recorded_acceptance':'unreviewed',limits:'Independent supplied-extract margin study. Actual ERP, payroll, agency, production and finance records retain authority. Cross-site and period cost gaps are observed comparison arithmetic, separate from realised cash and unmonetised capacity; the desk does not authorise transactions or write to operating systems.'};
}

function editRow(w,{kind,side,row_index,value,reason,at}){
 validate(w);assert(KINDS.includes(kind)&&['source','returned'].includes(side),'Select table and side');text(reason,'Correction reason');assert(reason.trim(),'Explain this observed correction or newly recorded event');stamp(at);const e=selected(w,kind,side),list=rows(w,kind,side),old=row_index===null?null:list[row_index];
 assert(row_index===null||Number.isSafeInteger(row_index)&&old,'Selected row no longer exists');
 assert(value&&Object.keys(value).sort().join()===FIELDS[kind].slice().sort().join(),'Complete canonical row required');
 const mapped=e?FIELDS[kind].filter(k=>e.mapping[k]):FIELDS[kind];for(const k of FIELDS[kind]){if(mapped.includes(k))text(value[k],k);else assert(value[k]===null,'Unobserved '+k+' needs an explicit source mapping before editing');}
 const data=list.map(x=>clone(x.values));if(old)data[row_index]=clone(value);else data.push(clone(value));
 const content=CSV.csv([mapped,...data.map(x=>mapped.map(k=>x[k]))]),mapping=Object.fromEntries(FIELDS[kind].map(k=>[k,mapped.includes(k)?k:'']));
 let x=importExtract(w,{kind,side,name:'recorded-'+kind+'-'+at.replace(/[:.]/g,'-')+'.csv',content,mapping,label:'Recorded '+kind+' revision',at,derivation:{source_extract_id:e?.id||null,row_index,before:old?clone(old):null,after:clone(value),reason,at}});
 return validate(x);
}
function review(w,{study_sha256,role,reviewer,at,decision,notes}){
 assert(study_sha256===digest(w),'Review belongs to another selected edition; start a new review.');
 assert(w.config.margin.required_review_roles.includes(role),'Choose a current configured review role');text(reviewer,'Reviewer');assert(reviewer.trim(),'Reviewer required');stamp(at);assert(['accepted','revise'].includes(decision),'Review decision');text(notes,'Review notes');
 const x=clone(w),r={study_sha256,role,reviewer,at,decision,notes};if(!x.reviews.some(q=>hash(q)===hash(r)))x.reviews.push(r);return validate(x);
}
function report(w){const r=analyze(w),esc=x=>String(x??'').replace(/\|/g,'\\|').replace(/[\r\n]+/g,' ');
 return '# '+w.config.label+'\n\nData class: '+r.data_class+'\n\nSource scope: '+r.scope.source+'\n\nReturned scope: '+r.scope.returned+'\n\nSelected edition: '+r.study_sha256+'\n\nComparison: '+r.comparison_state+'; review: '+r.decision+'\n\n| Kind | Original rows | Returned rows |\n|---|---:|---:|\n'+KINDS.map(k=>'| '+k+' | '+r.counts[k].source+' | '+r.counts[k].returned+' |').join('\n')+'\n\n## Differences\n\n'+(r.findings.length?'| Code | Kind | ID | Field | Expected | Returned | Original location |\n|---|---|---|---|---|---|---|\n'+r.findings.map(x=>'| '+[x.code,x.kind,x.record_id,x.field,x.expected,x.actual,x.source?x.source.name+':'+x.source.line_start+'–'+x.source.line_end:''].map(esc).join(' | ')+' |').join('\n'):'Every selected canonical field matches through the explicit identity maps.')+'\n\n## Retained photo and document bytes\n\n'+(r.document_comparisons.length?r.document_comparisons.map(x=>x.kind+': '+x.source_id+' → '+x.returned_id+': '+x.state+'; original '+x.source_sha256.join(', ')+'; returned '+x.returned_sha256.join(', ')).join('\n'):'No uniquely mapped records have retained attachment comparison scope.')+'\n\nUnobserved means neither side supplied retained attachment bytes. Matching record references do not establish matching photo or document contents.\n\n## Operator review\n\n'+(r.reviews.length?r.reviews.map(x=>x.at+' — '+x.role+' / '+x.reviewer+' — '+x.decision+'\n\n'+x.notes).join('\n\n'):'No review recorded for this edition.')+ '\n\n'+Margin.report(r.margin)+'\n\n'+r.limits+'\n';
}
function exports(w){validate(w);const r=analyze(w),out=[{path:'study.json',content:json(w)},{path:'comparison.json',content:json(r)},{path:'comparison.md',content:report(w)},{path:'crosswalks.csv',content:CSV.csv([['kind','source_id','target_id'],...w.crosswalks.map(x=>[x.kind,x.source_id,x.target_id])])}];for(const side of ['source','returned'])for(const kind of KINDS)out.push({path:'selected/'+side+'-'+kind+'.csv',content:CSV.csv([FIELDS[kind],...rows(w,kind,side).map(x=>FIELDS[kind].map(k=>x.values[k]===null?'':x.values[k]))])});const idx=[];for(const o of w.originals){const path='originals/'+o.id+'.txt';out.push({path,content:o.content});idx.push({id:o.id,name:o.name,path,sha256:o.sha256,captured_at:o.captured_at});}out.push({path:'originals/index.json',content:json(idx)},{path:'selected/availability.json',content:json(availability(w))});const docs=[];for(const d of w.documents){const path='documents/'+d.sha256+'.bin';if(!out.some(x=>x.path===path))out.push({path,bytes:Array.from(Binary.decode(d.base64))});docs.push({id:d.id,name:d.name,media_type:d.media_type,path,bytes:d.bytes,sha256:d.sha256,captured_at:d.captured_at,notes:d.notes});}out.push({path:'documents/index.json',content:json({documents:docs,links:w.document_links})});out.push(...Margin.exports(w,r.margin));return out;}
module.exports={SCHEMA,KINDS,FIELDS,RELATIONS,clone,hash,json,empty,validate,digest,inspectCSV,importExtract,addDocument,linkDocument,unlinkDocument,availability,selected,rows,choose,crosswalk,matchIds,analyze,editRow,review,report,exports};
