// MIT. Pinned STAM's read dialect over original commissioning target-read bytes.
// This module has no target transport, writer, credentials or observation store.
import {Buffer} from 'node:buffer';
import {JsonNumber,sourceDocument,entityId,plain,stable,identity,sha,pointer,timeCell,fault} from '../contract.mjs';
import {exactJSON} from '../analysis/sta.mjs';

export const STAM_SOURCE='0e414f3441a8773619f242c797fe75e9af3fc04d';
export const MAP_SCHEMA='stellar-forge.sensorthings-commissioning-map.v1';
const TYPES=['Things','Locations','HistoricalLocations','Datastreams','MultiDatastreams','Sensors','ObservedProperties','Observations','FeaturesOfInterest'];
const R={
 Things:{Locations:['Locations',true,'Things'],HistoricalLocations:['HistoricalLocations',true,'Thing'],Datastreams:['Datastreams',true,'Thing'],MultiDatastreams:['MultiDatastreams',true,'Thing']},
 Locations:{Things:['Things',true,'Locations'],HistoricalLocations:['HistoricalLocations',true,'Locations']},
 HistoricalLocations:{Thing:['Things',false,'HistoricalLocations'],Locations:['Locations',true,'HistoricalLocations']},
 Datastreams:{Thing:['Things',false,'Datastreams'],Sensor:['Sensors',false,'Datastreams'],ObservedProperty:['ObservedProperties',false,'Datastreams'],Observations:['Observations',true,'Datastream']},
 MultiDatastreams:{Thing:['Things',false,'MultiDatastreams'],Sensor:['Sensors',false,'MultiDatastreams'],ObservedProperties:['ObservedProperties',true,'MultiDatastreams'],Observations:['Observations',true,'MultiDatastream']},
 Sensors:{Datastreams:['Datastreams',true,'Sensor'],MultiDatastreams:['MultiDatastreams',true,'Sensor']},
 ObservedProperties:{Datastreams:['Datastreams',true,'ObservedProperty'],MultiDatastreams:['MultiDatastreams',true,'ObservedProperties']},
 Observations:{Datastream:['Datastreams',false,'Observations'],MultiDatastream:['MultiDatastreams',false,'Observations'],FeatureOfInterest:['FeaturesOfInterest',false,'Observations']},
 FeaturesOfInterest:{Observations:['Observations',true,'FeatureOfInterest']}
};
const STAM_RESERVED=new Set(['count','getData','closeMarker','_clusterStyleCache','_polygonStyleCache','commissioning@source']);
const LIMIT={entities:50000,rows:250000,page:500,body:64*1024*1024,total:256*1024*1024,response:24*1024*1024,depth:6,coordinates:1000000};
const ensure=(ok,code,message,status=422,details={})=>{if(!ok)throw fault('COMMISSIONING_MAP_'+code,message,status,details);};
const string=(v,max=4096)=>typeof v==='string'&&v.length<=max;
const escapePointer=v=>String(v).replaceAll('~','~0').replaceAll('/','~1');
const key=(kind,id)=>kind+'/'+entityId(id).key;
const idValue=text=>{
 ensure(string(text,16384),'ID','Retain a typed JSON identifier.');
 const v=sourceDocument(Buffer.from(text));entityId(v);return v;
};
const clone=v=>v===undefined?undefined:JSON.parse(JSON.stringify(v));
const scalar=(record,kind)=>Object.fromEntries(Object.entries(record).filter(([name])=>
 !name.startsWith('@iot.')&&!name.endsWith('@iot.navigationLink')&&!name.endsWith('@iot.count')&&
 !name.endsWith('@iot.nextLink')&&!Object.hasOwn(R[kind],name)));
