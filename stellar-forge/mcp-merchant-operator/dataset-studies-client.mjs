// MIT. Typed original dataset-study operations and complete retained-file receiving.
import {openMerchantFileClient,createRetainedDownload} from './retained-download.mjs';
import {failure,identifier} from './host-files.mjs';
import {DATASET_STUDY_DOWNLOAD_MANIFEST,DATASET_STUDY_DOWNLOAD_FILE_BYTES,
 DATASET_STUDY_DOWNLOAD_MANIFEST_BYTES,DATASET_STUDY_UUID,parseDatasetStudyDownloadManifest,
 validateDatasetStudyExportId,datasetStudyExportId} from './dataset-studies-download-contract.mjs';

export async function openDatasetStudiesClient({
 url,tokenEnv,environment,workspace,workspaceId,instanceId,client,signal
}={}){
 identifier(workspace,'Dataset study workspace alias');
 if(workspaceId!==undefined&&!DATASET_STUDY_UUID.test(workspaceId))
  throw failure('DATASET_STUDIES_CLIENT_BINDING','Select the original persistent workspace UUID.');
 if(instanceId!==undefined&&(!DATASET_STUDY_UUID.test(instanceId)||!workspaceId))
  throw failure('DATASET_STUDIES_CLIENT_BINDING','Select the current process instance together with its original workspace UUID.');
 const transport=client??await openMerchantFileClient({url,tokenEnv,environment,signal,errorPrefix:'DATASET_STUDIES',
  clientName:'starforge-dataset-studies',maximumResponseBytes:4*1024*1024});
 if(!transport||typeof transport.call!=='function'||typeof transport.endpoint!=='string')
  throw failure('DATASET_STUDIES_CLIENT_REQUIRED','Select one original merchant transport.');
 let selectedWorkspace=workspaceId,selectedInstance=instanceId,opening=null;
 const scope=()=>{
  if(!selectedWorkspace||!selectedInstance)throw failure('DATASET_STUDIES_CLIENT_BINDING','Open the original workspace and retain both its persistent workspaceId and process instanceId.');
  return {workspace,workspaceId:selectedWorkspace,instanceId:selectedInstance};
 };
 const call=(name,args={},options)=>transport.call('merchant_dataset_study_'+name,{...args,...scope()},options);
 function receiver(){
  const binding=scope();
  const adapter={endpoint:transport.endpoint+'#dataset-studies='+workspace+'/'+binding.workspaceId,
   call:(name,args,options)=>transport.call(name,{...args,...binding},options)};
  const transfer=createRetainedDownload({
   manifestName:DATASET_STUDY_DOWNLOAD_MANIFEST,parseManifest:(bytes,exportId)=>{
    const manifest=parseDatasetStudyDownloadManifest(bytes,exportId);
    if(manifest.workspaceId!==binding.workspaceId)throw failure('DATASET_STUDIES_DOWNLOAD_BINDING','The complete selected files belong to a different original workspace.');
    return manifest;
   },maximumBytes:DATASET_STUDY_DOWNLOAD_FILE_BYTES,
   maximumManifestBytes:DATASET_STUDY_DOWNLOAD_MANIFEST_BYTES,maximumCheckpointBytes:8*1024*1024,
   stateSchema:'stellar-forge.dataset-study-download-state.v1',resultSchema:'stellar-forge.dataset-study-downloaded.v1',
   toolPrefix:'merchant_dataset_study',errorPrefix:'DATASET_STUDY',clientName:'starforge-dataset-studies',
   validateExportId:validateDatasetStudyExportId,
   describe:manifest=>({workspaceId:manifest.workspaceId,kind:manifest.kind,studyId:manifest.studyId,storageRevision:manifest.storageRevision})
  });
  return {adapter,transfer};
 }
 const result={
  get workspace(){return workspace;},get workspaceId(){return selectedWorkspace;},get instanceId(){return selectedInstance;},
  get endpoint(){return transport.endpoint;},
  list:(args={},options)=>transport.call('merchant_dataset_study_list',args,options),
  open(options){
   if(!opening)opening=transport.call('merchant_dataset_study_open',{workspace},options).then(value=>{
    if(value.workspace!==workspace||value.state!=='OPEN'||!DATASET_STUDY_UUID.test(value.workspaceId??'')||
      !DATASET_STUDY_UUID.test(value.instanceId??'')||selectedWorkspace&&value.workspaceId!==selectedWorkspace)
     throw failure('DATASET_STUDIES_CLIENT_BINDING','The listener opened a different original study workspace.');
    selectedWorkspace=value.workspaceId;selectedInstance=value.instanceId;return value;
   }).finally(()=>{opening=null;});
   return opening;
  },
  async status(args={},options){
   const value=await transport.call('merchant_dataset_study_status',{...args,workspace},options);
   if(value.workspace!==workspace||value.workspaceId!==undefined&&selectedWorkspace&&value.workspaceId!==selectedWorkspace)
    throw failure('DATASET_STUDIES_CLIENT_BINDING','The status belongs to a different original workspace.');
   return value;
  },
  inspect:(input,options)=>call('inspect',input,options),
  create:(input,options)=>call('create',input,options),
  save:(input,options)=>call('save',input,options),
  inspectImport:(sourceImport,options)=>call('import_inspect',{sourceImport},options),
  import:(input,options)=>call('import',input,options),
  fork:(input,options)=>call('fork',input,options),
  restore:(input,options)=>call('restore',input,options),
  rebind:(input,options)=>call('rebind',input,options),
  query:(input,options)=>call('query',input,options),
  startExport:(input,options)=>call('export_start',input,options),
  resumeExport:(exportId,options)=>call('export_resume',{exportId},options),
  exports:(input={},options)=>call('exports',input,options),
  manifest:(exportId,options)=>call('manifest',{exportId},options),
  file:(input,options)=>call('file',input,options),
  releaseFile:(exportId,readId,options)=>call('file_release',{exportId,readId},options),
  openBrowser:(port=0,options)=>call('browser_open',{port},options),
  closeBrowser:options=>call('browser_close',{},options),
  async close(options){
   const binding=scope(),value=await call('close',{},options);
   if(value.workspace!==workspace||value.workspaceId!==binding.workspaceId||value.instanceId!==binding.instanceId||value.state!=='CLOSED')
    throw failure('DATASET_STUDIES_CLIENT_BINDING','The close response does not identify the original selected owner.');
   if(selectedInstance===binding.instanceId)selectedInstance=undefined;
   return value;
  },
  async waitExport(exportId,{signal:waitingSignal=signal,intervalMs=750,onProgress}={}){
   if(!Number.isSafeInteger(intervalMs)||intervalMs<100||intervalMs>10000)
    throw failure('DATASET_STUDIES_CLIENT_INTERVAL','Choose a status interval from 100 through 10000 milliseconds.');
   for(;;){
    waitingSignal?.throwIfAborted();
    const value=await call('exports',{exportId},{requestSignal:waitingSignal});
    if(!value.export||value.export.id!==exportId||!['READY','RUNNING','PAUSED','COMPLETE'].includes(value.export.status))
     throw failure('DATASET_STUDIES_CLIENT_RESULT','The original export status differs from the selected result.');
    await onProgress?.(value);
    if(value.export.status!=='RUNNING')return value;
    await new Promise((resolve,reject)=>{
     const finish=()=>{waitingSignal?.removeEventListener('abort',abort);resolve();};
     const timer=setTimeout(finish,intervalMs);
     const abort=()=>{clearTimeout(timer);waitingSignal?.removeEventListener('abort',abort);
      reject(waitingSignal.reason??failure('DATASET_STUDIES_CLIENT_CANCELLED','Status observation stopped; the original result remains retained.'));};
     waitingSignal?.addEventListener('abort',abort,{once:true});if(waitingSignal?.aborted)abort();
    });
   }
  },
  async inspectDownload(exportId,options={}){
   const {adapter,transfer}=receiver();
   return transfer.inspect({...options,exportId,client:adapter});
  },
  async download(options){
   const {adapter,transfer}=receiver();
   return transfer.download({...options,client:adapter});
  },
  async downloadStudy(studyId,storageRevision,options){
   const {adapter,transfer}=receiver();
   return transfer.download({...options,exportId:datasetStudyExportId(studyId,storageRevision),client:adapter});
  }
 };
 return Object.freeze(result);
}
