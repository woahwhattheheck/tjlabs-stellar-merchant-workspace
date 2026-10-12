// MIT. Complete WordPress merchant workflow over the original native owner.
import {join} from 'node:path';
import {RetainedFileReads} from '../../../../../stellar-forge/mcp-merchant-operator/retained-file-reads.mjs';
import {hashPrivate} from '../files.mjs';
import {WordPressConnection} from './connection.mjs';
import {WordPressExports} from './exports.mjs';
import {wordpressMerchantTools,wordpressActionNames,wordpressActionContract,validateWordPressArguments} from './catalog.mjs';
import {MANIFEST_NAME,MAX_REQUEST_BYTES,MAX_JSON_BYTES,MAX_ARTIFACT_BYTES,MAX_RETAINED_CHUNK_BYTES,
  ALIAS,UUID,need,checked,identity,plain} from './contracts.mjs';
export {wordpressMerchantTools} from './catalog.mjs';
const query=(path,values)=>path+'?'+new URLSearchParams(Object.entries(values).filter(([,value])=>value!==undefined)
  .map(([key,value])=>[key,String(value)]));
const pick=(value,names)=>Object.fromEntries(names.filter(name=>value[name]!==undefined).map(name=>[name,value[name]]));
const reads=Object.freeze({
  state:['/api/state',[]],operation:['/api/operation',['id']],
  source:['/api/source',['id']],job:['/api/job',['sourceId','id']],
  records:['/api/records',['sourceId','id','offset','limit','collection']],
  response:['/api/response',['sourceId','id','sequence']],mapping:['/api/mapping',['id']],
  edition:['/api/edition',['id']],projection:['/api/projection',['sourceId','id']],
  compare:['/api/compare',['before','after','offset','limit']]
});
export class MerchantWordPressWorkspaces{
  #config;#exports;#clients=new Map();#pending=new Set();
  #readers=new RetainedFileReads({errorPrefix:'WORDPRESS_MERCHANT'});
  #closing=false;#close=null;
  constructor(config){this.#config=config;this.#exports=new WordPressExports(config);}
  get summary(){
    const configured=this.#config.wordpressWorkspaces;
    return {configured:Boolean(configured),
      workspaces:Object.entries(configured?.workspaces??{}).map(([workspace,binding])=>({
        workspace,label:binding.label,workspaceId:binding.workspaceId,workspaceIdentity:binding.workspaceIdentity,
        allowStart:binding.allowStart,selectionSha256:binding.selectionSha256,
        applicationId:binding.applications?.applicationId??null})),
      buyerWorkspaces:Object.entries(configured?.buyerWorkspaces??{}).map(([alias,value])=>({alias,label:value.label})),
      receivers:Object.entries(configured?.receivers??{}).map(([alias,value])=>({alias,label:value.label})),
      clients:[...this.#clients].map(([workspace,client])=>({workspace,...client.summary})),...this.#readers.summary};
  }
  #binding(alias){
    checked(alias,ALIAS,'workspace alias');
    const binding=this.#config.wordpressWorkspaces?.workspaces?.[alias];
    need(binding,'WORDPRESS_MERCHANT_NOT_CONFIGURED','Choose a configured original WordPress workspace.');
    return binding;
  }
  #client(alias){
    const binding=this.#binding(alias);
    if(!this.#clients.has(alias))this.#clients.set(alias,new WordPressConnection(binding));
    return this.#clients.get(alias);
  }
  #selection(family,alias){
    checked(alias,ALIAS,family+' alias');
    const selected=this.#config.wordpressWorkspaces?.[family]?.[alias];
    need(selected,'WORDPRESS_MERCHANT_ALIAS_NOT_FOUND','Choose an original '+family+' host alias.');
    return selected;
  }
  #source(action,original,method,path,input,tags={}){
    return {action,...tags,instanceId:original.instanceId,
      requestSha256:identity({method,path,...(input===undefined?{}:{input})})};
  }
  async #json(alias,action,method,path,input,tags={},options){
    const original=await this.#client(alias).json(method,path,input);
    return this.#exports.capture(alias,original,this.#source(action,original,method,path,input,tags),options);
  }
  async #manifest(alias,id,expected){
    const saved=await this.#exports.manifest(alias,id,expected);
    return {state:'MANIFEST_RETAINED',workspace:alias,workspaceId:saved.manifest.workspaceId,
      workspaceIdentity:saved.manifest.workspaceIdentity,exportId:id,
      manifestFile:{name:MANIFEST_NAME,bytes:saved.bytes.length,sha256:saved.sha256},manifest:saved.manifest};
  }
  async #file(alias,args){
    const saved=await this.#exports.manifest(alias,args.exportId,args.expectedManifestSha256),
      selected=await this.#exports.selected(saved,args.file);
    need(selected.item.sha256===args.expectedSha256,'WORDPRESS_MERCHANT_FILE_CHANGED',
      'Select the exact original filename and SHA-256 from the manifest.');
    const result=await this.#readers.read({scope:alias+':'+args.exportId,key:args.file,kind:'wordpress',
      directory:saved.root,expectedSha256:selected.item.sha256,offset:args.offset??0,limit:args.limit??65536,
      readId:args.readId,load:()=>this.#exports.nativeHandle(saved,args.file)});
    return {workspace:alias,workspaceId:saved.manifest.workspaceId,workspaceIdentity:saved.manifest.workspaceIdentity,
      exportId:args.exportId,manifestSha256:saved.sha256,...result};
  }
  async #act(alias,args){
    const client=this.#client(alias),input={...args.input};
    if(args.action==='publisher.prepare'){
      const originalId=checked(input.exportId,UUID,'original workspace export UUID');
      const snapshot=await client.json('GET','/api/state');
      need(Array.isArray(snapshot.value.exports),'WORDPRESS_MERCHANT_STATE','Read the original workspace export list.');
      const selected=snapshot.value.exports.find(row=>row.id===originalId);
      need(selected&&(!input.productId||selected.productId===input.productId),
        'WORDPRESS_MERCHANT_ORIGINAL_EXPORT','Select a saved export from the same original product.');
      const directory=join(this.#binding(alias).directory,'exports',originalId);
      need(selected.directory===directory,'WORDPRESS_MERCHANT_ORIGINAL_EXPORT_CHANGED',
        'The saved original export directory differs from its workspace identity.');
      // Preserve the caller's optional productId exactly. Native original UUID
      // recovery remains valid even after another product becomes selected.
      delete input.exportId;input.exportDirectory=directory;
    }else if(args.action==='publisher.buyer.session'){
      input.workspaceDirectory=this.#selection('buyerWorkspaces',input.buyerWorkspace).directory;
      delete input.buyerWorkspace;
    }
    const body={action:args.action,operationId:args.operationId,expectedRevision:args.expectedRevision,input};
    return this.#json(alias,'act','POST','/api/act',body,{operationId:args.operationId,originalAction:args.action});
  }
  async #artifact(alias,args,publisher=false){
    const action=publisher?'publisher_artifact':'artifact',
      values=publisher?pick(args,['productId','kind','id']):pick(args,['kind','id','name','sourceId']),
      path=query(publisher?'/api/publisher-file':'/api/file',values),
      original=await this.#client(alias).request('GET',path);
    return this.#exports.stream(alias,original,this.#source(action,original,'GET',path,undefined,values),
      {kind:publisher?'publisher-artifact':args.kind==='packet'?'source-packet':'original-artifact',
        ...(args.kind==='packet'?{name:'wordpress-source.zip'}:{})});
  }
  async #receive(alias,args){
    const saved=await this.#exports.manifest(alias,args.exportId,args.expectedManifestSha256);
    need(saved.manifest.kind==='source-packet','WORDPRESS_MERCHANT_SOURCE_PACKET_REQUIRED',
      'Receive a complete original WordPress source-packet export.');
    const selected=await this.#exports.selected(saved,'wordpress-source.zip'),
      actual=await hashPrivate(selected.path,selected.item.bytes);
    need(actual.bytes===selected.item.bytes&&actual.hash===selected.item.sha256,
      'WORDPRESS_MERCHANT_RETAINED_CHANGED','The original source packet changed before receiving.');
    const receiver=this.#selection('receivers',args.receiver),
      body={input:selected.path,directory:receiver.directory};
    return this.#json(alias,'receive','POST','/api/receive',body,
      {exportId:args.exportId,manifestSha256:saved.sha256,packetSha256:selected.item.sha256,receiver:args.receiver},
      {kind:'source-receiving',name:'source-receiving.json'});
  }
  async #do(name,args){
    const action=validateWordPressArguments(name,args);
    if(action==='workspaces')return this.summary;
    if(action==='schema')return {schema:'stellar-forge.wordpress-merchant-api.v1',
      tools:wordpressMerchantTools,actions:wordpressActionNames,actionFields:wordpressActionContract,
      originalWorkspace:'stellar-forge.wordpress-workspace.v1',
      originalAction:'stellar-forge.wordpress-operation-result.v1',
      maximumRequestBytes:MAX_REQUEST_BYTES,maximumJSONBytes:MAX_JSON_BYTES,
      maximumArtifactBytes:MAX_ARTIFACT_BYTES,maximumChunkBytes:MAX_RETAINED_CHUNK_BYTES,
      manifestFile:MANIFEST_NAME,
      lifecycle:'Explicitly open the configured original controller. A borrowed Applications operation keeps its owner; release closes only this provider’s original server.',
      recovery:'Read the saved original operation UUID after an uncertain action. Repeat that UUID and exact action input; retain capture, edition, publisher and buyer session IDs.',
      exports:'Manifest and file tools use merchant SHA-256 export IDs. publisher.prepare uses an original state.exports[].id UUID.',
      publication:'The original publisher, seller quote and Buyer approval/configuration enforce their existing payment and source identities.',
      capture:'A capture that reached its declared record or byte ceiling requires a new source capture with a reviewed larger declaration.'};
    const alias=args.workspace;this.#binding(alias);
    if(action==='open')return {workspace:alias,...await this.#client(alias).open()};
    if(action==='release')return {workspace:alias,...await this.#client(alias).release()};
    if(action==='manifest')return this.#manifest(alias,args.exportId);
    if(action==='file')return this.#file(alias,args);
    if(action==='file_release'){
      await this.#readers.release(alias+':'+args.exportId,args.readId);
      return {state:'RELEASED',workspace:alias,exportId:args.exportId,readId:args.readId};
    }
    if(action==='json')return this.#exports.json(alias,args);
    if(reads[action]){
      const [path,fields]=reads[action],values=pick(action==='operation'?{...args,id:args.operationId}:args,fields);
      return this.#json(alias,action,'GET',fields.length?query(path,values):path,undefined,
        action==='operation'?{operationId:args.operationId}:values);
    }
    if(action==='preview')return this.#json(alias,action,'POST','/api/preview',
      pick(args,['sourceId','captureId','projection','offset','limit']),pick(args,['sourceId','captureId']));
    if(action==='dataset_preview')return this.#json(alias,action,'POST','/api/dataset-preview',
      pick(args,['editionId','query']),pick(args,['editionId']));
    if(action==='act')return this.#act(alias,args);
    if(action==='cancel')return this.#json(alias,action,'POST','/api/cancel',
      {operationId:args.operationId},{operationId:args.operationId});
    if(action==='artifact')return this.#artifact(alias,args);
    if(action==='publisher_artifact')return this.#artifact(alias,args,true);
    if(action==='receive')return this.#receive(alias,args);
    throw new Error('Unreachable WordPress merchant action');
  }
  call(name,args={}){
    need(!this.#closing,'WORDPRESS_MERCHANT_CLOSING','The original merchant provider is draining.');
    const promise=this.#do(name,args);this.#pending.add(promise);
    promise.finally(()=>this.#pending.delete(promise)).catch(()=>{});return promise;
  }
  close(){
    if(this.#close)return this.#close;this.#closing=true;
    this.#close=(async()=>{
      await Promise.allSettled([...this.#pending]);
      const results=await Promise.allSettled([this.#readers.close(),...[...this.#clients.values()].map(client=>client.close())]),
        failures=results.filter(result=>result.status==='rejected').map(result=>result.reason);
      if(failures.length)throw failures.length===1?failures[0]:Object.assign(
        new AggregateError(failures,'Original WordPress cleanup is incomplete.'),{code:'WORDPRESS_MERCHANT_CLOSE_INCOMPLETE'});
    })().catch(error=>{this.#close=null;throw error;});
    return this.#close;
  }
}
