// MIT. Immutable complete original DDP package captures and source inspection.
import { canonical,clone,need,plain } from '../model.mjs';
import { canonicalJSONInfo } from '../canonical-stream.mjs';
import { ddpDigest,ddpHash,fredDdpFileBytes,fredDdpFileText,fredDdpFileDescriptor,validateFredDdpSourceFile,
  MAX_DDP_FILE_BYTES,MAX_DDP_CAPTURE_BYTES,normalizeFredDdpRelease } from './files.mjs';
import { readFredDdpZip } from './zip.mjs';
import { normalizeFredDdpCsvLayout,readFredDdpCsvPackage } from './package-csv.mjs';
import { readFredDdpXmlPackage,fredDdpXmlSeriesExtent,retainFredDdpXmlSeriesSource,pageFredDdpXmlSeriesObservations } from './package-xml.mjs';
const SCHEMA='stellar-forge.fred-ddp-package.v1';
const same=(a,b)=>ddpDigest(a)===ddpDigest(b);
// Keep one complete immutable model across JSON/disk receiving. The full
// source core and digest are validated before every lookup. Clear the prior
// model before parsing a different capture so retention stays bounded.
let packageModel=null;
function immutable(value){
  if(value&&typeof value==='object'&&!Object.isFrozen(value)){Object.freeze(value);for(const descriptor of Object.values(Object.getOwnPropertyDescriptors(value)))if(Object.hasOwn(descriptor,'value'))immutable(descriptor.value);}
  return value;
}
function retainedModel(core,captureSha256){
  if(packageModel?.captureSha256===captureSha256)return packageModel.parsed;
  packageModel=null;
  const parsed=immutable(parsePackage(core,captureSha256));packageModel={captureSha256,parsed};return parsed;
}
export const FRED_DDP_PACKAGE_FORMATS=Object.freeze(['board-sdmx-zip','board-sdmx-xml','ddp-csv']);
export { normalizeFredDdpCsvLayout,normalizeFredDdpRelease };
function sourceCore(input){
  need(plain(input),'A complete original DDP package is required.');
  const file=validateFredDdpSourceFile(input.file),release=normalizeFredDdpRelease(input.release),format=input.format??'board-sdmx-zip';
  need(FRED_DDP_PACKAGE_FORMATS.includes(format),'Choose the original SDMX ZIP, SDMX XML or CSV package format.');
  need(Array.isArray(input.supplementalFiles??[])&&(input.supplementalFiles??[]).length<=1024,'Invalid complete supplemental source inventory.');
  const supplementalFiles=(input.supplementalFiles??[]).map(validateFredDdpSourceFile);
  need(new Set([file.name,...supplementalFiles.map(item=>item.name)]).size===supplementalFiles.length+1,'Original source filenames must be unique.');
  need(file.bytes+supplementalFiles.reduce((total,item)=>total+item.bytes,0)<=MAX_DDP_FILE_BYTES,'The complete original package exceeds its source capacity.');
  const csvLayout=normalizeFredDdpCsvLayout(input.csvLayout??null);
  need(format==='ddp-csv'||csvLayout===null,'CSV cell layout applies only to an original CSV source.');
  return {schema:SCHEMA,file,release,format,supplementalFiles,csvLayout};
}
function sourceMembers(core){
  let members=[];
  if(core.format==='board-sdmx-zip')members=readFredDdpZip(fredDdpFileBytes(core.file)).map(file=>({
    name:file.filename,mediaType:/\.xsd$/i.test(file.filename)?'application/xml':/\.xml$/i.test(file.filename)?'application/xml':file.mediaType,
    bytes:file.bytes.length,sha256:file.sha256,raw:file.bytes,archive:core.file.name}));
  else members=[{name:core.file.name,mediaType:core.file.mediaType,bytes:core.file.bytes,sha256:core.file.sha256,
    raw:fredDdpFileBytes(core.file),archive:null,forceXml:core.format==='board-sdmx-xml'}];
  for(const file of core.supplementalFiles)members.push({name:file.name,mediaType:file.mediaType,bytes:file.bytes,sha256:file.sha256,
    raw:fredDdpFileBytes(file),archive:null});
  need(new Set(members.map(file=>file.name)).size===members.length,'The complete source repeats an archive or supplemental member name.');
  return members.map(file=>{
    let text=null;
    if(core.format==='ddp-csv'&&file.name===core.file.name||file.forceXml||/\.(?:xml|xsd)$/i.test(file.name)){
      try{text=new TextDecoder('utf-8',{fatal:true,ignoreBOM:true}).decode(file.raw);}
      catch{need(false,'The original source requires its explicit supported UTF-8 encoding.');}
    }
    const {raw,...descriptor}=file;
    return {...descriptor,text};
  });
}
function parsePackage(core,captureSha256){
  const files=sourceMembers(core),primary=files.find(file=>file.name===core.file.name);
  const parsed=core.format==='ddp-csv'
    ?readFredDdpCsvPackage(primary.text,{release:core.release,filename:primary.name,csvLayout:core.csvLayout})
    :readFredDdpXmlPackage(files,{release:core.release});
  let observationCount=0,firstPeriod=null,lastPeriod=null;
  const series=parsed.series.map((item,index)=>{
    const extent=fredDdpXmlSeriesExtent(item);
    if(extent){
      observationCount+=extent.count;
      if(extent.minPeriod!==null&&(firstPeriod===null||extent.minPeriod<firstPeriod))firstPeriod=extent.minPeriod;
      if(extent.maxPeriod!==null&&(lastPeriod===null||extent.maxPeriod>lastPeriod))lastPeriod=extent.maxPeriod;
    }else{
      const observations=item.observations;observationCount+=observations.length;
      for(const row of observations){if(firstPeriod===null||row.period<firstPeriod)firstPeriod=row.period;if(lastPeriod===null||row.period>lastPeriod)lastPeriod=row.period;}
    }
    const descriptor={id:'fred-ddp-series-'+ddpDigest({captureSha256,index,release:item.release,boardSeriesId:item.boardSeriesId,
      datasetId:item.datasetId,location:item.location}),index};
    Object.defineProperties(descriptor,Object.getOwnPropertyDescriptors(item));
    return retainFredDdpXmlSeriesSource(item,descriptor);
  });
  const summary={seriesCount:series.length,observationCount,datasetCount:new Set(series.map(item=>item.datasetId)).size,firstPeriod,lastPeriod};
  return {header:parsed.header,series,summary,files:files.map(({text,forceXml,...file})=>file)};
}
export function sealFredDdpPackage(input){
  const core=sourceCore(input),captureSha256=ddpDigest(core),capture={...core,id:'fred-ddp-package-'+captureSha256,captureSha256};
  need(canonicalJSONInfo(capture).bytes<=MAX_DDP_CAPTURE_BYTES,'The complete original package capture exceeds its JSON capacity.');
  retainedModel(core,captureSha256);
  return capture;
}
export function inspectFredDdpPackage(capture){
  need(plain(capture)&&capture.schema===SCHEMA,'A complete original DDP package capture is required.');
  need(canonicalJSONInfo(capture).bytes<=MAX_DDP_CAPTURE_BYTES,'The complete original package capture exceeds its JSON capacity.');
  const core=sourceCore(capture),captureSha256=ddpDigest(core),expected={...core,id:'fred-ddp-package-'+captureSha256,captureSha256};
  need(same(capture,expected),'The complete original DDP package identity changed.');
  const parsed=retainedModel(core,captureSha256);
  return {schema:'stellar-forge.fred-ddp-package-model.v1',id:capture.id,captureSha256,
    release:core.release,format:core.format,source:fredDdpFileDescriptor(core.file),...parsed};
}
export function validateFredDdpPackage(capture){inspectFredDdpPackage(capture);return clone(capture);}
export function pageFredDdpPackage(capture,{section='series',seriesId=null,frequency=null,query='',offset=0,limit=100}={}){
  need(['series','observations'].includes(section)&&(seriesId===null||typeof seriesId==='string'),'Choose original series or observation rows.');
  need(Number.isSafeInteger(offset)&&offset>=0&&Number.isSafeInteger(limit)&&limit>=1&&limit<=1000,'Choose a valid original package page.');
  const model=inspectFredDdpPackage(capture),{series,...metadata}=model;
  if(seriesId!==null)need(series.some(item=>item.id===seriesId),'The selected original package series does not exist.');
  need((frequency===null||typeof frequency==='string')&&typeof query==='string'&&query.length<=500,'Invalid original package frequency or query.');
  const inventory=new Map();
  for(const item of series){const code=item.frequency?.code??null,label=item.frequency?.label??null,key=canonical([code,label]);
    if(!inventory.has(key))inventory.set(key,{code,label,count:0});inventory.get(key).count++;}
  const frequencies=[...inventory.values()].sort((a,b)=>String(a.label??a.code??'').localeCompare(String(b.label??b.code??'')));
  const term=query.toLocaleLowerCase('en-US');
  let selected=seriesId===null?series:series.filter(item=>item.id===seriesId);
  if(section==='series')selected=selected.filter(item=>(frequency===null||(item.frequency?.code??'')===frequency||(item.frequency?.label??'')===frequency)&&
    (!term||[item.boardSeriesId,item.datasetId,item.title].some(value=>String(value).toLocaleLowerCase('en-US').includes(term))));
  const rows=[];
  let total=0;
  if(section==='series'){
    total=selected.length;
    for(const item of selected.slice(offset,offset+limit)){
      const descriptor={};for(const key of Object.keys(item))if(key!=='observations')descriptor[key]=item[key];
      const extent=fredDdpXmlSeriesExtent(item);
      if(extent)rows.push({...descriptor,observationCount:extent.count,firstPeriod:extent.firstPeriod,lastPeriod:extent.lastPeriod});
      else{const observations=item.observations;rows.push({...descriptor,observationCount:observations.length,firstPeriod:observations[0]?.period??null,lastPeriod:observations.at(-1)?.period??null});}
    }
  }else{
    for(const item of selected){
      const extent=fredDdpXmlSeriesExtent(item),observations=extent?null:item.observations,count=extent?.count??observations.length;
      const first=Math.max(0,offset-total),last=Math.min(count,offset+limit-total);
      if(last>first)for(const row of (extent?pageFredDdpXmlSeriesObservations(item,{offset:first,limit:last-first}):observations.slice(first,last)))
        rows.push({seriesId:item.id,release:item.release,boardSeriesId:item.boardSeriesId,datasetId:item.datasetId,...clone(row)});
      total+=count;
    }
  }
  return {...metadata,frequencies,filter:{frequency:section==='series'?frequency:null,query:section==='series'?query:''},section,seriesId,offset,limit,total,nextOffset:offset+limit<total?offset+limit:null,rows};
}
