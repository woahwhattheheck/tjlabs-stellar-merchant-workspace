// MIT. Typed-agent custody on the original merchant transport and retained-file writer.
import { constants } from 'node:fs';
import { mkdir, open, realpath, link, unlink } from 'node:fs/promises';
import { createHash, randomUUID } from 'node:crypto';
import { resolve, join } from 'node:path';
import { openMerchantFileClient, createRetainedDownload } from '../../../stellar-forge/mcp-merchant-operator/retained-download.mjs';
import { privateSupportDirectory, writePrivate } from '../../../stellar-forge/mcp-merchant-operator/host-files.mjs';
import { acquireStateLease } from '../../../stellar/scf-starforge-20261009/merchant-fleet-gateway/state-lease.mjs';
import { definitions } from '../../../stellar-forge/mcp-merchant-operator/catalog/reporting-programmes.mjs';
import { canonicalReportingClientValue, reportingPublication, createReportingProgrammeClientCore } from './agent-client-core.mjs';

const sha = bytes => createHash('sha256').update(bytes).digest('hex');
const encode = value => Buffer.from(JSON.stringify(value,null,2)+'\n');
const decode = bytes => new TextDecoder('utf-8',{fatal:true}).decode(bytes);
const plain = value => value!==null&&typeof value==='object'&&!Array.isArray(value);
const equal = (a,b) => canonicalReportingClientValue(a)===canonicalReportingClientValue(b);
const fail = (code,message,details) => {throw Object.assign(new Error(message),{code:'REPORTING_CLIENT_'+code,...(details===undefined?{}:{details})});};
const need = (value,code,message,details) => {if(!value)fail(code,message,details);};
const MAX_PUBLICATION = 8*1024*1024*1024;
const JOURNAL_SCHEMA = 'stellar-forge.reporting-agent-journal.v1';
const RECEIVING_SCHEMA = 'stellar-forge.reporting-agent-file-receiving.v1';

async function privateDirectory(directory) {
  need(typeof directory==='string'&&directory,'DIRECTORY','Select a private operation or download directory.');
  const path=resolve(directory);
  await mkdir(path,{recursive:true,mode:0o700});
  need(await realpath(path)===path,'DIRECTORY','Use the canonical private directory, without symlink components.');
  await privateSupportDirectory(path);
  const handle=await open(path,constants.O_RDONLY|(constants.O_NOFOLLOW||0));
  try { const st=await handle.stat(); need(st.isDirectory()&&typeof process.getuid==='function'&&st.uid===process.getuid(),'DIRECTORY','Use a private directory owned by the current native operator.'); }
  finally {await handle.close();}
  return path;
}
async function syncDirectory(path){const h=await open(path,constants.O_RDONLY);try{await h.sync();}finally{await h.close();}}
async function readPrivate(path,maximum=4*1024*1024) {
  let h;
  try {h=await open(path,constants.O_RDONLY|(constants.O_NOFOLLOW||0)|(constants.O_NONBLOCK||0));}
  catch(error){if(error.code==='ENOENT')return null;throw error;}
  try {
    const before=await h.stat({bigint:true});
    need(before.isFile()&&(before.mode&0o077n)===0n&&typeof process.getuid==='function'&&before.uid===BigInt(process.getuid())&&before.size<=BigInt(maximum),'JOURNAL','Open the original owned private regular journal file within its source limit.');
    const chunks=[];let length=0;const buffer=Buffer.alloc(Math.min(maximum+1,65536));
    for(;;){const r=await h.read(buffer,0,Math.min(buffer.length,maximum+1-length),null);if(!r.bytesRead)break;length+=r.bytesRead;need(length<=maximum,'JOURNAL','The complete journal file exceeds its source limit.');chunks.push(Buffer.from(buffer.subarray(0,r.bytesRead)));}
    const after=await h.stat({bigint:true});
    need(['dev','ino','size','mtimeNs','ctimeNs','mode','uid'].every(k=>before[k]===after[k])&&BigInt(length)===before.size,'JOURNAL_CHANGED','The original journal changed while it was read.');
    return Buffer.concat(chunks,length);
  }finally{await h.close();}
}
async function retainJSON(root,name,value,lease) {
  lease.assertHeld();const path=join(root,name),bytes=encode(value),prior=await readPrivate(path,Math.max(bytes.length,4*1024*1024));
  if(prior){need(prior.equals(bytes),'JOURNAL_CHANGED','An existing complete journal record has different bytes.',{file:name});return;}
  const temporary=join(root,'.'+name+'.'+randomUUID()+'.tmp');
  try {
    await writePrivate(temporary,bytes);lease.assertHeld();
    try{await link(temporary,path);}catch(error){if(error.code!=='EEXIST')throw error;const winner=await readPrivate(path,bytes.length);need(winner?.equals(bytes),'JOURNAL_CHANGED','The original journal already contains another complete record.');}
    await syncDirectory(root);
  }finally{await unlink(temporary).catch(error=>{if(error.code!=='ENOENT')throw error;});}
}
function errorRecord(error) {
  const result={name:String(error?.name||'Error'),message:String(error?.message||error)};
  for(const key of ['code','applied','outcomeUnknown','reopenRequired','status','commitUncertainty','details','recovery'])
    if(error?.[key]!==undefined)try{result[key]=JSON.parse(canonicalReportingClientValue(error[key]));}catch{result[key]=String(error[key]);}
  return result;
}

