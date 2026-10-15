// MIT. Exact original rows, identities, report bytes and reviews from one saved edition.
import {applyDomain,originalSessions,workspaceHead,codec} from '../runtime.mjs';
export function inspectFleetAvailabilityStudy(core,state,args){
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
 if(args.collection==='plan')return {...context,plan:w.config.fleet,sourceSelection:w.config.selection.source,returnedSelection:w.config.selection.returned};
 const a=core.analyze(w),result=a.fleet;
 const observations={"populationMembers":"population.members","vehicleAvailability":"availability.vehicles","duties":"duties","partReadiness":"operating.parts","releases":"operating.releases","faultEpisodes":"fault_recovery.episodes","operatingIssues":"operating.issues","fleetIssues":"issues","moneyObservations":"money_observations","effortRecords":"effort.records","effortGroups":"effort.groups"};if(Object.hasOwn(observations,args.collection)){let value=result;for(const key of observations[args.collection].split('.'))value=value?.[key];if(!Array.isArray(value))throw Error('Declared Fleet result is not an array');return page(value);}
 if(args.collection==='operatingRecords'){if(!core.KINDS.includes(args.kind))throw Error('Choose an exact operating source family');return page(result.operating.records[args.kind]||[],{kind:args.kind});}
 if(args.collection==='vehicleSegments'){const vehicle=result.availability.vehicles.find(x=>x.vehicle_id===args.id);if(!vehicle)throw Error('Choose one exact physical vehicle');return page(vehicle.segments,{vehicleId:vehicle.vehicle_id,physicalKey:vehicle.physical_key,memberId:vehicle.member_id,eligibleMinutes:vehicle.eligible_minutes,availableMinutes:vehicle.available_minutes,unavailableMinutes:vehicle.unavailable_minutes,unknownMinutes:vehicle.unknown_minutes});}
 if(args.collection==='dutyAssignments'){const duty=result.duties.find(x=>x.duty_record_id===args.id);if(!duty)throw Error('Choose one exact duty record');return page(duty.assignments,{dutyRecordId:duty.duty_record_id,valid:duty.valid,requiredVehicles:duty.required_vehicles,observedDepartures:duty.observed_departures,completedPhysicalVehicles:duty.completed_physical_vehicles,fulfilmentComplete:duty.fulfilment_complete});}
 if(args.collection==='releaseInputs'){const release=result.operating.releases.find(x=>x.release_case_record_id===args.id);if(!release)throw Error('Choose one exact release case');return page(result.operating.records.release_inputs.filter(x=>x.release_case_record_id===args.id),{releaseCaseRecordId:release.release_case_record_id,vehicleId:release.vehicle_id,valid:release.valid,releasedAt:release.released_at,basisSha256:release.basis_sha256,reviewRecordIds:release.review_record_ids,requirementRecordIds:release.requirement_record_ids});}
 if(args.collection==='findings')return page(a.findings);
 if(args.collection==='documentComparisons')return page(a.document_comparisons);
 if(args.collection==='assessment')return {...context,result:a};
 if(args.collection==='fleetResult'){
  const path=args.resultPath??[];if(!Array.isArray(path)||path.length>16)throw Error('Choose a result path of at most sixteen own fields');
  let value=result;for(const key of path){if(!((typeof key==='string'&&key.length>0&&key.length<=120)||(Number.isSafeInteger(key)&&key>=0))||value===null||typeof value!=='object'||!Object.hasOwn(value,key))throw Error('The exact selected result path is absent');value=value[key];}
  const describe=(value,path)=>value!==null&&typeof value==='object'?{type:Array.isArray(value)?'array':'object',path,count:Array.isArray(value)?value.length:Object.keys(value).length}:{type:'value',path,value};
  if(Array.isArray(value))return page(value,{resultPath:path,type:'array'});
  if(value!==null&&typeof value==='object')return page(Object.entries(value).map(([name,v])=>({name,...describe(v,[...path,name])})),{resultPath:path,type:'object'});
  return {...context,resultPath:path,type:'value',value};
 }
 throw Error('Choose a declared fleet availability study collection');
}
export function previewFleetAvailabilityStudy(core,workspace,kind,input){
 originalSessions.validate(workspace);if(kind==='assessment')return core.analyze(workspace.study);
 if(kind==='command'){const next=applyDomain(workspace,input).workspace;return {head:workspaceHead(next),assessment:core.analyze(next.study)};}
 throw Error('Choose a declared fleet availability study preview');
}
