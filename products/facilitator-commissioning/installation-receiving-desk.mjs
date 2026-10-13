// SPDX-License-Identifier: MIT
// Explicit customer controls over the original borrowed Installation services.
import {join} from 'node:path';
import {readdir} from 'node:fs/promises';
import {createHash} from 'node:crypto';
import {GrantWorkspaceClient} from '../../stellar/scf_2026/sf47_budget_model/workspace/agent-client.mjs';
import {readInstallationReceivingHost} from './installation-receiving-cli.mjs';
import {openInstallationReceiving,RECEIVING_SCHEMA} from './installation-receiving.mjs';
import {readWorkflowSeriesPrivateFile} from '../../stellar-forge/mcp-merchant-operator/workflow-series-connection.mjs';
import {writeConsoleWorkflowFile} from '../../stellar-forge/mcp-merchant-operator/console/client-files.mjs';

export const NATIVE_DESK_SCHEMA='stellar-forge.facilitator-installation-native-desk.v1';
export const NATIVE_DESK_ACTIONS=['installation-preview','installation-save','installation-export','installation-receive'];
const UUID=/^[a-f0-9]{8}(?:-[a-f0-9]{4}){3}-[a-f0-9]{12}$/,ALIAS=/^[a-z0-9][a-z0-9_-]{0,63}$/,HASH=/^[a-f0-9]{64}$/;
const PART=16*1024*1024,MAX=512*1024*1024;
const object=x=>x!==null&&typeof x==='object'&&!Array.isArray(x);
const stable=x=>JSON.stringify(x,(_k,v)=>object(v)?Object.fromEntries(Object.keys(v).sort().map(k=>[k,v[k]])):v);
const sha=x=>createHash('sha256').update(x).digest('hex'),encode=x=>Buffer.from(JSON.stringify(x,null,2)+'\n');
function need(ok,message,code='INSTALLATION_NATIVE_DESK'){if(!ok)throw Object.assign(new Error(message),{code,status:409});}
function exact(x,keys){need(object(x)&&Object.keys(x).length===keys.length&&keys.every(k=>Object.hasOwn(x,k)),'Use the complete original native Installation command.');}
function id(x){need(typeof x==='string'&&UUID.test(x),'Keep the original operation UUID.');return x;}
function text(x,label,max){need(typeof x==='string'&&x.trim()&&x.length<=max&&!/[\x00-\x08\x0b\x0c\x0e-\x1f]/.test(x),label+' is required.');return x;}
async function json(path,optional=false){try{return JSON.parse(new TextDecoder('utf-8',{fatal:true}).decode(await readWorkflowSeriesPrivateFile(path,16*1024*1024)));}catch(e){if(optional&&e.code==='ENOENT')return null;throw e;}}
function workspace(x){return{directory:x.directory,selectionSha256:x.selectionSha256,label:x.label};}
function hostIdentity(host){return{directory:host.directory,source:workspace(host.source),receiving:workspace(host.receiving)};}
function safeName(x){need(typeof x==='string'&&x.length>0&&x.length<2000&&!x.startsWith('/')&&!x.includes('\\')&&!x.split('/').some(v=>!v||v==='.'||v==='..')&&!/[\x00-\x1f]/.test(x),'Select a complete declared native file.');return x;}
function pages(items,offset,limit){need(Number.isSafeInteger(offset)&&offset>=0&&Number.isSafeInteger(limit)&&limit>=1&&limit<=250,'Choose a page of 1–250 original records.');return{items:items.slice(offset,offset+limit),offset,limit,total:items.length,next_offset:offset+limit<items.length?offset+limit:null};}

