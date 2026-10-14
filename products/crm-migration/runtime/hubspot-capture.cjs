'use strict';
// MIT. Pure, fixed read-contract planner. Host owns credentials, persistence and HTTP.
const runtime=require('./crm-runtime.cjs'),digest=runtime.comparison.digest;
const VERSION='2026-09',OBJECTS=['contacts','companies','deals'];
function need(v,m){if(!v)throw Error(m);}
function key(v){need(typeof v==='string'&&/^[a-z][a-z0-9_-]{0,47}$/.test(v),'Use a lowercase identifier, at most 48 characters.');return v;}
function id(v){need((typeof v==='string'&&/^[0-9]+$/.test(v))||(Number.isSafeInteger(v)&&v>=0),'HubSpot IDs must be exact decimal strings or safe integers.');return String(v);}
function plan(input){
 need(input?.schema==='crm-migration.hubspot-plan.v1'&&input.apiVersion===VERSION&&input.recordScope==='active'&&input.propertySensitivity==='non_sensitive','Select the 2026-09 active-record, non-sensitive property contract.');
 need(Array.isArray(input.objects)&&input.objects.length>0&&input.objects.length<=3&&Array.isArray(input.associations)&&input.associations.length<=9,'Select one to three standard objects and at most nine directed association families.');
 const objects=input.objects.map(o=>{need(OBJECTS.includes(o.type)&&Array.isArray(o.properties)&&o.properties.length>0&&o.properties.length<=94,'Choose contacts, companies or deals and 1–94 explicit property names.');need(o.properties.every(s=>typeof s==='string'&&/^[a-zA-Z0-9_]{1,100}$/.test(s))&&new Set(o.properties).size===o.properties.length,'Property names must be distinct internal names.');need(!o.properties.some(s=>['record_id','created_at','updated_at','archived','portal_id'].includes(s)),'Property name conflicts with a retained metadata column.');return {type:o.type,properties:[...o.properties]};});
 need(new Set(objects.map(o=>o.type)).size===objects.length,'Select each object once.');
 const associations=input.associations.map(a=>{need(objects.some(o=>o.type===a.from)&&objects.some(o=>o.type===a.to),'Both ends of an association must be selected objects.');return {from:a.from,to:a.to};});
 need(new Set(associations.map(a=>a.from+'-'+a.to)).size===associations.length,'Select each directed family once.');
 return {schema:input.schema,apiVersion:VERSION,recordScope:'active',propertySensitivity:'non_sensitive',objects,associations};
}
function create({captureId,connection,portalId,workspaceId,plan:input,at}){
 const p=plan(input);key(captureId);key(connection);id(portalId);need(typeof workspaceId==='string'&&workspaceId,'Select an original workspace.');need(Number.isFinite(Date.parse(at)),'Capture start time is required.');
 return {schema:'crm-migration.hubspot-capture.v1',id:captureId,connection,portalId:id(portalId),workspaceId,plan:p,planSha256:digest(p),startedAt:at,updatedAt:at,completedAt:null,revision:0,phase:'properties',objectIndex:0,familyIndex:0,after:null,seenCursors:[],properties:{},labels:{},objects:Object.fromEntries(p.objects.map(o=>[o.type,[]])),associations:Object.fromEntries(p.associations.map(a=>[a.from+'-'+a.to,[]])),queue:null,accepted:[],lastError:null,notBefore:null};
}
function validate(s){need(s?.schema==='crm-migration.hubspot-capture.v1','Select a complete capture checkpoint.');key(s.id);key(s.connection);id(s.portalId);need(digest(plan(s.plan))===s.planSha256,'The original capture plan differs.');need(Number.isSafeInteger(s.revision)&&s.revision>=0&&Array.isArray(s.accepted),'Capture checkpoint is incomplete.');return s;}
function request(s){
 validate(s);if(s.phase==='complete')return null;
 const o=s.plan.objects[s.objectIndex],a=s.plan.associations[s.familyIndex];
 if(s.phase==='properties')return {kind:'properties',object:o.type,method:'GET',path:'/crm/properties/'+VERSION+'/'+o.type+'?archived=false&dataSensitivity=non_sensitive'};
 if(s.phase==='labels')return {kind:'labels',family:a.from+'-'+a.to,method:'GET',path:'/crm/associations/'+VERSION+'/'+a.from+'/'+a.to+'/labels'};
 if(s.phase==='objects'){const q='?limit=100&archived=false&properties='+encodeURIComponent(o.properties.join(','))+(s.after===null?'':'&after='+encodeURIComponent(s.after));return {kind:'objects',object:o.type,after:s.after,method:'GET',path:'/crm/objects/'+VERSION+'/'+o.type+q};}
 need(s.phase==='associations'&&Array.isArray(s.queue)&&s.queue.length>0,'The capture continuation is incomplete.');
 const inputs=s.queue.slice(0,100).map(x=>x.after===null?{id:x.id}:{id:x.id,after:x.after});
 return {kind:'associations',family:a.from+'-'+a.to,method:'POST',path:'/crm/associations/'+VERSION+'/'+a.from+'/'+a.to+'/batch/read',body:{inputs}};
}
function cursor(p){if(p?.next===undefined)return null;need(typeof p.next.after==='string'&&p.next.after.length>0&&p.next.after.length<=8192,'HubSpot returned an invalid continuation cursor.');return p.next.after;}
function finish(s,at){s.phase='complete';s.completedAt=at;s.queue=null;}
function associations(s,at){
 while(s.familyIndex<s.plan.associations.length){const a=s.plan.associations[s.familyIndex];s.queue=s.objects[a.from].map(r=>({id:r.id,after:null,seen:[]}));if(s.queue.length){s.phase='associations';return;}s.familyIndex++;}
 finish(s,at);
}
function accept(original,req,data,receipt,at){
 const s=JSON.parse(JSON.stringify(validate(original)));need(digest(request(s))===digest(req),'Response does not belong to the current original request.');
 need(data&&typeof data==='object'&&!Array.isArray(data)&&Array.isArray(data.results),'HubSpot did not return a complete results array.');
 need(!data.errors?.length&&!data.numErrors,'HubSpot returned partial errors; keep the original response and retry the saved page.');
 if(req.kind==='properties'){
 const required=s.plan.objects[s.objectIndex].properties;const names=new Set(data.results.filter(x=>!x.archived&&(!x.dataSensitivity||x.dataSensitivity==='non_sensitive')).map(x=>x.name));
 need(required.every(x=>names.has(x)),'A requested non-sensitive property is missing from the current account schema.');
 need(!data.paging?.next,'Unexpected property-schema pagination requires an explicit contract update.');
 s.properties[req.object]=data.results;
 if(++s.objectIndex===s.plan.objects.length){s.objectIndex=0;s.phase=s.plan.associations.length?'labels':'objects';}
 }else if(req.kind==='labels'){
 for(const x of data.results){need(['HUBSPOT_DEFINED','USER_DEFINED'].includes(x.category)&&Number.isSafeInteger(x.typeId)&&x.typeId>=0,'Association label schema is invalid.');}
 need(!data.paging?.next,'Unexpected association-schema pagination requires an explicit contract update.');s.labels[req.family]=data.results;
 if(++s.familyIndex===s.plan.associations.length){s.familyIndex=0;s.phase='objects';}
 }else if(req.kind==='objects'){
 const previous=new Set(s.objects[req.object].map(x=>x.id)),rows=[];
 for(const r of data.results){const rid=id(r.id);need(!previous.has(rid),'A record appeared twice during capture; retain this window and start a fresh capture after stabilising the source.');previous.add(rid);
 need(r.archived===false&&r.properties&&typeof r.properties==='object'&&!Array.isArray(r.properties),'Expected active records with property values.');
 for(const name of s.plan.objects[s.objectIndex].properties)need(r.properties[name]===undefined||r.properties[name]===null||typeof r.properties[name]==='string','Property values must retain their exact string representation.');
 rows.push({...r,id:rid});}
 const next=cursor(data.paging);if(next!==null){need(!s.seenCursors.includes(next)&&next!==s.after,'HubSpot repeated an object cursor.');s.seenCursors.push(next);}
 s.objects[req.object].push(...rows);s.after=next;
 if(next===null){s.seenCursors=[];if(++s.objectIndex===s.plan.objects.length){s.objectIndex=0;associations(s,at);}}
 }else{
 need(data.status==='COMPLETE','Association batch is not COMPLETE; preserve its response and retry this saved request.');
 const inputs=new Map(req.body.inputs.map(x=>[x.id,x])),results=new Map();
 for(const r of data.results){const from=id(r.from?.id);need(inputs.has(from)&&!results.has(from)&&Array.isArray(r.to),'Association batch has unexpected, repeated or incomplete source results.');results.set(from,r);}
 need(results.size===inputs.size,'Association batch omitted a requested source record.');
 const queue=s.queue.slice(req.body.inputs.length),edges=s.associations[req.family],seen=new Set(edges.map(e=>[e.from_id,e.to_id,e.category,e.type_id].join('|')));
 for(const originalItem of s.queue.slice(0,req.body.inputs.length)){
 const r=results.get(originalItem.id);
 for(const target of r.to){const to=id(target.toObjectId);need(Array.isArray(target.associationTypes)&&target.associationTypes.length>0,'Association target has no type identity.');
 for(const t of target.associationTypes){need(['HUBSPOT_DEFINED','USER_DEFINED'].includes(t.category)&&Number.isSafeInteger(t.typeId)&&t.typeId>=0,'Association type identity is incomplete.');
 const edge={from_id:originalItem.id,to_id:to,category:t.category,type_id:String(t.typeId),label:t.label??''},k=[edge.from_id,edge.to_id,edge.category,edge.type_id].join('|');
 need(!seen.has(k),'An association appeared twice during capture; preserve this window and start a fresh capture.');seen.add(k);edges.push(edge);}}
 const after=cursor(r.paging);if(after!==null){need(after!==originalItem.after&&!originalItem.seen.includes(after),'HubSpot repeated a source association cursor.');queue.push({id:originalItem.id,after,seen:[...originalItem.seen,after]});}}
 s.queue=queue;if(!queue.length){s.familyIndex++;associations(s,at);}
 }
 s.accepted.push(receipt);s.revision++;s.updatedAt=at;s.lastError=null;return s;
}
function csv(headers,rows){const cell=v=>'"'+String(v??'').replace(/"/g,'""')+'"';return [headers,...rows].map(r=>r.map(cell).join(',')).join('\r\n')+'\r\n';}
function outputs(s){
 validate(s);need(s.phase==='complete','Finish every selected record and association page before deriving intake files.');const files={};
 for(const o of s.plan.objects){const headers=['record_id',...o.properties,'created_at','updated_at','archived','portal_id'];files[o.type+'.csv']=csv(headers,s.objects[o.type].map(r=>[r.id,...o.properties.map(p=>r.properties[p]??''),r.createdAt,r.updatedAt,'false',s.portalId]));}
 for(const a of s.plan.associations){const name=a.from+'-'+a.to;files[name+'.csv']=csv(['from_id','to_id','category','type_id','label','portal_id'],s.associations[name].map(r=>[r.from_id,r.to_id,r.category,r.type_id,r.label,s.portalId]));}
 return files;
}
function summary(s){validate(s);return {id:s.id,connection:s.connection,workspaceId:s.workspaceId,portalId:s.portalId,plan:s.plan,planSha256:s.planSha256,sha256:digest(s),revision:s.revision,phase:s.phase,startedAt:s.startedAt,updatedAt:s.updatedAt,completedAt:s.completedAt,notBefore:s.notBefore,lastError:s.lastError,acceptedResponses:s.accepted.length,records:Object.fromEntries(Object.entries(s.objects).map(([k,v])=>[k,v.length])),associations:Object.fromEntries(Object.entries(s.associations).map(([k,v])=>[k,v.length])),pendingAssociationSources:s.queue?.length??0};}
module.exports={VERSION,plan,create,validate,request,accept,outputs,summary,key,id,digest};
