// MIT. CouchDB uses the original durable dataset publisher and version store.
import { join } from 'node:path';
import { loadCsvDataset } from '../dataset-handler.mjs';
import { csvLine } from '../postgres/publisher/plan.mjs';
import { datasetExtractionOptions } from '../postgres/publisher/stream.mjs';
import { openSourceDatasetPublisher } from '../postgres/publisher/model.mjs';
import { createFile } from '../postgres/publisher/files.mjs';
import { readCouchdbSourceFile, compileQueries } from './declaration.mjs';
import { readCouchdbCapture, cloneCouchdbCapture } from './capture.mjs';
import { inspectCouchdbSource, openCouchdbSourceFile, checkCouchdbColumnTypes, encodeCouchdbRow, reviewedCouchdbDocuments, couchdbObservation } from './source.mjs';
import { only, need, object, bytes, digest, identity, integer, text, HASH, UUID } from './common.mjs';
export async function captureCouchdbPublicationPlan(sourceFile,directory,input){
  only(input,['title','query','input','dataset','extraction','sourceHash','operationId'],'COUCHDB_PUBLICATION_PLAN_INVALID');
  text(input.title,128,'COUCHDB_PUBLICATION_TITLE_REQUIRED');
  if(input.operationId!==undefined)need(UUID.test(input.operationId),'COUCHDB_OPERATION_ID_REQUIRED');
  const selected=await readCouchdbSourceFile(sourceFile);
  need(selected.hash===input.sourceHash,'COUCHDB_SOURCE_REVIEW_CHANGED','Reload the original source before saving this plan.',409);
  const originalQuery=selected.queries[input.query];need(originalQuery,'COUCHDB_QUERY_NOT_FOUND');
  need(object(input.input??{})&&!Object.keys(input.input??{}).length,'COUCHDB_QUERY_INPUT_NOT_SUPPORTED');
  only(input.dataset,['name','columns','filters','ranges','sorts','maxCellChars','defaultLimit','maxLimit','maxPageBytes'],'COUCHDB_DATASET_PLAN_INVALID');
  need(object(input.dataset.columns)&&Object.keys(input.dataset.columns).length&&Object.keys(input.dataset.columns).every(name=>originalQuery.columns.includes(name)),'COUCHDB_DATASET_COLUMN_NOT_IN_QUERY');
  const columns=Object.fromEntries(Object.entries(input.dataset.columns).map(([name,spec])=>{
    const value=typeof spec==='string'?{type:spec,nullable:false}:spec;only(value,['type','nullable'],'COUCHDB_DATASET_COLUMN_INVALID');
    return [name,{type:value.type,nullable:value.nullable??false}];
  }));
  const projection=Object.fromEntries(Object.keys(columns).map(name=>[name,originalQuery.projection[name]]));
  const selectedQuery={...originalQuery,columns:Object.keys(columns),projection};
  checkCouchdbColumnTypes(columns,Object.entries(projection).map(([name,spec])=>({name,type:spec.type,nullable:spec.nullable})));
  const extraction=datasetExtractionOptions(selectedQuery,input.extraction);
  const dataset={schema:'stellar-forge.csv-dataset.v1',file:'data.csv',name:input.dataset.name,columns,
    filters:input.dataset.filters??[],ranges:input.dataset.ranges??[],sorts:input.dataset.sorts??[],
    maxBytes:extraction.maxBytes,maxRows:extraction.maxRows,
    maxCellChars:integer(input.dataset.maxCellChars??65536,1,1048576),
    defaultLimit:input.dataset.defaultLimit??50,maxLimit:input.dataset.maxLimit??250,maxPageBytes:input.dataset.maxPageBytes??921600};
  await createFile(join(directory,'schema.csv'),csvLine(Object.keys(columns)));
  await loadCsvDataset({...dataset,file:join(directory,'schema.csv')});
  const capture=await readCouchdbCapture(selected.captureFile,selected.config.capture.sha256);
  const reviewed=reviewedCouchdbDocuments(capture,selectedQuery);
  await cloneCouchdbCapture(capture,join(directory,'capture'));
  const runtime={...selected.config,capture:{file:'capture/capture.json',sha256:capture.manifestSha256},
    queries:{[input.query]:{...selected.config.queries[input.query],columns:projection}}};
  const runtimeBytes=bytes(runtime);need(runtimeBytes.length<=262144,'COUCHDB_SOURCE_CONFIG_TOO_LARGE');
  const runtimeQuery=compileQueries(runtime.queries)[input.query];
  await createFile(join(directory,'original-source.json'),selected.original);
  await createFile(join(directory,'source.json'),runtimeBytes);
  const value={schema:'stellar-forge.couchdb-dataset-plan.v1',title:input.title.trim(),query:input.query,input:{},...(input.operationId?{operationId:input.operationId}:{}),
    dataset,extraction,sourceHash:selected.hash,sourceBytes:selected.original.length,runtimeSourceHash:digest(runtimeBytes),
    queryHash:identity(originalQuery),runtimeQueryHash:identity(runtimeQuery),
    retainedCapture:{manifestSha256:capture.manifestSha256,sourceId:capture.manifest.sourceId,captureId:capture.manifest.id,completedAt:capture.manifest.completedAt,endSequence:capture.manifest.endSequence},
    sourceQuery:{sql:runtimeQuery.sql,columns:runtimeQuery.columns,parameters:{},projection,documentIds:runtimeQuery.documentIds,review:runtimeQuery.review},
    publicSelection:reviewed.counts,observation:couchdbObservation(capture)};
  value.digest=identity(value);await createFile(join(directory,'plan.json'),bytes(value));return value;
}
export const couchdbPublisherDriver=Object.freeze({
  sourceName:'CouchDB',workspaceSchema:'stellar-forge.couchdb-publisher-workspace.v1',
  statusSchema:'stellar-forge.couchdb-publisher-status.v1',candidateSchema:'stellar-forge.couchdb-dataset-candidate.v1',
  capturePlan:captureCouchdbPublicationPlan,inspectSource:inspectCouchdbSource,openSource:openCouchdbSourceFile,
  checkColumnTypes:checkCouchdbColumnTypes,encodeRow:encodeCouchdbRow,
  validateExtraction:record=>record?.schema==='stellar-forge.couchdb-dataset-extraction.v1'&&record.valueEncoding==='reviewed-json-values'&&record.nullEncoding==='json-null'&&
    record.observation?.schema==='stellar-forge.couchdb-source-observation.v1'&&record.observation.provider==='couchdb'&&record.observation.readOnly===true&&record.observation.kind==='RETAINED_NATIVE_REVISIONS'&&
    HASH.test(record.observation.manifestSha256??'')&&HASH.test(record.observation.sourceId??'')&&UUID.test(record.observation.captureId??'')&&
    Number.isSafeInteger(record.rowCount)&&record.rowCount>=0&&record.rowCount===record.publicSelection?.counts?.activeDocuments&&HASH.test(record.publicSelection?.querySha256??'')
});
export function openCouchdbPublisher(options={}){return openSourceDatasetPublisher(options,couchdbPublisherDriver);}