/**
 * The receiving manifest is LOCAL metadata binding one actual remote publication.
 * The original retained downloader owns leases, checkpoints, range verification,
 * partial files, full hashes and create-only publication; it is not replaced.
 */
function publicationDownload(core,rawPublication) {
  const publication=reportingPublication(rawPublication),selection=core.selection();
  need(publication.file.bytes<=MAX_PUBLICATION,'PUBLICATION_SIZE','Use the original retained reader limit of 8 GiB.');
  const manifestName='reporting-receiving-'+publication.publicationId+'.json';
  need(publication.file.name!==manifestName,'PUBLICATION_NAME','The source filename collides with the local receiving manifest.');
  const manifest={schema:RECEIVING_SCHEMA,endpoint:selection.endpoint,workspace:selection.workspace,nativeId:selection.nativeId,
    publication,files:[{name:publication.file.name,bytes:publication.file.bytes,sha256:publication.file.sha256}]};
  const bytes=encode(manifest),manifestSha256=sha(bytes);
  const localReads=new Set();
  const client={endpoint:selection.endpoint,async call(name,args,options){
    need(args.exportId===publication.publicationId,'PUBLICATION_CHANGED','Keep the original publication selected.');
    if(name==='reporting_client_manifest')return {state:'MANIFEST_RETAINED',exportId:publication.publicationId,
      manifestFile:{name:manifestName,bytes:bytes.length,sha256:manifestSha256}};
    if(name==='reporting_client_file_release'){
      if(localReads.delete(args.readId))return {released:true};
      return core.release(args.readId,options);
    }
    need(name==='reporting_client_file','TOOL','Use the original retained download operation.');
    need(args.expectedManifestSha256===manifestSha256,'PUBLICATION_CHANGED','The local receiving selection changed.');
    const offset=args.offset??0,limit=args.limit??196608;
    if(args.file===manifestName){
      need(args.expectedSha256===manifestSha256&&Number.isSafeInteger(offset)&&offset>=0&&offset<=bytes.length&&Number.isSafeInteger(limit)&&limit>=1&&limit<=196608,'RANGE','Use an exact bounded local manifest range.');
      const readId=args.readId||randomUUID();if(args.readId&&!localReads.has(readId))throw Object.assign(new Error('Reopen the same local receiving manifest.'),{code:'REPORTING_FILE_READ_NOT_FOUND'});else localReads.add(readId);
      const part=bytes.subarray(offset,Math.min(offset+limit,bytes.length)),next=offset+part.length;
      if(next===bytes.length)localReads.delete(readId);
      return {exportId:publication.publicationId,manifestSha256,readId,file:{name:manifestName,bytes:bytes.length,sha256:manifestSha256},
        offset,bytesRead:part.length,nextOffset:next<bytes.length?next:null,encoding:'base64',data:part.toString('base64')};
    }
    need(args.file===publication.file.name&&args.expectedSha256===publication.file.sha256,'PUBLICATION_CHANGED','Download only the selected complete source file.');
    const chunk=await core.read('file_read',{publicationId:publication.publicationId,expectedSha256:publication.file.sha256,offset,limit,...(args.readId?{readId:args.readId}:{})},options);
    need(chunk.file?.name===publication.file.name&&chunk.file?.bytes===publication.file.bytes&&chunk.file?.sha256===publication.file.sha256&&chunk.file?.contentType===publication.file.type,'PUBLICATION_CHANGED','The native reader returned a different original file.');
    return {...chunk,exportId:publication.publicationId,manifestSha256};
  }};
  const receiver=createRetainedDownload({
    manifestName,maximumBytes:MAX_PUBLICATION,stateSchema:'stellar-forge.reporting-agent-download-state.v1',
    resultSchema:'stellar-forge.reporting-agent-download-result.v1',toolPrefix:'reporting_client',errorPrefix:'REPORTING_FILE',
    clientName:'starforge-reporting-programmes',validateExportId:value=>need(value===publication.publicationId,'PUBLICATION_CHANGED','Keep the original publication selected.'),
    parseManifest:(actual,id)=>{need(id===publication.publicationId&&Buffer.from(actual).equals(bytes),'PUBLICATION_CHANGED','The complete local receiving manifest changed.');return manifest;},
    describe:()=>({workspace:selection.workspace,nativeId:selection.nativeId,publicationId:publication.publicationId,publication})
  });
  return {client,receiver,manifestSha256,manifest};
}

