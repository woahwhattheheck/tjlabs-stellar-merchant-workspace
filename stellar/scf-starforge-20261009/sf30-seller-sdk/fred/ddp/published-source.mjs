// MIT. Complete current-published FRED transports composed into original public captures.
import { constants } from 'node:fs';
import { open } from 'node:fs/promises';
import { resolve, sep } from 'node:path';
import { need, canonical, date, plain } from '../model.mjs';
import { hash, sealFredPublicTables } from '../source.mjs';
import { readFredDdpCsv } from './csv.mjs';
import { ddpFileName, ddpTimestamp } from './files.mjs';
import { exactFredDdpScaledValue } from './periods.mjs';

const captureSchema='stellar-forge.fred-ddp-current-publication.v1';
const basis='CURRENT_PUBLICATION_RETRIEVAL';
const metadataFields=['Title','Series ID','Source','Frequency','Units','Seasonal Adjustment','Date Range','Last Updated'];
const uint=value=>Number.isSafeInteger(value)&&value>=0;
// The original Python collector seals sort_keys=True, separators=(',', ':')
// with ensure_ascii=True. Preserve that identity for Unicode source editions.
const collectorCanonical=value=>canonical(value).replace(/[\u007f-\uffff]/g,c=>'\\u'+c.charCodeAt(0).toString(16).padStart(4,'0'));

export function validateFredPublishedCapture(capture){
  need(plain(capture)&&capture.schema===captureSchema&&capture.basis===basis&&
    typeof capture.seriesId==='string'&&/^[A-Za-z0-9][A-Za-z0-9_.-]{0,99}$/.test(capture.seriesId)&&
    Array.isArray(capture.files)&&capture.files.length===2&&plain(capture.metadata),'Receive complete current-publication source context.');
  const {id,...core}=capture;
  need(id==='fred-current-publication-'+hash(Buffer.from(collectorCanonical(core))),'The retained current-publication capture identity changed.');
  for(const field of metadataFields)need(typeof capture.metadata[field]==='string'&&capture.metadata[field].trim().length,'Original public metadata needs '+field+'.');
  need(capture.metadata['Series ID']===capture.seriesId&&uint(capture.observationCount)&&capture.observationCount>0&&
    uint(capture.missingCount)&&capture.missingCount<=capture.observationCount&&uint(capture.metadataPageObservationCount)&&
    capture.metadataPageObservationCount<=capture.observationCount,'The original metadata and observation counts differ.');
  date(capture.firstDate,'First published date');date(capture.lastDate,'Last published date');
  need(capture.firstDate<=capture.lastDate&&capture.metadata['Date Range']===capture.firstDate+' to '+capture.lastDate,
    'Retain the complete original metadata date coverage.');
  for(let index=0;index<capture.files.length;index++){
    const descriptor=capture.files[index];
    need(plain(descriptor)&&descriptor.status===200&&Number.isSafeInteger(descriptor.bytes)&&descriptor.bytes>0&&
      typeof descriptor.sha256==='string'&&/^[a-f0-9]{64}$/.test(descriptor.sha256),'A complete successful original FRED source is required.');
    ddpFileName(descriptor.path);ddpTimestamp(descriptor.retrievedAt);
    for(const value of [descriptor.url,descriptor.finalUrl]){
      let url;try{url=new URL(value);}catch{need(false,'Retain an original first-party FRED source URL.');}
      need(url.protocol==='https:'&&url.hostname==='fred.stlouisfed.org'&&!url.username&&!url.password&&!url.port&&!url.hash,
        'Retain an original first-party FRED source URL.');
      if(index===0)need(url.pathname==='/data/'+encodeURIComponent(capture.seriesId)&&!url.search,
        'The exact original metadata URL must identify this series.');
      else need(url.pathname==='/graph/fredgraph.csv'&&url.searchParams.get('id')===capture.seriesId&&
        url.searchParams.get('cosd')===capture.firstDate&&url.searchParams.get('coed')===capture.lastDate&&
        [...url.searchParams.keys()].length===3&&new Set(url.searchParams.keys()).size===3,
        'The exact full observation URL must retain this series and its complete metadata date coverage.');
    }
  }
  return capture;
}

export function validateFredPublishedManifest(manifest){
  need(plain(manifest)&&manifest.schema==='stellar-forge.fred-ddp-current-publication-set.v1'&&manifest.basis===basis&&
    Array.isArray(manifest.captures)&&Array.isArray(manifest.errors)&&manifest.errors.length===0&&
    uint(manifest.seriesCount)&&manifest.seriesCount>0&&manifest.captures.length===manifest.seriesCount&&
    uint(manifest.observationCount),'Receive the complete original target collection.');
  const ids=new Set();let observations=0;
  for(const capture of manifest.captures){validateFredPublishedCapture(capture);need(!ids.has(capture.seriesId),'The original target collection repeats a series.');ids.add(capture.seriesId);observations+=capture.observationCount;}
  need(observations===manifest.observationCount,'The complete target collection observation count changed.');
  ddpTimestamp(manifest.finishedAt);return manifest;
}

