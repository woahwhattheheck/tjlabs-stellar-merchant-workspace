'use strict';
const {FIELDS,KINDS,IDS}=require('./schema.cjs');
const T=require('./study-time.cjs'),R=T.R,SHA=require('./sha256.cjs');
const canonical=v=>JSON.stringify(Object.fromEntries(Object.keys(v).sort().map(k=>[k,v[k]===undefined?null:v[k]])));
const hashRow=row=>SHA.sha256Utf8(canonical(row.values||row)).sha256;
const unique=a=>[...new Set(a)];
const plain=v=>v&&typeof v==='object'&&!Array.isArray(v);
const value=r=>r?r.values:null;
function create(records,options={}){
 const cutoff=T.time(options.as_of),issues=[],all={},extracts={},countStatus={};
 const issue=(code,family,id,detail,at)=>{const x={code,family,id:id||'',detail,at:at||options.as_of};const key=JSON.stringify(x);if(!seenIssues.has(key)){seenIssues.add(key);issues.push(x);}};
 const seenIssues=new Set();
 if(cutoff===null)return {schema:'procurement.source-view.v1',as_of:options.as_of||'',input_valid:false,population_complete:false,issues:[{code:'AS_OF_REQUIRED',detail:'An explicit valid ISO8601 cutoff is required'}]};
 const instant=n=>new Date(n).toISOString();
 const allowedExtract={};
 for(const f of KINDS){
  const input=Array.isArray(records?.[f])?records[f]:[];
  if(!Array.isArray(records?.[f]))issue('FAMILY_NOT_SUPPLIED',f,'','Supply the complete family, including an explicit empty array');
  const ex=options.extract_available_at?.[f];
  allowedExtract[f]=T.time(ex)!==null&&T.time(ex)<=cutoff;
  extracts[f]=ex||'';
  if(!allowedExtract[f])issue('EXTRACT_UNAVAILABLE',f,'','The selected source edition must be available at the analysis cutoff');
  const expected=options.expected_counts?.[f];
  countStatus[f]={expected:Number.isInteger(expected)&&expected>=0?expected:null,observed:input.length,matched:Number.isInteger(expected)&&expected===input.length};
  if(!countStatus[f].matched)issue('POPULATION_COUNT_UNRESOLVED',f,'','A matching declared complete source-row count is required');
  all[f]=input.map((row,index)=>{
   const v=plain(row?.values)?row.values:row;const out={values:{},source:row?.source||null,index};
   if(!plain(v)){issue('ROW_NOT_OBJECT',f,'','Rows must be objects');out.invalid=true;return out;}
   for(const k of FIELDS[f])out.values[k]=v[k]===undefined?null:v[k];
   const unavailable=FIELDS[f].filter(k=>out.values[k]===null);if(unavailable.length){issue('CANONICAL_CELL_UNAVAILABLE',f,String(v.id||''),'Canonical cells are unobserved: '+unavailable.join(', '));out.invalid=true;}
   if(Object.values(out.values).some(x=>x!==null&&typeof x!=='string')){issue('SCALAR_TEXT_REQUIRED',f,String(v.id||''),'All canonical cells must be strings or null');out.invalid=true;}
   const extra=Object.keys(v).filter(k=>!FIELDS[f].includes(k));if(extra.length){issue('UNRECOGNISED_COLUMNS',f,String(v.id||''),extra.join(', '));out.invalid=true;}
   if(row?.extract_available_at&&T.time(row.extract_available_at)!==T.time(ex)){issue('EXTRACT_TIME_CONFLICT',f,String(v.id||''),'Row wrapper and family extract availability must agree');out.invalid=true;}
   out.hash=hashRow(out.values);return out;
  });
 }
 function context(kind,id,at,system){
  if(!id||typeof options.resolve!=='function')return null;
  let c;try{c=options.resolve(kind,id,instant(at));}catch{return null;}
  if(!plain(c)||c.id!==id||T.time(c.available_at)===null||T.time(c.available_at)>at||system&&c.system_id!==system)return null;
  return c;
 }
 function document(id,at){
  if(!id||typeof options.document!=='function')return null;
  let d;try{d=options.document(id,instant(at));}catch{return null;}
  return plain(d)&&d.id===id&&T.time(d.available_at)!==null&&T.time(d.available_at)<=at?d:null;
 }
 function authority(role,person,system,at){
  if(!context('person',person,at)||typeof options.authorize!=='function')return false;
  let a;try{a=options.authorize(role,person,system,instant(at));}catch{return false;}
  return !!(a?.authorized===true&&T.time(a.available_at)!==null&&T.time(a.available_at)<=at&&document(a.source_document_id,at));
 }
 const snapCache=new Map();
 function snapshot(at){
  if(snapCache.has(at))return snapCache.get(at);
  const out={known:{},current:{},selected:new Set(),valid:new Map()};snapCache.set(at,out);
  for(const f of KINDS){
   const known=allowedExtract[f]?all[f].filter(r=>!r.invalid&&T.time(r.values.available_at)!==null&&T.time(r.values.available_at)<=at):[];
   const ids=new Map(),groups=new Map();out.known[f]=new Map();out.current[f]=[];
   for(const r of known){const v=r.values;if(!ids.has(v.id))ids.set(v.id,[]);ids.get(v.id).push(r);}
   const good=new Map(),busy=new Set();
   function valid(r){
    if(good.has(r))return good.get(r);if(busy.has(r))return false;busy.add(r);
    const v=r.values,recorded=T.time(v.recorded_at),available=T.time(v.available_at);
    let ok=!!v.id&&!!v.record_key&&/^[1-9]\d*$/.test(v.revision)&&['active','void'].includes(v.record_status)&&ids.get(v.id)?.length===1&&recorded!==null&&recorded<=available&&!!v.source_ref&&!!document(v.source_document_id,available);
    if(v.supersedes_id){const ps=ids.get(v.supersedes_id)||[],p=ps[0];ok=ok&&ps.length===1&&valid(p)&&p.values.record_key===v.record_key&&p.values[IDS[f]]===v[IDS[f]]&&BigInt(p.values.revision)+1n===BigInt(v.revision)&&T.time(p.values.available_at)<=available&&T.time(p.values.recorded_at)<=recorded;}
    else ok=ok&&v.revision==='1';
    busy.delete(r);good.set(r,!!ok);return !!ok;
   }
   for(const r of known)if(valid(r)){if(!groups.has(r.values.record_key))groups.set(r.values.record_key,[]);groups.get(r.values.record_key).push(r);}
   for(const [key,rs]of groups){
    const superseded=new Set(rs.map(r=>r.values.supersedes_id).filter(Boolean)),leaves=rs.filter(r=>!superseded.has(r.values.id));
    if(leaves.length!==1){if(at===cutoff)issue('REVISION_CONFLICT',f,key,'Multiple unconnected current revisions are present');continue;}
    for(const r of rs){out.known[f].set(r.values.id,r);out.valid.set(f+':'+r.values.id,r);}
    if(leaves[0].values.record_status==='active'){out.current[f].push(leaves[0]);out.selected.add(f+':'+leaves[0].values.id);}
   }
   if(at===cutoff)for(const r of known)if(!valid(r))issue('SOURCE_VERSION_UNRESOLVED',f,r.values.id,'Unique identity, complete revision chain, ordered availability and original source document are required');
   if(at===cutoff)for(const r of all[f])if(!r.invalid&&(T.time(r.values.available_at)===null||T.time(r.values.recorded_at)===null))issue('SOURCE_TIME_UNRESOLVED',f,r.values.id,'Record and availability timestamps must be explicit valid instants');
  }
  for(const f of KINDS){const groups=new Map();for(const r of out.current[f]){const business=r.values[IDS[f]];if(!business)continue;if(!groups.has(business))groups.set(business,[]);groups.get(business).push(r);}for(const [business,rs]of groups)if(rs.length>1){const keys=new Set(rs.map(r=>r.values.record_key));for(const [id,r]of out.known[f])if(keys.has(r.values.record_key)){out.known[f].delete(id);out.selected.delete(f+':'+id);}out.current[f]=out.current[f].filter(r=>!keys.has(r.values.record_key));if(at===cutoff)issue('BUSINESS_ID_CONFLICT',f,business,'Multiple current business records claim the same canonical identity');}}
  return out;
 }
 function ref(f,id,at,current=false){const s=snapshot(at),r=s.known[f].get(id);return r&&r.values.record_status==='active'&&(!current||s.selected.has(f+':'+id))?r:null;}
 const root=snapshot(cutoff);
 return {cutoff,issues,all,extracts,countStatus,allowedExtract,issue,context,document,authority,snapshot,ref,root,instant,hashRow,
  metadata:()=>Object.fromEntries(KINDS.map(f=>[f,{...countStatus[f],extract_available_at:extracts[f],known_versions:root.known[f].size,current_records:root.current[f].length}])),
  sourceValid:()=>!issues.some(i=>['ROW_NOT_OBJECT','SCALAR_TEXT_REQUIRED','CANONICAL_CELL_UNAVAILABLE','UNRECOGNISED_COLUMNS','EXTRACT_TIME_CONFLICT','SOURCE_VERSION_UNRESOLVED','SOURCE_TIME_UNRESOLVED','REVISION_CONFLICT','BUSINESS_ID_CONFLICT'].includes(i.code)),
  populationComplete:()=>options.population_complete===true&&KINDS.every(f=>allowedExtract[f]&&countStatus[f].matched)};
}
module.exports={create,hashRow};
