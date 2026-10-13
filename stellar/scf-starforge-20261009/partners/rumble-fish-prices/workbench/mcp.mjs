// MIT. Attach the existing merchant host to the original Rumble application and customer files.
import {lstat,readFile} from 'node:fs/promises';
import {dirname,join,resolve} from 'node:path';
import {acquirePrivateDirectoryWriter} from '../../../sf30-seller-sdk/operations/history.mjs';
import {rumbleWorkspaceTools} from './tools.mjs';
import {RumbleCustomerFiles} from './files.mjs';
import {unpackDelivery,DELIVERY_SCHEMA} from './delivery.mjs';
import {receiveConsumerFeed,verifyWalletState,walletView} from './wallet.mjs';
import {RumbleWorkspaceClient,RUMBLE_CONNECTION_FILENAME,RUMBLE_HASH,RUMBLE_MAX_RESPONSE_BYTES,
  rumbleNeed,rumbleExact,rumblePlain,rumbleAbsolute,rumblePrivateDirectory,
  rumbleReadPrivateJson,rumbleReadPrivateFile,rumbleParseJson,rumbleWritePrivateJson,rumbleDigest} from './connection.mjs';
export const RUMBLE_MCP_CONNECTION_SCHEMA='stellar-forge.rumble-workspace-connection.v1';
const ALIAS=/^[a-z0-9][a-z0-9_-]{0,63}$/;
const schemas=new Map(rumbleWorkspaceTools((name,description,properties,required)=>({name,properties,required})).map(value=>[value.name,value]));
function alias(value) { rumbleNeed(typeof value==='string'&&ALIAS.test(value),'RUMBLE_ALIAS_INVALID','Choose a host-declared alias.');return value; }
function label(value,fallback) {
  const result=value??fallback;
  rumbleNeed(typeof result==='string'&&result.trim()===result&&result.length>0&&result.length<=240&&!/[\x00-\x1f\x7f]/.test(result),'RUMBLE_LABEL_INVALID','Use a readable label.');
  return result;
}
function paged(state,offset=0,limit=50,expectedRevision) {
  rumbleNeed(Number.isSafeInteger(offset)&&offset>=0&&Number.isSafeInteger(limit)&&limit>=1&&limit<=100,
    'RUMBLE_PAGE_INVALID','Use a nonnegative offset and page size1–100.');
  rumbleNeed(expectedRevision===undefined||state.workspace.revision===expectedRevision,'RUMBLE_REVISION_CHANGED','Reload the current workspace revision.',409);
  const result={...state,pages:{}};
  for(const [key,value] of Object.entries(state))if(Array.isArray(value)) {
    result[key]=value.slice(offset,offset+limit);
    result.pages[key]={offset,limit,total:value.length,nextOffset:offset+limit<value.length?offset+limit:null};
  }
  return result;
}
async function location(value,base,{exists=false}={}) {
  rumbleExact(value,['label','directory'],['directory']);
  rumbleNeed(typeof value.directory==='string'&&value.directory.length>0,'RUMBLE_DESTINATION_INVALID','Declare the destination directory.');
  const directory=rumbleAbsolute(resolve(base,value.directory));
  if(exists)await rumblePrivateDirectory(directory);
  else {await rumblePrivateDirectory(dirname(directory));try{await rumblePrivateDirectory(directory);}catch(error){if(error.code!=='ENOENT')throw error;}}
  return {label:label(value.label,directory.split('/').at(-1)),directory};
}
export async function readRumbleWorkspaceConfiguration(path) {
  const source=await rumbleReadPrivateJson(rumbleAbsolute(path)),raw=source.value;
  rumbleExact(raw,['schema','workspaces'],['schema','workspaces']);
  rumbleNeed(raw.schema===RUMBLE_MCP_CONNECTION_SCHEMA&&rumblePlain(raw.workspaces)&&
    Object.keys(raw.workspaces).length>=1&&Object.keys(raw.workspaces).length<=32,
    'RUMBLE_CONFIGURATION_INVALID','Declare1–32 original customer workspaces.');
  const base=dirname(source.path),workspaces=Object.create(null),directories=new Set();
  for(const[name,input]of Object.entries(raw.workspaces)){
    alias(name);rumbleExact(input,['label','directory','workspaceId','inputs','destinations','wallets'],['directory','workspaceId']);
    const directory=(await rumblePrivateDirectory(resolve(base,input.directory))).path;
    rumbleNeed(!directories.has(directory),'RUMBLE_WORKSPACE_DUPLICATE','Give each original workspace one alias.');directories.add(directory);
    rumbleNeed(/^workspace-[a-f0-9]{24}$/.test(input.workspaceId??''),'RUMBLE_WORKSPACE_ID_INVALID','Select the original workspace ID.');
    const state=(await rumbleReadPrivateJson(join(directory,'workspace.json'),32*1024*1024)).value;
    rumbleNeed(state.schema==='tjlabs.prices-workbench.workspace.v1'&&state.id===input.workspaceId,'RUMBLE_WORKSPACE_CHANGED','The selected original workspace differs.',409);
    const inputs=Object.create(null),destinations=Object.create(null),wallets=Object.create(null);
    for(const key of['inputs','destinations','wallets'])rumbleNeed(input[key]===undefined||rumblePlain(input[key])&&Object.keys(input[key]).length<=256,'RUMBLE_CONFIGURATION_INVALID','Declare at most256 items per input family.');
    for(const[key,value]of Object.entries(input.inputs||{})){
      alias(key);rumbleExact(value,['label','kind','file','sha256'],['kind','file','sha256']);
      rumbleNeed(['book','configuration','plan','bundle'].includes(value.kind)&&RUMBLE_HASH.test(value.sha256??'')&&typeof value.file==='string'&&value.file.length>0,'RUMBLE_INPUT_INVALID','Declare the complete original input at its reviewed SHA.');
      const maximum=value.kind==='bundle'?RUMBLE_MAX_RESPONSE_BYTES:1024*1024;
      const original=await rumbleReadPrivateFile(resolve(base,value.file),maximum);
      rumbleNeed(original.sha256===value.sha256,'RUMBLE_INPUT_CHANGED','The declared original input changed.',409);
      inputs[key]={label:label(value.label,key),kind:value.kind,file:original.path,sha256:original.sha256,bytes:original.bytes.length,maximum};
    }
    for(const[key,value]of Object.entries(input.destinations||{}))destinations[alias(key)]=await location(value,base);
    for(const[key,value]of Object.entries(input.wallets||{}))wallets[alias(key)]=await location(value,base,{exists:true});
    rumbleNeed([...Object.values(destinations),...Object.values(wallets)].every(value=>value.directory!==directory),
      'RUMBLE_DESTINATION_CONFLICT','Keep consumer receiving and wallet destinations separate from the running original workspace.');
    workspaces[name]={label:label(input.label,name),directory,workspaceId:input.workspaceId,connectionFile:join(directory,RUMBLE_CONNECTION_FILENAME),inputs,destinations,wallets};
  }
  return {configuration:source.path,sha256:source.sha256,workspaces};
}
export class MerchantRumbleWorkspaces {
  #config;#clients=new Map();#files;#tail=Promise.resolve();#pending=new Set();#closing=false;#closed;
  constructor(config){this.#config=config;this.#files=new RumbleCustomerFiles(config.exportsDirectory);}
  get summary(){return{configured:Boolean(this.#config.rumbleWorkspaces),connected:[...this.#clients.keys()],pending:this.#pending.size,closing:this.#closing,...this.#files.summary};}
  #scope(name){const scope=this.#config.rumbleWorkspaces?.workspaces?.[alias(name)];rumbleNeed(scope,'RUMBLE_WORKSPACE_NOT_CONFIGURED','Choose an original configured workspace.',404);return{...scope,alias:name};}
  #client(scope){const client=this.#clients.get(scope.alias);rumbleNeed(client,'RUMBLE_WORKSPACE_DISCONNECTED','Connect the original application.',409);return client;}
  async #input(scope,args,kind){
    const input=scope.inputs[alias(args.sourceInput)];
    rumbleNeed(input&&input.kind===kind&&input.sha256===args.expectedSourceSha256,'RUMBLE_INPUT_SELECTION_CHANGED','Select the declared original input and SHA.',409);
    const source=await rumbleReadPrivateFile(input.file,input.maximum);
    rumbleNeed(source.sha256===input.sha256&&source.bytes.length===input.bytes,'RUMBLE_INPUT_CHANGED','The declared original input changed.',409);
    return source;
  }
  async #received(scope,name){
    const target=scope.destinations[alias(name)];rumbleNeed(target,'RUMBLE_DESTINATION_NOT_CONFIGURED','Choose a declared receiving destination.');
    await rumblePrivateDirectory(target.directory);
    const record=(await rumbleReadPrivateJson(join(target.directory,'rumble.receiving.json'))).value;
    const state=(await rumbleReadPrivateJson(join(target.directory,'workspace','workspace.json'),32*1024*1024)).value;
    rumbleNeed(record.schema==='stellar-forge.rumble-receiving.v1'&&state.schema==='tjlabs.prices-workbench.workspace.v1'&&record.workspaceId===state.id,
      'RUMBLE_RECEIVING_INVALID','The destination is not the original received customer workspace.');
    return{destination:name,directory:target.directory,workspaceDirectory:join(target.directory,'workspace'),workspaceId:state.id,revision:state.revision,record,application:'rumble-workspace'};
  }
  async #receive(scope,args){
    const source=await this.#input(scope,args,'bundle'),bundle=rumbleParseJson(source.bytes);
    rumbleNeed(bundle.schema===DELIVERY_SCHEMA&&bundle.workspaceId===scope.workspaceId,'RUMBLE_RECEIVING_CHANGED','Receive the selected original customer workspace.',409);
    rumbleNeed(Array.isArray(bundle.files)&&bundle.files.length>0&&bundle.files.length<=20000,
      'RUMBLE_RECEIVING_INVALID','Select a complete original delivery with at most20000 files.');
    const seen=new Set();let totalBytes=0;
    for(const file of bundle.files){
      rumbleNeed(typeof file.path==='string'&&Buffer.byteLength(file.path,'utf8')<=4096&&!/[\x00-\x1f\x7f]/.test(file.path)&&!file.path.includes('\\\\')&&!file.path.startsWith('/')&&!file.path.split('/').some(p=>!p||p==='.'||p==='..')&&!seen.has(file.path)&&file.encoding==='base64'&&typeof file.content==='string',
        'RUMBLE_RECEIVING_INVALID','The original delivery contains an invalid or duplicate file.');
      const bytes=Buffer.from(file.content,'base64');totalBytes+=bytes.length;seen.add(file.path);
      rumbleNeed(bytes.length===file.bytes&&rumbleDigest(bytes)===file.sha256&&totalBytes<=256*1024*1024,
        'RUMBLE_RECEIVING_INVALID','The complete original file bytes differ from their recorded identity.');
    }
    for(const path of ['package.json','cli.mjs','runner.mjs','client.mjs','workspace/workspace.json'])
      rumbleNeed(seen.has(path),'RUMBLE_RECEIVING_INVALID','The original complete delivery is missing '+path);
    const target=scope.destinations[alias(args.destination)];rumbleNeed(target,'RUMBLE_DESTINATION_NOT_CONFIGURED','Choose a declared receiving destination.');
    try{
      const current=await this.#received(scope,args.destination);
      rumbleNeed(current.record.sourceSha256===source.sha256,'RUMBLE_RECEIVING_CONFLICT','This destination already received a different complete delivery.',409);
      return{...current,reused:true};
    }catch(error){if(error.code!=='ENOENT')throw error;}
    let exists=false;try{await lstat(target.directory);exists=true;}catch(error){if(error.code!=='ENOENT')throw error;}
    if(!exists)await unpackDelivery(bundle,target.directory);
    // Recover an accepted native unpack before receipt publication without replaying it.
    await rumblePrivateDirectory(target.directory);
    for(const file of bundle.files){
      rumbleNeed(typeof file.path==='string'&&Buffer.byteLength(file.path,'utf8')<=4096&&!/[\x00-\x1f\x7f]/.test(file.path)&&!file.path.includes('\\')&&!file.path.startsWith('/')&&!file.path.split('/').some(p=>!p||p==='.'||p==='..'),
        'RUMBLE_RECEIVING_INVALID','The original delivery contains an invalid path.');
      const current=await rumbleReadPrivateFile(join(target.directory,file.path),RUMBLE_MAX_RESPONSE_BYTES);
      rumbleNeed(current.sha256===file.sha256&&current.bytes.length===file.bytes,'RUMBLE_RECEIVING_INCOMPLETE','The retained original receiving has not completed; inspect its exact saved files.',409);
    }
    const record={schema:'stellar-forge.rumble-receiving.v1',sourceSha256:source.sha256,sourceBytes:source.bytes.length,
      workspaceId:bundle.workspaceId,sourceRevision:bundle.revision,files:bundle.files.length,receivedAt:new Date().toISOString()};
    await rumbleWritePrivateJson(join(target.directory,'rumble.receiving.json'),record);
    return{...await this.#received(scope,args.destination),reused:exists};
  }
  async #wallet(scope,args,receive=false){
    const selected=scope.wallets[alias(args.wallet)];rumbleNeed(selected,'RUMBLE_WALLET_NOT_CONFIGURED','Choose a host-declared wallet.');
    await rumblePrivateDirectory(selected.directory);
    const lease=await acquirePrivateDirectoryWriter(selected.directory);
    try{
      const path=join(selected.directory,'wallet.json');let current;
      try{current=await rumbleReadPrivateJson(path,RUMBLE_MAX_RESPONSE_BYTES);verifyWalletState(current.value);}catch(error){if(error.code!=='ENOENT')throw error;}
      if(!receive)return{wallet:args.wallet,sourceSha256:current?.sha256??null,view:current?walletView(current.value):null,
        receipts:current?.value.receipts.map(({sourceRevision,sourceSha256,receivedAt,feed})=>({sourceRevision,sourceSha256,receivedAt,editionId:feed.edition.id}))??[]};
      const feed=await this.#client(scope).values({consumerId:args.consumerId,editionId:args.editionId});
      const result=receiveConsumerFeed(current?.value??null,feed);
      // An identical accepted feed can reconcile a lost response even after the wallet SHA advanced.
      rumbleNeed(result.outcome==='replayed'||(current?.sha256??null)===args.expectedWalletSha256,'RUMBLE_WALLET_CHANGED','Read the current wallet before adopting a different feed.',409);
      let written=current;
      if(result.outcome!=='replayed')written=await rumbleWritePrivateJson(path,result.state,{replace:Boolean(current)});
      return{wallet:args.wallet,outcome:result.outcome,sourceSha256:written.sha256,view:result.view};
    }finally{await lease.release();}
  }
  async #dispatch(name,args){
    const schema=schemas.get(name);rumbleNeed(schema,'RUMBLE_TOOL_UNKNOWN','Choose a declared Rumble tool.');
    rumbleExact(args,Object.keys(schema.properties),schema.required);
    if(name==='merchant_rumble_status'&&args.workspace===undefined)return{...this.summary,workspaces:Object.entries(this.#config.rumbleWorkspaces?.workspaces||{}).map(([workspace,s])=>({
      workspace,label:s.label,workspaceId:s.workspaceId,state:this.#clients.has(workspace)?'CONNECTED':'DISCONNECTED',
      inputs:Object.entries(s.inputs).map(([sourceInput,v])=>({sourceInput,label:v.label,kind:v.kind,sha256:v.sha256,bytes:v.bytes})),
      destinations:Object.entries(s.destinations).map(([destination,v])=>({destination,label:v.label,directory:v.directory})),
      wallets:Object.entries(s.wallets).map(([wallet,v])=>({wallet,label:v.label,directory:v.directory}))}))};
    const scope=this.#scope(args.workspace);
    if(name==='merchant_rumble_connect'){
      const client=await RumbleWorkspaceClient.connect(scope.connectionFile,{directory:scope.directory,workspaceId:scope.workspaceId,expectedInstanceId:args.expectedInstanceId});
      const old=this.#clients.get(scope.alias);if(old){await old.close();await this.#files.disconnect(scope);}
      this.#clients.set(scope.alias,client);return{workspace:scope.alias,state:'CONNECTED',...client.connection,native:paged(await client.state())};
    }
    if(name==='merchant_rumble_disconnect'){
      const client=this.#clients.get(scope.alias);rumbleNeed(!client||client.connection.instanceId===args.instanceId,'RUMBLE_INSTANCE_CHANGED','Disconnect the exact attached instance.',409);
      await client?.close();await this.#files.disconnect(scope);this.#clients.delete(scope.alias);return{workspace:scope.alias,instanceId:args.instanceId,state:'DISCONNECTED'};
    }
    if(name==='merchant_rumble_exports')return this.#files.list(scope,args.offset,args.limit);
    if(name==='merchant_rumble_file')return this.#files.read(scope,args);
    if(name==='merchant_rumble_file_release'){await this.#files.release(scope,args.readId);return{workspace:scope.alias,readId:args.readId,released:true};}
    if(name==='merchant_rumble_received')return this.#received(scope,args.destination);
    if(name==='merchant_rumble_receive')return this.#receive(scope,args);
    if(name==='merchant_rumble_wallet')return this.#wallet(scope,args);
    if(name==='merchant_rumble_wallet_receive')return this.#wallet(scope,args,true);
    if(name==='merchant_rumble_status'&&!this.#clients.has(scope.alias))return{workspace:scope.alias,state:'DISCONNECTED'};
    if(name==='merchant_rumble_export')return this.#files.export(scope,this.#clients.get(scope.alias),args);
    const client=this.#client(scope),{workspace,...input}=args;
    switch(name){
      case'merchant_rumble_status':return{workspace:scope.alias,state:'CONNECTED',...client.connection,native:paged(await client.state(),args.offset,args.limit,args.expectedRevision)};
      case'merchant_rumble_browser':return{workspace:scope.alias,...await client.browser()};
      case'merchant_rumble_consumer':return client.consumer(input);
      case'merchant_rumble_edition':return client.edition(input);
      case'merchant_rumble_create_edition':return client.createEdition(input);
      case'merchant_rumble_review_edition':return client.reviewEdition(input);
      case'merchant_rumble_get_plan':return client.getPlan(input);
      case'merchant_rumble_start':return client.start(input);
      case'merchant_rumble_pause':return client.pause();
      case'merchant_rumble_resume':return client.resume(input);
      case'merchant_rumble_result':return client.result(input);
      case'merchant_rumble_save_consumer':return client.saveConsumer({consumerId:args.consumerId,expectedRevision:args.expectedRevision,configuration:rumbleParseJson((await this.#input(scope,args,'book')).bytes)});
      case'merchant_rumble_configure':return client.configure({expectedRevision:args.expectedRevision,configuration:rumbleParseJson((await this.#input(scope,args,'configuration')).bytes)});
      case'merchant_rumble_plan':return client.plan(rumbleParseJson((await this.#input(scope,args,'plan')).bytes));
      default:rumbleNeed(false,'RUMBLE_TOOL_UNKNOWN','Choose a declared Rumble tool.');
    }
  }
  async call(name,args={}){
    rumbleNeed(!this.#closing,'RUMBLE_MCP_CLOSING','The Rumble attachment is closing.',409);
    const operation=this.#tail.then(()=>this.#dispatch(name,args));this.#tail=operation.catch(()=>{});this.#pending.add(operation);
    try{return await operation;}finally{this.#pending.delete(operation);}
  }
  close(){if(this.#closed)return this.#closed;this.#closing=true;return this.#closed=(async()=>{
    await Promise.allSettled([...this.#pending]);await Promise.all([...this.#clients.values()].map(c=>c.close()));await this.#files.close();this.#clients.clear();
  })().catch(error=>{this.#closed=null;throw error;});}
}
export {rumbleWorkspaceTools} from './tools.mjs';
