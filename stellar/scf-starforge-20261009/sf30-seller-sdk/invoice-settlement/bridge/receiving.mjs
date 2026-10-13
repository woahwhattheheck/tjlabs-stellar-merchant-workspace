#!/usr/bin/env node
// MIT. Complete Bridge evidence receiving through the original Invoice package.
import {promises as fs,constants as C} from 'node:fs';
import path from 'node:path';
import {pathToFileURL} from 'node:url';
import {createHash,randomUUID} from 'node:crypto';
import {files,privateDirectory,withLock} from '../common.mjs';
import {inspectInvoiceDelivery,receiveInvoiceDelivery} from '../receiving.mjs';
import {openBridgeOperator} from './operator.mjs';
import {parseProviderJSON} from './bridge-webhook.mjs';
import {stableJSON,sourceHash} from '../../settlement-audit/native-http.mjs';
const SCHEMA='stellar-forge.invoice-settlement.bridge-receiving.v1';
const ROOT='stellar/scf-starforge-20261009/sf30-seller-sdk/invoice-settlement';
const hash=raw=>createHash('sha256').update(raw).digest('hex');
const json=value=>Buffer.from(stableJSON(value)+'\n');
function need(ok,code,message){if(!ok)throw Object.assign(new Error(message),{code});}
function abs(value){need(typeof value==='string'&&path.isAbsolute(value)&&path.normalize(value)===value,'ABSOLUTE_PATH_REQUIRED','Use normalized absolute original paths.');return value;}
function uuid(value){need(typeof value==='string'&&/^[a-f0-9]{8}-[a-f0-9]{4}-[1-5][a-f0-9]{3}-[89ab][a-f0-9]{3}-[a-f0-9]{12}$/i.test(value),'REQUEST_ID_REQUIRED','Freeze each original UUID request before the first call.');return value;}
function check(signal){if(signal?.aborted)throw signal.reason??new Error('Original receiving interrupted.');}
function normalize(input){
  need(input?.schema===SCHEMA+'.input','INVALID_INPUT','Select the complete original Bridge receiving input.');
  const x={schema:input.schema,operationId:uuid(input.operationId),workspaceId:uuid(input.workspaceId),
    sourceWorkspace:abs(input.sourceWorkspace),outputDirectory:abs(input.outputDirectory),
    exportDirectory:abs(input.exportDirectory),receivedDirectory:abs(input.receivedDirectory),
    reexportDirectory:abs(input.reexportDirectory),selection:input.selection,
    expectedRevision:input.expectedRevision,exportRequestId:uuid(input.exportRequestId),
    receiveRequestId:uuid(input.receiveRequestId),reexportRequestId:uuid(input.reexportRequestId)};
  need(Number.isSafeInteger(x.expectedRevision)&&x.expectedRevision>=0,'REVISION_REQUIRED','Freeze the producing workspace revision.');
  const roots=[x.sourceWorkspace,x.outputDirectory,x.exportDirectory,x.receivedDirectory,x.reexportDirectory];
  need(new Set(roots).size===roots.length&&roots.every((a,i)=>roots.every((b,j)=>i===j||!a.startsWith(b+path.sep))),
    'OVERLAPPING_ROOTS','Select five separate roots; retain input/output outside all original workspace and package roots.');
  need(new Set([x.operationId,x.exportRequestId,x.receiveRequestId,x.reexportRequestId]).size===4,'REQUEST_ID_CONFLICT','Give each distinct original operation its own UUID.');
  need(input.selection&&typeof input.selection==='object','SOURCE_SELECTION_REQUIRED','Supply the exact retained public Bridge identity.');
  return x;
}
async function regular(filename,maximum=16*1024*1024){
  const h=await fs.open(filename,C.O_RDONLY|C.O_NOFOLLOW);
  let first,raw,error;
  try {
    first=await h.stat();need(first.isFile()&&first.size<=maximum,'INVALID_FILE','Select a bounded regular retained file.');
    raw=await h.readFile();const after=await h.stat(),named=await fs.lstat(filename);
    need(raw.length===first.size&&first.dev===after.dev&&first.ino===after.ino&&first.size===after.size&&first.mtimeMs===after.mtimeMs&&first.ctimeMs===after.ctimeMs&&
      !named.isSymbolicLink()&&named.dev===first.dev&&named.ino===first.ino,'FILE_CHANGED','The selected original file changed during its complete read.');
  }catch(e){error=e;}
  try{await h.close();}catch(e){error??=e;}if(error)throw error;return raw;
}
async function optional(directory,name){
  try{return parseProviderJSON(new TextDecoder('utf-8',{fatal:true}).decode(await regular(path.join(directory,name))));}
  catch(e){if(e.code==='ENOENT')return null;throw e;}
}
async function put(directory,name,value){return files.writeNew(directory,name,json(value));}
function plainReceipt(value){const x=JSON.parse(stableJSON(value));delete x.replayed;return x;}
async function sourceDigest(operator,sourceId,part,signal){
  let offset=0,file=null;const digest=createHash('sha256');
  while(true){
    check(signal);const row=await operator.invoke({method:'source.file',args:{sourceId,part,offset,length:1024*1024}}),raw=Buffer.from(row.base64,'base64');
    need(raw.toString('base64')===row.base64&&row.sourceId===sourceId&&row.part===part&&row.offset===offset&&row.bytes===raw.length,'SOURCE_CHANGED','Original source range changed.');
    if(file)need(stableJSON(file)===stableJSON(row.file),'SOURCE_CHANGED','Original source descriptor changed.');else file=row.file;
    need(Number.isSafeInteger(file.bytes)&&file.bytes>=0&&offset+raw.length<=file.bytes,'SOURCE_CHANGED','Original source extent changed.');
    digest.update(raw);offset+=raw.length;
    if(row.eof){need(offset===file.bytes,'SOURCE_INCOMPLETE','Original source ended early.');break;}
    need(raw.length>0,'SOURCE_STALLED','Original source range did not advance.');
  }
  need(digest.digest('hex')===file.sha256,'SOURCE_CHANGED','Original full source hash changed.');
  return {sourceId,part,file};
}
async function snapshot(operator,selection,signal){
  const overview=await operator.invoke({method:'bridge.overview'}),rows=[],requests=[];
  need(stableJSON(overview.selection)===stableJSON(selection),'SELECTION_CHANGED','The original Bridge binding changed.');
  for(const row of overview.sources){
    check(signal);const value=await operator.invoke({method:'source.read',args:{sourceId:row.id}}),parts=[];
    for(const part of ['body','request','response','projection','manifest'])parts.push(await sourceDigest(operator,row.id,part,signal));
    const request=await operator.invoke({method:'request.status',args:{requestId:row.requestId}});
    need(request.workspaceId===overview.workspaceId&&request.record,'REQUEST_NOT_FOUND','The original Bridge source must retain its native request record.');
    rows.push({id:row.id,kind:row.kind,source:value.source,parts});
    requests.push({requestId:row.requestId,record:request.record});
  }
  rows.sort((a,b)=>a.id.localeCompare(b.id));requests.sort((a,b)=>a.requestId.localeCompare(b.requestId));
  return {workspaceId:overview.workspaceId,selection,sources:rows,requests,
    sourceIds:rows.map(row=>row.id),capturedRevision:overview.revision};
}
async function verifySnapshot(operator,prepared,signal){
  const overview=await operator.invoke({method:'bridge.overview'});
  need(overview.workspaceId===prepared.workspaceId&&stableJSON(overview.selection)===stableJSON(prepared.selection),
    'WORKSPACE_CHANGED','Receiving changed the original workspace or Bridge binding.');
  const originalIds=[...prepared.sourceIds].sort(),actualIds=overview.sources.map(x=>x.id).sort();
  need(stableJSON(originalIds)===stableJSON(actualIds),'SOURCE_SET_CHANGED','Receiving changed the complete selected Bridge source set.');
  for(const row of prepared.sources){
    check(signal);const value=await operator.invoke({method:'source.read',args:{sourceId:row.id}});
    need(stableJSON(value.source)===stableJSON(row.source),'SOURCE_CHANGED','The received complete source metadata changed.');
    for(const part of row.parts)need(stableJSON(await sourceDigest(operator,row.id,part.part,signal))===stableJSON(part),
      'SOURCE_CHANGED','The received full source bytes changed.');
  }
  for(const request of prepared.requests){
    const current=await operator.invoke({method:'request.status',args:{requestId:request.requestId}});
    need(stableJSON(current.record)===stableJSON(request.record),'REQUEST_CHANGED','Receiving changed a complete original command/result identity.');
  }
  return {workspaceId:overview.workspaceId,sourceIds:actualIds,
    sources:prepared.sources.length,requests:prepared.requests.length,providerRequests:0,ledgerMutations:0};
}
async function closeOwner(owner,errors){
  if(!owner)return;
  // Retain the same actual owner until its admitted original reads/writes drain.
  while(true){try{await owner.close();return;}catch(e){errors.first??=e;await new Promise(r=>setTimeout(r,100));}}
}
async function inspectCompleted(input){
  const result=await optional(input.outputDirectory,'RECEIVING_RESULT.json');if(!result)return null;
  need(result.schema===SCHEMA+'.result'&&result.status==='COMPLETED'&&result.inputSha256===sourceHash(input)&&stableJSON(result.input)===stableJSON(input),
    'RECEIVING_CONFLICT','The completed receiving result belongs to another exact input.');
  const unsigned={...result};delete unsigned.sha256;
  need(sourceHash(unsigned)===result.sha256&&result.exported.directory===input.exportDirectory&&result.reexported.directory===input.reexportDirectory&&result.received.workspace.workspaceId===input.workspaceId,'RESULT_CHANGED','The complete original result seal or package identities changed.');
  const expectedFiles=['RECEIVING_INPUT.json','PREPARED.json','EXPORTED.json','RECEIVED.json','VERIFIED.json','REEXPORTED.json'];
  need(stableJSON(result.files.map(x=>x.path))===stableJSON(expectedFiles),'RESULT_CHANGED','Keep the complete original receiving inventory.');
  need(result.closed?.producingOperator===true&&result.closed?.receivedOperator===true,'OWNERS_NOT_CLOSED','The original operators did not close.');
  for(const row of result.files){const raw=await regular(path.join(input.outputDirectory,row.path),64*1024*1024);need(raw.length===row.bytes&&hash(raw)===row.sha256,'RESULT_CHANGED','A complete receiving artifact changed.');}
  await inspectInvoiceDelivery({sourceDirectory:result.exported.directory,expectedManifestSha256:result.exported.manifestSha256});
  await inspectInvoiceDelivery({sourceDirectory:result.reexported.directory,expectedManifestSha256:result.reexported.manifestSha256});
  // The maintained receiver verifies its original source manifest, full history,
  // and continuing workspace before returning this same completed request.
  await regular(path.join(input.receivedDirectory,'receiving.json'),64*1024*1024);
  const received=await receiveInvoiceDelivery({sourceDirectory:result.exported.directory,destination:input.receivedDirectory,
    requestId:input.receiveRequestId,expectedManifestSha256:result.exported.manifestSha256});
  need(stableJSON(plainReceipt(received))===stableJSON(result.received),'RECEIVING_CHANGED','The original complete receiving receipt changed.');
  return result;
}
/** This is a real complete user operation. It performs only local original
 * export/receiving transitions, never a provider read or financial mutation. */