const typed=v=>{
 if(v===undefined)return{state:'missing',type:'missing',text:''};
 if(v===null)return{state:'null',type:'null',text:'null'};
 if(v instanceof JsonNumber)return{state:'value',type:'number',text:v.text};
 return{state:'value',type:Array.isArray(v)?'array':typeof v,text:typeof v==='string'?v:exactJSON(v)};
};
function selectedCell(node,name){
 if(!node.conflicts.has(name))return typed(node.record[name]);
 node.selectedCells??=new Map();if(node.selectedCells.has(name))return node.selectedCells.get(name);
 const variants=new Map();
 for(const occurrence of node.occurrences){
  const body=sourceDocument(Buffer.from(occurrence.bodyText));if(!Object.hasOwn(body,name))continue;
  const value=body[name],k=stable(value);let entry=variants.get(k);
  if(!entry){entry={...typed(value),responses:[]};variants.set(k,entry);}entry.responses.push(occurrence.response);
 }
 const result={state:'conflicting',type:'variants',text:'Conflicting retained values; inspect original responses',variants:[...variants.values()]};node.selectedCells.set(name,result);return result;
}
function selectedTime(node,name){return node.conflicts.has(name)?{...selectedCell(node,name),kind:'conflicting_retained_instants',startUtc:null,endUtc:null}:timeCell(node.record[name]);}
function boundedInteger(v,fallback,min,max,label){
 if(v===null||v===undefined)return fallback;
 ensure(typeof v==='string'&&/^(0|[1-9]\d*)$/.test(v),'QUERY','Use an integer '+label+'.');
 const n=Number(v);ensure(Number.isSafeInteger(n)&&n>=min&&n<=max,'QUERY',label+' is outside its declared range.');return n;
}
function link(a,name,b){
 if(!a||!b)return;
 const list=a.edges.get(name)??[];if(!list.includes(b))list.push(b);a.edges.set(name,list);
 const inverse=R[a.kind]?.[name]?.[2];if(inverse){const back=b.edges.get(inverse)??[];if(!back.includes(a))back.push(a);b.edges.set(inverse,back);}
}
function sameReference(a,b){return stable(a)===stable(b);}
function issue(graph,code,node,details={}){
 const value={code,kind:node?.kind??null,idJson:node?.idJson??null,viewId:node?.viewId??null,...details};
 const fingerprint=identity(value);if(!graph.issueKeys.has(fingerprint)){graph.issueKeys.add(fingerprint);graph.issues.push(value);}
}
function geometryView(value){
 if(!plain(value))return{reason:'GEOMETRY_NOT_RETAINED'};
 const crs=value.crs?.properties?.name;
 if(crs!==undefined&&!['EPSG:4326','urn:ogc:def:crs:EPSG::4326','urn:ogc:def:crs:OGC:1.3:CRS84','OGC:CRS84','CRS84'].includes(crs))
  return{reason:'UNSUPPORTED_DECLARED_CRS',crs};
 const source=value.type==='Feature'?value.geometry:value;
 if(!plain(source))return{reason:'INVALID_GEOJSON_GEOMETRY'};
 const kinds=new Set(['Point','MultiPoint','LineString','MultiLineString','Polygon','MultiPolygon','GeometryCollection']);
 if(!kinds.has(source.type))return{reason:'UNSUPPORTED_GEOJSON_TYPE',type:source.type};
 let count=0,bounds=[Infinity,Infinity,-Infinity,-Infinity],bad=null;
 const number=v=>v instanceof JsonNumber?Number(v.text):typeof v==='number'?v:NaN;
 function position(p){
  if(!Array.isArray(p)||p.length<2||p.some(v=>!Number.isFinite(number(v)))){bad='INVALID_COORDINATE';return[];}
  const a=p.map(number);count++;
  if(count>LIMIT.coordinates){bad='GEOMETRY_CAPACITY';return a;}
  if(a[0]<-180||a[0]>180||a[1]<-90||a[1]>90)bad='OUTSIDE_GEOJSON_LONGITUDE_LATITUDE';
  if(Math.abs(a[1])>85.0511287798066)bad??='OUTSIDE_STAM_WEB_MERCATOR_EXTENT';
  bounds=[Math.min(bounds[0],a[0]),Math.min(bounds[1],a[1]),Math.max(bounds[2],a[0]),Math.max(bounds[3],a[1])];return a;
 }
 function coords(v,depth){
  if(depth===0)return position(v);
  if(!Array.isArray(v)){bad='INVALID_COORDINATE_STRUCTURE';return[];}
  return v.map(x=>coords(x,depth-1));
 }
 function convert(g,depth=0){
  if(!plain(g)||depth>LIMIT.depth||!kinds.has(g.type)){bad='INVALID_GEOMETRY_STRUCTURE';return null;}
  if(g.crs?.properties?.name!==undefined&&!['EPSG:4326','urn:ogc:def:crs:EPSG::4326','urn:ogc:def:crs:OGC:1.3:CRS84','OGC:CRS84','CRS84'].includes(g.crs.properties.name)){bad='UNSUPPORTED_DECLARED_CRS';return null;}
  if(g.type==='GeometryCollection'){
   if(!Array.isArray(g.geometries)){bad='INVALID_GEOMETRY_COLLECTION';return null;}
   return{type:g.type,geometries:g.geometries.map(x=>convert(x,depth+1))};
  }
  const n={Point:0,MultiPoint:1,LineString:1,MultiLineString:2,Polygon:2,MultiPolygon:3}[g.type];
  const c=coords(g.coordinates,n);
  if(g.type==='LineString'&&c.length<2)bad='INVALID_LINESTRING';
  const rings=g.type==='Polygon'?c:g.type==='MultiPolygon'?c.flat():[];
  for(const ring of rings)if(ring.length<4||ring[0]?.[0]!==ring.at(-1)?.[0]||ring[0]?.[1]!==ring.at(-1)?.[1])bad='UNCLOSED_POLYGON_RING';
  return{type:g.type,coordinates:c};
 }
 const geometry=convert(source);
 if(!count)bad??='EMPTY_GEOMETRY';
 return bad?{reason:bad,crs:crs??null}:{geometry,bounds,coordinateBasis:crs??'GeoJSON longitude/latitude semantics',displayCoordinates:'finite binary64; exact original geometry remains in its retained response'};
}
function insidePoint(p,b){return p[0]>=b[0]&&p[0]<=b[2]&&p[1]>=b[1]&&p[1]<=b[3];}
function segmentBox(a,b,r){
 let lo=0,hi=1;const dx=b[0]-a[0],dy=b[1]-a[1],p=[-dx,dx,-dy,dy],q=[a[0]-r[0],r[2]-a[0],a[1]-r[1],r[3]-a[1]];
 for(let i=0;i<4;i++){if(p[i]===0){if(q[i]<0)return false;}else{const t=q[i]/p[i];if(p[i]<0)lo=Math.max(lo,t);else hi=Math.min(hi,t);if(lo>hi)return false;}}return true;
}
function lineBox(points,b){return points.some(p=>insidePoint(p,b))||points.some((p,i)=>i&&segmentBox(points[i-1],p,b));}
function inRing(point,ring){
 let inside=false;
 for(let i=0,j=ring.length-1;i<ring.length;j=i++){
  const a=ring[i],b=ring[j];
  if(((a[1]>point[1])!==(b[1]>point[1]))&&point[0]<(b[0]-a[0])*(point[1]-a[1])/(b[1]-a[1])+a[0])inside=!inside;
 }return inside;
}
function polygonBox(rings,b){
 if(rings.some(r=>lineBox(r,b)))return true;
 return [[b[0],b[1]],[b[2],b[1]],[b[2],b[3]],[b[0],b[3]]].some(p=>inRing(p,rings[0]??[])&&!rings.slice(1).some(r=>inRing(p,r)));
}
function intersects(g,b){
 if(!g)return false;
 if(g.type==='Point')return insidePoint(g.coordinates,b);
 if(g.type==='MultiPoint')return g.coordinates.some(p=>insidePoint(p,b));
 if(g.type==='LineString')return lineBox(g.coordinates,b);
 if(g.type==='MultiLineString')return g.coordinates.some(l=>lineBox(l,b));
 if(g.type==='Polygon')return polygonBox(g.coordinates,b);
 if(g.type==='MultiPolygon')return g.coordinates.some(p=>polygonBox(p,b));
 if(g.type==='GeometryCollection')return g.geometries.some(v=>intersects(v,b));
 return false;
}
function buildGraph(data,jobId){
 ensure(plain(data)&&data.jobId===jobId&&Array.isArray(data.entities),'SOURCE','Select the original commissioning map data.',409);
 ensure(data.entities.length<=LIMIT.entities,'CAPACITY','The retained map entity set exceeds its declared capacity.',413);
 const graph={jobId,data,snapshot:identity({schema:MAP_SCHEMA,data}),nodes:new Map(),byKind:new Map(TYPES.map(k=>[k,[]])),byView:new Map(),issues:[],issueKeys:new Set(),entries:[],bounds:null};
 let bytes=0,occurrences=0;
 function add(kind,record,ref,idOverride,depth=0){
  ensure(TYPES.includes(kind)&&plain(record)&&depth<=LIMIT.depth,'ENTITY','The retained target read must be a supported native entity.');
  const rawId=record['@iot.id']??idOverride;
  let id;try{id=entityId(rawId);}catch{issue(graph,'MISSING_TYPED_TARGET_ID',null,{kind,response:ref});return null;}
  if(idOverride!==undefined)ensure(entityId(idOverride).key===id.key,'IDENTITY','The read body and selected target identifier disagree.',409,{kind,idJson:exactJSON(rawId),response:ref});
  const k=kind+'/'+id.key,fields=scalar(record,kind);
  let node=graph.nodes.get(k);
  if(!node){
   ensure(graph.nodes.size<LIMIT.rows,'CAPACITY','The retained expanded graph exceeds its declared row capacity.',413);
   node={key:k,kind,id,idJson:exactJSON(rawId),rawId,record:fields,refs:[],edges:new Map(),conflicts:new Set(),occurrences:[],pending:[],geometry:null,mapEligible:false};
   graph.nodes.set(k,node);graph.byKind.get(kind).push(node);
  }else for(const[name,value]of Object.entries(fields)){
   if(!Object.hasOwn(node.record,name))node.record[name]=value;
   else if(stable(node.record[name])!==stable(value))node.conflicts.add(name);
  }
  if(!node.refs.some(r=>sameReference(r,ref)))node.refs.push(ref);
  ensure(++occurrences<=LIMIT.rows,'CAPACITY','The retained original occurrences exceed the map capacity.',413);
  node.occurrences.push({response:ref,bodyText:exactJSON(record)});
  for(const[name,[targetKind,many]]of Object.entries(R[kind])){
   const value=record[name];
   if(value===undefined||value===null)continue;
   const children=Array.isArray(value)?value:[value];
   if(!many&&children.length>1)node.conflicts.add(name);
   for(let i=0;i<children.length;i++){
    if(!plain(children[i])){issue(graph,'INVALID_NATIVE_RELATION',node,{relation:name,response:ref});continue;}
    const child=add(targetKind,children[i],{...ref,responsePointer:(ref.responsePointer??'')+'/'+escapePointer(name)+(Array.isArray(value)?'/'+i:'')},undefined,depth+1);
    link(node,name,child);
   }
  }
  return node;
 }
 for(const entry of data.entities){
  ensure(plain(entry)&&TYPES.includes(entry.kind)&&string(entry.bodyText,LIMIT.body)&&/^[a-f0-9]{64}$/.test(entry.responseSha256??''),'SOURCE','Each target entity needs its original body and response SHA.',409);
  const raw=Buffer.from(entry.bodyText);ensure(raw.length<=LIMIT.body,'CAPACITY','The original native response exceeds 64 MiB.',413);bytes+=raw.length;ensure(bytes<=LIMIT.total,'CAPACITY','The complete retained map body set exceeds its declared capacity.',413);
  let body=sourceDocument(raw);
  const responsePointer=entry.responsePointer??'';
  ensure(typeof responsePointer==='string','SOURCE','Retain the original response JSON pointer.');pointer({},responsePointer);
  ensure(entry.bodyIsCompleteResponse===undefined||typeof entry.bodyIsCompleteResponse==='boolean','SOURCE','Declare selected-body fragment mode as an explicit boolean.');
  // A selected body may be a subdocument. The manager retains its complete raw response
  // under responseSha256/fileId; never pretend the selected fragment has that hash.
  const complete=entry.bodyIsCompleteResponse!==false;
  if(complete){ensure(sha(raw)===entry.responseSha256,'RESPONSE_SHA','The complete native response bytes differ.',409);body=pointer(body,responsePointer);}
  else ensure(entry.responseFileId&&responsePointer,'RESPONSE_FRAGMENT','A selected body fragment must identify its complete native response file and JSON pointer.',409);
  const ref={responseSha256:entry.responseSha256,responseFileId:entry.responseFileId??null,responsePointer,
   stepId:entry.stepId??null,readId:entry.readId??null,bodySha256:sha(raw),bodyIsCompleteResponse:complete};
  const node=add(entry.kind,body,ref,idValue(entry.idJson));
  if(node){node.pending.push({relations:entry.relations??{},ref});graph.entries.push({node,entry});}
 }
 const ordered=[...graph.nodes.values()].sort((a,b)=>a.key<b.key?-1:a.key>b.key?1:0);
 ordered.forEach((node,i)=>{node.viewId=i+1;graph.byView.set(node.viewId,node);});
 for(const node of ordered)for(const{relations,ref}of node.pending){
  ensure(plain(relations),'RELATIONS','The native relation identity map must be an object.');
  for(const[name,values]of Object.entries(relations)){
   ensure(R[node.kind][name]&&Array.isArray(values),'RELATIONS','Retain native relation arrays by their original names.');
   const expected=R[node.kind][name][0];
   for(const target of values){
    ensure(plain(target)&&target.kind===expected,'RELATIONS','The native relation kind differs from its original property.');
    const other=graph.nodes.get(key(target.kind,idValue(target.idJson)));
    if(!other){issue(graph,'RELATED_TARGET_READ_UNAVAILABLE',node,{relation:name,target:clone(target),response:ref});continue;}
    link(node,name,other);
   }
  }
 }
 for(const node of ordered){
  for(const[name,[,many]]of Object.entries(R[node.kind]))if(!many&&(node.edges.get(name)?.length??0)>1)node.conflicts.add(name);
  if(node.conflicts.size)issue(graph,'CONFLICTING_RETAINED_NATIVE_ENTITY',node,{fields:[...node.conflicts].sort(),responses:node.refs});
  const reserved=Object.keys(node.record).filter(k=>STAM_RESERVED.has(k));if(reserved.length)issue(graph,'VENDOR_DISPLAY_FIELD_COLLISION',node,{fields:reserved,meaning:'These original fields remain in the exact response and typed inspector; only STAM-reserved display properties are omitted.'});
  if(['Locations','FeaturesOfInterest'].includes(node.kind)){
   node.geometry=geometryView(node.record[node.kind==='Locations'?'location':'feature']);
   if(node.geometry.reason)issue(graph,node.geometry.reason,node,{geometry:node.geometry});
  }
 }
 for(const node of ordered){
  if(node.conflicts.size)continue;
  if(node.kind==='FeaturesOfInterest')node.mapEligible=!!node.geometry?.geometry;
  if(node.kind==='Things'){
   const locations=node.edges.get('Locations')??[];
   if(locations.length===1&&!locations[0].conflicts.size&&locations[0].geometry?.geometry){node.mapEligible=true;node.geometry=locations[0].geometry;}
   else issue(graph,locations.length>1?'STAM_MULTIPLE_NATIVE_LOCATIONS':'STAM_LOCATION_UNAVAILABLE',node,{locationViewIds:locations.map(n=>n.viewId)});
  }
  if(node.mapEligible){const b=node.geometry.bounds;graph.bounds=graph.bounds?[Math.min(graph.bounds[0],b[0]),Math.min(graph.bounds[1],b[1]),Math.max(graph.bounds[2],b[2]),Math.max(graph.bounds[3],b[3])]:[...b];}
 }
 ensure(data.unavailable===undefined||Array.isArray(data.unavailable),'SOURCE','Retain unavailable target reads as the original list.');
 for(const item of data.unavailable??[]){ensure(plain(item),'SOURCE','Unavailable target reads must retain their original state.');issue(graph,'NATIVE_TARGET_READ_UNAVAILABLE',null,{native:clone(item)});}
 for(const list of graph.byKind.values())list.sort((a,b)=>a.viewId-b.viewId);
 graph.bytes=bytes;graph.originalOccurrences=occurrences;return graph;
}
function splitTop(text,separator){
 const out=[];let start=0,depth=0,quoted=false;
 for(let i=0;i<text.length;i++){
  const c=text[i];if(c==="'"){if(quoted&&text[i+1]==="'"){i++;continue;}quoted=!quoted;continue;}
  if(quoted)continue;if(c==='(')depth++;if(c===')')depth--;
  ensure(depth>=0&&depth<=16,'QUERY','The query parentheses exceed their supported scope.');
  if(depth===0&&text.slice(i,i+separator.length)===separator){out.push(text.slice(start,i));start=i+separator.length;i+=separator.length-1;}
 }
 ensure(depth===0&&!quoted,'QUERY','The query has an incomplete parenthesis or quote.');
 out.push(text.slice(start));return out;
}
function unparen(text){
 text=text.trim();
 while(text.startsWith('(')&&text.endsWith(')')){
  let depth=0,quoted=false,all=true;
  for(let i=0;i<text.length;i++){const c=text[i];if(c==="'"){if(quoted&&text[i+1]==="'"){i++;continue;}quoted=!quoted;}if(quoted)continue;if(c==='(')depth++;if(c===')')depth--;if(depth===0&&i<text.length-1){all=false;break;}}
  if(!all)break;text=text.slice(1,-1).trim();
 }return text;
}
function rectangle(value){
 const parts=value.split(',').map(s=>s.trim().split(/\s+/).map(Number));
 ensure(parts.length===5&&parts.every(p=>p.length===2&&p.every(Number.isFinite))&&parts[0][0]===parts[4][0]&&parts[0][1]===parts[4][1],
  'GEO_FILTER','Use STAM’s closed rectangular tile ring.');
 const xs=[...new Set(parts.slice(0,4).map(p=>p[0]))],ys=[...new Set(parts.slice(0,4).map(p=>p[1]))];
 ensure(xs.length===2&&ys.length===2&&parts.slice(0,4).every((p,i)=>{const q=parts[i+1];return(p[0]===q[0])!==(p[1]===q[1]);}),
  'GEO_FILTER','The retained connector supports STAM’s rectangular tile predicates.');
 return[Math.min(...xs),Math.min(...ys),Math.max(...xs),Math.max(...ys)];
}
function filterPredicate(input,depth=0){
 if(!input)return()=>true;ensure(string(input,16384)&&depth<12,'FILTER','Use a bounded STAM filter.');
 const s=unparen(input),or=splitTop(s,' or ');if(or.length>1){const f=or.map(x=>filterPredicate(x,depth+1));return n=>f.some(p=>p(n));}
 const and=splitTop(s,' and ');if(and.length>1){const f=and.map(x=>filterPredicate(x,depth+1));return n=>f.every(p=>p(n));}
 let m=/^geo\.intersects\((Locations\/location|feature),geography'POLYGON\s*\(\(([^']+)\)\)'\)$/.exec(s);
 if(m){const box=rectangle(m[2]);return n=>m[1]==='Locations/location'?n.kind==='Things'&&n.mapEligible&&intersects(n.geometry.geometry,box):
  n.kind==='FeaturesOfInterest'&&n.mapEligible&&intersects(n.geometry.geometry,box);}
 m=/^([A-Za-z@][A-Za-z0-9@./]*)\s+eq\s+([1-9]\d*)$/.exec(s);
 if(m){const path=m[1].split('/'),id=Number(m[2]);ensure(['id','@iot.id'].includes(path.at(-1))&&Number.isSafeInteger(id),'FILTER','Use the scoped view identifier for map ID equality.');
  return n=>{let nodes=[n];for(const rel of path.slice(0,-1)){ensure(nodes.every(v=>R[v.kind]?.[rel]),'FILTER','Unknown native relation in the selected filter.');nodes=nodes.flatMap(v=>v.edges.get(rel)??[]);}return nodes.some(v=>v.viewId===id);};}
 m=/^(phenomenonTime|resultTime)\s+(eq|ge|gt|le|lt)\s+(.+)$/.exec(s);
 if(m){let value=m[3];if(value.startsWith("'")&&value.endsWith("'"))value=value.slice(1,-1).replaceAll("''","'");
  const expected=timeCell(value);ensure(expected.kind==='explicit_instant','FILTER_TIME','Use the original offset-qualified instant (up to nanosecond precision).');
  return n=>{if(n.conflicts.has(m[1]))return false;const actual=timeCell(n.record[m[1]]);if(actual.kind!=='explicit_instant')return m[2]==='eq'&&n.record[m[1]]===value;
   const a=actual.startUtc,b=expected.startUtc;return m[2]==='eq'?a===b:m[2]==='ge'?a>=b:m[2]==='gt'?a>b:m[2]==='le'?a<=b:a<b;};}
 throw fault('COMMISSIONING_MAP_FILTER','The selected filter is outside the documented pinned STAM read dialect.',422,{filter:s});
}
function parseOptions(params,depth=0){
 ensure(depth<=LIMIT.depth,'EXPAND','The requested native relationship expansion exceeds six levels.');
 const accepted=new Set(['$filter','$expand','$select','$orderby','$count','$top','$skip','$skiptoken','$resultFormat','snapshot']);
 for(const[name]of params)ensure(accepted.has(name)&&params.getAll(name).length===1,'QUERY','Use one supported STAM query option.',422,{parameter:name});
 const selected=params.get('$select')?.split(',').map(s=>s.trim())??null;
 if(selected)ensure(selected.length<=80&&selected.every(s=>/^[@A-Za-z_][@A-Za-z0-9_.]*$/.test(s)),'SELECT','Select native scalar fields by name.');
 const count=params.get('$count');ensure(count===null||count==='true'||count==='false','QUERY','$count must be true or false.');
 const resultFormat=params.get('$resultFormat');ensure(resultFormat===null||resultFormat==='dataArray','FORMAT','The retained connector supports the native dataArray result format.');
 const expand={};
 if(params.get('$expand'))for(const part of splitTop(params.get('$expand'),',')){
  const m=/^([A-Za-z]+)(?:\((.*)\))?$/.exec(part.trim());ensure(m,'EXPAND','Use the pinned client’s nested native expansions.');
  ensure(!Object.hasOwn(expand,m[1]),'EXPAND','Each native relationship must be expanded once.');
  const inner=new URLSearchParams();
  for(const pair of m[2]?splitTop(m[2],';'):[]){const at=pair.indexOf('=');ensure(at>0,'EXPAND','Retain each complete expansion option.');inner.append(pair.slice(0,at).trim(),pair.slice(at+1).trim());}
  expand[m[1]]=parseOptions(inner,depth+1);
 }
 const order=params.get('$orderby');ensure(order===null||/^(phenomenonTime|resultTime|id|@iot\.id)(?: (?:asc|desc))?$/.test(order),'ORDER','Order by the original time or scoped view identifier.');
 return{filter:filterPredicate(params.get('$filter')),filterText:params.get('$filter'),expand,selected,count:count==='true',
  top:params.get('$top')===null&&depth>0?null:boundedInteger(params.get('$top'),100,0,LIMIT.page,'page size'),skip:boundedInteger(params.get('$skip'),0,0,LIMIT.rows,'offset'),
  order,resultFormat,skiptoken:params.get('$skiptoken')};
}
function selectedNodes(nodes,options){
 let out=nodes.filter(options.filter);
 if(options.order){
  const[field,direction='asc']=options.order.split(' '),sign=direction==='desc'?-1:1;
  out=[...out].sort((a,b)=>{
   let left,right;if(['id','@iot.id'].includes(field)){left=a.viewId;right=b.viewId;}else{left=selectedTime(a,field).startUtc;right=selectedTime(b,field).startUtc;}
   if(left===null&&right!==null)return 1;if(right===null&&left!==null)return-1;
   return(left<right?-1:left>right?1:a.viewId-b.viewId)*sign;
  });
 }return out;
}
function sourceOf(graph,node){
 return{kind:node.kind,idJson:node.idJson,viewId:node.viewId,idRole:'SCOPED_MAP_VIEW_ONLY',
  jobId:graph.jobId,planId:graph.data.planId??null,verificationId:graph.data.verificationId??null,snapshotSha256:graph.snapshot,
  stepIds:[...new Set(node.refs.map(r=>r.stepId).filter(Boolean))],responseFiles:node.refs,
  sourceIdentity:clone(graph.data.sourceIdentity??null),conflicts:[...node.conflicts],originalOccurrences:node.occurrences.length};
}
function localRoot(origin,base,graph){return origin+base+'/'+encodeURIComponent(graph.jobId)+'/v1.1/';}
function entityURL(root,graph,node){return root+node.kind+'('+node.viewId+')?snapshot='+graph.snapshot;}
function render(graph,node,options,root,depth=0,budget={count:0}){
 ensure(++budget.count<=10000&&depth<=LIMIT.depth,'RESPONSE_CAPACITY','Use smaller source pages or fewer nested relations.',413);
 const retained=Object.fromEntries(Object.entries(node.record).filter(([name])=>!node.conflicts.has(name)&&!STAM_RESERVED.has(name)));
 const out={'@iot.id':node.viewId,'@iot.selfLink':entityURL(root,graph,node),...retained,'commissioning@source':sourceOf(graph,node)};
 // All map navigation is local; the original target URLs remain response evidence only.
 for(const[name,[,many]]of Object.entries(R[node.kind])){
  const path=root+node.kind+'('+node.viewId+')/'+name;
  out[name+'@iot.navigationLink']=path+'?snapshot='+graph.snapshot;
  const expansion=options.expand[name];
  if(!expansion)continue;
  const related=selectedNodes(node.edges.get(name)??[],expansion);
  if(!many&&related.length>1){out[name]=null;continue;}
  const values=related.slice(expansion.skip,expansion.top===null?undefined:expansion.skip+expansion.top)
   .map(n=>render(graph,n,expansion,root,depth+1,budget));
  ensure(many||related.length<=1,'NATIVE_RELATION','The retained singular relation has multiple target identities.',409);
  out[name]=many?values:values[0]??null;
  if(many){
   if(expansion.count)out[name+'@iot.count']=related.length;
   if(expansion.top&&expansion.skip+values.length<related.length){
    const p=optionsParams(expansion);p.set('snapshot',graph.snapshot);p.set('$skip',String(expansion.skip+values.length));
    out[name+'@iot.nextLink']=path+'?'+p;
   }
  }
 }
 for(const name of Object.keys(options.expand))ensure(R[node.kind][name],'EXPAND','The requested native relationship is unavailable for this collection.');
 if(node.kind==='Locations'&&node.geometry?.geometry)out.location=node.geometry.geometry;
 if(node.kind==='FeaturesOfInterest'&&node.geometry?.geometry)out.feature=node.geometry.geometry;
 if(options.selected){
  const keep=new Set(['@iot.id','@iot.selfLink','commissioning@source',...options.selected,...Object.keys(options.expand)]);
  for(const name of Object.keys(out))if(!keep.has(name)&&!Object.keys(options.expand).some(k=>name.startsWith(k+'@iot.')))delete out[name];
 }return out;
}
function optionsParams(o){
 const p=new URLSearchParams();
 if(o.filterText)p.set('$filter',o.filterText);if(o.selected)p.set('$select',o.selected.join(','));
 if(o.order)p.set('$orderby',o.order);if(o.count)p.set('$count','true');if(o.top!==null)p.set('$top',String(o.top));if(o.skip)p.set('$skip',String(o.skip));
 if(o.resultFormat)p.set('$resultFormat',o.resultFormat);
 if(Object.keys(o.expand).length)p.set('$expand',Object.entries(o.expand).map(([name,v])=>{
  const parts=[...optionsParams(v)].map(([k,s])=>k+'='+s);return name+(parts.length?'('+parts.join(';')+')':'');
 }).join(','));return p;
}
function queryGraph(graph,{path,params,root}){
 const options=parseOptions(params),m=/^([A-Za-z]+)(?:\(([1-9]\d*)\))?(?:\/([A-Za-z]+))?\/?$/.exec(path);
 if(!path)return{value:TYPES.map(name=>({name,url:root+name+'?snapshot='+graph.snapshot})),'commissioning@scope':scope(graph)};
 ensure(m&&TYPES.includes(m[1]),'ROUTE','Select one retained native collection or relationship.',404);
 let nodes=graph.byKind.get(m[1]),singleton=!!m[2]&&!m[3];
 if(m[2]){const node=graph.byView.get(Number(m[2]));ensure(node?.kind===m[1],'ENTITY_NOT_FOUND','The map view identifier is not in this exact snapshot.',404);
  nodes=[node];if(m[3]){ensure(R[node.kind][m[3]],'RELATION','The requested native relation is not supported.',404);singleton=!R[node.kind][m[3]][1];nodes=node.edges.get(m[3])??[];}}
 // STAM dereferences the first Location. Its map collection includes only an actual,
 // unambiguous native geometry; excluded source identities remain in the sidecar.
 if(!m[2]&&['Things','FeaturesOfInterest'].includes(m[1]))nodes=nodes.filter(n=>n.mapEligible);
 nodes=selectedNodes(nodes,options);
 const queryId=identity({snapshot:graph.snapshot,path,options:[...params].filter(([k])=>!['$skiptoken','$skip'].includes(k))});
 let offset=options.skip;
 if(options.skiptoken){
  let cursor;try{cursor=JSON.parse(Buffer.from(options.skiptoken,'base64url').toString('utf8'));}catch{}
  ensure(plain(cursor)&&cursor.queryId===queryId&&cursor.snapshot===graph.snapshot&&Number.isSafeInteger(cursor.offset)&&cursor.offset>=0&&cursor.offset<=nodes.length,
   'CURSOR','The map page belongs to another retained snapshot or query.',409);offset=cursor.offset;
 }
 const page=nodes.slice(offset,offset+options.top),budget={count:0};
 if(singleton){ensure(nodes.length<=1,'NATIVE_RELATION','The native singular result is ambiguous.',409);return nodes[0]?render(graph,nodes[0],options,root,0,budget):null;}
 let value=page.map(n=>render(graph,n,options,root,0,budget));
 if(options.resultFormat==='dataArray'){
  ensure((m[1]==='Observations'&&!m[3])||m[3]==='Observations','FORMAT','Select retained observations for native dataArray output.');
  const components=['id','phenomenonTime','result','resultTime','resultQuality','validTime','parameters'];
  ensure(page.every(n=>!components.some(name=>n.conflicts.has(name))),'NATIVE_CONFLICT','A retained dataArray field has conflicting native values. Inspect its exact typed variants before selecting a source.',409);
  value=[{components,dataArray:page.map(n=>components.map(name=>name==='id'?n.viewId:n.record[name]??null)),
   'commissioning@rows':page.map(n=>({viewId:n.viewId,...sourceOf(graph,n),missingFields:components.filter(k=>k!=='id'&&!Object.hasOwn(n.record,k))}))}];
 }
 const out={value,'commissioning@scope':scope(graph)};if(options.count)out['@iot.count']=nodes.length;
 if(options.top&&offset+page.length<nodes.length){
  const next=new URLSearchParams(params);next.delete('$skip');next.set('$skiptoken',Buffer.from(JSON.stringify({snapshot:graph.snapshot,queryId,offset:offset+page.length})).toString('base64url'));
  next.set('snapshot',graph.snapshot);out['@iot.nextLink']=root+path+'?'+next;
 }return out;
}
function scope(graph){return{jobId:graph.jobId,planId:graph.data.planId??null,verificationId:graph.data.verificationId??null,
 snapshotSha256:graph.snapshot,sourceIdentity:clone(graph.data.sourceIdentity??null),coverage:clone(graph.data.coverage??null),
 meaning:'Only retained successful target reads; map IDs are view-only. Native target IDs, missing reads and original response bytes remain separately available.',
 providerRequests:false,nativeWrites:false};}
