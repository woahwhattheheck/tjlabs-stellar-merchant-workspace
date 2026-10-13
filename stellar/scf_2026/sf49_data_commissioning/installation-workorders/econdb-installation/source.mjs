// SPDX-License-Identifier: MIT
/** Full original operator-transfer intake; original validators own project semantics. */
import {join,resolve,dirname} from 'node:path';
import {fileURLToPath} from 'node:url';
import {spawn} from 'node:child_process';
import {inspectOperatorTransfer,exportOperator,receiveOperator} from '../../econdb/operator.mjs';
import {verifyProject} from '../../econdb/maritime-project-native.mjs';
import {need,ordinary,read,parse,json,hash,same,directory,parent,identity,retain} from './io.mjs';
const HERE=dirname(fileURLToPath(import.meta.url));
const HASH=/^[a-f0-9]{64}$/;
const UUID=/^[a-f0-9]{8}(?:-[a-f0-9]{4}){3}-[a-f0-9]{12}$/;
export async function archiveCommand(action,source,destination,expected,{signal,leaseFds=[]}={}){
 signal?.throwIfAborted();
 const argv=[join(HERE,'archive.py'),action,'--source',resolve(source),'--destination',resolve(destination)];
 if(action==='extract')argv.push('--bytes',String(expected.bytes),'--sha256',expected.sha256);
 need(Array.isArray(leaseFds)&&leaseFds.every(fd=>Number.isInteger(fd)&&fd>=0),'Retain the actual original lease descriptors.');
 const child=spawn(process.env.ECONDB_SOURCE_PYTHON||'python3',argv,{stdio:['ignore','pipe','pipe',...new Set(leaseFds)]});
 let stdout='',stderr='',size=0,primary=null,closed=false,escalation;
 const stop=error=>{
  primary??=error;
  if(closed||!child.pid)return;
  child.kill('SIGTERM');
  escalation??=setTimeout(()=>{if(!closed)child.kill('SIGKILL');},15000);
 };
 const aborted=()=>stop(signal?.reason instanceof Error?signal.reason:new Error('Original archive operation interrupted.'));
 try{
  await new Promise((yes,no)=>{
   child.stdout.on('data',b=>{size+=b.length;if(size>2*1024*1024){stop(new Error('Archive returned oversized metadata.'));return;}stdout+=b.toString('utf8');});
   child.stderr.on('data',b=>{if(stderr.length<12000)stderr+=b.toString('utf8');});
   child.once('error',error=>{primary??=error;if(!child.pid){closed=true;no(primary);}else stop(error);});
   // close follows process exit AND closure of the retained stdout/stderr pipes.
   child.once('close',(code,status)=>{closed=true;
    if(primary)no(primary);else if(code===0)yes();else no(new Error('Original archive '+action+' did not complete: '+(stderr||status||code)));
   });
   signal?.addEventListener('abort',aborted,{once:true});
   if(signal?.aborted)aborted();
  });
 }finally{signal?.removeEventListener('abort',aborted);if(escalation)clearTimeout(escalation);}
 need(size<=2*1024*1024,'Archive returned oversized metadata.');return JSON.parse(stdout);
}
export async function packEcondbWorkspace({workspace,directory:destination,archivePath,signal,leaseFds=[]}){
 const result=await exportOperator({directory:resolve(workspace),destination:resolve(destination)});
 const checked=await inspectOperatorTransfer(resolve(destination));
 const archive=await archiveCommand('pack',destination,archivePath,null,{signal,leaseFds});
 return {archive,workspaceId:checked.manifest.workspaceId,revision:checked.manifest.revision,transfer:result};
}
export async function openEcondbTransfer({archivePath,expectedArchiveSha256,expectedArchiveBytes,directory:destination,signal,leaseFds=[]}){
 const archive=await identity(resolve(archivePath),{signal});
 need(HASH.test(expectedArchiveSha256??'')&&archive.sha256===expectedArchiveSha256&&
  (expectedArchiveBytes===undefined||archive.bytes===expectedArchiveBytes),'Select the exact original full workspace ZIP.');
 await directory(resolve(destination));
 await archiveCommand('extract',archivePath,destination,archive,{signal,leaseFds});
 const checked=await inspectOperatorTransfer(resolve(destination));
 return {...checked,archive:{name:'econdb-workspace.zip',...archive},
 transferManifest:{name:'operator-transfer.json',...await identity(join(destination,'operator-transfer.json'),{signal})}};
}
export async function catalogueEcondbInstallationSource(options){
 const v=await openEcondbTransfer(options);
 const projects=v.status.records.filter(r=>r.kind==='project').map(record=>({record}));
 return {schema:'stellar-forge.econdb-customer-installation.v1.catalogue',
  archive:v.archive,transferManifest:v.transferManifest,workspaceId:v.manifest.workspaceId,revision:v.manifest.revision,
  projects,completeArchiveSummary:{files:v.manifest.files.length,totalBytes:v.manifest.files.reduce((n,f)=>n+f.bytes,0)}};
}
export async function inspectEcondbInstallationSource(options){
 const v=await openEcondbTransfer(options),{projectId,projectRevision,expectedInputSha256,observedAt}=options;
 need(UUID.test(projectId??'')&&Number.isSafeInteger(projectRevision)&&projectRevision>0&&HASH.test(expectedInputSha256??''),
  'Select the exact original project record, revision and input digest.');
 const record=v.status.records.find(r=>r.kind==='project'&&r.id===projectId&&r.revision===projectRevision&&r.inputSha256===expectedInputSha256);
 need(record,'The exact retained project edition is absent.');
 need(ordinary(record.directory),'Keep the original project directory binding.');
 const root=join(v.directory,'workspace',record.directory),project=await verifyProject(root);
 need(project.input_sha256===expectedInputSha256&&project.project_id===record.projectId,'Original project record/input identity differs.');
 const analysisRaw=await read(join(root,'project-analysis.json'),256*1024*1024),analysis=parse(analysisRaw);
 need(Array.isArray(analysis.entries)&&analysis.entries.length===project.config.entries.length,'Retain the complete original project analysis.');
 const files=[...project.manifest.files.map(f=>({name:f.path,bytes:f.bytes,sha256:f.sha256,mediaType:media(f.path)})),
 {name:'project-manifest.json',...await identity(join(root,'project-manifest.json'),{signal:options.signal}),mediaType:'application/json'}];
 const stamp=observedAt??new Date().toISOString();need(typeof stamp==='string'&&Number.isFinite(Date.parse(stamp)),'Retain the actual source observation time.');
 const source={schema:'stellar-forge.econdb-customer-installation.v1.source',archive:v.archive,transferManifest:v.transferManifest,
 workspace:{id:v.manifest.workspaceId,revision:v.manifest.revision,files:v.manifest.files.length,
  totalBytes:v.manifest.files.reduce((n,f)=>n+f.bytes,0)},
 project:{record,manifest:{name:'project-manifest.json',...await identity(join(root,'project-manifest.json'),{signal:options.signal})},
 analysisFile:{name:'project-analysis.json',bytes:analysisRaw.length,sha256:hash(analysisRaw)},inputSha256:project.input_sha256,
 config:project.config,summary:analysis.summary,entries:analysis.entries.map(e=>{
 const c=project.config.entries.find(x=>x.id===e.id);need(c,'Original analysis entry differs from configuration.');
 return {id:e.id,title:e.title,current:e.current,previous:e.previous,selection:e.period.selection,
 before:c.before??null,after:c.after??null,summary:e.summary};})},files,observedAt:stamp};
 return {source,projectDirectory:root,transferDirectory:v.directory,files:files.map(f=>({...f,path:join(root,f.name)})),
  transferManifestPath:join(v.directory,'operator-transfer.json')};
}
export async function receiveEcondbCustomerWorkspace({directory,destination,expectedArchiveSha256,signal,leaseFds=[]}){
 const archivePath=join(resolve(directory),'source','econdb-workspace.zip');
 const checked=await openEcondbTransfer({archivePath,expectedArchiveSha256,directory:join(resolve(directory),'retained-transfer'),signal,leaseFds});
 return receiveOperator({directory:checked.directory,destination:resolve(destination)});
}
function media(name){return name.endsWith('.json')?'application/json':name.endsWith('.csv')?'text/csv':name.endsWith('.html')?'text/html':name.endsWith('.mjs')?'text/javascript':name.endsWith('.md')?'text/markdown':'application/octet-stream';}
