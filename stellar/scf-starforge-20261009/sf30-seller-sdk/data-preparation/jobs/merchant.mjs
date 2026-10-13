// MIT. Commission and receive saved pipeline jobs through original host-declared aliases.
import {join,dirname,relative,isAbsolute} from 'node:path';
import {isDeepStrictEqual} from 'node:util';
import {preparePipelineJob,receivePipelineJob,reopenPipelineJob} from './customer.mjs';
import {reopenResultPackage,RESULT_PACKAGE_TYPE,RESULT_PACKAGE_MAX_BYTES} from '../../jobs/outputs/index.mjs';
import {RetainedFileReads} from '../../../../../stellar-forge/mcp-merchant-operator/retained-file-reads.mjs';
import {PREPARATION_HASH,preparationNeed,preparationPlain,preparationPrivateDirectory,
 preparationReadJson,preparationOpenFile,preparationHashFile,preparationWorkspaceIdentity} from '../connection.mjs';

const PREPARED='stellar-forge.preparation-pipeline-job-prepared.v1';
const ORDER_NAMES=['input.json','project.zip','review.html','selection.json'];
const MAX_PROJECT=28*1024*1024,MAX_JSON=4*1024*1024;
const within=(parent,target)=>{const p=relative(parent,target);return p===''||p!=='..'&&!p.startsWith('../')&&!isAbsolute(p);};
const media=name=>name.endsWith('.html')?'text/html; charset=utf-8':name.endsWith('.json')?'application/json':'application/zip';
function hash(value){preparationNeed(PREPARATION_HASH.test(value??''),'PREPARATION_JOB_HASH_REQUIRED','Use the complete original SHA-256.');return value;}
function exactExpected(args,source){
 preparationNeed(Number.isSafeInteger(args.expectedBytes)&&args.expectedBytes>0&&args.expectedBytes<=RESULT_PACKAGE_MAX_BYTES&&
  typeof args.expectedFilename==='string'&&args.expectedFilename.length>0&&args.expectedFilename.length<=255&&
  !/[\\/\x00-\x1f\x7f]/.test(args.expectedFilename),'PREPARATION_JOB_PACKAGE_INVALID','Retain the complete original Buyer download descriptor.');
 hash(args.expectedSourceSha256);
 if(source)preparationNeed(source.bytes===args.expectedBytes&&source.sha256===args.expectedSourceSha256,
  'PREPARATION_JOB_SOURCE_CHANGED','The declared complete result differs from the original Buyer download.',409);
 return {bytes:args.expectedBytes,sha256:args.expectedSourceSha256,filename:args.expectedFilename,contentType:RESULT_PACKAGE_TYPE};
}
function originalJob(value,required=false){
 if(value===undefined&&!required)return {};
 preparationNeed(preparationPlain(value),'PREPARATION_JOB_IDENTITY_REQUIRED','Retain the original accepted job and native settlement.');
 const allowed=['id','functionId','inputSha256','configSha256','applicationSha256','publicOrigin','attemptId','nativeSettlement'];
 preparationNeed(Object.keys(value).every(key=>allowed.includes(key))&&value.functionId==='executePipeline'&&
  typeof value.id==='string'&&value.id.length>0&&value.id.length<=200&&PREPARATION_HASH.test(value.inputSha256??'')&&
  typeof value.publicOrigin==='string'&&preparationPlain(value.nativeSettlement)&&
  typeof value.nativeSettlement.id==='string'&&value.nativeSettlement.id.length>0&&
  typeof value.nativeSettlement.at==='string'&&value.nativeSettlement.at.length>0,
  'PREPARATION_JOB_IDENTITY_REQUIRED','Use the original executePipeline job, input digest, merchant origin and native settlement.');
 return value;
}
async function verifyScope(scope){
 const current=await preparationWorkspaceIdentity(scope.directory);
 preparationNeed(current.workspaceSha256===scope.workspaceSha256&&
  current.directoryIdentity.dev===scope.directoryIdentity.dev&&current.directoryIdentity.ino===scope.directoryIdentity.ino,
  'PREPARATION_WORKSPACE_CHANGED','The declared original workspace directory changed.',409);
}
async function selectedDestination(context,name){
 const selected=context.destination(name),directory=selected.directory;
 await preparationPrivateDirectory(dirname(directory));
 try{await preparationPrivateDirectory(directory);}catch(error){if(error.code!=='ENOENT')throw error;}
 preparationNeed(!within(context.scope.directory,directory)&&!within(directory,context.scope.directory),
  'PREPARATION_JOB_DESTINATION_CONFLICT','Keep the original preparation and customer destination directories separate.');
 return directory;
}
function separate(left,right){
 preparationNeed(!within(left,right)&&!within(right,left),'PREPARATION_JOB_DESTINATION_CONFLICT',
  'Use separate declared order, immutable package and editable customer directories.');
}
async function selectedOrder(directory,{verifyFiles=false}={}){
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
function retainedFiles(receipt){
 preparationNeed(receipt?.complete===true&&receipt.schema==='stellar-forge.job-result-receiving.v1'&&
  receipt.package?.contentType===RESULT_PACKAGE_TYPE&&receipt.job?.functionId==='executePipeline'&&
  Array.isArray(receipt.files),'PREPARATION_JOB_RESULT_INVALID','Select the complete original pipeline result package.');
 const policy={report:['pipeline-report.html','text/html; charset=utf-8',2*1024*1024],
  project:['pipeline-project.zip','application/zip',28*1024*1024],
  execution:['pipeline-execution.json','application/json; charset=utf-8',2*1024*1024],
  results:['pipeline-results.zip','application/zip',28*1024*1024]};
 const slots=new Set();
 for(const f of receipt.files){
  const expected=policy[f.slot];
  preparationNeed(expected&&!slots.has(f.slot)&&f.filename===expected[0]&&f.contentType===expected[1]&&
   Number.isSafeInteger(f.bytes)&&f.bytes>0&&f.bytes<=expected[2]&&PREPARATION_HASH.test(f.sha256??'')&&
   f.path===join(receipt.directory,'files',f.filename),'PREPARATION_JOB_RESULT_INVALID','The retained pipeline result file selection changed.');
  slots.add(f.slot);
 }
 preparationNeed(['report','project','execution'].every(x=>slots.has(x)),'PREPARATION_JOB_RESULT_INVALID','The original report, editable project and execution record are required.');
 return [{selection:'package',name:receipt.package.filename,path:receipt.archivePath,bytes:receipt.package.bytes,
  sha256:receipt.package.sha256,contentType:receipt.package.contentType},
  ...receipt.files.map(f=>({selection:f.slot,name:f.filename,path:f.path,bytes:f.bytes,sha256:f.sha256,contentType:f.contentType}))];
}
export class PreparationCommissioning{
 #reads=new RetainedFileReads({errorPrefix:'PREPARATION_JOB',maxImmutableFileBytes:RESULT_PACKAGE_MAX_BYTES});
 get summary(){return this.#reads.summary;}
 async call(name,args,context){
  if(name==='merchant_preparation_job_file_release'){
   await this.#reads.release(context.scope.alias,args.readId);
   return {workspace:context.scope.alias,readId:args.readId,released:true};
  }
  await verifyScope(context.scope);
  if(name==='merchant_preparation_job_prepare'){
   preparationNeed(Boolean(args.sourceInput)!==Boolean(args.fileId),'PREPARATION_JOB_SOURCE_REQUIRED',
    'Select one declared project sourceInput or one retained complete pipeline-project fileId.');
   let source;
   if(args.sourceInput)source=context.input(args,'project');
   else{
    const selected=await context.exported(args.fileId);
    preparationNeed(selected.record.kind==='pipeline-project'&&selected.record.sha256===args.expectedSourceSha256,
     'PREPARATION_JOB_SOURCE_CHANGED','Select the complete original pipeline-project delivery and its reviewed SHA-256.',409);
    source={file:selected.path,bytes:selected.record.bytes,sha256:selected.record.sha256};
   }
   hash(args.expectedSourceSha256);
   preparationNeed(source.sha256===args.expectedSourceSha256&&source.bytes<=MAX_PROJECT,
    'PREPARATION_JOB_SOURCE_CHANGED','Select the original project within the commissioned 28 MiB allowance.',409);
   const directory=await selectedDestination(context,args.orderDestination);
   const result=await preparePipelineJob({project:source.file,sha256:args.expectedSourceSha256,directory,
    pipelineId:args.pipelineId,revision:args.revision,reportName:args.reportName,
    ...(args.inputs===undefined?{}:{inputs:args.inputs}),
    ...(args.reuseExecution===undefined?{}:{reuseExecution:args.reuseExecution}),python:context.python});
   return {workspace:context.scope.alias,orderDestination:args.orderDestination,directory,prepared:result};
  }
  if(name==='merchant_preparation_job_order'){
   const directory=await selectedDestination(context,args.orderDestination);
   const selected=await selectedOrder(directory,{verifyFiles:true});
   if(args.expectedOrderSha256!==undefined)preparationNeed(hash(args.expectedOrderSha256)===selected.sha256,
    'PREPARATION_JOB_ORDER_CHANGED','Reopen the selected original prepared-order digest.',409);
   return {workspace:context.scope.alias,orderDestination:args.orderDestination,directory,
    orderSha256:selected.sha256,prepared:selected.prepared,
    files:Object.entries(selected.prepared.files).map(([name,f])=>({selection:name,name,contentType:media(name),...f}))};
  }
  if(name==='merchant_preparation_job_receive'||name==='merchant_preparation_job_reopen'){
   const packageDirectory=await selectedDestination(context,args.packageDestination);
   const directory=await selectedDestination(context,args.destination);separate(packageDirectory,directory);
   const common={packageDirectory,directory,python:context.python,job:originalJob(args.job,name.endsWith('_receive'))};
   let result;
   if(name.endsWith('_receive')){
    preparationNeed(Boolean(args.sourceInput)!==Boolean(args.downloadDestination),'PREPARATION_JOB_SOURCE_REQUIRED',
     'Select one declared result sourceInput or original Buyer download destination.');
    let source,expected;
    if(args.sourceInput){source=context.input(args,'job-result');expected=exactExpected(args,source);}
    else{
     expected=exactExpected(args);
     const downloads=await selectedDestination(context,args.downloadDestination);
     separate(downloads,packageDirectory);separate(downloads,directory);
     await preparationPrivateDirectory(downloads);
     source={file:join(downloads,expected.filename),bytes:expected.bytes,sha256:expected.sha256};
    }
    result=await receivePipelineJob({source:source.file,expected,...common});
   }else{
    const any=['expectedBytes','expectedFilename','expectedSourceSha256'].some(key=>args[key]!==undefined);
    result=await reopenPipelineJob({...common,...(any?{expected:exactExpected(args)}:{})});
   }
   return {workspaceAlias:context.scope.alias,packageDestination:args.packageDestination,destination:args.destination,...result};
  }
  if(name==='merchant_preparation_job_result_files'){
   const directory=await selectedDestination(context,args.packageDestination);
   const receipt=await reopenResultPackage({directory,job:originalJob(args.job)});
   const files=retainedFiles(receipt);
   return {workspace:context.scope.alias,packageDestination:args.packageDestination,package:receipt.package,
    job:receipt.job,manifestSha256:receipt.manifestSha256,files:files.map(({path,...value})=>value)};
  }
  if(name==='merchant_preparation_job_file'){
   hash(args.expectedSha256);
   preparationNeed(['order','result'].includes(args.kind),'PREPARATION_JOB_FILE_KIND','Select an original order or result file.');
   let directory,selected;
   if(args.kind==='order'){
    preparationNeed(args.packageDestination===undefined&&args.job===undefined,'PREPARATION_JOB_FILE_SELECTION','Use only the prepared order destination for order files.');
    directory=await selectedDestination(context,args.orderDestination);
    const original=await selectedOrder(directory),file=original.prepared.files[args.selection];
    preparationNeed(ORDER_NAMES.includes(args.selection)&&file,'PREPARATION_JOB_FILE_SELECTION','Select one complete prepared order file.');
    selected={path:join(directory,args.selection),name:args.selection,contentType:media(args.selection),...file};
   }else{
    preparationNeed(args.orderDestination===undefined,'PREPARATION_JOB_FILE_SELECTION','Use only the original package destination for result files.');
    directory=await selectedDestination(context,args.packageDestination);
    const receipt=await reopenResultPackage({directory,job:originalJob(args.job)});
    selected=retainedFiles(receipt).find(x=>x.selection===args.selection);
    preparationNeed(selected,'PREPARATION_JOB_FILE_SELECTION','Select one of the original complete result files.');
   }
   preparationNeed(selected.sha256===args.expectedSha256,'PREPARATION_JOB_FILE_CHANGED','Read the exact retained file SHA-256.',409);
   const key=JSON.stringify([args.kind,directory,args.selection]);
   return this.#reads.read({scope:context.scope.alias,key,kind:'pipeline-job-'+args.kind,directory,
    readId:args.readId,expectedSha256:args.expectedSha256,offset:args.offset,limit:args.limit,
    load:async()=>{
     const source=await preparationOpenFile(selected.path,{privateOnly:true,maximum:RESULT_PACKAGE_MAX_BYTES});
     return {readonlyFileHandle:source.handle,bytes:selected.bytes,sha256:selected.sha256,name:selected.name,type:selected.contentType};
    }});
  }
  preparationNeed(false,'PREPARATION_JOB_TOOL_UNKNOWN','Choose a complete declared pipeline commissioning operation.');
 }
 disconnect(scope){return this.#reads.closeScope(scope.alias);}
 close(){return this.#reads.close();}
}