function inspectEntity(graph,node,{offset=0,limit=25}={}){
 const observations=node.kind==='Observations'?[node]:node.kind==='Things'?
  [...(node.edges.get('Datastreams')??[]),...(node.edges.get('MultiDatastreams')??[])].flatMap(n=>n.edges.get('Observations')??[]):
  node.edges.get('Observations')??[];
 const unique=[...new Map(observations.map(n=>[n.key,n])).values()].sort((a,b)=>a.viewId-b.viewId);
 const rows=unique.slice(offset,offset+limit).map(n=>{
  const streams=[...(n.edges.get('Datastream')??[]),...(n.edges.get('MultiDatastream')??[])];
  return{...sourceOf(graph,n),phenomenonTime:selectedTime(n,'phenomenonTime'),resultTime:selectedTime(n,'resultTime'),
   validTime:selectedTime(n,'validTime'),result:selectedCell(n,'result'),resultQuality:selectedCell(n,'resultQuality'),parameters:selectedCell(n,'parameters'),
   streams:streams.map(s=>({kind:s.kind,idJson:s.idJson,viewId:s.viewId,name:selectedCell(s,'name'),unit:selectedCell(s,Object.hasOwn(s.record,'unitOfMeasurement')?'unitOfMeasurement':'unitOfMeasurements')}))};
 });
 return{schema:MAP_SCHEMA,...sourceOf(graph,node),name:selectedCell(node,'name'),fields:Object.fromEntries(Object.keys(node.record).map(k=>[k,selectedCell(node,k)])),
  geometry:node.geometry??null,mapEligible:node.mapEligible,relations:Object.fromEntries([...node.edges].map(([name,nodes])=>[name,nodes.map(n=>({kind:n.kind,idJson:n.idJson,viewId:n.viewId}))])),
  observations:{offset,limit,total:unique.length,nextOffset:offset+rows.length<unique.length?offset+rows.length:null,rows}};
}
function mapManifest(graph,base){
 return{schema:MAP_SCHEMA,stamSource:STAM_SOURCE,...scope(graph),targetServiceUrl:graph.data.targetServiceUrl??null,
  idProjection:{role:'SCOPED_MAP_VIEW_ONLY',nativeDecisions:'Use exact kind and idJson from commissioning@source; never submit the map viewId as a native identifier.'},
  counts:{inputReadEntities:graph.data.entities.length,entities:graph.nodes.size,originalOccurrences:graph.originalOccurrences,issues:graph.issues.length,
   nativeUnavailable:(graph.data.unavailable??[]).length,mappedThings:graph.byKind.get('Things').filter(n=>n.mapEligible).length,
   mappedFeaturesOfInterest:graph.byKind.get('FeaturesOfInterest').filter(n=>n.mapEligible).length},
  families:TYPES.map(kind=>({kind,total:graph.byKind.get(kind).length,mapEligible:graph.byKind.get(kind).filter(n=>n.mapEligible).length})),
  bounds:graph.bounds?[[graph.bounds[1],graph.bounds[0]],[graph.bounds[3],graph.bounds[2]]]:null,
  links:{manifest:base+'/'+encodeURIComponent(graph.jobId)+'/manifest',
   entities:base+'/'+encodeURIComponent(graph.jobId)+'/entities?snapshot='+graph.snapshot,
   issues:base+'/'+encodeURIComponent(graph.jobId)+'/issues?snapshot='+graph.snapshot,
   service:base+'/'+encodeURIComponent(graph.jobId)+'/v1.1',snapshot:graph.snapshot}};
}

