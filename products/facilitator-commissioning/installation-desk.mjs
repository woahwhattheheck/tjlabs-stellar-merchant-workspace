// SPDX-License-Identifier: MIT
// Whole Installation preparation over the existing operator's immutable input/request journals.
import {resolve,join} from 'node:path';
import {open,readdir,lstat} from 'node:fs/promises';
import {constants} from 'node:fs';
import {createHash,randomUUID} from 'node:crypto';
import {spawn} from 'node:child_process';
import {readProfile} from '../../stellar/scf_2026/sf49_data_commissioning/installation-workorders/profiles.mjs';
import {readWorkflowSeriesPrivateFile,workflowSeriesPrivateDirectory} from '../../stellar-forge/mcp-merchant-operator/workflow-series-connection.mjs';
import {writeConsoleWorkflowFile} from '../../stellar-forge/mcp-merchant-operator/console/client-files.mjs';
import {inspectCommissioningTransfer} from './commissioning.mjs';
import {prepareCommissioningInstallationFiles,inspectCommissioningInstallation} from './installation.mjs';
export const DESK_SCHEMA='stellar-forge.facilitator-installation-desk.v1';
const MAX=64*1024*1024,HASH=/^[a-f0-9]{64}$/,UUID=/^[a-f0-9]{8}(?:-[a-f0-9]{4}){3}-[a-f0-9]{12}$/;
const nativePath=/^(?:blobs\/[a-f0-9]{64}|(?:commands|results)\/[a-f0-9-]{36}\.json|reviews\/[a-f0-9-]{36}(?:\.buyer)?\.json|runs\/[a-f0-9-]{36}(?:\.(?:selection|started|stopped|failed))?\.json|buyers\/[a-f0-9-]{36}-[a-z0-9_-]{1,64}\.(?:json|body)|job\.json|selection\.json)$/;
const object=x=>x!==null&&typeof x==='object'&&!Array.isArray(x);
const stable=x=>JSON.stringify(x,(_k,v)=>object(v)?Object.fromEntries(Object.keys(v).sort().map(k=>[k,v[k]])):v);
const hash=b=>createHash('sha256').update(b).digest('hex');
const encode=x=>Buffer.from(JSON.stringify(x,null,2)+'\n');
const parse=b=>JSON.parse(new TextDecoder('utf-8',{fatal:true}).decode(b));
const need=(ok,message,status=400,code='INSTALLATION_DESK_INPUT')=>{if(!ok)throw Object.assign(new Error(message),{code,status});};
const op=id=>{need(typeof id==='string'&&UUID.test(id),'Select the original operation UUID.');return id;};
const identity=x=>object(x)&&HASH.test(x.sha256)&&Number.isSafeInteger(x.bytes)&&x.bytes>=0&&x.bytes<=MAX;
const safePath=p=>typeof p==='string'&&!p.startsWith('/')&&!p.includes('\\')&&!/[\x00-\x1f\x7f]/.test(p)&&p.split('/').every(x=>x&&x!=='.'&&x!=='..');
const fileStamp=s=>[s.dev,s.ino,s.size,s.mtimeNs,s.ctimeNs,s.mode,s.uid].map(String).join(':');
const exact=(x,keys)=>need(object(x)&&keys.length===Object.keys(x).length&&keys.every(k=>Object.hasOwn(x,k)),'Use the complete original preparation fields.');
async function read(path,optional=false){try{return parse(await readWorkflowSeriesPrivateFile(path,MAX));}catch(e){if(optional&&e.code==='ENOENT')return null;throw e;}}
async function materialize(root,name,raw){
  need(safePath(name),'The complete preparation contains an invalid file path.');
  let parent=root;for(const part of name.split('/').slice(0,-1)){parent=join(parent,part);await workflowSeriesPrivateDirectory(parent,true);}
  await writeConsoleWorkflowFile(join(root,name),raw);
}
function page(items,offset,limit){need(Number.isSafeInteger(offset)&&offset>=0&&Number.isSafeInteger(limit)&&limit>=1&&limit<=250,'Choose a page of 1–250 original records.');return{items:items.slice(offset,offset+limit),offset,limit,total:items.length,next_offset:offset+limit<items.length?offset+limit:null};}
function summary(r){return{operationId:r.operationId,mode:r.mode,jobId:r.jobId,selectionSha256:r.selectionSha256,basis:r.basis,sourceTransferId:r.sourceTransferId,nativeReceipt:r.nativeReceipt,files:r.files.length,missingSourceCount:r.missingSourceCount,selections:r.selections,completedAt:r.completedAt};}

