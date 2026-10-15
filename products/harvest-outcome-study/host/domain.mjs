// MIT. Exact original rows, identities, report bytes and reviews from one saved edition.
import {applyDomain,originalSessions,workspaceHead,codec} from '../runtime.mjs';
export function inspectHarvestOutcomeStudy(core,state,args){
 const s=state.carrier.session,w=s.workspace.study,offset=args.offset??0,limit=args.limit??25;
 if(!Number.isSafeInteger(offset)||offset<0||!Number.isInteger(limit)||limit<1||limit>50)throw Error('Choose an exact page from 1 to 50 rows');
 const context={editionSha256:state.sha256,head:workspaceHead(s.workspace),studySha256:core.digest(w),collection:args.collection},page=(rows,extra={})=>({...context,offset,total:rows.length,nextOffset:offset+limit<rows.length?offset+limit:null,rows:rows.slice(offset,offset+limit),...extra});
 const originalMeta=o=>{const {content,...meta}=o;return {...meta,bytes:codec.utf8Encode(content).length,byteCollection:'sourceBytes',sourceKind:'original'};};
 const documentMeta=d=>{const {base64,...meta}=d;return {...meta,byteCollection:'sourceBytes',sourceKind:'document'};};
 const extractMeta=e=>({...e,rowCollection:'extractRows'});
 const arrays={originals:w.originals,extracts:w.extracts,crosswalks:w.crosswalks,reviews:w.reviews,documents:w.documents,documentLinks:w.document_links,backups:s.workspace.backups,history:s.workspace.history};
 if(Object.hasOwn(arrays,args.collection)){const result=page(arrays[args.collection]),mapper={originals:originalMeta,documents:documentMeta,extracts:extractMeta}[args.collection];if(mapper)result.rows=result.rows.map(mapper);return result;}
 if(args.collection==='draft')return {...context,drafts:s.workspace.drafts,view:s.workspace.view,selection:s.workspace.selection,actor:s.draft.actor,emergency:s.emergency,retainedEmergency:s.retainedEmergency};
 if(args.collection==='requests')return page([...state.receipts.map(x=>({...x,outcome:'COMMITTED'})),...state.rejections.map(x=>({...x,outcome:'REJECTED_NOT_COMMITTED'}))]);
 if(args.collection==='availability')return page(core.availability(w).tables);
 if(args.collection==='rows'){if(!core.KINDS.includes(args.kind)||!['source','returned'].includes(args.side))throw Error('Choose an exact record kind and side');const e=core.selected(w,args.kind,args.side);return page(core.rows(w,args.kind,args.side),{kind:args.kind,side:args.side,extract:e||null,fields:core.FIELDS[args.kind],idField:core.ID_FIELDS[args.kind]});}
 if(args.collection==='sourceBytes'){
  if(!['original','document'].includes(args.sourceKind))throw Error('Choose original CSV or document bytes');
  const rows=args.sourceKind==='original'?w.originals:w.documents,item=rows.find(x=>x.id===args.id);
  if(!item)throw Error('Choose one retained exact original identifier');
  const bytes=args.sourceKind==='original'?codec.utf8Encode(item.content):codec.fromBase64(item.base64),byteOffset=args.byteOffset??0,byteLimit=args.byteLimit??196608;
  if(!Number.isSafeInteger(byteOffset)||byteOffset<0||byteOffset>bytes.length||!Number.isInteger(byteLimit)||byteLimit<1||byteLimit>196608)throw Error('Choose a bounded original byte range');
  const end=Math.min(bytes.length,byteOffset+byteLimit);
  return {...context,sourceKind:args.sourceKind,id:item.id,name:item.name,sha256:item.sha256,bytes:bytes.length,byteOffset,nextByteOffset:end<bytes.length?end:null,contentBase64:codec.toBase64(bytes.subarray(byteOffset,end))};
 }
 if(args.collection==='original'||args.collection==='document'||args.collection==='extract'||args.collection==='extractRows'){
  const rows=args.collection==='original'?w.originals:args.collection==='document'?w.documents:w.extracts,item=rows.find(x=>x.id===args.id);
  if(!item)throw Error('Choose a retained exact original identifier');
  if(args.collection==='extractRows'){const selected={...w,config:{...w.config,selection:{...w.config.selection,[item.side]:{...w.config.selection[item.side],[item.kind]:item.id}}}};return page(core.rows(selected,item.kind,item.side),{extract:extractMeta(item),kind:item.kind,side:item.side,fields:core.FIELDS[item.kind],idField:core.ID_FIELDS[item.kind]});}
  if(args.collection==='extract')return {...context,extract:extractMeta(item)};
  return {...context,[args.collection]:args.collection==='original'?originalMeta(item):documentMeta(item)};
 }
 if(args.collection==='plan')return {...context,plan:w.config.harvest,sourceSelection:w.config.selection.source,returnedSelection:w.config.selection.returned};
 const a=core.analyze(w),result=a.harvest;
 const observations={"populationMembers":"population.members","inventory":"physical.inventory","plans":"physical.plans","dispatchOutcomes":"physical.dispatch_outcomes","forecastEvaluations":"physical.forecast_evaluations","physicalIssues":"physical.issues","harvestIssues":"issues","effortRecords":"effort.records","effortGroups":"effort.groups"};if(Object.hasOwn(observations,args.collection)){let value=result;for(const key of observations[args.collection].split('.'))value=value?.[key];return page(value||[]);}
 if(args.collection==='physicalRecords'){if(!core.KINDS.includes(args.kind)||!args.kind.startsWith('harvest_'))throw Error('Choose an exact physical/model/outcome family');return page(result.physical?.records?.[args.kind]||[],{kind:args.kind});}
 if(args.collection==='planLines'){const plan=result.physical?.plans.find(x=>x.record_id===args.id);if(!plan)throw Error('Choose one exact retained plan');return page(plan.lines||[],{planRecordId:plan.record_id,basisSha256:plan.basis_sha256,reviewComplete:plan.review_complete,allocationComplete:plan.allocation_complete});}
 if(args.collection==='forecastInputs'){const forecast=result.physical?.records?.harvest_forecasts.find(x=>x.record_id===args.id);if(!forecast)throw Error('Choose one exact retained forecast');return page(forecast.input_bindings||[],{forecastRecordId:forecast.record_id,valid:forecast.valid,modelRecordId:forecast.model_record_id,rootRecordKeys:forecast.root_record_keys});}
 if(args.collection==='findings')return page(a.findings);
 if(args.collection==='documentComparisons')return page(a.document_comparisons);
 if(args.collection==='assessment')return {...context,result:a};
 if(args.collection==='harvestResult'){
  const path=args.resultPath??[];if(!Array.isArray(path)||path.length>16)throw Error('Choose a result path of at most sixteen own fields');
  let value=result;for(const key of path){if(!((typeof key==='string'&&key.length>0&&key.length<=120)||(Number.isSafeInteger(key)&&key>=0))||value===null||typeof value!=='object'||!Object.hasOwn(value,key))throw Error('The exact selected result path is absent');value=value[key];}
  const describe=(value,path)=>value!==null&&typeof value==='object'?{type:Array.isArray(value)?'array':'object',path,count:Array.isArray(value)?value.length:Object.keys(value).length}:{type:'value',path,value};
  if(Array.isArray(value))return page(value,{resultPath:path,type:'array'});
  if(value!==null&&typeof value==='object')return page(Object.entries(value).map(([name,v])=>({name,...describe(v,[...path,name])})),{resultPath:path,type:'object'});
  return {...context,resultPath:path,type:'value',value};
 }
 throw Error('Choose a declared harvest and outcome study collection');
}
export function previewHarvestOutcomeStudy(core,workspace,kind,input){
 originalSessions.validate(workspace);if(kind==='assessment')return core.analyze(workspace.study);
 if(kind==='command'){const next=applyDomain(workspace,input).workspace;return {head:workspaceHead(next),assessment:core.analyze(next.study)};}
 throw Error('Choose a declared harvest and outcome study preview');
}
