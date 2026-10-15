'use strict';
module.exports=(function sessionFactory(Core,SHA){
"use strict";
const SCHEMA="placement.source-session/v1";
const frozen=new WeakSet(),digestCache=new WeakMap(),studyCache=new WeakSet(),rootCache=new Map();
const clone=x=>JSON.parse(JSON.stringify(x)),now=()=>new Date().toISOString();
function freezeDeep(x){if(!x||typeof x!=="object"||frozen.has(x))return x;for(const v of Object.values(x))freezeDeep(v);Object.freeze(x);frozen.add(x);return x;}
function hash(x){if(x&&typeof x==="object"&&frozen.has(x)&&digestCache.has(x))return digestCache.get(x);const h=SHA.sha256Utf8(JSON.stringify(x)).sha256;if(x&&typeof x==="object"&&frozen.has(x))digestCache.set(x,h);return h;}
function checkedStudy(st){if(studyCache.has(st))return st;shape(st);freezeDeep(st);studyCache.add(st);return st;}

function assert(ok,msg){if(!ok)throw Error(msg);}
function shape(s){return Core.validate(s);}

const LIMIT=40*1024*1024,LEGACY="placement.source-session/legacy",collections=["originals","documents","document_links","extracts","crosswalks","reviews"];
function create(study=Core.empty()){checkedStudy(study);return {schema:SCHEMA,id:"session-"+Date.now()+"-"+Math.random().toString(36).slice(2,8),revision:0,study:checkedStudy(clone(study)),drafts:{},view:"study",selection:{},history:[],backups:[],archive:{},saved_at:null};}
function put(bank,value){const key=hash(value);if(!Object.hasOwn(bank,key)){bank[key]=freezeDeep(value);if(value&&typeof value==="object")digestCache.set(value,key);}return key;}
function get(bank,key){assert(typeof key==="string"&&Object.hasOwn(bank,key),"Missing retained object "+key);return bank[key];}
function packStudy(bank,study){const x={kind:"study",schema:study.schema,id:study.id,config:put(bank,study.config),notes:put(bank,study.notes)};for(const k of collections)x[k]=study[k].map(row=>put(bank,row));return put(bank,x);}
function studyAt(s,key){const b=get(s.archive,key);assert(b.kind==="study","Invalid retained study");const x={schema:b.schema,id:b.id,config:clone(get(s.archive,b.config)),notes:get(s.archive,b.notes)};for(const k of collections){assert(Array.isArray(b[k]),"Invalid retained study collection");x[k]=b[k].map(r=>clone(get(s.archive,r)));}return x;}
function bodyAt(s,key){const b=get(s.archive,key);assert(b.kind==="session","Invalid retained session");return {schema:SCHEMA,id:b.id,revision:b.revision,study:studyAt(s,b.study_ref),drafts:clone(get(s.archive,b.drafts_ref)),view:b.view,selection:clone(get(s.archive,b.selection_ref)),history:clone(b.history),backups:[],archive:{...s.archive},saved_at:b.saved_at};}
function branchInfo(s,b){const p=get(s.archive,b.session_ref),st=get(s.archive,p.study_ref);return {title:get(s.archive,st.config).label,revision:p.revision};}
function branchSession(s,b){const x=bodyAt(s,b.session_ref);x.backups=clone(s.backups);return validate(x);}
function historyStudy(s,h){return studyAt(s,h.study_ref);}
function byteLength(str){let n=0;for(let i=0;i<str.length;i++){const c=str.charCodeAt(i);if(c<128)n++;else if(c<2048)n+=2;else if(c>=0xd800&&c<=0xdbff&&i+1<str.length&&str.charCodeAt(i+1)>=0xdc00&&str.charCodeAt(i+1)<=0xdfff){n+=4;i++;}else n+=3;}return n;}
function validate(s){
 assert(s&&s.schema===SCHEMA,"Unsupported session schema");assert(typeof s.id==="string"&&Number.isSafeInteger(s.revision)&&s.revision>=0,"Invalid session identity/revision");checkedStudy(s.study);
 assert(s.drafts&&typeof s.drafts==="object"&&!Array.isArray(s.drafts),"Invalid draft forms");assert(s.selection&&typeof s.selection==="object"&&!Array.isArray(s.selection),"Invalid selection");assert(typeof s.view==="string"&&Array.isArray(s.history)&&Array.isArray(s.backups),"Invalid session views/history/backups");
 assert(s.archive&&typeof s.archive==="object"&&!Array.isArray(s.archive),"Invalid recovery object bank");
 for(const [k,v] of Object.entries(s.archive)){assert(/^[a-f0-9]{64}$/.test(k)&&hash(v)===k,"Retained object changed: "+k);freezeDeep(v);if(v&&typeof v==="object")digestCache.set(v,k);}
 const seenStudies=new Set(),checkStudy=k=>{if(seenStudies.has(k))return;seenStudies.add(k);const p=get(s.archive,k);assert(p.kind==="study","Invalid study root");if(rootCache.has(k)){for(const ref of rootCache.get(k))get(s.archive,ref);}else{shape(studyAt(s,k));rootCache.set(k,[p.config,p.notes,...collections.flatMap(c=>p[c])]);}};
 const checkHistory=arr=>{assert(Array.isArray(arr),"Invalid retained history");for(const h of arr){assert(h&&typeof h.reason==="string"&&typeof h.at==="string","Invalid history");checkStudy(h.study_ref);}};
 checkHistory(s.history);
 for(const b of s.backups){assert(b&&b.hash===b.session_ref&&typeof b.reason==="string"&&typeof b.at==="string","Invalid retained branch");const p=get(s.archive,b.session_ref);assert(p.kind==="session"&&p.schema===SCHEMA&&typeof p.id==="string"&&Number.isSafeInteger(p.revision),"Invalid retained branch identity");checkStudy(p.study_ref);assert(get(s.archive,p.drafts_ref)&&typeof get(s.archive,p.drafts_ref)==="object","Invalid retained forms");get(s.archive,p.selection_ref);checkHistory(p.history);}
 assert(byteLength(JSON.stringify(s))<=LIMIT,"Complete session exceeds 40 MiB. Pending input must be saved with the emergency recovery download.");return s;
}
function normalize(input){
 if(input?.schema===SCHEMA)return validate(input);
 assert(input?.schema===LEGACY,"Unsupported session schema");const old=clone(input),out=create(shape(old.study));out.id=old.id;out.revision=old.revision;out.drafts=old.drafts;out.view=old.view;out.selection=old.selection;out.saved_at=old.saved_at;
 for(const h of old.history||[])out.history.push({at:h.at,reason:h.reason,study_ref:packStudy(out.archive,shape(h.study))});
 let x=out;for(const b of old.backups||[]){assert(b&&hash(b.session)===b.hash,"Legacy retained branch changed");const child=normalize(b.session);x=retain(x,child,b.reason);}
 return validate(x);
}
function retain(s,other,reason){validate(other);const bank={...s.archive,...other.archive},body={kind:"session",schema:SCHEMA,id:other.id,revision:other.revision,study_ref:packStudy(bank,other.study),drafts_ref:put(bank,clone(other.drafts)),view:other.view,selection_ref:put(bank,clone(other.selection)),history:clone(other.history),saved_at:other.saved_at},h=put(bank,body);
 const all=[...s.backups,...other.backups,{hash:h,session_ref:h,at:now(),reason}],seen=new Set();return {...s,drafts:clone(s.drafts),selection:clone(s.selection),archive:bank,backups:all.filter(a=>!seen.has(a.hash)&&seen.add(a.hash))};}
function retainStudy(s,study,reason,at=now()){checkedStudy(study);const bank={...s.archive},study_ref=packStudy(bank,study);return validate({...s,archive:bank,history:[...s.history,{at,reason,study_ref}]});}
function checkpoint(s,nextStudy,reason){checkedStudy(nextStudy);const bank={...s.archive},study_ref=packStudy(bank,s.study);return validate({...s,drafts:clone(s.drafts),selection:clone(s.selection),study:clone(nextStudy),archive:bank,history:[...s.history,{at:now(),reason,study_ref}],revision:s.revision+1,saved_at:null});}
function draft(s,key,value){return validate({...s,drafts:{...s.drafts,[key]:clone(value)},revision:s.revision+1,saved_at:null});}
function use(s,study,reason){let x=retain(s,s,reason);x=checkpoint(x,study,reason);return {...x,drafts:{},selection:{},view:"study"};}
function takeSession(s,other,reason){other=normalize(other);let x=retain(other,s,reason);x=retain(x,other,"Imported/opened session preimage");return validate({...x,revision:x.revision+1,saved_at:null});}
function reviewDraft(s){return{study_sha256:Core.digest(s.study),role:s.study.config.placement.required_review_roles[0],reviewer:"",at:now(),decision:"revise",notes:""};}
function recordReview(s,value){return checkpoint(s,Core.review(s.study,value),"Record operator review");}
function assess(s){try{return{ok:true,result:Core.analyze(s.study)}}catch(e){return{ok:false,error:e.message};}}
function exports(s){validate(s);return[{path:"session.json",content:Core.json(s)},...Core.exports(s.study),{path:"recovery/index.json",content:Core.json({schema:"placement.source-recovery/v1",session:"../session.json",branches:s.backups,history:s.history,guide:"The complete session carries every unfinished form and retained branch. Open it in Recurring Placement Study Desk."})}];}
return{assess,exports,SCHEMA,LEGACY,LIMIT,clone,hash,shape,create,validate,normalize,retain,retainStudy,checkpoint,draft,use,takeSession,historyStudy,branchSession,branchInfo,reviewDraft,recordReview,byteLength};
})(require('./core.cjs'),require('./sha256.cjs'));
