// SPDX-License-Identifier: MIT
import {projectBlockrunUsageCapture} from './blockrun-projections.mjs';
// The provider projection remains the original source. This module owns local review history only.
function utf8(value){const out=[];for(const ch of value){let c=ch.codePointAt(0);if(c>=0xd800&&c<=0xdfff)c=0xfffd;if(c<128)out.push(c);else if(c<2048)out.push(192|(c>>>6),128|(c&63));else if(c<65536)out.push(224|(c>>>12),128|((c>>>6)&63),128|(c&63));else out.push(240|(c>>>18),128|((c>>>12)&63),128|((c>>>6)&63),128|(c&63));}return Uint8Array.from(out);}
function sha256(input){const K=[0x428a2f98,0x71374491,0xb5c0fbcf,0xe9b5dba5,0x3956c25b,0x59f111f1,0x923f82a4,0xab1c5ed5,0xd807aa98,0x12835b01,0x243185be,0x550c7dc3,0x72be5d74,0x80deb1fe,0x9bdc06a7,0xc19bf174,0xe49b69c1,0xefbe4786,0x0fc19dc6,0x240ca1cc,0x2de92c6f,0x4a7484aa,0x5cb0a9dc,0x76f988da,0x983e5152,0xa831c66d,0xb00327c8,0xbf597fc7,0xc6e00bf3,0xd5a79147,0x06ca6351,0x14292967,0x27b70a85,0x2e1b2138,0x4d2c6dfc,0x53380d13,0x650a7354,0x766a0abb,0x81c2c92e,0x92722c85,0xa2bfe8a1,0xa81a664b,0xc24b8b70,0xc76c51a3,0xd192e819,0xd6990624,0xf40e3585,0x106aa070,0x19a4c116,0x1e376c08,0x2748774c,0x34b0bcb5,0x391c0cb3,0x4ed8aa4a,0x5b9cca4f,0x682e6ff3,0x748f82ee,0x78a5636f,0x84c87814,0x8cc70208,0x90befffa,0xa4506ceb,0xbef9a3f7,0xc67178f2];const a=typeof input==="string"?utf8(input):input,n=a.length,pad=new Uint8Array(Math.ceil((n+9)/64)*64);pad.set(a);pad[n]=128;const dv=new DataView(pad.buffer);dv.setUint32(pad.length-8,Math.floor(n/536870912));dv.setUint32(pad.length-4,(n*8)>>>0);const h=[0x6a09e667,0xbb67ae85,0x3c6ef372,0xa54ff53a,0x510e527f,0x9b05688c,0x1f83d9ab,0x5be0cd19],w=new Uint32Array(64),rr=(v,n)=>(v>>>n)|(v<<(32-n));for(let p=0;p<pad.length;p+=64){for(let j=0;j<16;j++)w[j]=dv.getUint32(p+j*4);for(let j=16;j<64;j++){const a=w[j-15],b=w[j-2];w[j]=(w[j-16]+(rr(a,7)^rr(a,18)^(a>>>3))+w[j-7]+(rr(b,17)^rr(b,19)^(b>>>10)))>>>0;}let[a,b,c,d,e,f,g,hh]=h;for(let j=0;j<64;j++){const t1=(hh+(rr(e,6)^rr(e,11)^rr(e,25))+((e&f)^(~e&g))+K[j]+w[j])>>>0,t2=((rr(a,2)^rr(a,13)^rr(a,22))+((a&b)^(a&c)^(b&c)))>>>0;hh=g;g=f;f=e;e=(d+t1)>>>0;d=c;c=b;b=a;a=(t1+t2)>>>0;}for(const[j,v]of[a,b,c,d,e,f,g,hh].entries())h[j]=(h[j]+v)>>>0;}return h.map(v=>v.toString(16).padStart(8,"0")).join("");}

