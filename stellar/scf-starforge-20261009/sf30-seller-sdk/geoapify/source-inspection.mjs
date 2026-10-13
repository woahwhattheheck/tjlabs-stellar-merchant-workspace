// MIT. Inspect real source bytes before committing their explicit Geoapify mapping.
import {hash,canonical,readCsvRecords,readJSONSourceRecords,coordinatePair,
  createIntake,mapping as normalizeMapping,field,object,own,fail} from './source.mjs';
export const SOURCE_INSPECTION_SCHEMA='stellar-forge.geoapify-source-inspection.v1';
const FORBIDDEN=new Set(['__proto__','prototype','constructor']);
const ADDRESS_TYPES=new Set(['string','number']);
const IDENTITY_TYPES=new Set(['string','number','boolean']);
const blank=value=>value===undefined||value===null||typeof value==='string'&&!value.trim();
const type=value=>value===null?'null':Array.isArray(value)?'array':typeof value;
const pathSupported=path=>typeof path==='string'&&path.length>0&&path.length<=200&&
  !path.split('.').some(part=>!part||FORBIDDEN.has(part));
const clone=value=>structuredClone(value);
function integer(value,label,min,max) {
  if(!Number.isSafeInteger(value)||value<min||value>max)
    throw fail('INSPECTION_PAGE',label+' must be an integer from '+min+' through '+max+'.');
  return value;
}
function page(values,offset,limit) {
  const selected=values.slice(offset,offset+limit);
  return {values:clone(selected),page:{offset,limit,total:values.length,returned:selected.length,
    nextOffset:offset+selected.length<values.length?offset+selected.length:null}};
}
function newField(path) {
  return {path,types:{},observedTypes:{},present:0,blank:0,examples:[],variants:new Map()};
}
function sample(value) {
  if(value!==null&&!['string','number','boolean'].includes(typeof value))return null;
  return typeof value==='string'&&value.length>240?
    {value:value.slice(0,240),truncated:true,originalChars:value.length}:{value,truncated:false};
}
/** The rows and statistics are derived from every record, never from the preview sample. */
function describeFields(records,headers) {
  const fields=new Map();
  const ensure=path=>{if(!fields.has(path))fields.set(path,newField(path));return fields.get(path);};
  for(const header of headers??[])ensure(header);
  for(const row of records) {
    const candidates=new Map();
    const walk=(node,segments=[])=>{
      for(const [key,value] of Object.entries(node)) {
        const parts=[...segments,key],path=parts.join('.');
        const options=candidates.get(path)??[];
        options.push({segments:parts,value});candidates.set(path,options);
        if(object(value))walk(value,parts);
      }
    };
    walk(row);
    for(const [path,variants] of candidates) {
      const info=ensure(path),supported=pathSupported(path);
      const resolved=supported?field(row,path):undefined;
      let selectedSegments=null;
      if(supported&&own(row,path))selectedSegments=[path];
      else if(supported&&resolved!==undefined)selectedSegments=path.split('.');
      for(const variant of variants) {
        info.observedTypes[type(variant.value)]=(info.observedTypes[type(variant.value)]??0)+1;
        const key=canonical(variant.segments);
        if(!info.variants.has(key))info.variants.set(key,{segments:variant.segments,rows:0,shadowedRows:0,inaccessibleRows:0});
        const observed=info.variants.get(key);observed.rows++;
        if(!selectedSegments)observed.inaccessibleRows++;
        else if(key!==canonical(selectedSegments))observed.shadowedRows++;
      }
      if(resolved===undefined)continue;
      info.present++;info.types[type(resolved)]=(info.types[type(resolved)]??0)+1;
      if(blank(resolved))info.blank++;
      if(info.examples.length<3) {
        const example=sample(resolved);
        if(example&&!info.examples.some(item=>canonical(item)===canonical(example)))info.examples.push(example);
      }
    }
  }
  return [...fields.values()].map(({variants,...info})=>{
    const supported=pathSupported(info.path),types=Object.keys(info.types);
    const collisions=[...variants.values()].filter(item=>variants.size>1||item.shadowedRows||item.inaccessibleRows);
    return {...info,missing:records.length-info.present,pathSupported:supported,
      addressSelectable:supported&&(types.some(t=>ADDRESS_TYPES.has(t))||!types.length&&headers?.includes(info.path)),
      identitySelectable:supported&&(types.some(t=>IDENTITY_TYPES.has(t))||!types.length&&headers?.includes(info.path)),
      collisions};
  });
}
function inspectMapping(records,source,fields,raw) {
  let map;
  try {map=normalizeMapping(raw);}
  catch(error) {
    if(!error.code?.startsWith('GEOAPIFY_'))throw error;
    return {summary:{valid:false,errors:[{code:error.code,message:error.message}]},rows:null};
  }
  const base={mapping:map,mappingSha256:hash(canonical(map))};
  let intake;
  try {intake=createIntake({records,source,mapping:map});}
  catch(error) {
    if(!error.code?.startsWith('GEOAPIFY_'))throw error;
    return {summary:{...base,valid:false,errors:[{code:error.code,message:error.message}]},rows:null};
  }
  const fieldIndex=new Map(fields.map(value=>[value.path,value]));
  const missingPaths=Object.entries(map).filter(([,path])=>path&&!(fieldIndex.get(path)?.present))
    .map(([key,path])=>({key,path}));
  const coordinates={mapped:Boolean(map.latitude&&map.longitude),valid:0,missing:0,invalid:0};
  if(coordinates.mapped)for(const row of records) {
    const latitude=field(row,map.latitude),longitude=field(row,map.longitude);
    if(blank(latitude)&&blank(longitude))coordinates.missing++;
    else if(coordinatePair(latitude,longitude))coordinates.valid++;
    else coordinates.invalid++;
  }
  const occurrences=new Map();
  for(const row of intake.rows)if(row.identity!==null)occurrences.set(row.identity,(occurrences.get(row.identity)??0)+1);
  return {rows:intake.rows,occurrences,queries:intake.queries,summary:{...base,valid:true,errors:[],
    queryCount:Object.keys(intake.queries).length,invalidRows:intake.rows.filter(row=>!row.queryId).length,
    problemRows:intake.rows.filter(row=>row.problems.length).length,
    duplicateIdentities:intake.duplicateIdentities.length,
    duplicateIdentityRows:intake.duplicateIdentities.reduce((count,group)=>count+group.ordinals.length,0),
    missingIdentities:map.identity?intake.rows.filter(row=>blank(field(row.source,map.identity))).length:null,
    coordinateCoverage:coordinates,missingPaths}};
}
/**
 * Retain one parsed source and its last mapping for field/row pagination.
 * The caller still re-reads exact bytes and checks both hashes before any import/stage.
 */
