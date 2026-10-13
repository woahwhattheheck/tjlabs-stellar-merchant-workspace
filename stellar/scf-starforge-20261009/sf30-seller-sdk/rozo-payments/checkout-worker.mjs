import { readFileSync, mkdirSync, lstatSync, realpathSync } from 'node:fs';
import { resolve, join, sep } from 'node:path';
import { pathToFileURL } from 'node:url';
import { RozoWorkspace } from './store.mjs';
import { acquireLease } from './lease.mjs';
import { sourcePath } from './source.mjs';
import { nativeBindingIdentity } from './checkout.mjs';
import { assert, digest, canonical, jsonDigest, validatePayment, RozoError } from './model.mjs';

const input=JSON.parse(readFileSync(process.argv[2],'utf8'));
const workspace=new RozoWorkspace(input.workspace);
const request=workspace.request(input.requestId);
assert(request && request.fingerprint===input.fingerprint,'REQUEST_IDENTITY','The native child must use the exact original prepared request.',409);
if(request.state==='accepted'){workspace.close();process.exit(0);}
const profile=input.profile,connection=input.connection;
assert(canonical(profile)===canonical(request.intent.profile) && canonical(nativeBindingIdentity(connection))===canonical(nativeBindingIdentity(request.intent.nativeBinding)),'NATIVE_INPUT_IDENTITY','The native child input differs from its original prepared profile or source.');
assert(input.mode===request.intent.nativeRequest.mode && canonical(input.argv)===canonical(request.intent.nativeRequest.argv??[]) && canonical(input.selection)===canonical(request.intent.nativeRequest.selection??{}) && (input.method??null)===(request.intent.nativeRequest.method??null) && canonical(input.args)===canonical(request.intent.nativeRequest.args??[]),'NATIVE_INPUT_IDENTITY','The native child must preserve the full original operation arguments.');
let lease,fileLease,sequence=0;
const stop=new AbortController();let forcedExit;
const stopChild=reason=>{if(!stop.signal.aborted)stop.abort(new Error(reason));forcedExit??=setTimeout(()=>process.exit(1),5000);forcedExit.unref();};
for(const signal of ['SIGTERM','SIGINT'])process.on(signal,()=>stopChild(signal));
process.on('disconnect',()=>stopChild('Original parent disconnected'));
const childDeadline=setTimeout(()=>stopChild('Native operation deadline'),300000);childDeadline.unref();
const nativeFetch=globalThis.fetch;
const captures=[],dispatches=[];
function verifySource(root,files) {
  const actual=realpathSync(root);
  for(const row of files){
    assert(!row.path.startsWith('/')&&!row.path.split('/').includes('..'),'SOURCE_PATH','Publisher source path escaped its selected root.');
    const file=sourcePath(actual,row.path),stat=lstatSync(file);
    assert(stat.isFile()&&!stat.isSymbolicLink(),'SOURCE_FILE','The original publisher member is not an ordinary file: '+row.path);
    const bytes=readFileSync(file);assert(bytes.length===row.bytes&&digest(bytes)===row.sha256,'PUBLISHER_SOURCE','The selected publisher source differs: '+row.path,409);
  }
  return actual;
}
globalThis.fetch=async(url,options={})=>{
  const target=String(url),method=options.method??'GET',headers=new Headers(options.headers??{});
  const privateHeaders=Object.fromEntries([...headers.entries()].filter(([k])=>!['authorization','x-api-key','cookie'].includes(k)));
  const bodyText=options.body===undefined?null:String(options.body),dispatchId=input.requestId+':'+input.attempt+':'+(++sequence);
  const requestSource={method,url:target,headers:privateHeaders,bodyText,authAlias:profile.connection,nativeDispatchId:dispatchId,representation:'fetch-decoded-response-body'};
  const dispatch=workspace.capture({requestId:input.requestId,profileId:profile.id,kind:'native_dispatch',request:requestSource});
  dispatches.push({id:dispatchId,method,url:target,captureId:dispatch.id});
  try{
    const response=await nativeFetch(url,{...options,redirect:'manual',signal:options.signal?AbortSignal.any([options.signal,stop.signal]):stop.signal});
    const chunks=[];let size=0;
    try{for await(const chunk of response.body??[]){const rawChunk=Buffer.from(chunk);size+=rawChunk.length;if(size>64*1024*1024){const left=64*1024*1024-(size-rawChunk.length);if(left>0)chunks.push(rawChunk.subarray(0,left));throw new Error('The native response exceeded 64 MiB.');}chunks.push(rawChunk);}}
    catch(error){workspace.capture({requestId:input.requestId,profileId:profile.id,kind:'native_partial_response',request:requestSource,status:response.status,headers:Object.fromEntries(response.headers.entries()),body:Buffer.concat(chunks),error:{code:'INCOMPLETE_RESPONSE',message:String(error.message),partial:true}});throw error;}
    const raw=Buffer.concat(chunks);
    const capture=workspace.capture({requestId:input.requestId,profileId:profile.id,kind:'native_response',request:requestSource,status:response.status,headers:Object.fromEntries(response.headers.entries()),body:raw});
    captures.push(capture);
    let value;try{value=JSON.parse(raw.toString('utf8'));}catch{}
    if(response.ok && value?.id && /\/payments(?:\/[^/?]+)?(?:\?|$)/.test(target)){
      validatePayment(profile,value);
      workspace.observe({profileId:profile.id,kind:'payment',identity:value.id,captureId:capture.id,value});
    }
    return new Response([204,205,304].includes(response.status)?null:raw,{status:response.status,statusText:response.statusText,headers:response.headers});
  }catch(error){
    workspace.capture({requestId:input.requestId,profileId:profile.id,kind:'native_transport_error',request:requestSource,error:{code:error.code??'HTTP_TRANSPORT',message:String(error.message)}});
    throw error;
  }
};
function serializable(value){
  return JSON.parse(JSON.stringify(value,(_key,item)=>typeof item==='bigint'?item.toString():item instanceof Error?{name:item.name,message:item.message,code:item.code??null}:item));
}
try{
  fileLease=acquireLease(workspace,'native-files');
  lease=acquireLease(workspace,'native:'+profile.connection);
  const originalRoot=verifySource(connection.sourceRoot,input.publisherFiles);
  const sourceIdentity=jsonDigest(input.publisherFiles);
  assert(sourceIdentity===connection.sourceSelectionSha256,'SOURCE_SELECTION','The native source selection differs from the host binding.',409);
  let native,snapshot=null,receipt=null;
  if(profile.type==='checkout-mpp-0.1.21'){
    assert(connection.publisher==='RozoAI/rozo-checkout-skill','PUBLISHER_IDENTITY','Select the original Checkout publisher.');
    process.env.ROZO_CHECKOUT_STATE_DIR=join(workspace.directory,'native','checkout-state',profile.id);
    mkdirSync(process.env.ROZO_CHECKOUT_STATE_DIR,{recursive:true,mode:0o700});
    process.env.ROZO_CHECKOUT_ANON_ID='off';
    process.env.ROZO_CHECKOUT_MPP_BASE=connection.mppBase;
    process.env.ROZO_CHECKOUT_INTENTS_BASE=connection.intentsBase;
    const output=await import(pathToFileURL(join(originalRoot,'scripts/src/lib/output.mjs')));
    if(input.mode==='create'){
      const module=await import(pathToFileURL(join(originalRoot,'scripts/src/create-order.mjs')));
      native=await output.capture(()=>module.run(input.argv));
    }else if(input.mode==='resume'){
      const module=await import(pathToFileURL(join(originalRoot,'scripts/src/resume.mjs')));
      native=await output.capture(()=>module.run(input.argv));
    }else if(input.mode==='quote'){
      const module=await import(pathToFileURL(join(originalRoot,'scripts/src/quote.mjs')));
      native=await output.capture(()=>module.run(input.argv));
    }else{
      const module=await import(pathToFileURL(join(originalRoot,'scripts/src/status.mjs')));
      snapshot=await module.snapshot(input.selection);
      const receipts=await import(pathToFileURL(join(originalRoot,'scripts/src/lib/receipt.mjs')));
      receipt=receipts.buildReceipt(snapshot);
      if(request.intent.originalRequestId){
        const router=captures.filter(c=>c.status===200&&/\/invoice-status(?:\?|$)/.test(c.request.url)).map(c=>{try{return {capture:c,value:JSON.parse(workspace.wholeObject(c.body.sha256))};}catch{return null;}}).find(r=>r?.value.pl_id===request.intent.expectedLinkId&&r.value.rozo_payment_id===input.selection.rozoPaymentId&&r.value.rozoPayment?.id===input.selection.rozoPaymentId);
        assert(router&&snapshot.rozoPaymentId===input.selection.rozoPaymentId&&snapshot.authoritativeView,'NATIVE_RECOVERY_IDENTITY','The original router response must bind its invoice, selected payment ID and embedded original payment.',409);
        snapshot.originalBinding={invoiceCaptureId:router.capture.id,invoiceSha256:router.capture.body.sha256,linkId:router.value.pl_id,paymentId:router.value.rozo_payment_id};
      }
      native={payload:{snapshot,receipt},exitCode:receipts.receiptExitCode(receipt.paymentOutcome)};
      if(snapshot.rozoPaymentId)workspace.observe({profileId:profile.id,kind:'checkout_receipt',identity:snapshot.rozoPaymentId,value:serializable({snapshot,receipt}),captureId:captures.at(-1)?.id??null});
    }
  }else{
    assert(profile.type==='intent-common-0.1.43','NATIVE_PROFILE','Select the original Common SDK profile.');
    assert(connection.publisher==='RozoAI/intent-pay','PUBLISHER_IDENTITY','Select the original Common SDK publisher.');
    const modulePath=realpathSync(connection.modulePath);
    assert(digest(readFileSync(modulePath))===connection.moduleSha256,'SDK_RUNTIME','The actual installed SDK entry differs from the selected runtime.',409);
    verifySource(connection.runtimeRoot,connection.runtimeFiles);
    assert(jsonDigest(connection.runtimeFiles)===connection.runtimeSelectionSha256,'SDK_RUNTIME','The original dependency selection differs.',409);
    const imported=await import(pathToFileURL(modulePath));
    const sdk=typeof imported.setApiConfig==='function'?imported:imported.default;
    const config={baseUrl:connection.baseUrl,version:input.sdkVersion??'v2'};
    if(connection.apiTokenEnv){assert(process.env[connection.apiTokenEnv],'SDK_TOKEN','The original SDK token is missing.');config.apiToken=process.env[connection.apiTokenEnv];}
    else assert(connection.usePublishedToken===true,'SDK_TOKEN','Explicitly select the original published token or a host token alias.');
    assert(typeof sdk?.setApiConfig==='function','SDK_EXPORT','The selected native SDK does not export setApiConfig.');sdk.setApiConfig(config);
    assert(['getPayment','getFee','createPayment','updatePaymentPayInTxHash'].includes(input.method),'SDK_METHOD','Select the retained native SDK method.');
    assert(typeof sdk[input.method]==='function','SDK_EXPORT','The selected SDK method is absent.');
    const value=await sdk[input.method](...input.args);
    native={payload:serializable(value),exitCode:value?.error?1:0};
  }
  native=serializable(native);
  const outcome={schema:'stellar-forge.rozo-native-result.v1',profileId:profile.id,mode:input.mode,sourceSelectionSha256:sourceIdentity,native,captureIds:captures.map(c=>c.id),dispatchIds:dispatches.map(c=>c.id),originalStateDirectory:profile.type==='checkout-mpp-0.1.21'?'native/checkout-state/'+profile.id:null};
  const originalCreate=captures.filter(c=>/\/create-invoice(?:\?|$)/.test(c.request.url) || (profile.type==='intent-common-0.1.43'&&c.request.method==='POST'&&!c.request.url.includes('dryrun')));
  const observedCreate=originalCreate.map(c=>{try{return JSON.parse(workspace.wholeObject(c.body.sha256));}catch{return null;}}).find(v=>v?.rozoPaymentId||v?.id);
  const paymentId=native.payload?.rozoPaymentId??native.payload?.id??observedCreate?.rozoPaymentId??observedCreate?.id??snapshot?.rozoPaymentId??null;
  if(paymentId)outcome.paymentId=paymentId;
  const originalPost=dispatches.some(d=>/\/create-invoice(?:\?|$)/.test(d.url) || (profile.type==='intent-common-0.1.43'&&d.method==='POST'&&!d.url.includes('dryrun')));
  const safeRejection=originalCreate.length>0&&originalCreate.every(c=>[400,401,403,404,409,422,429].includes(c.status));
  workspace.observe({profileId:profile.id,kind:'native_result',identity:paymentId??input.requestId,value:outcome});
  workspace.finishAttempt(input.requestId,input.attempt,{state:'returned',details:{nativeOutcomeSha256:jsonDigest(outcome),paymentId,exitCode:native.exitCode}});
  if(input.mode==='create'&&originalPost&&!paymentId&&!safeRejection){
    process.stdout.write(JSON.stringify({state:'pending',requestId:input.requestId,reason:'Native creation requires its original provider identity.',outcomeSha256:jsonDigest(outcome)})+'\n');
  }else{
    const result=workspace.complete(input.requestId,outcome);
    process.stdout.write(JSON.stringify({state:'accepted',requestId:input.requestId,revision:result.revision})+'\n');
  }
}catch(error){
  try{workspace.finishAttempt(input.requestId,input.attempt,{state:'uncertain',details:{code:error.code??'NATIVE_ERROR',message:String(error.message)}});}catch{}
  process.stderr.write(JSON.stringify({code:error.code??'NATIVE_ERROR',message:String(error.message),requestId:input.requestId})+'\n');
  process.exitCode=1;
}finally{
  globalThis.fetch=nativeFetch;clearTimeout(childDeadline);clearTimeout(forcedExit);if(process.connected)process.disconnect();
  try{lease?.release();}finally{try{fileLease?.release();}finally{workspace.close();}}
}
