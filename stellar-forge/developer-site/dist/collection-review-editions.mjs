// MIT. Explicit occurrence correspondence between complete retained collection editions.
import { sha256 } from './source-table-workspace.mjs';
export const COLLECTION_EDITION_SCHEMA='stellar-forge.collection-source-edition.v1';
const copy=value=>JSON.parse(JSON.stringify(value));
const plain=value=>value!==null&&typeof value==='object'&&!Array.isArray(value);
function fail(message){throw Object.assign(new Error(message),{code:'COLLECTION_EDITION'});}
function canonical(value){
 if(value===null||typeof value==='string'||typeof value==='boolean')return JSON.stringify(value);
 if(typeof value==='number'&&Number.isFinite(value))return JSON.stringify(value);
 if(Array.isArray(value))return '['+value.map(canonical).join(',')+']';
 if(plain(value))return '{'+Object.keys(value).sort().map(k=>JSON.stringify(k)+':'+canonical(value[k])).join(',')+'}';
 fail('Keep complete finite edition JSON.');
}
const same=(a,b)=>canonical(a)===canonical(b);
const view=e=>({id:e.id,ordinal:e.ordinal,title:e.title,url:e.url,sourceLocator:copy(e.sourceLocator)});
const sourceView=s=>({id:s.id,institution:copy(s.institution),source:Object.fromEntries(Object.entries(s.source).filter(([key])=>key!=='sourceText'))});
const keys=['carryReview','carryRights','carryStory','carryRelationships'];
export function emptyEditionDecision(fromId){return {fromId,toId:null,action:'unresolved',carryReview:false,carryRights:false,carryStory:false,carryRelationships:false,note:''};}
function index(entries,key){const map=new Map();for(const e of entries){const k=key(e);if(!map.has(k))map.set(k,[]);map.get(k).push(e);}return map;}
function pair(from,to,state){
 if(!from||!to||from.id===to.id)fail('Choose two distinct complete retained source editions.');
 if(!state.collectionIds.includes(from.id)||state.collectionIds.includes(to.id))fail('The earlier source must be selected in this draft; the replacement must not already be selected.');
}
function changes(a,b){return ['title','url'].filter(key=>a[key]!==b[key]).map(field=>({field,before:a[field],after:b[field]}));}
export function compareCollectionEditions(from,to,state,decisions=[]){
 pair(from,to,state);
 if(!Array.isArray(decisions)||decisions.length>from.entries.length)fail('Keep at most one decision for each earlier occurrence.');
 const decisionMap=new Map(),targets=new Set(),byID=new Map(to.entries.map(e=>[e.id,e])),oldIDs=new Set(from.entries.map(e=>e.id));
 for(const d of decisions){
  if(!plain(d)||!oldIDs.has(d.fromId)||decisionMap.has(d.fromId)||!['unresolved','map','omit'].includes(d.action)||keys.some(k=>typeof d[k]!=='boolean')
   ||typeof d.note!=='string'||d.note.length>20000||d.note.includes('\u0000'))fail('Each correspondence needs one original occurrence, explicit carry choices and a bounded note.');
  if(d.action==='map'){if(!byID.has(d.toId)||targets.has(d.toId))fail('Map each new occurrence at most once. Resolve a many-to-one proposal explicitly.');targets.add(d.toId);}
  else if(d.toId!==null||keys.some(k=>d[k]))fail('An omitted or unresolved occurrence cannot carry fields or select a target.');
  if(d.carryRights&&!d.carryReview)fail('Carry rights only together with that occurrence’s reviewed editorial fields.');
  decisionMap.set(d.fromId,copy(d));
 }
 const exact=index(to.entries,e=>JSON.stringify([e.title,e.url])),url=index(to.entries,e=>e.url),title=index(to.entries,e=>e.title);
 const oldExact=index(from.entries,e=>JSON.stringify([e.title,e.url])),reviews=new Map(state.reviews.map(r=>[r.id,r]));
 let exactSuggestions=0,ambiguous=0,mapped=0,omitted=0,unresolved=0;
 const rows=from.entries.map(e=>{
  const ex=exact.get(JSON.stringify([e.title,e.url]))||[], byUrl=url.get(e.url)||[],byTitle=title.get(e.title)||[];
  const available=new Map();for(const [items,match]of [[ex,'exact'],[byUrl,'url'],[byTitle,'title']]){for(const candidate of items){if(available.size>=50)break;if(!available.has(candidate.id))available.set(candidate.id,{...view(candidate),match});}}
  const candidateCount=byUrl.length+byTitle.length-ex.length;
  const exactUnique=ex.length===1&&oldExact.get(JSON.stringify([e.title,e.url])).length===1;
  if(exactUnique)exactSuggestions++;if(candidateCount>1||ex.length===1&&!exactUnique)ambiguous++;
  const d=decisionMap.get(e.id)||emptyEditionDecision(e.id),selected=d.action==='map'?byID.get(d.toId):null;
  if(d.action==='map')mapped++;else if(d.action==='omit')omitted++;else unresolved++;
  return {from:view(e),candidates:[...available.values()].slice(0,50),candidateCount,exactUnique,decision:d,selected:selected?view(selected):null,
   changes:selected?changes(e,selected):[],previousReview:reviews.has(e.id)?copy(reviews.get(e.id)):null};
 });
 return {from:sourceView(from),to:sourceView(to),
  metadataChanges:['title','description','address','topics','characteristics'].filter(k=>!same(from.institution[k],to.institution[k])).map(field=>({field,before:copy(from.institution[field]),after:copy(to.institution[field])})),
  rows,added:to.entries.filter(e=>!targets.has(e.id)).map(view),
  counts:{before:from.entries.length,after:to.entries.length,exactSuggestions,ambiguous,mapped,omitted,unresolved,added:to.entries.length-targets.size},effects:null};
}
export function projectCollectionEdition(from,to,basisState,decisions){
 const report=compareCollectionEditions(from,to,basisState,decisions);
 if(report.counts.unresolved)fail('Resolve every earlier occurrence before preparing this edition.');
 const state=copy(basisState),oldIDs=new Set(from.entries.map(e=>e.id)),map=new Map(report.rows.map(row=>[row.from.id,row])),reviews=new Map(state.reviews.map(row=>[row.id,row]));
 const effects={reviewsCarried:0,reviewsOmitted:[],rightsCarried:0,rightsReset:[],storyCarried:0,storyOmitted:[],relationshipsCarried:0,relationshipsOmitted:[]};
 for(const row of report.rows){
  const d=row.decision,hasWork=reviews.has(row.from.id)||state.story.order.includes(row.from.id)||state.relationships.some(r=>r.from===row.from.id||r.to===row.from.id);
  const old=reviews.get(row.from.id),inStory=state.story.order.includes(row.from.id),inRelations=state.relationships.some(r=>r.from===row.from.id||r.to===row.from.id);
  const hasRights=old&&(old.rights.status!=='unknown'||old.rights.basis||old.rights.citation);
  if(d.action==='map'&&d.carryStory&&inStory&&(!d.carryReview||old?.status!=='include'))fail('Carrying a story position requires carrying its included editorial review. Choose explicit story omission instead.');
  const drops=d.action==='map'&&(old&&!d.carryReview||hasRights&&!d.carryRights||inStory&&!d.carryStory||inRelations&&!d.carryRelationships);
  if((row.changes.length||d.action==='omit'&&hasWork||drops)&&!d.note.trim())fail('Explain each changed correspondence and every dropped review, rights observation, story position or relationship, including mapped occurrences.');
  if(old&&(d.action==='omit'||!d.carryReview))effects.reviewsOmitted.push(row.from.id);
  if(hasRights&&(d.action==='omit'||!d.carryRights))effects.rightsReset.push(row.from.id);
 }
 state.collectionIds=state.collectionIds.map(id=>id===from.id?to.id:id);
 state.reviews=state.reviews.filter(r=>!oldIDs.has(r.id));
 for(const row of report.rows){
  const d=row.decision,old=reviews.get(row.from.id);
  if(d.action==='map'&&d.carryReview&&old){
   const next={...copy(old),id:d.toId};if(!d.carryRights)next.rights={status:'unknown',basis:'',citation:''};
   state.reviews.push(next);effects.reviewsCarried++;if(d.carryRights&&old.rights.status!=='unknown')effects.rightsCarried++;
  }
 }
 const nextReviews=new Map(state.reviews.map(r=>[r.id,r]));
 state.story.order=state.story.order.flatMap(id=>{
  if(!oldIDs.has(id))return [id];const d=map.get(id).decision;
  if(d.action==='map'&&d.carryStory&&nextReviews.get(d.toId)?.status==='include'){effects.storyCarried++;return[d.toId];}
  effects.storyOmitted.push(id);return[];
 });
 state.relationships=state.relationships.flatMap(r=>{
  const a=oldIDs.has(r.from)?map.get(r.from).decision:null,b=oldIDs.has(r.to)?map.get(r.to).decision:null;
  if(!a&&!b)return[r];
  if([a,b].filter(Boolean).some(d=>d.action!=='map'||!d.carryRelationships)){effects.relationshipsOmitted.push(r.id);return[];}
  const next={...r,from:a?a.toId:r.from,to:b?b.toId:r.to};if(next.from===next.to)fail('A mapped relationship collapsed onto one occurrence.');
  effects.relationshipsCarried++;return[next];
 });
 report.effects=effects;return {state,report};
}
export async function buildCollectionEditionTransition(from,to,basisState,decisions){
 const projection=projectCollectionEdition(from,to,basisState,decisions);
 const body={schema:COLLECTION_EDITION_SCHEMA,fromSourceId:from.id,toSourceId:to.id,basisState:copy(basisState),decisions:projection.report.rows.map(row=>row.decision)};
 return {sourceEdition:{...body,planSha256:await sha256(canonical(body))},...projection};
}
export async function validateCollectionEditionTransition(transition,sources,state){
 if(!plain(transition)||transition.schema!==COLLECTION_EDITION_SCHEMA)fail('Keep the complete original source-edition transition.');
 const {planSha256,...body}=transition;
 if(planSha256!==await sha256(canonical(body)))fail('The original correspondence plan bytes changed.');
 const from=sources.get(transition.fromSourceId),to=sources.get(transition.toSourceId);
 const expected=await buildCollectionEditionTransition(from,to,transition.basisState,transition.decisions);
 if(!same(transition,expected.sourceEdition)||!same(state,expected.state))fail('The saved editorial result differs from its exact reviewed correspondence plan.');
 return expected.report;
}
