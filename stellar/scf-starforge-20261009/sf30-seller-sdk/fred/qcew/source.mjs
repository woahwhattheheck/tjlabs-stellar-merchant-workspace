// MIT. Complete original BLS files, source editions and portable capture intake.
import { createHash } from 'node:crypto';
import { gzipSync, gunzipSync } from 'node:zlib';
import { readFile, lstat } from 'node:fs/promises';
import { join, resolve } from 'node:path';
import { privateDirectory, atomicJson, readPrivateJson, withPrivateLock } from '../../routescan/quota.mjs';
import { QCEW_CAPTURE, MAX_CSV_BYTES, need, plain, clone, canonical, inspectCsv, rowKey } from './model.mjs';
export const MAX_QCEW_CAPTURE_BYTES = 224 * 1024 * 1024;
const INTAKE = 'stellar-forge.qcew-original-intake.v1';
export const sha256 = bytes => createHash('sha256').update(bytes).digest('hex');
export const digest = value => sha256(Buffer.from(canonical(value), 'utf8'));
const utf8 = bytes => new TextDecoder('utf-8', {fatal:true,ignoreBOM:true}).decode(bytes);
const filename = value => typeof value === 'string' && /^[a-zA-Z0-9][a-zA-Z0-9._-]{0,199}$/.test(value);
const hashPattern = /^[a-f0-9]{64}$/;
const crcTable = Uint32Array.from({length:256}, (_,i) => {
  for(let k=0;k<8;k++) i=i&1?0xedb88320^(i>>>1):i>>>1;
  return i>>>0;
});
export function crc32(bytes) {
  let crc=0xffffffff;
  for(const byte of bytes) crc=crcTable[(crc^byte)&255]^(crc>>>8);
  return ((crc^0xffffffff)>>>0).toString(16).padStart(8,'0');
}
function official(url, year = null) {
  let parsed;
  try { parsed=new URL(url); } catch { need(false, 'The original BLS URL is invalid.'); }
  need(parsed.protocol==='https:' && parsed.hostname==='data.bls.gov' && !parsed.username && !parsed.password &&
    !parsed.search && !parsed.hash, 'Use the original public BLS data host.');
  if(year!==null) need(parsed.pathname==='/cew/data/files/'+year+'/csv/'+year+'_qtrly_by_area.zip',
    'Use the original year’s quarterly NAICS area archive.');
  else need(/^\/cew\/data\/(?:api|files)\//.test(parsed.pathname), 'Use an original public QCEW data URL.');
  return parsed.href;
}
function unpack(file, maximum) {
  need(plain(file) && file.encoding==='gzip+base64' && typeof file.body==='string' &&
    /^[A-Za-z0-9+/]*={0,2}$/.test(file.body) && file.body.length%4===0 &&
    Number.isSafeInteger(file.bytes) && file.bytes>0 && file.bytes<=maximum &&
    hashPattern.test(file.sha256), 'A retained original compressed file is invalid.');
  const packed=Buffer.from(file.body,'base64');
  need(packed.toString('base64')===file.body && sha256(packed)===file.gzipSha256,
    'A retained original compressed file changed.');
  let bytes;
  try { bytes=gunzipSync(packed,{maxOutputLength:maximum}); }
  catch { need(false,'A retained original file could not be fully decompressed.'); }
  need(bytes.length===file.bytes && sha256(bytes)===file.sha256, 'The retained complete original file length or hash changed.');
  return bytes;
}
function captureIdentity(capture) {
  return {schema:capture.schema,originalManifest:capture.originalManifest,files:capture.files};
}
function inspectOriginalCapture(capture,{select=null}={}) {
  need(capture?.schema===QCEW_CAPTURE && hashPattern.test(capture.captureSha256) &&
    Array.isArray(capture.files) && capture.files.length>0 && capture.files.length<=5000,
    'The retained QCEW source edition is invalid.');
  need(digest(captureIdentity(capture))===capture.captureSha256, 'The complete QCEW source edition changed.');
  const originalManifest=unpack(capture.originalManifest,48*1024*1024);
  let intake;
  try { intake=JSON.parse(utf8(originalManifest)); } catch { need(false,'The original QCEW source manifest is invalid.'); }
  need(intake.schema===INTAKE && intake.complete===true && Array.isArray(intake.sources) &&
    intake.sources.length>0 && Array.isArray(intake.archives) && Array.isArray(intake.request?.years) &&
    Array.isArray(intake.request?.areas) && typeof intake.startedAt==='string' && typeof intake.completedAt==='string',
    'Finish the original retained source intake before importing its edition.');
  const files=new Map();
  let encodedBytes=0;
  for(const file of capture.files) {
    need(filename(file.name) && !files.has(file.name), 'The original file inventory has an unsafe or repeated name.');
    files.set(file.name,file); encodedBytes+=file.body?.length??0;
  }
  need(encodedBytes<=MAX_QCEW_CAPTURE_BYTES, 'The complete original source edition exceeds portable capture capacity.');
  const archives=new Map();
  for(const archive of intake.archives) {
    need(Number.isInteger(archive.year) && archive.complete===true && !archives.has(archive.year) &&
      Array.isArray(archive.inventory) && archive.inventory.length<=20000 &&
      Array.isArray(archive.requests) && archive.requests.length>0, 'An original annual archive receipt is incomplete.');
    official(archive.sourceUrl,archive.year);
    for(const request of archive.requests) {
      need(request.requestedUrl===archive.sourceUrl && [200,206].includes(request.status) &&
        typeof request.receivedAt==='string' && hashPattern.test(request.sha256), 'An original archive response receipt is incomplete.');
      official(request.finalUrl,archive.year);
    }
    archives.set(archive.year,archive);
  }
  need(intake.request.years.length===archives.size && intake.request.years.every(year=>archives.has(year)),
    'The source edition does not contain every requested original archive year.');
  const coverage=new Map(), rows=new Map(), classifications=new Set(), sourceFiles=[], used=new Set();
  let originalRows=0;
  for(const entry of intake.sources) {
    const file=files.get(entry.file), archive=archives.get(entry.year);
    need(file && archive && !used.has(entry.file) && entry.sourceUrl===archive.sourceUrl &&
      entry.sha256===file.sha256 && entry.bytes===file.bytes && entry.gzipSha256===file.gzipSha256 &&
      intake.request.areas.includes(entry.area), 'An original area source is missing or changed.');
    const member=archive.inventory.find(item=>item.name===entry.member);
    need(member && member.bytes===entry.bytes && member.crc32===entry.memberCrc32 &&
      member.compressedBytes===entry.memberCompressedBytes, 'An original ZIP member receipt differs from its archive inventory.');
    const bytes=unpack(file,MAX_CSV_BYTES);
    need(crc32(bytes)===entry.memberCrc32, 'The original area member CRC differs.');
    const inspected=inspectCsv(utf8(bytes), {expectedArea:entry.area,expectedYear:entry.year,select:row=>{
      classifications.add(qcewIndustryPeriodKey(row));
      return select===null?false:select(row);
    }});
    need(inspected.rowCount===entry.rowCount && canonical(inspected.columns)===canonical(entry.columns) &&
      canonical(inspected.periods)===canonical(entry.periods), 'The complete original CSV header, row count or periods changed.');
    for(const when of inspected.periods) {
      const key=entry.area+'|'+when;
      need(!coverage.has(key), 'The original source edition contains overlapping area/period files.');
      coverage.set(key,entry.file);
    }
    for(const row of inspected.rows) {
      const key=rowKey(row);
      need(!rows.has(key), 'The retained source edition repeats an original classification/period row.');
      rows.set(key,{row,file:entry.file,sha256:entry.sha256});
    }
    originalRows+=inspected.rowCount;
    used.add(entry.file); sourceFiles.push(clone(entry));
  }
  for(const year of intake.request.years) for(const area of intake.request.areas)
    need(intake.sources.some(item=>item.year===year&&item.area===area), 'The complete source edition omitted a requested year/area member.');
  if(intake.seed) {
    const file=files.get(intake.seed.file);
    need(file && file.sha256===intake.seed.sha256 && file.bytes===intake.seed.bytes && file.gzipSha256===intake.seed.gzipSha256 &&
      intake.seed.receipt?.requestedUrl==='https://data.bls.gov/cew/data/api/2025/4/area/06075.csv',
      'The original diagnostic slice changed.');
    const bytes=unpack(file,MAX_CSV_BYTES);
    const inspected=inspectCsv(utf8(bytes),{expectedArea:'06075',expectedYear:2025,select:()=>false});
    need(inspected.rowCount===intake.seed.rowCount,'The complete diagnostic slice row count changed.');
    used.add(intake.seed.file);
  }
  need(used.size===files.size,'The source edition contains unreferenced original files.');
  return {captureSha256:capture.captureSha256,intake,sourceFiles,originalRows,coverage,rows,classifications,
    sourceSummary:{kind:'Current published BLS QCEW quarterly NAICS area archives',retrievedFrom:intake.startedAt,
      retrievedThrough:intake.completedAt,years:[...intake.request.years],areas:[...intake.request.areas],
      originalFiles:sourceFiles.length,originalRows,originalBytes:sourceFiles.reduce((sum,item)=>sum+item.bytes,0)}};
}

// A published industry's classification is comparable across the original
// national, state and county aggregation prefixes. Ownership totals share
// the same total-industry classification, including BLS special rows94–96.
export function qcewIndustryPeriodKey(row) {
  const base=row.area_fips==='US000'?10:row.area_fips.endsWith('000')?50:70;
  const level=row.industry_code==='10'?'total':String(Number(row.agglvl_code)-base);
  return [row.industry_code,level,row.year+'-Q'+row.qtr].join('|');
}

// A context owns one immutable source edition and only explicitly selected rows.
// It is scoped to a caller's operation; no source data is kept in a global cache.
const captureContexts=new WeakMap();
function freezeJson(value,seen=new WeakSet()) {
  if(value===null||['string','boolean'].includes(typeof value)) return value;
  if(typeof value==='number') {
    need(Number.isFinite(value),'A source context contains only finite JSON numbers.');
    return value;
  }
  need(typeof value==='object'&&(Array.isArray(value)||Object.getPrototypeOf(value)===Object.prototype||Object.getPrototypeOf(value)===null),
    'A source context contains only original JSON records.');
  if(seen.has(value)) return value;
  seen.add(value);
  for(const key of Object.keys(value)) {
    const descriptor=Object.getOwnPropertyDescriptor(value,key);
    need(descriptor&&Object.hasOwn(descriptor,'value'),'A source context cannot retain a mutable accessor.');
    freezeJson(descriptor.value,seen);
  }
  return Object.freeze(value);
}
function normalizeSelection(value) {
  need(plain(value)&&Array.isArray(value.keys)&&value.keys.length>0&&Array.isArray(value.periods)&&value.periods.length>0,
    'Select explicit original classification keys and periods for a source context.');
  const sizeCode=value.sizeCode??'0';
  need(typeof sizeCode==='string'&&/^[0-9]$/.test(sizeCode),'Select an original QCEW size code.');
  const keys=new Map();
  for(const item of value.keys) {
    need(plain(item)&&typeof item.area==='string'&&/^(US000|[0-9]{5})$/.test(item.area)&&
      typeof item.ownership==='string'&&/^[0-9]$/.test(item.ownership)&&
      typeof item.industry==='string'&&/^[0-9]{2,6}(?:-[0-9]{2})?$/.test(item.industry)&&
      typeof item.aggregation==='string'&&/^[0-9]{2}$/.test(item.aggregation),
      'Select complete original area, ownership, industry and aggregation keys.');
    const key=[item.area,item.ownership,item.industry,item.aggregation,sizeCode].join('|');
    keys.set(key,{area:item.area,ownership:item.ownership,industry:item.industry,aggregation:item.aggregation});
  }
  const periods=[...new Set(value.periods)];
  need(periods.every(item=>typeof item==='string'&&/^[0-9]{4}-Q[1-4]$/.test(item)&&
    Number(item.slice(0,4))>=1990&&Number(item.slice(0,4))<=2100),'Select original quarterly source periods.');
  return {keys:[...keys.entries()].sort(([a],[b])=>a.localeCompare(b)),periods:periods.sort(),sizeCode};
}
function coordinates(selections) {
  const result=new Map();
  for(const selection of selections) for(const [key] of selection.keys) {
    let periods=result.get(key);
    if(!periods) result.set(key,periods=new Set());
    for(const when of selection.periods) periods.add(when);
  }
  return result;
}
const classificationKey=row=>[row.area_fips,row.own_code,row.industry_code,row.agglvl_code,row.size_code].join('|');
const includesRow=(selected,row)=>selected.get(classificationKey(row))?.has(row.year+'-Q'+row.qtr)===true;
function retainModel(model) {
  freezeJson(model.intake);
  freezeJson(model.sourceFiles);
  freezeJson(model.sourceSummary);
  for(const entry of model.rows.values()) freezeJson(entry);
  return model;
}
function contextState(context) {
  const state=context&&captureContexts.get(context);
  need(state,'Use a verified QCEW source context created for this operation.','QCEW_CONTEXT_INVALID');
  return state;
}
function admitCapture(state,capture) {
  if(state.admitted.has(capture)) return;
  freezeJson(capture);
  need(capture?.schema===QCEW_CAPTURE&&capture.captureSha256===state.captureSha256&&
    digest(captureIdentity(capture))===state.captureSha256,
    'The complete source edition differs from this operation’s verified context.','QCEW_CONTEXT_MISMATCH',409);
  state.admitted.add(capture);
  state.admittedCaptures++;
}
function modelView(state,selected) {
  const rows=new Map();
  if(selected) for(const [key,entry] of state.model.rows)
    if(includesRow(selected,entry.row)) rows.set(key,entry);
  // Callers can change their own maps without changing another report's source.
  return {...state.model,coverage:new Map(state.model.coverage),classifications:new Set(state.model.classifications),rows};
}
export function createQcewCaptureContext(capture,{selections=[]}={}) {
  need(Array.isArray(selections),'Supply the requested report selections for this source operation.');
  const selected=coordinates(selections.map(normalizeSelection));
  freezeJson(capture);
  const model=retainModel(inspectOriginalCapture(capture,{select:row=>includesRow(selected,row)}));
  const context=Object.freeze({captureSha256:capture.captureSha256});
  captureContexts.set(context,{captureSha256:capture.captureSha256,model,selected,admitted:new WeakSet([capture]),
    admittedCaptures:1,fullCsvPasses:1});
  return context;
}
export function qcewCaptureContextStats(context) {
  const state=contextState(context);
  return Object.freeze({captureSha256:state.captureSha256,fullCsvPasses:state.fullCsvPasses,
    originalFiles:state.model.sourceFiles.length,originalRows:state.model.originalRows,
    retainedRows:state.model.rows.size,selectedCoordinates:[...state.selected.values()].reduce((sum,periods)=>sum+periods.size,0),
    admittedCaptures:state.admittedCaptures});
}
export function inspectQcewCapture(capture,{select=null,selection=null,context=null}={}) {
  need(select===null||typeof select==='function','Select original rows with a function or explicit coordinates.');
  need(select===null||selection===null,'Choose one original row selection.');
  const selected=selection===null?null:coordinates([normalizeSelection(selection)]);
  if(context===null) return inspectOriginalCapture(capture,{select:selected?row=>includesRow(selected,row):select});
  need(select===null,'Use explicit original row coordinates with a verified source context.');
  const state=contextState(context);
  admitCapture(state,capture);
  if(selected) {
    const missing=new Map();
    for(const [key,periods] of selected) for(const when of periods) if(!state.selected.get(key)?.has(when)) {
      let requested=missing.get(key);
      if(!requested) missing.set(key,requested=new Set());
      requested.add(when);
    }
    if(missing.size) {
      const extra=retainModel(inspectOriginalCapture(capture,{select:row=>includesRow(missing,row)}));
      for(const [key,entry] of extra.rows) state.model.rows.set(key,entry);
      for(const [key,periods] of missing) {
        let retained=state.selected.get(key);
        if(!retained) state.selected.set(key,retained=new Set());
        for(const when of periods) retained.add(when);
      }
      state.fullCsvPasses++;
    }
  }
  return modelView(state,selected);
}

function pack(name,bytes,packed=null) {
  packed=packed??gzipSync(bytes,{mtime:0});
  return {...(name?{name}:{}),encoding:'gzip+base64',bytes:bytes.length,sha256:sha256(bytes),gzipSha256:sha256(packed),body:packed.toString('base64')};
}
async function packQcewIntake(directory) {
  directory=resolve(directory);
  const manifestPath=join(directory,'source-manifest.json'), manifestStat=await lstat(manifestPath);
  need(manifestStat.isFile() && !manifestStat.isSymbolicLink() && manifestStat.size<=48*1024*1024,
    'Read the complete original intake manifest.');
  const manifestBytes=await readFile(manifestPath), intake=JSON.parse(utf8(manifestBytes));
  need(intake.schema===INTAKE && intake.complete===true && Array.isArray(intake.sources), 'Complete the original source intake before importing it.');
  const names=[...new Set([...intake.sources.map(item=>item.file),...(intake.seed?[intake.seed.file]:[])])].sort(), files=[];
  let bytesTotal=0;
  for(const name of names) {
    need(filename(name),'The original input has an unsafe source filename.');
    const path=join(directory,name), stat=await lstat(path);
    need(stat.isFile()&&!stat.isSymbolicLink()&&stat.size<=MAX_CSV_BYTES, 'Read the complete retained original area member.');
    const packed=await readFile(path);
    bytesTotal+=packed.length;
    need(bytesTotal*4/3<=MAX_QCEW_CAPTURE_BYTES,'The complete original intake exceeds portable capture capacity.');
    let raw;
    try { raw=gunzipSync(packed,{maxOutputLength:MAX_CSV_BYTES}); }
    catch { need(false,'The original area member is not a complete gzip file.'); }
    files.push(pack(name,raw,packed));
  }
  const capture={schema:QCEW_CAPTURE,originalManifest:pack(null,manifestBytes),files};
  capture.captureSha256=digest(captureIdentity(capture));
  return capture;
}
export async function sealQcewIntake(directory) {
  const capture=await packQcewIntake(directory);
  inspectQcewCapture(capture);
  return capture;
}
export async function sealQcewIntakeWithContext(directory,{selections=[]}={}) {
  const capture=await packQcewIntake(directory);
  const sourceContext=createQcewCaptureContext(capture,{selections});
  return {capture,sourceContext};
}
export async function storeQcewCapture(directory,capture,{context=null}={}) {
  const model=inspectQcewCapture(capture,{context});
  const target=await privateDirectory(join(resolve(directory),'qcew','captures',capture.captureSha256));
  const serialized=Buffer.from(JSON.stringify(capture,null,2)+'\n');
  need(serialized.length<=MAX_QCEW_CAPTURE_BYTES,'The complete retained capture exceeds its file capacity.');
  return withPrivateLock(target,'capture.lock',async()=>{
    let retained=null;
    try { retained=await readPrivateJson(join(target,'capture.json'),MAX_QCEW_CAPTURE_BYTES); }
    catch(error) { if(error.code!=='ENOENT') throw error; }
    if(retained) need(canonical(retained)===canonical(capture),'This retained source directory contains another complete edition.','QCEW_CAPTURE_CONFLICT',409);
    else await atomicJson(target,'capture.json',capture,{exclusive:true});
    return {directory:target,captureSha256:capture.captureSha256,...model.sourceSummary};
  });
}
async function readOriginalQcewCapture(directory,captureSha256) {
  need(hashPattern.test(captureSha256),'Choose a retained QCEW source edition.');
  const capture=await readPrivateJson(join(resolve(directory),'qcew','captures',captureSha256,'capture.json'),MAX_QCEW_CAPTURE_BYTES);
  need(capture.captureSha256===captureSha256,'The source directory belongs to another QCEW edition.');
  return capture;
}
export async function readQcewCapture(directory,captureSha256,options={}) {
  const capture=await readOriginalQcewCapture(directory,captureSha256);
  const model=inspectQcewCapture(capture,options);
  return {capture,model};
}
export async function readQcewCaptureWithContext(directory,captureSha256,{selections=[]}={}) {
  const capture=await readOriginalQcewCapture(directory,captureSha256);
  const sourceContext=createQcewCaptureContext(capture,{selections});
  return {capture,sourceContext,model:inspectQcewCapture(capture,{context:sourceContext})};
}
export async function readQcewOriginalMember(directory,captureSha256,name,{context=null}={}) {
  need(filename(name),'Choose a retained original source member.');
  const {capture}=await readQcewCapture(directory,captureSha256,context?{context}:{select:()=>false});
  const file=capture.files.find(item=>item.name===name);
  need(file,'The original member is not part of this source edition.','QCEW_MEMBER_NOT_FOUND',404);
  return {name:name.replace(/\.gz$/,''),bytes:unpack(file,MAX_CSV_BYTES),sha256:file.sha256};
}
