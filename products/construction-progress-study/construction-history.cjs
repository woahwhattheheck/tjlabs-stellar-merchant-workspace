'use strict';
const M=require('./construction-math.cjs'),R=require('./rational.cjs');
const unique=a=>[...new Set(a)];
function index(records){const byId=new Map();for(const r of records){const id=r.values.id;if(!byId.has(id))byId.set(id,[]);byId.get(id).push(r);}return{all:records,byId,one:id=>id&&byId.get(id)?.length===1?byId.get(id)[0]:null,duplicates:[...byId].filter(([id,a])=>!id||a.length!==1).map(([id,a])=>({id,records:a}))};}
function known(row,at,{record='recorded_at',effective=null,available='available_at',observed=true}={}){
 if(!row||at===null)return false;const v=row.values,r=M.stamp(v[record]);if(r===null||r>at)return false;
 if(Object.hasOwn(v,available)&&(M.stamp(v[available])===null||M.stamp(v[available])>at))return false;
 if(effective){const e=M.stamp(v[effective]);if(e===null||e>at||observed&&r<e)return false;}
 return true;
}
// Select a version only through explicit predecessor links. Two unrelated
// contemporaneous heads remain ambiguous, regardless of file order.
function version(records,at,{effective='effective_at',predecessor='supersedes_id',observed=false,identity=x=>!!x.values.id}={}){
 const future=[],candidates=[],issues=[];
 for(const r of records){const v=r.values,rec=M.stamp(v.recorded_at),eff=M.stamp(v[effective]);if(rec!==null&&rec>at||eff!==null&&eff>at){future.push(v.id);continue;}if(!identity(r)||!known(r,at,{effective,observed})){issues.push('VERSION_IDENTITY_OR_CHRONOLOGY');continue;}candidates.push(r);}
 const byId=index(records),superseded=new Set();
 for(const r of candidates){const v=r.values;if(v[predecessor]){const old=byId.one(v[predecessor]);if(!old||!candidates.includes(old)||M.stamp(old.values[effective])>M.stamp(v[effective])||old.values.id===v.id)issues.push('VERSION_PREDECESSOR_UNRESOLVED');else superseded.add(v[predecessor]);}}
 const heads=candidates.filter(r=>!superseded.has(r.values.id));if(heads.length>1)issues.push('VERSION_AMBIGUOUS');
 if(candidates.length&&!heads.length)issues.push('VERSION_CYCLE');
 return{row:issues.length?null:heads[0]||null,issues:unique(issues),history:candidates.map(r=>r.values.id),future};
}
// Repeated observations of one external transaction may refer to the same
// immutable economic event. Conflicting payloads suppress every projection
// that contains that event; invoice filtering occurs only after this pass.
function transactions(records,at,{key,signature,amount,currency,belongs,knownRow=r=>known(r,at),valid=()=>true,futureRow=r=>{const e=M.stamp(r.values.effective_at);return e!==null&&e>at;}}){
 const groups=new Map(),future=[],unresolved=[];
 for(const r of records){const rec=M.stamp(r.values.recorded_at);if(rec!==null&&rec>at||futureRow(r)){future.push(r.values.id);continue;}if(!knownRow(r)||!valid(r)||!key(r)){unresolved.push(r);continue;}const k=key(r);if(!groups.has(k))groups.set(k,[]);groups.get(k).push(r);}
 const accepted=[],conflicts=[];
 for(const [external,rs]of groups){const signatures=unique(rs.map(signature));if(signatures.length!==1){conflicts.push({external,records:rs});continue;}accepted.push({external,row:rs[0],observations:rs.map(r=>r.values.id)});}
 function project(test=()=>true){const sums=new Map(),errors=[];for(const x of accepted){if(!test(x.row))continue;const c=currency(x.row),a=amount(x.row);if(!c||a===null){errors.push(x.row.values.id);continue;}sums.set(c,R.add(sums.get(c)||R.zero(),a));}
 const relevant=conflicts.filter(x=>x.records.some(test)),unknown=unresolved.filter(test);for(const x of relevant)for(const r of x.records)if(test(r)&&currency(r))sums.set(currency(r),null);
 for(const r of unknown)if(currency(r))sums.set(currency(r),null);
 return{totals:Object.fromEntries([...sums].map(([c,v])=>[c,R.value(v)])),complete:!relevant.length&&!unknown.length&&!errors.length,conflicts:relevant.map(x=>({external_ref:x.external,record_ids:x.records.map(r=>r.values.id)})),unresolved_ids:unique([...unknown.map(r=>r.values.id),...errors]),unique_transactions:accepted.filter(x=>test(x.row)).length,observation_ids:records.filter(r=>test(r)&&!future.includes(r.values.id)).map(r=>r.values.id),future_ids:records.filter(r=>test(r)&&future.includes(r.values.id)).map(r=>r.values.id)};
 }
 return{accepted,conflicts,unresolved,future,project};
}
module.exports={index,known,version,transactions};