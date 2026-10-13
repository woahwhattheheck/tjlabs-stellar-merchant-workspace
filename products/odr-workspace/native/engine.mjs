// MIT. Source-selected ODR workspace engine; all record semantics are original core APIs.
import fs from 'node:fs/promises';
import {constants} from 'node:fs';
import path from 'node:path';
import {pathToFileURL,fileURLToPath} from 'node:url';
import {createHash,randomUUID} from 'node:crypto';
export const sha=b=>createHash('sha256').update(b).digest('hex');
const fail=(code,message,extra={})=>{throw Object.assign(new Error(message),{code,...extra});};
const need=(ok,code,message)=>ok||fail(code,message);
export async function readJSON(p){const h=await fs.open(p,constants.O_RDONLY|constants.O_NOFOLLOW);try{const st=await h.stat();need(st.isFile()&&st.size<=128*1024*1024,'ODR_FILE','Select a complete ordinary JSON file within 128 MiB.');const b=await h.readFile();return JSON.parse(new TextDecoder('utf-8',{fatal:true}).decode(b));}finally{await h.close();}}
export async function atomic(p,value){
 const body=typeof value==='string'?value:JSON.stringify(value,null,2)+'\n';
 const parent=path.dirname(p),temporary=path.join(parent,'.odr-'+randomUUID());
 const h=await fs.open(temporary,'wx',0o600);
 try{await h.writeFile(body);await h.sync();await h.close();await fs.rename(temporary,p);const d=await fs.open(parent,'r');try{await d.sync();}finally{await d.close();}}
 finally{await h.close().catch(()=>{});await fs.unlink(temporary).catch(e=>{if(e.code!=='ENOENT')throw e;});}
}
export async function loadEngine(source,application){
 const core=await import(pathToFileURL(path.join(source,'src/core.mjs')).href);
 const kernel=core.createWorkbench({hash:sha,uuid:randomUUID});
 need(application?.schema==='commons.odr-alpha-application.v1','ODR_SOURCE_SCHEMA','Select the complete original application source.');
 for(const [name,text]of Object.entries(application.files||{}))need(typeof text==='string'&&application.manifest[name]===sha(text),'ODR_SOURCE_CHANGED','Complete original application bytes differ.');
 need(Object.keys(application.files||{}).length===Object.keys(application.manifest||{}).length,'ODR_SOURCE_CHANGED','Complete original source membership differs.');
 const canonical=core.canonical,applicationDigest=sha(canonical(application));
 const selected=(a)=>a?.schema===application.schema&&canonical(a.files)===canonical(application.files)&&canonical(a.manifest)===canonical(application.manifest);
 function receive(envelope){const r=kernel.receiveHandover(envelope);return r;}
 function validate(envelope,{selectedSource=true}={}){const r=receive(envelope);if(selectedSource)need(selected(r.application),'ODR_SELECTED_SOURCE','The handover must retain this exact selected source edition.');return r;}
 function rebind(envelope){
  const r=receive(envelope);
  const next=selected(r.application)?r.application:{...application,received_application:r.application};
  return r.workspace.handover(next,r.working_drafts);
 }
 function preserve(before,after){
  validate(before);validate(after);
  const a=before.workspace,b=after.workspace;
  need(a.id===b.id&&a.operation===b.operation&&a.created_at===b.created_at,'ODR_WORKSPACE_CHANGED','Keep the original workspace identity, operation and creation.');
  need(b.revision>=a.revision&&b.history.length>=a.history.length&&b.events.length>=a.events.length,'ODR_HISTORY_REWIND','Keep complete original history before any onward changes.');
  need(canonical(b.history.slice(0,a.history.length))===canonical(a.history)&&canonical(b.events.slice(0,a.events.length))===canonical(a.events),'ODR_HISTORY_CHANGED','An original saved event or full record revision changed.');
  for(const [kind,rows]of Object.entries(a.records))for(const [id,row]of Object.entries(rows)){
   const next=b.records[kind]?.[id];
   need(next&&next.revision>=row.revision&&(next.revision!==row.revision||canonical(next.value)===canonical(row.value)),'ODR_HEAD_REWIND','An original current record is missing, rewound or changed without a revision.');
  }
  if(before.application.received_application){
   const original=canonical(before.application.received_application);let retained=false,node=after.application.received_application;
   while(node){if(canonical(node)===original){retained=true;break;}node=node.received_application;}
   need(retained,'ODR_SOURCE_LINEAGE_CHANGED','Preserve the original received application lineage.');
  }
  need(canonical(a.records.sources)===canonical(Object.fromEntries(Object.keys(a.records.sources).map(id=>[id,b.records.sources[id]]))),'ODR_SOURCE_RECORD_CHANGED','Retain each original immutable source edition.');
 }
 return {core,kernel,canonical,application,applicationDigest,selected,receive,validate,rebind,preserve};
}
export async function installedEngine(root){
 const installation=await readJSON(path.join(root,'installation.json'));
 need(installation.directory===root&&installation.schema==='stellar-forge.odr-installation.v1','ODR_INSTALLATION_CHANGED','The selected original installation moved or changed.');
 const edition=path.join(root,'editions',installation.source_identity),application=await readJSON(path.join(edition,'APPLICATION.json'));
 const engine=await loadEngine(path.join(edition,'source'),application);
 const currentPath=path.join(root,'workspace','CURRENT.json');
 const handover=await readJSON(currentPath);engine.validate(handover);
 need(handover.workspace.id===installation.workspace_id,'ODR_WORKSPACE_CHANGED','The selected original workspace identity changed.');
 return {root,installation,edition,application,engine,currentPath,handover};
}
export async function commitHandover(ctx,submitted,expectedDigest){
 ctx.engine.validate(submitted);
 need(typeof expectedDigest==='string'&&/^[a-f0-9]{64}$/.test(expectedDigest),'ODR_EXPECTED_DIGEST','Select the original complete handover digest.');
 const payloadDigest=submitted.payload_sha256,key=sha(expectedDigest+'\0'+payloadDigest);
 const journal=path.join(ctx.root,'workspace','commits',key);await fs.mkdir(journal,{recursive:true,mode:0o700});
 const request={expectedDigest,payloadDigest,installationId:ctx.installation.installation_id,sourceIdentity:ctx.installation.source_identity,handover:submitted};
 const requestPath=path.join(journal,'REQUEST.json'),commitPath=path.join(journal,'COMMIT.json'),resultPath=path.join(journal,'RESULT.json');
 let retained;try{retained=await readJSON(requestPath);}catch(e){if(e.code!=='ENOENT')throw e;await atomic(requestPath,request);retained=request;}
 need(ctx.engine.canonical(retained)===ctx.engine.canonical(request),'ODR_REQUEST_CHANGED','Keep the exact pending original save payload and expected digest.');
 let result;try{result=await readJSON(resultPath);}catch(e){if(e.code!=='ENOENT')throw e;}
 let current=await readJSON(ctx.currentPath);ctx.engine.validate(current);
 if(result){ctx.engine.preserve(submitted,current);return result;}
 let commit;try{commit=await readJSON(commitPath);}catch(e){if(e.code!=='ENOENT')throw e;}
 if(!commit){
  if(current.payload_sha256===payloadDigest){
   const all=await fs.readdir(path.dirname(journal),{withFileTypes:true});
   for(const entry of all){if(!entry.isDirectory()||entry.name===key)continue;let old;
    try{old=await readJSON(path.join(path.dirname(journal),entry.name,'COMMIT.json'));}catch(err){if(err.code==='ENOENT')continue;throw err;}
    const r=old.receipt;
    if(r?.payloadDigest===payloadDigest&&r.installationId===ctx.installation.installation_id&&r.sourceIdentity===ctx.installation.source_identity){
     need(ctx.engine.canonical(old.request.handover)===ctx.engine.canonical(submitted),'ODR_PAYLOAD_CHANGED','The committed payload identity differs from its original bytes.');
     await atomic(commitPath,{request,receipt:r});await atomic(resultPath,r);return r;
    }
   }
  }
  if(current.payload_sha256!==expectedDigest&&current.payload_sha256!==payloadDigest)
   fail('ODR_REVISION_CONFLICT','The installed workspace changed. Receive the complete current handover explicitly before reconciling this retained draft.',{currentDigest:current.payload_sha256,currentHandover:current});
  ctx.engine.preserve(current,submitted);
  result={schema:'commons.odr-installed-save.v1',installationId:ctx.installation.installation_id,workspaceId:submitted.workspace.id,sourceIdentity:ctx.installation.source_identity,payloadDigest,currentDigest:payloadDigest,revision:submitted.workspace.revision,committedAt:new Date().toISOString()};
  commit={request,receipt:result};await atomic(commitPath,commit);
 }else{
  need(ctx.engine.canonical(commit.request)===ctx.engine.canonical(request),'ODR_REQUEST_CHANGED','The retained commit belongs to another original save.');result=commit.receipt;
 }
 if(current.payload_sha256===expectedDigest){ctx.engine.preserve(current,submitted);await atomic(ctx.currentPath,submitted);}
 else if(current.payload_sha256!==payloadDigest){ctx.engine.preserve(submitted,current);}
 await atomic(resultPath,result);return result;
}
export async function execute(input){
 const {source,application,operation,args={}}=input;
 if(operation==='validate'){const e=await loadEngine(source,application),h=await readJSON(args.handover);e.validate(h);return{workspace_id:h.workspace.id,revision:h.workspace.revision,digest:h.payload_sha256};}
 if(operation==='initialize'){
  const e=await loadEngine(source,application);
  const envelope=args.handover?e.rebind(await readJSON(args.handover)):e.kernel.workspace().handover(application,null);
  e.validate(envelope);await atomic(args.output,envelope);
  return {workspace_id:envelope.workspace.id,revision:envelope.workspace.revision,digest:envelope.payload_sha256,application_sha256:e.applicationDigest};
 }
 if(operation==='rebind'){
  const e=await loadEngine(source,application),old=await readJSON(args.handover),envelope=e.rebind(old);
  e.validate(envelope);need(envelope.workspace.id===old.workspace.id&&e.canonical(envelope.workspace)===e.canonical(old.workspace),'ODR_REBIND_CHANGED','Source adoption must preserve the complete original workspace.');
  await atomic(args.output,envelope);return{workspace_id:envelope.workspace.id,revision:envelope.workspace.revision,digest:envelope.payload_sha256,application_sha256:e.applicationDigest};
 }
 const ctx=await installedEngine(args.directory),{engine:e,handover:h}=ctx;
 if(operation==='inspect')return{workspace_id:h.workspace.id,revision:h.workspace.revision,digest:h.payload_sha256,source_files:Object.keys(e.application.files).length,application_sha256:e.applicationDigest,records:Object.fromEntries(Object.entries(h.workspace.records).map(([k,v])=>[k,Object.keys(v).length])),history_rows:h.workspace.history.length};
 if(operation==='workspace.receive')return commitHandover(ctx,await readJSON(args.file),args.expected_digest);
 if(operation==='workspace.state')return h.workspace;
 if(operation==='workspace.handover')return h;
 const ws=e.receive(h).workspace;
 if(operation==='workspace.record')return ws.get(args.kind,args.id);
 if(operation==='workspace.history')return ws.history(args.kind,args.id);
 if(operation==='workspace.comparison')return ws.comparison(args.ids,args.baseline_id);
 if(operation==='workspace.export'){
  if(args.kind==='workspace')await atomic(args.output,JSON.stringify(h,null,2)+'\n');
  else if(args.kind==='report')await atomic(args.output,e.core.renderReport(h.workspace));
  else if(args.kind==='application')await atomic(args.output,JSON.stringify(h.application,null,2)+'\n');
  else fail('ODR_EXPORT_KIND','Select workspace, report or application.');
  const b=await fs.readFile(args.output);return{path:args.output,bytes:b.length,sha256:sha(b),workspace_id:h.workspace.id,digest:h.payload_sha256};
 }
 fail('ODR_OPERATION','Select an original workspace operation.');
}
if(process.argv[1]&&path.resolve(process.argv[1])===path.resolve(fileURLToPath(import.meta.url))){
 try{let body='';for await(const b of process.stdin){body+=b;need(Buffer.byteLength(body)<=128*1024*1024,'ODR_REQUEST_LIMIT','Receive the complete request within 128 MiB.');}const value=await execute(JSON.parse(body));process.stdout.write(JSON.stringify({ok:true,result:value})+'\n');}
 catch(e){process.stdout.write(JSON.stringify({ok:false,error:{code:e.code||'ODR_ENGINE_FAILED',message:e.message,currentDigest:e.currentDigest,currentHandover:e.currentHandover}})+'\n');process.exitCode=1;}
}
