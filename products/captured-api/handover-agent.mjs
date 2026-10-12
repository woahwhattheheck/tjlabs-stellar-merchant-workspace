// MIT. Original captured handover jobs and transfer through declared merchant aliases.
import { sf61Exact, sf61Hash } from '../../stellar-forge/mcp-merchant-operator/sf61-connection.mjs';
import { openCapturedHandoverClient } from './handover-client.mjs';
import { capturedHandoverTools, HANDOVER_ALIAS, HANDOVER_SHA, HANDOVER_UUID, HANDOVER_NAME } from './handover-catalog.mjs';
import { capturedHandoverDraftPage, capturedHandoverJobPage } from './handover-views.mjs';

const definitions=new Map(capturedHandoverTools((name,description,properties,required)=>({name,properties,required}))
  .map(value=>[value.name,value]));
const fail=(code,message)=>{throw Object.assign(new Error(message),{code});};
const plain=value=>value!==null&&typeof value==='object'&&!Array.isArray(value);
const checked=(value,pattern,label)=>{
  if(typeof value!=='string'||!pattern.test(value))fail('INVALID_PARAMS','Select the original '+label+'.');
  return value;
};
const identity=value=>checked(value,HANDOVER_UUID,'operation UUID');
const digest=value=>checked(value,HANDOVER_SHA,'SHA-256 identity');
const query=value=>new URLSearchParams(Object.entries(value).filter(([,item])=>item!==undefined)).toString();
function label(value) {
  if(typeof value!=='string'||!value.trim()||value.length>160||/[\x00-\x1f\x7f]/.test(value))
    fail('INVALID_PARAMS','Use a complete printable handover label of 1–160 characters.');
  return value;
}
function outgoing(value) {
  if(!Array.isArray(value.packages)||!Array.isArray(value.sources)||value.packages.length>1000||value.sources.length>1000)
    fail('INVALID_PARAMS','Supply the complete original package and source selection, with at most 1000 rows of each.');
  for(const row of value.packages) {
    sf61Exact(row,['name','manifestSha256'],['name','manifestSha256']);
    checked(row.name,HANDOVER_NAME,'merchant name');digest(row.manifestSha256);
  }
  for(const row of value.sources) {
    sf61Exact(row,['kind','id','revision'],['kind','id']);
    if(!['capture','refresh'].includes(row.kind))fail('INVALID_PARAMS','Select an original capture or refresh source.');
    digest(row.id);if(row.revision!==undefined)digest(row.revision);
  }
  return {label:label(value.label),packages:value.packages,sources:value.sources};
}
function names(value) {
  if(!plain(value)||Object.keys(value).length>1000)fail('INVALID_PARAMS','Supply the complete original receiving name map.');
  for(const [before,after] of Object.entries(value)) {
    checked(before,HANDOVER_NAME,'original merchant name');checked(after,HANDOVER_NAME,'receiving merchant name');
  }
  return value;
}
function integer(value,minimum,maximum,label) {
  if(!Number.isSafeInteger(value)||value<minimum||value>maximum)fail('INVALID_PARAMS','Use an exact '+label+'.');
  return value;
}