/** Methods run only inside the existing authenticated operator's serial queue and lease. */
export function createInstallationDesk({root,ui,exportsRoot,input}){
  root=resolve(root);ui=resolve(ui);exportsRoot=resolve(exportsRoot);
  const inputPath=sha=>join(ui,'inputs',sha);
  async function put(raw){need(Buffer.isBuffer(raw)&&raw.length<=MAX,'The complete original file exceeds 64 MiB.',413);const ref={bytes:raw.length,sha256:hash(raw)};await writeConsoleWorkflowFile(inputPath(ref.sha256),raw);return ref;}
  async function bytes(ref){need(identity(ref),'Select a complete original input identity.');const raw=await readWorkflowSeriesPrivateFile(await input(ref),MAX);need(raw.length===ref.bytes&&hash(raw)===ref.sha256,'The original retained input changed.',409);return raw;}
  async function result(id){
    const receipt=await read(join(ui,'results',op(id)+'.json'));
    const value=receipt.result;
    need(receipt.operationId===id&&['installation-template','installation-prepare'].includes(receipt.action)&&value?.schema===DESK_SCHEMA&&value.operationId===id,
      'Select a completed original Installation preparation.',404);
    need(Array.isArray(value.files)&&value.files.every(f=>safePath(f.path)&&identity(f))&&new Set(value.files.map(f=>f.path)).size===value.files.length,
      'The preparation file inventory differs.',409);
    return value;
  }
  async function originalSource(transferId,current){
    const receipt=await read(join(ui,'results',op(transferId)+'.json'));
    const cut=receipt.result;
    need(receipt.operationId===transferId&&receipt.action==='export'&&cut?.schema==='stellar-forge.facilitator-operator-transfer.v1'&&
      cut.id===transferId&&cut.jobId===current.id&&cut.selectionSha256===current.selectionSha256&&Array.isArray(cut.files),
      'Select a completed transfer from this original service.',409);
    const rows=cut.files.filter(f=>f.path.startsWith('job/')&&f.path!=='job/TRANSFER.json')
      .map(f=>({...f,path:f.path.slice(4)}));
    need(rows.length>0&&rows.every(f=>nativePath.test(f.path)&&identity(f))&&new Set(rows.map(f=>f.path)).size===rows.length&&
      rows.some(f=>f.path==='job.json')&&rows.some(f=>f.path==='selection.json'),'The original complete transfer inventory differs.',409);
    // The native exporter has a fixed canonical manifest encoding. Reconstruct
    // only that exact original cut and verify its retained SHA before any use.
    const manifest={schema:'stellar-forge.facilitator-commissioning-transfer.v1',jobId:cut.jobId,selectionSha256:cut.selectionSha256,files:rows};
    const raw=encode(manifest),descriptor=cut.files.find(f=>f.path==='job/TRANSFER.json');
    need(descriptor&&descriptor.sha256===cut.originalManifestSha256&&hash(raw)===descriptor.sha256&&raw.length===descriptor.bytes,
      'The original native transfer manifest cannot be recovered exactly.',409);
    const refs=[];
    for(const row of rows){
      // Native members are immutable. Cache exact bytes in the existing input
      // inventory before accepting a preparation so cold receiving is portable.
      const raw=await readWorkflowSeriesPrivateFile(join(root,row.path),MAX);
      need(raw.length===row.bytes&&hash(raw)===row.sha256,'The selected historical native member differs: '+row.path,409);
      refs.push({path:row.path,...await put(raw)});
    }
    return{transferId,jobId:cut.jobId,selectionSha256:cut.selectionSha256,manifest:await put(raw),files:refs};
  }
  async function profile(){
    const p=readProfile('facilitator-commissioning'),handle=await open(p.source.path,constants.O_RDONLY|constants.O_NOFOLLOW|constants.O_NONBLOCK);
    let raw;try{const stat=await handle.stat();need(stat.isFile()&&stat.size<=2*1024*1024,'Select the maintained complete installed profile.');raw=await handle.readFile();
      need(raw.length===p.source.bytes&&hash(raw)===p.source.sha256,'The installed profile changed.',409);
    }finally{await handle.close();}
    return await put(raw);
  }
  async function binding(command,current){
    op(command.operationId);const path=join(ui,'native-requests',command.operationId+'.json'),old=await read(path,true);
    const logicalSha256=hash(Buffer.from(stable(command)));
    if(old){
      need(old.schema===DESK_SCHEMA&&old.logicalSha256===logicalSha256&&stable(old.command)===stable(command),
        'The original preparation UUID has different complete content.',409,'REQUEST_CONFLICT');
      need(old.source.jobId===current.id&&old.source.selectionSha256===current.selectionSha256,
        'The preparation belongs to a different original service.',409);
      for(const ref of [old.source.manifest,...old.source.files,old.seed,old.caseSnapshot,old.profile,...(old.bindings?[old.bindings]:[])])await bytes(ref);
      return old;
    }
    need(command.expectedRevision===current.revision,'Refresh the original service before preparing a new Installation.',409,'REVISION_CONFLICT');
    let selected;
    if(command.action==='installation-template'){
      exact(command.payload,['sourceTransferId','seed','caseSnapshot']);
      await bytes(command.payload.seed);await bytes(command.payload.caseSnapshot);
      selected={source:await originalSource(command.payload.sourceTransferId,current),seed:command.payload.seed,
        caseSnapshot:command.payload.caseSnapshot,profile:await profile(),mode:'template'};
    }else{
      need(command.action==='installation-prepare','Choose template or complete preparation.');
      exact(command.payload,['templateOperationId','bindings']);await bytes(command.payload.bindings);
      const prior=await result(command.payload.templateOperationId);
      need(prior.mode==='template'&&prior.missingSourceCount===0,'Use a complete source-matched template. Attach missing originals and receive its current case/seed first.',409);
      const original=await read(join(ui,'native-requests',op(command.payload.templateOperationId)+'.json'));
      need(original.schema===DESK_SCHEMA&&original.source.jobId===current.id&&original.source.selectionSha256===current.selectionSha256,
        'Select the template from this exact original service.',409);
      for(const ref of [original.source.manifest,...original.source.files,original.seed,original.caseSnapshot,original.profile])await bytes(ref);
      selected={source:original.source,seed:original.seed,caseSnapshot:original.caseSnapshot,profile:original.profile,
        bindings:command.payload.bindings,templateOperationId:command.payload.templateOperationId,mode:'prepare'};
    }
    const retained={schema:DESK_SCHEMA,logicalSha256,command,...selected};
    await writeConsoleWorkflowFile(path,retained);return retained;
  }
  async function workspace(id){
    const parent=join(exportsRoot,'installations');await workflowSeriesPrivateDirectory(parent,true);
    const work=join(parent,op(id));await workflowSeriesPrivateDirectory(work,true);return work;
  }
  async function sourceTree(base,bound){
    const source=join(base,'source');await workflowSeriesPrivateDirectory(source,true);
    for(const name of ['blobs','commands','results','reviews','runs','buyers'])await workflowSeriesPrivateDirectory(join(source,name),true);
    for(const row of bound.source.files){need(nativePath.test(row.path),'The original native source path differs.');await materialize(source,row.path,await bytes(row));}
    await materialize(source,'TRANSFER.json',await bytes(bound.source.manifest));
    const m=await inspectCommissioningTransfer(source);
    need(m.jobId===bound.source.jobId&&m.selectionSha256===bound.source.selectionSha256,
      'The complete received source selection differs.',409);return source;
  }
  async function execute(command,current){
    const bound=await binding(command,current),work=await workspace(command.operationId),source=await sourceTree(work,bound);
    const out=join(work,'preparation');
    let receipt;
    try{receipt=await inspectCommissioningInstallation(out);}catch(e){if(e.code!=='ENOENT')throw e;}
    if(!receipt){
      receipt=await prepareCommissioningInstallationFiles({mode:bound.mode,transfer:source,
        expectedTransferSha256:bound.source.manifest.sha256,out,
        seed:await input(bound.seed),caseSnapshot:await input(bound.caseSnapshot),
        profileFile:await input(bound.profile),expectedProfileSha256:bound.profile.sha256,
        ...(bound.bindings?{bindings:await input(bound.bindings)}:{})});
    }
    need(receipt.mode===bound.mode&&receipt.jobId===bound.source.jobId&&receipt.selectionSha256===bound.source.selectionSha256&&
      receipt.transfer.sha256===bound.source.manifest.sha256&&receipt.profile.sha256===bound.profile.sha256&&
      receipt.seed.sha256===bound.seed.sha256&&receipt.caseSnapshot.sha256===bound.caseSnapshot.sha256&&
      (!bound.bindings||receipt.bindings.sha256===bound.bindings.sha256),'The retained completed preparation has different original inputs.',409);
    const files=[];
    for(const row of receipt.files){const raw=await readWorkflowSeriesPrivateFile(join(out,row.path),MAX);
      need(raw.length===row.bytes&&hash(raw)===row.sha256,'A complete preparation member changed.',409);
      files.push({path:row.path,...await put(raw)});
    }
    const receiptRaw=await readWorkflowSeriesPrivateFile(join(out,'INSTALLATION_PREPARATION.json'),MAX);
    need(receiptRaw.length===receipt.receipt.bytes&&hash(receiptRaw)===receipt.receipt.sha256,'The complete preparation receipt differs.',409);
    files.push({path:'INSTALLATION_PREPARATION.json',...await put(receiptRaw)});
    return{schema:DESK_SCHEMA,operationId:command.operationId,mode:bound.mode,
      jobId:receipt.jobId,selectionSha256:receipt.selectionSha256,sourceTransferId:bound.source.transferId,
      basis:receipt.basis,files,nativeReceipt:receipt.receipt,selections:receipt.selections,
      missingSourceCount:receipt.missingSources.length,completedAt:new Date().toISOString()};
  }
  async function file(id,name){const r=await result(id),f=r.files.find(f=>f.path===name);need(f,'Select an original complete preparation file.',404);
    const raw=await bytes(f);return{body:raw,bytes:f.bytes,sha256:f.sha256,filename:name.split('/').pop(),
      contentType:name.endsWith('.json')?'application/json':name.endsWith('.md')?'text/markdown; charset=utf-8':'application/octet-stream'};}
  async function catalog(current){
    const list=[],sources=[];
    for(const name of (await readdir(join(ui,'results'))).filter(n=>UUID.test(n.slice(0,-5))&&n.endsWith('.json')).sort()){
      const receipt=await read(join(ui,'results',name));
      if(receipt.result?.schema===DESK_SCHEMA){const r=receipt.result;if(r.jobId===current.id&&r.selectionSha256===current.selectionSha256)list.push(summary(r));}
      else if(receipt.action==='export'&&receipt.result?.jobId===current.id&&receipt.result.selectionSha256===current.selectionSha256){
        sources.push({operationId:receipt.operationId,completedAt:receipt.completedAt,
          sourceMembers:receipt.result.files.filter(f=>f.path.startsWith('job/')&&f.path!=='job/TRANSFER.json').length,
          manifestSha256:receipt.result.originalManifestSha256});
      }
    }
    return{schema:DESK_SCHEMA,jobId:current.id,selectionSha256:current.selectionSha256,revision:current.revision,preparations:list,sources};
  }
  async function view(id,{kind='summary',offset=0,limit=50}={}){
    const r=await result(id),base={schema:DESK_SCHEMA,preparation:summary(r)};
    if(kind==='files')return{...base,...page(r.files,offset,limit)};
    if(kind==='sources'){
      const f=await file(id,r.mode==='template'?'source-mapping.json':'installation-source-binding.json'),v=parse(f.body);
      const rows=[...(v.sourceBindings??[]).map(x=>({...x,state:'MATCHED'})),...(v.missingSources??[]).map(x=>({...x,state:'MISSING'}))];
      return{...base,...page(rows,offset,limit)};
    }
    need(kind==='summary','Select preparation summary, files or sources.');
    const binding=parse((await file(id,'bindings.json')).body);
    const originalSeed=parse((await file(id,'inputs/original-seed.json')).body),originalProfile=parse((await file(id,'inputs/profile.json')).body);
    const defaults={merchantDeploymentId:originalSeed.document.merchantDeploymentId,buyerDeploymentIds:originalSeed.document.buyerDeploymentIds};
    for(const key of ['task','source','payment','receiving'])defaults[key]={...originalSeed.document[key],...(originalProfile[key]??{}),...Object.fromEntries(Object.entries(binding[key]??{}).filter(([,v])=>v!==''))};
    return{...base,bindings:binding,defaults,workshare:originalSeed.document.workshare??null,workorder:originalSeed.document.workorder,assignments:originalSeed.document.assignments,checks:originalSeed.document.checks,continuation:parse((await file(id,'INSTALLATION_PREPARATION.json')).body).continuation,
      ...(r.mode==='prepare'?{prepared:parse((await file(id,'installation-preview-input.json')).body)}:{})};
  }
  async function restorePackage(id){
    const r=await result(id),work=await workspace(id),out=join(work,'preparation');
    await workflowSeriesPrivateDirectory(out,true);
    for(const f of r.files)await materialize(out,f.path,await bytes(f));
    const actual=await inspectCommissioningInstallation(out);
    need(actual.receipt.sha256===r.nativeReceipt.sha256&&actual.receipt.bytes===r.nativeReceipt.bytes&&actual.jobId===r.jobId&&actual.selectionSha256===r.selectionSha256,
      'The complete independent preparation identity differs.',409);
    return{directory:out,files:r.files,jobId:r.jobId,selectionSha256:r.selectionSha256,receipt:r.nativeReceipt};
  }
  async function archiveIdentity(path){
    const h=await open(path,constants.O_RDONLY|constants.O_NOFOLLOW|constants.O_NONBLOCK);
    try{const stat=await h.stat();need(stat.isFile()&&stat.size<=8*1024*1024*1024,'The whole preparation exceeds 8 GiB.',413);
      const sha=createHash('sha256');let total=0;for await(const b of h.createReadStream({autoClose:false})){total+=b.length;
        need(total<=stat.size,'The whole preparation changed during reading.',409);sha.update(b);}
      const after=await h.stat();need(total===stat.size&&after.size===stat.size&&after.mtimeMs===stat.mtimeMs&&after.ctimeMs===stat.ctimeMs,
        'The whole preparation archive changed.',409);return{bytes:total,sha256:sha.digest('hex')};
    }finally{await h.close();}
  }
  async function verifyArchive(path,files){
    const expected=new Map(files.map(f=>[f.path,f])),seen=new Set(),handle=await open(path,constants.O_RDONLY|constants.O_NOFOLLOW|constants.O_NONBLOCK);
    const field=b=>new TextDecoder('utf-8',{fatal:true}).decode(b.subarray(0,b.indexOf(0)<0?b.length:b.indexOf(0)));
    const octal=b=>{const v=field(b).trim();need(/^[0-7]*$/.test(v),'The complete archive header differs.',409);const n=v?parseInt(v,8):0;need(Number.isSafeInteger(n)&&n>=0,'The complete archive length differs.',409);return n;};
    const read=async(length,position)=>{const b=Buffer.alloc(length);let got=0;while(got<length){const r=await handle.read(b,got,length-got,position+got);need(r.bytesRead>0,'The whole archive is incomplete.',409);got+=r.bytesRead;}return b;};
    try{
      const originalStat=await handle.stat({bigint:true}),stat={size:Number(originalStat.size)};need(originalStat.isFile()&&originalStat.size>=0n&&originalStat.size<=8n*1024n*1024n*1024n,'Select the complete bounded preparation archive.',409);
      let at=0,zeros=0,members=0;
      while(at<stat.size){
        const head=await read(512,at);at+=512;
        if(head.every(x=>x===0)){zeros++;if(zeros>=2){while(at<stat.size){const n=Math.min(65536,stat.size-at),b=await read(n,at);need(b.every(x=>x===0),'The archive has extra trailing content.',409);at+=n;}break;}continue;}
        need(zeros===0&&++members<=200000,'The complete archive structure differs.',409);
        let checksum=0;for(let i=0;i<512;i++)checksum+=i>=148&&i<156?32:head[i];
        need(octal(head.subarray(148,156))===checksum&&field(head.subarray(257,263))==='ustar','The original TAR header checksum or format differs.',409);
        const prefix=field(head.subarray(345,500)),raw=(prefix?prefix+'/':'')+field(head.subarray(0,100));
        const name=raw.replace(/^\.\//,'').replace(/\/$/,''),kind=String.fromCharCode(head[156]||48),length=octal(head.subarray(124,136));
        if(raw==='.'||raw==='./'){need(kind==='5'&&length===0,'The archive root differs.',409);continue;}
        need(safePath(name)&&['0','5'].includes(kind),'The archive member path or type differs.',409);
        if(kind==='5'){need(length===0&&([...expected.keys()].some(p=>p.startsWith(name+'/'))||['blobs','commands','results','reviews','runs','buyers'].some(folder=>name==='commissioning-source/'+folder)),'The archive has an unrelated directory.',409);continue;}
        const original=expected.get(name);need(original&&!seen.has(name)&&length===original.bytes&&at+length<=stat.size,'The complete archive inventory differs: '+name,409);
        seen.add(name);const sha=createHash('sha256');let got=0;while(got<length){const n=Math.min(65536,length-got);sha.update(await read(n,at+got));got+=n;}
        need(sha.digest('hex')===original.sha256,'The archived original file differs: '+name,409);
        at+=Math.ceil(length/512)*512;
      }
      need(zeros>=2&&seen.size===expected.size,'The whole archive is missing original members or its end.',409);
      // Hash the same open file whose complete inventory was verified. Keep
      // both descriptor and pathname bound through publication; never hash a
      // newly opened path as if it were the inspected original.
      const sha=createHash('sha256');let position=0;
      while(position<stat.size){const n=Math.min(65536,stat.size-position);sha.update(await read(n,position));position+=n;}
      const after=await handle.stat({bigint:true}),named=await lstat(path,{bigint:true});
      need(fileStamp(after)===fileStamp(originalStat)&&fileStamp(named)===fileStamp(after),
        'The complete archive changed during inspection.',409);
      // Data reaches durable storage before the final name and its receipt.
      await handle.sync();
      return{bytes:stat.size,sha256:sha.digest('hex'),fileIdentity:fileStamp(after)};
    }finally{await handle.close();}
  }
  async function archive(id){
    const r=await result(id),work=await workspace(id),source=await restorePackage(id);
    const target=join(work,'preparation.tar'),receiptPath=join(work,'preparation.tar.json'),prior=await read(receiptPath,true);
    if(prior){
      need(prior.operationId===id&&prior.nativeReceipt.sha256===r.nativeReceipt.sha256,'The archive belongs to another original preparation.',409);
      const actual=await archiveIdentity(target);need(actual.bytes===prior.bytes&&actual.sha256===prior.sha256,'The complete preparation archive differs.',409);
      return{path:target,filename:'installation-'+id+'.tar',contentType:'application/x-tar',...actual};
    }
    // Recover a completed original TAR whose publication reply/receipt was lost.
    // Validate its full content rather than regenerate a representation-dependent archive.
    try{
      const verified=await verifyArchive(target,r.files),{fileIdentity,...actual}=verified;
      need(fileStamp(await lstat(target,{bigint:true}))===fileIdentity,'The original complete archive changed before publication.',409);
      await writeConsoleWorkflowFile(receiptPath,{operationId:id,nativeReceipt:r.nativeReceipt,...actual});
      return{path:target,filename:'installation-'+id+'.tar',contentType:'application/x-tar',...actual};
    }catch(e){if(e.code!=='ENOENT')throw e;}
    const total=r.files.reduce((n,f)=>n+Math.ceil(f.bytes/512)*512+512,10240);
    need(r.files.length<=100000&&total<=8*1024*1024*1024,'The complete preparation exceeds the archive limit.',413);
    const temp=join(work,'.preparation-'+randomUUID()+'.tar');
    try{
      await new Promise((yes,no)=>{
        const child=spawn('tar',['--format=ustar','--numeric-owner','--owner=0','--group=0','--mtime=@0','-cf',temp,'-C',source.directory,'.'],{stdio:['ignore','ignore','pipe'],env:{...process.env,LC_ALL:'C'}});
        let stderr='',error=null,expired=false;child.stderr.on('data',b=>{stderr=(stderr+b.toString()).slice(-8000);});
        const timer=setTimeout(()=>{expired=true;child.kill('SIGTERM');},120000),hard=setTimeout(()=>child.kill('SIGKILL'),125000);
        child.once('error',e=>{error=e;});child.once('close',code=>{clearTimeout(timer);clearTimeout(hard);
          if(error)no(error);else if(code!==0||expired)no(Object.assign(new Error('The complete source is retained; archive receiving was interrupted: '+stderr),{code:'INSTALLATION_ARCHIVE_INTERRUPTED',status:500}));else yes();});
      });
      // The native inspector and input hashes bind the same full source before publication.
      await restorePackage(id);const verified=await verifyArchive(temp,r.files),{fileIdentity,...actual}=verified;
      need(fileStamp(await lstat(temp,{bigint:true}))===fileIdentity,'The verified TAR changed before final publication.',409);
      const {link,unlink}=await import('node:fs/promises');
      let linked=false;
      try{await link(temp,target);linked=true;}catch(e){if(e.code!=='EEXIST')throw e;
        const retained=await verifyArchive(target,r.files);
        need(retained.sha256===actual.sha256&&retained.bytes===actual.bytes,'A retained preparation archive has different bytes.',409);}
      if(linked){const named=await lstat(target,{bigint:true}),sourceNamed=await lstat(temp,{bigint:true});
        // Creating the hard link changes ctime. Compare the original device,
        // inode and size, and require both current names to identify that file.
        const identity=fileIdentity.split(':');
        need(String(named.dev)===identity[0]&&String(named.ino)===identity[1]&&String(named.size)===identity[2]&&
          String(named.mtimeNs)===identity[3]&&fileStamp(named)===fileStamp(sourceNamed),
          'The final archive name differs from the verified original.',409);
      }
      const directoryHandle=await open(work,'r');try{await directoryHandle.sync();}finally{await directoryHandle.close();}
      await writeConsoleWorkflowFile(receiptPath,{operationId:id,nativeReceipt:r.nativeReceipt,...actual});
      return{path:target,filename:'installation-'+id+'.tar',contentType:'application/x-tar',...actual};
    }finally{const {unlink}=await import('node:fs/promises');await unlink(temp).catch(e=>{if(e.code!=='ENOENT')throw e;});}
  }
  return{binding,execute,catalog,view,file,restorePackage,archive};
}
