'use strict';
const SHA=require('./sha256.cjs'),CSV=require('./csv.cjs');
const SCHEMA='biomed.onboarding-study/v1';
const KINDS=['facilities','assets','events'];
const FIELDS={
 facilities:['id','name','address'],
 assets:['id','facility_id','tag','serial','manufacturer','model','status','next_due','procedure_ref'],
 events:['id','asset_id','event_type','performed_at','recorded_due','status','report_ref','procedure_ref','findings_text','technician_ref']
};
const clone=x=>JSON.parse(JSON.stringify(x)),hash=x=>SHA.sha256Utf8(JSON.stringify(x)).sha256,json=x=>JSON.stringify(x,null,2)+'\n';
function assert(v,m){if(!v)throw Error(m);}
function text(v,n){assert(typeof v==='string',n+' must be text');return v;}
function id(v,n){text(v,n);assert(/^[A-Za-z0-9][A-Za-z0-9_.-]{0,99}$/.test(v),'Use a simple '+n);return v;}
function stamp(v){assert(typeof v==='string'&&/^\d{4}-\d{2}-\d{2}T/.test(v)&&Number.isFinite(Date.parse(v)),'Use an ISO timestamp');return v;}
function empty(label='New onboarding study'){return{schema:SCHEMA,id:'study-'+Date.now()+'-'+Math.random().toString(36).slice(2,7),config:{label,data_class:'operational',source_scope:'',returned_scope:'',authority_notes:'',selection:{source:{facilities:'',assets:'',events:''},returned:{facilities:'',assets:'',events:''}}},originals:[],extracts:[],crosswalks:[],reviews:[],notes:''};}
function validate(w){
 assert(w&&w.schema===SCHEMA,'Unsupported onboarding study');id(w.id,'study ID');assert(w.config&&typeof w.config==='object','Study configuration missing');
 for(const k of ['label','data_class','source_scope','returned_scope','authority_notes'])text(w.config[k],k);
 assert(['operational','authored_course'].includes(w.config.data_class),'Unknown data class');
 for(const a of ['originals','extracts','crosswalks','reviews'])assert(Array.isArray(w[a]),'Missing '+a);text(w.notes,'Notes');
 const seen=new Set();for(const o of w.originals){id(o.id,'original ID');assert(!seen.has(o.id),'Duplicate original ID');seen.add(o.id);text(o.name,'Original name');text(o.content,'Original text');stamp(o.captured_at);assert(SHA.sha256Utf8(o.content).sha256===o.sha256,'Original content digest mismatch');}
 seen.clear();for(const e of w.extracts){id(e.id,'extract ID');assert(!seen.has(e.id),'Duplicate extract ID');seen.add(e.id);assert(KINDS.includes(e.kind)&&['source','returned'].includes(e.side),'Unknown extract kind/side');const o=w.originals.find(x=>x.id===e.original_id);assert(o,'Extract original is missing');const t=CSV.table(o.content);assert(e.mapping&&typeof e.mapping==='object','Mapping missing');assert(Object.keys(e.mapping).sort().join()===FIELDS[e.kind].slice().sort().join(),'Mapping must define every canonical field');for(const [k,v]of Object.entries(e.mapping))assert(typeof v==='string'&&(v===''&&k!=='id'||t.header.includes(v)),'Unknown original column for '+k);assert(new Set(Object.values(e.mapping).filter(Boolean)).size===Object.values(e.mapping).filter(Boolean).length,'A source column cannot silently serve two canonical fields');text(e.label,'Extract label');}
 for(const side of ['source','returned'])for(const kind of KINDS){const v=w.config.selection?.[side]?.[kind];text(v,'Selected extract');if(v)assert(w.extracts.some(e=>e.id===v&&e.side===side&&e.kind===kind),'Selected extract kind/side mismatch');}
 const maps=new Set();for(const x of w.crosswalks){assert(KINDS.includes(x.kind),'Crosswalk kind');text(x.source_id,'Source ID');text(x.target_id,'Returned ID');assert(x.source_id&&x.target_id,'Crosswalk IDs cannot be blank');const key=x.kind+'\0'+x.source_id;assert(!maps.has(key),'Duplicate source crosswalk');maps.add(key);}
 for(const r of w.reviews){assert(typeof r.study_sha256==='string'&&/^[a-f0-9]{64}$/.test(r.study_sha256),'Review digest');text(r.reviewer,'Reviewer');text(r.notes,'Review notes');stamp(r.at);assert(['accepted','revise'].includes(r.decision),'Review decision');}
 return w;
}
function digest(w){validate(w);return hash({...w,reviews:[]});}
function inspectCSV(content){return CSV.table(content);}
function importExtract(w,{kind,side,name,content,mapping,label,at}){
 validate(w);assert(KINDS.includes(kind)&&['source','returned'].includes(side),'Select kind and side');text(name,'Filename');text(content,'Original');stamp(at);CSV.table(content);
 const x=clone(w),sha=SHA.sha256Utf8(content).sha256,oid='original-'+hash([name,sha]).slice(0,32);
 if(!x.originals.some(o=>o.id===oid))x.originals.push({id:oid,name,content,sha256:sha,captured_at:at});
 const eid='extract-'+hash([oid,kind,side,mapping]).slice(0,32);
 if(!x.extracts.some(e=>e.id===eid))x.extracts.push({id:eid,kind,side,original_id:oid,mapping:clone(mapping),label:label||name});
 x.config.selection[side][kind]=eid;return validate(x);
}
function selected(w,kind,side){return w.extracts.find(e=>e.id===w.config.selection[side][kind])||null;}
function rows(w,kind,side){
 const e=selected(w,kind,side);if(!e)return[];
 const o=w.originals.find(x=>x.id===e.original_id),t=CSV.table(o.content),idx=Object.fromEntries(t.header.map((v,i)=>[v,i]));
 return t.rows.map(r=>({values:Object.fromEntries(FIELDS[kind].map(k=>[k,e.mapping[k]?r.values[idx[e.mapping[k]]]:null])),source:{original_id:o.id,sha256:o.sha256,extract_id:e.id,name:o.name,line_start:r.line_start,line_end:r.line_end}}));
}
function choose(w,kind,side,extractId){const x=clone(w);x.config.selection[side][kind]=extractId;return validate(x);}
function crosswalk(w,kind,pairs){const x=clone(w);x.crosswalks=x.crosswalks.filter(r=>r.kind!==kind).concat(pairs.map(r=>({kind,source_id:r.source_id,target_id:r.target_id})));return validate(x);}
function matchIds(w,kind){validate(w);const s=rows(w,kind,'source'),t=rows(w,kind,'returned'),sc=new Map(),tc=new Map();for(const r of s)sc.set(r.values.id,(sc.get(r.values.id)||0)+1);for(const r of t)tc.set(r.values.id,(tc.get(r.values.id)||0)+1);return crosswalk(w,kind,s.filter(r=>r.values.id&&sc.get(r.values.id)===1&&tc.get(r.values.id)===1).map(r=>({source_id:r.values.id,target_id:r.values.id})));}
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
  for(const [kind,field,parent]of [['assets','facility_id','facilities'],['events','asset_id','assets']]){
   for(const r of data[kind][side]){const key=r.values[field];if(key===null)continue;if(!key||!indexes[parent][side].has(key))add('REFERENCE_MISSING',kind,side,r,field,parent+' ID',key,'Linked parent identity is missing.');else if(indexes[parent][side].get(key).length!==1)add('REFERENCE_AMBIGUOUS',kind,side,r,field,'Unique parent',key,'The parent ID selects more than one record.');}
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
    const parent=kind==='assets'&&field==='facility_id'?'facilities':kind==='events'&&field==='asset_id'?'assets':null;
    if(parent){const mapped=maps[parent].get(expected);if(!mapped){add('PARENT_CROSSWALK_MISSING',kind,'source',r,field,expected,actual,'Parent IDs need their own explicit crosswalk.');continue;}expected=mapped;}
    if(expected!==actual)add('VALUE_CHANGED',kind,'returned',target,field,expected,actual,'Exact original value differs in the returned edition.');
   }
  }
  for(const r of data[kind].returned)if(r.values.id&&!mappedTargets.has(r.values.id))add('RETURNED_UNEXPECTED',kind,'returned',r,'id','Mapped original',r.values.id,'Returned row has no original counterpart in this selected scope.');
 }
 const d=digest(w),reviews=w.reviews.filter(x=>x.study_sha256===d);
 return{schema:'biomed.onboarding-comparison/v1',study_sha256:d,data_class:w.config.data_class,scope:{source:w.config.source_scope,returned:w.config.returned_scope},complete_extract_selection:complete,counts,findings,comparison_state:!complete?'incomplete':findings.length?'differences_for_review':'selected_fields_match',reviews,decision:reviews.some(r=>r.decision==='accepted')?'recorded_acceptance':reviews.some(r=>r.decision==='revise')?'revision_requested':'unreviewed',limits:'Data-transfer comparison only. It does not assess device safety, choose procedures or maintenance intervals, create clinical readings, authenticate signatures, or release equipment.'};
}
function review(w,{study_sha256,reviewer,at,decision,notes}){
 assert(study_sha256===digest(w),'Review belongs to another selected edition; start a new review.');
 text(reviewer,'Reviewer');assert(reviewer.trim(),'Reviewer required');stamp(at);assert(['accepted','revise'].includes(decision),'Review decision');text(notes,'Review notes');
 const x=clone(w),r={study_sha256,reviewer,at,decision,notes};if(!x.reviews.some(q=>hash(q)===hash(r)))x.reviews.push(r);return validate(x);
}
function report(w){const r=analyze(w),esc=x=>String(x??'').replace(/\|/g,'\\|').replace(/[\r\n]+/g,' ');
 return '# '+w.config.label+'\n\nData class: '+r.data_class+'\n\nSource scope: '+r.scope.source+'\n\nReturned scope: '+r.scope.returned+'\n\nSelected edition: '+r.study_sha256+'\n\nComparison: '+r.comparison_state+'; review: '+r.decision+'\n\n| Kind | Original rows | Returned rows |\n|---|---:|---:|\n'+KINDS.map(k=>'| '+k+' | '+r.counts[k].source+' | '+r.counts[k].returned+' |').join('\n')+'\n\n## Differences\n\n'+(r.findings.length?'| Code | Kind | ID | Field | Expected | Returned | Original location |\n|---|---|---|---|---|---|---|\n'+r.findings.map(x=>'| '+[x.code,x.kind,x.record_id,x.field,x.expected,x.actual,x.source?x.source.name+':'+x.source.line_start+'–'+x.source.line_end:''].map(esc).join(' | ')+' |').join('\n'):'Every selected canonical field matches through the explicit identity maps.')+'\n\n## Operator review\n\n'+(r.reviews.length?r.reviews.map(x=>x.at+' — '+x.reviewer+' — '+x.decision+'\n\n'+x.notes).join('\n\n'):'No review recorded for this edition.')+'\n\n'+r.limits+'\n';
}
function exports(w){validate(w);const r=analyze(w),out=[{path:'study.json',content:json(w)},{path:'comparison.json',content:json(r)},{path:'comparison.md',content:report(w)},{path:'crosswalks.csv',content:CSV.csv([['kind','source_id','target_id'],...w.crosswalks.map(x=>[x.kind,x.source_id,x.target_id])])}];for(const side of ['source','returned'])for(const kind of KINDS)out.push({path:'selected/'+side+'-'+kind+'.csv',content:CSV.csv([FIELDS[kind],...rows(w,kind,side).map(x=>FIELDS[kind].map(k=>x.values[k]===null?'':x.values[k]))])});const idx=[];for(const o of w.originals){const path='originals/'+o.id+'.txt';out.push({path,content:o.content});idx.push({id:o.id,name:o.name,path,sha256:o.sha256,captured_at:o.captured_at});}out.push({path:'originals/index.json',content:json(idx)});return out;}
module.exports={SCHEMA,KINDS,FIELDS,clone,hash,json,empty,validate,digest,inspectCSV,importExtract,selected,rows,choose,crosswalk,matchIds,analyze,review,report,exports};
