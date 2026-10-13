import { readFileSync, realpathSync } from 'node:fs';
import { resolve } from 'node:path';
import { pathToFileURL } from 'node:url';
import { assert, fields, id, integer, text, sha, digest, jsonDigest, canonical, clone, VERSION } from './model.mjs';
import { rpcCall } from './provider.mjs';
import { inspectPublisher } from './source.mjs';

export const CONTRACT_SOURCES={
  'rozo-payment-v1':{path:'v1/stellar/payment/src/lib.rs',events:['payment','flush'],token:'CCW67TSZV3SSS2HXMBQ5JFGCKJNXKZM7UQUWUZPUTHXSTZLEO7SJMI75'},
  'rozo-forwarder-v2':{path:'v2/stellar/forwarder/src/lib.rs',events:['forward','memo_set','memo_rm','proxy_set']},
  'rozo-intent-bridge-v2':{path:'v2/stellar/intent_bridge/src/lib.rs',events:['created','filled','refunded']}
};
export function decoderBinding(connection){
  if(!connection.decoderModule)return null;
  const module=realpathSync(connection.decoderModule),packageFile=realpathSync(connection.decoderPackageJson);
  const entry=readFileSync(module),packageBytes=readFileSync(packageFile),pkg=JSON.parse(packageBytes);
  sha(connection.decoderModuleSha256);assert(digest(entry)===connection.decoderModuleSha256,'DECODER_IDENTITY','The installed native Stellar decoder entry differs.',409);
  assert(pkg.name==='@stellar/stellar-sdk'&&Number(pkg.version.split('.')[0])>=15,'DECODER_VERSION','Use an actual Stellar SDK 15 or later to decode Protocol 23 metadata.',409);
  assert(connection.decoderRuntimeRoot&&Array.isArray(connection.decoderRuntimeFiles)&&connection.decoderRuntimeFiles.length,'DECODER_RUNTIME','Select the complete original Stellar decoder runtime.',409);
  const runtime=inspectPublisher(connection.decoderRuntimeRoot,connection.decoderRuntimeFiles);
  for(const path of [module,packageFile])assert(connection.decoderRuntimeFiles.some(row=>resolve(runtime.sourceRoot,row.path)===path),'DECODER_RUNTIME','The decoder entry/package must belong to its complete runtime.',409);
  return {module,moduleSha256:digest(entry),packageFile,packageSha256:digest(packageBytes),version:pkg.version,runtimeRoot:runtime.sourceRoot,runtimeFiles:connection.decoderRuntimeFiles,runtimeSelectionSha256:runtime.sourceSelectionSha256};
}
export function decoderIdentity(binding){if(!binding)return null;const {module,packageFile,runtimeRoot,...identity}=binding;return identity;}
export async function loadDecoder(binding){
  if(!binding)return null;
  assert(digest(readFileSync(binding.module))===binding.moduleSha256&&digest(readFileSync(binding.packageFile))===binding.packageSha256,'DECODER_IDENTITY','Restore the originally selected native decoder.',409);
  const runtime=inspectPublisher(binding.runtimeRoot,binding.runtimeFiles);
  assert(runtime.sourceSelectionSha256===binding.runtimeSelectionSha256,'DECODER_RUNTIME','The complete original decoder runtime differs.',409);
  const imported=await import(pathToFileURL(binding.module));const sdk=imported.scValToNative?imported:imported.default;
  assert(sdk?.xdr?.ScVal&&typeof sdk.scValToNative==='function'&&sdk.TransactionBuilder,'DECODER_EXPORTS','The original Stellar SDK exports are incomplete.',409);
  return sdk;
}
function nativeValue(value){
  if(typeof value==='bigint')return value.toString();
  if(Buffer.isBuffer(value)||value instanceof Uint8Array)return {type:'bytes',hex:Buffer.from(value).toString('hex')};
  if(Array.isArray(value))return value.map(nativeValue);
  if(value instanceof Map)return {type:'map',entries:[...value].map(([k,v])=>[nativeValue(k),nativeValue(v)])};
  if(value&&typeof value==='object')return Object.fromEntries(Object.entries(value).map(([k,v])=>[k,nativeValue(v)]));
  return value===undefined?null:value;
}
export function decodeEvent(raw,profile,sdk){
  assert(raw.contractId===profile.stellar.contractId,'EVENT_CONTRACT','The RPC returned another contract.',409);
  assert(Array.isArray(raw.topic)&&typeof raw.value==='string','EVENT_XDR','Retain the original base64 event XDR.',502);
  const topics=raw.topic.map(v=>nativeValue(sdk.scValToNative(sdk.xdr.ScVal.fromXDR(v,'base64'))));
  const data=nativeValue(sdk.scValToNative(sdk.xdr.ScVal.fromXDR(raw.value,'base64')));
  const topic=topics[0],known=CONTRACT_SOURCES[profile.stellar.profile].events.includes(topic);
  let meaning='unclassified original event',stage='observation';
  if(profile.stellar.profile==='rozo-payment-v1'&&topic==='payment'){meaning='Original token transfer to the configured payment destination';stage='payment';}
  if(profile.stellar.profile==='rozo-payment-v1'&&topic==='flush'){meaning='Separate contract-balance flush';stage='maintenance';}
  if(profile.stellar.profile==='rozo-forwarder-v2'&&topic==='forward'){meaning='Tokens forwarded to the original proxy; desired destination/memo retained';stage='source_forward';}
  if(profile.stellar.profile==='rozo-forwarder-v2'&&['memo_set','memo_rm','proxy_set'].includes(topic)){meaning='Original proxy or memo configuration history';stage='configuration';}
  if(profile.stellar.profile==='rozo-intent-bridge-v2'){
    if(topic==='created'){meaning='Original balance-delta escrow creation';stage='escrow_created';}
    if(topic==='filled'){meaning='Escrow released to the original relayer; destination-chain receipt remains separate';stage='escrow_filled';}
    if(topic==='refunded'){meaning='Original escrow refunded to the sender';stage='escrow_refunded';}
  }
  return {schema:'stellar-forge.rozo-contract-event.v1',profile:profile.stellar.profile,contractId:raw.contractId,networkPassphrase:profile.stellar.networkPassphrase,eventId:raw.id,ledger:raw.ledger,txHash:raw.txHash,topics,data,known,stage,meaning,inSuccessfulContractCall:raw.inSuccessfulContractCall??null,rawSha256:jsonDigest(raw)};
}
export function decodeTransaction(raw,hash,networkPassphrase,sdk){
  if(raw.status!=='SUCCESS')return {status:raw.status,verified:false,reason:'Original RPC transaction is not SUCCESS.'};
  for(const field of ['envelopeXdr','resultXdr','resultMetaXdr'])text(raw[field],'original '+field,32*1024*1024);
  const tx=sdk.TransactionBuilder.fromXDR(raw.envelopeXdr,networkPassphrase);
  const actual=Buffer.from(tx.hash()).toString('hex');
  assert(actual===hash,'TRANSACTION_HASH','The original envelope does not hash to the selected transaction/network.',409);
  const result=sdk.xdr.TransactionResult.fromXDR(raw.resultXdr,'base64');
  const meta=sdk.xdr.TransactionMeta.fromXDR(raw.resultMetaXdr,'base64');
  return {status:raw.status,verified:['txSuccess','txFeeBumpInnerSuccess'].includes(result.result().switch().name),hash:actual,ledger:raw.ledger,createdAt:raw.createdAt??null,resultCode:result.result().switch().name,metaVersion:meta.switch().value,envelopeSha256:digest(Buffer.from(raw.envelopeXdr,'base64')),resultSha256:digest(Buffer.from(raw.resultXdr,'base64')),metaSha256:digest(Buffer.from(raw.resultMetaXdr,'base64'))};
}
export function stellarJobInput(value,profile){
  fields(value,['id','profileId','startLedger','endLedger','limit','transactions'],'Stellar capture');
  id(value.id,'capture id');assert(value.profileId===profile.id&&profile.stellar,'STELLAR_PROFILE','Select a configured deployed contract.');
  integer(value.startLedger,'startLedger',profile.stellar.startLedger);if(value.endLedger!==undefined)integer(value.endLedger,'endLedger',value.startLedger+1);
  integer(value.limit??100,'limit',1,10000);
  return {id:value.id,profileId:profile.id,startLedger:value.startLedger,endLedger:value.endLedger??null,limit:value.limit??100,transactions:value.transactions!==false};
}
export async function captureStellar(workspace,request,profile,connection,{signal,fetchImpl,onCheckpoint}={}){
  let job=workspace.get('capture',request.intent.job.id)?.value??{...clone(request.intent.job),kind:'stellar',state:'prepared',requestId:request.id,cursor:null,pageCaptures:[],eventIds:[],transactionHashes:[],conflicts:[],startedAt:workspace.now(),completedAt:null};
  const options={requestId:request.id,signal,fetchImpl};
  const network=await rpcCall(workspace,profile,connection,'getNetwork',{},options);
  assert(network.value.passphrase===profile.stellar.networkPassphrase,'STELLAR_NETWORK','The actual RPC network differs from the selected passphrase.',409);
  const health=await rpcCall(workspace,profile,connection,'getHealth',{},options);
  integer(health.value.oldestLedger,'RPC oldestLedger',1);integer(health.value.latestLedger,'RPC latestLedger',1);
  assert(job.startLedger>=health.value.oldestLedger,'RPC_RETENTION','The beginning of this original ledger range is no longer retained by the selected RPC. Preserve the partial capture and supply an original archive.',409,{oldestLedger:health.value.oldestLedger,startLedger:job.startLedger});
  if(job.endLedger===null)job.endLedger=health.value.latestLedger+1;
  assert(job.endLedger<=health.value.latestLedger+1,'RPC_FUTURE_RANGE','The original selected end ledger has not been observed.',409);
  job.networkCapture=network.capture.id;job.healthCapture=health.capture.id;
  let sdk=null;try{const currentDecoder=decoderBinding(connection);assert(canonical(decoderIdentity(currentDecoder))===canonical(decoderIdentity(request.intent.decoder)),'DECODER_IDENTITY','Restore the originally selected native decoder edition.',409);sdk=await loadDecoder(currentDecoder);}catch(error){job.decoderError={code:error.code,message:error.message};}
  job.state='running';workspace.putProgress('capture',job,request.id);
  const seen=new Set(job.eventIds),transactions=new Set(job.transactionHashes);
  for(;;){
    if(signal?.aborted){job.state='paused';workspace.putProgress('capture',job,request.id);return {schema:'stellar-forge.rozo-pending-result.v1',state:'pending',workspaceId:workspace.meta().workspaceId,requestId:request.id,fingerprint:request.fingerprint,captureId:job.id};}
    const params={filters:[{type:'contract',contractIds:[profile.stellar.contractId]}],pagination:{limit:job.limit,...(job.cursor?{cursor:job.cursor}:{})},xdrFormat:'base64',...(!job.cursor?{startLedger:job.startLedger,endLedger:job.endLedger}:{})};
    const page=await rpcCall(workspace,profile,connection,'getEvents',params,options);
    assert(Array.isArray(page.value.events),'RPC_EVENTS','The original response has no events array.',502);
    const prior=job.cursor;let crossed=false;
    for(const raw of page.value.events){
      text(raw.id,'original event id');integer(raw.ledger,'event ledger',1);assert(raw.contractId===profile.stellar.contractId,'EVENT_CONTRACT','The original response contains another contract.',409);
      if(raw.ledger>=job.endLedger){crossed=true;continue;}
      assert(raw.ledger>=job.startLedger,'EVENT_RANGE','The original event precedes this selected range.',409);
      const previous=workspace.observations(profile.id,{identity:raw.id,kind:'stellar_event'});
      if(previous.some(o=>jsonDigest(o.value.raw)!==jsonDigest(raw)))job.conflicts.push({eventId:raw.id,old:previous.map(o=>o.sha256),new:jsonDigest(raw),captureId:page.capture.id});
      let decoded=null,decodeError=null;
      if(sdk){try{decoded=decodeEvent(raw,profile,sdk);}catch(error){decodeError={code:error.code??'DECODE_ERROR',message:error.message};}}
      workspace.observe({profileId:profile.id,kind:'stellar_event',identity:raw.id,captureId:page.capture.id,value:{raw,decoded,decodeError,decoder:request.intent.decoder}});
      seen.add(raw.id);
      if(job.transactions&&raw.txHash&&!transactions.has(raw.txHash)){
        sha(raw.txHash,'transaction hash');
        const tx=await rpcCall(workspace,profile,connection,'getTransaction',{hash:raw.txHash,xdrFormat:'base64'},options);
        let proof=null,proofError=null;if(sdk){try{proof=decodeTransaction(tx.value,raw.txHash,profile.stellar.networkPassphrase,sdk);}catch(error){proofError={code:error.code??'DECODE_ERROR',message:error.message};}}
        workspace.observe({profileId:profile.id,kind:'stellar_transaction',identity:raw.txHash,captureId:tx.capture.id,value:{raw:tx.value,proof,proofError,networkPassphrase:profile.stellar.networkPassphrase,decoder:request.intent.decoder}});
        transactions.add(raw.txHash);
      }
    }
    job.pageCaptures.push(page.capture.id);job.eventIds=[...seen];job.transactionHashes=[...transactions];job.cursor=page.value.cursor??null;
    const exhausted=page.value.events.length<job.limit&&page.value.latestLedger>=job.endLedger-1;
    if(crossed||exhausted){job.state='complete';job.completedAt=workspace.now();workspace.putProgress('capture',job,request.id);return workspace.complete(request.id,{capture:job});}
    assert(job.cursor&&job.cursor!==prior,'RPC_CURSOR','The original RPC cursor did not advance; this capture remains pending.',502,{captureId:page.capture.id});
    workspace.putProgress('capture',job,request.id);await onCheckpoint?.(clone(job));
  }
}
export function contractProjection(observations){
  const rows=observations.filter(o=>o.kind==='stellar_event').map(o=>({observationId:o.id,...clone(o.value)}));
  rows.sort((a,b)=>(a.raw.ledger-b.raw.ledger)||String(a.raw.id).localeCompare(String(b.raw.id)));
  const config={proxy:null,memos:{}},intents={},conflicts=[];
  const seen=new Map();
  for(const row of rows){
    const hash=jsonDigest(row.raw);if(seen.has(row.raw.id)){if(seen.get(row.raw.id)!==hash)conflicts.push(row.raw.id);continue;}seen.set(row.raw.id,hash);
    const d=row.decoded;if(!d||d.inSuccessfulContractCall!==true)continue;
    const topic=d.topics[0],v=d.data;
    if(topic==='proxy_set')config.proxy={address:v.new_proxy_address,eventId:d.eventId};
    if(topic==='memo_set')config.memos[v.memo]={destination:v.destination,eventId:d.eventId};
    if(topic==='memo_rm')delete config.memos[v.memo];
    const intentId=v.intent_id?.hex??v.intent_id;
    if(d.profile==='rozo-intent-bridge-v2'&&intentId){intents[intentId]??={id:intentId,created:null,state:'unknown',history:[]};const item=intents[intentId];item.history.push({eventId:d.eventId,stage:d.stage,data:v});if(topic==='created'){item.created=v;item.state='Pending';}if(topic==='filled')item.state='Filled';if(topic==='refunded')item.state='Refunded';}
  }
  return {schema:'stellar-forge.rozo-contract-projection.v1',rows,configuration:config,intents:Object.values(intents),conflicts:[...new Set(conflicts)]};
}
