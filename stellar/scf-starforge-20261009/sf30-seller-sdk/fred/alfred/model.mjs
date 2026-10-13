// MIT. Retained ALFRED level observations with explicit source and metadata editions.
import { canonical,clone,need,plain,date,normalizeSelection,utf8Length,MAX_CAPTURE_BYTES } from '../model.mjs';
import { readFredDdpCsv } from '../ddp/csv.mjs';

export const ALFRED_CAPTURE='stellar-forge.alfred-vintage-capture.v1';
export const ALFRED_SOURCE='stellar-forge.alfred-vintage-source.v1';
export const ALFRED_TIME_BASIS='ALFRED_VINTAGE_DATE';
export const ALFRED_SOURCE_MODE='ALFRED_VINTAGE';
export const ALFRED_DOCUMENTATION='https://alfred.stlouisfed.org/help/downloaddata';
export const ALFRED_FIELDS=Object.freeze(['title','publisher','release','units','frequency','seasonalAdjustment','notes']);
const DIGEST=/^[a-f0-9]{64}$/;
function timestamp(value,label){
  need(typeof value==='string'&&/^\d{4}-\d{2}-\d{2}T/.test(value)&&Number.isFinite(Date.parse(value)),label+' must retain an actual ISO capture timestamp.');
  return value;
}
function officialUrl(value){
  let url;try{url=new URL(value);}catch{need(false,'Use the retained official ALFRED source URL.');}
  need(url.protocol==='https:'&&url.hostname==='alfred.stlouisfed.org'&&!url.username&&!url.password&&!url.hash&&!url.port,'Use the original HTTPS ALFRED host without credentials or a fragment.');
  return url;
}
export function fredAlfredRequest(selectionInput,series){
  const selection=normalizeSelection(selectionInput);need(selection.series.includes(series),'Select an original series from this acquisition.');
  const url=new URL('https://alfred.stlouisfed.org/graph/alfredgraph.csv');
  url.searchParams.set('id',series);url.searchParams.set('vintage_date',selection.asOf);
  url.searchParams.set('cosd',selection.start);url.searchParams.set('coed',selection.end);
  return {method:'GET',url:url.href,series,vintage:selection.asOf,start:selection.start,end:selection.end,units:'lin',output:'all_observations'};
}
function sameRequestUrl(value,request){
  const actual=officialUrl(value),expected=new URL(request.url);
  need(actual.pathname===expected.pathname&&actual.searchParams.size===expected.searchParams.size&&
    [...expected.searchParams].every(([key,value])=>actual.searchParams.getAll(key).length===1&&actual.searchParams.get(key)===value),
    'The source URL changed the selected series, vintage, period or original-level output.');
}
function textSource(source,label){
  need(plain(source)&&typeof source.body==='string'&&source.bytes===utf8Length(source.body)&&source.bytes<=MAX_CAPTURE_BYTES&&DIGEST.test(source.sha256??''),label+' must retain its complete original UTF-8 bytes and digest.');
  timestamp(source.receivedAt,label+' retrieval time');officialUrl(source.url);
  need(['http','file'].includes(source.kind),label+' must distinguish a retained HTTP response from a received original file.');
  if(source.kind==='http'){
    need(source.status===200,label+' must be an actual successful original response.');officialUrl(source.finalUrl);
    need(plain(source.headers)&&Object.keys(source.headers).every(k=>['content-type','date','etag','last-modified','content-length','retry-after'].includes(k))&&
      Object.values(source.headers).every(v=>typeof v==='string'),label+' retains only original public response headers.');
  }else need(source.status===null&&source.finalUrl===null&&plain(source.headers)&&Object.keys(source.headers).length===0,
    'An imported original file must not invent HTTP status, response headers or redirects.');
  return source;
}
function span(body,input,label){
  need(plain(input)&&Number.isSafeInteger(input.start)&&Number.isSafeInteger(input.end)&&input.start>=0&&input.end>=input.start&&input.end<=body.length&&
    typeof input.value==='string'&&body.slice(input.start,input.end)===input.value,label+' must match its original source text range exactly.');
  return input.value;
}
export function readFredAlfredMetadata(input,{series,vintage}){
  if(input===null||input===undefined)return {coverage:'UNAVAILABLE',fields:Object.fromEntries(ALFRED_FIELDS.map(k=>[k,''])),editions:null,source:null};
  need(plain(input)&&input.schema==='stellar-forge.alfred-metadata-edition.v1','Import a retained ALFRED metadata edition.');
  const source=textSource(input.source,'Historical metadata'),body=source.body;
  need(span(body,input.series,'Historical metadata series')===series,'The metadata edition names a different series.');
  need(date(span(body,input.selectedVintage,'Selected metadata vintage'))===vintage,'The original metadata file must include the requested selected vintage.');
  need(plain(input.fields)&&Object.keys(input.fields).every(key=>ALFRED_FIELDS.includes(key)),'Historical metadata contains an unsupported field.');
  const fields={},editions={},issues=[];
  for(const key of ALFRED_FIELDS){
    const field=input.fields[key];
    if(field===null||field===undefined){
      need(['publisher','release','notes'].includes(key),'Historical metadata needs its original '+key+'.');
      fields[key]='';editions[key]=null;continue;
    }
    need(plain(field),'The historical '+key+' field needs an original edition.');
    const value=span(body,field.text,key),start=date(span(body,field.realtimeStart,key+' real-time start'));
    const end=date(span(body,field.realtimeEnd,key+' real-time end'));
    need(start<=end,'The retained '+key+' historical interval is reversed.');
    const covers=start<=vintage&&end>=vintage;
    if(!covers)issues.push({field:key,realtimeStart:start,realtimeEnd:end,requestedVintage:vintage,message:'This original metadata interval does not cover the selected vintage.'});
    need(value.length>0||key==='notes','The original '+key+' field cannot be empty.');
    fields[key]=covers?value:'';editions[key]={value,realtimeStart:start,realtimeEnd:end,covers,sourceRange:{start:field.text.start,end:field.text.end}};
  }
  return {coverage:issues.some(item=>['title','units','frequency','seasonalAdjustment'].includes(item.field))?'PARTIAL_HISTORICAL_EDITION':'ALFRED_HISTORICAL_EDITION',fields,editions,issues,source:{url:source.url,receivedAt:source.receivedAt,bytes:source.bytes,sha256:source.sha256}};
}
export function readFredAlfredCsv(record,selectionInput){
  const selection=normalizeSelection(selectionInput);
  need(plain(record)&&plain(record.request)&&canonical(record.request)===canonical(fredAlfredRequest(selection,record.request.series)),
    'Retain the exact original ALFRED acquisition request.');
  const {series,vintage}=record.request,source=textSource(record.response,'Vintage CSV');
  sameRequestUrl(source.url,record.request);if(source.kind==='http')sameRequestUrl(source.finalUrl,record.request);
  need(new Date(source.receivedAt).toISOString().slice(0,10)>=vintage,'The selected vintage cannot occur after the original source retrieval.');
  const csv=readFredDdpCsv(source.body,{maxRows:1000002,maxColumns:2,maxCellCharacters:2048});
  const records=csv.records.filter(row=>!(row.cells.length===1&&row.cells[0]===''));
  need(records.length>=1&&records[0].cells.length===2,'ALFRED must return the original date column and one selected vintage column.');
  const header=records[0].cells;
  need(['observation_date','DATE'].includes(header[0]),'The original observation-date header is missing.');
  const expected=series+'_'+vintage.replaceAll('-','');
  need(header[1]===expected,'The returned ALFRED series/vintage column does not match the requested historical snapshot.');
  let previous=null;const observations=[];
  for(const item of records.slice(1)){
    need(item.cells.length===2,'Every original vintage row must contain exactly a date and one value.');
    const when=date(item.cells[0],'Original observation date'),value=item.cells[1];
    need(previous===null||when>previous,'Original observations must remain unique and ascending.');
    need(value===''||value==='.'||/^-?\d+(?:\.\d+)?(?:[eE][+-]?\d{1,4})?$/.test(value),'Retain original numeric strings or the original blank or dot missing marker.');
    observations.push({date:when,value,missing:value===''||value==='.',originalRow:item.row,sourceRange:clone(item.location)});previous=when;
  }
  need(observations.length<=1000000,'The original series exceeds the source row capacity.');
  return {series,vintage,header:[...header],observations,source:{url:source.url,receivedAt:source.receivedAt,bytes:source.bytes,sha256:source.sha256,kind:source.kind}};
}
export function inspectFredAlfredCapture(capture){
  need(plain(capture)&&capture.schema===ALFRED_CAPTURE&&plain(capture.source)&&capture.source.schema===ALFRED_SOURCE,'Select a complete retained ALFRED vintage capture.');
  const selection=normalizeSelection(capture.selection);
  need(canonical(selection)===canonical(capture.selection),'The ALFRED selection must retain the original normalized interval.');
  need(Array.isArray(capture.source.series)&&capture.source.series.length===selection.series.length,'Retain exactly one complete original response per selected series.');
  let bytes=0;const series=[],rows=[],seen=new Set(),retrieved=[];
  for(const record of capture.source.series){
    const original=readFredAlfredCsv(record,selection),id=original.series;
    need(selection.series.includes(id)&&!seen.has(id),'The capture repeats or adds an unselected original series.');seen.add(id);
    const historical=readFredAlfredMetadata(record.metadata??null,{series:id,vintage:selection.asOf});
    bytes+=record.response.bytes+(record.metadata?.source?.bytes??0);need(bytes<=MAX_CAPTURE_BYTES,'The complete historical source exceeds 64 MiB.');
    const values=original.observations.filter(row=>row.date>=selection.start&&row.date<=selection.end),meaning=historical.fields;
    series.push({id,...meaning,observationStart:values[0]?.date??null,observationEnd:values.at(-1)?.date??null,lastUpdated:'',
      sourceUrl:original.source.url,asOf:selection.asOf,requestedVintage:selection.asOf,returnedVintage:original.vintage,
      returnedColumn:original.header[1],retrievedAt:original.source.receivedAt,timeBasis:ALFRED_TIME_BASIS,
      metadataCoverage:historical.coverage,metadataEditions:historical.editions,metadataIssues:historical.issues??[],metadataSource:historical.source,
      count:values.length,originalCount:original.observations.length,outsideSelection:original.observations.length-values.length,missing:values.filter(row=>row.missing).length});
    retrieved.push(Date.parse(original.source.receivedAt));
    for(const item of values)rows.push({series:id,date:item.date,value:item.value,missing:item.missing,as_of:selection.asOf,
      time_basis:ALFRED_TIME_BASIS,realtime_start:'',realtime_end:'',units:meaning.units,frequency:meaning.frequency,seasonal_adjustment:meaning.seasonalAdjustment});
    need(rows.length<=selection.maxRows,'Combined historical observations exceed the selected row capacity.');
  }
  need(selection.series.every(id=>seen.has(id)),'The capture omits a selected original series.');
  series.sort((a,b)=>a.id<b.id?-1:a.id>b.id?1:0);rows.sort((a,b)=>a.series<b.series?-1:a.series>b.series?1:a.date<b.date?-1:a.date>b.date?1:0);
  return {selection,sourceMode:ALFRED_SOURCE_MODE,timeBasis:ALFRED_TIME_BASIS,series,rows,rowCount:rows.length,
    missing:rows.filter(row=>row.missing).length,sourceResponses:series.length,
    metadataComplete:series.every(item=>item.metadataCoverage==='ALFRED_HISTORICAL_EDITION'),
    retrievalWindow:{from:new Date(Math.min(...retrieved)).toISOString(),through:new Date(Math.max(...retrieved)).toISOString()}};
}
export function fredAlfredCaptureIdentity(capture){
  return {schema:ALFRED_CAPTURE,selection:capture.selection,source:capture.source};
}