/** Called only inside the existing commissioning operator queue. */
export function createInstallationReceivingDesk({ui,installation,hosts={}}){
  const connections=new Map();let stopped=false;
  const path=operationId=>join(ui,'native-requests',id(operationId)+'.json');
  async function retainBytes(body){
    need(Buffer.isBuffer(body)&&body.length<=MAX,'Keep a complete native file within 512 MiB.');
    const parts=[];
    for(let start=0;start<body.length;start+=PART){
      const bytes=body.subarray(start,Math.min(start+PART,body.length)),sha256=sha(bytes);
      await writeConsoleWorkflowFile(join(ui,'inputs',sha256),bytes);parts.push({bytes:bytes.length,sha256});
    }
    return{bytes:body.length,sha256:sha(body),parts};
  }
  async function bytes(ref){
    need(object(ref)&&HASH.test(ref.sha256)&&Number.isSafeInteger(ref.bytes)&&ref.bytes>=0&&ref.bytes<=MAX&&Array.isArray(ref.parts),'Retain the complete native file identity.');
    let count=0;const chunks=[];
    for(const p of ref.parts){
      need(HASH.test(p.sha256)&&Number.isInteger(p.bytes)&&p.bytes>0&&p.bytes<=PART,'A native file part identity is invalid.');
      const body=await readWorkflowSeriesPrivateFile(join(ui,'inputs',p.sha256),PART);
      need(body.length===p.bytes&&sha(body)===p.sha256,'A retained original native file changed.');count+=body.length;need(count<=ref.bytes,'Native part lengths exceed the original file.');chunks.push(body);
    }
    const body=Buffer.concat(chunks);need(count===ref.bytes&&sha(body)===ref.sha256,'The complete original native file changed.');return body;
  }
  async function host(alias){
    need(ALIAS.test(alias??'')&&hosts[alias],'Choose a host-declared original Grant receiving connection.','INSTALLATION_HOST_REQUIRED');
    const config=await readInstallationReceivingHost(hosts[alias].file);
    return config;
  }
  async function connection(alias,expected){
    need(!stopped,'The original Installation desk is closing.');
    const config=await host(alias),identity=hostIdentity(config);
    need(stable(identity)===stable(expected),'The selected original source or receiving workspace changed. Restore its original journal and workspace before continuing.','INSTALLATION_HOST_CHANGED');
    const known=connections.get(alias);
    if(known){need(stable(known.identity)===stable(identity),'The original receiving host changed during this operation.');return known;}
    const sourceClient=new GrantWorkspaceClient(config.source),receivingClient=new GrantWorkspaceClient(config.receiving);
    let bridge;
    try{bridge=await openInstallationReceiving({directory:config.directory,sourceClient,receivingClient,sourceBinding:config.source,receivingBinding:config.receiving});}
    catch(error){const errors=[error];for(const client of [sourceClient,receivingClient])try{await client.close();}catch(e){errors.push(e);}throw errors.length>1?new AggregateError(errors,'Opening and closing the borrowed Installation clients failed.'):error;}
    if(typeof bridge.snapshot!=='function'||typeof bridge.restore!=='function'){
      const errors=[];try{await bridge.close();}catch(e){errors.push(e);}for(const client of [sourceClient,receivingClient])try{await client.close();}catch(e){errors.push(e);}
      const error=Object.assign(new Error('Install the complete original receiving bridge with journal snapshot and restore before this native phase.'),{code:'INSTALLATION_RECEIVING_SOURCE_REQUIRED',status:409});
      if(errors.length)throw new AggregateError([error,...errors],'The original receiving source and client close both failed.');throw error;
    }
    const result={config,identity,sourceClient,receivingClient,bridge};connections.set(alias,result);return result;
  }
  function checkCommand(command){
    need(NATIVE_DESK_ACTIONS.includes(command.action),'Select an original native Installation action.');
    id(command.operationId);need(Number.isSafeInteger(command.expectedRevision)&&command.expectedRevision>=0,'Retain the original job revision.');
    const p=command.payload;
    if(command.action==='installation-preview'){
      exact(p,['hostAlias','preparationOperationId','actor','note','receivingName']);id(p.preparationOperationId);
      text(p.actor,'Recording operator',300);text(p.note,'Installation reason',12000);text(p.receivingName,'Receiving case name',300);
    }else{exact(p,['receivingOperationId','expectedSnapshotSha256']);id(p.receivingOperationId);need(HASH.test(p.expectedSnapshotSha256),'Select the exact displayed native observation.');}
    return p;
  }
  async function original(operationId,current){
    const value=await json(path(operationId));
    need(value.schema===NATIVE_DESK_SCHEMA+'.binding'&&value.command.operationId===operationId&&value.command.action==='installation-preview'&&
      value.jobId===current.id&&value.selectionSha256===current.selectionSha256&&value.logicalSha256===sha(stable(value.command)),
      'Select this job’s exact original native receiving operation.','INSTALLATION_NATIVE_BINDING');
    return value;
  }
  async function binding(command,current){
    const p=checkCommand(command),previous=await json(path(command.operationId),true),logicalSha256=sha(stable(command));
    if(previous){
      need(previous.schema===NATIVE_DESK_SCHEMA+'.binding'&&previous.logicalSha256===logicalSha256&&stable(previous.command)===stable(command)&&
        previous.jobId===current.id&&previous.selectionSha256===current.selectionSha256,'This UUID retains a different complete native Installation command.','REQUEST_CONFLICT');
      return previous;
    }
    need(current.revision===command.expectedRevision,'Refresh the original job before preparing this native Installation action.','REVISION_CONFLICT');
    let selected;
    if(command.action==='installation-preview'){
      const prepared=await installation.restorePackage(p.preparationOperationId),hostConfig=await host(p.hostAlias);
      const detail=await installation.view(p.preparationOperationId,{kind:'summary',offset:0,limit:50});
      need(detail.preparation.mode==='prepare'&&prepared.jobId===current.id&&prepared.selectionSha256===current.selectionSha256,
        'Select a complete prepared Installation from this same original job.');
      selected={receivingOperationId:command.operationId,hostAlias:p.hostAlias,host:hostIdentity(hostConfig),
        preparationOperationId:p.preparationOperationId,preparation:prepared.receipt,basis:detail.preparation.basis};
    }else{
      const preview=await original(p.receivingOperationId,current),reviewed=await selectedObservation(p.receivingOperationId,current,p.expectedSnapshotSha256);
      const required={'installation-save':'preview','installation-export':'save','installation-receive':'export'}[command.action];
      need(reviewed.snapshot.summary.responses[required]?.validated,'Review the complete accepted prior native phase before this action.','INSTALLATION_PHASE_REQUIRED');
      selected={receivingOperationId:preview.receivingOperationId,hostAlias:preview.hostAlias,host:preview.host,
        preparationOperationId:preview.preparationOperationId,preparation:preview.preparation,basis:preview.basis,reviewedSnapshot:reviewed.observation.snapshot};
    }
    const value={schema:NATIVE_DESK_SCHEMA+'.binding',logicalSha256,command,jobId:current.id,selectionSha256:current.selectionSha256,...selected};
    await writeConsoleWorkflowFile(path(command.operationId),value);return value;
  }
  function summary(value){
    return{operationId:value.operationId,state:value.state,basis:value.basis,preparation:value.preparation,
      responses:Object.fromEntries(Object.entries(value.responses).map(([name,r])=>[name,{validated:r.validated,bytes:r.bytes,sha256:r.sha256,mediaType:r.mediaType}])),
      completion:value.completion??null,errorCount:value.errors.length};
  }
  async function capture(bridge,bound){
    const value=await bridge.read(bound.receivingOperationId);
    need(value.operationId===bound.receivingOperationId&&value.preparation.sha256===bound.preparation.sha256&&value.preparation.bytes===bound.preparation.bytes&&
      stable(value.intent.owner.source)===stable(bound.host.source)&&stable(value.intent.owner.receiving)===stable(bound.host.receiving),
      'The native journal belongs to another complete original preparation or workspace.');
    const nativeJournal=await bridge.snapshot(bound.receivingOperationId);
    need(nativeJournal.schema===RECEIVING_SCHEMA+'.snapshot'&&HASH.test(nativeJournal.contentSha256??'')&&nativeJournal.operationId===bound.receivingOperationId&&nativeJournal.preparation.sha256===bound.preparation.sha256&&nativeJournal.preparation.bytes===bound.preparation.bytes&&
      stable(nativeJournal.owner.source)===stable(bound.host.source)&&stable(nativeJournal.owner.receiving)===stable(bound.host.receiving),
      'The complete original native journal belongs to another preparation or inspected workspace.');
    const journal=await retainBytes(encode(nativeJournal));
    const files=[{name:'native-journal.json',...journal,contentType:'application/json'}],names=['operation.json','intent.json'];
    if(value.saveRequest)names.push('save-request.json');
    if(value.receiveRequest)names.push('receive-request.json');
    if(value.completion)names.push('RECEIVED.json');
    const phaseNames={preview:'native-preview.json',save:'native-save.json',export:'complete-case.zip',receive:'native-receive.json'};
    for(const [phase,name]of Object.entries(phaseNames))if(value.responses[phase])names.push(name);
    for(const e of value.errors)names.push(e.filename);
    // The native saved/received editions may follow their acceptance after an interrupted read.
    for(const name of ['original-saved-edition.json','independently-received-edition.json']){
      try{const f=await bridge.file(bound.receivingOperationId,name);files.push({name,...await retainBytes(f.body),contentType:f.contentType});}
      catch(e){if(e.code!=='ENOENT'&&!(e.code==='INSTALLATION_RECEIVING'&&e.message==='The original response has not returned for this phase.'))throw e;}
    }
    for(const name of names){
      const f=await bridge.file(bound.receivingOperationId,name);
      need(f.body.length===f.bytes&&sha(f.body)===f.sha256,'The native client returned different complete file bytes.');
      files.push({name,...await retainBytes(f.body),contentType:f.contentType});
    }
    const snapshot={schema:NATIVE_DESK_SCHEMA+'.snapshot',jobId:bound.jobId,selectionSha256:bound.selectionSha256,
      receivingOperationId:bound.receivingOperationId,hostAlias:bound.hostAlias,host:bound.host,
      preparationOperationId:bound.preparationOperationId,observedAt:new Date().toISOString(),summary:summary(value),journal,files};
    const identity=await retainBytes(encode(snapshot));
    const prefix=bound.receivingOperationId+'-';
    const previous=(await readdir(join(ui,'installation-observations'))).filter(n=>n.startsWith(prefix)&&/^[0-9]{10}\.json$/.test(n.slice(prefix.length))).sort();
    const sequence=previous.length?Number(previous.at(-1).slice(prefix.length,-5))+1:1;
    const observation={schema:NATIVE_DESK_SCHEMA+'.observation',operationId:bound.command.operationId,receivingOperationId:bound.receivingOperationId,
      jobId:bound.jobId,selectionSha256:bound.selectionSha256,sequence,snapshot:identity};
    await writeConsoleWorkflowFile(join(ui,'installation-observations',prefix+String(sequence).padStart(10,'0')+'.json'),observation);
    return{...summary(value),snapshot:identity};
  }
  async function execute(command,current){
    const bound=await binding(command,current),c=await connection(bound.hostAlias,bound.host);
    const originalBound=await original(bound.receivingOperationId,current);
    const p=originalBound.command.payload;
    let result,error;
    try{
      const retained=(await retainedSnapshots(current)).filter(x=>x.bound.receivingOperationId===bound.receivingOperationId).at(-1);
      if(retained){
        need(retained.snapshot.journal,'Select the complete original native journal before continuation.','INSTALLATION_JOURNAL_REQUIRED');
        const snapshot=JSON.parse(new TextDecoder('utf-8',{fatal:true}).decode(await bytes(retained.snapshot.journal)));
        need(snapshot.schema===RECEIVING_SCHEMA+'.snapshot'&&HASH.test(snapshot.contentSha256??'')&&snapshot.operationId===bound.receivingOperationId&&snapshot.preparation.sha256===bound.preparation.sha256&&
          stable(snapshot.owner.source)===stable(bound.host.source)&&stable(snapshot.owner.receiving)===stable(bound.host.receiving),
          'The retained native journal belongs to another original operation.');
        await c.bridge.restore(snapshot);
      }
      if(command.action==='installation-preview'){
        const prepared=await installation.restorePackage(bound.preparationOperationId);
        need(stable(prepared.receipt)===stable(bound.preparation),'The original complete preparation changed.');
        await c.sourceClient.open({expectedSelectionSha256:c.config.source.selectionSha256});
        result=await c.bridge.prepare({operationId:bound.receivingOperationId,preparationDirectory:prepared.directory,expectedPreparationSha256:bound.preparation.sha256,
          actor:p.actor,note:p.note,receivingName:p.receivingName});
      }else{
        if(command.action==='installation-receive')await c.receivingClient.open({expectedSelectionSha256:c.config.receiving.selectionSha256});
        else await c.sourceClient.open({expectedSelectionSha256:c.config.source.selectionSha256});
        result=await c.bridge[{'installation-save':'save','installation-export':'export','installation-receive':'receive'}[command.action]](bound.receivingOperationId);
      }
    }catch(e){error=e;}
    let observed;
    try{observed=await capture(c.bridge,bound);}
    catch(e){if(error)throw new AggregateError([error,e],'The original native action and its complete observation both failed.');throw e;}
    if(error){error.installationObservation=observed;throw error;}
    need(result.operationId===bound.receivingOperationId,'The native result belongs to another original operation.');
    return{schema:NATIVE_DESK_SCHEMA,receivingOperationId:bound.receivingOperationId,hostAlias:bound.hostAlias,
      preparationOperationId:bound.preparationOperationId,...observed};
  }
  async function retainedSnapshots(current){
    const rows=[];
    for(const name of (await readdir(join(ui,'installation-observations'))).filter(n=>/^[a-f0-9-]{36}-[0-9]{10}\.json$/.test(n)).sort()){
      const observation=await json(join(ui,'installation-observations',name));
      need(observation.schema===NATIVE_DESK_SCHEMA+'.observation'&&observation.jobId===current.id&&observation.selectionSha256===current.selectionSha256,
        'The native observation belongs to another original job.');
      const bound=await original(observation.receivingOperationId,current),phase=await json(path(observation.operationId));
      need(phase.schema===NATIVE_DESK_SCHEMA+'.binding'&&phase.command.operationId===observation.operationId&&phase.receivingOperationId===bound.receivingOperationId&&
        phase.jobId===current.id&&phase.selectionSha256===current.selectionSha256&&phase.logicalSha256===sha(stable(phase.command)),
        'The native observation differs from its original complete outer command.');
      const snapshot=JSON.parse(new TextDecoder('utf-8',{fatal:true}).decode(await bytes(observation.snapshot)));
      need(snapshot.schema===NATIVE_DESK_SCHEMA+'.snapshot'&&snapshot.jobId===current.id&&snapshot.selectionSha256===current.selectionSha256&&
        snapshot.receivingOperationId===bound.receivingOperationId&&stable(snapshot.host)===stable(bound.host),
        'The retained complete native observation changed.');
      rows.push({observation,snapshot,bound,phase});
    }
    return rows.sort((a,b)=>a.observation.sequence-b.observation.sequence);
  }
  async function selectedObservation(operationId,current,expectedSnapshotSha256){
    id(operationId);let rows=(await retainedSnapshots(current)).filter(x=>x.bound.receivingOperationId===operationId);
    if(expectedSnapshotSha256){need(HASH.test(expectedSnapshotSha256),'Select an exact native observation SHA256.');rows=rows.filter(x=>x.observation.snapshot.sha256===expectedSnapshotSha256);}
    need(rows.length,'Recover the original native command or select its retained observation.','INSTALLATION_NATIVE_PENDING');
    return rows.at(-1);
  }
  return{
    binding,execute,
    async catalog(current){
      const latest=new Map();
      for(const row of await retainedSnapshots(current))latest.set(row.bound.receivingOperationId,row);
      const pending=[];
      for(const name of (await readdir(join(ui,'native-requests'))).filter(n=>UUID.test(n.slice(0,-5))&&n.endsWith('.json'))){
        const b=await json(join(ui,'native-requests',name));
        if(b.schema===NATIVE_DESK_SCHEMA+'.binding'&&b.command.action==='installation-preview'&&b.jobId===current.id&&b.selectionSha256===current.selectionSha256&&!latest.has(b.receivingOperationId))
          pending.push({receivingOperationId:b.receivingOperationId,preparationOperationId:b.preparationOperationId,hostAlias:b.hostAlias,state:'PENDING',basis:b.basis,observedAt:null});
      }
      return{schema:NATIVE_DESK_SCHEMA,jobId:current.id,selectionSha256:current.selectionSha256,
        hosts:Object.entries(hosts).map(([alias,v])=>({alias,title:v.title})),
        items:[...latest.values()].map(row=>{const {snapshot,bound}=row;return({receivingOperationId:bound.receivingOperationId,preparationOperationId:bound.preparationOperationId,hostAlias:bound.hostAlias,
          ...snapshot.summary,observedAt:snapshot.observedAt,snapshotSha256:row.observation.snapshot.sha256,outerOperationId:row.observation.operationId,action:row.phase.command.action});}).concat(pending)};
    },
    async view(operationId,current,{kind='summary',offset=0,limit=50,expectedSnapshotSha256}={}){
      const row=await selectedObservation(operationId,current,expectedSnapshotSha256),snapshot=row.snapshot;
      const base={schema:NATIVE_DESK_SCHEMA,jobId:current.id,selectionSha256:current.selectionSha256,receivingOperationId:operationId,
        preparationOperationId:row.bound.preparationOperationId,hostAlias:row.bound.hostAlias,observedAt:snapshot.observedAt,snapshotSha256:row.observation.snapshot.sha256,outerOperationId:row.observation.operationId,action:row.phase.command.action,...snapshot.summary};
      if(kind==='files')return{...base,...pages(snapshot.files.map(({parts,...f})=>f),offset,limit)};
      if(kind==='summary')return{...base,host:row.bound.host,files:snapshot.files.length,originalCommand:row.bound.command,observedCommand:row.phase.command};
      const named={preview:'native-preview.json',saved:'original-saved-edition.json',received:'independently-received-edition.json',operation:'operation.json'}[kind];
      need(named,'Choose summary, files, preview, saved, received or operation.');
      const f=snapshot.files.find(x=>x.name===named);need(f,'This original native phase has not returned a complete file.','INSTALLATION_NATIVE_PENDING');
      return{...base,file:{name:f.name,bytes:f.bytes,sha256:f.sha256},value:JSON.parse(new TextDecoder('utf-8',{fatal:true}).decode(await bytes(f)))};
    },
    async file(operationId,current,name,expectedSnapshotSha256){
      safeName(name);const {snapshot}=await selectedObservation(operationId,current,expectedSnapshotSha256),f=snapshot.files.find(x=>x.name===name);
      need(f,'Choose a complete retained original native file.','INSTALLATION_NATIVE_FILE');
      return{body:await bytes(f),bytes:f.bytes,sha256:f.sha256,filename:name.split('/').pop(),contentType:f.contentType};
    },
    async close(){
      if(stopped)return;stopped=true;const errors=[];
      for(const c of connections.values()){
        try{await c.bridge.close();}catch(e){errors.push(e);}
        for(const client of [c.sourceClient,c.receivingClient])try{await client.close();}catch(e){errors.push(e);}
      }
      if(errors.length)throw new AggregateError(errors,'Closing the borrowed original Installation clients failed.');
    }
  };
}
