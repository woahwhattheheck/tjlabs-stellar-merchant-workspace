// MIT. Complete document-evidence client, Merchant and browser receiving.
// Usage: node receiving.mjs /absolute/private/receiving-config.json
import { open, mkdir, lstat, realpath, readFile, link, unlink } from 'node:fs/promises';
import { constants } from 'node:fs';
import { createHash, randomUUID } from 'node:crypto';
import { dirname, isAbsolute, join, resolve } from 'node:path';
import { fileURLToPath, pathToFileURL } from 'node:url';

const SCHEMA = 'stellar-forge.iati-document-connected-receiving.v1';
const PREFIX = 'merchant_source_iati_document_evidence_';
const SHA = /^[0-9a-f]{64}$/;
const REQUEST = /^[A-Za-z0-9][A-Za-z0-9._:-]{0,159}$/;
const MAX_METADATA = 64 * 1024 * 1024;
const fail = message => Object.assign(new Error(message), { code: 'DOCUMENT_EVIDENCE_RECEIVING' });
const need = (condition, message) => { if (!condition) throw fail(message); };
const hash = value => createHash('sha256').update(value).digest('hex');
const plain = value => value !== null && typeof value === 'object' && !Array.isArray(value);
function ordered(value) {
  if (Array.isArray(value)) return value.map(ordered);
  if (plain(value)) return Object.fromEntries(Object.keys(value).sort().map(key => [key, ordered(value[key])]));
  return value;
}
const canonical = value => JSON.stringify(ordered(value));
const jsonBytes = value => Buffer.from(JSON.stringify(value, null, 2) + '\n');
const equivalent = (left, right) => canonical(left) === canonical(right);
const missing = error => error.code === 'ENOENT';
const positive = value => Number.isSafeInteger(value) && value > 0;

async function directory(path) {
  need(typeof path === 'string' && isAbsolute(path) && !path.includes('\0'), 'Use absolute original host directories.');
  await mkdir(path, { recursive: true, mode: 0o700 });
  const selected = await lstat(path);
  need(selected.isDirectory() && !selected.isSymbolicLink() && await realpath(path) === resolve(path) &&
    (process.platform === 'win32' || !(selected.mode & 0o077)), 'Receiving directories must remain private real directories.');
  return resolve(path);
}
async function digestFile(path) {
  const handle = await open(path, constants.O_RDONLY | (constants.O_NOFOLLOW ?? 0));
  try {
    const first = await handle.stat();
    need(first.isFile(), 'Use a complete regular receiving file.');
    const digest = createHash('sha256'); let bytes = 0;
    for await (const chunk of handle.createReadStream({ autoClose: false })) { bytes += chunk.length; digest.update(chunk); }
    const last = await handle.stat();
    need(first.dev === last.dev && first.ino === last.ino && first.size === last.size &&
      first.mtimeMs === last.mtimeMs && bytes === first.size, 'A receiving file changed while reading.');
    return { bytes, sha256: digest.digest('hex') };
  } finally { await handle.close(); }
}
async function readJSON(path) {
  const handle = await open(path, constants.O_RDONLY | (constants.O_NOFOLLOW ?? 0));
  try {
    const info = await handle.stat();
    need(info.isFile() && info.size <= MAX_METADATA, 'The original receiving JSON must be a complete bounded regular file.');
    const bytes = await handle.readFile();
    need(bytes.length === info.size, 'The receiving JSON changed while reading.');
    return JSON.parse(new TextDecoder('utf-8', { fatal: true }).decode(bytes));
  } finally { await handle.close(); }
}
async function optionalJSON(path) {
  try { return await readJSON(path); } catch (error) { if (missing(error)) return null; throw error; }
}
async function syncDirectory(path) {
  const handle = await open(path, constants.O_RDONLY);
  try { await handle.sync(); } finally { await handle.close(); }
}
async function exactFile(path, bytes) {
  try {
    const current = await digestFile(path);
    need(current.bytes === bytes.length && current.sha256 === hash(bytes), 'Existing receiving output belongs to different complete bytes: ' + path);
    return { path, ...current, reopened: true };
  } catch (error) { if (!missing(error)) throw error; }
  const temporary = join(dirname(path), '.receiving-' + randomUUID());
  let handle;
  try {
    handle = await open(temporary, 'wx', 0o600);
    await handle.writeFile(bytes); await handle.sync(); await handle.close(); handle = null;
    try { await link(temporary, path); }
    catch (error) {
      if (error.code !== 'EEXIST') throw error;
      const current = await digestFile(path);
      need(current.bytes === bytes.length && current.sha256 === hash(bytes), 'A concurrent receiving output differs.');
    }
    await syncDirectory(dirname(path));
    return { path, bytes: bytes.length, sha256: hash(bytes), reopened: false };
  } finally { await handle?.close(); await unlink(temporary).catch(error => { if (!missing(error)) throw error; }); }
}
async function exactJSON(path, value) { return exactFile(path, jsonBytes(value)); }

