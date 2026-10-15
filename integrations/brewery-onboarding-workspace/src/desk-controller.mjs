function createBreweryDeskController(core){
"use strict";
const families=["items","aliases","opening","movements","target","recipes","accounts","orders"],required=new Set(families.slice(0,5));
const clone=x=>JSON.parse(JSON.stringify(x)),obj=x=>x&&typeof x==="object"&&!Array.isArray(x),str=(x,k)=>{if(typeof x!=="string")throw Error(k+" must be text");return x};
function create(initial){return {schema:"brewery-onboarding-desk/v1",core:core.reopen(initial),session:{family:"items",sources:{},editionId:"",label:"",openingAt:"",cutoffAt:"",notes:"",selectedEdition:"",reviewDrafts:{},selectedExceptions:{}},programme:{profiles:[],sources:[]},prospectWorking:{},notes:""}}
function reopen(value){
 const w=clone(typeof value==="string"?JSON.parse(value):value);
 if(!obj(w)||w.schema!=="brewery-onboarding-desk/v1")throw Error("Choose a complete brewery onboarding workspace");
 const received=core.reopen(w.core);
 if(!obj(w.session)||!obj(w.session.sources)||!obj(w.programme)||!Array.isArray(w.programme.profiles)||!Array.isArray(w.programme.sources)||!obj(w.prospectWorking))throw Error("Malformed working session or programme");
 for(const k of ["editionId","label","openingAt","cutoffAt","notes","selectedEdition"])str(w.session[k],k);
 for(const [k,v]of Object.entries(w.session.sources)){if(!families.includes(k)||!obj(v)||typeof v.enabled!=="boolean")throw Error("Malformed source draft");str(v.name,"Source filename");str(v.text,"Original CSV");if(required.has(k)&&!v.enabled)throw Error("Required source cannot be omitted: "+k)}
 if(w.session.reviewDrafts===undefined&&obj(w.session.reviewDraft)){w.session.reviewDrafts={};w.session.selectedExceptions={};const d=w.session.reviewDraft;if(d.exceptionId&&w.session.selectedEdition){w.session.selectedExceptions[w.session.selectedEdition]=d.exceptionId;w.session.reviewDrafts[JSON.stringify([w.session.selectedEdition,d.exceptionId])]=d}delete w.session.reviewDraft}
 if(!obj(w.session.reviewDrafts)||!obj(w.session.selectedExceptions))throw Error("Malformed review draft history");
 const editions=new Map(core.editions(received).map(e=>[e.id,e])),analyses=new Map;
 const exception=(edition,id)=>{if(!editions.has(edition))throw Error("Review draft refers to a missing edition");if(!analyses.has(edition))analyses.set(edition,core.analyse(received,edition));if(!analyses.get(edition).exceptions.some(e=>e.id===id))throw Error("Review draft refers to a different exception");};
 for(const [edition,id]of Object.entries(w.session.selectedExceptions)){str(id,"Selected exception");if(id)exception(edition,id)}
 for(const [key,d]of Object.entries(w.session.reviewDrafts)){if(!obj(d))throw Error("Malformed review draft");let parts;try{parts=JSON.parse(key)}catch{throw Error("Malformed review binding")};if(!Array.isArray(parts)||parts.length!==2||parts.some(x=>typeof x!=="string")||JSON.stringify(parts)!==key)throw Error("Malformed review binding");exception(parts[0],parts[1]);for(const [k,v]of Object.entries(d))str(v,k);if(d.exceptionId&&d.exceptionId!==parts[1])throw Error("Review draft exception differs");if(d.disposition&&!["investigate","accept-difference","source-correction-needed"].includes(d.disposition))throw Error("Unknown review disposition")}
 
 const ids=new Set();for(const p of w.programme.profiles){if(!obj(p)||typeof p.id!=="string"||!p.id||ids.has(p.id))throw Error("Malformed or duplicate profile identity");ids.add(p.id)}
 for(const [id,v]of Object.entries(w.prospectWorking)){if(!obj(v))throw Error("Malformed prospect work");for(const [k,t]of Object.entries(v))str(t,k)}
 str(w.notes,"Operating notes");w.core=received;if(!families.includes(w.session.family))w.session.family="items";
 return w;
}
function ensureSources(w,columns){for(const k of families)w.session.sources[k]??={enabled:required.has(k),name:k+".csv",text:(columns[k]||[]).join(",")+"\n"};return w}
function draft(w,fields){const next=clone(w);Object.assign(next.session,fields);return next}
function source(w,family,fields){if(!families.includes(family))throw Error("Unknown source family");const next=clone(w);next.session.sources[family]={...next.session.sources[family],...fields};return next}
function receive(w){const s=w.session,sources={};for(const k of families){const d=s.sources[k];if(required.has(k)||d?.enabled){if(!d||!d.name||!d.text)throw Error("Receive a filename and original CSV for "+k);sources[k]={name:d.name,text:d.text}}}
 const candidate=core.receive(w.core,{id:s.editionId.trim(),label:s.label.trim(),settings:{openingAt:s.openingAt.trim(),cutoffAt:s.cutoffAt.trim()},sources,notes:s.notes,expectedRevision:w.core.revision});
 const next=clone(w);next.core=candidate;next.session.selectedEdition=s.editionId.trim();return next;
}
function review(w,entry){const candidate=core.review(w.core,{...entry,expectedRevision:w.core.revision}),next=clone(w);next.core=candidate;return next}
function note(w,id,fields){if(!w.programme.profiles.some(p=>p.id===id))throw Error("Unknown profile");const next=clone(w);next.prospectWorking[id]={...(next.prospectWorking[id]||{}),...fields};return next}
return {create,reopen,ensureSources,draft,source,receive,review,note,families,required:[...required]};
}
export {createBreweryDeskController};