export async function runBridgeReceiving(originalInput,{signal,inspectOnly=false}={}){
  const input=normalize(originalInput),inputSha256=sourceHash(input);
  if(inspectOnly){
    const result=await inspectCompleted(input);need(result,'RECEIVING_NOT_COMPLETE','No completed original receiving result exists.');return result;
  }
  check(signal);await privateDirectory(input.outputDirectory);
  return withLock(input.outputDirectory,'bridge-receiving.lock',async()=>{
    await put(input.outputDirectory,'RECEIVING_INPUT.json',input);
    const complete=await inspectCompleted(input);if(complete)return complete;
    const errors={first:null};let producer=null,receivedOperator=null,candidate=null;
    try{
      check(signal);
      producer=await openBridgeOperator({workspaceDirectory:input.sourceWorkspace,expectedWorkspaceId:input.workspaceId,
        retainedSelection:input.selection,signal});
      let prepared=await optional(input.outputDirectory,'PREPARED.json');
      if(!prepared){
        const state=await producer.invoke({method:'workspace.describe'});
        need(state.revision===input.expectedRevision,'REVISION_CONFLICT','Prepare against the exact frozen producing revision.');
        prepared={schema:SCHEMA+'.prepared',inputSha256,...await snapshot(producer,input.selection,signal)};
        need(prepared.workspaceId===input.workspaceId&&prepared.capturedRevision===input.expectedRevision,'WORKSPACE_CHANGED','The selected producing workspace changed while preparing.');
        await put(input.outputDirectory,'PREPARED.json',prepared);
      }else need(prepared.schema===SCHEMA+'.prepared'&&prepared.inputSha256===inputSha256,'PREPARED_CHANGED','Keep the original receiving snapshot.');
      check(signal);
      const exported=plainReceipt(await producer.invoke({method:'workspace.export',args:{requestId:input.exportRequestId,
        expectedRevision:input.expectedRevision,destination:input.exportDirectory,name:'Complete Bridge intake and incident workspace'}}));
      await put(input.outputDirectory,'EXPORTED.json',exported);
      const inspected=await inspectInvoiceDelivery({sourceDirectory:exported.directory,expectedManifestSha256:exported.manifestSha256});
      need(inspected.manifest.workspaceId===input.workspaceId&&inspected.manifest.workspaceRevision===input.expectedRevision,
        'WORKSPACE_CHANGED','The original delivery belongs to another workspace.');
      await closeOwner(producer,errors);producer=null;if(errors.first)throw errors.first;
      check(signal);
      const received=plainReceipt(await receiveInvoiceDelivery({sourceDirectory:exported.directory,destination:input.receivedDirectory,
        requestId:input.receiveRequestId,expectedManifestSha256:exported.manifestSha256}));
      await put(input.outputDirectory,'RECEIVED.json',received);
      need(received.workspace.workspaceId===input.workspaceId,'WORKSPACE_CHANGED','The maintained receiver replaced workspace identity.');
      // Execute the full exported/received Bridge module, not the producer copy.
      const modulePath=path.join(received.application.directory,ROOT,'bridge/operator.mjs');
      const appRow=inspected.manifest.files.find(row=>row.path==='application/source/'+ROOT+'/bridge/operator.mjs');
      need(appRow,'BRIDGE_SOURCE_NOT_REGISTERED','The original application manifest must contain the complete Bridge source before export.');
      const moduleBytes=await regular(modulePath,1024*1024);need(moduleBytes.length===appRow.bytes&&hash(moduleBytes)===appRow.sha256,'APPLICATION_CHANGED','The received original operator differs from the exported application.');
      const receivedModule=await import(pathToFileURL(modulePath).href);
      check(signal);receivedOperator=await receivedModule.openBridgeOperator({workspaceDirectory:received.workspace.directory,
        expectedWorkspaceId:input.workspaceId,retainedSelection:input.selection,signal});
      const verified=await verifySnapshot(receivedOperator,prepared,signal);
      await put(input.outputDirectory,'VERIFIED.json',verified);
      const prior=await receivedOperator.invoke({method:'request.status',args:{requestId:input.reexportRequestId}});
      const state=await receivedOperator.invoke({method:'workspace.describe'});
      const reexported=plainReceipt(await receivedOperator.invoke({method:'workspace.export',args:{requestId:input.reexportRequestId,
        expectedRevision:prior.record?.result?.revision??state.revision,destination:input.reexportDirectory,
        name:'Independently received complete Bridge workspace'}}));
      await put(input.outputDirectory,'REEXPORTED.json',reexported);
      await inspectInvoiceDelivery({sourceDirectory:reexported.directory,expectedManifestSha256:reexported.manifestSha256});
      candidate={schema:SCHEMA+'.result',status:'COMPLETED',input,inputSha256,workspaceId:input.workspaceId,
        selection:input.selection,exported,received,reexported,verified,providerRequests:0,ledgerMutations:0};
    }catch(error){
      errors.first??=error;
      if(error.bridgeOperator){if(!producer)producer=error.bridgeOperator;else if(!receivedOperator)receivedOperator=error.bridgeOperator;}
    }finally{
      await closeOwner(receivedOperator,errors);await closeOwner(producer,errors);
    }
    if(errors.first){
      try{await put(input.outputDirectory,'interruptions/'+randomUUID()+'.json',{schema:SCHEMA+'.interrupted',inputSha256,
        error:{code:errors.first.code??'RECEIVING_FAILED',message:errors.first.message},closed:{producingOperator:true,receivedOperator:true}});}catch(secondary){errors.first.retentionError=secondary;}
      throw errors.first;
    }
    const inventory=[];
    for(const name of ['RECEIVING_INPUT.json','PREPARED.json','EXPORTED.json','RECEIVED.json','VERIFIED.json','REEXPORTED.json']){
      const raw=await regular(path.join(input.outputDirectory,name),64*1024*1024);inventory.push({path:name,bytes:raw.length,sha256:hash(raw)});
    }
    candidate={...candidate,files:inventory,closed:{producingOperator:true,receivedOperator:true}};
    candidate={...candidate,sha256:sourceHash(candidate)};
    await put(input.outputDirectory,'RECEIVING_RESULT.json',candidate);return candidate;
  });
}
async function main(argv){
  const command=argv.shift();need(['run','inspect'].includes(command)&&argv.length===2&&argv[0]==='--input','USAGE','Use run|inspect --input ABSOLUTE_JSON.');
  const input=parseProviderJSON(new TextDecoder('utf-8',{fatal:true}).decode(await regular(abs(argv[1]))));
  const controller=new AbortController();let first,result;
  const interrupt=kind=>{first??=new Error('Original Bridge receiving interrupted by '+kind);controller.abort(first);};
  const int=()=>interrupt('SIGINT'),term=()=>interrupt('SIGTERM'),streamError=error=>{first??=error;controller.abort(first);};
  process.on('SIGINT',int);process.on('SIGTERM',term);process.stdout.on('error',streamError);process.stderr.on('error',streamError);
  try{result=await runBridgeReceiving(input,{signal:controller.signal,inspectOnly:command==='inspect'});}
  catch(error){first??=error;}
  try{
    const value=first?{error:{code:first.code??'RECEIVING_FAILED',message:first.message},...(result?{acceptedResult:result}:{})}:result;
    await new Promise((resolve,reject)=>process.stdout.write(JSON.stringify(value)+'\n',e=>e?reject(e):resolve()));
    await new Promise(resolve=>setImmediate(resolve));
  }catch(e){first??=e;}
  finally{process.off('SIGINT',int);process.off('SIGTERM',term);process.stdout.off('error',streamError);process.stderr.off('error',streamError);}
  if(first)throw first;
}
if(process.argv[1]&&pathToFileURL(path.resolve(process.argv[1])).href===import.meta.url)
  main(process.argv.slice(2)).catch(()=>{process.exitCode=1;});
