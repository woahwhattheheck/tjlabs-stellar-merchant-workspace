// MIT. Streaming directory preparation on the original Collection Review model.
import { open, mkdir, link, unlink, lstat, readdir, rename, readFile } from 'node:fs/promises';
import { constants } from 'node:fs';
import { resolve, dirname, basename, relative, sep, join, parse as parsePath } from 'node:path';
import { hostname } from 'node:os';
import { createHash, randomUUID } from 'node:crypto';
import { fileURLToPath } from 'node:url';
import { collectionDraft, openCollectionPacket, createCollectionExport, saveCollectionRevision } from './dist/collection-review-workspace.mjs';
import { applyMuseumAction, museumCanonical, MEDIA_ROLES } from './dist/museum-delivery.mjs';
import { prepareMuseumPackage, describeMuseumHandover } from './dist/museum-package.mjs';

const MUSEUM_RENDERED_INSTRUCTION="## Rendered product inspection — owner instruction, 2026-10-13\n\nThis applies to every current, future, resumed and delegated worker, across providers and local or cloud runtimes. Bryce's standing rule is: “that includes all attachments and this does not become review theatre or test theatre you need to literally observe the actual thing the way a user would see and use it”.\n\nBefore presenting a client/prospect-facing application, website, dashboard, demo, report, presentation, export or any attachment, the producing peer must open/run/render the exact outgoing version, LOOK at it and normally use it as the recipient would. View the actual screenshots you capture. Inspect the actual presentation/screenshare width and relevant narrow/mobile width, important user controls, populated/empty/loading/error states, downloads and reopened exports. Open the usable contents of ZIPs/projects and every applicable report/PDF page. Source review, schemas, HTTP 200, DOM counts, tests, checklists and another worker's approval cannot substitute for observing and using the actual product.\n\nFix broken, unstyled, cramped, clipped, overflowing or unreadable output within the authorized work before presenting it. Use plain industrial software design: readable tables, clear hierarchy, consistent typography and spacing, restrained controls, useful labels and responsive layouts. Preserve real workflows, source data and computations. Inspection must lead directly to repairs and continued delivery; it must not replace implementation/integration or become repeated checking. Keep validation focused on the actual remaining risk. Do not run broad test sweeps, repeat accepted checks, build a verification product or create review bureaucracy or an approval queue.\n\nFor video and audio, Bryce directs: “also add that if u make a video use voice gen tts not robot voices, use generative stuff we have models, use them”. Use available high-quality generative voice/TTS and useful generative media, with natural professional delivery. Actually watch/listen to the final outgoing export, including pacing, pronunciation, timing and audio alignment. Preserve existing spending, voice and attribution controls.\n\nInclude this complete instruction in delegated assignments and the active owner-controlled provider/project/cloud policy, boot, build and receiving guidance those workers actually read. Reuse already updated copies and return exact updated paths/version in the original policy thread with the next substantive result. Delivery of source does not establish that every runtime loaded it. Preserve all other owner controls and original operation identities; leave historical records and third-party/vendor policies intact. This instruction creates no restarts, watchers, credential gate or new release permission and does not revive owner-stopped work. When a runtime is unavailable, join the existing equipped receiver with the complete exact version and opening steps, review its actual rendered result, and continue independent implementation while it runs.\n\nOwner instruction and coordinated propagation: https://tokenjunkielabs.slack.com/archives/C0BU51F1PL3/p1791881496221999\nCanonical attachment/media clarification: https://tokenjunkielabs.slack.com/archives/C0BU51F1PL3/p1791885532614949\n";
const CHUNK=1024*1024, MAX_JSON=64*1024*1024, HASH=/^[a-f0-9]{64}$/, UUID=/^[a-f0-9]{8}(?:-[a-f0-9]{4}){3}-[a-f0-9]{12}$/;
const flags=constants.O_RDONLY|(constants.O_NOFOLLOW||0)|(constants.O_NONBLOCK||0);
const json=v=>JSON.stringify(v,null,2)+'\n', object=v=>v!==null&&typeof v==='object'&&!Array.isArray(v);
const sha=b=>createHash('sha256').update(b).digest('hex');
function need(ok,message){if(!ok)throw Object.assign(Error(message),{code:'MUSEUM_DIRECTORY'});}
function shape(v,allowed,required=allowed){need(object(v),'Use a complete JSON object.');need(Object.keys(v).every(k=>allowed.includes(k))&&required.every(k=>Object.hasOwn(v,k)),'Keep the declared input fields: '+allowed.join(', '));}
function required(o,k){need(typeof o[k]==='string'&&o[k].length>0,'Supply --'+k);return o[k];}
function sourceSize(stat){need(stat.isFile()&&stat.size>=0n&&stat.size<=BigInt(Number.MAX_SAFE_INTEGER),'Select an ordinary file with an exact supported byte count.');return Number(stat.size);}
function sameStat(a,b){return ['dev','ino','size','mtimeNs','ctimeNs'].every(k=>a[k]===b[k]);}
async function ordinary(path){const f=await open(path,flags);try{return {file:f,stat:await f.stat({bigint:true})};}catch(e){await f.close();throw e;}}
async function descriptor(path){
 const full=resolve(path),{file,stat}=await ordinary(full);try{
  const size=sourceSize(stat),hash=createHash('sha256'),buffer=Buffer.allocUnsafe(CHUNK);let offset=0;
  while(offset<size){const {bytesRead}=await file.read(buffer,0,Math.min(buffer.length,size-offset),offset);need(bytesRead>0,'Original file shortened during reading: '+full);hash.update(buffer.subarray(0,bytesRead));offset+=bytesRead;}
  need(sameStat(stat,await file.stat({bigint:true})),'Original file changed during reading: '+full);
  return {path:full,bytes:size,sha256:hash.digest('hex')};
 }finally{await file.close();}
}
async function textInput(path,limit=MAX_JSON,decode=true){
 const full=resolve(path),{file,stat}=await ordinary(full);try{
  const size=sourceSize(stat);need(size<=limit,'This complete JSON/text input exceeds '+limit+' bytes.');
  const data=await file.readFile();need(data.length===size&&sameStat(stat,await file.stat({bigint:true})),'Input changed while being read.');
  const text=decode?new TextDecoder('utf-8',{fatal:true}).decode(data):'';
  return {path:full,bytes:size,sha256:sha(data),data,text};
 }finally{await file.close();}
}
const provenance=input=>({path:input.path,bytes:input.bytes,sha256:input.sha256});
function parse(input){try{return JSON.parse(input.text);}catch(e){throw Object.assign(Error('Keep complete UTF-8 JSON in '+input.path+': '+e.message),{code:'MUSEUM_DIRECTORY'});}}
async function exists(path){try{return await lstat(path);}catch(e){if(e.code==='ENOENT')return null;throw e;}}
async function directories(path){
 const full=resolve(path),base=parsePath(full).root,parts=full.slice(base.length).split(sep).filter(Boolean);let current=base;
 for(const part of parts){current=join(current,part);try{await mkdir(current,{mode:0o700});}catch(e){if(e.code!=='EEXIST')throw e;}
  const st=await lstat(current);need(st.isDirectory()&&!st.isSymbolicLink(),'Use ordinary directory ancestors, not symlinks: '+current);}
 return full;
}
function safeRelative(path){
 need(typeof path==='string'&&path.length>0&&!path.includes('\\')&&!path.startsWith('/')&&!path.includes('\0'),'Use a relative package member path.');
 need(path.split('/').every(x=>x&&x!=='.'&&x!=='..'),'The package member has an unsafe path.');return path;
}
function inside(parent,child){const r=relative(parent,child);return r===''||(!r.startsWith('..'+sep)&&r!=='..'&&!r.startsWith(sep));}
async function syncDir(path){const d=await open(path,'r');try{await d.sync();}finally{await d.close();}}
async function publishText(path,data){
 const bytes=Buffer.isBuffer(data)?data:Buffer.from(typeof data==='string'?data:json(data));
 const existing=await exists(path);if(existing){need(existing.isFile()&&!existing.isSymbolicLink(),'An existing output is not an ordinary file: '+path);const d=await descriptor(path);need(d.bytes===bytes.length&&d.sha256===sha(bytes),'Existing output contains different bytes: '+path);return;}
 await directories(dirname(path));const temporary=path+'.'+randomUUID()+'.partial';let f;
 try{f=await open(temporary,'wx',0o600);await f.writeFile(bytes);await f.sync();await f.close();f=null;
  try{await link(temporary,path);}catch(e){if(e.code!=='EEXIST')throw e;const d=await descriptor(path);need(d.bytes===bytes.length&&d.sha256===sha(bytes),'Another output owns this final path: '+path);}
  await syncDir(dirname(path));await unlink(temporary);
 }finally{if(f)await f.close();}
}
async function processIdentity(pid){
 try{const raw=await readFile('/proc/'+pid+'/stat','utf8');return raw.slice(raw.lastIndexOf(')')+2).split(' ')[19];}
 catch(e){if(e.code==='ENOENT')return null;throw e;}
}
function liveProcess(pid){try{process.kill(pid,0);return true;}catch(e){if(e.code==='ESRCH')return false;if(e.code==='EPERM')return true;throw e;}}
async function lock(root,intentSha){
 await directories(root);await directories(join(root,'.museum-locks'));const path=join(root,'.museum-lock.json');
 const owner={schema:'stellar-forge.museum-directory-lock.v1',host:hostname(),pid:process.pid,start:await processIdentity(process.pid),token:randomUUID(),intentSha256:intentSha};
 const bytes=Buffer.from(json(owner)),ownerPath=join(root,'.museum-locks',owner.token+'.json');
 // Publish the complete owner before acquiring its hard-link lock. A crash
 // cannot leave a truncated authoritative lock with an unknowable process.
 await publishText(ownerPath,bytes);
 try{await link(ownerPath,path);}catch(e){
  if(e.code!=='EEXIST')throw e;const prior=parse(await textInput(path,16384));
  need(prior.host===owner.host&&Number.isSafeInteger(prior.pid)&&prior.pid>0&&(typeof prior.start==='string'||prior.start===null),
   'An existing writer cannot be reconciled on this host. Preserve its lock and reconcile the original process before resuming: '+path);
  const current=await processIdentity(prior.pid);
  need(!liveProcess(prior.pid)||(typeof current==='string'&&typeof prior.start==='string'&&current!==prior.start),
   'The original directory writer is still present: PID '+prior.pid);
  // A dead owner remains retained; no live process is stopped.
  const again=await textInput(path,16384);need(again.text===json(prior),'The original writer lock changed during reconciliation.');
  await rename(path,path+'.closed-'+randomUUID());await syncDir(root);return lock(root,intentSha);
 }
 await syncDir(root);
 return async()=>{const now=await textInput(path,16384);need(now.sha256===sha(bytes),'The directory writer identity changed.');await unlink(path);await syncDir(root);};
}
async function rootReady(root,intent){
 await directories(root);const existing=await exists(join(root,'INTENT.json'));
 if(!existing){
  const expected=Buffer.from(json(intent)),names=await readdir(root);
  for(const name of names){
   if(name==='.museum-lock.json'||name==='.museum-locks'||name.startsWith('.museum-lock.json.closed-'))continue;
   need(/^INTENT\.json\.[a-f0-9-]{36}\.partial$/.test(name),'Select an empty owned directory, or continue its exact original INTENT.json: '+root);
   const held=await textInput(join(root,name),expected.length,false);
   need(held.data.equals(expected.subarray(0,held.data.length)),'The interrupted original intent differs; preserve it for review.');
  }
 }
 await publishText(join(root,'INTENT.json'),json(intent));
}
async function verifyFile(root,row){const d=await descriptor(join(root,safeRelative(row.path)));need(d.bytes===row.bytes&&d.sha256===row.sha256,'A completed member changed: '+row.path);}
async function completeExisting(root,manifest,intentSha){
 if(!await exists(join(root,'COMPLETE.json')))return null;
 const complete=parse(await textInput(join(root,'COMPLETE.json'))),raw=json(manifest);
 need(complete.intentSha256===intentSha&&complete.manifestSha256===sha(raw)&&complete.manifestBytes===Buffer.byteLength(raw),
  'The existing completion belongs to another original input.');
 await verifyFile(root,{path:'FILES.json',bytes:Buffer.byteLength(raw),sha256:sha(raw)});
 for(const row of manifest.files)await verifyFile(root,row);return complete;
}
async function copyOriginal(source,root,row){
 const target=join(root,safeRelative(row.path)),finished=await exists(target);
 if(finished){need(finished.isFile()&&!finished.isSymbolicLink(),'Existing member is not an ordinary file.');await verifyFile(root,row);return;}
 await directories(dirname(target));const partial=join(root,'.museum-partials',safeRelative(row.path)+'.partial');
 await directories(dirname(partial));
 const {file:input,stat}=await ordinary(source);let output;
 try{
  need(sourceSize(stat)===row.bytes,'The retained media byte count changed: '+source);
  const old=await exists(partial);need(!old||old.isFile()&&!old.isSymbolicLink(),'Retain only the original ordinary partial file.');
  output=await open(partial,constants.O_RDWR|constants.O_CREAT|(constants.O_NOFOLLOW||0),0o600);
  const prefix=sourceSize(await output.stat({bigint:true}));need(prefix<=row.bytes,'The interrupted partial is longer than its original file.');
  const data=Buffer.allocUnsafe(CHUNK),previous=Buffer.allocUnsafe(CHUNK),hash=createHash('sha256');let offset=0;
  while(offset<row.bytes){
   const {bytesRead}=await input.read(data,0,Math.min(CHUNK,row.bytes-offset),offset);need(bytesRead>0,'The original file shortened during copying.');
   hash.update(data.subarray(0,bytesRead));
   const overlap=Math.min(bytesRead,Math.max(0,prefix-offset));
   if(overlap){let got=0;while(got<overlap){const r=await output.read(previous,got,overlap-got,offset+got);need(r.bytesRead>0,'The original partial shortened.');got+=r.bytesRead;}
    need(previous.subarray(0,overlap).equals(data.subarray(0,overlap)),'The retained partial differs from the original source; preserve it for review: '+partial);}
   let written=overlap;while(written<bytesRead){const r=await output.write(data,written,bytesRead-written,offset+written);need(r.bytesWritten>0,'Unable to continue original file copy.');written+=r.bytesWritten;}
   offset+=bytesRead;
  }
  need(hash.digest('hex')===row.sha256&&sameStat(stat,await input.stat({bigint:true})),'The original media changed during copying.');
  await output.sync();await output.close();output=null;
  try{await link(partial,target);}catch(e){if(e.code!=='EEXIST')throw e;await verifyFile(root,row);}
  await syncDir(dirname(target));await verifyFile(root,row);await unlink(partial);await syncDir(dirname(partial));
 }finally{if(output)await output.close();await input.close();}
}
function textMember(path,content,kind='metadata'){
 const data=Buffer.isBuffer(content)?content:Buffer.from(typeof content==='string'?content:json(content));return {path:safeRelative(path),bytes:data.length,sha256:sha(data),kind,data};
}
function externalMember(path,source,kind='media'){return {path:safeRelative(path),bytes:source.bytes,sha256:source.sha256,kind,source:source.path};}
function fileManifest(plan){const names=new Set();return plan.map(({data,source,...row})=>{need(!names.has(row.path),'A package path occurs twice: '+row.path);names.add(row.path);return row;});}
function inputRecord(value,extra,requiredExtra=extra){
 shape(value,['id','actor','createdAt','note',...extra],['id','actor','createdAt',...requiredExtra]);
 need(UUID.test(value.id)&&typeof value.actor==='string'&&value.actor.trim()&&typeof value.createdAt==='string'&&Number.isFinite(Date.parse(value.createdAt))&&/(?:Z|[+-]\d\d:\d\d)$/.test(value.createdAt),
  'Retain the explicit original UUID, operator and timestamp.');
 need(value.note===undefined||typeof value.note==='string','Keep the original note as text.');
 return value;
}
async function saveRequest(workspace,input,state){
 const request={id:input.id,expectedRevision:workspace.headId,actor:input.actor,createdAt:input.createdAt,note:input.note||'',state};
 await saveCollectionRevision(workspace,request);return request;
}
async function selectedMedia(indexInput,assets,roots){
 const index=parse(indexInput);need(object(index)&&Object.keys(index).every(k=>HASH.test(k)&&typeof index[k]==='string'&&index[k]),'Use media-index JSON mapping each original SHA-256 to its actual file path.');
 const result=new Map(),provenanceRows=[];
 for(const asset of assets){
  need(Object.hasOwn(index,asset.sha256),'Select the original file for '+asset.id+' ('+asset.filename+').');
  if(result.has(asset.sha256)){need(result.get(asset.sha256).bytes===asset.bytes,'Repeated media identity has contradictory sizes.');continue;}
  const path=resolve(dirname(indexInput.path),index[asset.sha256]);need(roots.every(r=>!inside(r,path)),'Keep original media outside all receiving destinations.');
  const d=await descriptor(path);need(d.sha256===asset.sha256&&d.bytes===asset.bytes,'Original media bytes do not match their retained identity: '+path);
  result.set(asset.sha256,d);provenanceRows.push(d);
 }
 return {index,result,provenanceRows:provenanceRows.sort((a,b)=>a.sha256.localeCompare(b.sha256))};
}
export const MUSEUM_DIRECTORY_HELP=
 'museum-action --project WORKSPACE --input ORIGINAL_ACTION.json --out PRIVATE_OPERATION_DIR\n'+
 'museum-media --project WORKSPACE --file ORIGINAL_MEDIA --input ORIGINAL_MEDIA_INPUT.json --out PRIVATE_OPERATION_DIR\n'+
 'museum-package --project WORKSPACE --input ORIGINAL_DEPLOYMENT.json --media-index ORIGINAL_MEDIA_INDEX.json --out PRIVATE_OPERATION_DIR\n'+
 'museum-handover --project WORKSPACE --input ORIGINAL_HANDOVER.json --media-index ORIGINAL_MEDIA_INDEX.json --out PRIVATE_OPERATION_DIR --copy-a FIRST_DIRECTORY --copy-b SECOND_DIRECTORY [--source-package ACTUAL_TOOLKIT.tgz]\n'+
 'Each original input retains id (UUID), actor and createdAt. Action adds action:{type,record}; media adds role,label,filename,mime; package adds releaseId,endpointId and optional expiresAt; handover adds no other required fields.\n'+
 'Continue with exactly the same files, options and destinations. Save saveREQUEST.json through the original save command before actual endpoint acknowledgment. Only visitor/ is a public endpoint folder; the operation and handover directories are private. Two copies are verified independently; this does not establish different physical failure domains or a performed restore.\n';