/** HTTP-independent complete responder. The original server authenticates before calling handle. */
export function createCommissioningSTAFacade({manager,basePath='/api/commissioning/map'}={}){
 ensure(manager&&typeof manager.mapData==='function','MANAGER','Use the original commissioning manager.',500);
 ensure(typeof basePath==='string'&&/^\/api\/[A-Za-z0-9_/-]+$/.test(basePath)&&!basePath.endsWith('/'),'BASE','Use a local authenticated API prefix.',500);
 const cache=new Map(),loading=new Map();let closed=false;
 async function graph(jobId,snapshot=null){
  ensure(!closed,'CLOSED','This original map reader is closed.',409);
  ensure(string(jobId,200)&&/^[A-Za-z0-9_-]+$/.test(jobId),'JOB','Select an original commissioning job ID.');
  if(snapshot){ensure(/^[a-f0-9]{64}$/.test(snapshot),'SNAPSHOT','Select an exact map snapshot SHA.');const old=cache.get(jobId+'/'+snapshot);if(old)return old;}
  let pending=loading.get(jobId);
  if(!pending){pending=Promise.resolve(manager.mapData(jobId)).then(data=>buildGraph(data,jobId));loading.set(jobId,pending);}
  let result;try{result=await pending;}finally{if(loading.get(jobId)===pending)loading.delete(jobId);}
  ensure(!snapshot||snapshot===result.snapshot,'SNAPSHOT_CHANGED','The target-read selection changed. Retain the earlier view and explicitly load the current map.',409,{expected:snapshot,current:result.snapshot});
  cache.set(jobId+'/'+result.snapshot,result);while(cache.size>2)cache.delete(cache.keys().next().value);return result;
 }
 const manifest=async jobId=>mapManifest(await graph(jobId),basePath);
 async function handle({url,method='GET'}={}){
  ensure(url instanceof URL,'URL','Pass the original parsed local request URL.',500);
  if(!url.pathname.startsWith(basePath+'/'))return null;
  ensure(method==='GET'||method==='HEAD','METHOD','The retained map interface is read-only.',405);
  const rest=url.pathname.slice(basePath.length+1),match=/^([A-Za-z0-9_-]+)\/(manifest|entities(?:\/[1-9]\d*)?|issues|v1\.1(?:\/.*)?)$/.exec(rest);
  ensure(match,'ROUTE','Select the original map manifest, entity or native service path.',404);
  const[,jobId,route]=match;let value;
  if(route==='manifest'){ensure(![...url.searchParams].length,'QUERY','The manifest selects the current retained native map.');value=await manifest(jobId);}
  else{
   const g=await graph(jobId,url.searchParams.get('snapshot'));ensure(url.searchParams.has('snapshot'),'SNAPSHOT','Bind this read to the selected map manifest.',409);
   if(route.startsWith('v1.1')){
    value=queryGraph(g,{path:route.slice(5).replace(/^\//,''),params:url.searchParams,root:localRoot(url.origin,basePath,g)});
   }else{
    const allowed=new Set(['snapshot','offset','limit','kind']);for(const[name]of url.searchParams)ensure(allowed.has(name)&&url.searchParams.getAll(name).length===1,'QUERY','Use one supported sidecar page option.');
    const offset=boundedInteger(url.searchParams.get('offset'),0,0,LIMIT.rows,'offset'),limit=boundedInteger(url.searchParams.get('limit'),25,1,LIMIT.page,'page size');
    if(route==='issues')value={schema:MAP_SCHEMA,...scope(g),offset,limit,total:g.issues.length,rows:g.issues.slice(offset,offset+limit),nextOffset:offset+limit<g.issues.length?offset+limit:null};
    else if(route==='entities'){
     const kind=url.searchParams.get('kind');ensure(!kind||TYPES.includes(kind),'KIND','Select an original native entity kind.');
     const list=kind?g.byKind.get(kind):[...g.byView.values()];
     value={schema:MAP_SCHEMA,...scope(g),offset,limit,total:list.length,rows:list.slice(offset,offset+limit).map(n=>({...sourceOf(g,n),name:selectedCell(n,'name'),mapEligible:n.mapEligible,geometryState:n.geometry?.reason??(n.geometry?.geometry?'AVAILABLE':'NOT_SPATIAL')})),nextOffset:offset+limit<list.length?offset+limit:null};
    }else{
     const n=g.byView.get(Number(route.split('/')[1]));ensure(n,'ENTITY_NOT_FOUND','The selected view entity is unavailable in this snapshot.',404);value=inspectEntity(g,n,{offset,limit});
    }
   }
  }
  const body=exactJSON(value);ensure(Buffer.byteLength(body)<=LIMIT.response,'RESPONSE_CAPACITY','Use a smaller retained page or the original raw response download.',413);
  return{status:200,headers:{'Content-Type':'application/json; charset=utf-8','Cache-Control':'no-store','X-Content-Type-Options':'nosniff'},body};
 }
 return{handle,manifest,close(){closed=true;cache.clear();loading.clear();}};
}
