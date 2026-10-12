import { readSync, createReadStream, mkdirSync, readFileSync, lstatSync, readdirSync, openSync, writeFileSync, closeSync, fsyncSync, existsSync, realpathSync, copyFileSync, unlinkSync, linkSync } from 'node:fs';
import { join, dirname, relative, resolve, sep } from 'node:path';
import { spawn } from 'node:child_process';
import { fileURLToPath } from 'node:url';
import { createHash, randomUUID } from 'node:crypto';
import { RozoWorkspace } from './store.mjs';
import { acquireLease, withLease } from './lease.mjs';
import { sourcePath, inspectPublisher, inspectRozoSource } from './source.mjs';
import { assert, fields, id, text, canonical, digest, jsonDigest, clone } from './model.mjs';

const ROOT='stellar/scf-starforge-20261009/sf30-seller-sdk/rozo-payments';
export const DELIVERY_SCHEMA='stellar-forge.rozo-delivery.v1';
export function hashOriginalFile(path){
  const stat=lstatSync(path);assert(stat.isFile()&&!stat.isSymbolicLink(),'DELIVERY_FILE','Select an ordinary original file.');
  const fd=openSync(path,'r'),hash=createHash('sha256'),chunk=Buffer.alloc(1024*1024);let bytes=0;
  try{for(;;){const count=readSync(fd,chunk,0,chunk.length,null);if(!count)break;bytes+=count;hash.update(chunk.subarray(0,count));}}finally{closeSync(fd);}
  assert(bytes===stat.size,'DELIVERY_FILE','The original file changed while reading.',409);
  return {bytes,sha256:hash.digest('hex')};
}
export function putOriginal(path,bytes){
  const raw=Buffer.isBuffer(bytes)?bytes:Buffer.from(bytes);mkdirSync(dirname(path),{recursive:true,mode:0o700});
  const reuse=()=>{
    assert(lstatSync(path).isFile()&&!lstatSync(path).isSymbolicLink()&&readFileSync(path).equals(raw),'DELIVERY_CONFLICT','The original delivery member differs: '+path,409);
  };
  if(existsSync(path)){reuse();return;}
  const temp=path+'.rozo-write-'+randomUUID();
  const fd=openSync(temp,'wx',0o600);
  try{
    try{writeFileSync(fd,raw);fsyncSync(fd);}finally{closeSync(fd);}
    try{linkSync(temp,path);}
    catch(error){if(error.code!=='EEXIST')throw error;reuse();}
  }finally{unlinkSync(temp);}
}
function ordinaryFiles(root,prefix=''){
  const out=[];
  if(!existsSync(root))return out;
  for(const entry of readdirSync(root,{withFileTypes:true})){
    const name=prefix?prefix+'/'+entry.name:entry.name,path=join(root,entry.name),stat=lstatSync(path);
    assert(!stat.isSymbolicLink(),'DELIVERY_SYMLINK','A complete receiving source contains a symbolic link: '+name,409);
    if(stat.isDirectory())out.push(...ordinaryFiles(path,name));else{assert(stat.isFile(),'DELIVERY_FILE','Retain ordinary original files: '+name);out.push(name);}
  }return out;
}
export function originalSourceClosure(sourceRoot,manifest){
  const root=realpathSync(sourceRoot),selected=new Map(manifest.files.map(r=>[r.path,r])),queue=[...selected.keys()];
  for(let at=0;at<queue.length;at++){
    const path=queue[at];if(!/\.[cm]?js$/.test(path))continue;
    const content=readFileSync(sourcePath(root,path),'utf8');
    const references=[...content.matchAll(/(?:\bfrom\s*|\bimport\s*\(\s*|\bimport\s*|\bexport\s*[^;]*?\bfrom\s*)['"](\.[^'"]+)['"]/g)].map(m=>m[1]);
    for(const ref of references){
      const absolute=resolve(root,dirname(path),ref),p=relative(root,absolute).split(sep).join('/');
      assert(!p.startsWith('../')&&!p.startsWith('/'),'SOURCE_PATH','A relative dependency escaped the original repository.');
      if(selected.has(p))continue;
      const bytes=readFileSync(sourcePath(root,p));selected.set(p,{path:p,bytes:bytes.length,sha256:digest(bytes)});queue.push(p);
    }
  }
  return [...selected.values()].sort((a,b)=>a.path.localeCompare(b.path));
}
function addFile(stage,name,body,files){
  assert(!files.some(r=>r.path===name),'DELIVERY_DUPLICATE','A full delivery repeats a member.');
  putOriginal(join(stage,name),body);files.push({path:name,bytes:body.length,sha256:digest(body),mode:'0600'});
}
function originalRuntime(connection,kind){
  const decoder=kind==='decoder',root=connection[decoder?'decoderRuntimeRoot':'runtimeRoot'],files=connection[decoder?'decoderRuntimeFiles':'runtimeFiles'];
  assert(root&&Array.isArray(files)&&files.length,'RUNTIME_SELECTION','Complete receiving needs the original '+kind+' runtime root and every installed dependency member.',409);
  inspectPublisher(root,files);return {root:realpathSync(root),files};
}
export async function pythonArchive(args,{python=process.env.ROZO_PYTHON??'python3',signal}={}){
  const child=spawn(python,['-B',fileURLToPath(new URL('./archive.py',import.meta.url)),...args],{stdio:['ignore','pipe','pipe']});
  let output='',error='';child.stdout.on('data',c=>{if(output.length<1024*1024)output+=c;});child.stderr.on('data',c=>{if(error.length<1024*1024)error+=c;});
  const stop=()=>child.kill('SIGTERM');signal?.addEventListener('abort',stop,{once:true});
  try{const code=await new Promise((resolve,reject)=>{child.once('error',reject);child.once('close',resolve);});assert(code===0,'ARCHIVE_FAILED','The original archive command did not complete.',500,{code,stderr:error});return JSON.parse(output);}
  finally{signal?.removeEventListener('abort',stop);}
}
export function deliveryDescriptor(workspace,deliveryId){
  id(deliveryId);const path=join(workspace.directory,'deliveries',deliveryId,'EXPORT.json');if(!existsSync(path))return null;
  const receipt=JSON.parse(readFileSync(path)),zip=join(workspace.directory,'deliveries',deliveryId,'Rozo_Workspace.zip');
  assert(receipt.deliveryId===deliveryId&&receipt.workspaceId===workspace.meta().workspaceId,'DELIVERY_IDENTITY','The retained delivery belongs to another workspace.',409);
  assert(lstatSync(zip).isFile()&&!lstatSync(zip).isSymbolicLink()&&lstatSync(zip).size===receipt.bytes,'DELIVERY_FILE','The actual retained archive size differs.');
  return {...receipt,path:zip};
}
export async function buildDelivery(workspace,request,{sourceRoot,sourceManifest,sourceIdentity,configuration,publisherSelections,python,signal}){
  const original=request.intent;assert(original?.deliveryId&&original.sourceSha256===sourceIdentity.manifestSha256,'DELIVERY_SOURCE','Resume with the exact original prepared application source.',409);
  const known=deliveryDescriptor(workspace,original.deliveryId);if(known)return known;
  const directory=join(workspace.directory,'deliveries',original.deliveryId),stage=join(directory,'contents');mkdirSync(stage,{recursive:true,mode:0o700});
  return withLease(workspace,'native-files',async()=>{
    const existing=join(stage,'DELIVERY.json');
    if(!existsSync(existing)){
      const files=[],selection=inspectRozoSource(sourceRoot,sourceManifest,sourceIdentity.manifestSha256),manifest=JSON.parse(readFileSync(sourceManifest));
      const sourceFiles=originalSourceClosure(sourceRoot,manifest);
      for(const row of sourceFiles){const bytes=readFileSync(sourcePath(sourceRoot,row.path));assert(bytes.length===row.bytes&&digest(bytes)===row.sha256,'SOURCE_IDENTITY','The original source changed while exporting.',409);addFile(stage,'source/'+row.path,bytes,files);}
      addFile(stage,'source/'+ROOT+'/INSTALLED_SOURCE.json',readFileSync(sourceManifest),files);
      addFile(stage,'workspace/workspace.json',readFileSync(join(workspace.directory,'workspace.json')),files);
      addFile(stage,'workspace/RECEIVING.json',Buffer.from(canonical({schema:'stellar-forge.rozo-receiving-marker.v1',mode:original.mode,deliveryId:original.deliveryId,requestId:request.id,workspaceId:workspace.meta().workspaceId,originId:workspace.meta().originId})+'\n'),files);
      for(const name of ordinaryFiles(join(workspace.directory,'cli-requests')))addFile(stage,'workspace/cli-requests/'+name,readFileSync(sourcePath(join(workspace.directory,'cli-requests'),name)),files);
      for(const name of ordinaryFiles(join(workspace.directory,'native')))addFile(stage,'workspace/native/'+name,readFileSync(sourcePath(join(workspace.directory,'native'),name)),files);
      const config=clone(configuration.config),originalConfig=configuration.raw??Buffer.from(canonical(configuration.config));
      assert(digest(originalConfig)===original.configurationSha256,'CONFIGURATION_CHANGED','Resume with the original prepared host configuration.',409);
      addFile(stage,'configuration/original.json',originalConfig,files);
      const received=clone(config),paths={};delete received.publisherSelectionsFile;
      for(const [alias,c]of Object.entries(received.connections)){
        if(c.sourceRoot){
          const selected=publisherSelections[c.publisher];assert(selected?.length,'PUBLISHER_SELECTION','Retain the complete original publisher selection.');
          inspectPublisher(c.sourceRoot,selected);const target='publishers/'+alias;
          for(const row of selected)addFile(stage,target+'/'+row.path,readFileSync(sourcePath(c.sourceRoot,row.path)),files);
          paths[alias]={sourceRoot:target};c.sourceRoot='@ROOT/'+target;
        }
        if(c.modulePath){
          const runtime=originalRuntime(c,'sdk'),prefix='runtimes/'+alias+'/sdk';
          for(const row of runtime.files)addFile(stage,prefix+'/'+row.path,readFileSync(sourcePath(runtime.root,row.path)),files);
          const member=relative(runtime.root,realpathSync(c.modulePath)).split(sep).join('/');
          assert(runtime.files.some(r=>r.path===member),'RUNTIME_ENTRY','The original SDK entry is outside its complete runtime selection.');
          c.modulePath='@ROOT/'+prefix+'/'+member;c.runtimeRoot='@ROOT/'+prefix;
        }
        if(c.decoderModule){
          const runtime=originalRuntime(c,'decoder'),prefix='runtimes/'+alias+'/decoder';
          for(const row of runtime.files)addFile(stage,prefix+'/'+row.path,readFileSync(sourcePath(runtime.root,row.path)),files);
          for(const key of ['decoderModule','decoderPackageJson']){const member=relative(runtime.root,realpathSync(c[key])).split(sep).join('/');assert(runtime.files.some(r=>r.path===member),'RUNTIME_ENTRY','The original decoder entry is outside its runtime selection.');c[key]='@ROOT/'+prefix+'/'+member;}
          c.decoderRuntimeRoot='@ROOT/'+prefix;
        }
      }
      addFile(stage,'configuration/received-template.json',Buffer.from(canonical(received)+'\n'),files);
      const database=join(stage,'workspace','rozo.sqlite3');let captured;
      if(existsSync(database)){
        const snapshot=new RozoWorkspace(join(stage,'workspace'),{readOnly:true});try{captured=snapshot.meta();assert(captured.workspaceId===workspace.meta().workspaceId,'WORKSPACE_IDENTITY','The retained checkpoint belongs to another workspace.');if(original.mode==='handover')assert(captured.revision===request.result.revision,'HANDOVER_REVISION','The sealed handover checkpoint differs from its original accepted revision.');}finally{snapshot.close();}
      }else captured=await workspace.exportDatabase(database);
      const body=hashOriginalFile(database);files.push({path:'workspace/rozo.sqlite3',...body,mode:'0600'});
      const sourceMarker=JSON.parse(readFileSync(join(stage,'workspace','workspace.json')));
      const nativeMeta=new RozoWorkspace(join(stage,'workspace'),{readOnly:true});let meta;try{meta=nativeMeta.meta();}finally{nativeMeta.close();}
      const delivery={schema:DELIVERY_SCHEMA,deliveryId:original.deliveryId,mode:original.mode,title:original.title,workspace:{...sourceMarker,revision:meta.revision},operation:{requestId:request.id,fingerprint:request.fingerprint,acceptedRevision:request.result.revision},sourceIdentity:selection,configurationSha256:original.configurationSha256,publisherLocations:paths,files:files.sort((a,b)=>a.path.localeCompare(b.path))};
      putOriginal(existing,Buffer.from(canonical(delivery)+'\n'));
    }
    const packed=await pythonArchive(['pack','--directory',stage,'--out',join(directory,'Rozo_Workspace.zip')],{python,signal});
    const manifestRaw=readFileSync(existing),manifest=JSON.parse(manifestRaw);
    const receipt={schema:'stellar-forge.rozo-export-receipt.v1',deliveryId:original.deliveryId,workspaceId:manifest.workspace.workspaceId,originId:manifest.workspace.originId,revision:manifest.workspace.revision,mode:original.mode,requestId:request.id,bytes:packed.bytes,sha256:packed.sha256,manifestSha256:digest(manifestRaw),name:'Rozo_Workspace.zip'};
    putOriginal(join(directory,'EXPORT.json'),Buffer.from(canonical(receipt)+'\n'));return {...receipt,path:packed.path};
  });
}
export async function receiveDelivery(archive,directory,{sha256,activate=false,actor='receiving operator',requestId,python}={}){
  assert(sha256,'ARCHIVE_IDENTITY','Select the exact saved archive SHA-256.');
  const existingRoot=resolve(directory),receivedReceipt=join(existingRoot,'RECEIVED_ARCHIVE.json'),manifestFile=join(existingRoot,'DELIVERY.json');
  if(activate&&requestId&&existsSync(receivedReceipt)&&existsSync(manifestFile)){
    const custody=JSON.parse(readFileSync(receivedReceipt)),manifestRaw=readFileSync(manifestFile),m=JSON.parse(manifestRaw);
    assert(custody.sha256===sha256&&custody.manifestSha256===digest(manifestRaw),'RECEIVE_IDENTITY','The retained archive custody differs from this original receiving.',409);
    const check=new RozoWorkspace(join(existingRoot,'workspace'),{readOnly:true});let accepted;
    try{
      const envelope={workspaceId:m.workspace.workspaceId,requestId,expectedRevision:m.workspace.revision,actor,command:'workspace.receive',payload:{archiveSha256:sha256,manifestSha256:digest(manifestRaw),deliveryId:m.deliveryId}};
      const original=check.replay(envelope);if(original?.state==='accepted')accepted=original.result;
    }finally{check.close();}
    if(accepted){
      const sourceRoot=join(existingRoot,'source');inspectRozoSource(sourceRoot,join(sourceRoot,ROOT,'INSTALLED_SOURCE.json'),m.sourceIdentity.manifestSha256);
      putOriginal(join(existingRoot,'ACTIVATED.json'),Buffer.from(canonical(accepted)+'\n'));
      return {schema:'stellar-forge.rozo-received.v1',directory:existingRoot,sha256,original:m.workspace,active:true,reused:true,activation:accepted,sourceRoot,workspaceDirectory:join(existingRoot,'workspace'),configuration:join(existingRoot,'configuration','connections.json'),cli:join(sourceRoot,ROOT,'cli.mjs')};
    }
  }
  const received=await pythonArchive(['receive','--archive',archive,'--directory',directory,'--sha256',sha256],{python});
  const root=realpathSync(directory),raw=readFileSync(join(root,'DELIVERY.json')),manifest=JSON.parse(raw),sourceRoot=join(root,'source'),sourceManifest=join(sourceRoot,ROOT,'INSTALLED_SOURCE.json');
  inspectRozoSource(sourceRoot,sourceManifest,manifest.sourceIdentity.manifestSha256);
  const workspace=new RozoWorkspace(join(root,'workspace'),{readOnly:true});let original;
  try{original=workspace.meta();assert(original.workspaceId===manifest.workspace.workspaceId&&original.originId===manifest.workspace.originId&&original.revision===manifest.workspace.revision,'RECEIVE_IDENTITY','The complete native checkpoint differs from its original manifest.');const req=workspace.request(manifest.operation.requestId);assert(req?.state==='accepted'&&req.fingerprint===manifest.operation.fingerprint,'RECEIVE_REQUEST','The original export request is not retained.');}finally{workspace.close();}
  const config=JSON.parse(readFileSync(join(root,'configuration','received-template.json')));
  for(const c of Object.values(config.connections))for(const key of ['sourceRoot','modulePath','runtimeRoot','decoderModule','decoderPackageJson','decoderRuntimeRoot'])if(c[key]?.startsWith('@ROOT/'))c[key]=join(root,c[key].slice(6));
  config.publisherSelectionsFile=join(sourceRoot,ROOT,'publishers.json');
  putOriginal(join(root,'configuration','connections.json'),Buffer.from(canonical(config)+'\n'));
  if(activate){
    assert(manifest.mode==='handover','WORKING_COPY','A working snapshot opens for review. Activation requires the original sender’s explicit sealed handover.',409);
    id(requestId,'receiving requestId');text(actor,'receiving actor');
    const w=new RozoWorkspace(join(root,'workspace'),{receivingActivation:{deliveryId:manifest.deliveryId}});
    try{
      const control=w.get('control','operator')?.value;assert(control?.mode==='sealed'&&control.requestId===manifest.operation.requestId,'RECEIVE_SEAL','The original sender’s sealed request differs.',409);
      const leases=w.db.prepare('SELECT * FROM leases ORDER BY name').all();
      const envelope={workspaceId:original.workspaceId,requestId,expectedRevision:original.revision,actor,command:'workspace.receive',payload:{archiveSha256:sha256,manifestSha256:digest(raw),deliveryId:manifest.deliveryId}};
      const result=w.commit(envelope,context=>{const custody=context.put('receiving',{id:requestId,archiveSha256:sha256,manifestSha256:digest(raw),original:clone(original),leases:JSON.parse(JSON.stringify(leases)),sourceRoot,receivedAt:context.at});w.db.prepare('DELETE FROM leases').run();context.put('control',{id:'operator',mode:'active',sourceDelivery:manifest.deliveryId,activationRequestId:requestId});return {custody};});
      putOriginal(join(root,'ACTIVATED.json'),Buffer.from(canonical(result)+'\n'));
    }finally{w.close();}
  }
  return {schema:'stellar-forge.rozo-received.v1',...received,original,active:activate,sourceRoot,workspaceDirectory:join(root,'workspace'),configuration:join(root,'configuration','connections.json'),cli:join(sourceRoot,ROOT,'cli.mjs')};
}