export async function runMuseumDirectory(command,o){
 const allowed={ 'museum-action':['project','input','out'], 'museum-media':['project','input','out','file'],
  'museum-package':['project','input','out','media-index'], 'museum-handover':['project','input','out','media-index','copy-a','copy-b','source-package'] }[command];
 need(allowed&&Object.keys(o).every(k=>allowed.includes(k)),'Use only this museum command’s declared options.');
 const root=resolve(required(o,'out')),copies=command==='museum-handover'?[resolve(required(o,'copy-a')),resolve(required(o,'copy-b'))]:[],roots=[root,...copies];
 for(let i=0;i<roots.length;i++)for(let j=0;j<i;j++)need(!inside(roots[i],roots[j])&&!inside(roots[j],roots[i]),'Each receiving directory must be distinct and outside the others.');
 const project=await textInput(required(o,'project')),input=await textInput(required(o,'input'),16*1024*1024);
 for(const source of [project,input])need(roots.every(r=>!inside(r,source.path)),'Keep original inputs outside receiving destinations.');
 const workspace=await openCollectionPacket(project.text),value=parse(input),draft=collectionDraft(workspace);
 const files=[textMember('original/project.json',project.data),textMember('original/input.json',input.data)];
 let request=null,assets=[],media=null,indexInput=null,prepared=null,description=null,sourcePackage=null;
 if(command==='museum-action'){
  inputRecord(value,['action']);shape(value.action,['type','record']);
  request=await saveRequest(workspace,value,await applyMuseumAction(workspace,draft,value.action));
 }else if(command==='museum-media'){
  inputRecord(value,['role','label','filename','mime']);
  need(MEDIA_ROLES.includes(value.role),'Select a declared original media role.');
  const source=await descriptor(required(o,'file'));need(roots.every(r=>!inside(r,source.path)),'Keep original media outside receiving destinations.');
  need(typeof value.filename==='string'&&value.filename.length>0&&value.filename.length<=240,'Retain the actual original filename.');
  const extension=/\.([a-z0-9]{1,12})$/i.exec(value.filename)?.[1].toLowerCase()||'bin';
  const asset={id:'media-'+source.sha256,sha256:source.sha256,bytes:source.bytes,filename:value.filename,path:'media/'+source.sha256+'.'+extension,role:value.role,label:value.label,mime:value.mime};
  request=await saveRequest(workspace,value,await applyMuseumAction(workspace,draft,{type:'asset',record:asset}));
  assets=[asset];media={provenanceRows:[source]};files.push(textMember('media-record.json',asset),externalMember(asset.path,source));
 }else{
  indexInput=await textInput(required(o,'media-index'),16*1024*1024);
  need(roots.every(r=>!inside(r,indexInput.path)),'Keep the original media index outside receiving destinations.');
  if(command==='museum-package'){
   inputRecord(value,['releaseId','endpointId','expiresAt'],['releaseId','endpointId']);
   need(value.note===undefined,'Deployment save requests retain the maintained fixed deployment note; keep additional observations in their own original records.');
   prepared=await prepareMuseumPackage(workspace,value);assets=prepared.assets;
   need(object(prepared.request),'Use the maintained package preparer that returns its exact original save request.');
   request=prepared.request;
   for(const file of prepared.files)files.push(textMember('visitor/'+file.path,file.content,'visitor'));
   files.push(textMember('deployment.json',prepared.deployment));
  }else{
   inputRecord(value,[]);
   description=await describeMuseumHandover(workspace,value);assets=description.assets;
   const exported=await createCollectionExport(workspace);
   for(const file of exported.files)files.push(textMember(file.path,file.content,'editorial'));
   if(o['source-package']){
    const selected=resolve(o['source-package']);need(roots.every(r=>!inside(r,selected)),'Keep the original toolkit package outside all receiving destinations.');
    sourcePackage=await descriptor(selected);const filename=basename(selected);need(filename&&!filename.includes('\\')&&!filename.includes('\0'),'Keep an ordinary toolkit filename.');
    files.push(externalMember('toolkit/'+filename,sourcePackage,'toolkit-source'));
   }
   description={...description,toolkitSource:sourcePackage?{...sourcePackage,path:'toolkit/'+basename(sourcePackage.path)}:null,
    handoverGaps:[...description.absentRoles.map(role=>'media-role:'+role),...(sourcePackage?[]:['toolkit-source-package-not-selected'])]};
   files.push(textMember('museum/handover.json',description),textMember('museum/control.json',description.control));
  }
  media=await selectedMedia(indexInput,assets,roots);files.push(textMember('original/media-index.json',indexInput.data));
  for(const asset of assets)files.push(externalMember((command==='museum-package'?'visitor/':'')+asset.path,media.result.get(asset.sha256)));
 }
 if(request)files.push(textMember('saveREQUEST.json',request));
 const operationReadme='# Museum directory operation\n\nThis is a private retained operation. Original source paths, editorial state and evidence must not be published with a visitor display. '+(command==='museum-package'?'Only visitor/ contains the public display and its selected permitted media.\n\n':'\n\n')+
  'INTENT.json binds the full original inputs and every selected media file. Continue the same command, inputs and directories. Existing different final files stop; matching interrupted partial prefixes continue. FILES.json lists complete output byte identities; COMPLETE.json is written only after every file is verified.\n\n'+
  (request?'The original deployment/editorial change is only prepared. Run the existing collection-review-cli.mjs save command against original/project.json and saveREQUEST.json to a new workspace file. Preserve that workspace before recording any real endpoint observation. No model, network, device or endpoint action was run by this command.\n\n':'')+
  'Handover copies contain the full original workspace and source history and all registered media, including explicit missing-role metadata. Two paths do not prove separate physical media. Record actual restore and independent viewing through the original commissioning workflow. Source preparation and hashes are not client readiness.\n\n'+MUSEUM_RENDERED_INSTRUCTION;
 files.push(textMember('OPERATION.md',operationReadme));
 const rows=fileManifest(files),manifest={schema:'stellar-forge.museum-directory-files.v1',operationId:value.id,command,workspaceId:workspace.id,selectedRevisionId:workspace.headId,files:rows};
 const sourceModule=await descriptor(fileURLToPath(import.meta.url));
 const intent={schema:'stellar-forge.museum-directory-intent.v1',operationId:value.id,command,workspaceId:workspace.id,selectedRevisionId:workspace.headId,
  actor:value.actor,createdAt:value.createdAt,project:provenance(project),input:provenance(input),mediaIndex:indexInput?provenance(indexInput):null,
  media:media?.provenanceRows||[],toolkitSource:sourcePackage,destinations:roots,source:sourceModule,filesSha256:sha(json(manifest)),
  note:'Filesystem preparation only; no model, network, endpoint action, restore or approval is implied.'};
 const intentSha=sha(json(intent)),releases=[];
 try{
  for(const destination of [...roots].sort())releases.push(await lock(destination,intentSha));
  for(const destination of roots)await rootReady(destination,intent);
  const completed=[];
  for(const destination of roots){
   const old=await completeExisting(destination,manifest,intentSha);if(old){completed.push({directory:destination,...old});continue;}
   for(const row of files){if(row.source)await copyOriginal(row.source,destination,row);else await publishText(join(destination,row.path),row.data);}
   for(const row of rows)await verifyFile(destination,row);
   await publishText(join(destination,'FILES.json'),json(manifest));
   const result={schema:'stellar-forge.museum-directory-complete.v1',operationId:value.id,command,workspaceId:workspace.id,selectedRevisionId:workspace.headId,
    intentSha256:intentSha,manifestSha256:sha(json(manifest)),manifestBytes:Buffer.byteLength(json(manifest)),files:rows.length,
    bytes:rows.reduce((n,r)=>n+r.bytes,0),preparedRequestId:request?.id||null,deploymentId:prepared?.deployment.id||null,
    artifactKind:'directory-manifest',clientReady:false,renderedProduct:'NOT_VERIFIED',endpointApplied:false,
    note:'All listed full bytes verified; endpoint/restore observations and physical-copy independence remain separately sourced.'};
   need(Number.isSafeInteger(result.bytes),'The complete byte total exceeds exact integer representation.');
   await publishText(join(destination,'COMPLETE.json'),json(result));completed.push({directory:destination,...result});
  }
  const summary={operationId:value.id,workspaceId:workspace.id,command,copies:completed,
   saveRequest:request?join(root,'saveREQUEST.json'):null,visitorDirectory:prepared?join(root,'visitor'):null,
   absentRoles:description?.absentRoles||[],handoverGaps:description?.handoverGaps||[],restorePerformed:false,endpointApplied:false,clientReady:false};
  await publishText(join(root,'RESULT.json'),json(summary));return summary;
 }finally{for(const release of releases.reverse())await release();}
}
