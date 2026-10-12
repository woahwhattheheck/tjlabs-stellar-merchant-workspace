// MIT. Source projections retain original bytes, typed values and row/JSON locators.
import {entityOccurrences,graphIndex,observationRows} from '../domain.mjs';
import {entityId,identity,plain,sourceDocument,sourceKey,cleanBody,RELATIONS,KINDS,WRITABLE,JsonNumber,exact,exactParse,issue,fail,choice,paragraph,integer,text,clone} from './common.mjs';
import {LIMITS} from './schema.mjs';
const own=(v,k)=>Object.hasOwn(v,k);
const DEFAULT_MAPPING={version:1,namespace:'',sourceSelection:{streamKeys:[],occurrenceIds:[]},csv:{encoding:'utf-8',delimiter:',',headerRow:1,columns:{phenomenonTime:'time',result:'result'},resultType:'string',nullToken:null,relations:{}},entities:[],bindings:[],markerProperty:'tjlabsCommissioning',batchSize:100};
export function normalizeMapping(input){
 if(!plain(input)||input.version!==1)throw fail('MAPPING','Use commissioning mapping version1.');
 const value={...DEFAULT_MAPPING,...clone(input),sourceSelection:{...DEFAULT_MAPPING.sourceSelection,...clone(input.sourceSelection??{})},csv:{...DEFAULT_MAPPING.csv,...clone(input.csv??{})}};
 value.namespace=text(value.namespace,'reviewed namespace',120);if(!/^[A-Za-z0-9][A-Za-z0-9_.:-]{0,119}$/.test(value.namespace))throw fail('MAPPING','Use a stable namespace of letters, numbers, dots, underscores, colons or hyphens.');
 value.markerProperty=text(value.markerProperty,'managed provenance property',100);
 if(['__proto__','constructor','prototype'].includes(value.markerProperty))throw fail('MAPPING','Select an ordinary provenance property name.');
 integer(value.batchSize,'native receipt page size',1,1000);
 for(const name of ['streamKeys','occurrenceIds'])if(!Array.isArray(value.sourceSelection[name])||value.sourceSelection[name].some(x=>typeof x!=='string')||new Set(value.sourceSelection[name]).size!==value.sourceSelection[name].length)throw fail('MAPPING','Use distinct source selection IDs.');
 choice(value.csv.encoding,['utf-8','utf-16le','windows-1252'],'the source encoding');
 if(typeof value.csv.delimiter!=='string'||[...value.csv.delimiter].length!==1||/["\r\n\u0000]/.test(value.csv.delimiter))throw fail('MAPPING','Select one literal non-quote field delimiter.');
 integer(value.csv.headerRow,'header record',1,10000);choice(value.csv.resultType,['string','number','boolean','json'],'the result type');
 if(value.csv.nullToken!==null&&typeof value.csv.nullToken!=='string')throw fail('MAPPING','The null token is a literal string or null to disable null conversion.');
 if(!plain(value.csv.columns)||!plain(value.csv.relations))throw fail('MAPPING','Use explicit source columns and entity relations.');
 const columnKeys=['id','phenomenonTime','resultTime','validTime','result','resultQuality','parameters'];
 for(const [key,column]of Object.entries(value.csv.columns))if(!columnKeys.includes(key)||typeof column!=='string'||!column)throw fail('MAPPING','Choose declared observation columns by original header name.');
 if(!Array.isArray(value.entities)||value.entities.length>LIMITS.entities||!Array.isArray(value.bindings)||value.bindings.length>LIMITS.rows)throw fail('MAPPING','Use complete explicit entity and binding arrays within the declared source capacity.');
 const seen=new Set();for(const binding of value.bindings){
  if(!plain(binding)||typeof binding.sourceKey!=='string'||seen.has(binding.sourceKey))throw fail('MAPPING','Each original source key has one explicit target binding.');
  seen.add(binding.sourceKey);choice(binding.mode,['create','bind','update'],'the target action');
  if(binding.mode!=='create'&&typeof binding.targetIdJson!=='string')throw fail('MAPPING','Bind/update needs the exact target identifier JSON.');
  if(binding.overrides!==undefined&&!plain(binding.overrides))throw fail('MAPPING','Authored overrides are a JSON object.');
  if(binding.sourceOccurrenceId!==undefined&&typeof binding.sourceOccurrenceId!=='string')throw fail('MAPPING','Choose an original conflicting occurrence by its ID.');
 }
 return value;
}
function rawNode(kind,record,sourceRef,occurrenceId,relations={},extra={}){
 if(!KINDS.includes(kind)||!plain(record))throw fail('SOURCE_ENTITY','The selected source is not an original SensorThings entity.');
 const cleaned=cleanBody(kind,record),key=sourceKey(kind,record,sourceRef);
 return {sourceKey:key,entityKind:kind,bodyText:exact(cleaned.values),sourceJson:exact(record),relations,
  sourceRefs:[sourceRef],occurrenceIds:[occurrenceId],omittedFields:cleaned.omitted,sourceRowCount:kind==='Observations'?1:0,...extra};
}
function refKey(ref){return (ref.sha256??'')+'|'+(ref.jsonPointer??('row:'+ref.row));}
function relationSpec(kind,name,values){
 const spec=RELATIONS[kind]?.[name];if(!spec)return null;
 return {kind:spec.kind,many:spec.many===true,values};
}
function aggregate(nodes){
 const groups=new Map(),output=[],issues=[];let duplicateOccurrences=0,conflictingSourceKeys=0;
 for(const node of nodes){
  const hash=identity({kind:node.entityKind,body:exactParse(node.bodyText),relations:node.relations});
  const variants=groups.get(node.sourceKey)??[],before=variants.find(x=>x.semanticSha256===hash);
  if(before){before.sourceRefs.push(...node.sourceRefs);before.occurrenceIds.push(...node.occurrenceIds);before.sourceRowCount+=node.sourceRowCount;duplicateOccurrences+=node.entityKind==='Observations'?node.sourceRowCount:1;continue;}
  const row={...node,semanticSha256:hash};variants.push(row);groups.set(node.sourceKey,variants);output.push(row);
 }
 for(const [key,variants]of groups)if(variants.length>1){
  conflictingSourceKeys++;issues.push(issue('CONFLICTING_SOURCE_ID',{sourceKey:key,occurrenceIds:variants.flatMap(x=>x.occurrenceIds)},true));
  for(const row of variants)row.conflict=true;
 }
 return {records:output,issues,duplicateOccurrences,conflictingSourceKeys};
}
export async function normalizeEdition(store,edition,configuration=DEFAULT_MAPPING){
 const graph=await graphIndex(store,edition),items=[],byRef=new Map(),byTyped=new Map();
 for await(const item of entityOccurrences(store,edition,{includeObservations:false,includeEnd:false,includeObservationMetadata:true})){
  items.push(item);byRef.set(refKey(item.sourceRef),sourceKey(item.kind,item.record,item.sourceRef));
  try{byTyped.set(item.kind+'/'+entityId(item.record['@iot.id']).key,sourceKey(item.kind,item.record,item.sourceRef));}catch{}
  if(items.length>LIMITS.entities)throw fail('SOURCE_CAPACITY','The selected source graph exceeds the declared entity capacity.',413);
 }
 function relationsFor(item,kind){
  const out={};
  for(const [name,spec]of Object.entries(RELATIONS[kind]??{})){
   const values=graph.relation(item,name).map(x=>({sourceKey:byRef.get(refKey(x.sourceRef))??sourceKey(spec.kind,x.record,x.sourceRef)}));
   if(values.length)out[name]=relationSpec(kind,name,values);
  }
  return out;
 }
 const nodes=items.map(x=>rawNode(x.kind,x.record,x.sourceRef,x.occurrenceId,relationsFor(x,x.kind))),selectedStreams=new Set(configuration.sourceSelection?.streamKeys??[]),
  selectedOccurrences=new Set(configuration.sourceSelection?.occurrenceIds??[]),selectionIssues=[];
 let sourceRows=0,selectedRows=0,excludedRows=0;
 for await(const {row,original}of observationRows(store,edition,{graph})){
  sourceRows++;if(sourceRows>LIMITS.rows)throw fail('SOURCE_CAPACITY','The selected source exceeds the declared observation capacity.',413);
  const stream=edition.plan.streams.find(x=>x.kind===row.stream_kind&&x.id.type===row.stream_id_type&&x.id.value===row.stream_id);
  if((selectedStreams.size&&!selectedStreams.has(stream?.key))||(selectedOccurrences.size&&!selectedOccurrences.has(original.occurrenceId))){excludedRows++;continue;}
  selectedRows++;
  const record=exactParse(row.observation_json),observationItem={record,sourceRef:original.sourceRef,page:{url:original.sourceRef.url}},
   relations=relationsFor(observationItem,'Observations');
  if(stream){
   const sourceItem=graph.streams.get(stream.key);
   relations[stream.kind==='MultiDatastreams'?'MultiDatastream':'Datastream']={kind:stream.kind,many:false,values:[{sourceKey:sourceKey(stream.kind,sourceItem.record,sourceItem.sourceRef)}]};
  }
  const selected=rawNode('Observations',record,original.sourceRef,original.occurrenceId,relations,{streamKey:stream?.key??null,
   originalIssues:JSON.parse(row.issues),row:{...row}});
  nodes.push(selected);
 }
 for(const key of selectedStreams)if(!edition.plan.streams.some(x=>x.key===key))selectionIssues.push(issue('UNKNOWN_SELECTED_STREAM',{streamKey:key},true));
 if(selectedOccurrences.size){const available=new Set(nodes.flatMap(x=>x.occurrenceIds));for(const key of selectedOccurrences)if(!available.has(key))selectionIssues.push(issue('UNKNOWN_SELECTED_OCCURRENCE',{occurrenceId:key},true));}
 const result=aggregate(nodes);
 // Include only the transitive metadata graph needed by selected observations.
 const needed=new Set(result.records.filter(x=>x.entityKind==='Observations').map(x=>x.sourceKey));
 let changed=true;while(changed){changed=false;for(const node of result.records)if(needed.has(node.sourceKey))for(const rel of Object.values(node.relations))for(const value of rel.values)if(value.sourceKey&&!needed.has(value.sourceKey)){needed.add(value.sourceKey);changed=true;}}
 const records=selectedRows?result.records.filter(x=>needed.has(x.sourceKey)):result.records.filter(x=>x.entityKind!=='Observations');
 return {schema:'stellar-forge.sensorthings-commissioning-source.v1',format:'edition',editionId:edition.id,
  scope:edition.scope,source:edition.source,records,sourceRows,selectedRows,excludedRows,
  duplicateOccurrences:result.duplicateOccurrences,conflictingSourceKeys:result.conflictingSourceKeys,
  issues:[...result.issues.filter(x=>needed.has(x.sourceKey)),...selectionIssues,...(edition.issues??[]).map(x=>issue('ORIGINAL_SOURCE_ISSUE',{original:x}))],
  meaning:'Beginning source metadata and exact observation bodies; later source metadata and full transport bytes remain in the original edition archive.'};
}
// Grammar derived from the maintained SF30 review-sheet CSV reader. Delimiter,
// record/column capacities and error messages are adapted for source intake.
export function delimitedRecords(text,delimiter,{maxRecords=LIMITS.rows+10000,maxColumns=1024}={}){
 const output=[];let row=[],cell=[],fragments=[],size=0,mode=0,started=false,skipLF=false,first=true;
 function append(character){size+=character.length;started=true;if(size>4*1024*1024)throw fail('CSV_CELL','A source field exceeds4MiB.',413);cell.push(character);if(cell.length===2048){fragments.push(cell.join(''));cell=[];}}
 function field(){if(cell.length)fragments.push(cell.join(''));row.push(fragments.join(''));cell=[];fragments=[];size=0;mode=0;started=false;if(row.length>maxColumns)throw fail('CSV_COLUMNS','The source record exceeds its column capacity.',413);}
 function record(){field();output.push(row);row=[];if(output.length>maxRecords)throw fail('CSV_ROWS','The source exceeds its row capacity.',413);}
 for(const character of text){
  if(first){first=false;if(character==='\uFEFF')continue;}
  if(skipLF){skipLF=false;if(character==='\n')continue;}
  if(mode===1){if(character==='"')mode=2;else append(character);continue;}
  if(mode===2&&character==='"'){append('"');mode=1;continue;}
  if(character===delimiter){field();continue;}
  if(character==='\n'||character==='\r'){record();skipLF=character==='\r';continue;}
  if(mode===2)throw fail('CSV_GRAMMAR','The source contains text after a closing quote.');
  if(character==='"'){if(started)throw fail('CSV_GRAMMAR','A source quote must begin a field.');mode=1;started=true;}else append(character);
 }
 if(mode===1)throw fail('CSV_GRAMMAR','The source contains an unterminated quoted field.');
 if(started||size||row.length||mode===2)record();
 return output;
}
function authoredEntities(configuration,ref){
 return configuration.entities.map((input,index)=>{
  if(!plain(input)||!KINDS.includes(input.entityKind)||typeof input.sourceKey!=='string'||!input.sourceKey)throw fail('MAPPING_ENTITY','Each authored entity needs a stable sourceKey and native entityKind.');
  const record=typeof input.bodyText==='string'?exactParse(input.bodyText):input.body;
  if(!plain(record))throw fail('MAPPING_ENTITY','An authored native entity body must be an object.');
  const relations=normalizeRelations(input.entityKind,input.relations??{});
  const sourceRef={...ref,mappingEntity:index},node=rawNode(input.entityKind,record,sourceRef,identity(sourceRef),relations,{authored:true});
  node.sourceKey=input.sourceKey;return node;
 });
}
export function normalizeRelations(kind,input){
 if(!plain(input))throw fail('RELATIONS','Supply explicit native entity relations.');
 const out={};
 for(const [name,raw]of Object.entries(input)){
  const spec=RELATIONS[kind]?.[name];if(!spec)throw fail('RELATIONS','The selected entity does not declare relation '+name+'.');
  const list=Array.isArray(raw)?raw:[raw],values=list.map(x=>typeof x==='string'?{sourceKey:x}:clone(x));
  for(const x of values)if(!plain(x)||((typeof x.sourceKey!=='string')===(typeof x.targetIdJson!=='string')))throw fail('RELATIONS','Each relation selects one source key or exact target identifier.');
  if(!spec.many&&values.length!==1)throw fail('RELATIONS','The native relation '+name+' requires one entity.');
  out[name]={kind:spec.kind,many:spec.many===true,values};
 }
 return out;
}
function converted(value,type,nullToken){
 if(nullToken!==null&&value===nullToken)return null;
 if(type==='string')return value;
 if(type==='number'){const parsed=exactParse(value);if(!(parsed instanceof JsonNumber))throw fail('CSV_NUMBER','The selected numeric source field is not a JSON number.');return parsed;}
 if(type==='boolean'){if(value!=='true'&&value!=='false')throw fail('CSV_BOOLEAN','Select exact true/false source Boolean values.');return value==='true';}
 return exactParse(value);
}
export function normalizeCsv(bytes,source,configuration){
 const c=configuration.csv;let decoded;try{decoded=new TextDecoder(c.encoding,{fatal:true}).decode(bytes);}catch{throw fail('CSV_ENCODING','The original file cannot be decoded with the selected encoding.');}
 const raw=delimitedRecords(decoded,c.delimiter),header=raw[c.headerRow-1];
 if(!header||new Set(header).size!==header.length||header.some(x=>!x))throw fail('CSV_HEADER','Select a nonempty, unique original header record.');
 const columns={};for(const [key,name]of Object.entries(c.columns)){const index=header.indexOf(name);if(index<0)throw fail('CSV_COLUMN','The selected original column is absent: '+name+'.');columns[key]=index;}
 if(!own(columns,'result')||!own(columns,'phenomenonTime'))throw fail('CSV_MAPPING','Map result and phenomenonTime explicitly. The server time is not a substitute for the source time.');
 const refs={sha256:source.raw.sha256,bytes:source.raw.bytes,filename:source.raw.filename},
  nodes=authoredEntities(configuration,refs),issues=[];let selectedRows=0,excludedRows=0;
 const occurrences=new Set(configuration.sourceSelection.occurrenceIds);
 for(let index=c.headerRow;index<raw.length;index++){
  const fields=raw[index],sourceRef={...refs,row:index+1},occurrenceId=identity(sourceRef);
  if(occurrences.size&&!occurrences.has(occurrenceId)){excludedRows++;continue;}
  selectedRows++;
  if(fields.length!==header.length){issues.push(issue('CSV_COLUMN_COUNT',{row:index+1,expected:header.length,actual:fields.length},true));continue;}
  try{
   const record={};
   for(const [key,column]of Object.entries(columns)){
    const value=fields[column];
    if(key==='id')record['@iot.id']=value;
    else if(key==='result')record.result=converted(value,c.resultType,c.nullToken);
    else if(['parameters','resultQuality'].includes(key))record[key]=converted(value,'json',c.nullToken);
    else record[key]=c.nullToken!==null&&value===c.nullToken?null:value;
   }
   const node=rawNode('Observations',record,sourceRef,occurrenceId,normalizeRelations('Observations',c.relations),{row:{row:index+1,fields:Object.fromEntries(header.map((h,i)=>[h,fields[i]]))}});
   nodes.push(node);
  }catch(error){issues.push(issue('CSV_VALUE',{row:index+1,message:error.message},true));}
 }
 const result=aggregate(nodes);
 return {schema:'stellar-forge.sensorthings-commissioning-source.v1',format:'csv',source:clone(source),records:result.records,
  sourceRows:raw.length-c.headerRow,selectedRows,excludedRows,header,
  duplicateOccurrences:result.duplicateOccurrences,conflictingSourceKeys:result.conflictingSourceKeys,issues:[...issues,...result.issues]};
}
export function normalizeJson(bytes,source,configuration){
 const doc=sourceDocument(bytes),ref={sha256:source.raw.sha256,bytes:source.raw.bytes,filename:source.raw.filename},nodes=authoredEntities(configuration,ref),issues=[];
 const declarations=[];
 if(source.format.kind==='data-array'){
  const arrays=Array.isArray(doc)?doc:[doc];
  for(let i=0;i<arrays.length;i++){
   const part=arrays[i];if(!plain(part)||!Array.isArray(part.components)||!Array.isArray(part.dataArray)||new Set(part.components).size!==part.components.length)throw fail('DATA_ARRAY','Use the original native dataArray components and row arrays.');
   const streamName=plain(part.Datastream)?'Datastream':plain(part.MultiDatastream)?'MultiDatastream':null;
   if(!streamName)throw fail('DATA_ARRAY','The original dataArray must retain its Datastream or MultiDatastream identity.');
   const streamKind=streamName==='Datastream'?'Datastreams':'MultiDatastreams',stream=part[streamName];
   let streamKey;try{streamKey=streamKind+'/'+entityId(stream['@iot.id']).key;}catch{throw fail('DATA_ARRAY','The original dataArray stream needs its typed @iot.id.');}
   for(let n=0;n<part.dataArray.length;n++){
    const values=part.dataArray[n];if(!Array.isArray(values)||values.length!==part.components.length)throw fail('DATA_ARRAY','The original dataArray component count differs from its row.',422);
    const record={},relations={[streamName]:{kind:streamKind,many:false,values:[{sourceKey:streamKey}]}};
    for(let k=0;k<part.components.length;k++){const key=part.components[k];
     if(key==='FeatureOfInterest/id')relations.FeatureOfInterest={kind:'FeaturesOfInterest',many:false,values:[{sourceKey:'FeaturesOfInterest/'+entityId(values[k]).key}]};
     else if(key==='id')record['@iot.id']=values[k];
     else if(WRITABLE.Observations.includes(key))record[key]=values[k];
     else throw fail('DATA_ARRAY','An original dataArray component is unsupported: '+key+'.');
    }
    const sourceRef={...ref,jsonPointer:(Array.isArray(doc)?'/'+i:'')+'/dataArray/'+n};
    nodes.push(rawNode('Observations',record,sourceRef,identity(sourceRef),relations,{dataArrayComponents:part.components}));
   }
  }
 }else{
  if(plain(doc)&&plain(doc.entities)){for(const [kind,list]of Object.entries(doc.entities)){if(!KINDS.includes(kind)||!Array.isArray(list))throw fail('JSON_ENTITIES','Use native entity collection names and arrays.');for(let i=0;i<list.length;i++)declarations.push({kind,record:list[i],pointer:'/entities/'+kind+'/'+i});}}
  else{
   const kind=source.format.entityKind;choice(kind,KINDS,'the original entity collection kind');
   const list=Array.isArray(doc)?doc:plain(doc)&&Array.isArray(doc.value)?doc.value:[doc];
   for(let i=0;i<list.length;i++)declarations.push({kind,record:list[i],pointer:Array.isArray(doc)?'/'+i:plain(doc)&&Array.isArray(doc.value)?'/value/'+i:''});
  }
  function add(kind,record,pointer,depth=0){
   if(depth>12)throw fail('JSON_GRAPH','The selected source entity graph exceeds12levels.');
   if(!plain(record))throw fail('JSON_ENTITY','The original source entity must be an object.');
   const sourceRef={...ref,jsonPointer:pointer},relations={};
   for(const [name,spec]of Object.entries(RELATIONS[kind]??{})){
    const original=record[name];if(original===undefined)continue;
    const list=Array.isArray(original)?original:[original],values=[];
    for(let i=0;i<list.length;i++){
     const child=list[i],path=pointer+'/'+name+(Array.isArray(original)?'/'+i:'');
     if(!plain(child))throw fail('JSON_RELATION','An original native relationship must be an entity object.');
     const childKey=sourceKey(spec.kind,child,{...ref,jsonPointer:path});values.push({sourceKey:childKey});
     if(Object.keys(child).some(x=>!x.startsWith('@iot.')))add(spec.kind,child,path,depth+1);
    }
    relations[name]={kind:spec.kind,many:spec.many===true,values};
   }
   nodes.push(rawNode(kind,record,sourceRef,identity(sourceRef),relations));
  }
  for(const item of declarations)add(item.kind,item.record,item.pointer);
 }
 if(nodes.length>LIMITS.entities+LIMITS.rows)throw fail('SOURCE_CAPACITY','The complete entity source exceeds declared capacity.',413);
 const selected=new Set(configuration.sourceSelection.occurrenceIds),allRows=nodes.filter(x=>x.entityKind==='Observations').length,
  filtered=nodes.filter(x=>x.entityKind!=='Observations'||!selected.size||x.occurrenceIds.some(id=>selected.has(id))),result=aggregate(filtered);
 return {schema:'stellar-forge.sensorthings-commissioning-source.v1',format:source.format.kind,source:clone(source),records:result.records,
  sourceRows:allRows,selectedRows:filtered.filter(x=>x.entityKind==='Observations').length,excludedRows:allRows-filtered.filter(x=>x.entityKind==='Observations').length,
  duplicateOccurrences:result.duplicateOccurrences,conflictingSourceKeys:result.conflictingSourceKeys,issues:[...issues,...result.issues]};
}
export function sourceFormat(value){
 const config=typeof value==='string'?{kind:value}:value;
 if(!plain(config))throw fail('SOURCE_FORMAT','Select csv, json or data-array source format.');
 choice(config.kind,['csv','json','data-array'],'the original file representation');
 if(config.entityKind!==undefined)choice(config.entityKind,KINDS,'the native entity kind');
 return clone(config);
}
export async function normalizeSource(store,source,edition,configuration){
 if(source.kind==='edition')return normalizeEdition(store,await edition(source.editionId),configuration);
 const bytes=await store.object(source.raw.sha256);
 return source.format.kind==='csv'?normalizeCsv(bytes,source,configuration):normalizeJson(bytes,source,configuration);
}
