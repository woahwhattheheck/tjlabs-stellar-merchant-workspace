// MIT. Read one complete original prepared order at its retained source identity.
import {join} from 'node:path';
import {isDeepStrictEqual} from 'node:util';
import {PREPARATION_HASH,preparationNeed,preparationPlain,preparationPrivateDirectory,
 preparationReadJson,preparationOpenFile,preparationHashFile} from '../connection.mjs';
const PREPARED='stellar-forge.preparation-pipeline-job-prepared.v1';
const ORDER_NAMES=['input.json','project.zip','review.html','selection.json'];
const MAX_PROJECT=28*1024*1024,MAX_JSON=4*1024*1024;
export async function inspectPreparedPipelineOrder(directory,{verifyFiles=false}={}){
 await preparationPrivateDirectory(directory);
 const selected=await preparationReadJson(join(directory,'prepared.json'),{maximum:MAX_JSON}),p=selected.value;
 preparationNeed(p?.schema===PREPARED&&p.intent?.schema===PREPARED&&p.functionId==='executePipeline'&&
  preparationPlain(p.files)&&isDeepStrictEqual(Object.keys(p.files).sort(),ORDER_NAMES)&&
  typeof p.intent.pipelineId==='string'&&Number.isSafeInteger(p.intent.revision)&&p.intent.revision>=1&&
  typeof p.intent.reportName==='string'&&preparationPlain(p.intent.project)&&
  isDeepStrictEqual(p.intent.project,p.files['project.zip'])&&
  p.input?.reportName===p.intent.reportName&&p.input?.selectionSha256===p.files['selection.json'].sha256&&
  isDeepStrictEqual(p.attachmentSlots,{project:'project.zip',selection:'selection.json'}),
  'PREPARATION_JOB_ORDER_CHANGED','The selected destination is not a complete original prepared pipeline order.',409);
 for(const [name,record]of Object.entries(p.files)){
  preparationNeed(preparationPlain(record)&&Number.isSafeInteger(record.bytes)&&record.bytes>0&&
   record.bytes<=(name==='project.zip'?MAX_PROJECT:MAX_JSON)&&PREPARATION_HASH.test(record.sha256??''),
   'PREPARATION_JOB_ORDER_CHANGED','The complete original prepared-file declaration changed.',409);
  if(verifyFiles){
   const opened=await preparationOpenFile(join(directory,name),{privateOnly:true,maximum:name==='project.zip'?MAX_PROJECT:MAX_JSON});
   try{preparationNeed(opened.bytes===record.bytes&&await preparationHashFile(opened)===record.sha256,
    'PREPARATION_JOB_ORDER_CHANGED','A complete original prepared file changed.',409);}
   finally{await opened.handle.close();}
  }
 }
 return {prepared:p,sha256:selected.sha256};
}
