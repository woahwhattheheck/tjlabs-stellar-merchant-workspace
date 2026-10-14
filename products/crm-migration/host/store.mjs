// MIT. One source-owned writer; original CRM operations remain the engine.
import {join} from 'node:path';
import {acquirePrivateDirectoryWriter} from '../../../stellar/scf-starforge-20261009/sf30-seller-sdk/operations/history.mjs';
import runtime from '../runtime/crm-runtime.cjs';
import {privateDirectory,readJSON,writeJSON,writeBytes,json,sha,need} from './io.mjs';
const {workspace:model,comparison,exportFiles}=runtime;
export const summary=ws=>({id:ws.id,title:ws.title,revision:ws.revision,sha256:comparison.digest(ws),
 sources:Object.values(ws.sourceWorkspace.sources).map(s=>({id:s.id,filename:s.filename,role:s.role,edition:s.edition,bytes:s.bytes,sha256:s.sha256,records:s.table.rows.length})),
 configurations:Object.values(ws.contracts).map(c=>({id:c.id,title:c.title})),
 runs:Object.values(ws.runs).map(r=>({id:r.id,title:r.title,findings:r.output.findings.length,decision:r.decision}))});
export async function openStore(directory){
 const identity=await privateDirectory(directory),lease=await acquirePrivateDirectoryWriter(identity.path);
 try{
 await privateDirectory(join(directory,'editions'),{create:true});
 await privateDirectory(join(directory,'exports'),{create:true});
 let ws=model.restore((await readJSON(join(directory,'workspace.json'))).value),tail=Promise.resolve(),closing=false,closed;
 const originalId=ws.id;
 async function originalDirectory(){const current=await privateDirectory(directory);need(current.dev===identity.dev&&current.ino===identity.ino,'CRM_DIRECTORY_CHANGED','The original workspace directory was moved or replaced.',409);}

 async function reload(){await originalDirectory();const next=model.restore((await readJSON(join(directory,'workspace.json'))).value);need(next.id===originalId,'CRM_WORKSPACE_CHANGED','Original workspace identity changed.',409);ws=next;return ws;}
 const run=fn=>{need(!closing,'CRM_CLOSING','The original workspace is closing.',409);const task=tail.then(fn);tail=task.catch(()=>{});return task;};
 async function save(next){model.validate(next);need(next.id===ws.id,'CRM_WORKSPACE_CHANGED','Keep the original workspace identity.',409);
 const archive=model.archive(next);await originalDirectory();await writeJSON(join(directory,'editions',archive.sha256+'.json'),archive);
 await originalDirectory();await writeJSON(join(directory,'workspace.json'),archive,{replace:true});ws=next;return archive;}
 return {directory,identity,get id(){return ws.id;},
 state:()=>run(async()=>model.archive(await reload())),summary:()=>run(async()=>summary(await reload())),
 action:op=>run(async()=>{await reload();
 const earlier=ws.operations.find(x=>x.id===op?.id);let next;
 try{next=model.apply(ws,op);}catch(e){throw Object.assign(e,{code:'CRM_OPERATION_REJECTED',status:409});}
 const archive=earlier?model.archive(ws):await save(next);
 return {archive,receipt:ws.operations.find(x=>x.id===op.id),reused:Boolean(earlier)};}),
 export:expected=>run(async()=>{await reload();need(expected===comparison.digest(ws),'CRM_REVISION_CHANGED','Select the complete current workspace hash for export.',409);
 const archive=model.archive(ws),files=exportFiles(ws),all={...files};
 all['EXPORT_MANIFEST.json']=json({schema:'crm-migration.customer-files.v1',workspace:ws.id,revision:ws.revision,workspaceSha256:archive.sha256,
 files:Object.entries(files).map(([path,text])=>({path,bytes:Buffer.byteLength(text),sha256:sha(Buffer.from(text))}))});
 const packed=Buffer.from(runtime.zipper.zip(all)),hash=sha(packed);await originalDirectory();const written=await writeBytes(join(directory,'exports',hash+'.zip'),packed);
 return {schema:'crm-migration.retained-export.v1',workspaceId:ws.id,workspaceSha256:archive.sha256,revision:ws.revision,fileId:hash,sha256:hash,bytes:written.bytes,filename:ws.id+'-r'+ws.revision+'.zip',contentType:'application/zip'};}),
 close(){if(closed)return closed;closing=true;return closed=(async()=>{await tail;await lease.release();})();}};
 }catch(e){await lease.release().catch(c=>{e.cleanupError=c;});throw e;}
}
export async function initializeStore(directory,archive){
 const ws=model.restore(archive),identity=await privateDirectory(directory,{create:true});
 const originalDirectory=async()=>{const current=await privateDirectory(directory);need(current.dev===identity.dev&&current.ino===identity.ino,'CRM_DIRECTORY_CHANGED','The receiving directory was moved or replaced.',409);};
 const lease=await acquirePrivateDirectoryWriter(directory);
 try{
 await originalDirectory();let previous;try{previous=(await readJSON(join(directory,'workspace.json'))).value;}catch(e){if(e.code!=='ENOENT')throw e;}
 if(previous){model.restore(previous);need(previous.sha256===archive.sha256,'CRM_RECEIVE_CONFLICT','This destination contains a different workspace or later edition.',409);return {...summary(ws),reused:true};}
 await privateDirectory(join(directory,'editions'),{create:true});await privateDirectory(join(directory,'exports'),{create:true});
 await originalDirectory();await writeJSON(join(directory,'editions',archive.sha256+'.json'),archive);await originalDirectory();await writeJSON(join(directory,'workspace.json'),archive);
 return {...summary(ws),reused:false};
 }finally{await lease.release();}
}