function identity(value) {
  need(plain(value) && SHA.test(value.id ?? '') && positive(value.revision) && SHA.test(value.recordSha256 ?? ''),
    'Select an actual immutable evidence plan.');
  return {id:value.id,revision:value.revision,recordSha256:value.recordSha256};
}
async function responseFile(response, path) {
  need(response.ok && response.body, 'The original complete file response is unavailable.');
  const sha256 = response.headers.get('x-content-sha256'), rawLength = response.headers.get('content-length');
  need(SHA.test(sha256 ?? '') && /^(0|[1-9][0-9]*)$/.test(rawLength ?? ''), 'The original file response omitted its full descriptor.');
  const expected = Number(rawLength);
  need(Number.isSafeInteger(expected) && expected <= 4 * 1024 ** 3, 'The selected response exceeds its declared native capacity.');
  const temporary = join(dirname(path), '.receiving-' + randomUUID());
  let handle, reader, count = 0;
  const checksum = createHash('sha256');
  try {
    handle = await open(temporary, 'wx', 0o600); reader = response.body.getReader();
    for (;;) {
      const value = await reader.read(); if(value.done) break;
      count += value.value.byteLength;
      need(count <= expected, 'The response exceeded its full original descriptor.');
      checksum.update(value.value); await handle.writeFile(value.value);
    }
    need(count === expected && checksum.digest('hex') === sha256, 'The complete response differs from its original file identity.');
    await handle.sync(); await handle.close(); handle = null;
    try { await link(temporary, path); }
    catch(error) {
      if(error.code !== 'EEXIST') throw error;
      const prior = await digestFile(path);
      need(prior.bytes === count && prior.sha256 === sha256, 'A retained output belongs to different complete bytes.');
    }
    await syncDirectory(dirname(path));
    return {name:path.split('/').at(-1),bytes:count,sha256};
  } finally {
    await reader?.cancel().catch(()=>{}); reader?.releaseLock();
    await handle?.close(); await unlink(temporary).catch(error=>{if(!missing(error))throw error;});
  }
}