export function createSourceInspection({bytes,format,name='',mapping:initialMapping}={}) {
  if(!(bytes instanceof Uint8Array)||bytes.byteLength>256*1024*1024)
    throw fail('SOURCE','Inspect original UTF-8 source bytes, at most 256 MiB.');
  if(!['csv','json'].includes(format))throw fail('SOURCE','Choose CSV or JSON original records.');
  if(typeof name!=='string'||name.length>4000||/[\x00-\x1f\x7f]/.test(name))
    throw fail('SOURCE','Use a printable original source name.');
  const input=Buffer.isBuffer(bytes)?bytes:Buffer.from(bytes);
  const parsed=format==='csv'?readCsvRecords(input):{rows:readJSONSourceRecords(input)};
  const records=parsed.rows;
  if(!Array.isArray(records)||records.length>1000000||records.some(row=>!object(row)))
    throw fail('SOURCE','Inspect at most one million original object records.');
  const source={name,format,bytes:input.length,sha256:hash(input)};
  const fields=describeFields(records,parsed.headers);
  let lastKey,lastMapping;
  return {source:clone(source),rowCount:records.length,
    inspect({mapping:raw=initialMapping,fieldOffset=0,fieldLimit=100,fieldSearch='',rowOffset=0,rowLimit=25}={}) {
      integer(fieldOffset,'Field offset',0,Number.MAX_SAFE_INTEGER);integer(fieldLimit,'Field page size',1,250);
      integer(rowOffset,'Row offset',0,Number.MAX_SAFE_INTEGER);integer(rowLimit,'Row page size',1,250);
      if(typeof fieldSearch!=='string'||fieldSearch.length>200)throw fail('INSPECTION_PAGE','Search original fields with at most 200 characters.');
      const searched=fieldSearch.toLocaleLowerCase();
      const fieldPage=page(searched?fields.filter(item=>item.path.toLocaleLowerCase().includes(searched)):fields,fieldOffset,fieldLimit);
      const result={schema:SOURCE_INSPECTION_SCHEMA,source:clone(source),rowCount:records.length,
        fields:fieldPage.values,fieldsPage:{...fieldPage.page,search:fieldSearch,unfilteredTotal:fields.length}};
      let selected;
      if(raw!==undefined) {
        let key;try{key=canonical(raw);}catch{throw fail('MAPPING','Choose a JSON field mapping.');}
        if(key!==lastKey||!lastMapping){lastMapping=inspectMapping(records,source,fields,raw);lastKey=key;}
        result.mapped=clone(lastMapping.summary);
        if(lastMapping.rows) {
          const paged=page(lastMapping.rows,rowOffset,rowLimit);
          result.rows=paged.values.map(row=>({...row,
            params:row.queryId?clone(lastMapping.queries[row.queryId]):null,
            identityOccurrences:row.identity===null?0:lastMapping.occurrences.get(row.identity)??0}));
          result.rowsPage=paged.page;
          return result;
        }
      }
      selected=page(records,rowOffset,rowLimit);
      result.rows=selected.values.map((source,index)=>({ordinal:rowOffset+index+1,source}));
      result.rowsPage=selected.page;
      return result;
    }};
}
export function inspectSource(options) {
  return createSourceInspection(options).inspect(options);
}
