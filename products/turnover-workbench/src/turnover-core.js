/* Copyright TokenJunkieLabs. Source-native cut/cue review; no network or media writes. */
function createTurnoverCore(){
"use strict";
  const fail=message=>{throw Error(message)},bytes=value=>value instanceof Uint8Array?value:Uint8Array.from(value);
  function utf8Encode(text) {
    const out = [];
    for (let i = 0; i < text.length; i++) {
      let c = text.charCodeAt(i);
      if (c >= 0xd800 && c <= 0xdbff) {
        const low = text.charCodeAt(++i);
        if (!(low >= 0xdc00 && low <= 0xdfff)) fail("unpaired UTF-16 surrogate");
        c = 0x10000 + ((c - 0xd800) << 10) + low - 0xdc00;
      } else if (c >= 0xdc00 && c <= 0xdfff) fail("unpaired UTF-16 surrogate");
      if (c < 0x80) out.push(c);
      else if (c < 0x800) out.push(0xc0 | (c >>> 6), 0x80 | (c & 63));
      else if (c < 0x10000) out.push(0xe0 | (c >>> 12), 0x80 | ((c >>> 6) & 63), 0x80 | (c & 63));
      else out.push(0xf0 | (c >>> 18), 0x80 | ((c >>> 12) & 63), 0x80 | ((c >>> 6) & 63), 0x80 | (c & 63));
    }
    return Uint8Array.from(out);
  }
  const shaK = Uint32Array.from([
    0x428a2f98,0x71374491,0xb5c0fbcf,0xe9b5dba5,0x3956c25b,0x59f111f1,0x923f82a4,0xab1c5ed5,
    0xd807aa98,0x12835b01,0x243185be,0x550c7dc3,0x72be5d74,0x80deb1fe,0x9bdc06a7,0xc19bf174,
    0xe49b69c1,0xefbe4786,0x0fc19dc6,0x240ca1cc,0x2de92c6f,0x4a7484aa,0x5cb0a9dc,0x76f988da,
    0x983e5152,0xa831c66d,0xb00327c8,0xbf597fc7,0xc6e00bf3,0xd5a79147,0x06ca6351,0x14292967,
    0x27b70a85,0x2e1b2138,0x4d2c6dfc,0x53380d13,0x650a7354,0x766a0abb,0x81c2c92e,0x92722c85,
    0xa2bfe8a1,0xa81a664b,0xc24b8b70,0xc76c51a3,0xd192e819,0xd6990624,0xf40e3585,0x106aa070,
    0x19a4c116,0x1e376c08,0x2748774c,0x34b0bcb5,0x391c0cb3,0x4ed8aa4a,0x5b9cca4f,0x682e6ff3,
    0x748f82ee,0x78a5636f,0x84c87814,0x8cc70208,0x90befffa,0xa4506ceb,0xbef9a3f7,0xc67178f2
  ]);
  const rotate = (x, n) => (x >>> n) | (x << (32 - n));
  function sha256(input) {
    const a = typeof input === "string" ? utf8Encode(input) : bytes(input);
    const n = a.length, padded = new Uint8Array(Math.ceil((n + 9) / 64) * 64);
    padded.set(a); padded[n] = 128;
    const high = Math.floor(n / 0x20000000), low = (n * 8) >>> 0;
    for (let i = 0; i < 4; i++) {
      padded[padded.length - 8 + i] = (high >>> (24 - i * 8)) & 255;
      padded[padded.length - 4 + i] = (low >>> (24 - i * 8)) & 255;
    }
    const h = Uint32Array.from([0x6a09e667,0xbb67ae85,0x3c6ef372,0xa54ff53a,0x510e527f,0x9b05688c,0x1f83d9ab,0x5be0cd19]);
    const w = new Uint32Array(64);
    for (let offset = 0; offset < padded.length; offset += 64) {
      for (let i = 0; i < 16; i++) {
        const p = offset + i * 4;
        w[i] = ((padded[p] << 24) | (padded[p + 1] << 16) | (padded[p + 2] << 8) | padded[p + 3]) >>> 0;
      }
      for (let i = 16; i < 64; i++) {
        const x = w[i - 15], y = w[i - 2];
        w[i] = ((rotate(x,7) ^ rotate(x,18) ^ (x >>> 3)) + w[i - 16] +
                (rotate(y,17) ^ rotate(y,19) ^ (y >>> 10)) + w[i - 7]) >>> 0;
      }
      let [v0,v1,v2,v3,v4,v5,v6,v7] = h;
      for (let i = 0; i < 64; i++) {
        const t1 = (v7 + (rotate(v4,6) ^ rotate(v4,11) ^ rotate(v4,25)) +
                    ((v4 & v5) ^ (~v4 & v6)) + shaK[i] + w[i]) >>> 0;
        const t2 = ((rotate(v0,2) ^ rotate(v0,13) ^ rotate(v0,22)) +
                    ((v0 & v1) ^ (v0 & v2) ^ (v1 & v2))) >>> 0;
        v7=v6;v6=v5;v5=v4;v4=(v3+t1)>>>0;v3=v2;v2=v1;v1=v0;v0=(t1+t2)>>>0;
      }
      for (const [i,v] of [v0,v1,v2,v3,v4,v5,v6,v7].entries()) h[i] = (h[i] + v) >>> 0;
    }
    return Array.from(h, v => v.toString(16).padStart(8,"0")).join("");
  }

const SCHEMA="tjlabs.turnover-workspace.v1",EDITION="tjlabs.turnover-edition.v1";
const EVENT_COLUMNS=["event_id","clip_id","track","record_in","record_out","source_in","source_out","use_id","label"];
const CUE_COLUMNS=["cue_id","department","label","old_event_id","source_in","source_out"];
const clone=value=>JSON.parse(JSON.stringify(value));
const object=(v,label)=>{if(!v||typeof v!=="object"||Array.isArray(v))throw Error(label+" must be an object");return v};
const text=(v,label,required=false)=>{if(typeof v!=="string"||(required&&!v.trim()))throw Error(label+" must be "+(required?"a nonempty ":"a ")+"string");return v};
function canonical(v){
 if(v===null||typeof v==="boolean"||typeof v==="string")return JSON.stringify(v);
 if(typeof v==="number"&&Number.isFinite(v))return JSON.stringify(v);
 if(Array.isArray(v))return "["+v.map(canonical).join(",")+"]";
 if(v&&typeof v==="object")return "{"+Object.keys(v).sort().map(k=>JSON.stringify(k)+":"+canonical(v[k])).join(",")+"}";
 throw Error("Nonportable value");
}
const digest=v=>sha256(typeof v==="string"?v:canonical(v));
const esc=v=>String(v??"").replace(/[&<>"']/g,c=>({"&":"&amp;","<":"&lt;",">":"&gt;",'"':"&quot;","'":"&#39;"}[c]));
function integer(value,label){
 if(typeof value==="number"){if(!Number.isSafeInteger(value))throw Error(label+" must be an exact integer string");value=String(value)}
 if(typeof value!=="string"||!/^(0|-?[1-9]\d*)$/.test(value))throw Error(label+" must be a canonical integer frame count");
 return BigInt(value);
}
function rate(value){
 object(value,"Frame rate");const n=integer(value.numerator,"Rate numerator"),d=integer(value.denominator,"Rate denominator");
 if(n<=0n||d<=0n)throw Error("Frame rate must be positive");
 let a=n,b=d;while(b){const next=a%b;a=b;b=next}
 return {numerator:n.toString(),denominator:d.toString(),normalized:{numerator:(n/a).toString(),denominator:(d/a).toString()},convention:"integer frames; half-open [in,out); one declared common rate; 1:1 source speed"};
}
function parseCSV(original,required,label){
 text(original,label);let s=original.charCodeAt(0)===0xfeff?original.slice(1):original;
 const rows=[];let row=[],cell="",quoted=false,closed=false,started=false;
 for(let i=0;i<s.length;i++){
  const c=s[i];if(quoted){if(c==='"'){if(s[i+1]==='"'){cell+='"';i++}else{quoted=false;closed=true}}else cell+=c;continue}
  if(closed&&c!==","&&c!=="\r"&&c!=="\n")throw Error(label+": characters after closing quote");
  if(c==='"'){if(cell||started||closed)throw Error(label+": quote inside unquoted cell");quoted=true;started=true}
  else if(c===","){row.push(cell);cell="";closed=false;started=false}
  else if(c==="\r"||c==="\n"){if(c==="\r"&&s[i+1]==="\n")i++;row.push(cell);rows.push(row);row=[];cell="";closed=false;started=false}
  else{cell+=c;started=true}
 }
 if(quoted)throw Error(label+": unterminated quoted cell");
 if(cell||row.length||started||closed) {row.push(cell);rows.push(row)}
 if(!rows.length)throw Error(label+": header required");
 const header=rows.shift();if(header.some(x=>!x)||new Set(header).size!==header.length)throw Error(label+": blank or duplicate header");
 for(const k of required)if(!header.includes(k))throw Error(label+": missing column "+k);
 if(rows.length>10000)throw Error(label+": more than 10,000 rows; split the explicit comparison scope");
 return rows.map((cells,index)=>{if(cells.length!==header.length)throw Error(label+": row "+(index+2)+" has "+cells.length+" cells; expected "+header.length);const r=Object.create(null);header.forEach((k,i)=>r[k]=cells[i]);return r});
}
function original(value,label){
 object(value,label);const name=text(value.name,label+".name",true),body=text(value.text,label+".text");
 return {name,text:body,bytes:utf8Encode(body).length,sha256:sha256(body)};
}
function verifyOriginal(v,label){const normalized=original(v,label);if(v.bytes!==normalized.bytes||v.sha256!==normalized.sha256)throw Error(label+" original byte identity differs");return normalized}
function events(src,label){
 const parsed=parseCSV(src.text,EVENT_COLUMNS.slice(0,7),label),ids=new Set,uses=new Set;
 for(const r of parsed){
  for(const k of ["event_id","clip_id","track"])text(r[k],label+"."+k,true);
  if(ids.has(r.event_id))throw Error(label+": duplicate event_id "+r.event_id);ids.add(r.event_id);
  r.use_id=r.use_id||"";r.label=r.label||"";
  if(r.use_id){if(uses.has(r.use_id))throw Error(label+": duplicate persistent use_id "+r.use_id);uses.add(r.use_id)}
  const ri=integer(r.record_in,"record_in"),ro=integer(r.record_out,"record_out"),si=integer(r.source_in,"source_in"),so=integer(r.source_out,"source_out");
  if(ro<=ri||so<=si)throw Error(label+": nonpositive range for "+r.event_id);
  if(ro-ri!==so-si)throw Error(label+": retime/non-1:1 event requires an explicit external mapping; "+r.event_id);
 }
 return parsed;
}
function cues(src,oldRows){
 const parsed=parseCSV(src.text,CUE_COLUMNS,"Cues"),oldMap=new Map(oldRows.map(r=>[r.event_id,r])),ids=new Set;
 for(const r of parsed){
  for(const k of ["cue_id","department","old_event_id"])text(r[k],"cue."+k,true);
  if(ids.has(r.cue_id))throw Error("Duplicate cue_id "+r.cue_id);ids.add(r.cue_id);
  const event=oldMap.get(r.old_event_id);if(!event)throw Error("Cue "+r.cue_id+" refers to missing old event");
  const start=integer(r.source_in,"cue.source_in"),end=integer(r.source_out,"cue.source_out");
  if(end<=start||start<integer(event.source_in)||end>integer(event.source_out))throw Error("Cue "+r.cue_id+" must be a positive interval within its explicit old event");
 }
 return parsed;
}
const min=(a,b)=>a<b?a:b,max=(a,b)=>a>b?a:b;
function overlap(a,b){const start=max(integer(a.source_in),integer(b.source_in)),end=min(integer(a.source_out),integer(b.source_out));return end>start?{start,end}:null}
function buildEdition(payload){
 object(payload,"Edition payload");text(payload.id,"Edition id",true);text(payload.label,"Edition label",true);text(payload.notes,"Edition notes");
 const checkedRate=rate(payload.rate),old=verifyOriginal(payload.old,"Old cut"),next=verifyOriginal(payload.next,"New cut"),cueSource=verifyOriginal(payload.cues,"Cue source");
 const oldRows=events(old,"Old cut"),newRows=events(next,"New cut"),cueRows=cues(cueSource,oldRows);
 const pairSha256=digest({rate:checkedRate,old:old.sha256,next:next.sha256,cues:cueSource.sha256});
 return {schema:EDITION,id:payload.id,label:payload.label,rate:checkedRate,notes:payload.notes,old,next,cues:cueSource,pairSha256,oldRows,newRows,cueRows};
}
function comparison(edition){
 const old=edition.oldRows,next=edition.newRows,newUse=new Map(next.filter(x=>x.use_id).map(x=>[x.use_id,x]));
 const sameClip=(a,b)=>a.clip_id===b.clip_id;
 const eventChanges=old.map(o=>{
  const persistent=o.use_id?newUse.get(o.use_id):null;
  let candidates=next.filter(n=>sameClip(o,n)&&overlap(o,n));
  let identity="source-overlap",ambiguous=false,reasons=[];
  if(persistent){
   candidates=sameClip(o,persistent)&&overlap(o,persistent)?[persistent]:[];
   identity="persistent-use";
   if(!candidates.length)reasons.push("The same persistent use now refers to a different clip or a nonoverlapping source range.");
  }else if(o.use_id){ambiguous=true;reasons.push("The declared persistent use_id is absent in the new cut; source-overlap candidates need explicit selection.")}
  if(identity!=="persistent-use"){
   if(candidates.length!==1)ambiguous=candidates.length>1||ambiguous;
   if(candidates.some(n=>old.filter(x=>sameClip(x,n)&&overlap(x,n)).length!==1)){ambiguous=true;reasons.push("Repeated or overlapping use of this source has more than one old/new occurrence.")}
  }
  let status;
  const changes=[];
  if(!candidates.length)status=persistent?"source-replaced":"removed";
  else if(ambiguous)status="ambiguous";
  else{
   const n=candidates[0];
   if(o.record_in!==n.record_in||o.record_out!==n.record_out)changes.push("record-position-or-duration");
   if(o.source_in!==n.source_in||o.source_out!==n.source_out)changes.push("source-range");
   if(o.track!==n.track)changes.push("track");
   const sameRange=o.source_in===n.source_in&&o.source_out===n.source_out;
   status=sameRange?(o.record_in===n.record_in&&o.track===n.track?"unchanged":"moved"):"trimmed-or-extended";
  }
  return {oldEventId:o.event_id,clipId:o.clip_id,useId:o.use_id,identity,status,ambiguous,reasons,changes,candidateNewEventIds:candidates.map(n=>n.event_id),old:clone(o),candidates:clone(candidates),persistentReplacementId:persistent&&!candidates.length?persistent.event_id:null};
 });
 const byOld=new Map(eventChanges.map(x=>[x.oldEventId,x]));
 const cueResults=edition.cueRows.map(c=>{
  const change=byOld.get(c.old_event_id),o=change.old,ci=integer(c.source_in),co=integer(c.source_out);
  const mappings=change.candidates.flatMap(n=>{
   const start=max(ci,integer(n.source_in)),end=min(co,integer(n.source_out));if(end<=start)return [];
   const ri=integer(n.record_in)+start-integer(n.source_in),ro=ri+end-start;
   const oldRi=integer(o.record_in)+start-integer(o.source_in);
   const mapping={newEventId:n.event_id,newTrack:n.track,clipId:n.clip_id,useId:n.use_id,sourceIn:start.toString(),sourceOut:end.toString(),recordIn:ri.toString(),recordOut:ro.toString(),deltaFrames:(ri-oldRi).toString(),coverage:start===ci&&end===co?"full":"partial",omittedHeadFrames:(start-ci).toString(),omittedTailFrames:(co-end).toString()};
   return [{id:"mapping-"+digest({pair:edition.pairSha256,cueId:c.cue_id,...mapping}).slice(0,24),...mapping}];
  });
  let status=change.ambiguous?"ambiguous":!mappings.length?(change.status==="source-replaced"?"source-replaced":"removed"):mappings.length!==1?"ambiguous":mappings[0].coverage==="partial"?"partial":mappings[0].deltaFrames==="0"&&mappings[0].newTrack===o.track?"unchanged":"moved";
  return {cueId:c.cue_id,department:c.department,label:c.label,oldEventId:c.old_event_id,clipId:o.clip_id,sourceIn:c.source_in,sourceOut:c.source_out,oldRecordIn:(integer(o.record_in)+ci-integer(o.source_in)).toString(),oldRecordOut:(integer(o.record_in)+co-integer(o.source_in)).toString(),status,identity:change.identity,reasons:clone(change.reasons),mappings,canAcceptProposal:["unchanged","moved"].includes(status)&&mappings.length===1&&mappings[0].coverage==="full",cueSha256:digest({pair:edition.pairSha256,cue:c})};
 });
 const associated=new Set(eventChanges.flatMap(x=>x.candidateNewEventIds));
 const addedEvents=next.filter(n=>!associated.has(n.event_id)).map(n=>({newEventId:n.event_id,reason:old.some(o=>o.use_id&&o.use_id===n.use_id)?"persistent occurrence replaced its source":"no overlapping old source occurrence",event:clone(n)}));
 const counts={oldEvents:old.length,newEvents:next.length,cues:cueResults.length,addedEvents:addedEvents.length};
 for(const c of cueResults)counts[c.status]=(counts[c.status]||0)+1;
 return {schema:"tjlabs.turnover-comparison.v1",editionId:edition.id,label:edition.label,pairSha256:edition.pairSha256,rate:clone(edition.rate),eventChanges,addedEvents,cues:cueResults,counts};
}
function baseHash(w){return digest({schema:w.schema,id:w.id,label:w.label})}
function create(value){
 object(value,"Workspace identity");return {schema:SCHEMA,id:text(value.id,"Workspace id",true),label:text(value.label,"Workspace label",true),revision:0,head:digest({schema:SCHEMA,id:value.id,label:value.label}),commands:[]};
}
function reviewRecord(state,p){
 object(p,"Review");for(const k of ["id","editionId","cueId","decision","reviewer","reason","pairSha256","cueSha256"])text(p[k],"Review "+k,true);
 const e=state.editions.get(p.editionId);if(!e)throw Error("Review refers to an unknown edition");
 const comp=comparison(e),cue=comp.cues.find(c=>c.cueId===p.cueId);if(!cue)throw Error("Review refers to an unknown cue");
 if(p.pairSha256!==e.pairSha256||p.cueSha256!==cue.cueSha256)throw Error("Review belongs to a different source pair or cue");
 const key=JSON.stringify([p.editionId,p.cueId]),prev=state.currentReview.get(key)||null;
 if(p.previousReviewId!==(prev?prev.id:null))throw Error("Review correction must retain the preceding review");
 if(!["accept-proposal","choose-mapping","keep-original","exclude","needs-work"].includes(p.decision))throw Error("Unknown review decision");
 let selected=null;
 if(p.decision==="accept-proposal"){
  if(!cue.canAcceptProposal)throw Error("This cue requires an explicit mapping or an unresolved decision");
  selected=cue.mappings[0];if(p.selectedMapping!==null&&p.selectedMapping!==selected.id)throw Error("Selected proposal differs");
 }else if(p.decision==="choose-mapping"){
  selected=cue.mappings.find(m=>m.id===p.selectedMapping);if(!selected)throw Error("Choose a mapping from this exact source pair");
 }else if(p.selectedMapping!==null)throw Error("This decision must not retain an unrelated selected mapping");
 if(p.receivingEvidence!==null)verifyOriginal(p.receivingEvidence,"Review evidence");
 const rec={...clone(p),selectedMapping:selected?selected.id:null,mapping:selected?clone(selected):null,sourceStatus:cue.status,mediaAction:"review record only"};
 state.reviews.push(rec);state.currentReview.set(key,rec);return rec;
}
function noteRecord(state,p){
 object(p,"Receiving note");for(const k of ["id","editionId","cueId","reviewId","receiver","status","reference","notes","pairSha256"])text(p[k],"Receiving "+k,k!=="notes");
 if(!["received","accepted","needs-rework"].includes(p.status))throw Error("Unknown receiving status");
 const key=JSON.stringify([p.editionId,p.cueId]),review=state.currentReview.get(key);
 if(!review||review.id!==p.reviewId||review.pairSha256!==p.pairSha256)throw Error("Receiving note must name the current exact review and source pair");
 if(p.status==="accepted"&&review.decision==="needs-work")throw Error("Unresolved review cannot be accepted; append its resolved review first");
 if(p.evidence!==null)verifyOriginal(p.evidence,"Receiving evidence");
 state.receiving.push(clone(p));state.currentReceiving.set(key,clone(p));
}
function replay(value){
 const w=clone(value);object(w,"Workspace");if(w.schema!==SCHEMA)throw Error("Unknown workspace schema");text(w.id,"Workspace id",true);text(w.label,"Workspace label",true);
 if(!Array.isArray(w.commands)||w.commands.length>10000)throw Error("commands must be an array of at most 10,000 retained operations");
 if(w.revision!==w.commands.length)throw Error("Workspace revision differs from retained operations");
 const state={workspace:w,editions:new Map,reviews:[],receiving:[],currentReview:new Map,currentReceiving:new Map};
 let previous=baseHash(w);const commandIds=new Set;
 for(const [index,c]of w.commands.entries()){
  object(c,"Command");text(c.id,"Command id",true);if(commandIds.has(c.id))throw Error("Duplicate command id");commandIds.add(c.id);
  if(c.sequence!==index+1||c.previous!==previous)throw Error("Command sequence or prior source identity differs");
  if(c.sha256!==digest({id:c.id,sequence:c.sequence,type:c.type,payload:c.payload,previous:c.previous}))throw Error("Command content differs from retained identity");
  if(c.type==="receive"){
   const e=buildEdition(c.payload);if(state.editions.has(e.id))throw Error("Duplicate edition id");state.editions.set(e.id,e);
  }else if(c.type==="review"){
   if(c.payload.id!=="review-"+(state.reviews.length+1))throw Error("Review sequence differs");reviewRecord(state,c.payload);
  }else if(c.type==="receiving"){
   if(c.payload.id!=="receiving-"+(state.receiving.length+1))throw Error("Receiving sequence differs");noteRecord(state,c.payload);
  }else throw Error("Unknown command type");
  previous=c.sha256;
 }
 if(w.head!==previous)throw Error("Workspace head differs");return state;
}
function reopen(value){return replay(typeof value==="string"?JSON.parse(value):value).workspace}
function append(workspace,type,payload,options={}){
 const state=replay(workspace),w=state.workspace;
 if(options.expectedRevision!==undefined&&options.expectedRevision!==w.revision)throw Error("Workspace changed since this action was prepared");
 const id=options.commandId||"command-"+(w.commands.length+1);
 if(w.commands.some(c=>c.id===id))throw Error("Command already retained; reopen the complete saved result");
 const command={id,sequence:w.commands.length+1,type,payload:clone(payload),previous:w.head};command.sha256=digest(command);
 const next={...w,revision:w.revision+1,head:command.sha256,commands:[...w.commands,command]};replay(next);return next;
}
function receive(workspace,p){
 object(p,"Receive request");
 const payload={id:text(p.id,"Edition id",true),label:text(p.label,"Edition label",true),rate:rate(p.rate),old:original(p.old,"Old cut"),next:original(p.next,"New cut"),cues:original(p.cues,"Cues"),notes:text(p.notes??"","Edition notes")};
 return append(workspace,"receive",payload,p);
}
function compare(workspace,editionId){
 const state=replay(workspace),edition=state.editions.get(editionId);if(!edition)throw Error("Unknown edition");
 const result=comparison(edition);
 result.cues=result.cues.map(c=>{const key=JSON.stringify([editionId,c.cueId]),review=state.currentReview.get(key)||null,lastNote=state.currentReceiving.get(key)||null;return {...c,review:clone(review),receiving:clone(lastNote),receivingCurrent:!!(review&&lastNote&&lastNote.reviewId===review.id),reviewHistory:state.reviews.filter(r=>r.editionId===editionId&&r.cueId===c.cueId),receivingHistory:state.receiving.filter(r=>r.editionId===editionId&&r.cueId===c.cueId)}});
 result.counts.reviewed=result.cues.filter(c=>c.review).length;
 result.counts.needsWork=result.cues.filter(c=>!c.review||c.review.decision==="needs-work").length;
 result.counts.receivedCurrent=result.cues.filter(c=>c.receivingCurrent).length;
 return result;
}
function review(workspace,p){
 object(p,"Review request");const state=replay(workspace),e=state.editions.get(p.editionId);if(!e)throw Error("Unknown edition");
 const cue=comparison(e).cues.find(c=>c.cueId===p.cueId);if(!cue)throw Error("Unknown cue");
 const previous=state.currentReview.get(JSON.stringify([p.editionId,p.cueId]))||null;
 const payload={id:"review-"+(state.reviews.length+1),editionId:p.editionId,cueId:p.cueId,decision:p.decision,selectedMapping:p.selectedMapping??null,reviewer:text(p.reviewer,"Reviewer",true),reason:text(p.reason,"Review reason",true),receivingEvidence:p.receivingEvidence?original(p.receivingEvidence,"Review evidence"):null,pairSha256:e.pairSha256,cueSha256:cue.cueSha256,previousReviewId:previous?previous.id:null};
 return append(workspace,"review",payload,p);
}
function receiveNote(workspace,p){
 object(p,"Receiving request");const state=replay(workspace),e=state.editions.get(p.editionId);if(!e)throw Error("Unknown edition");
 const payload={id:"receiving-"+(state.receiving.length+1),editionId:p.editionId,cueId:p.cueId,reviewId:p.reviewId,receiver:text(p.receiver,"Receiver",true),status:p.status,reference:text(p.reference,"Receiving reference",true),notes:text(p.notes??"","Receiving notes"),evidence:p.evidence?original(p.evidence,"Receiving evidence"):null,pairSha256:e.pairSha256};
 return append(workspace,"receiving",payload,p);
}
function editions(workspace){return [...replay(workspace).editions.values()].map(e=>({id:e.id,label:e.label,rate:clone(e.rate),pairSha256:e.pairSha256,notes:e.notes,old:clone(e.old),next:clone(e.next),cues:clone(e.cues),counts:{oldEvents:e.oldRows.length,newEvents:e.newRows.length,cues:e.cueRows.length}}))}
function encodeCSV(columns,rows){
 const cell=value=>{const s=String(value??"");return /[",\r\n]/.test(s)?'"'+s.replace(/"/g,'""')+'"':s};
 return [columns,...rows.map(r=>columns.map(k=>r[k]))].map(r=>r.map(cell).join(",")).join("\r\n")+"\r\n";
}
function csv(workspace,editionId,kind="cues"){
 const result=compare(workspace,editionId);
 if(kind==="events")return encodeCSV(["old_event_id","clip_id","use_id","status","candidate_new_event_ids","reasons"],result.eventChanges.map(e=>({old_event_id:e.oldEventId,clip_id:e.clipId,use_id:e.useId,status:e.status,candidate_new_event_ids:JSON.stringify(e.candidateNewEventIds),reasons:e.reasons.join(" ")})));
 if(kind==="added")return encodeCSV(["new_event_id","clip_id","track","record_in","record_out","source_in","source_out","reason"],result.addedEvents.map(e=>({...e.event,new_event_id:e.newEventId,reason:e.reason})));
 if(kind==="reviews")return encodeCSV(["id","editionId","cueId","decision","selectedMapping","reviewer","reason","pairSha256","cueSha256","previousReviewId","receivingEvidence"],result.cues.flatMap(c=>c.reviewHistory).map(r=>({...r,receivingEvidence:r.receivingEvidence?JSON.stringify(r.receivingEvidence):""})));
 if(kind==="receiving")return encodeCSV(["id","editionId","cueId","reviewId","receiver","status","reference","notes","pairSha256","evidence"],result.cues.flatMap(c=>c.receivingHistory).map(r=>({...r,evidence:r.evidence?JSON.stringify(r.evidence):""})));
 if(kind!=="cues")throw Error("Unknown CSV kind");
 return encodeCSV(["cue_id","department","label","status","old_event_id","old_record_in","old_record_out","mapping_options","decision","selected_new_event_id","new_record_in","new_record_out","coverage","reviewer","reason","receiving_status","receiving_current","pair_sha256"],result.cues.map(c=>{const r=c.review,m=r&&r.mapping;return {cue_id:c.cueId,department:c.department,label:c.label,status:c.status,old_event_id:c.oldEventId,old_record_in:c.oldRecordIn,old_record_out:c.oldRecordOut,mapping_options:JSON.stringify(c.mappings),decision:r?r.decision:"",selected_new_event_id:m?m.newEventId:"",new_record_in:m?m.recordIn:"",new_record_out:m?m.recordOut:"",coverage:m?m.coverage:"",reviewer:r?r.reviewer:"",reason:r?r.reason:"",receiving_status:c.receiving?c.receiving.status:"",receiving_current:c.receivingCurrent,pair_sha256:result.pairSha256}}));
}
function report(workspace,editionId){
 const w=reopen(workspace),edition=editions(w).find(e=>e.id===editionId),result=compare(w,editionId);
 const download=(name,type,body)=>'<a download="'+esc(name)+'" href="data:'+type+';charset=utf-8,'+encodeURIComponent(body)+'">'+esc(name)+'</a>';
 const table=(headers,rows)=>'<table><thead><tr>'+headers.map(h=>'<th>'+esc(h)+'</th>').join("")+'</tr></thead><tbody>'+rows.map(r=>'<tr>'+r.map(v=>'<td>'+esc(v)+'</td>').join("")+'</tr>').join("")+'</tbody></table>';
 const downloads=[download("turnover-workspace.json","application/json",JSON.stringify(w,null,2)),...["cues","events","added","reviews","receiving"].map(k=>download(k+".csv","text/csv",csv(w,editionId,k)))].join(" · ");
 return '<!doctype html><html lang="en"><meta charset="utf-8"><meta name="viewport" content="width=device-width, initial-scale=1"><title>'+esc(edition.label)+' — turnover review</title><style>body{font:15px system-ui;margin:32px;color:#202020;background:#fafafa;line-height:1.5}h1,h2{font-weight:600}table{border-collapse:collapse;width:100%;font-size:13px;margin:16px 0}th,td{border:1px solid #bbb;padding:8px;text-align:left;vertical-align:top}th{background:#eee}pre{white-space:pre-wrap;overflow-wrap:anywhere;border:1px solid #bbb;padding:12px}a{color:inherit}details{margin:16px 0}section{margin:24px 0}</style><h1>'+esc(w.label)+' / '+esc(edition.label)+'</h1><p>'+esc(edition.rate.numerator+'/'+edition.rate.denominator)+' frames/second. All intervals are integer half-open [in,out), with equal record/source durations. Review records describe proposed positions and receiving acknowledgments; applying media changes remains in the editorial and sound applications.</p><p>'+esc(edition.notes)+'</p><p>Source pair: <code>'+esc(result.pairSha256)+'</code></p><p>'+downloads+'</p><h2>Cue comparison and current review</h2>'+table(["Cue / department","Source result","Old record range","Current selected mapping","Review","Receiving"],result.cues.map(c=>[c.cueId+" / "+c.department+" / "+c.label,c.status+"; "+c.reasons.join(" "),c.oldRecordIn+"–"+c.oldRecordOut,c.review&&c.review.mapping?c.review.mapping.newEventId+" "+c.review.mapping.recordIn+"–"+c.review.mapping.recordOut+" ("+c.review.mapping.coverage+")":c.mappings.length+" mapping option(s)",c.review?c.review.decision+" — "+c.review.reviewer+": "+c.review.reason:"Unreviewed",c.receiving?c.receiving.status+" — "+c.receiving.receiver+"; "+(c.receivingCurrent?"current review":"superseded review"):"No returned note"]))+'<h2>All comparison details and review history</h2>'+result.cues.map(c=>'<details><summary>'+esc(c.cueId+" — "+c.status)+'</summary><pre>'+esc(JSON.stringify(c,null,2))+'</pre></details>').join("")+'<h2>Event changes</h2>'+table(["Old event","Clip","Status","Candidates","Reason"],result.eventChanges.map(e=>[e.oldEventId,e.clipId,e.status,e.candidateNewEventIds.join(", "),e.reasons.join(" ")]))+'<h2>Added/replaced new events</h2>'+table(["New event","Clip","Record range","Reason"],result.addedEvents.map(e=>[e.newEventId,e.event.clip_id,e.event.record_in+"–"+e.event.record_out,e.reason]))+'<h2>Complete source originals</h2>'+["old","next","cues"].map(k=>'<details><summary>'+esc(k+": "+edition[k].name+" — "+edition[k].bytes+" bytes")+'</summary><p>SHA-256 '+esc(edition[k].sha256)+'</p>'+download(edition[k].name,"text/csv",edition[k].text)+'<pre>'+esc(edition[k].text)+'</pre></details>').join("")+'</html>';
}
return {schema:SCHEMA,eventColumns:EVENT_COLUMNS.slice(),cueColumns:CUE_COLUMNS.slice(),create,reopen,receive,compare,review,receiveNote,editions,csv,report,parseCSV,encodeCSV,sha256,digest};

}
