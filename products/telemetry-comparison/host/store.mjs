// MIT. One physical private writer; exact requests and immutable editions precede the atomic current pointer.
import {join,dirname} from 'node:path';
import {randomUUID} from 'node:crypto';
import {readdir} from 'node:fs/promises';
import {acquirePrivateDirectoryWriter} from '../../../stellar/scf-starforge-20261009/sf30-seller-sdk/operations/history.mjs';
import {privateDirectory,readJSON,writeJSON,writeBytes,need} from './io.mjs';
import {sessions,applyDomain,codec} from '../runtime.mjs';
import modelModule from './model.cjs';
export const model=modelModule.createManagedModel({sessions,applyDomain,codec});
export async function initializeStore(directory,carrier,installationId=randomUUID()){
 await privateDirectory(dirname(directory));const identity=await privateDirectory(directory,{create:true}),lease=await acquirePrivateDirectoryWriter(directory);
 try{
  let prior;try{prior=(await readJSON(join(directory,'state.json'))).value;}catch(e){if(e.code!=='ENOENT')throw e;}
  need(!prior,'TELEMETRY_EXISTS','Receive into an unused private directory; adopt through the existing writer to retain history.',409);
  const state=model.initial(installationId,carrier);
  for(const sub of ['editions','requests','exports'])await privateDirectory(join(directory,sub),{create:true});
  await writeJSON(join(directory,'editions',model.hash(state)+'.json'),state);
  await writeJSON(join(directory,'state.json'),state);return model.view(state);
 }finally{await lease.release();}
}
export async function openStore(directory){
 const identity=await privateDirectory(directory),lease=await acquirePrivateDirectoryWriter(directory);let current,tail=Promise.resolve(),closing=false,closed;
 const sameDirectory=async()=>{const next=await privateDirectory(directory);need(next.dev===identity.dev&&next.ino===identity.ino,'TELEMETRY_DIRECTORY_CHANGED','The physical original managed directory moved or was replaced.',409);};
 const reload=async()=>{await sameDirectory();const next=model.validate((await readJSON(join(directory,'state.json'))).value);need(!current||next.installationId===current.installationId,'TELEMETRY_INSTALLATION_CHANGED','The managed installation identity changed.',409);current=next;return next;};
 try{await reload();for(const sub of ['editions','requests','exports'])await privateDirectory(join(directory,sub));}catch(e){await lease.release();throw e;}
 const queue=fn=>{need(!closing,'TELEMETRY_CLOSING','The original writer is closing.',409);const p=tail.then(fn);tail=p.catch(()=>{});return p;};
 const readRecord=async row=>{await sameDirectory();return (await readJSON(join(directory,'requests',row.recordSha256+'.json'))).value;};
 const commit=async planned=>{
  await sameDirectory();await writeJSON(join(directory,'requests',planned.recordSha256+'.json'),planned.record);
  await sameDirectory();await writeJSON(join(directory,'editions',model.hash(planned.next)+'.json'),planned.next);
  await sameDirectory();await writeJSON(join(directory,'state.json'),planned.next,{replace:true});current=planned.next;
 };
 return {directory,identity,id:current.installationId,
  state:()=>queue(async()=>model.view(await reload())),
  summary:()=>queue(async()=>{const s=await reload(),w=s.carrier.session.workspace;return {installationId:s.installationId,sha256:model.hash(s),sequence:s.sequence,workspaceId:w.initial.id,label:w.initial.title,rootSha256:w.rootSha256,originals:w.sources.length,editions:w.editions.length,reviews:w.reviews.length,requests:s.receipts.length,rejectedRequests:s.rejections.length,backups:s.carrier.session.backups.length};}),
  requestStatus:r=>queue(async()=>{const state=await reload(),p=model.prior(state,r);return p.entry?model.record(state,r,await readRecord(p.entry)):{outcome:'UNRECORDED',state:model.view(state),requestSha256:p.requestSha256};}),
  apply:r=>queue(async()=>{
   const state=await reload(),p=model.prior(state,r);
   if(p.entry)return model.record(state,r,await readRecord(p.entry));
   let planned;
   // Only pure validation has definitely made no managed commit. I/O failures stay ambiguous.
   try{planned=model.plan(state,r);}catch(e){planned=model.reject(state,r,e);await commit(planned);return {...model.record(current,r,planned.record),reused:false};}
   await commit(planned);return {...model.record(current,r,planned.record),reused:false};
  }),
  retainedRecord:id=>queue(async()=>{const state=await reload(),row=[...state.receipts,...state.rejections].find(r=>r.id===id);need(row,'TELEMETRY_REQUEST','Choose an original request.',404);return readRecord(row);}),
  export: (expectedSha256,build)=>queue(async()=>{const state=await reload();need(model.hash(state)===expectedSha256,'TELEMETRY_BASE_CHANGED','Select the exact saved edition to export.',409);const records=[],editions=[];for(const sub of ['requests','editions'])for(const name of (await readdir(join(directory,sub))).sort()){need(/^[a-f0-9]{64}\.json$/.test(name),'TELEMETRY_HISTORY','Unexpected retained history file.');await sameDirectory();const value=(await readJSON(join(directory,sub,name))).value;need(model.hash(value)===name.slice(0,-5),'TELEMETRY_HISTORY','Retained complete history changed.',409);(sub==='requests'?records:editions).push({id:name.slice(0,-5),value});}const bytes=await build(model.view(state),records,editions);await sameDirectory();const id=codec.sha256Bytes(bytes);await writeBytes(join(directory,'exports',id+'.zip'),bytes);return {fileId:id,sha256:id,bytes:bytes.length,installationId:state.installationId,editionSha256:expectedSha256,sequence:state.sequence};}),
  close:()=>closed||(closing=true,closed=(async()=>{await tail;await lease.release();})())
 };
}
