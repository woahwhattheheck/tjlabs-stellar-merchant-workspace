'use strict';
const R=require('./rational.cjs');
const assert=(v,m)=>{if(!v)throw Error(m);},uniq=a=>[...new Set(a)];
function time(s){if(typeof s!=='string')return null;const m=/^(\d{4}-\d{2}-\d{2})T(\d{2}):(\d{2}):(\d{2})(?:\.(\d{1,3}))?(Z|[+-]\d{2}:\d{2})$/.exec(s);if(!m)return null;const d=Date.parse(m[1]+'T00:00:00Z');if(!Number.isFinite(d)||new Date(d).toISOString().slice(0,10)!==m[1]||+m[2]>23||+m[3]>59||+m[4]>59)return null;let offset=0;if(m[6]!=='Z'){const [h,n]=m[6].slice(1).split(':').map(Number);if(h>23||n>59)return null;offset=(h*60+n)*60000*(m[6][0]==='-'?-1:1);}return d+(+m[2]*3600+ +m[3]*60+ +m[4])*1000+Number((m[5]||'').padEnd(3,'0'))-offset;}
function decimal(x){try{return R.dec(x);}catch{return null;}}
function nonnegative(x){const r=decimal(x);return r&&r.n>=0n?r:null;}
function positive(x){const r=decimal(x);return r&&r.n>0n?r:null;}
function eq(a,b){return a!==null&&b!==null&&R.cmp(a,b)===0n;}
function union(intervals){const xs=intervals.map(x=>x.slice()).sort((a,b)=>a[0]-b[0]),out=[];for(const x of xs){if(!Number.isFinite(x[0])||!Number.isFinite(x[1])||x[1]<=x[0])continue;const p=out.at(-1);if(p&&x[0]<=p[1])p[1]=Math.max(p[1],x[1]);else out.push(x);}return out;}
const duration=xs=>R.R(BigInt(union(xs).reduce((s,[a,b])=>s+b-a,0)),60000n);
const overlap=(a,b,c,d)=>a<b&&c<d&&a<d&&c<b;
const inside=(from,to,at)=>time(from)!==null&&(to===''||time(to)!==null)&&time(from)<=at&&(to===''||at<time(to));
const reveal=x=>x&&typeof x==='object'?(typeof x.n==='bigint'&&typeof x.d==='bigint'?R.value(x):Array.isArray(x)?x.map(reveal):Object.fromEntries(Object.entries(x).map(([k,v])=>[k,reveal(v)]))):x;
function sourceView(w,rows,selected,side,cut){
 const all={},current={},issues=[],add=(code,f,r,detail)=>issues.push({code,family:f,id:r?.values.id||'',detail,source:r?.source||null});
 for(const kind of Object.keys(w.config.selection[side])){const extract=selected(w,kind,side);all[kind]=rows(w,kind,side);current[kind]=[];if(!extract){add('EXTRACT_UNOBSERVED',kind,null,'No selected original for this family');continue;}const available=time(extract.available_at);if(available===null||available>cut){add('EXTRACT_AFTER_CUTOFF',kind,null,'Selected complete source edition was unavailable at the declared cutoff');continue;}
  const byId=new Map(),groups=new Map();for(const r of all[kind]){const v=r.values;if(!byId.has(v.id))byId.set(v.id,[]);byId.get(v.id).push(r);}
  const known=r=>{const v=r.values,a=time(v.available_at),t=time(v.recorded_at);return a!==null&&t!==null&&a>=t&&a<=cut&&t<=cut;};
  for(const r of all[kind]){const v=r.values;if(!known(r)){if(time(v.recorded_at)===null||time(v.available_at)===null||time(v.available_at)<time(v.recorded_at))add('RECORD_TIME_UNRESOLVED',kind,r,'Record and source availability need valid ordered instants');continue;}if(!v.id||byId.get(v.id).length!==1||!v.record_key||!/^[1-9]\d*$/.test(v.revision||'')||!['active','void'].includes(v.record_status)){add('RECORD_IDENTITY_UNRESOLVED',kind,r,'Unique version ID, business record key, positive revision and active/void status required');continue;}let ok=true;if(v.supersedes_id){const ps=byId.get(v.supersedes_id)||[],p=ps[0];if(ps.length!==1||p.values.record_key!==v.record_key||!known(p)||!/^[1-9]\d*$/.test(p.values.revision||'')||BigInt(p.values.revision||'0')>=BigInt(v.revision)||time(p.values.recorded_at)>time(v.recorded_at)){add('REVISION_PREDECESSOR_UNRESOLVED',kind,r,'Explicit predecessor must be earlier, known and in the same record key');ok=false;}}else if(v.revision!=='1'){add('REVISION_PREDECESSOR_MISSING',kind,r,'A later revision requires its retained predecessor');ok=false;}if(!ok)continue;if(!groups.has(v.record_key))groups.set(v.record_key,[]);groups.get(v.record_key).push(r);}
  for(const rs of groups.values()){const superseded=new Set(rs.map(r=>r.values.supersedes_id).filter(Boolean)),leaves=rs.filter(r=>!superseded.has(r.values.id));if(leaves.length!==1){for(const r of leaves)add('REVISION_AMBIGUOUS',kind,r,'Multiple unsuperseded revisions remain unresolved');continue;}if(leaves[0].values.record_status==='active')current[kind].push(leaves[0]);}
 }
 function get(kind,key,value){const xs=(current[kind]||[]).filter(r=>r.values[key]===value);return xs.length===1?xs[0]:null;}
 function exact(kind,id){const xs=(all[kind]||[]).filter(r=>r.values.id===id);return xs.length===1?xs[0]:null;}
 return{all,current,issues,get,exact,cut};
}
module.exports={R,time,decimal,nonnegative,positive,eq,union,duration,overlap,inside,reveal,sourceView,assert,uniq};
