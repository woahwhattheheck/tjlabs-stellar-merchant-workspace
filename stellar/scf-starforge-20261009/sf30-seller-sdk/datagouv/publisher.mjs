// MIT. data.gouv's retained CSV joins the maintained native publisher and version writer.
import {dirname,join,resolve} from 'node:path';
import {setImmediate} from 'node:timers/promises';
import {openSourceDatasetPublisher} from '../postgres/publisher/model.mjs';
import {csvLine} from '../postgres/publisher/plan.mjs';
import {datasetExtractionOptions} from '../postgres/publisher/stream.mjs';
import {bytes,digest,identity,createFile,privateDirectory,syncDirectory} from '../postgres/publisher/files.mjs';
import {loadCsvDataset} from '../dataset-handler.mjs';
import {readCapture,retainCapture,regular,projectionFor,need} from './capture.mjs';
async function declaration(file){
  const original=await regular(resolve(file),1024*1024),config=JSON.parse(original);
  need(config.schema==='stellar-forge.datagouv-source.v1'&&config.connection?.kind==='retained-public-csv'&&/^[a-f0-9]{64}$/.test(config.connection.sha256??''),'A reviewed data.gouv source declaration is required');
  const capture=await readCapture(resolve(dirname(file),config.connection.file),config.connection.sha256);
  need(capture.manifest.dataset_id===config.datasetId&&capture.manifest.resource_id===config.resourceId,'The native source identifiers changed');
  const projection=projectionFor(capture.manifest.header,config.projection);
  const query={sql:'Retained public CSV projection',columns:Object.keys(projection),projection,parameters:{},parameterOrder:[]};
  return {original,hash:digest(original),config,capture,query};
}
const types=query=>Object.entries(query.projection).map(([name,spec])=>({name,type:'string',nullable:false,sourceField:spec.field,encoding:'native'}));
export async function inspectDataGouvSource(file){
  const s=await declaration(file);return {hash:s.hash,bytes:s.original.length,sourceName:'data gouv CSV',connectionKind:'retained-public-csv',
    observation:{...s.capture.manifest,manifestSha256:s.capture.manifestHash},queries:{dataset:{...s.query,columnTypes:types(s.query)}}};
}
export function checkTypes(columns,provided){
  need(Array.isArray(provided),'Original source column types are required');
  for(const [name,spec] of Object.entries(columns))need(spec.type==='string'&&spec.nullable===false&&provided.some(v=>v.name===name&&v.type==='string'),'Keep the reviewed CSV string contract');
}
export function encodeRow(row,dataset){
  return csvLine(Object.keys(dataset.columns).map(name=>{const value=row[name];need(typeof value==='string'&&value.length<=dataset.maxCellChars,'Original CSV value exceeds the reviewed contract');return value;}));
}
export async function openDataGouvSource(file){
  const selected=await declaration(file),query=selected.query;let closed=false,busy=false;
  return {source:{
    inspect:()=>({columnTypes:{dataset:types(query)}}),
    async exportDataset(name,input={},supplied={}){
      need(!closed&&!busy,'The retained source is closed or in use');need(name==='dataset'&&Object.keys(input).length===0,'Select the reviewed complete dataset query');
      const {onRow,signal,...spec}=supplied,options=datasetExtractionOptions(query,spec);need(typeof onRow==='function','A row receiver is required');busy=true;
      const began=Date.now();
      try{
        need(selected.capture.rows.length<=options.maxRows,'The complete source exceeds the reviewed row limit');
        const projected=selected.capture.rows.map(row=>Object.fromEntries(Object.entries(query.projection).map(([name,spec])=>[name,row[spec.field]])));
        projected.sort((a,b)=>{for(const item of options.order){const n=a[item.column]<b[item.column]?-1:a[item.column]>b[item.column]?1:0;if(n)return item.direction==='asc'?n:-n;}return 0;});
        let sourceTextBytes=0,rowCount=0;
        for(const row of projected){
          need(!closed&&!signal?.aborted&&Date.now()-began<options.timeoutMs,'Retained source extraction interrupted');
          const rowBytes=Buffer.byteLength(JSON.stringify(row));need(rowBytes<=options.maxRowBytes,'A complete row exceeds the reviewed byte limit');
          sourceTextBytes+=rowBytes;need(sourceTextBytes<=options.maxBytes,'Complete source exceeds the reviewed byte limit');
          if(rowCount%256===0)await setImmediate();
          await onRow(row,types(query),{rowCount:rowCount+1,sourceTextBytes});rowCount++;
        }
        return {schema:'stellar-forge.datagouv-dataset-extraction.v1',query:name,rowCount,sourceTextBytes,columns:query.columns,columnTypes:types(query),order:options.order,
          valueEncoding:'unchanged-csv-strings',nullEncoding:'no-implied-null-token',
          observation:{provider:'datagouv',protocol:'udata-api-1',kind:'RETAINED_COMPLETE_CSV',readOnly:true,manifestSha256:selected.capture.manifestHash,
            datasetId:selected.config.datasetId,resourceId:selected.config.resourceId,rowCount:selected.capture.manifest.row_count,
            originalCsvSha256:selected.capture.manifest.files.find(v=>v.path==='original/resource.csv').sha256,projection:query.projection}};
      }finally{busy=false;}
    },
    close(){closed=true;}
  }};
}
export async function capturePlan(file,directory,input){
  need(input&&typeof input==='object'&&Object.keys(input).every(k=>['title','query','input','dataset','extraction','sourceHash'].includes(k)),'Invalid publication plan fields');
  const selected=await declaration(file),query=selected.query;
  need(input.sourceHash===selected.hash&&input.query==='dataset'&&Object.keys(input.input??{}).length===0,'Review the current complete source before saving a plan');
  need(typeof input.title==='string'&&input.title.trim()&&input.title.length<=128,'A publication title of up to 128 characters is required');
  const extraction=datasetExtractionOptions(query,input.extraction),columns=input.dataset?.columns;
  need(columns&&Object.keys(columns).length===query.columns.length&&Object.keys(columns).every(n=>query.columns.includes(n)),'Use every reviewed projected field');
  checkTypes(columns,types(query));
  const dataset={schema:'stellar-forge.csv-dataset.v1',file:'data.csv',name:input.dataset.name,columns,filters:input.dataset.filters??[],
    ranges:input.dataset.ranges??[],sorts:input.dataset.sorts??[],maxBytes:extraction.maxBytes,maxRows:extraction.maxRows,maxCellChars:input.dataset.maxCellChars??65536,
    defaultLimit:input.dataset.defaultLimit??50,maxLimit:input.dataset.maxLimit??250,maxPageBytes:input.dataset.maxPageBytes??921600};
  await createFile(join(directory,'schema.csv'),csvLine(Object.keys(columns)));await loadCsvDataset({...dataset,file:join(directory,'schema.csv')});
  await retainCapture(selected.capture,join(directory,'capture'));
  const runtime={...selected.config,connection:{...selected.config.connection,file:'capture/capture.json'}},runtimeBytes=bytes(runtime);
  await createFile(join(directory,'original-source.json'),selected.original);await createFile(join(directory,'source.json'),runtimeBytes);
  const plan={schema:'stellar-forge.datagouv-dataset-plan.v1',title:input.title.trim(),query:'dataset',input:{},dataset,extraction,
    sourceHash:selected.hash,sourceBytes:selected.original.length,runtimeSourceHash:digest(runtimeBytes),queryHash:identity(query),
    retainedCapture:{manifestSha256:selected.capture.manifestHash,provider:'datagouv',datasetId:selected.config.datasetId,resourceId:selected.config.resourceId,rowCount:selected.capture.manifest.row_count},
    sourceQuery:query};
  plan.digest=identity(plan);await createFile(join(directory,'plan.json'),bytes(plan));await syncDirectory(directory);return plan;
}
export const dataGouvDriver=Object.freeze({
  sourceName:'data gouv CSV',workspaceSchema:'stellar-forge.datagouv-publisher-workspace.v1',statusSchema:'stellar-forge.datagouv-publisher-status.v1',
  candidateSchema:'stellar-forge.datagouv-dataset-candidate.v1',capturePlan,inspectSource:inspectDataGouvSource,openSource:openDataGouvSource,checkColumnTypes:checkTypes,encodeRow,
  validateExtraction:x=>x?.schema==='stellar-forge.datagouv-dataset-extraction.v1'&&x.valueEncoding==='unchanged-csv-strings'&&x.observation?.provider==='datagouv'&&x.observation.protocol==='udata-api-1'&&x.observation.readOnly===true&&
    x.observation.kind==='RETAINED_COMPLETE_CSV'&&/^[a-f0-9]{64}$/.test(x.observation.manifestSha256??'')&&Number.isSafeInteger(x.rowCount)&&x.rowCount===x.observation.rowCount
});
export const openDataGouvPublisher=options=>openSourceDatasetPublisher(options,dataGouvDriver);
