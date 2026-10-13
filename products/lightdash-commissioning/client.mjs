// MIT. Authenticated SDK and resumable complete files using the original Merchant transport.
import path from 'node:path';
import {open,lstat,link,unlink} from 'node:fs/promises';
import {constants} from 'node:fs';
import {createHash} from 'node:crypto';
import {openMerchantFileClient} from '../../stellar-forge/mcp-merchant-operator/retained-download.mjs';
import {readProject,PROJECT_ALIAS} from './project.mjs';
import {SESSION_SCHEMA,TOKEN_ENV,MAX_FILE_BYTES,UUID,plain,exact,absolute,alias,uuid,identifier,sha,need,fault,
 privateDirectory,readBytes,json,exists,acquireWorkspace,digest,objectDigest,saveJson,fileIdentity} from './common.mjs';

const CHUNK=131072;
function endpoint(value){
 const u=new URL(value);need(!u.username&&!u.password&&!u.hash&&!u.search&&
  (u.protocol==='https:'||(u.protocol==='http:'&&['127.0.0.1','[::1]'].includes(u.hostname))),
 'LIGHTDASH_CLIENT_URL','Use the original authenticated HTTPS endpoint or loopback HTTP listener.');
 return u.href;
}
export async function connectLightdash({url,tokenEnv='MCP_ACCESS_TOKEN',environment=process.env,workspace=PROJECT_ALIAS,
 expectedWorkspaceId,expectedInstanceId,signal}={}){
 alias(workspace);uuid(expectedWorkspaceId);
 const transport=await openMerchantFileClient({url:endpoint(url),tokenEnv,environment,signal,
  errorPrefix:'LIGHTDASH_CLIENT',clientName:'lightdash-commissioning-project',maximumResponseBytes:32*1024*1024});
 let closed=false;const pending=new Set();
 const call=async(tool,args={},options={})=>{
  need(!closed,'LIGHTDASH_CLIENT_CLOSED','This client is closed.');
  need(typeof tool==='string'&&tool.startsWith('merchant_lightdash_')&&plain(args),'LIGHTDASH_CLIENT_TOOL','Use a commissioning tool.');
  const selected=tool==='merchant_lightdash_workspaces'?args:{workspace,...args};
  need(!Object.hasOwn(selected,'workspace')||selected.workspace===workspace,'LIGHTDASH_CLIENT_WORKSPACE','This client is bound to one original workspace.');
  const p=Promise.resolve().then(()=>transport.call(tool,selected,{requestSignal:options.signal??signal,timeoutMs:options.timeoutMs??120000}));
  pending.add(p);try{return await p;}finally{pending.delete(p);}
 };
 const catalog=await call('merchant_lightdash_workspaces');
 const current=catalog.workspaces?.find(x=>x.workspace===workspace);
 need(current?.workspaceId===expectedWorkspaceId&&(!expectedInstanceId||current.instanceId===expectedInstanceId),
  'LIGHTDASH_CLIENT_IDENTITY','The authenticated endpoint is not this original workspace/instance.');
 const result={url,workspace,workspaceId:expectedWorkspaceId,current,call,
  async close(){closed=true;await Promise.allSettled([...pending]);if(typeof transport.close==='function')await transport.close();},
 };
 const methods={status:'status',inputs:'inputs',open:'open',closeWorkspace:'close',configure:'configure',intake:'intake',
  manifest:'manifest',select:'select',createDraft:'draft_create',selectDraft:'draft_select',editDraft:'draft_edit',seal:'seal',
  compare:'compare',review:'review',plan:'plan',operation:'operation',execute:'execute',inspect:'inspect',content:'content',
  createHandover:'handover_create',handoverStatus:'handover_status',inspectHandover:'handover_inspect',resumeHandover:'handover_resume',
  request:'request',readFile:'file_read',releaseFile:'file_release',
  operatingSource:'operating_source',operatingList:'operating_list',operatingRead:'operating_read',operatingCreate:'operating_create',operatingAdopt:'operating_adopt',
  operatingSave:'operating_save',operatingCapture:'operating_capture',operatingReceive:'operating_receive',operatingReturnPreview:'operating_return_preview',
  operatingReturnApply:'operating_return_apply',operatingExport:'operating_export',operatingRequest:'operating_request'};
 for(const [method,suffix]of Object.entries(methods))result[method]=(args={},options={})=>call('merchant_lightdash_'+suffix,args,options);
 result.waitOperation=async(operationId,{timeoutMs=120000,pollMs=1000,signal:waitSignal}={})=>{
  identifier(operationId);need(Number.isSafeInteger(timeoutMs)&&timeoutMs>=0&&timeoutMs<=3600000&&Number.isSafeInteger(pollMs)&&pollMs>=250&&pollMs<=10000,
   'LIGHTDASH_CLIENT_WAIT','Use a bounded foreground wait.');
  const deadline=Date.now()+timeoutMs;
  while(true){
   waitSignal?.throwIfAborted();const value=await result.operation({operationId},{signal:waitSignal});
   if(!value.pending&&!['PLANNED','RUNNING'].includes(value.operation?.status)||Date.now()>=deadline)return value;
   await new Promise((resolve,reject)=>{
    const done=()=>{waitSignal?.removeEventListener('abort',abort);resolve();};
    const timer=setTimeout(done,Math.min(pollMs,Math.max(1,deadline-Date.now())));
    const abort=()=>{clearTimeout(timer);waitSignal?.removeEventListener('abort',abort);reject(waitSignal.reason??new Error('Aborted'));};
    waitSignal?.addEventListener('abort',abort,{once:true});
   });
  }
 };
 return result;
}
export async function connectProject(directory,{signal}={}){
 const state=await readProject(absolute(directory)),session=await json(path.join(directory,'session.json'));
 need(session.schema===SESSION_SCHEMA&&session.phase==='OPEN'&&session.workspaceId===state.workspace.workspaceId&&
  session.workspaceIdentity===state.workspaceIdentity&&session.manifestSha256===state.installation.manifestSha256,
  'LIGHTDASH_PROJECT_NOT_RUNNING','Open this same installed project before connecting.');
 const token=(await readBytes(state.tokenFile,{maximum:256,privateFile:true})).toString('utf8').trim();
 need(digest(token)===state.tokenSha256,'LIGHTDASH_PROJECT_TOKEN_CHANGED','The prepared original token changed.');
 const client=await connectLightdash({url:session.mcpUrl,tokenEnv:TOKEN_ENV,environment:{[TOKEN_ENV]:token},
  expectedWorkspaceId:session.workspaceId,expectedInstanceId:session.authoringInstanceId,workspace:PROJECT_ALIAS,signal});
 return Object.assign(client,{project:state,session});
}
async function syncDirectory(directory){const fd=await open(directory,'r');try{await fd.sync();}finally{await fd.close();}}
async function prefix(handle,count){
 const hash=createHash('sha256'),buffer=Buffer.alloc(CHUNK);let offset=0;
 while(offset<count){const got=await handle.read(buffer,0,Math.min(CHUNK,count-offset),offset);need(got.bytesRead>0,'LIGHTDASH_DOWNLOAD_TRUNCATED','The retained partial file is truncated.');hash.update(buffer.subarray(0,got.bytesRead));offset+=got.bytesRead;}
 return hash;
}
function fileSelection(input){
 exact(input,['kind','editionId','draft','expectedDraftId','path','operationId','artifactId','handoverId','includeOperatorPrivate'],['kind']);
 need(['source','artifact','handover','handover-request'].includes(input.kind),'LIGHTDASH_DOWNLOAD_KIND','Select an original file kind.');
 return JSON.parse(JSON.stringify(input));
}
function checkedChunk(reply,selection,checkpoint,offset,client){
 need(reply?.workspace===client.workspace&&reply.workspaceId===client.workspaceId&&UUID.test(reply.readId??'')&&
  reply.selection?.kind===selection.kind&&plain(reply.file)&&Number.isSafeInteger(reply.file.bytes)&&reply.file.bytes>=0&&reply.file.bytes<=MAX_FILE_BYTES&&
  /^[a-f0-9]{64}$/.test(reply.file.sha256??'')&&typeof reply.file.name==='string'&&path.basename(reply.file.name)===reply.file.name&&
  reply.offset===offset&&reply.encoding==='base64'&&Number.isSafeInteger(reply.bytesRead)&&reply.bytesRead>=0&&reply.bytesRead<=CHUNK,
 'LIGHTDASH_DOWNLOAD_RESPONSE','The original retained file response changed.');
 for(const key of ['editionId','expectedDraftId','path','operationId','artifactId','handoverId'])
  need((reply.selection[key]??null)===(selection[key]??null),'LIGHTDASH_DOWNLOAD_SELECTION','The response belongs to another original file.');
 need(reply.selection.draft===(selection.draft===true),'LIGHTDASH_DOWNLOAD_SELECTION','The source draft selection changed.');
 if(checkpoint.file)need(objectDigest(reply.file)===objectDigest(checkpoint.file),'LIGHTDASH_DOWNLOAD_FILE_CHANGED','The original complete file identity changed.');
 if(checkpoint.expectedSha256)need(reply.file.sha256===checkpoint.expectedSha256,'LIGHTDASH_DOWNLOAD_HASH','The received original file is not the selected SHA256.');
 need(typeof reply.data==='string'&&reply.data.length===4*Math.ceil(reply.bytesRead/3)&&
  /^(?:[A-Za-z0-9+/]{4})*(?:[A-Za-z0-9+/]{2}==|[A-Za-z0-9+/]{3}=)?$/.test(reply.data),'LIGHTDASH_DOWNLOAD_ENCODING','The complete original chunk is not canonical base64.');
 const bytes=Buffer.from(reply.data,'base64'),next=offset+bytes.length;
 need(bytes.length===reply.bytesRead&&next<=reply.file.bytes&&reply.nextOffset===(next===reply.file.bytes?null:next)&&
  (bytes.length>0||next===reply.file.bytes),'LIGHTDASH_DOWNLOAD_OFFSET','The original file chunk has another byte position.');
 return bytes;
}
/** Resume complete native bytes with the original SHA/offset, even after a host/read-id restart. */
export async function downloadFile(client,{selection,outputDirectory,filename,expectedSha256,signal}={}){
 selection=fileSelection(selection);absolute(outputDirectory);need(typeof filename==='string'&&filename===path.basename(filename)&&filename!=='.'&&filename!=='..'&&!/[\\\0\r\n]/.test(filename),
  'LIGHTDASH_DOWNLOAD_NAME','Use one local destination filename.');
 if(expectedSha256)sha(expectedSha256);
 await privateDirectory(outputDirectory,true);const release=await acquireWorkspace(outputDirectory);
 let handle,readId=null,final=false;
 const key=digest(filename).slice(0,24),journal=path.join(outputDirectory,'.download-'+key+'.json'),
  target=path.join(outputDirectory,filename),partial=target+'.receiving-partial';
 try{
  const input={schema:'stellar-forge.lightdash-file-download.v1',workspaceId:client.workspaceId,workspace:client.workspace,
   selection,filename,expectedSha256:expectedSha256??null},inputSha256=objectDigest(input);
  let state=await exists(journal)?await json(journal):null;
  if(state)need(state.inputSha256===inputSha256,'LIGHTDASH_DOWNLOAD_INPUT_CHANGED','Continue the same retained original file selection.');
  else{need(!await exists(target)&&!await exists(partial),'LIGHTDASH_DOWNLOAD_UNOWNED','An existing destination needs its original receiving checkpoint.');
   state={...input,inputSha256,phase:'RECEIVING',offset:0,prefixSha256:digest(Buffer.alloc(0)),file:null};await saveJson(journal,state,{createOnly:true});}
  if(await exists(target)){
   need(state.file,'LIGHTDASH_DOWNLOAD_UNOWNED','The complete destination has no original file identity.');
   const actual=await fileIdentity(target);need(actual.bytes===state.file.bytes&&actual.sha256===state.file.sha256,'LIGHTDASH_DOWNLOAD_CHANGED','The completed original file changed.');
   if(await exists(partial)){const a=await lstat(target),b=await lstat(partial);need(a.isFile()&&b.isFile()&&a.dev===b.dev&&a.ino===b.ino,'LIGHTDASH_DOWNLOAD_PARTIAL_CONFLICT','Preserve an unrelated partial file.');await unlink(partial);await syncDirectory(outputDirectory);}
   const result={state:'COMPLETE',file:target,...actual,selection,workspaceId:client.workspaceId};await saveJson(journal,{...state,phase:'COMPLETE',result});return {...result,replayed:true};
  }
  need(state.phase!=='COMPLETE','LIGHTDASH_DOWNLOAD_MISSING','The completed original destination is absent.');
  handle=await open(partial,constants.O_RDWR|constants.O_CREAT|constants.O_NOFOLLOW,0o600);
  const info=await handle.stat();need(info.isFile()&&info.nlink===1&&(info.mode&0o077)===0&&info.size>=state.offset,
   'LIGHTDASH_DOWNLOAD_PARTIAL','The original private partial changed.');
  const hash=await prefix(handle,state.offset);need(hash.copy().digest('hex')===state.prefixSha256,'LIGHTDASH_DOWNLOAD_PREFIX','The retained original prefix changed.');
  if(info.size>state.offset){await handle.truncate(state.offset);await handle.sync();}
  while(!state.file||state.offset<state.file.bytes){
   signal?.throwIfAborted();
   const args={...selection,offset:state.offset,limit:CHUNK,...(readId?{readId}:{}),
    ...(state.file||expectedSha256?{expectedSha256:state.file?.sha256??expectedSha256}:{})};
   let reply;
   try{reply=await client.readFile(args,{signal});}
   catch(error){if(!readId||!String(error.code??'').endsWith('_READ_NOT_FOUND'))throw error;readId=null;delete args.readId;reply=await client.readFile(args,{signal});}
   const bytes=checkedChunk(reply,selection,state,state.offset,client);readId=reply.readId;final=reply.nextOffset===null;
   if(!state.file){state={...state,file:reply.file};await saveJson(journal,state);}
   let offset=0;while(offset<bytes.length){const written=await handle.write(bytes,offset,bytes.length-offset,state.offset+offset);need(written.bytesWritten>0,'LIGHTDASH_DOWNLOAD_WRITE','The complete original chunk could not be written.');offset+=written.bytesWritten;}
   await handle.sync();hash.update(bytes);
   state={...state,offset:state.offset+bytes.length,prefixSha256:hash.copy().digest('hex')};await saveJson(journal,state);
  }
  need(state.prefixSha256===state.file.sha256,'LIGHTDASH_DOWNLOAD_HASH','The complete original file checksum differs.');
  await handle.close();handle=null;
  const actual=await fileIdentity(partial);need(actual.bytes===state.file.bytes&&actual.sha256===state.file.sha256,'LIGHTDASH_DOWNLOAD_HASH','The complete destination changed before publication.');
  await link(partial,target);await syncDirectory(outputDirectory);await unlink(partial);await syncDirectory(outputDirectory);
  const result={state:'COMPLETE',file:target,...actual,selection,workspaceId:client.workspaceId};
  await saveJson(journal,{...state,phase:'COMPLETE',result});return result;
 }finally{
  await handle?.close();
  if(readId&&!final)await client.releaseFile({readId},{timeoutMs:5000}).catch(()=>{});
  await release();
 }
}
/** Both files are original bytes. The UUID directory is the original packager read_request contract. */
export async function downloadHandover(client,{handoverId,outputDirectory,includeOperatorPrivate=false,signal}={}){
 uuid(handoverId);absolute(outputDirectory);
 const status=await client.handoverStatus({handoverId},{signal}),native=status.native;
 need(native?.state==='SUCCEEDED'&&native.request?.id===handoverId&&native.request.workspaceId===client.workspaceId,
  'LIGHTDASH_HANDOVER_NOT_READY','Finish the same original handover before receiving it.');
 const source=native.result?.archive;need(source&&source.bytes<=MAX_FILE_BYTES,'LIGHTDASH_HANDOVER_BOUNDS','The complete handover must fit the declared retained-file allowance.');
 const destination=path.join(outputDirectory,handoverId);
 const archive=await downloadFile(client,{selection:{kind:'handover',handoverId,includeOperatorPrivate},outputDirectory:destination,
  filename:'Lightdash_Commissioning_Handover.zip',expectedSha256:source.sha256,signal});
 const requestFile=await downloadFile(client,{selection:{kind:'handover-request',handoverId,includeOperatorPrivate},outputDirectory:destination,filename:'request.json',signal});
 const request=await json(requestFile.file,{maximum:1024*1024,privateFile:true});
 need(objectDigest(request)===objectDigest(native.request),'LIGHTDASH_HANDOVER_REQUEST_CHANGED','The exact original request changed during complete receiving.');
 const result={schema:'stellar-forge.lightdash-handover-download.v1',state:'COMPLETE',workspaceId:client.workspaceId,handoverId,
  archive,requestFile,applicationManifestSha256:request.applicationSourceSha256,workspaceRevision:request.workspaceRevision,
  includeOperatorPrivate:request.includeOperatorPrivate};
 await saveJson(path.join(destination,'download.json'),result);return result;
}
