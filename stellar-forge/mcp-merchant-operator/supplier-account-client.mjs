// MIT. Complete account operating client on the maintained Merchant transport and receiving engine.
import { createRetainedDownload, openMerchantFileClient } from './retained-download.mjs';
import { supplierAccountPlain, validateSupplierAccountArguments, validateSupplierAccountExportId,
  supplierAccountSpecifications, SUPPLIER_ACCOUNT_CLIENT_METHODS, SUPPLIER_ACCOUNT_PAGED_METHODS,
  SUPPLIER_ACCOUNT_EXPORT_MANIFEST, MAX_SUPPLIER_ACCOUNT_FILE_BYTES, MAX_SUPPLIER_ACCOUNT_MANIFEST_BYTES,
  SUPPLIER_ACCOUNT_DOWNLOAD_STATE_SCHEMA, SUPPLIER_ACCOUNT_DOWNLOAD_RESULT_SCHEMA,
  parseSupplierAccountExportManifest } from './supplier-account-contracts.mjs';
export { SUPPLIER_ACCOUNT_CLIENT_METHODS } from './supplier-account-contracts.mjs';
const PREFIX='merchant_supplier_account_';
const fail=(code,message)=>{throw Object.assign(new Error(message),{code});};
const downloads=createRetainedDownload({
  manifestName:SUPPLIER_ACCOUNT_EXPORT_MANIFEST,parseManifest:parseSupplierAccountExportManifest,
  validateExportId:validateSupplierAccountExportId,maximumBytes:MAX_SUPPLIER_ACCOUNT_FILE_BYTES,
  maximumManifestBytes:MAX_SUPPLIER_ACCOUNT_MANIFEST_BYTES,stateSchema:SUPPLIER_ACCOUNT_DOWNLOAD_STATE_SCHEMA,
  resultSchema:SUPPLIER_ACCOUNT_DOWNLOAD_RESULT_SCHEMA,toolPrefix:PREFIX+'export',
  errorPrefix:'SUPPLIER_ACCOUNT',clientName:'starforge-supplier-account-client',
  describe:manifest=>({workspaceId:manifest.workspaceId,kind:manifest.kind})
});
/** Construction selects one alias; open and every original source write remain explicit calls. */
export class SupplierAccountClient {
  #client;#scoped;#options;#workspaceId;
  constructor(client,workspace,callOptions={}){
    if(typeof workspace!=='string'||!/^[a-z0-9][a-z0-9_-]{0,63}$/.test(workspace))
      fail('SUPPLIER_ACCOUNT_CLIENT_CONFIGURATION','Select one host-declared account workspace alias.');
    if(!supplierAccountPlain(client)||typeof client.call!=='function'||typeof client.endpoint!=='string'||
        !client.endpoint.trim()||client.endpoint.length>3800||/[\x00\r\n]/.test(client.endpoint))
      fail('SUPPLIER_ACCOUNT_CLIENT_CONFIGURATION','Use the maintained client with its exact stable endpoint identity.');
    if(!supplierAccountPlain(callOptions)||Object.keys(callOptions).some(key=>!['requestSignal','timeoutMs'].includes(key)))
      fail('SUPPLIER_ACCOUNT_CLIENT_CONFIGURATION','Select original request signal and timeout options.');
    this.workspace=workspace;this.endpoint=client.endpoint;this.#client=client;this.#options=Object.freeze({...callOptions});
    this.#scoped=Object.freeze({endpoint:JSON.stringify({endpoint:client.endpoint,workspace}),
      call:(name,args,options)=>this.call(name,args,options)});
    Object.defineProperties(this,{workspace:{writable:false},endpoint:{writable:false}});
  }
  get workspaceId(){return this.#workspaceId??null;}
  async call(name,args={},options){
    if(!supplierAccountPlain(args)||Object.hasOwn(args,'workspace'))
      fail('SUPPLIER_ACCOUNT_CLIENT_ARGUMENTS','The client owns its selected workspace alias; pass the remaining native fields.');
    const selected={workspace:this.workspace,...args},spec=supplierAccountSpecifications.get(name);
    if(spec?.required.includes('workspaceId')&&!Object.hasOwn(selected,'workspaceId')&&this.#workspaceId)
      selected.workspaceId=this.#workspaceId;
    const request=validateSupplierAccountArguments(name,selected);
    // Each requested effect is sent exactly once. Unknown transport outcomes retain caller-selected IDs.
    const result=await this.#client.call(name,request,{...this.#options,...options});
    if(!supplierAccountPlain(result))fail('SUPPLIER_ACCOUNT_CLIENT_REPLY_INVALID','The original account tool returned no structured result.');
    const identity=result.reopened?.workspaceId??result.workspaceId;
    if(typeof identity==='string'&&/^[a-f0-9]{8}(?:-[a-f0-9]{4}){3}-[a-f0-9]{12}$/.test(identity))this.#workspaceId=identity;
    if(name===PREFIX+'close'&&result.state==='CLOSED')this.#workspaceId=undefined;
    return result;
  }
  /** Pin every page to the same native event token and original workspace identity. */
  async *pages(method,args={},options){
    if(!SUPPLIER_ACCOUNT_PAGED_METHODS.includes(method))fail('SUPPLIER_ACCOUNT_CLIENT_PAGINATION','Choose the original history method.');
    const selected={...args};let token=selected.expectedToken,workspaceId,total;
    while(true){
      const page=await this[method](selected,options);
      if(!Array.isArray(page.items)||!Number.isSafeInteger(page.total)||page.total<0||
          !Number.isSafeInteger(page.offset)||page.offset!==(selected.offset??0)||
          typeof page.token!=='string'||!/^[a-f0-9]{64}$/.test(page.token)||!Object.hasOwn(page,'nextOffset'))
        fail('SUPPLIER_ACCOUNT_CLIENT_PAGINATION','The original page omitted its complete records or exact continuation identity.');
      if(token!==undefined&&token!==page.token||workspaceId!==undefined&&workspaceId!==page.workspaceId||
          total!==undefined&&total!==page.total)
        fail('SUPPLIER_ACCOUNT_CLIENT_PAGE_CHANGED','The original account history changed during this paged view; begin a fresh history walk.');
      token=page.token;workspaceId=page.workspaceId;total=page.total;selected.expectedToken=token;
      const next=page.nextOffset;
      if(next===null&&page.offset+page.items.length<total||next!==null&&
          (!Number.isSafeInteger(next)||next<=page.offset||next!==page.offset+page.items.length||next>=total))
        fail('SUPPLIER_ACCOUNT_CLIENT_PAGINATION','The original page did not retain every continuation after its last complete record.');
      yield page;
      if(next===null)return;
      selected.offset=next;
    }
  }
  inspectExport(exportId){return downloads.inspect({client:this.#scoped,exportId});}
  downloadExport({exportId,directory,chunkSize,onProgress,expectedManifestSha256,signal}={}){
    return downloads.download({client:this.#scoped,exportId,directory,chunkSize,onProgress,expectedManifestSha256,signal});
  }
}
for(const [method,suffix]of Object.entries(SUPPLIER_ACCOUNT_CLIENT_METHODS)){
  Object.defineProperty(SupplierAccountClient.prototype,method,{
    value:function(args={},options){return this.call(PREFIX+suffix,args,options);},writable:false,configurable:false
  });
}
export async function createSupplierAccountClient({workspace,client,url,tokenEnv,environment,signal,callOptions}={}){
  if(client!==undefined&&url!==undefined)fail('SUPPLIER_ACCOUNT_CLIENT_CONFIGURATION','Select one native client or one Merchant endpoint.');
  const selected=client??await openMerchantFileClient({url,tokenEnv,environment,signal,errorPrefix:'SUPPLIER_ACCOUNT',
    clientName:'starforge-supplier-account-client',maximumResponseBytes:4*1024*1024});
  return new SupplierAccountClient(selected,workspace,callOptions);
}
