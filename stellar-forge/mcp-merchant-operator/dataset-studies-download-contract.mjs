// MIT. Complete original query-study files carried by the merchant retained-file protocol.
import {failure,exact} from './host-files.mjs';

export const DATASET_STUDY_DOWNLOAD_MANIFEST='download-manifest.json';
export const DATASET_STUDY_DOWNLOAD_SCHEMA='stellar-forge.dataset-study-download.v1';
export const DATASET_STUDY_DOWNLOAD_FILE_BYTES=256*1024*1024;
export const DATASET_STUDY_DOWNLOAD_TOTAL_BYTES=1024*1024*1024;
export const DATASET_STUDY_DOWNLOAD_MANIFEST_BYTES=8*1024*1024;
export const DATASET_STUDY_UUID=/^[a-f0-9]{8}(?:-[a-f0-9]{4}){3}-[a-f0-9]{12}$/;
const HASH=/^[a-f0-9]{64}$/;
export const DATASET_STUDY_ID=/^[A-Za-z0-9][A-Za-z0-9_-]{7,79}$/;
const STUDY_ID=/^study\.([A-Za-z0-9][A-Za-z0-9_-]{7,79})\.([1-9][0-9]{0,14})$/;
const REQUIRED_RESULT_NAMES=['dataset.csv','dataset.jsonl','study.json','manifest.json'];
const RESULT_NAMES=[...REQUIRED_RESULT_NAMES,'semantics.json'];
const PAGE=/^page-([0-9]{5})\.json$/;
function need(value,message){if(!value)throw failure('DATASET_STUDY_DOWNLOAD_INVALID',message);}
export function validateDatasetStudyExportId(value){
 need(typeof value==='string','Choose one original saved study revision or completed result ID.');
 if(HASH.test(value))return {kind:'result',exportId:value};
 const match=STUDY_ID.exec(value);
 need(match&&Number.isSafeInteger(Number(match[2]))&&Number(match[2])>=1,'Choose study.ID.REVISION or the original completed result SHA-256.');
 return {kind:'study',exportId:value,studyId:match[1],storageRevision:Number(match[2])};
}
export function datasetStudyExportId(studyId,storageRevision){
 need(DATASET_STUDY_ID.test(studyId??'')&&Number.isSafeInteger(storageRevision)&&storageRevision>=1,'Select the exact original study ID and saved revision.');
 return 'study.'+studyId+'.'+storageRevision;
}
export function parseDatasetStudyDownloadManifest(bytes,exportId){
 need(bytes instanceof Uint8Array&&bytes.byteLength>0&&bytes.byteLength<=DATASET_STUDY_DOWNLOAD_MANIFEST_BYTES,'The original download manifest must fit within 8 MiB.');
 let value;try{value=JSON.parse(new TextDecoder('utf-8',{fatal:true}).decode(bytes));}
 catch{need(false,'The original download manifest must be UTF-8 JSON.');}
 exact(value,['schema','mode','workspaceId','exportId','kind','studyId','storageRevision','files'],['schema','mode','workspaceId','exportId','kind','studyId','storageRevision','files']);
 const identity=validateDatasetStudyExportId(exportId);
 need(value.schema===DATASET_STUDY_DOWNLOAD_SCHEMA&&value.mode==='LOCAL_OPERATOR_PREVIEW'&&value.exportId===exportId&&value.kind===identity.kind&&DATASET_STUDY_UUID.test(value.workspaceId??'')&&DATASET_STUDY_ID.test(value.studyId??'')&&Number.isSafeInteger(value.storageRevision)&&value.storageRevision>=1,'The manifest must retain the original workspace, study revision, result identity and local preview mode.');
 if(identity.kind==='study')need(value.studyId===identity.studyId&&value.storageRevision===identity.storageRevision,'The saved study manifest differs from the selected original revision.');
 need(Array.isArray(value.files)&&value.files.length>0&&value.files.length<=4101,'Select one complete bounded original file inventory.');
 const seen=new Set(),pages=[];let total=0;
 for(const item of value.files){
  exact(item,['name','bytes','sha256'],['name','bytes','sha256']);
  need(typeof item.name==='string'&&!seen.has(item.name)&&Number.isSafeInteger(item.bytes)&&item.bytes>=0&&item.bytes<=DATASET_STUDY_DOWNLOAD_FILE_BYTES&&HASH.test(item.sha256??''),'Every original file must have a unique flat name, bounded byte count and SHA-256.');
  seen.add(item.name);total+=item.bytes;
  need(total<=DATASET_STUDY_DOWNLOAD_TOTAL_BYTES,'The complete retained result must fit within 1 GiB.');
  if(value.kind==='study')need(item.name==='study.json'&&item.bytes<=8*1024*1024,'A saved study download carries only its complete original study.json.');
  else{
   const page=PAGE.exec(item.name);
   need(RESULT_NAMES.includes(item.name)||page,'Retain only the native result files and original numbered response pages.');
   if(page)pages.push(Number(page[1]));
  }
 }
 if(value.kind==='study')need(value.files.length===1,'Retain the one complete saved study file.');
 else{
  need(REQUIRED_RESULT_NAMES.every(name=>seen.has(name)),'The result must include CSV, JSONL, saved study and the original native manifest.');
  pages.sort((a,b)=>a-b);
  need(pages.length>=1&&pages.length<=4096&&pages.every((number,index)=>number===index),'Original response pages must form a complete consecutive chain from page zero.');
 }
 return value;
}
