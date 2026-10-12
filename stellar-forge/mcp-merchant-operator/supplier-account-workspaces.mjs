// MIT. Managed Merchant operations over the original supplier-account workspace.
import { failure, identifier } from './host-files.mjs';
import { RetainedFileReads } from './retained-file-reads.mjs';
import { validateSupplierAccountArguments, supplierAccountPlain, SUPPLIER_ACCOUNT_REPLY_BYTES,
  SUPPLIER_ACCOUNT_EXPORT_MANIFEST, MAX_SUPPLIER_ACCOUNT_FILE_BYTES } from './supplier-account-contracts.mjs';
import { readSupplierAccountBackupInput, supplierAccountInputSummary } from './supplier-account-connection.mjs';
import { readSupplierAccountExport, retainSupplierAccountExport, supplierAccountExportSummary } from './supplier-account-exports.mjs';
export { readSupplierAccountWorkspaceConfiguration, initializeSupplierAccountMerchant } from './supplier-account-connection.mjs';

const PREFIX='merchant_supplier_account_';
const pick=(value,keys)=>Object.fromEntries(keys.filter(key=>Object.hasOwn(value??{},key)).map(key=>[key,value[key]]));
const omit=(value,keys)=>Object.fromEntries(Object.entries(value).filter(([key])=>!keys.includes(key)));
const size=value=>Buffer.byteLength(JSON.stringify(value));
function fullReply(value){
  if(!supplierAccountPlain(value))throw failure('SUPPLIER_ACCOUNT_REPLY_INVALID','The original account operation returned no structured value.');
  if(size(value)>SUPPLIER_ACCOUNT_REPLY_BYTES)throw failure('SUPPLIER_ACCOUNT_RECORD_TOO_LARGE',
    'Use export_report or export_backup to receive the complete original records beyond the 1 MiB inline limit.');
  return value;
}
function changeView(change){
  if(!change||size(change)<SUPPLIER_ACCOUNT_REPLY_BYTES-16384)return change;
  return{...pick(change,['id','revision','status','createdAt','updatedAt','reviewSha256']),fullChangeRetained:true,
    receivingTool:PREFIX+'export_report'};
}
/** A committed or interrupted native write keeps its exact original recovery identity. */
export function projectSupplierAccountOperation({workspace,workspaceId,operation,change,error}){
  return fullReply({schema:'stellar-forge.supplier-account-operation.v1',workspace,workspaceId,operation,
    state:error?'NATIVE_ERROR':'COMPLETE',change:changeView(change)??null,
    ...(error?{error:{code:String(error.code??'SUPPLIER_ACCOUNT_OPERATION_FAILED').slice(0,160),
      reason:String(error.message??'The original account operation failed.').slice(0,8192),
      ...(error.changeId||change?.id?{changeId:error.changeId??change.id}:{})}}:{})});
}
function pageReply(page){
  const result={...omit(page,['items']),items:[]};
  for(const item of page.items){
    if(size({...result,items:[...result.items,item]})>SUPPLIER_ACCOUNT_REPLY_BYTES){
      if(!result.items.length)throw failure('SUPPLIER_ACCOUNT_RECORD_TOO_LARGE',
        'This complete original review exceeds the inline page limit. Receive the full report or native backup.');
      break;
    }
    result.items.push(item);
  }
  result.nextOffset=result.offset+result.items.length<result.total?result.offset+result.items.length:null;
  if(result.nextOffset!==null&&result.nextOffset<=result.offset)
    throw failure('SUPPLIER_ACCOUNT_PAGE_INVALID','The original history page did not advance.');
  return fullReply(result);
}
export class MerchantSupplierAccountWorkspaces {
  #config;#handles=new Map();#tails=new Map();#pending=new Set();#closingAliases=new Map();#closing=false;#close;
  #files=new RetainedFileReads({errorPrefix:'SUPPLIER_ACCOUNT',maxSnapshotBytes:2*MAX_SUPPLIER_ACCOUNT_FILE_BYTES});
  #readExports=new Map();
  constructor(config){this.#config=config;}
  get summary(){
    const aliases=this.#config.supplierAccountWorkspaces?.workspaces??{};
    return{configured:Object.keys(aliases).length>0,count:Object.keys(aliases).length,opened:[...this.#handles.keys()],
      pending:this.#pending.size,closing:this.#closing,...this.#files.summary};
  }
  #entry(alias){
    identifier(alias,'Supplier-account workspace alias');
    const entry=this.#config.supplierAccountWorkspaces?.workspaces?.[alias];
    if(!entry)throw failure('SUPPLIER_ACCOUNT_NOT_CONFIGURED','Choose a host-declared alias from merchant_supplier_account_status.');
    return entry;
  }
  async #status(alias){
    if(alias===undefined)return{...this.summary,workspaces:Object.entries(this.#config.supplierAccountWorkspaces?.workspaces??{})
      .map(([workspace,entry])=>({workspace,label:entry.label,state:this.#closingAliases.has(workspace)?'CLOSING':this.#handles.has(workspace)?'OPEN':'CLOSED'}))};
    const entry=this.#entry(alias),selected=this.#handles.get(alias);
    if(!selected)return{workspace:alias,label:entry.label,state:'CLOSED'};
    const {workspaceId}=await selected;
    return{workspace:alias,label:entry.label,workspaceId,state:this.#closingAliases.has(alias)?'CLOSING':'OPEN',reads:this.#files.status(alias)};
  }
  async #open(alias){
    const entry=this.#entry(alias);
    if(!this.#handles.has(alias)){
      const pending=(async()=>{
        const {openSupplierAccountWorkspace}=await import('../../stellar/scf-starforge-20261009/sf30-seller-sdk/supplier-quota/workspace/model.mjs');
        const model=await openSupplierAccountWorkspace({directory:entry.directory,upstreamsFile:entry.upstreamsFile});
        try{return{model,...await model.identity()};}catch(error){await model.close();throw error;}
      })();
      this.#handles.set(alias,pending);
      try{await pending;}catch(error){if(this.#handles.get(alias)===pending)this.#handles.delete(alias);throw error;}
    }
    return this.#status(alias);
  }
  async #releaseAlias(alias){
    await this.#files.closeScope(alias);
    for(const key of this.#readExports.keys())if(key.startsWith(alias+':'))this.#readExports.delete(key);
    const handle=this.#handles.get(alias);
    if(handle){await(await handle).model.close();if(this.#handles.get(alias)===handle)this.#handles.delete(alias);}
  }
  #closeAlias(alias){
    if(this.#closingAliases.has(alias))return this.#closingAliases.get(alias);
    const prior=this.#tails.get(alias)??Promise.resolve();
    const task=prior.catch(()=>{}).then(async()=>{await this.#releaseAlias(alias);return{workspace:alias,state:'CLOSED'};})
      .finally(()=>this.#closingAliases.delete(alias));
    this.#closingAliases.set(alias,task);
    return task;
  }
  async #readFile(entry,args,workspaceId){
    const ownedKey=args.workspace+':'+args.readId,owned=args.readId?this.#readExports.get(ownedKey):null;
    const identity={exportId:args.exportId,file:args.file,manifestSha256:args.expectedManifestSha256};
    let load;
    if(owned){
      if(owned.key!==JSON.stringify(identity)||owned.sha256!==args.expectedSha256||owned.workspaceId!==workspaceId)
        throw failure('SUPPLIER_ACCOUNT_READ_CONFLICT','Continue this readId only with its original workspace, export, file and hashes.');
      load=async()=>{throw failure('SUPPLIER_ACCOUNT_READ_NOT_FOUND','Resume the same immutable export with a new read handle.');};
    }else{
      if(args.readId)throw failure('SUPPLIER_ACCOUNT_READ_NOT_FOUND','Resume the same export and hashes without the expired readId.');
      const selected=await readSupplierAccountExport(entry,args.exportId,workspaceId);
      if(args.expectedManifestSha256!==selected.manifestSha256)throw failure('SUPPLIER_ACCOUNT_MANIFEST_CHANGED','Repeat the original retained manifest SHA-256.');
      const member=args.file===SUPPLIER_ACCOUNT_EXPORT_MANIFEST?selected.manifestFile:selected.manifest.files.find(file=>file.name===args.file);
      if(!member||member.sha256!==args.expectedSha256)throw failure('SUPPLIER_ACCOUNT_FILE_CHANGED','Read an original manifest member with its exact SHA-256.');
      load=async()=>({bytes:args.file===SUPPLIER_ACCOUNT_EXPORT_MANIFEST?selected.manifestBytes:selected.payload,
        name:member.name,type:'application/json'});
    }
    const key=JSON.stringify(identity);
    const result=await this.#files.read({scope:args.workspace,key,kind:'supplier-account-export',directory:entry.directory,load,
      ...pick(args,['readId','offset','limit','expectedSha256'])});
    if(result.readId){
      const selectedKey=args.workspace+':'+result.readId;
      if(result.nextOffset===null)this.#readExports.delete(selectedKey);
      else this.#readExports.set(selectedKey,{key,sha256:args.expectedSha256,exportId:args.exportId,workspaceId});
    }
    return{exportId:args.exportId,workspaceId,manifestSha256:args.expectedManifestSha256,...result};
  }
  async #execute(name,args){
    const suffix=name.slice(PREFIX.length),alias=args.workspace;
    if(suffix==='status')return fullReply(await this.#status(alias));
    if(suffix==='open')return this.#open(alias);
    const entry=this.#entry(alias);
    if(suffix==='inputs')return fullReply({workspace:alias,inputs:Object.entries(entry.inputs).map(([id,input])=>supplierAccountInputSummary(id,input))});
    const handle=this.#handles.get(alias);
    if(!handle)throw failure('SUPPLIER_ACCOUNT_CLOSED','Explicitly open the original supplier-account workspace.');
    const {model,workspaceId}=await handle,current=await model.identity();
    if(current.workspaceId!==workspaceId||args.workspaceId!==undefined&&args.workspaceId!==workspaceId)
      throw failure('SUPPLIER_ACCOUNT_WORKSPACE_CHANGED','Close and reopen this alias, then select its actual workspaceId before continuing.');
    const selected=omit(args,['workspace','workspaceId']);
    const methods={prepare:'prepare',prepare_restore:'prepareRestore',prepare_rebase:'prepareRebase',apply:'apply',recover:'recover',cancel:'cancel'};
    if(Object.hasOwn(methods,suffix)){
      try{
        const change=await model[methods[suffix]](selected);
        return projectSupplierAccountOperation({workspace:alias,workspaceId,operation:suffix,change});
      }catch(error){
        const id=error.changeId??args.id;let change=null;
        if(id)try{change=await model.read(id);}catch{}
        return projectSupplierAccountOperation({workspace:alias,workspaceId,operation:suffix,change,
          error:{code:error.code,message:error.message,...(id?{changeId:id}:{})}});
      }
    }
    switch(suffix){
      case 'state':{
        const value=await model.view({limit:1}),view={...omit(value,['history']),workspaceId,
          history:{total:value.history.total,tool:PREFIX+'history'}};
        if(size(view)<=SUPPLIER_ACCOUNT_REPLY_BYTES)return view;
        return fullReply({...pick(view,['schema','workspaceId','createdAt','capturedAt','source','sourceError','activation','history']),
          accounts:value.configuration?.accounts?.length??0,bindings:value.configuration?.bindings?.length??0,
          fullConfigurationRetained:true,receivingTool:PREFIX+'export_report'});
      }
      case 'history':return pageReply(await model.history(selected));
      case 'change':return fullReply(await model.read(args.id));
      case 'proposal':{
        const value=await model.view({limit:1});
        if(!value.source||!value.configuration)throw failure(value.sourceError??'SUPPLIER_ACCOUNT_SOURCE_UNAVAILABLE','Read the selected original upstream source before preparing account changes.');
        return fullReply({workspaceId,sourceSha256:value.source.sha256,
          accounts:value.configuration.accounts.map(account=>omit(account,['bindings'])),
          assignments:value.configuration.bindings.map(binding=>({binding:binding.name,account:binding.supplierAccount}))});
      }
      case 'quota':return fullReply({workspaceId,...await model.inspectQuota()});
      case 'export_report':
      case 'export_backup':return supplierAccountExportSummary(await retainSupplierAccountExport({entry,model,workspaceId,exportId:args.exportId,
        kind:suffix==='export_backup'?'backup':'report'}));
      case 'export_manifest':return supplierAccountExportSummary(await readSupplierAccountExport(entry,args.exportId,workspaceId));
      case 'export_file':return this.#readFile(entry,args,workspaceId);
      case 'export_file_release':{
        const key=alias+':'+args.readId,owned=this.#readExports.get(key);
        if(owned&&owned.exportId!==args.exportId)throw failure('SUPPLIER_ACCOUNT_READ_CONFLICT','Release the selected original export read.');
        await this.#files.release(alias,args.readId);this.#readExports.delete(key);
        return{exportId:args.exportId,readId:args.readId,released:true};
      }
      case 'receive_workspace':{
        const input=entry.inputs[args.inputId];
        if(!input)throw failure('SUPPLIER_ACCOUNT_INPUT_NOT_FOUND','Select a receiving backup from the host input inventory.');
        const backup=await readSupplierAccountBackupInput(input,args.expectedSha256);
        // The alias queue has drained its earlier work. The native receiver owns its own original handle.
        await this.#releaseAlias(alias);
        const {restoreSupplierAccountWorkspace}=await import('../../stellar/scf-starforge-20261009/sf30-seller-sdk/supplier-quota/workspace/model.mjs');
        let received,operationError;
        try{received=await restoreSupplierAccountWorkspace({directory:entry.directory,upstreamsFile:entry.upstreamsFile,backup});}
        catch(error){operationError=error;}
        let reopened=null,reopenError;
        try{reopened=await this.#open(alias);}catch(error){reopenError=error;}
        const error=operationError??reopenError;
        return fullReply({schema:'stellar-forge.supplier-account-receiving-operation.v1',workspace:alias,
          workspaceId:reopened?.workspaceId??received?.workspaceId??null,state:error?'NATIVE_ERROR':'RECEIVED',
          inputId:args.inputId,inputSha256:input.sha256,backupSha256:backup.sha256,received:received??null,reopened,
          ...(error?{error:{code:String(error.code??'SUPPLIER_ACCOUNT_RECEIVING_FAILED').slice(0,160),
            reason:String(error.message??'Reopen the original receiving workspace.').slice(0,8192),
            ...(reopenError?{reopenCode:String(reopenError.code??'SUPPLIER_ACCOUNT_REOPEN_REQUIRED').slice(0,160)}:{})}}:{})});

      }
      default:throw failure('METHOD_NOT_FOUND','Choose an original supplier-account operating tool.');
    }
  }
  call(name,args={}){
    if(this.#closing)return Promise.reject(failure('SUPPLIER_ACCOUNT_CLOSING','The supplier-account provider is closing.'));
    try{
      const selected=validateSupplierAccountArguments(name,args),alias=selected.workspace;
      if(alias!==undefined)this.#entry(alias);
      if(name!==PREFIX+'close'&&alias!==undefined&&this.#closingAliases.has(alias))
        throw failure('SUPPLIER_ACCOUNT_CLOSING','This native handle is closing; reopen after accepted work finishes.');
      let task;
      if(name===PREFIX+'close')task=this.#closeAlias(alias);
      else if(alias===undefined)task=this.#execute(name,selected);
      else task=(this.#tails.get(alias)??Promise.resolve()).catch(()=>{}).then(()=>this.#execute(name,selected));
      if(alias!==undefined)this.#tails.set(alias,task);
      this.#pending.add(task);
      void task.finally(()=>{this.#pending.delete(task);if(this.#tails.get(alias)===task)this.#tails.delete(alias);}).catch(()=>{});
      return task;
    }catch(error){return Promise.reject(error);}
  }
  close(){
    if(this.#close)return this.#close;
    this.#closing=true;
    this.#close=(async()=>{
      await Promise.allSettled([...this.#pending]);await this.#files.close();this.#readExports.clear();
      const results=await Promise.allSettled([...this.#handles].map(async([alias,handle])=>{
        await(await handle).model.close();if(this.#handles.get(alias)===handle)this.#handles.delete(alias);
      }));
      const failed=results.find(result=>result.status==='rejected');if(failed)throw failed.reason;
    })().catch(error=>{this.#close=null;throw error;});
    return this.#close;
  }
}
