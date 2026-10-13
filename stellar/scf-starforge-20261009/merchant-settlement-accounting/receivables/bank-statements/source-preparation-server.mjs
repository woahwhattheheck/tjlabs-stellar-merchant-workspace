// MIT. Installed Bank source desk; borrow the original accounting owner and configured aliases.
import {constants} from 'node:fs';
import {open} from 'node:fs/promises';
import {resolve} from 'node:path';
import {createHash} from 'node:crypto';
import {MerchantBankSources} from '../../../../../stellar-forge/mcp-merchant-operator/accounting-bank-sources.mjs';
import {accountingBankSourcesArguments} from '../../../../../stellar-forge/mcp-merchant-operator/accounting-bank-sources-client.mjs';
import {readAccountingConfig} from '../../../../../stellar-forge/mcp-merchant-operator/accounting.mjs';
import {canonicalHash,sha,uuid,basename,key,exact,need,BANK_SOURCE_REQUEST_BYTES} from '../../../../../stellar-forge/mcp-merchant-operator/accounting-bank-sources-contract.mjs';
import {accountingWorkspaceBinding,assertAccountingWorkspaceBinding} from '../../workspace/binding.mjs';

export const SOURCE_PREPARATION_REQUEST_BYTES=BANK_SOURCE_REQUEST_BYTES+1024;
const PREFIX='merchant_accounting_bank_sources_',CHUNK=196608;
const bytes=v=>Buffer.from(JSON.stringify(v),'utf8');
const fail=(code,message,status=400)=>Object.assign(new Error(message),{code:'BANK_SOURCE_DESK_'+code,status});
const same=(a,b)=>canonicalHash(a)===canonicalHash(b);
const stamp=s=>[s.dev,s.ino,s.size,s.mtimeNs,s.ctimeNs].map(String).join(':');
function pathBase(v){need(typeof v==='string'&&v.startsWith('/')&&!/[?#\\\u0000-\u0020]/.test(v)&&!v.includes('//')&&!v.split('/').some(x=>x==='.'||x==='..'),'Use the original same-origin desk route.');return v.replace(/\/$/,'');}
async function configuredBytes(path,maximum){
 const h=await open(path,constants.O_RDONLY|(constants.O_NOFOLLOW??0)|(constants.O_NONBLOCK??0));
 try{const before=await h.stat({bigint:true});need(before.isFile()&&before.size>0n&&before.size<=BigInt(maximum),'Choose a complete regular configured input.','SOURCE');
  const value=await h.readFile(),after=await h.stat({bigint:true});
  need(value.length===Number(before.size)&&stamp(before)===stamp(after),'The configured original changed during reading.','SOURCE_CHANGED');return value;
 }finally{await h.close();}
}
/** Hold the original owner's lifetime through async verification and disconnected downloads. */
function requestLifetime(){
 const active=new Set();let closing=false;
 return{
  beginRequest(){
   need(!closing,'The original source desk is closing. Preserve the request and reopen its owner.','CLOSING');
   let done;const promise=new Promise(resolve=>{done=resolve;});active.add(promise);let ended=false;
   return()=>{if(ended)return;ended=true;active.delete(promise);done();};
  },
  async drain(){closing=true;await Promise.allSettled([...active]);}
 };
}
/** The original HTTP owner already holds this workspace's lease. This never opens another. */
export async function openBankSourcePreparations(bank,{sourceConfig,sourceWorkspace}={}){
 need(sourceConfig&&sourceWorkspace,'Supply both original accounting configuration and selected workspace alias.');key(sourceWorkspace);
 need(typeof sourceConfig==='string'&&sourceConfig===resolve(sourceConfig),'Select an absolute original accounting configuration path.');
 const config=await readAccountingConfig(sourceConfig),definition=config?.workspaces?.[sourceWorkspace];
 need(definition&&definition.sourceMode!=='buyer','Select a configured merchant accounting workspace.','CONFIGURATION');
 const workspace=bank.receivables?.workspace??bank.workspace;
 need(workspace&&resolve(definition.directory)===resolve(workspace.directory),'The configured alias selects another accounting directory.','WORKSPACE');
 const initial=accountingWorkspaceBinding(workspace.directory,workspace.state);
 for(const name of ['outboxDir','proofDir','termsFile'])need(definition[name]===initial.sources[name],'The configured alias selects different original accounting sources.','WORKSPACE');
 const inputs=Object.freeze({...definition.receivablesInputs});
 const binding=()=>assertAccountingWorkspaceBinding(workspace.directory,workspace.state,{expectedWorkspaceId:initial.workspaceId,expectedSourcesSha256:initial.sourcesSha256});
 const controller=await new MerchantBankSources(workspace,{binding,configuredSources:Object.keys(inputs),
  readSource:(alias,maximum)=>{key(alias);need(Object.hasOwn(inputs,alias),'Select an existing host-configured source alias.','SOURCE');return configuredBytes(inputs[alias],maximum);}
 }).init();
 return Object.freeze({workspace:sourceWorkspace,workspaceId:initial.workspaceId,sourcesSha256:initial.sourcesSha256,controller,binding,...requestLifetime()});
}
async function receipt(bridge,id,expected){
 uuid(id);sha(expected);
 const selected=await bridge.controller.call(PREFIX+'request',{workspace:bridge.workspace,preparationId:id});
 need(selected.state!=='NOT_FOUND'&&canonicalHash(selected)===expected,'The retained preparation advanced or differs. Read its current receipt before downloading.','RECEIPT_CHANGED');
 return selected;
}
/** Each pass closes the original handed-off handle, including cancellation or an early reader return. */
async function* fileChunks(bridge,selected,pin){
 const original=await bridge.controller.file({bankSourcePreparationId:selected.preparationId,file:pin.name}),h=original.readonlyFileHandle;
 try{
  need(original.bytes===pin.bytes&&original.sha256===pin.sha256&&original.name===pin.name,'The original file selection changed.','CUSTODY');
  const before=await h.stat({bigint:true});need(before.isFile()&&before.size===BigInt(pin.bytes),'The retained file length changed.','CUSTODY');
  let position=0;const hash=createHash('sha256'),buffer=Buffer.alloc(CHUNK);
  while(position<pin.bytes){const {bytesRead}=await h.read(buffer,0,Math.min(CHUNK,pin.bytes-position),position);need(bytesRead>0,'The retained file ended early.','CUSTODY');
   const block=Buffer.from(buffer.subarray(0,bytesRead));hash.update(block);position+=bytesRead;yield block;}
  const after=await h.stat({bigint:true});
  need(stamp(before)===stamp(after)&&hash.digest('hex')===pin.sha256,'The complete original file changed.','CUSTODY');
 }finally{await h.close();}
}
function capsulePrefix(selected){return Buffer.from('{"schema":"stellar-forge.bank-source-capsule.v1","receipt":'+JSON.stringify(selected)+',"files":[','utf8');}
async function* capsuleChunks(bridge,selected){
 yield capsulePrefix(selected);
 for(let i=0;i<selected.files.length;i++){
  const pin=selected.files[i];yield Buffer.from((i?',':'')+JSON.stringify({...pin,encoding:'base64'}).slice(0,-1)+',"contentBase64":"');
  // CHUNK is divisible by three; retain a short read's suffix so padding occurs only once.
  let carry=Buffer.alloc(0);
  for await(const block of fileChunks(bridge,selected,pin)){
   const joined=carry.length?Buffer.concat([carry,block]):block,n=joined.length-joined.length%3;
   if(n)yield Buffer.from(joined.subarray(0,n).toString('base64'));carry=Buffer.from(joined.subarray(n));
  }
  if(carry.length)yield Buffer.from(carry.toString('base64'));
  yield Buffer.from('"}');
 }
 yield Buffer.from(']}');
}
async function verifiedStream(bridge,selected,pin){
 const create=pin?()=>fileChunks(bridge,selected,pin):()=>capsuleChunks(bridge,selected);
 const hash=createHash('sha256');let length=0;
 // Verify every byte before offering a successful response or attachment headers.
 for await(const block of create()){length+=block.length;hash.update(block);}
 const digest=hash.digest('hex'),expected=canonicalHash(selected);
 await receipt(bridge,selected.preparationId,expected);
 return{stream:(async function*(){const second=createHash('sha256');let count=0;
  for await(const block of create()){count+=block.length;second.update(block);yield block;}
  need(count===length&&second.digest('hex')===digest,'The complete download changed between verification and transfer.','CUSTODY');
  await receipt(bridge,selected.preparationId,expected);
 })(),name:pin?pin.name:'bank-source-'+selected.preparationId+'.source-preparation.json',
 type:pin&&!pin.name.endsWith('.json')?'application/octet-stream':'application/json; charset=utf-8',
 bytes:length,sha256:digest,workspaceId:selected.workspaceId,receiptSha256:expected};
}
function queryArgs(query,allowed){
 const q=query instanceof URLSearchParams?Object.fromEntries(query):query;exact(q,allowed);const result={...q};
 for(const name of ['offset','limit'])if(result[name]!==undefined){need(/^\d+$/.test(String(result[name])),'Use an original nonnegative page offset and limit.');result[name]=Number(result[name]);}
 return result;
}
/** Parent performs its normal auth/Origin/Host/CSRF checks before entering this adapter. */
export async function handleBankSourcePreparations(bridge,{method,path,query={},value,apiPath,expectedWorkspaceId,expectedSourcesSha256}={}){
 apiPath=pathBase(apiPath);
 if(path!==apiPath&&!path.startsWith(apiPath+'/'))return null;
 if(!bridge)throw fail('UNAVAILABLE','Configured source preparation is not enabled for this installed accounting owner. Select its original host configuration and workspace alias.',503);
 // Require both original identities on reads as well as writes; same-origin alone is not a workspace binding.
 sha(expectedWorkspaceId);sha(expectedSourcesSha256);bridge.binding();
 need(expectedWorkspaceId===bridge.workspaceId&&expectedSourcesSha256===bridge.sourcesSha256,'This desk belongs to another original accounting workspace. Reopen it.','WORKSPACE');
 const route=path.slice(apiPath.length).replace(/^\//,'');
 const reads={status:[],source:['sourceAlias','name'],list:['offset','limit'],request:['preparationId'],view:['preparationId','offset','limit','itemId','profileId','section','statementId']};
 if(method==='GET'&&(route==='file'||route==='bundle')){
  const args=queryArgs(query,route==='file'?['preparationId','receiptSha256','name']:['preparationId','receiptSha256']);
  exact(args,route==='file'?['preparationId','receiptSha256','name']:['preparationId','receiptSha256'],route==='file'?['preparationId','receiptSha256','name']:['preparationId','receiptSha256']);
  const selected=await receipt(bridge,args.preparationId,args.receiptSha256);let pin;
  if(route==='file'){basename(args.name);pin=selected.files.find(x=>x.name===args.name);need(pin,'Choose one exact original receipt filename.','FILE');}
  else need(selected.state==='COMPLETE','Finish the original preparation before downloading its complete capsule. Retained individual files remain available.','NOT_READY');
  return{download:await verifiedStream(bridge,selected,pin)};
 }
 let action,args;
 if(method==='GET'&&Object.hasOwn(reads,route)){action=route;args=queryArgs(query,reads[route]);}
 else if(method==='POST'&&['prepare','execute'].includes(route)){action=route;args=value;}
 else throw fail('NOT_FOUND','Choose an existing source preparation route.',404);
 const selected=accountingBankSourcesArguments(action,args);
 return{value:await bridge.controller.call(PREFIX+action,{workspace:bridge.workspace,...selected})};
}
/** Stream without buffering a complete capsule and always close an abandoned source iterator. */
export async function sendBankSourceDownload(response,result){
 const filename=result.name.replace(/[\r\n"\\]/g,'_');
 let finished=false;const onClose=()=>{if(!response.writableFinished)finished=true;};
 response.on('close',onClose);
 try{
  if(response.destroyed)throw fail('DOWNLOAD_CLOSED','The receiver closed the original file transfer.',499);
  response.writeHead(200,{'Content-Type':result.type,'Content-Length':String(result.bytes),
   'Content-Disposition':'attachment; filename="'+filename+'"','X-Content-Sha256':result.sha256,
   'X-Accounting-Workspace-Id':result.workspaceId,'X-Source-Receipt-Sha256':result.receiptSha256});
  for await(const block of result.stream){
   if(finished||response.destroyed)throw fail('DOWNLOAD_CLOSED','The receiver closed the original file transfer.',499);
   if(!response.write(block)){
    await new Promise((accept,reject)=>{
     const clean=()=>{response.off('drain',drained);response.off('close',closed);response.off('error',errored);};
     const drained=()=>{clean();accept();},closed=()=>{clean();reject(fail('DOWNLOAD_CLOSED','The receiver closed the original file transfer.',499));},errored=error=>{clean();reject(error);};
     response.once('drain',drained);response.once('close',closed);response.once('error',errored);
     if(response.destroyed)closed();
    });
   }
  }
  response.end();
 }catch(error){response.destroy(error);throw error;}
 finally{response.off('close',onClose);await result.stream.return?.();}
}
