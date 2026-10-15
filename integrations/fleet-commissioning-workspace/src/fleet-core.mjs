export function createFleetCore(codec) {
"use strict";
const SCHEMA="tjlabs.fleet-working.v1", clone=x=>JSON.parse(JSON.stringify(x));
const fields={
organizations:["organization_id","name"],
devices:["organization_id","device_id","serial","model","declared_state","declared_at"],
aliases:["organization_id","system","alias","device_id"],
authorities:["organization_id","authority_id","fingerprint","parent_authority_id","declared_trust"],
certificates:["organization_id","certificate_id","device_id","issuer_authority_id","fingerprint","serial","not_before","not_after","revoked_at"],
lifecycle:["organization_id","event_id","device_id","occurred_at","recorded_at","state","request_id"],
telemetry:["organization_id","message_id","device_id","observed_at","received_at","topic","metric","value","unit","method","certificate_id"],
audit:["organization_id","event_id","target_kind","target_id","action","outcome","occurred_at","request_id","actor"],
expectations:["organization_id","expectation_id","device_id","effective_from","effective_to","max_silence_seconds","source_note"]};
const required={
organizations:["organization_id","name"],devices:["organization_id","device_id","declared_state","declared_at"],
aliases:["organization_id","system","alias","device_id"],authorities:["organization_id","authority_id","fingerprint"],
certificates:["organization_id","certificate_id","device_id","issuer_authority_id","fingerprint","not_before","not_after"],
lifecycle:["organization_id","event_id","device_id","occurred_at","recorded_at","state"],
telemetry:["organization_id","message_id","device_id","observed_at","received_at"],
audit:["organization_id","event_id","target_kind","target_id","action","outcome","occurred_at"],
expectations:["organization_id","expectation_id","device_id","effective_from","max_silence_seconds"]};
const states=["pending","active","disabled","decommissioned"];
function plain(x){return !!x&&typeof x==="object"&&!Array.isArray(x)&&Object.getPrototypeOf(x)===Object.prototype}
function canonical(x){if(x===null||typeof x!=="object")return JSON.stringify(x);if(Array.isArray(x))return "["+x.map(canonical).join(",")+"]";return "{"+Object.keys(x).sort().map(k=>JSON.stringify(k)+":"+canonical(x[k])).join(",")+"}"}
function hash(x){return codec.sha256(codec.utf8Encode(typeof x==="string"?x:canonical(x)))}
function check(ok,msg){if(!ok)throw Error(msg)}
function text(x,name){check(typeof x==="string",name+" must be text.");return x}
function stamp(s){
 if(typeof s!=="string")return null;
 const m=/^(\d{4})-(\d{2})-(\d{2})T(\d{2}):(\d{2}):(\d{2})(?:\.(\d{1,3}))?(Z|[+-]\d{2}:\d{2})$/.exec(s);
 if(!m)return null;
 const y=+m[1],mo=+m[2],d=+m[3],h=+m[4],mi=+m[5],se=+m[6];
 if(y<1||mo<1||mo>12||d<1||d>new Date(Date.UTC(y===1?2001:y,mo,0)).getUTCDate()||h>23||mi>59||se>59)return null;
 if(m[8]!=="Z"&&(+m[8].slice(1,3)>23||+m[8].slice(4)>59))return null;
 const n=Date.parse(s);return Number.isFinite(n)?n:null;
}
function parseCSV(raw){
 text(raw,"CSV");check(codec.utf8Encode(raw).length<=4000000,"Each original CSV is limited to 4,000,000 UTF-8 bytes.");
 const s=raw.charCodeAt(0)===0xfeff?raw.slice(1):raw;
 const records=[];let row=[],value="",quoted=false,after=false,line=1,start=1,ordinal=1,has=false;
 function cell(){row.push(value);value="";after=false}
 function record(){cell();records.push({cells:row,line:start,ordinal:ordinal++});row=[];has=false;start=line}
 for(let i=0;i<s.length;i++){
  const ch=s[i];has=true;
  if(quoted){if(ch==='"'){if(s[i+1]==='"'){value+='"';i++}else{quoted=false;after=true}}else{value+=ch;if(ch==="\r"){if(s[i+1]==="\n"){value+="\n";i++}line++}else if(ch==="\n")line++}continue}
  if(ch==='"'){check(value===""&&!after,"Unexpected quote at physical line "+line);quoted=true;continue}
  if(ch===","){cell();continue}
  if(ch==="\n"||ch==="\r"){if(ch==="\r"&&s[i+1]==="\n")i++;line++;record();start=line;continue}
  check(!after,"Unexpected text after closing quote at physical line "+line);value+=ch;
 }
 check(!quoted,"Unclosed quoted field at physical line "+start);
 if(has||row.length||value!=="")record();
 const nonempty=records.filter(r=>r.cells.some(v=>v!==""));
 check(nonempty.length>0,"CSV is empty.");
 const header=nonempty[0];
 check(header.cells.every(v=>v!==""),"Header names cannot be blank.");
 check(new Set(header.cells).size===header.cells.length,"Header names must be distinct.");
 for(const r of nonempty.slice(1))check(r.cells.length===header.cells.length,"Column count differs at physical line "+r.line);
 return {headers:header.cells,headerLine:header.line,records:nonempty.slice(1),allRecordCount:records.length};
}
function mapped(source){
 const parsed=parseCSV(source.raw), names=fields[source.family];
 check(names,"Unknown source family.");
 check(plain(source.mapping),"Mapping must be an object.");
 for(const k of Object.keys(source.mapping))check(names.includes(k),"Unknown mapped field "+k);
 for(const k of required[source.family])check(typeof source.mapping[k]==="string"&&parsed.headers.includes(source.mapping[k]),"Map required field "+k);
 for(const v of Object.values(source.mapping))check(v===""||parsed.headers.includes(v),"Mapping names an absent column.");
 return parsed.records.map(r=>{const out={};for(const k of names){const at=parsed.headers.indexOf(source.mapping[k]);out[k]=at<0?"":r.cells[at]}return {values:out,sourceId:source.id,line:r.line,record:r.ordinal}});
}
function seal(w){delete w.sha256;w.sha256=hash(w);return w}
function create(id,name,asOf){check(id&&name,"A workspace identity and name are required.");check(stamp(asOf)!==null,"Use an explicit timestamp with offset.");return seal({schema:SCHEMA,id:text(id,"ID"),name:text(name,"Name"),revision:0,asOf,sources:[],selected:{},decisions:[],history:[]})}
function validate(w){
 check(plain(w)&&w.schema===SCHEMA,"Unsupported fleet working file.");
 const q=clone(w),sha=q.sha256;delete q.sha256;check(typeof sha==="string"&&sha===hash(q),"Working-file digest differs.");
 check(typeof w.id==="string"&&w.id&&typeof w.name==="string"&&w.name,"Missing workspace identity/name.");
 check(Number.isSafeInteger(w.revision)&&w.revision>=0&&stamp(w.asOf)!==null,"Invalid revision or snapshot time.");
 check(Array.isArray(w.sources)&&plain(w.selected)&&Array.isArray(w.decisions)&&Array.isArray(w.history),"Incomplete working file.");
 check(w.history.length===w.revision,"Revision history is incomplete.");
 const seen=new Set();
 for(const s of w.sources){check(plain(s)&&typeof s.id==="string"&&s.id&&!seen.has(s.id),"Duplicate/invalid source edition.");seen.add(s.id);check(fields[s.family]&&typeof s.filename==="string"&&s.filename,"Invalid source description.");text(s.raw,"Original source");check(hash(s.raw)===s.sha256,"Original source digest differs.");mapped(s)}
 for(const [family,id]of Object.entries(w.selected))check(fields[family]&&w.sources.some(s=>s.id===id&&s.family===family),"Selected source is missing.");
 for(let i=0;i<w.history.length;i++){const h=w.history[i];check(h.revision===i+1&&typeof h.kind==="string"&&typeof h.basis==="string"&&plain(h.detail),"Invalid retained history.")}
 for(const d of w.decisions){check(plain(d)&&typeof d.findingId==="string"&&typeof d.basis==="string"&&["investigate","acknowledged","source-corrected"].includes(d.status)&&typeof d.note==="string"&&typeof d.reviewer==="string"&&d.reviewer&&stamp(d.at)!==null,"Invalid review decision.")}
 return clone(w);
}
function mutate(w,kind,detail,fn){const q=validate(w);fn(q);q.revision++;q.history.push({revision:q.revision,kind,basis:w.sha256,detail:clone(detail)});return seal(q)}
function addSource(w,input){
 check(plain(input)&&fields[input.family],"Choose a source family.");
 const s={id:text(input.id,"Source ID"),family:input.family,filename:text(input.filename,"Filename"),raw:text(input.raw,"Original"),mapping:clone(input.mapping),sha256:hash(input.raw)};
 check(s.id&&s.filename,"Source identity and filename are required.");mapped(s);
 return mutate(w,"source-edition",{sourceId:s.id,family:s.family,sha256:s.sha256},q=>{check(!q.sources.some(x=>x.id===s.id),"That source edition ID already exists.");q.sources.push(s);q.selected[s.family]=s.id});
}
function selectSource(w,family,id){return mutate(w,"select-edition",{family,id},q=>{check(q.sources.some(s=>s.id===id&&s.family===family),"Source edition does not belong to this family.");q.selected[family]=id})}
function rename(w,name){check(typeof name==="string"&&name.trim(),"Supply a workspace name.");return mutate(w,"rename",{name},q=>{q.name=name})}
function setAsOf(w,asOf){check(stamp(asOf)!==null,"Use an explicit timestamp with offset.");return mutate(w,"snapshot-time",{asOf},q=>{q.asOf=asOf})}
function rows(w,family){const s=w.sources.find(x=>x.id===w.selected[family]);return s?mapped(s):[]}
function key(...parts){return canonical(parts)}
function snapshot(w){
 validate(w);const at=stamp(w.asOf), tables={},findings=[],deviceRows=[];
 for(const f of Object.keys(fields))tables[f]=rows(w,f);
 const sourceBasis=hash({asOf:w.asOf,selected:Object.fromEntries(Object.entries(w.selected).sort().map(([f,id])=>{const s=w.sources.find(x=>x.id===id);return[f,{id,sha256:s.sha256,mapping:s.mapping}]}))});
 const ref=r=>({sourceId:r.sourceId,line:r.line,record:r.record});
 function issue(code,identity,message,evidence=[],severity="attention"){const id=hash({code,identity}),body={id,code,identity,message,severity,evidence:evidence.map(ref)};body.basis=hash({sourceBasis,...body});findings.push(body);return body}
 function grouped(f,keys){const out=new Map();for(const r of tables[f]){const k=key(...keys.map(x=>r.values[x]));if(!out.has(k))out.set(k,[]);out.get(k).push(r)}for(const[k,rs]of out)if(rs.length>1)issue("duplicate-"+f,k,"More than one row declares this "+f+" identity.",rs);return out}
 for(const[f,rs]of Object.entries(tables))for(const r of rs)for(const k of required[f])if(r.values[k]==="")issue("missing-field",key(f,r.sourceId,r.record,k),"Required value "+k+" is blank.",[r]);
 const orgs=grouped("organizations",["organization_id"]),devices=grouped("devices",["organization_id","device_id"]),authorities=grouped("authorities",["organization_id","authority_id"]),certs=grouped("certificates",["organization_id","certificate_id"]);
 grouped("aliases",["organization_id","system","alias"]);const lifecycleIds=grouped("lifecycle",["organization_id","event_id"]),telemetryIds=grouped("telemetry",["organization_id","message_id"]);grouped("audit",["organization_id","event_id"]);grouped("expectations",["organization_id","expectation_id"]);
 function unique(m,k){return m.has(k)&&m.get(k).length===1}
 function eligibleIds(f,idField,timeFields){const m=new Map();for(const r of tables[f]){const times=timeFields.map(n=>stamp(r.values[n]));if(times.some(n=>n===null||n>at)||times.length>1&&times[1]<times[0])continue;const k=key(r.values.organization_id,r.values[idField]);if(!m.has(k))m.set(k,[]);m.get(k).push(r)}return m}
 const eligibleLifecycleIds=eligibleIds("lifecycle","event_id",["occurred_at","recorded_at"]),eligibleTelemetryIds=eligibleIds("telemetry","message_id",["observed_at","received_at"]);
 for(const[f,rs]of Object.entries(tables))if(f!=="organizations")for(const r of rs)if(!unique(orgs,key(r.values.organization_id)))issue("organization-reference",key(f,r.sourceId,r.record),"Organization is absent or ambiguous.",[r]);
 for(const f of ["aliases","certificates","lifecycle","telemetry","expectations"])for(const r of tables[f])if(!unique(devices,key(r.values.organization_id,r.values.device_id)))issue("device-reference",key(f,r.sourceId,r.record),"Device is absent or ambiguous in this organization.",[r]);
 function time(r,k,optional=false){const s=r.values[k];if(optional&&s==="")return null;const n=stamp(s);if(n===null)issue("invalid-time",key(r.sourceId,r.record,k),"Timestamp "+k+" needs a valid date, seconds and explicit offset.",[r]);return n}
 const parsed=new Map();for(const[f,names]of Object.entries({devices:["declared_at"],certificates:["not_before","not_after","revoked_at"],lifecycle:["occurred_at","recorded_at"],telemetry:["observed_at","received_at"],audit:["occurred_at"],expectations:["effective_from","effective_to"]}))for(const r of tables[f]){const p={};for(const n of names)p[n]=time(r,n,["revoked_at","effective_to"].includes(n));parsed.set(r,p)}
 for(const r of tables.authorities){
  const v=r.values;if(v.parent_authority_id&&!unique(authorities,key(v.organization_id,v.parent_authority_id)))issue("authority-parent",key(v.organization_id,v.authority_id),"Parent authority is absent or ambiguous.",[r]);
  const visited=new Set();let x=r;while(x){const k=key(x.values.organization_id,x.values.authority_id);if(visited.has(k)){issue("authority-cycle",key(v.organization_id,v.authority_id),"Authority metadata contains a parent cycle.",[r]);break}visited.add(k);const next=authorities.get(key(v.organization_id,x.values.parent_authority_id));x=next&&next.length===1?next[0]:null}
 }
 const fingerprintMap=new Map();for(const r of tables.certificates){const v=r.values,p=parsed.get(r);
  if(!unique(authorities,key(v.organization_id,v.issuer_authority_id)))issue("certificate-issuer",key(v.organization_id,v.certificate_id),"Issuer metadata is absent or ambiguous; no trust conclusion is available.",[r]);
  if(p.not_before!==null&&p.not_after!==null&&p.not_after<=p.not_before)issue("certificate-window",key(v.organization_id,v.certificate_id),"Certificate end must follow start.",[r]);
  if(p.not_before!==null&&p.not_before>at)issue("certificate-not-yet-valid",key(v.organization_id,v.certificate_id),"Certificate metadata starts after the snapshot time.",[r]);
  if(p.not_after!==null&&p.not_after<=at)issue("certificate-expired",key(v.organization_id,v.certificate_id),"Certificate metadata has expired at the snapshot time.",[r]);
  if(p.revoked_at!==null&&p.revoked_at<=at)issue("certificate-revoked-declared",key(v.organization_id,v.certificate_id),"Source declares revocation by the snapshot time; enforcement is not verified.",[r]);
  if(v.fingerprint){const k=key(v.organization_id,v.fingerprint);if(!fingerprintMap.has(k))fingerprintMap.set(k,[]);fingerprintMap.get(k).push(r)}
 }
 for(const[k,rs]of fingerprintMap)if(new Set(rs.map(r=>r.values.device_id)).size>1)issue("certificate-fingerprint-reuse",k,"The same certificate fingerprint is assigned to different device identities.",rs);
 for(const r of [...tables.devices,...tables.lifecycle])if(!states.includes(r.values.declared_state??r.values.state))issue("unknown-state",key(r.sourceId,r.record),"State is outside the declared Atlas lifecycle vocabulary.",[r]);
 for(const r of tables.lifecycle){const p=parsed.get(r);if(p.occurred_at!==null&&p.recorded_at!==null&&p.recorded_at<p.occurred_at)issue("lifecycle-clock-order",key(r.sourceId,r.record),"Recorded time precedes the stated event time.",[r]);if(p.occurred_at>at||p.recorded_at>at)issue("future-lifecycle",key(r.sourceId,r.record),"Retained lifecycle observation is not available at this snapshot.",[r],"information")}
 for(const r of tables.telemetry){const p=parsed.get(r),v=r.values;
  if(p.observed_at!==null&&p.received_at!==null&&p.received_at<p.observed_at)issue("telemetry-clock-order",key(r.sourceId,r.record),"Receive time precedes the stated observation time.",[r]);
  if(p.observed_at>at||p.received_at>at)issue("future-telemetry",key(r.sourceId,r.record),"Retained telemetry is not available at this snapshot.",[r],"information");
  if(v.certificate_id){const cr=certs.get(key(v.organization_id,v.certificate_id));if(!cr||cr.length!==1)issue("telemetry-certificate",key(r.sourceId,r.record),"Telemetry certificate reference is absent or ambiguous.",[r]);else if(cr[0].values.device_id!==v.device_id)issue("telemetry-certificate-device",key(r.sourceId,r.record),"Telemetry and certificate name different devices.",[r,cr[0]])}
 }
 for(const r of tables.expectations){const p=parsed.get(r),v=r.values;if(!/^(0|[1-9]\d*)$/.test(v.max_silence_seconds)||!Number.isSafeInteger(Number(v.max_silence_seconds)))issue("invalid-silence-limit",key(r.sourceId,r.record),"Silence limit must be an explicit non-negative safe integer in seconds.",[r]);if(p.effective_to!==null&&p.effective_from!==null&&p.effective_to<=p.effective_from)issue("expectation-window",key(r.sourceId,r.record),"Expectation end must follow start.",[r])}
 for(const r of tables.audit){const v=r.values;let map=v.target_kind==="device"?devices:v.target_kind==="certificate"?certs:v.target_kind==="authority"?authorities:v.target_kind==="organization"?orgs:null;
  if(!map)issue("audit-target-kind",key(r.sourceId,r.record),"Audit target kind is not mapped to a known inventory family.",[r]);
  else if(v.target_kind==="organization"&&v.target_id!==v.organization_id||!unique(map,v.target_kind==="organization"?key(v.target_id):key(v.organization_id,v.target_id)))issue("audit-target-reference",key(r.sourceId,r.record),"Audit target is absent or ambiguous.",[r]);
  if(parsed.get(r).occurred_at>at)issue("future-audit",key(r.sourceId,r.record),"Audit evidence is later than this snapshot.",[r],"information");
 }
 for(const[k,dr]of devices){if(dr.length!==1)continue;const r=dr[0],v=r.values,p=parsed.get(r);
  let candidates=[];if(p.declared_at!==null&&p.declared_at<=at&&states.includes(v.declared_state))candidates.push({row:r,time:p.declared_at,state:v.declared_state});
  if(p.declared_at>at)issue("future-device-declaration",k,"Device declaration is later than the snapshot.",[r],"information");
  for(const e of tables.lifecycle){const z=e.values,t=parsed.get(e);if(unique(eligibleLifecycleIds,key(z.organization_id,z.event_id))&&key(z.organization_id,z.device_id)===k&&t.occurred_at!==null&&t.recorded_at!==null&&t.recorded_at>=t.occurred_at&&t.occurred_at<=at&&t.recorded_at<=at&&states.includes(z.state))candidates.push({row:e,time:t.occurred_at,state:z.state})}
  const latest=candidates.length?candidates.reduce((n,x)=>Math.max(n,x.time),-Infinity):null,front=candidates.filter(x=>x.time===latest),ss=new Set(front.map(x=>x.state));let state=ss.size===1?[...ss][0]:"unresolved";
  if(ss.size>1)issue("state-conflict",k,"Different lifecycle states share the latest applicable event time.",front.map(x=>x.row));if(!front.length)issue("state-missing",k,"No valid state declaration is available by this snapshot.",[r]);
  const messages=tables.telemetry.filter(e=>unique(eligibleTelemetryIds,key(e.values.organization_id,e.values.message_id))&&key(e.values.organization_id,e.values.device_id)===k).filter(e=>{const t=parsed.get(e);return t.observed_at!==null&&t.received_at!==null&&t.received_at>=t.observed_at&&t.observed_at<=at&&t.received_at<=at});
  const last=messages.length?messages.reduce((n,e)=>Math.max(n,parsed.get(e).observed_at),-Infinity):null;
  const expectations=tables.expectations.filter(e=>key(e.values.organization_id,e.values.device_id)===k).filter(e=>{const t=parsed.get(e),n=e.values.max_silence_seconds;return t.effective_from!==null&&t.effective_from<=at&&(e.values.effective_to===""||(t.effective_to!==null&&t.effective_to>at))&&/^(0|[1-9]\d*)$/.test(n)&&Number.isSafeInteger(Number(n))});
  let silence="not assessed",limit=null;
  if(expectations.length>1)issue("expectation-conflict",k,"Multiple active silence expectations apply; none is selected automatically.",expectations);
  else if(expectations.length===1){limit=Number(expectations[0].values.max_silence_seconds);if(last===null){silence="no available observation";issue("telemetry-missing",k,"No valid telemetry observation was received by the snapshot under the selected expectation.",[r,expectations[0]])}else{silence=(at-last)/1000>limit?"over supplied limit":"within supplied limit";if(silence==="over supplied limit")issue("telemetry-silence",k,"Elapsed time exceeds the source-supplied silence limit.",[expectations[0],...messages.filter(e=>parsed.get(e).observed_at===last)])}}
  deviceRows.push({organization_id:v.organization_id,device_id:v.device_id,serial:v.serial,model:v.model,state,state_at:latest===null?"":new Date(latest).toISOString(),last_observed_at:last===null?"":new Date(last).toISOString(),silence_seconds:last===null?"":String((at-last)/1000),supplied_limit_seconds:limit===null?"":String(limit),telemetry_assessment:silence,source:ref(r)});
 }
 for(const f of findings){const decisions=w.decisions.filter(d=>d.findingId===f.id);f.review=decisions.filter(d=>d.basis===f.basis).at(-1)||null;f.previousReviewCount=decisions.filter(d=>d.basis!==f.basis).length}
 return {schema:"tjlabs.fleet-snapshot.v1",workspaceId:w.id,workspaceRevision:w.revision,asOf:w.asOf,sourceBasis,selected:clone(w.selected),sourceRows:Object.fromEntries(Object.entries(tables).map(([f,rs])=>[f,rs.length])),devices:deviceRows,findings,retainedSourceEditions:w.sources.length,retainedDecisions:w.decisions.length};
}
function review(w,input){const s=snapshot(w),f=s.findings.find(x=>x.id===input.findingId);check(f&&f.basis===input.basis,"Finding changed; compare the current source before reviewing.");check(["investigate","acknowledged","source-corrected"].includes(input.status),"Choose an explicit review status.");check(typeof input.reviewer==="string"&&input.reviewer.trim()&&typeof input.note==="string"&&stamp(input.at)!==null,"Supply reviewer, note and timestamp.");const d={findingId:f.id,basis:f.basis,status:input.status,reviewer:input.reviewer,note:input.note,at:input.at};return mutate(w,"review",d,q=>q.decisions.push(d))}
function csv(headers,rs){const esc=v=>'"'+String(v??"").replace(/"/g,'""')+'"';return [headers,...rs.map(r=>headers.map(k=>r[k]))].map(r=>r.map(esc).join(",")).join("\r\n")+"\r\n"}
const esc=x=>String(x??"").replace(/[&<>"']/g,c=>({"&":"&amp;","<":"&lt;",">":"&gt;",'"':"&quot;","'":"&#39;"}[c]));
function report(w){const s=snapshot(w);return '<!doctype html><html lang="en"><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1"><title>Fleet commissioning report</title><style>body{font:16px system-ui;max-width:1100px;margin:2rem auto;padding:1rem;color:#13252b}table{border-collapse:collapse;width:100%;display:block;overflow:auto}td,th{border:1px solid #bbb;padding:.6rem;text-align:left}article{padding:1rem;border:1px solid #aaa;margin:1rem 0}code{overflow-wrap:anywhere}@media print{table{display:table}article{break-inside:avoid}}</style><h1>'+esc(w.name)+'</h1><p>Snapshot '+esc(s.asOf)+' · '+s.retainedSourceEditions+' retained source editions.</p><p>Read-only source reconciliation. Certificate results are metadata checks, not cryptographic verification. Review annotations do not remove unresolved source findings.</p><h2>Selected originals</h2><ul>'+Object.entries(w.selected).map(([f,id])=>{const x=w.sources.find(z=>z.id===id);return '<li>'+esc(f)+': '+esc(x.filename)+' · <code>'+x.sha256+'</code></li>'}).join("")+'</ul><h2>Device snapshot</h2><table><thead><tr>'+["Organization","Device","State","Last observation","Telemetry"].map(x=>'<th>'+x+'</th>').join("")+'</tr></thead><tbody>'+s.devices.map(d=>'<tr>'+[d.organization_id,d.device_id,d.state,d.last_observed_at,d.telemetry_assessment].map(x=>'<td>'+esc(x)+'</td>').join("")+'</tr>').join("")+'</tbody></table><h2>Findings ('+s.findings.length+')</h2>'+s.findings.map(f=>'<article><h3>'+esc(f.code)+'</h3><p>'+esc(f.message)+'</p><p>'+esc(f.identity)+'</p><p>Original locations: '+esc(f.evidence.map(r=>r.sourceId+" physical line "+r.line+" / CSV record "+r.record).join("; "))+'</p><p>Review: '+(f.review?esc(f.review.status+" · "+f.review.reviewer+" · "+f.review.at)+"<br>"+esc(f.review.note):"Unreviewed")+'</p><p>Prior-basis reviews retained: '+f.previousReviewCount+'</p></article>').join("")+'</html>'}
return {schema:SCHEMA,fields,required,states,canonical,hash,stamp,parseCSV,mapped,create,validate,addSource,selectSource,setAsOf,rename,snapshot,review,csv,report};
}