/**
 * Open the original merchant connection and configured workspace. Credentials
 * remain in the supplied environment/transport and never enter any saved file.
 */
export async function openReportingProgrammeClient({url,client,tokenEnv='MCP_ACCESS_TOKEN',environment=process.env,
  signal,workspace,expectedNativeId,maximumResponseBytes=16*1024*1024}={}) {
  need(!(url&&client),'TRANSPORT','Select the original supplied transport or its endpoint.');
  const transport=client||await openMerchantFileClient({url,tokenEnv,environment,signal,
    errorPrefix:'REPORTING',clientName:'starforge-reporting-programmes',maximumResponseBytes});
  const core=createReportingProgrammeClientCore({transport,definitions,workspace,expectedNativeId,sha256:sha});
  await core.open({requestSignal:signal});

  async function download(publicationId,{directory,chunkSize=196608,onProgress,signal:readSignal=signal}={}) {
    const {publication}=await core.publication(publicationId,{requestSignal:readSignal});
    const selected=publicationDownload(core,publication);
    return selected.receiver.download({client:selected.client,exportId:publication.publicationId,directory,
      chunkSize,onProgress,signal:readSignal,expectedManifestSha256:selected.manifestSha256});
  }
  async function withJournal(directory,operation) {
    const root=await privateDirectory(directory),lease=await acquireStateLease(root);
    try{lease.assertHeld();return await operation(root,lease);}finally{await lease.close();}
  }
  async function retainedPrepared(root,lease,prepared) {
    const checked=await core.validatePrepared(prepared);
    await retainJSON(root,'request.json',{schema:JOURNAL_SCHEMA,prepared:checked},lease);return checked;
  }
  async function loadPrepared(root) {
    const bytes=await readPrivate(join(root,'request.json'));
    need(bytes,'JOURNAL','Open the original operation directory containing request.json.');
    const value=JSON.parse(decode(bytes));need(value.schema===JOURNAL_SCHEMA,'JOURNAL','Open the complete original reporting journal.');
    return core.validatePrepared(value.prepared);
  }
  async function inputs(root,lease,prepared) {
    const list=prepared.args.input?[{role:'input',alias:prepared.args.input,sha256:prepared.args.expectedSha256}]:[];
    if(prepared.args.context)list.push({role:'context',alias:prepared.args.context,sha256:prepared.args.expectedContextSha256});
    const previous=await readPrivate(join(root,'inputs.json'));
    if(previous){
      const saved=JSON.parse(decode(previous));
      need(saved.schema===JOURNAL_SCHEMA&&saved.clientRequestSha256===prepared.clientRequestSha256&&
        Array.isArray(saved.inputs)&&saved.inputs.length===list.length,'INPUT_CHANGED','The retained input selection differs.');
      for(let index=0;index<list.length;index++){
        const selected=list[index],item=saved.inputs[index],pub=reportingPublication(item.publication);
        need(item.role===selected.role&&item.alias===selected.alias&&item.sha256===selected.sha256&&
          item.input?.alias===selected.alias&&pub.format==='input'&&pub.file.sha256===selected.sha256,'INPUT_CHANGED','Retain the exact original input roles and full-file digests.');
        await download(pub.publicationId,{directory:join(root,'inputs',selected.role)});
      }
      return saved.inputs;
    }
    const completed=[];
    for(const selected of list){
      const inspected=await core.inspectInput(selected.alias,selected.sha256,{requestSignal:signal});
      const pub=reportingPublication(inspected.publication);
      need(pub.format==='input'&&pub.file.sha256===selected.sha256&&inspected.input?.alias===selected.alias&&
        equal(inspected.input.file,pub.file),'INPUT_CHANGED','The inspected original input differs from the prepared complete request.');
      await download(pub.publicationId,{directory:join(root,'inputs',selected.role)});
      completed.push({...selected,input:inspected.input,publication:pub});
    }
    await retainJSON(root,'inputs.json',{schema:JOURNAL_SCHEMA,clientRequestSha256:prepared.clientRequestSha256,inputs:completed},lease);
    return completed;
  }
  async function attempt(root,lease,prepared,kind,invoke) {
    const attemptId=randomUUID(),entered={schema:JOURNAL_SCHEMA,attemptId,kind,at:new Date().toISOString(),
      clientRequestSha256:prepared.clientRequestSha256,selection:core.selection()};
    await retainJSON(root,attemptId+'.entered.json',entered,lease);
    let result;
    try{result=await invoke();}
    catch(error){
      try{await retainJSON(root,attemptId+'.error.json',{...entered,error:errorRecord(error)},lease);}
      catch(custody){throw Object.assign(new Error('The original operation outcome requires recovery; local error custody also failed.'),{code:'REPORTING_CLIENT_OUTCOME_UNKNOWN',outcomeUnknown:true,cause:error,custodyError:errorRecord(custody),directory:root});}
      throw Object.assign(error,{directory:root,clientRequestSha256:prepared.clientRequestSha256});
    }
    try{await retainJSON(root,attemptId+'.result.json',{...entered,result},lease);}
    catch(error){throw Object.assign(new Error('The host replied, but its full local result could not be retained. Recover the same original operation.'),{code:'REPORTING_CLIENT_OUTCOME_UNKNOWN',outcomeUnknown:true,cause:error,directory:root,result});}
    return {directory:root,prepared,attemptId,result};
  }
  async function execute(prepared,{directory}={}) {
    return withJournal(directory,async(root,lease)=>{
      const checked=await retainedPrepared(root,lease,prepared);
      await inputs(root,lease,checked);
      return attempt(root,lease,checked,'invoke',()=>core.invoke(checked,{requestSignal:signal}));
    });
  }
  async function recover({directory,expectedRequestSha256}={}) {
    return withJournal(directory,async(root,lease)=>{
      const prepared=await loadPrepared(root);
      const observed=await core.operation(prepared.args.operationId,{requestSignal:signal});
      const operation=observed.operation,kind=prepared.tool.slice('merchant_reporting_'.length);
      need(operation&&operation.kind===kind&&operation.beforeProjectSha256===prepared.args.expectedProjectSha256,
        'RECOVERY_CHANGED','Select the original operation kind and full predecessor.');
      if(expectedRequestSha256!==undefined)need(operation.requestSha256===expectedRequestSha256,
        'RECOVERY_CHANGED','The original retained host request fingerprint changed.');
      const requests=operation.publications?.filter(item=>item.format==='request');
      need(requests?.length===1,'RECOVERY_CHANGED','The operation must retain one complete original request publication.');
      const publication=reportingPublication(requests[0]);
      need(publication.operationId===prepared.args.operationId&&publication.file.bytes<=4*1024*1024,
        'RECOVERY_CHANGED','Select the complete original host request within its source limit.');
      await download(publication.publicationId,{directory:join(root,'host-request')});
      const original=await readPrivate(join(root,'host-request',publication.file.name));
      need(original&&original.length===publication.file.bytes&&sha(original)===publication.file.sha256,
        'RECOVERY_CHANGED','The retained host request bytes differ.');
      const envelope=JSON.parse(decode(original));
      need(envelope.schema==='stellar-forge.reporting-agent-request.v1'&&envelope.kind===kind&&equal(envelope.args,prepared.args)&&
        sha(canonicalReportingClientValue(envelope))===operation.requestSha256,'RECOVERY_CHANGED','The host operation contains different original tool arguments.');
      const expected=prepared.args.input?[{role:'input',alias:prepared.args.input,sha256:prepared.args.expectedSha256}]:[];
      if(prepared.args.context)expected.push({role:'context',alias:prepared.args.context,sha256:prepared.args.expectedContextSha256});
      need(Array.isArray(envelope.inputs)&&envelope.inputs.length===expected.length&&equal(envelope.inputs,operation.inputFiles),
        'RECOVERY_CHANGED','Retain every exact original host input.');
      for(let index=0;index<expected.length;index++){
        const wanted=expected[index],actual=envelope.inputs[index];
        need(actual.role===wanted.role&&actual.alias===wanted.alias&&actual.file?.sha256===wanted.sha256,
          'RECOVERY_CHANGED','The original input role, alias or complete digest changed.');
      }
      await retainJSON(root,'recovery-'+operation.requestSha256+'.json',{schema:JOURNAL_SCHEMA,
        clientRequestSha256:prepared.clientRequestSha256,requestSha256:operation.requestSha256,envelope},lease);
      return attempt(root,lease,prepared,'recover',()=>core.recover(prepared,operation,{requestSignal:signal}));
    });
  }
  async function replay({directory}={}) {
    return withJournal(directory,async(root,lease)=>{
      const prepared=await loadPrepared(root);
      await inputs(root,lease,prepared);
      return attempt(root,lease,prepared,'explicit-original-replay',()=>core.invoke(prepared,{requestSignal:signal}));
    });
  }
  let lifetime='open',closing=null,reopening=null,closedResult=null;
  const admitted=new Set();
  function admit(operation){
    if(lifetime!=='open')return Promise.reject(Object.assign(new Error('Finish the original client lifetime transition before admitting more work.'),{code:'REPORTING_CLIENT_LIFETIME',lifetime}));
    const pending=Promise.resolve().then(operation);admitted.add(pending);
    pending.then(()=>admitted.delete(pending),()=>admitted.delete(pending));return pending;
  }
  function close(){
    if(lifetime==='closed')return Promise.resolve(closedResult);
    if(closing)return closing;
    if(reopening)return Promise.reject(Object.assign(new Error('Await the original reopen before closing that lifetime.'),{code:'REPORTING_CLIENT_LIFETIME'}));
    lifetime='closing';
    closing=(async()=>{
      await Promise.allSettled([...admitted]);
      const result=await core.close({requestSignal:signal});
      closedResult=result;lifetime='closed';return result;
    })().catch(error=>{closing=null;throw error;});
    return closing;
  }
  function reopen(){
    if(lifetime==='closing')return Promise.reject(Object.assign(new Error('Finish or retry the original close before reopening.'),{code:'REPORTING_CLIENT_LIFETIME'}));
    if(reopening)return reopening;
    if(admitted.size)return Promise.reject(Object.assign(new Error('Finish admitted request and file work before explicitly reopening the same native store.'),{code:'REPORTING_CLIENT_LIFETIME'}));
    const previous=lifetime;lifetime='reopening';
    reopening=core.open({requestSignal:signal}).then(result=>{lifetime='open';closing=null;closedResult=null;return result;},
      error=>{lifetime=previous;throw error;}).finally(()=>{reopening=null;});
    return reopening;
  }
  return Object.freeze({
    selection:core.selection,
    workspaces:(...args)=>admit(()=>core.workspaces(...args)),
    status:(...args)=>admit(()=>core.status(...args)),
    readAll:(...args)=>admit(()=>core.readAll(...args)),
    inspectInput:(...args)=>admit(()=>core.inspectInput(...args)),
    operation:(...args)=>admit(()=>core.operation(...args)),
    publication:(...args)=>admit(()=>core.publication(...args)),
    prepare:(...args)=>admit(()=>core.prepare(...args)),
    download:(...args)=>admit(()=>download(...args)),
    execute:(...args)=>admit(()=>execute(...args)),
    recover:(...args)=>admit(()=>recover(...args)),
    replay:(...args)=>admit(()=>replay(...args)),
    reopen,close
  });
}
