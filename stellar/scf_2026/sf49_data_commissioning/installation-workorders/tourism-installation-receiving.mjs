#!/usr/bin/env node
// SPDX-License-Identifier: MIT
/** Continue the original saved Installation and independently open its full Tourism edition. */
import {resolve,join,basename} from 'node:path';
import {pathToFileURL} from 'node:url';
import {publishDirectory} from '../../../../services/tourism-series-workspace/build.mjs';
import {completeFiles,compare,json} from '../../../../services/tourism-series-workspace/portable.mjs';
import {inspectTourism,reopenTourism,validateSelection,same,sha,MAX_SOURCE} from './tourism-installation-core.mjs';
import {need,encoded,parse,identity,privateDirectory,retain,originalInput,originalUnchanged,regular,operationLease,nativeOperations,inspectInstallationArchive} from './tourism-installation-io.mjs';
const safe=path=>typeof path==='string'&&!path.startsWith('/')&&!path.includes('\\')&&!path.split('/').some(x=>!x||x==='.'||x==='..')&&!/[\u0000-\u001f]/.test(path);
async function receiveWorking({raw,programSource,destination,operation}){
 const source=inspectTourism(raw),copyId='tourism-received-'+sha(encoded({original:source.input,operation,destination}));
 const record={...source.record,copyId},files=completeFiles(programSource,record);
 const originalRecord=encoded(record),manifest=files.map(file=>{
  const bytes=file.base64!==undefined?Buffer.from(file.base64,'base64'):Buffer.from(file.content);
  return{path:file.path,...identity(bytes)};
 });
 const receipt={schema:'stellar-forge.tourism-working-receiving.v1',original:source.input,workspace:source.workspace,copyId,
  originalBrowserCopyId:source.originalBrowserCopyId,operation,files:manifest,source:identity(encoded(programSource))};
 files.push({path:'Original_Working_Recovery.json',content:originalRecord.toString('utf8')},{path:'Current_Working_Recovery.json',content:originalRecord.toString('utf8')},{path:'RECEIVING.json',content:json(receipt)});
 let prior;
 try{prior=parse(await regular(join(destination,'RECEIVING.json'),MAX_SOURCE));}catch(error){if(error.code!=='ENOENT')throw error;}
 if(!prior)await publishDirectory(destination,files);
 const actual=parse(await regular(join(destination,'RECEIVING.json'),MAX_SOURCE));
 need(same(actual,receipt),'Keep the independently received original working copy and its original operation.');
 need((await regular(join(destination,'Original_Working_Recovery.json'),128*1024*1024)).equals(originalRecord),'The received original recovery changed.');
 // Immutable original delivery members stay complete; the editable recovery may be a later saved descendant.
 for(const member of manifest){
  const body=await regular(join(destination,member.path),256*1024*1024);
  need(same(identity(body),{bytes:member.bytes,sha256:member.sha256}),'A complete received member changed: '+member.path);
 }
 const current=await regular(join(destination,'Current_Working_Recovery.json'),128*1024*1024),reopened=reopenTourism(raw,current);
 need(reopened.copyId===copyId,'Keep this independent browser copy identity when saving later work.');
 return{receipt,reopened,directory:destination,application:join(destination,'Tourism_Series_Workspace.html'),working:join(destination,'Current_Working_Recovery.json')};
}
export async function main(argv=process.argv.slice(2)){
 const required=['prepared','operations-cli','workspace','case','installation','revision','receiving-workspace','tourism-destination','out','actor'],options={};
 const usage='tourism-installation-receive --prepared DIRECTORY --operations-cli CLI.py --workspace ORIGINAL_OPERATIONS --case ORIGINAL_CASE --installation ID --revision N --receiving-workspace RECEIVED_OPERATIONS --tourism-destination RECEIVED_TOURISM --out ORIGINAL_OPERATION_DIRECTORY --actor NAMED_OPERATOR [--python EXECUTABLE]';
 for(let i=0;i<argv.length;i+=2){const key=argv[i]?.replace(/^--/,'');need([...required,'python'].includes(key)&&argv[i+1]&&!Object.hasOwn(options,key),usage);options[key]=argv[i+1];}
 need(required.every(k=>options[k]),usage);options.python??='python3';
 for(const k of ['prepared','operations-cli','workspace','receiving-workspace','tourism-destination','out'])options[k]=resolve(options[k]);
 need(options.workspace!==options['receiving-workspace'],'Select an independent original Operations receiving directory.');
 need(/^[1-9][0-9]*$/.test(options.revision)&&Number.isSafeInteger(Number(options.revision)),'Select the actual saved Installation revision.');
 const output=await privateDirectory(options.out),lease=await operationLease(join(output,'tourism-installation-receiving.lock'));
 const read=(path,max=256*1024*1024)=>regular(path,max),save=async(name,value)=>retain(join(output,name),encoded(value));
 const phase=async(name,action)=>{try{return parse(await read(join(output,name+'.json')));}catch(error){if(error.code!=='ENOENT')throw error;}const value=await action();await save(name+'.json',value);return value;};
 const native=(args,workspace=options.workspace)=>nativeOperations(options.python,options['operations-cli'],workspace,args);
 try{
  await save('Original_Receiving_Arguments.json',options);
  const input=await originalInput(output,'Original_Preparation_Receiving.json',join(options.prepared,'Tourism_Installation_Receiving.json'),MAX_SOURCE),receipt=parse(input.raw);
  need(receipt.schema==='stellar-forge.tourism-installation-local-receiving.v1'&&receipt.command==='prepare'&&Array.isArray(receipt.outputs),'Select the complete original preparation.');
  const selected=new Map();
  for(const file of receipt.outputs){
   need(safe(file.path)&&!selected.has(file.path),'Keep complete distinct preparation paths.');
   const retained=await originalInput(output,'prepared/'+file.path,join(options.prepared,file.path),256*1024*1024);
   need(same(retained.identity,{bytes:file.bytes,sha256:file.sha256}),'The original preparation changed: '+file.path);selected.set(file.path,retained.raw);
  }
  for(const name of ['Tourism_Original_Working.json','Selected_Tourism_Editions.json','installation-input.json','Tourism_Installation_Editions.json','Original_Program_Source.json'])need(selected.has(name),'Retain '+name+'.');
  const originalRaw=selected.get('Tourism_Original_Working.json'),selectionRaw=selected.get('Selected_Tourism_Editions.json');
  const source=inspectTourism(originalRaw),selection=parse(selectionRaw),snapshot=parse(selected.get('Tourism_Installation_Editions.json')),document=parse(selected.get('installation-input.json'));
  validateSelection(source,selection);
  need(receipt.caseId===options.case&&same(receipt.workspace,source.workspace)&&same(snapshot.workspace,source.workspace),'Preserve the original source/case selection.');
  need(snapshot.selectedEditionsSource.sha256===sha(selectionRaw)&&snapshot.selectedEditionsSource.bytes===selectionRaw.length,'Preserve the exact original scope document.');
  const originalId=selection.original.sourceId,selectionId=snapshot.selectedEditionsSource.sourceId;
  for(const id of [originalId,selectionId])need(document.source.sourceIds.includes(id)&&document.receiving.sourceIds.includes(id),'Select both complete original source attachments in the saved Installation.');
  const saved=await phase('Original_Saved_Installation',async()=>{
   const value=native(['installation-show','--case',options.case,'--installation',options.installation,'--revision',options.revision]);
   need(value.id===options.installation&&String(value.revision)===options.revision&&same(value.preview.document,document),'Select the actual saved original Installation.');return value;
  });
  const originalCase=await phase('Original_Operations_Case',async()=>{
   const value=native(['show','--case',options.case]);need(value.program?.id===options.case&&Array.isArray(value.sources),'Keep the complete original case.');
   for(const [id,raw]of [[originalId,originalRaw],[selectionId,selectionRaw]])need(value.sources.some(row=>row.id===id&&row.bytes===raw.length&&row.sha256===sha(raw)),'The case lacks its complete original source: '+id);return value;
  });
  const programSource=parse(selected.get('Original_Program_Source.json'));
  need(same(identity(encoded(programSource)),receipt.workingSource),'Preserve the complete original program source selection.');
  const operation='tourism-installation-'+sha(encoded({original:source.input,scope:snapshot.selectedEditionsSource,caseId:options.case,installation:{id:options.installation,revision:Number(options.revision),sha256:saved.sha256},workspace:options['receiving-workspace'],destination:options['tourism-destination'],actor:options.actor})).slice(0,32);
  const working=await receiveWorking({raw:originalRaw,programSource,destination:options['tourism-destination'],operation});
  await phase('Tourism_Original_Receiving',async()=>working);
  const reopened=await receiveWorking({raw:originalRaw,programSource,destination:options['tourism-destination'],operation});
  need(same(working.reopened,reopened.reopened),'The received working copy changed during independent reopening.');
  await phase('Tourism_Cold_Reopen',async()=>reopened);
  const archivePath=join(output,'Complete_Original_Installation.zip');
  const exported=await phase('Installation_Export',async()=>{
   let raw;try{raw=await read(archivePath);}catch(error){if(error.code!=='ENOENT')throw error;}
   if(!raw){native(['installation-export','--case',options.case,'--installation',options.installation,'--revision',options.revision,'--output',archivePath]);raw=await read(archivePath);}
   return{path:'Complete_Original_Installation.zip',...identity(raw)};
  });
  const archiveRaw=await read(archivePath);need(same(identity(archiveRaw),{bytes:exported.bytes,sha256:exported.sha256}),'Preserve the original Installation export.');
  const archiveSelection={schema:'stellar-forge.tourism-installation-archive-selection.v1',caseId:options.case,
   installation:{id:options.installation,revision:Number(options.revision),sha256:saved.sha256},document:saved.preview.document,
   sources:[...new Set([...document.source.sourceIds,...document.receiving.sourceIds])].map(id=>{
    const row=originalCase.sources.find(r=>r.id===id);need(row,'Retain selected original source '+id);return{id,bytes:row.bytes,sha256:row.sha256};
   })};
  await save('Original_Archive_Selection.json',archiveSelection);
  const inspected=inspectInstallationArchive(options.python,archivePath,join(output,'Original_Archive_Selection.json'));
  need(same(inspected.archive,identity(archiveRaw)),'The full archive changed before its native import.');
  await phase('Installation_Archive_Selection',async()=>inspected);
  const imported=native(['import','--file',archivePath,'--name','Received Tourism source installation','--actor',options.actor,'--request-id',operation],options['receiving-workspace']);
  need(typeof imported.id==='string','Retain the original independently received case identity.');
  const originalImport=await phase('Installation_Independent_Import',async()=>imported);need(originalImport.id===imported.id,'The original case receiving changed.');
  const readCase=()=>{
   const value=native(['installation-show','--case',imported.id,'--installation',options.installation,'--revision',options.revision],options['receiving-workspace']);
   const full=native(['show','--case',imported.id],options['receiving-workspace']);
   need(value.sha256===saved.sha256&&same(value.preview.document,saved.preview.document),'The received original Installation differs.');
   for(const id of new Set([...document.source.sourceIds,...document.receiving.sourceIds])){
    const a=originalCase.sources.find(r=>r.id===id),b=full.sources.find(r=>r.id===id);need(a&&b&&a.sha256===b.sha256&&a.bytes===b.bytes,'The received full source differs: '+id);
   }
   return{caseId:imported.id,installationId:value.id,revision:value.revision,sha256:value.sha256,workshare:value.preview.document.workshare};
  };
  const actual=readCase();await phase('Installation_Independent_Reopen',async()=>actual);
  need(same(actual,readCase()),'The received original Installation changed between reads.');
  for(const file of receipt.outputs)await originalUnchanged(join(options.prepared,file.path),selected.get(file.path),256*1024*1024);
  await originalUnchanged(join(options.prepared,'Tourism_Installation_Receiving.json'),input.raw,MAX_SOURCE);
  const result={schema:'stellar-forge.tourism-installation-complete-receiving.v1',state:'COMPLETE',
   original:{caseId:options.case,installationId:options.installation,revision:Number(options.revision),sha256:saved.sha256},
   receiving:{caseId:imported.id,operations:options['receiving-workspace'],tourism:options['tourism-destination']},
   source:{...source.input,workspace:source.workspace,selectedEditions:snapshot.selectedEditionsSource},archive:exported,requestId:operation,
   originalWorkingReceipt:working.receipt,renderedCourse:'Personally open/use/look at the exact original working HTML, Installation, full report, all attachments and cold-reopened files at desktop/narrow widths. TOURISM_INSTALLATION.md carries the same original course.'};
  await save('Tourism_Installation_Complete_Receiving.json',result);
  // Current descendant observation is returned each time without rewriting the first complete receipt.
  const observed={...result,currentWorking:working.reopened};console.log(json(observed));return observed;
 }finally{await lease.close();}
}
if(process.argv[1]&&import.meta.url===pathToFileURL(resolve(process.argv[1])).href)
 main().catch(error=>{console.error(JSON.stringify({code:error.code??'TOURISM_INSTALLATION_RECEIVING',message:String(error.message)}));process.exitCode=1;});