export async function runDocumentEvidence(input,{write=value=>process.stdout.write(JSON.stringify(value)+'\n')}={}) {
  const config = typeof input === 'string' ? await readJSON(resolve(input)) : input;
  need(plain(config) && typeof config.operationId === 'string' && REQUEST.test(config.operationId),
    'Use the retained original receiving configuration.');
  for(const key of ['caseDirectory','iatiDirectory','mcpDirectory','senderConnectionFile','receiverConnectionFile','outputDirectory','exportsDirectory'])
    need(typeof config[key] === 'string' && isAbsolute(config[key]), 'Use the original absolute ' + key + '.');
  const output=await directory(config.outputDirectory), files=await directory(join(output,'files')),
    observations=await directory(join(output,'observations'));
  await directory(config.exportsDirectory);
  const native=await readJSON(join(config.caseDirectory,'results','native-receiving.json'));
  need(native.state==='COMPLETE' && native.operationId===config.operationId,'Finish the same original native case first.');
  const {connectIatiWorkspace}=await import(pathToFileURL(join(config.iatiDirectory,'client.mjs')).href);
  const {MerchantSourceWorkspaces,readSourceWorkspaceConfiguration,SOURCE_WORKSPACE_CONNECTION_SCHEMA}=
    await import(pathToFileURL(join(config.mcpDirectory,'source-workspace.mjs')).href);
  const connectionDefinition={schema:SOURCE_WORKSPACE_CONNECTION_SCHEMA,workspaces:{
    sender:{format:'iati',label:'Original document evidence',consoleUrlFile:config.senderConnectionFile,files:{}},
    receiver:{format:'iati',label:'Independent document evidence receiving',consoleUrlFile:config.receiverConnectionFile,files:{original_packet:{path:join(config.caseDirectory,'document-evidence.zip'),kind:'packet'}}}
  }};
  const connectionFile=join(output,'mcp-workspaces-'+hash(jsonBytes(connectionDefinition))+'.json');
  await exactJSON(connectionFile,connectionDefinition);
  const mcpConfig={exportsDirectory:resolve(config.exportsDirectory),sourceWorkspaces:await readSourceWorkspaceConfiguration(connectionFile)};
  let merchant=new MerchantSourceWorkspaces(mcpConfig), sender,receiver,phase='connect',activeRead;
  const report={schema:SCHEMA,operationId:config.operationId,state:'COMPLETE',sourceSha256:native.sourceSha256,
    sender:native.sender,receiver:native.receiver,requests:[],downloads:[]};
  const retained=async(name,value)=>{
    const raw=jsonBytes(value), file=name+'-'+hash(raw)+'.json';
    await exactFile(join(observations,file),raw);return {file:'observations/'+file,bytes:raw.length,sha256:hash(raw)};
  };
  const progress=name=>{phase=name;write({schema:SCHEMA,phase:name});};
  const call=async(alias,action,args={})=>{
    const value=await merchant.call(PREFIX+action,{workspace:alias,...args});
    need(value.workspace===alias,'MCP changed the original workspace alias.');
    return ['export','file','body'].includes(action)?value:value.native;
  };
  const chunk=async(metadata,offset,limit,readId)=>{
    const value=await merchant.call('merchant_source_file_read',{workspace:'sender',exportId:metadata.exportId,
      offset,limit,...(readId===undefined?{}:{readId})});
    need(value.file?.sha256===metadata.sha256&&value.file.bytes===metadata.bytes&&value.offset===offset&&
      value.encoding==='base64'&&typeof value.data==='string','The retained byte cursor changed its original file.');
    const bytes=Buffer.from(value.data,'base64');
    need(bytes.toString('base64')===value.data&&bytes.length===value.bytesRead&&
      bytes.length===Math.min(limit,metadata.bytes-offset)&&value.nextOffset===(offset+bytes.length<metadata.bytes?offset+bytes.length:null),
      'The retained full file read did not advance exactly.');
    return {value,bytes};
  };
  const download=async(metadata,name,releasePrefix=false,discard=false)=>{
    need(SHA.test(metadata.exportId??'')&&metadata.sha256===metadata.exportId&&
      Number.isSafeInteger(metadata.bytes)&&metadata.bytes>=0,'The complete retained export is not identified.');
    const target=join(files,name),temporary=join(files,'.receiving-'+randomUUID());
    let handle,offset=0,count=0,cut=null;
    const checksum=createHash('sha256');
    try {
      if(!discard)handle=await open(temporary,'wx',0o600);
      do {
        const requested=releasePrefix&&count===0?Math.min(4093,Math.max(1,metadata.bytes-1)):65536;
        const {value,bytes}=await chunk(metadata,offset,requested,activeRead);
        activeRead=value.readId;checksum.update(bytes);await handle?.writeFile(bytes);offset+=bytes.length;count++;
        if(value.nextOffset===null){activeRead=undefined;break;}
        if(releasePrefix&&count===1){
          cut={bytes:offset,sha256:hash(bytes)};
          await merchant.call('merchant_source_file_release',{workspace:'sender',readId:activeRead});
          activeRead=undefined;
        }
      }while(true);
      const sha256=checksum.digest('hex');
      need(offset===metadata.bytes&&sha256===metadata.sha256,'The retained complete download differs from its descriptor.');
      if(handle){await handle.sync();await handle.close();handle=null;
        try{await link(temporary,target);}catch(error){if(error.code!=='EEXIST')throw error;
          const old=await digestFile(target);need(old.bytes===offset&&old.sha256===sha256,'A retained download changed.');}
        await syncDirectory(files);
      }
      return {name,bytes:offset,sha256,chunks:count,...(cut?{releasedPrefix:cut,reopenedToCompletion:true}:{})};
    }finally{
      if(activeRead)await merchant.call('merchant_source_file_release',{workspace:'sender',readId:activeRead}).catch(()=>{});
      activeRead=undefined;await handle?.close();
      if(!discard)await unlink(temporary).catch(error=>{if(!missing(error))throw error;});
    }
  };
  const selectedExport=async()=>{
    const path=join(output,'selected-export.json'),previous=await optionalJSON(path);
    if(previous){need(previous.kind==='document-evidence'&&previous.evidence===native.sender.id&&
      previous.revision===native.sender.revision,'The original retained export selection changed.');return previous;}
    let offset=0,snapshot,candidates=[];
    for(;;){
      const page=(await merchant.call('merchant_source_exports',{workspace:'sender',offset,limit:100,
        ...(snapshot?{expectedSnapshot:snapshot}:{})})).native;
      snapshot??=page.snapshot;
      candidates.push(...page.items.filter(x=>x.kind==='document-evidence'&&x.evidence===native.sender.id&&x.revision===native.sender.revision));
      if(page.nextOffset===null)break;need(page.nextOffset>offset,'The retained export inventory did not advance.');offset=page.nextOffset;
    }
    candidates.sort((a,b)=>a.created.localeCompare(b.created)||a.exportId.localeCompare(b.exportId));
    const selected=candidates[0]??await call('sender','export',{id:native.sender.id,revision:native.sender.revision});
    await exactJSON(path,selected);return selected;
  };
  try {
    sender=await connectIatiWorkspace({consoleUrlFile:config.senderConnectionFile});
    receiver=await connectIatiWorkspace({consoleUrlFile:config.receiverConnectionFile});
    const sdk=sender.documentEvidence,rsdk=receiver.documentEvidence;
    need(sdk&&rsdk,'The complete installed client omitted document evidence.');
    for(const [alias,api,expected]of[['sender',sdk,native.senderWorkspaceSha256],['receiver',rsdk,native.receiverWorkspaceSha256]]){
      const a=await api.status(),b=await call(alias,'status');
      need(a.workspaceSha256===expected&&b.workspaceSha256===expected,'An original workspace connection changed.');
    }
    const selected=await sdk.plan(native.sender.id,{revision:native.sender.revision});
    need(equivalent(identity(selected),native.sender)&&equivalent(identity(await rsdk.plan(native.receiver.id)),native.receiver),
      'The original native sender or receiving edition changed.');
    progress('complete-snapshot-and-detail');
    const rows=[];
    for await(const page of sdk.rowPages(selected.id,{revision:selected.revision,limit:1})){
      const through=await call('sender','rows',{id:selected.id,revision:selected.revision,offset:page.offset,limit:page.limit,
        expectedSnapshot:page.snapshotSha256});
      need(equivalent(through.rows,page.rows)&&through.snapshotSha256===page.snapshotSha256,'SDK and Merchant selected different native rows.');
      rows.push(...page.rows);
      for(const row of page.rows){
        const detail=await sdk.detail(selected.id,{revision:selected.revision,rowId:row.id,expectedSnapshot:page.snapshotSha256});
        const mcp=await call('sender','detail',{id:selected.id,revision:selected.revision,rowId:row.id,expectedSnapshot:page.snapshotSha256});
        need(equivalent(detail,mcp),'Complete evidence detail differs across the installed client and Merchant.');
        await retained('document-detail',detail);
      }
    }
    need(rows.length===native.selectedDocumentRows,'The selected native document register is incomplete.');
    report.documents=rows.length;
    const clientHistory=await sdk.history(selected.id), merchantHistory=[];
    need(Array.isArray(clientHistory.history),'The complete SDK history is missing.');
    let historyOffset=0,historySnapshot,historyTotal;
    for(;;){
      const page=await call('sender','history',{id:selected.id,offset:historyOffset,limit:100,
        ...(historySnapshot?{expectedSnapshot:historySnapshot}:{})});
      need(Array.isArray(page.items)&&page.offset===historyOffset&&SHA.test(page.snapshot??'')&&
        Number.isSafeInteger(page.total)&&page.total>=0&&
        (historySnapshot===undefined||page.snapshot===historySnapshot)&&
        (historyTotal===undefined||page.total===historyTotal),
        'The original Merchant history page changed.');
      historySnapshot??=page.snapshot;historyTotal??=page.total;
      merchantHistory.push(...page.items);
      need(merchantHistory.length<=historyTotal,'The Merchant history exceeded its selected inventory.');
      if(page.nextOffset===null){
        need(merchantHistory.length===historyTotal,'The complete Merchant history ended early.');
        break;
      }
      need(page.items.length>0&&page.nextOffset===historyOffset+page.items.length,
        'The Merchant history cursor did not advance exactly.');
      historyOffset=page.nextOffset;
    }
    need(equivalent(clientHistory.history,merchantHistory),'Complete SDK and Merchant histories differ.');
    await retained('history',clientHistory);
    for(const [name,clientValue,merchantValue] of [
      ['comparison',await sdk.comparison(native.comparisonId),await call('sender','comparison',{id:native.comparisonId})],
      ['correction',await sdk.correction(selected.id,{revision:selected.revision}),
        await call('sender','correction',{id:selected.id,revision:selected.revision})]
    ]){
      need(equivalent(clientValue,merchantValue),'Complete '+name+' differs across SDK and Merchant.');
      await retained(name,clientValue);
    }
    progress('same-original-request-replay');
    const requestDirectory=join(config.caseDirectory,'requests');
    const {readdir}=await import('node:fs/promises');
    for(const name of (await readdir(requestDirectory)).filter(name=>name.endsWith('.json')).sort()){
      if(name==='organisation-save.json'||name==='receiver-note.json')continue;
      const action=name.startsWith('observation-')?'observe':name==='evidence-save.json'?'save':
        name==='evidence-review.json'?'review':name==='evidence-compare.json'?'compare':name==='sender-note.json'?'note':null;
      if(!action)continue;
      const input=await readJSON(join(requestDirectory,name)),record=await sdk.request(input.requestId);
      need(record.state==='RECORDED'&&record.action===action&&equivalent(record.input,input),'The original saved request differs.');
      const through=await call('sender','request',{requestId:input.requestId});
      need(equivalent(through,record),'MCP recovery changed an original request.');
      const replay=await call('sender',action,{definition:input});
      need(equivalent(replay,record.result),'An original action replay changed its retained result.');
      report.requests.push({action,requestId:input.requestId});
    }
    need(equivalent(identity(await sdk.plan(selected.id)),native.sender),'Historical replay displaced the current sender.');
    progress('complete-native-downloads');
    for(const kind of ['report','register','plan',...(native.correctionPrepared?['correction']:[])]){
      const result=await responseFile(await sdk.file(selected.id,kind,{revision:selected.revision}),join(files,'client-'+kind+(kind==='report'?'.html':kind==='register'?'.csv':'.json')));
      report.downloads.push(result);
      const member=await call('sender','file',{id:selected.id,revision:selected.revision,kind});
      report.downloads.push(await download(member,'merchant-'+kind+'-'+member.sha256+(kind==='report'?'.html':kind==='register'?'.csv':'.json')));
    }
    for(const observation of native.observations){
      const actual=await sdk.observation(observation.id);
      need(actual.documentComplete===observation.documentComplete&&equivalent(actual.body,observation.body),'Native observation identity changed.');
      need(equivalent(actual,await call('sender','observation',{id:actual.id})),
        'The full captured observation differs across SDK and Merchant.');
      if(!actual.body)continue;
      const clientBody=await responseFile(await sdk.body(actual.id),join(files,'client-body-'+actual.id+'.bin'));
      need(clientBody.bytes===actual.body.bytes&&clientBody.sha256===actual.body.sha256,
        'The complete SDK body differs from the original native capture.');
      report.downloads.push(clientBody);
      const body=await call('sender','body',{observationId:actual.id});
      need(body.bodyComplete===actual.body.complete&&body.documentComplete===actual.documentComplete&&
        body.bytes===actual.body.bytes&&body.sha256===actual.body.sha256,
        'The Merchant body differs from the native capture or its complete versus prefix semantics.');
      const merchantBody=await download(body,'merchant-body-'+actual.id+'.bin');
      need(merchantBody.bytes===clientBody.bytes&&merchantBody.sha256===clientBody.sha256,
        'The two complete connected body downloads differ.');
      report.downloads.push(merchantBody);
      if(native.following?.observationId===actual.id){
        need(actual.documentComplete===true&&actual.body.complete===true&&actual.body.bytes>0&&
          native.following.nativeBody.bytes===clientBody.bytes&&native.following.nativeBody.sha256===clientBody.sha256,
          'The following connected programme requires the same complete public document body.');
        report.following={base:native.following.base,observationId:actual.id,publishedUrl:actual.publishedUrl,
          nativeBody:native.following.nativeBody,clientBody,merchantBody,reviewDecision:'deferred'};
      }
    }
    if(native.following){
      need(report.following?.observationId===native.following.observationId,
        'The complete following document was not received through both connected interfaces.');
      const old=await sdk.plan(native.following.originalRecipient.id,{revision:native.following.originalRecipient.revision});
      need(equivalent(identity(old),native.following.originalRecipient),
        'The original recipient local-note edition changed during connected receiving.');
      const detail=await sdk.detail(selected.id,{revision:selected.revision,rowId:native.following.rowId});
      need(detail.row.decision?.decision==='deferred'&&detail.row.decision.observationId===native.following.observationId,
        'The following capture lost its named deferred review.');
    }
    progress('portable-export-prefix-reopen-and-receive');
    const exported=await selectedExport();
    report.packet=await download(exported,'document-evidence-'+exported.sha256+'.zip',true);
    const received=await call('receiver','receive',{exportId:exported.exportId,fromWorkspace:'sender'});
    need(equivalent(identity(received.plan),native.sender)&&equivalent(identity(received.currentPlan),native.receiver),
      'Full Merchant receiving displaced later recipient work.');
    const {createReadStream}=await import('node:fs'), originalPacket=join(config.caseDirectory,'document-evidence.zip'),
      descriptor=await digestFile(originalPacket),stream=createReadStream(originalPacket);
    let receivedSDK;
    try{receivedSDK=await rsdk.receive({body:stream,bytes:descriptor.bytes});}finally{stream.destroy();}
    need(receivedSDK.packet.sha256===descriptor.sha256&&equivalent(identity(receivedSDK.currentPlan),native.receiver),
      'Streamed native SDK receive changed the original packet or current recipient.');
    await merchant.close();merchant=new MerchantSourceWorkspaces(mcpConfig);
    report.reopenedExport=await download(exported,'original-retained-export-reopened.zip',false,true);
    need(equivalent(identity(await rsdk.plan(native.receiver.id)),native.receiver),'MCP close/reopen lost current receiving work.');
    if(config.browser){
      progress('actual-browser-workspace');
      const {inspectDocumentEvidenceBrowser}=await import('./browser.mjs');
      const originalBrowser=await optionalJSON(join(output,'browser-result.json'));
      if(originalBrowser){
        need(originalBrowser.state==='COMPLETE'&&originalBrowser.planId===selected.id&&originalBrowser.revision===selected.revision,
          'The retained browser result belongs to a different saved edition.');
        for(const item of originalBrowser.observations){
          const proof=await digestFile(join(output,'browser',item.name));
          need(proof.bytes===item.bytes&&proof.sha256===item.sha256,'A complete original browser image is missing or changed.');
        }
        report.browser=originalBrowser;
      }else{
        report.browser=await inspectDocumentEvidenceBrowser({connectionFile:config.senderConnectionFile,
          outputDirectory:join(output,'browser'),planId:selected.id,revision:selected.revision,...config.browser});
        await exactJSON(join(output,'browser-result.json'),report.browser);
      }
    }
    await exactJSON(join(output,'complete.json'),report);write(report);return report;
  }catch(error){
    const failure={schema:SCHEMA,state:'INTERRUPTED',phase,operationId:config.operationId,code:error.code??null,error:String(error.message??error)};
    await retained('interrupted',failure);write(failure);throw error;
  }finally{await merchant.close();await sender?.dispose();await receiver?.dispose();}
}
if(process.argv[1]&&resolve(process.argv[1])===fileURLToPath(import.meta.url))
  runDocumentEvidence(process.argv[2]).catch(error=>{process.stderr.write(String(error.stack??error)+'\n');process.exitCode=1;});
