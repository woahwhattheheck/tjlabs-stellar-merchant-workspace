// MIT. Host-declared tools attach to the original Applications-owned Allium workspace.
import {lstat} from 'node:fs/promises';
import {dirname,join,resolve,basename} from 'node:path';
import {ALLIUM_ACTIONS,alliumWorkspaceTools} from './tools.mjs';
import {AlliumCustomerFiles} from './files.mjs';
import {importAlliumWorkspace} from './model.mjs';
import {AlliumWorkspaceClient,ALLIUM_CONNECTION_FILENAME,ALLIUM_HASH,ALLIUM_MAX_RESPONSE_BYTES,
  alliumNeed,alliumExact,alliumPlain,alliumAbsolute,alliumPrivateDirectory,
  alliumReadPrivateJson,alliumReadPrivateFile,alliumParseJson} from './connection.mjs';

export const ALLIUM_MCP_CONNECTION_SCHEMA='stellar-forge.allium-workspace-connection.v1';
const ALIAS=/^[a-z0-9][a-z0-9_-]{0,63}$/;
const schemas=new Map(alliumWorkspaceTools((name,description,properties,required)=>({name,properties,required})).map(value=>[value.name,value]));
function alias(value) {
  alliumNeed(typeof value==='string'&&ALIAS.test(value),'ALLIUM_ALIAS_INVALID','Choose a declared original workspace, input or profile alias.');
  return value;
}
function label(value,fallback) {
  const result=value??fallback;
  alliumNeed(typeof result==='string'&&result.trim()===result&&result.length>=1&&result.length<=240&&!/[\x00-\x1f\x7f]/.test(result),
    'ALLIUM_LABEL_INVALID','Use a readable label of 1–240 characters.');
  return result;
}
function page(value,offset=0,limit=50,expectedRevision) {
  alliumNeed(Number.isSafeInteger(offset)&&offset>=0&&Number.isSafeInteger(limit)&&limit>=1&&limit<=200,
    'ALLIUM_PAGE_INVALID','Choose a nonnegative offset and a page size from 1 to 200.');
  alliumNeed(expectedRevision===undefined||value.revision===expectedRevision,'ALLIUM_REVISION_CHANGED',
    'The original workspace changed between pages. Reload its current revision.',409);
  const result={...value,pages:{}};
  const apply=(target,source,key,prefix='')=>{
    if(!Array.isArray(source?.[key])) return;
    target[key]=source[key].slice(offset,offset+limit);
    result.pages[prefix+key]={offset,limit,total:source[key].length,nextOffset:offset+limit<source[key].length?offset+limit:null};
  };
  for(const key of ['revisions','acquisitions','configurations','operations','imports']) apply(result,value,key);
  for(const key of ['publisher','versions']) if(alliumPlain(value[key])) {
    result[key]={...value[key]};
    for(const collection of ['candidates','buyers','recovery','versions','history']) apply(result[key],value[key],collection,key+'.');
  }
  return result;
}
function view(value) {
  return value?.state?.schema==='stellar-forge.allium-workspace.v1'?{...value,state:page(value.state)}:value;
}
async function destination(value,base) {
  alliumExact(value,['label','directory'],['directory']);
  alliumNeed(typeof value.directory==='string'&&value.directory.length>0,'ALLIUM_DESTINATION_INVALID','Declare the receiving directory.');
  const directory=alliumAbsolute(resolve(base,value.directory));
  await alliumPrivateDirectory(dirname(directory));
  try { await alliumPrivateDirectory(directory); } catch(error) { if(error.code!=='ENOENT') throw error; }
  return {label:label(value.label,basename(directory)),directory};
}
/** Configuration selects local source aliases; it starts no server, query, seller or import. */
export async function readAlliumWorkspaceConfiguration(path) {
  const source=await alliumReadPrivateJson(alliumAbsolute(path)),raw=source.value;
  alliumExact(raw,['schema','workspaces'],['schema','workspaces']);
  alliumNeed(raw.schema===ALLIUM_MCP_CONNECTION_SCHEMA&&alliumPlain(raw.workspaces)&&
    Object.keys(raw.workspaces).length>=1&&Object.keys(raw.workspaces).length<=32,
  'ALLIUM_CONFIGURATION_INVALID','Declare 1–32 original Allium workspaces.');
  const base=dirname(source.path),workspaces=Object.create(null),directories=new Set();
  for(const [name,input] of Object.entries(raw.workspaces)) {
    alias(name); alliumExact(input,['label','directory','workspaceId','inputs','merchants','launches','destinations'],['directory']);
    alliumNeed(typeof input.directory==='string'&&input.directory.length>0,'ALLIUM_CONFIGURATION_INVALID','Declare the original workspace directory.');
    const directory=(await alliumPrivateDirectory(resolve(base,input.directory))).path;
    alliumNeed(!directories.has(directory),'ALLIUM_WORKSPACE_DUPLICATE','Give each original workspace one host alias.');
    directories.add(directory);
    alliumNeed(input.workspaceId===undefined||/^allium-[a-f0-9-]{36}$/.test(input.workspaceId),
      'ALLIUM_WORKSPACE_ID_INVALID','Use the original workspace ID.');
    const inputs=Object.create(null),merchants=Object.create(null),launches=Object.create(null),destinations=Object.create(null);
    for(const key of ['inputs','merchants','launches','destinations'])
      alliumNeed(input[key]===undefined||alliumPlain(input[key])&&Object.keys(input[key]).length<=256,
        'ALLIUM_CONFIGURATION_INVALID','Use up to 256 declared inputs, profiles or destinations.');
    for(const [key,value] of Object.entries(input.inputs||{})) {
      alias(key); alliumExact(value,['label','kind','file','sha256'],['kind','file','sha256']);
      alliumNeed(['product','result','bundle'].includes(value.kind)&&ALLIUM_HASH.test(value.sha256??'')&&
        typeof value.file==='string'&&value.file.length>0,'ALLIUM_INPUT_INVALID','Declare an original product, result or complete bundle file at its reviewed SHA.');
      const maximum=value.kind==='product'?65536:value.kind==='result'?1024*1024:ALLIUM_MAX_RESPONSE_BYTES;
      const original=await alliumReadPrivateFile(resolve(base,value.file),maximum);
      alliumNeed(original.sha256===value.sha256,'ALLIUM_INPUT_CHANGED','The original input differs from its declared SHA.',409);
      inputs[key]={label:label(value.label,key),kind:value.kind,file:original.path,sha256:original.sha256,bytes:original.bytes.length,maximum};
    }
    for(const [key,value] of Object.entries(input.merchants||{})) {
      alias(key); alliumExact(value,['label','origin','path','payment','settings'],['origin','path','payment']);
      alliumNeed(typeof value.origin==='string'&&typeof value.path==='string'&&alliumPlain(value.payment)&&
        (value.settings===undefined||alliumPlain(value.settings)),'ALLIUM_MERCHANT_INVALID','Declare original merchant origin, path, payment and optional retention settings.');
      merchants[key]={...value,label:label(value.label,key)};
    }
    for(const [key,value] of Object.entries(input.launches||{})) {
      alias(key); alliumExact(value,['label','port','facilitator','allowLocalFacilitator']);
      alliumNeed(value.port===undefined||Number.isInteger(value.port)&&value.port>=0&&value.port<=65535,
        'ALLIUM_LAUNCH_INVALID','Use a local seller port from 0 to 65535.');
      alliumNeed(value.facilitator===undefined||value.facilitator===null||typeof value.facilitator==='string',
        'ALLIUM_LAUNCH_INVALID','Declare the original facilitator URL or null.');
      alliumNeed(value.allowLocalFacilitator===undefined||typeof value.allowLocalFacilitator==='boolean',
        'ALLIUM_LAUNCH_INVALID','Use a boolean local-facilitator choice.');
      launches[key]={...value,label:label(value.label,key)};
    }
    for(const [key,value] of Object.entries(input.destinations||{})) destinations[alias(key)]=await destination(value,base);
    alliumNeed(Object.values(destinations).every(value=>value.directory!==directory),'ALLIUM_DESTINATION_CONFLICT',
      'Receive into a separate original workspace.');
    workspaces[name]={label:label(input.label,name),directory,workspaceId:input.workspaceId||null,
      connectionFile:join(directory,ALLIUM_CONNECTION_FILENAME),inputs,merchants,launches,destinations};
  }
  return {configuration:source.path,sha256:source.sha256,workspaces};
}
export class MerchantAlliumWorkspaces {
  #config; #clients=new Map(); #files; #pending=new Set(); #tail=Promise.resolve(); #closing=false; #closed;
  constructor(config) { this.#config=config; this.#files=new AlliumCustomerFiles(config.exportsDirectory); }
  get summary() {
    return {configured:Boolean(this.#config.alliumWorkspaces),connected:[...this.#clients.keys()],
      pending:this.#pending.size,closing:this.#closing,...this.#files.summary};
  }
  #scope(name) {
    const scope=this.#config.alliumWorkspaces?.workspaces?.[alias(name)];
    alliumNeed(scope,'ALLIUM_WORKSPACE_NOT_CONFIGURED','Choose an alias from merchant_allium_status.',404);
    return {...scope,alias:name};
  }
  #client(scope) {
    const client=this.#clients.get(scope.alias);
    alliumNeed(client,'ALLIUM_WORKSPACE_DISCONNECTED','Connect the original saved Allium application.',409);
    return client;
  }
  async #input(scope,args,kind) {
    const input=scope.inputs[alias(args.sourceInput)];
    alliumNeed(input&&input.kind===kind&&input.sha256===args.expectedSourceSha256,
      'ALLIUM_INPUT_SELECTION_CHANGED','Choose the declared original input and its reviewed SHA.',409);
    const source=await alliumReadPrivateFile(input.file,input.maximum);
    alliumNeed(source.sha256===input.sha256&&source.bytes.length===input.bytes,
      'ALLIUM_INPUT_CHANGED','The selected original source file changed.',409);
    return {...source,input};
  }
  async #received(scope,name) {
    const target=scope.destinations[alias(name)];
    alliumNeed(target,'ALLIUM_DESTINATION_NOT_CONFIGURED','Choose a host-declared receiving destination.');
    await alliumPrivateDirectory(target.directory);
    const state=(await alliumReadPrivateJson(join(target.directory,'workspace.json'),32*1024*1024)).value;
    alliumNeed(state?.schema==='stellar-forge.allium-workspace.v1'&&Array.isArray(state.imports),
      'ALLIUM_RECEIVING_INVALID','The destination is not an original received Allium workspace.');
    return {destination:name,directory:target.directory,workspaceId:state.id,revision:state.revision,
      head:state.head,imports:state.imports,application:'allium-workspace'};
  }
  async #dispatch(name,args) {
    const schema=schemas.get(name);
    alliumNeed(schema,'ALLIUM_TOOL_UNKNOWN','Choose a declared Allium workspace tool.');
    alliumExact(args,Object.keys(schema.properties),schema.required);
    if(name==='merchant_allium_status'&&args.workspace===undefined) return {...this.summary,
      workspaces:Object.entries(this.#config.alliumWorkspaces?.workspaces||{}).map(([workspace,scope])=>({
        workspace,label:scope.label,workspaceId:scope.workspaceId,state:this.#clients.has(workspace)?'CONNECTED':'DISCONNECTED',
        inputs:Object.entries(scope.inputs).map(([sourceInput,value])=>({sourceInput,label:value.label,kind:value.kind,sha256:value.sha256,bytes:value.bytes})),
        merchants:Object.entries(scope.merchants).map(([profile,value])=>({profile,...value})),
        launches:Object.entries(scope.launches).map(([profile,value])=>({profile,...value})),
        destinations:Object.entries(scope.destinations).map(([destination,value])=>({destination,...value})),
      }))};
    const scope=this.#scope(args.workspace);
    if(name==='merchant_allium_connect') {
      const client=await AlliumWorkspaceClient.connect(scope.connectionFile,{directory:scope.directory,
        workspaceId:scope.workspaceId,expectedInstanceId:args.expectedInstanceId});
      const old=this.#clients.get(scope.alias);
      if(old) { await old.close(); await this.#files.disconnect(scope); }
      this.#clients.set(scope.alias,client);
      return {workspace:scope.alias,state:'CONNECTED',...client.connection,native:page(await client.state())};
    }
    if(name==='merchant_allium_disconnect') {
      const client=this.#clients.get(scope.alias);
      alliumNeed(!client||client.connection.instanceId===args.instanceId,'ALLIUM_INSTANCE_CHANGED','Use the connected original instance ID.',409);
      await client?.close(); await this.#files.disconnect(scope); this.#clients.delete(scope.alias);
      return {workspace:scope.alias,instanceId:args.instanceId,state:'DISCONNECTED'};
    }
    if(name==='merchant_allium_exports') return this.#files.list(scope,args.offset,args.limit);
    if(name==='merchant_allium_file') return this.#files.read(scope,args);
    if(name==='merchant_allium_file_release') {
      await this.#files.release(scope,args.readId); return {workspace:scope.alias,readId:args.readId,released:true};
    }
    if(name==='merchant_allium_received') return this.#received(scope,args.destination);
    if(name==='merchant_allium_receive') {
      const source=await this.#input(scope,args,'bundle'),bundle=alliumParseJson(source.bytes);
      const target=scope.destinations[alias(args.destination)];
      alliumNeed(target,'ALLIUM_DESTINATION_NOT_CONFIGURED','Choose a host-declared receiving destination.');
      try {
        await lstat(target.directory);
        const current=await this.#received(scope,args.destination);
        alliumNeed(current.workspaceId===bundle.workspaceId&&current.imports.some(item=>
          item.exportId===bundle.id&&item.manifestSha256===bundle.manifestSha256&&item.originalDirectory===bundle.sourceDirectory),
        'ALLIUM_RECEIVING_CONFLICT','The destination belongs to a different original export.',409);
        return {...current,reused:true,sourceSha256:source.sha256};
      } catch(error) { if(error.code!=='ENOENT') throw error; }
      await alliumPrivateDirectory(dirname(target.directory));
      await importAlliumWorkspace({directory:target.directory,bundle});
      return {...await this.#received(scope,args.destination),reused:false,sourceSha256:source.sha256};
    }
    if(name==='merchant_allium_export')
      return this.#files.export(scope,this.#clients.get(scope.alias),args);
    if(name==='merchant_allium_status'&&!this.#clients.has(scope.alias))
      return {workspace:scope.alias,label:scope.label,state:'DISCONNECTED'};
    const client=this.#client(scope),action=ALLIUM_ACTIONS[name.slice('merchant_allium_'.length)];
    if(action) { const {workspace,...payload}=args; return view(await client[action.method](payload)); }
    switch(name) {
      case 'merchant_allium_status': return {workspace:scope.alias,state:'CONNECTED',...client.connection,
        native:page(await client.state(),args.offset,args.limit,args.expectedRevision)};
      case 'merchant_allium_browser': return {workspace:scope.alias,...await client.browser()};
      case 'merchant_allium_revision': return client.revision(args.revisionId);
      case 'merchant_allium_acquisition': return client.acquisition(args.acquisitionId);
      case 'merchant_allium_save_product': {
        const source=await this.#input(scope,args,'product');
        return view(await client.saveProduct({operationId:args.operationId,expectedHead:args.expectedHead,
          productText:new TextDecoder('utf-8',{fatal:true}).decode(source.bytes),note:args.note??''}));
      }
      case 'merchant_allium_import_result': {
        const source=await this.#input(scope,args,'result');
        return view(await client.importResult({operationId:args.operationId,revisionId:args.revisionId,
          resultBase64:source.bytes.toString('base64'),filename:basename(source.path),note:args.note??''}));
      }
      case 'merchant_allium_configure': {
        const profile=scope.merchants[alias(args.profile)];
        alliumNeed(profile,'ALLIUM_MERCHANT_NOT_CONFIGURED','Choose a declared reviewed merchant profile.');
        const {label,...terms}=profile;
        return view(await client.configure({...terms,operationId:args.operationId,acquisitionId:args.acquisitionId,
          expectedConfigurationId:args.expectedConfigurationId}));
      }
      case 'merchant_allium_merchant_start': {
        const profile=scope.launches[alias(args.profile)];
        alliumNeed(profile,'ALLIUM_LAUNCH_NOT_CONFIGURED','Choose a declared original merchant launch profile.');
        const {label,...launch}=profile;
        return view(await client.startMerchant({...launch,expectedConfigurationId:args.expectedConfigurationId}));
      }
      case 'merchant_allium_download': return this.#files.download(scope,client,args);
      default: alliumNeed(false,'ALLIUM_TOOL_UNKNOWN','Choose a declared Allium workspace tool.');
    }
  }
  async call(name,args={}) {
    alliumNeed(!this.#closing,'ALLIUM_MCP_CLOSING','The Allium attachment is closing.',409);
    // Lifecycle, file publication and native mutations retain one dispatch order per host.
    const operation=this.#tail.then(()=>this.#dispatch(name,args)); this.#tail=operation.catch(()=>{});
    this.#pending.add(operation);
    try { return await operation; } finally { this.#pending.delete(operation); }
  }
  close() {
    if(this.#closed) return this.#closed;
    this.#closing=true;
    return this.#closed=(async()=>{
      await Promise.allSettled([...this.#pending]);
      await Promise.all([...this.#clients.values()].map(client=>client.close()));
      await this.#files.close(); this.#clients.clear();
    })().catch(error=>{this.#closed=null;throw error;});
  }
}
export {alliumWorkspaceTools} from './tools.mjs';