const SOURCE={projectionGit:'067ae2851c418eb3dbcbcfec19a9ff3fb3742b87',projectionSha256:'fa2e5dd1d8f6b643007c362fcc951f152ed20d2ec36b499d100cd8a1b61b1672'};
const MAX_BYTES=32*1024*1024;
function requireValue(ok,code){if(!ok){const e=new Error(code);e.code=code;throw e;}}
function plain(value,code){requireValue(value&&typeof value==='object'&&!Array.isArray(value),code);return value;}
function fields(value,names,code){plain(value,code);requireValue(Object.keys(value).length===names.length&&names.every(k=>Object.hasOwn(value,k)),code);}
function string(value,code,max=4096,blank=false){requireValue(typeof value==='string'&&value.length<=max&&(blank||value.trim().length>0)&&!/[\u0000\u0008\u000b\u000c]/.test(value),code);return value;}
function time(value){requireValue(typeof value==='string'&&Number.isFinite(Date.parse(value))&&new Date(value).toISOString()===value,'INVALID_REVIEW_TIME');return value;}
function clone(value){return JSON.parse(JSON.stringify(value));}
export function canonicalDesk(value){return Array.isArray(value)?'['+value.map(canonicalDesk).join(',')+']':value&&typeof value==='object'?'{'+Object.keys(value).sort().map(k=>JSON.stringify(k)+':'+canonicalDesk(value[k])).join(',')+'}':JSON.stringify(value);}
export function digestDeskText(value){requireValue(typeof value==='string','TEXT_REQUIRED');return sha256(value);}
export function captureDeskLimits(){return {maxBytes:MAX_BYTES,maxCaptures:128,maxEvents:10000,source:clone(SOURCE)};}
function capture(raw,filename,evidence){string(raw,'CAPTURE_TEXT_REQUIRED',MAX_BYTES);requireValue(utf8(raw).length<=MAX_BYTES,'CAPTURE_TOO_LARGE');string(filename,'INVALID_CAPTURE_FILENAME',256);requireValue(['OPERATOR_CAPTURE','AUTHORED_EXAMPLE'].includes(evidence),'INVALID_CAPTURE_EVIDENCE');const parsed=JSON.parse(raw);const projection=projectBlockrunUsageCapture(parsed);return {record:{sha256:sha256(raw),raw,filename,evidence},projection};}
function head(state){return state.events.length?state.events[state.events.length-1].sha256:null;}
function event(state,action,value,at){const base={sequence:state.events.length+1,previous:head(state),at:time(at),action,value:clone(value)};return {...base,sha256:sha256(canonicalDesk(base))};}
function addEvent(state,action,value,at){requireValue(state.events.length<10000,'REVIEW_HISTORY_LIMIT');state.events.push(event(state,action,value,at));return state;}
export function validateCaptureDesk(input){
 const state=clone(input);fields(state,['schema','id','createdAt','title','captures','events'],'INVALID_DESK');
 requireValue(state.schema==='tjlabs.blockrun-capture-desk.v1','INVALID_DESK_SCHEMA');
 requireValue(typeof state.id==='string'&&/^[a-zA-Z0-9][a-zA-Z0-9_-]{7,95}$/.test(state.id),'INVALID_DESK_ID');time(state.createdAt);string(state.title,'INVALID_DESK_TITLE',160);
 requireValue(Array.isArray(state.captures)&&state.captures.length>0&&state.captures.length<=128,'INVALID_CAPTURE_HISTORY');
 requireValue(Array.isArray(state.events)&&state.events.length>0&&state.events.length<=10000,'INVALID_REVIEW_HISTORY');
 const captures=new Map();let total=0;
 for(const item of state.captures){fields(item,['sha256','raw','filename','evidence'],'INVALID_CAPTURE_MEMBER');const checked=capture(item.raw,item.filename,item.evidence);requireValue(checked.record.sha256===item.sha256&&!captures.has(item.sha256),'CAPTURE_MEMBER_CHANGED');captures.set(item.sha256,checked);total+=utf8(item.raw).length;}
 requireValue(total<=MAX_BYTES,'CAPTURE_HISTORY_TOO_LARGE');
 let previous=null;const introduced=new Set();let introducedIndex=0;
 for(let i=0;i<state.events.length;i++){const e=state.events[i];fields(e,['sequence','previous','at','action','value','sha256'],'INVALID_REVIEW_EVENT');time(e.at);requireValue(e.sequence===i+1&&e.previous===previous,'REVIEW_HISTORY_CHANGED');const {sha256:hash,...base}=e;requireValue(hash===sha256(canonicalDesk(base)),'REVIEW_EVENT_CHANGED');previous=hash;
 if(e.action==='capture.add'){fields(e.value,['captureSha256'],'INVALID_CAPTURE_EVENT');const selected=captures.get(e.value.captureSha256);requireValue(selected&&!introduced.has(e.value.captureSha256)&&state.captures[introducedIndex++].sha256===e.value.captureSha256,'INVALID_CAPTURE_SEQUENCE');introduced.add(e.value.captureSha256);}
 else if(e.action==='review.save'){fields(e.value,['captureSha256','subject','reviewer','status','note'],'INVALID_REVIEW_VALUE');requireValue(introduced.has(e.value.captureSha256),'REVIEW_BEFORE_CAPTURE');const p=captures.get(e.value.captureSha256).projection;string(e.value.subject,'INVALID_REVIEW_SUBJECT',300);requireValue(e.value.subject==='@capture'||p.rows.some(r=>'row:'+r.requestId===e.value.subject),'REVIEW_SUBJECT_NOT_FOUND');string(e.value.reviewer,'REVIEWER_REQUIRED',120);requireValue(['UNREVIEWED','REVIEWED','FOLLOW_UP'].includes(e.value.status),'INVALID_REVIEW_STATUS');string(e.value.note,'INVALID_REVIEW_NOTE',4096,true);}
 else if(e.action==='title.set'){fields(e.value,['title'],'INVALID_TITLE_EVENT');string(e.value.title,'INVALID_DESK_TITLE',160);}
 else requireValue(false,'UNKNOWN_REVIEW_EVENT');
 }
 requireValue(introduced.size===captures.size,'UNRECORDED_CAPTURE');requireValue(utf8(packageText(state,false)).length<=MAX_BYTES*2,'DESK_PACKAGE_TOO_LARGE');return state;
}
export function createCaptureDesk({raw,filename='capture.json',evidence='OPERATOR_CAPTURE',id,title='BlockRun capture review',at=new Date().toISOString()}){
 const selected=capture(raw,filename,evidence);const state={schema:'tjlabs.blockrun-capture-desk.v1',id,createdAt:time(at),title,captures:[selected.record],events:[]};addEvent(state,'capture.add',{captureSha256:selected.record.sha256},at);return validateCaptureDesk(state);
}
export function appendDeskCapture(input,{raw,filename='capture.json',evidence='OPERATOR_CAPTURE',at=new Date().toISOString()}){
 const state=validateCaptureDesk(input),selected=capture(raw,filename,evidence);
 if(state.captures.some(c=>c.sha256===selected.record.sha256))return state;
 requireValue(state.captures.length<128,'CAPTURE_HISTORY_LIMIT');state.captures.push(selected.record);addEvent(state,'capture.add',{captureSha256:selected.record.sha256},at);return validateCaptureDesk(state);
}
export function saveDeskReview(input,{captureSha256,subject='@capture',reviewer,status,note='',at=new Date().toISOString()}){
 const state=validateCaptureDesk(input);addEvent(state,'review.save',{captureSha256,subject,reviewer,status,note},at);return validateCaptureDesk(state);
}
export function renameCaptureDesk(input,{title,at=new Date().toISOString()}){const state=validateCaptureDesk(input);addEvent(state,'title.set',{title},at);return validateCaptureDesk(state);}
export function describeCaptureDesk(input,selectedSha){
 const state=validateCaptureDesk(input),record=state.captures.find(c=>c.sha256===selectedSha)||state.captures[state.captures.length-1];
 const projection=projectBlockrunUsageCapture(JSON.parse(record.raw));const reviews=new Map();let title=state.title;
 for(const e of state.events){if(e.action==='review.save'&&e.value.captureSha256===record.sha256)reviews.set(e.value.subject,{...e.value,at:e.at,sequence:e.sequence});if(e.action==='title.set')title=e.value.title;}
 return {id:state.id,title,revision:state.events.length,head:head(state),record:clone(record),projection,reviews:[...reviews.values()],history:state.events.filter(e=>e.action==='review.save'&&e.value.captureSha256===record.sha256).map(clone),captures:state.captures.map(c=>({sha256:c.sha256,filename:c.filename,evidence:c.evidence,bytes:utf8(c.raw).length})),source:clone(SOURCE)};
}
export function compareDeskCaptures(input,earlierSha,laterSha){
 const state=validateCaptureDesk(input);const a=state.captures.find(c=>c.sha256===earlierSha),b=state.captures.find(c=>c.sha256===laterSha);requireValue(a&&b,'COMPARISON_CAPTURE_NOT_FOUND');
 const first=projectBlockrunUsageCapture(JSON.parse(a.raw)),second=projectBlockrunUsageCapture(JSON.parse(b.raw));
 const sameSelection=canonicalDesk(first.selection)===canonicalDesk(second.selection);if(!sameSelection)return {sameSelection:false,earlierSha,laterSha,added:[],removed:[],changed:[]};
 const left=new Map(first.rows.map(r=>[r.requestId,r.original])),right=new Map(second.rows.map(r=>[r.requestId,r.original]));
 return {sameSelection:true,earlierSha,laterSha,added:[...right.keys()].filter(k=>!left.has(k)),removed:[...left.keys()].filter(k=>!right.has(k)),changed:[...right.keys()].filter(k=>left.has(k)&&canonicalDesk(left.get(k))!==canonicalDesk(right.get(k)))};
}
function packageText(state,withDigest=true){const body={schema:'tjlabs.blockrun-capture-desk-package.v1',source:clone(SOURCE),state};return JSON.stringify({...body,sha256:withDigest?sha256(canonicalDesk(body)):'0'.repeat(64)},null,2)+'\n';}
export function exportCaptureDesk(input){return packageText(validateCaptureDesk(input));}
export function receiveCaptureDesk(raw){string(raw,'DESK_PACKAGE_REQUIRED',MAX_BYTES*2);requireValue(utf8(raw).length<=MAX_BYTES*2,'DESK_PACKAGE_TOO_LARGE');const value=JSON.parse(raw);fields(value,['schema','source','state','sha256'],'INVALID_DESK_PACKAGE');requireValue(value.schema==='tjlabs.blockrun-capture-desk-package.v1'&&canonicalDesk(value.source)===canonicalDesk(SOURCE),'DESK_SOURCE_CHANGED');const {sha256:hash,...body}=value;requireValue(hash===sha256(canonicalDesk(body)),'DESK_PACKAGE_CHANGED');return validateCaptureDesk(value.state);}
export function deskRowsCsv(input,selectedSha){const d=describeCaptureDesk(input,selectedSha);const notes=new Map(d.reviews.map(r=>[r.subject,r]));const cell=v=>{let s=String(v??'');if(/^[=+@\t\r-]/.test(s))s="'"+s;return '"'+s.replace(/"/g,'""')+'"';};const rows=[['request_id','timestamp','endpoint','job_id','correction_of','cost_state','reported_usd_text','review_status','reviewer','note'],...d.projection.rows.map(r=>{const n=notes.get('row:'+r.requestId);return[r.requestId,r.timestamp,r.endpoint,r.jobId,r.correctionOf,r.costState,r.reportedUsd===null?'Pending':'USD '+r.reportedUsd,n?.status||'UNREVIEWED',n?.reviewer||'',n?.note||''];})];return rows.map(r=>r.map(cell).join(',')).join('\r\n')+'\r\n';}
