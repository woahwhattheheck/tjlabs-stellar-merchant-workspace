// SPDX-License-Identifier: MIT
// Approved forecast tables enter the original SF30 dataset and SF82 publisher.
import {join} from 'node:path';
import {privateDirectory,readOwned} from '../stellar-expert/store.mjs';
import {csvBytes} from '../stellar-expert/domain.mjs';
import {bytes,hash,need,text} from './contract.mjs';
import {COLUMNS,inspectReport} from './reports.mjs';
export {queryNativeDataset,nativePublishers,prepareNativeRelease,inspectNativeRelease,controlNativeRelease,inspectBuyer,receiveBuyer,readBuyerOutput} from '../stellar-expert/dataset.mjs';
export async function prepareForecastDataset(store,{report,review,captures,name,id}){
  inspectReport(report);text(name,'a dataset name',128);
  need(review?.reportId===report.id&&review.disposition==='APPROVED','PIRATE_REVIEW_REQUIRED','Use the exact named approved report.',409);
  need(/^dataset-[a-f0-9]{24}$/.test(id),'PIRATE_DATASET_ID','Use the original request-bound dataset identity.');
  const directory=join(store.root,'datasets',id),pkg=join(directory,'package');
  await privateDirectory(pkg,{create:true});await privateDirectory(join(pkg,'provenance'),{create:true});
  // The native dataset receives exact source strings. Spreadsheet output escaping
  // belongs to reportFiles; it never changes this machine-readable dataset.
  const csv=csvBytes(COLUMNS,report.rows);
  need(report.rows.length<=250000&&csv.length<=256*1024*1024,'PIRATE_DATASET_CAPACITY','The complete native dataset exceeds its maintained capacity.',413);
  const config={schema:'stellar-forge.csv-dataset.v1',file:'dataset.csv',name,columns:Object.fromEntries(COLUMNS.map(k=>[k,'string'])),
    filters:['locationId','field','unitSystem','valueType','captureId'],ranges:['timeUtc'],sorts:['timeUtc','locationId','field'],
    maxBytes:256*1024*1024,maxRows:250000,defaultLimit:50,maxLimit:200};
  await store.immutable(join(pkg,'dataset.csv'),csv);await store.immutable(join(pkg,'dataset.json'),bytes(config));
  const sourceFiles=[],seen=new Set();
  const retain=async(path,raw)=>{need(!seen.has(path),'PIRATE_SOURCE_COLLISION','A provenance member is duplicated.');seen.add(path);await store.immutable(join(pkg,path),raw);sourceFiles.push({path,bytes:raw.length,sha256:hash(raw)});};
  for(const capture of captures){
    const body=await store.object(capture.body.sha256);need(body.length===capture.body.bytes,'PIRATE_SOURCE_CHANGED','The original response bytes differ.',409);
    await retain('provenance/response-'+capture.id+'.json',body);await retain('provenance/capture-'+capture.id+'.json',bytes(capture));
  }
  await retain('provenance/report.json',bytes(report));await retain('provenance/review.json',bytes(review));
  const source={schema:'stellar-forge.pirate-weather-dataset-source.v1',reportId:report.id,contractSha256:report.contractSha256,review,
    window:report.window,units:report.units,coverage:report.coverage,provider:report.sourceAuthority,
    semantics:report.semantics,sourceFiles};
  const sourceBytes=bytes(source);await store.immutable(join(pkg,'source.json'),sourceBytes);
  const {loadDatasetConfig}=await import('../dataset-handler.mjs'),dataset=await loadDatasetConfig(join(pkg,'dataset.json')),description=dataset.describe();
  const receipt={id,editionId:report.id,table:'hourly-forecast-fields',name,snapshot:description.snapshot,sourceSha256:hash(bytes(report)),
    createdAt:report.createdAt,rows:description.rowCount,columns:description.columns,description,csvSha256:hash(csv),
    sourceConfigSha256:hash(bytes(config)),sourceManifestSha256:hash(sourceBytes),versionState:null,
    relativeDirectory:'datasets/'+id,relativePublisherDirectory:'datasets/'+id+'/publisher',mode:'ORIGINAL_SF30_DATASET',
    reportId:report.id,reviewId:review.id};
  await store.immutable(join(directory,'dataset-receipt.json'),bytes(receipt));return receipt;
}