/** Each call pins its original private console URL once; no service is created here. */
export class MerchantCapturedHandovers {
  #config;#environment;#pending=new Set();#clients=new Set();#stopping=false;#closing;
  constructor(config,{environment=process.env}={}) {this.#config=config;this.#environment=environment;}
  get summary() {
    return {configured:Boolean(this.#config.harWorkspaces),ownership:'EXISTING_CAPTURED_PRODUCT',
      workspaces:Object.entries(this.#config.harWorkspaces?.workspaces??{}).map(([workspace,row])=>({
        workspace,label:row.label,projectsDirectory:row.projectsDirectory,
      })),activeCalls:this.#pending.size,closing:this.#stopping};
  }
  #definition(workspace) {
    checked(workspace,HANDOVER_ALIAS,'declared workspace alias');
    const rows=this.#config.harWorkspaces?.workspaces;
    if(!rows||!Object.hasOwn(rows,workspace))
      fail('CAPTURED_HANDOVER_NOT_CONFIGURED','Choose an existing original HAR workspace declared in this merchant configuration.');
    return rows[workspace];
  }
  async #with(workspace,expectedProductId,work) {
    if(expectedProductId!==undefined)digest(expectedProductId);
    const client=await openCapturedHandoverClient(this.#definition(workspace),{
      environment:this.#environment,expectedProductId,
    });
    this.#clients.add(client);
    let issue;
    try{return await work(client);}
    catch(error){issue=error;throw error;}
    finally {
      try{await client.close();this.#clients.delete(client);}
      catch(error) {
        // A failed closer remains owned and is retried by the original Stop.
        if(issue)issue.closeError=error;else throw error;
      }
    }
  }
  async #execute(name,args) {
    if(name==='merchant_handover_workspaces')return this.summary;
    const {workspace,expectedProductId,...input}=args;
    return this.#with(workspace,expectedProductId,async client=>{
      const result=native=>({workspace,productId:client.info.productId,native});
      switch(name) {
        case 'merchant_handover_info':return result(client.info);
        case 'merchant_handover_inventory':
          return result(await client.json('/inventory-page?'+query(input)));
        case 'merchant_handover_drafts':
          if(input.kind!==undefined&&!['OUTGOING','RECEIVING'].includes(input.kind))
            fail('INVALID_PARAMS','Choose outgoing or receiving drafts.');
          return result(await client.json('/drafts?'+query(input)));
        case 'merchant_handover_draft':
          identity(input.id);if(input.revision!==undefined)digest(input.revision);
          return result(await client.json('/draft-page?'+query(input)));
        case 'merchant_handover_draft_create': {
          identity(input.id);label(input.label);
          if(!['OUTGOING','RECEIVING'].includes(input.kind))fail('INVALID_PARAMS','Choose an outgoing or receiving draft.');
          return result(capturedHandoverDraftPage(await client.json('/draft/create',input)));
        }
        case 'merchant_handover_selection_save': {
          identity(input.id);identity(input.requestId);digest(input.expectedRevision);
          const form=outgoing(input),draft=await client.json('/draft?'+query({id:input.id}));
          if(draft.kind!=='OUTGOING')fail('INVALID_PARAMS','Select the original outgoing collection draft.');
          const saved=await client.json('/draft/save',{
            id:input.id,requestId:input.requestId,expectedRevision:input.expectedRevision,form,
          });
          return result(capturedHandoverDraftPage(saved));
        }
        case 'merchant_handover_receiving_save': {
          identity(input.id);identity(input.requestId);digest(input.expectedRevision);
          identity(input.importJob);digest(input.expectedManifestSha256);label(input.label);names(input.names);
          const imported=await client.json('/job?'+query({id:input.importJob}));
          if(imported.command!=='IMPORT'||imported.state!=='COMPLETE')
            fail('CAPTURED_HANDOVER_IMPORT_PENDING','Finish this original receiving workspace’s IMPORT job first.');
          if(imported.result?.manifestSha256!==input.expectedManifestSha256||typeof imported.result.directory!=='string')
            fail('CAPTURED_HANDOVER_SOURCE_CHANGED','Select the exact original imported handover manifest.');
          const draft=await client.json('/draft?'+query({id:input.id}));
          if(draft.kind!=='RECEIVING')fail('INVALID_PARAMS','Select the original receiving draft.');
          const saved=await client.json('/draft/save',{
            id:input.id,requestId:input.requestId,expectedRevision:input.expectedRevision,
            form:{label:input.label,bundle:imported.result.directory,
              manifestSha256:input.expectedManifestSha256,names:input.names},
          });
          return result(capturedHandoverDraftPage(saved));
        }
        case 'merchant_handover_jobs':return result(await client.json('/jobs?'+query(input)));
        case 'merchant_handover_job':
          identity(input.id);return result(await client.json('/job-page?'+query(input)));
        case 'merchant_handover_job_start':
          return result(capturedHandoverJobPage(await client.json('/jobs/start',input.request)));
        case 'merchant_handover_job_resume':
          identity(input.id);digest(input.requestSha256);
          return result(capturedHandoverJobPage(await client.json('/jobs/resume',input)));
        case 'merchant_handover_document':
          identity(input.id);return result(await client.json('/document?'+query(input)));
        case 'merchant_handover_uploads':return result(await client.json('/uploads?'+query(input)));
        case 'merchant_handover_upload_status':
          identity(input.id);return result(await client.json('/uploads/status?'+query(input)));
        case 'merchant_handover_archive':return result(await client.archive(input));
        case 'merchant_handover_archive_read': {
          const {offset=0,limit=32768,...selected}=input,archive=await client.archive(selected);
          integer(offset,0,archive.bytes,'original file offset');integer(limit,1,65536,'chunk limit of 1–65536 bytes');
          const bytes=offset===archive.bytes?Buffer.alloc(0):await client.readArchive({...selected,offset,
            limit:Math.min(limit,archive.bytes-offset)});
          return result({...archive,offset,bytesRead:bytes.length,encoding:'base64',data:bytes.toString('base64'),
            chunkSha256:sf61Hash(bytes),nextOffset:offset+bytes.length<archive.bytes?offset+bytes.length:null,
            complete:offset+bytes.length===archive.bytes});
        }
        case 'merchant_handover_transfer': {
          const {fromWorkspace,fromProductId,uploadId,...selected}=input;
          digest(fromProductId);identity(uploadId);
          return this.#with(fromWorkspace,fromProductId,async source=>result(await source.transferTo(client,{
            ...selected,uploadId,
          })));
        }
        case 'merchant_handover_received': {
          const native=await client.json('/received?'+query(input));
          return result({...native,view:'summary',rows:native.rows.map(row=>({
            ...row,names:row.names.length,
          }))});
        }
        default:fail('TOOL_NOT_FOUND','Choose an original captured handover operation.');
      }
    });
  }
  async call(name,args={}) {
    if(this.#stopping)fail('CAPTURED_HANDOVER_CLOSING','Captured handover access is draining its original accepted work.');
    const definition=definitions.get(name);
    if(!definition)fail('TOOL_NOT_FOUND','Choose an original captured handover tool.');
    sf61Exact(args,Object.keys(definition.properties),definition.required);
    const serialized=JSON.stringify(args);
    if(Buffer.byteLength(serialized)>1024*1024)
      fail('INVALID_PARAMS','Keep the complete handover request within its original 1 MiB limit.');
    // Capture the actual wire request before its first asynchronous operation.
    // Required fields must survive serialization, including the product binding.
    const input=JSON.parse(serialized);
    sf61Exact(input,Object.keys(definition.properties),definition.required);
    const promise=Promise.resolve().then(()=>this.#execute(name,input));this.#pending.add(promise);
    try{return await promise;}finally{this.#pending.delete(promise);}
  }
  close() {
    if(this.#closing)return this.#closing;
    this.#stopping=true;
    this.#closing=(async()=>{
      while(this.#pending.size)await Promise.allSettled([...this.#pending]);
      const results=await Promise.allSettled([...this.#clients].map(async client=>{
        await client.close();this.#clients.delete(client);
      }));
      const failed=results.filter(value=>value.status==='rejected');
      if(failed.length)throw Object.assign(new Error('Finish closing the original retained handover clients.'),{
        code:'CAPTURED_HANDOVER_CLOSE_INCOMPLETE',causes:failed.map(value=>value.reason),
      });
    })().catch(error=>{this.#closing=null;throw error;});
    return this.#closing;
  }
}