function localFile(directory,path){
  ddpFileName(path);
  const root=resolve(directory),file=resolve(root,path);need(file.startsWith(root+sep),'The original member belongs to this workspace.');return file;
}
export async function readFredPublishedTransport(directory,descriptor){
  need(plain(descriptor)&&descriptor.status===200&&Number.isSafeInteger(descriptor.bytes)&&descriptor.bytes>=1&&
    typeof descriptor.sha256==='string'&&/^[a-f0-9]{64}$/.test(descriptor.sha256),'A complete successful original FRED source is required.');
  ddpTimestamp(descriptor.retrievedAt);
  for(const value of [descriptor.url,descriptor.finalUrl]){let u;try{u=new URL(value);}catch{need(false,'Retain an original first-party FRED source URL.');}need(u.protocol==='https:'&&u.hostname==='fred.stlouisfed.org'&&!u.username&&!u.password&&!u.port&&!u.hash,'Retain an original first-party FRED source URL.');}
  const file=await open(localFile(directory,descriptor.path),constants.O_RDONLY|constants.O_NOFOLLOW|constants.O_NONBLOCK);
  try{
    const info=await file.stat();need(info.isFile()&&info.size===descriptor.bytes,'The complete original FRED member changed.');
    const body=await file.readFile();
    need(body.length===descriptor.bytes&&hash(body)===descriptor.sha256,'The complete original FRED member changed.');return body;
  }finally{await file.close();}
}
export async function readFredPublishedTarget(directory,capture){
  validateFredPublishedCapture(capture);
  const [metadataDescriptor,observationsDescriptor]=capture.files;
  const html=await readFredPublishedTransport(directory,metadataDescriptor),csv=await readFredPublishedTransport(directory,observationsDescriptor);
  need(capture.metadata['Series ID']===capture.seriesId,'The original metadata identifies another series.');
  const text=csv.toString('utf8');need(Buffer.from(text).equals(csv),'The original observation CSV uses explicit UTF-8.');
  const parsed=readFredDdpCsv(text),[header,...records]=parsed.records;
  need(canonical(header.cells)===canonical(['observation_date',capture.seriesId]),'The original observation CSV header differs.');
  const rows=records.filter(row=>!row.cells.every(value=>value==='')).map((row,index)=>{
    need(row.cells.length===2,'The original CSV observation cells changed.');date(row.cells[0],'Original CSV observation date');
    need(row.cells[1]===''||row.cells[1]==='.'||exactFredDdpScaledValue(row.cells[1])!==null,'Retain the original numeric observation string or missing marker.');
    return {index,date:row.cells[0],value:row.cells[1],missing:row.cells[1]===''||row.cells[1]==='.',location:row.location};
  });
  need(rows.length===capture.observationCount&&rows[0]?.date===capture.firstDate&&rows.at(-1)?.date===capture.lastDate,'The complete original FRED date population differs.');
  need(rows.every((row,index)=>index===0||row.date>rows[index-1].date),'The complete original FRED dates must remain ordered and unique.');
  need(rows.filter(row=>row.missing).length===capture.missingCount,'The complete original FRED unavailable observation count changed.');
  return {capture,html,csv,rows,metadataDescriptor,observationsDescriptor};
}

/** Preserve original HTML/CSV bytes beside the explicit normalized table representation. */
export async function createFredPublishedSourceCaptures({directory,manifest,batchSize=10}={}){
  validateFredPublishedManifest(manifest);
  need(Number.isSafeInteger(batchSize)&&batchSize>=1&&batchSize<=20,'Choose complete public-source capture groups.');
  const captures=[];let tables=[];
  const flush=()=>{if(tables.length){captures.push(sealFredPublicTables({version:'commons.retained-public-table-set.v1',tables}));tables=[];}};
  for(const captured of manifest.captures){
    const target=await readFredPublishedTarget(directory,captured),fields=captured.metadata;
    const required=['Title','Series ID','Source','Frequency','Units','Seasonal Adjustment','Date Range','Last Updated'];
    for(const field of required)need(typeof fields[field]==='string'&&fields[field].length,'Original public metadata needs '+field+'.');
    const fieldOrder=['Title','Series ID','Source','Release','Frequency','Units','Seasonal Adjustment','Date Range','Last Updated','Notes'];
    const lines=['# Table Data - '+fields.Title,...fieldOrder.filter(key=>fields[key]).map(key=>key+' | '+fields[key].replace(/\s+/g,' ').trim()),'DATE | VALUE',
      ...target.rows.map(row=>row.date+' | '+(row.missing?'.':row.value))];
    const table_text=lines.join('\n')+'\n',original_transports=[target.html,target.csv].map((body,index)=>({
      ...captured.files[index],originalId:'sha256:'+captured.files[index].sha256,base64:body.toString('base64')}));
    const table={version:'commons.retained-public-table.v1',series_id:captured.seriesId,
      source_url:'https://fred.stlouisfed.org/data/'+encodeURIComponent(captured.seriesId),
      retrieved_at:target.observationsDescriptor.retrievedAt,observation_count:target.rows.length,
      bytes:Buffer.byteLength(table_text),sha256:hash(Buffer.from(table_text)),table_text,
      original_source_id:captured.id,original_transports,table_text_basis:'NORMALIZED_OFFICIAL_HTML_METADATA_AND_COMPLETE_CSV',
      normalization:{originalCsvMissingMarkers:['','.'],publicTableMissingMarker:'.',metadataWhitespace:'COLLAPSED'},
      originalMetadataPageObservationCount:captured.metadataPageObservationCount};
    tables.push(table);if(tables.length===batchSize)flush();
  }
  flush();return captures;
}

/** Whole original transports remain recoverable after the existing project receiver. */
export function originalFredPublishedTransports(capture){
  return (capture.source?.tables??[]).flatMap(table=>(table.original_transports??[]).map(source=>{
    const body=Buffer.from(source.base64,'base64');need(body.toString('base64')===source.base64&&body.length===source.bytes&&hash(body)===source.sha256,'An original published transport changed during receiving.');
    return {seriesId:table.series_id,...source,body};
  }));
}
