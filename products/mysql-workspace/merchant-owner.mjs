// MIT. The original merchant host owns complete MySQL product sessions.
import { constants } from 'node:fs';
import { open } from 'node:fs/promises';
import { RetainedFileReads } from '../../stellar-forge/mcp-merchant-operator/retained-file-reads.mjs';
import { mysqlProductTools, sourceActions, publisherName } from './merchant-tools.mjs';
import { openMysqlProductRuntime } from './runtime.mjs';
import { need, ALIAS, UUID } from './setup.mjs';

const definitions=new Map(mysqlProductTools((name,description,properties,required=[])=>[name,{properties,required}]));
function input(value,definition){
  need(value&&typeof value==='object'&&!Array.isArray(value)&&
    Object.keys(value).every(key=>Object.hasOwn(definition.properties,key))&&
    definition.required.every(key=>Object.hasOwn(value,key)),'MYSQL_PRODUCT_INPUT_INVALID');
}
function publicResult(value){
  if(!value||typeof value!=='object'||Array.isArray(value))return value;
  const{path,configPath,...result}=value;return result;
}

export class MerchantMysqlProducts{
  #config;#environment;#entries=new Map();#opening=new Map();#pending=new Set();#closing=false;#close;
  #reads=new RetainedFileReads({errorPrefix:'MYSQL_PRODUCT_FILE'});
  constructor(config,{environment=process.env}={}){this.#config=config;this.#environment=environment;}
  get summary(){return {configured:Boolean(this.#config.mysqlProducts),...this.#reads.summary,
    workspaces:Object.entries(this.#config.mysqlProducts?.workspaces??{}).map(([workspace,value])=>{
      const entry=this.#entries.get(workspace);return {workspace,label:value.label,productId:value.productId,
        state:entry?'OPEN':'CLOSED',instanceId:entry?.instanceId??null,browserUrl:entry?.browserUrl??null,
        fileReads:this.#reads.status(workspace)};})};}
  #definition(alias){
    need(typeof alias==='string'&&ALIAS.test(alias),'MYSQL_PRODUCT_ALIAS_INVALID');
    const value=this.#config.mysqlProducts?.workspaces[alias];
    need(value,'MYSQL_PRODUCT_NOT_CONFIGURED','Choose a host-declared MySQL product alias.');return value;
  }
  #entry(alias){this.#definition(alias);const entry=this.#entries.get(alias);
    need(entry,'MYSQL_PRODUCT_NOT_OPEN','Open this original MySQL product before operating it.');return entry;}
  async #open(alias){
    const selected=this.#definition(alias);
    if(this.#entries.has(alias)){const e=this.#entries.get(alias);return{workspace:alias,open:true,
      productId:e.profile.productId,instanceId:e.instanceId,browserUrl:e.browserUrl};}
    if(!this.#opening.has(alias)){
      const operation=openMysqlProductRuntime({directory:selected.directory,environment:this.#environment}).then(async entry=>{
        if(this.#closing){await entry.close();throw new Error('MYSQL_PRODUCT_CLOSING');}
        if(entry.profile.productId!==selected.productId){await entry.close();throw Object.assign(new Error('MYSQL_PRODUCT_SELECTION_CHANGED'),{code:'MYSQL_PRODUCT_SELECTION_CHANGED'});}
        this.#entries.set(alias,entry);return entry;});
      this.#opening.set(alias,operation);operation.finally(()=>this.#opening.delete(alias)).catch(()=>{});
    }
    const entry=await this.#opening.get(alias);
    return{workspace:alias,open:true,productId:entry.profile.productId,instanceId:entry.instanceId,browserUrl:entry.browserUrl};
  }
  async #execute(name,args){
    if(name==='merchant_mysql_products')return this.summary;
    const{workspace,...selected}=args;
    if(name==='merchant_mysql_product_open')return this.#open(workspace);
    const owner=this.#entry(workspace);
    if(name==='merchant_mysql_product_close'){
      need(selected.instanceId===owner.instanceId,'MYSQL_PRODUCT_INSTANCE_CHANGED');
      await this.#reads.closeScope(workspace);
      await owner.close();this.#entries.delete(workspace);
      return{workspace,instanceId:selected.instanceId,closed:true};
    }
    if(name==='merchant_mysql_product_file_release'){
      need(UUID.test(selected.readId??''),'MYSQL_PRODUCT_READ_ID_INVALID');
      await this.#reads.release(workspace,selected.readId);return{workspace,readId:selected.readId,state:'RELEASED'};
    }
    if(name==='merchant_mysql_product_file_read'){
      need(['archive','client'].includes(selected.kind),'MYSQL_PRODUCT_FILE_KIND_INVALID');
      if(selected.kind==='archive')need(UUID.test(selected.requestId??''),'MYSQL_PRODUCT_REQUEST_ID_INVALID');
      const key=selected.kind==='archive'?selected.requestId:selected.sha256;
      return{workspace,kind:selected.kind,...await this.#reads.read({scope:workspace,key,
        kind:'mysql-product-'+selected.kind,directory:owner.directory,readId:selected.readId,
        expectedSha256:selected.sha256,offset:selected.offset,limit:selected.limit,load:async()=>{
          const retained=await owner.call(selected.kind==='archive'?'archive_get':'client_get',
            selected.kind==='archive'?{requestId:selected.requestId}:{sha256:selected.sha256});
          need(retained.path&&retained.sha256===selected.sha256,'MYSQL_PRODUCT_FILE_SELECTION_CHANGED');
          const handle=await open(retained.path,constants.O_RDONLY|constants.O_NOFOLLOW);
          try{const stat=await handle.stat();need(stat.isFile()&&stat.nlink===1&&!(stat.mode&0o077)&&stat.size===retained.bytes,'MYSQL_PRODUCT_FILE_CHANGED');
            return{readonlyFileHandle:handle,bytes:retained.bytes,sha256:retained.sha256,
              name:retained.filename,type:'application/gzip'};}catch(error){await handle.close();throw error;}
        }})};
    }
    let result;
    if(name.startsWith('merchant_mysql_product_publish_')){
      const{releaseId,instanceId,...native}=selected;
      const tool='merchant_publisher_'+name.slice('merchant_mysql_product_publish_'.length);
      result=await owner.call('publisher',{releaseId,instanceId,tool,arguments:native});
    }else{
      const action=sourceActions[name];need(action,'MYSQL_PRODUCT_TOOL_NOT_FOUND');
      result=await owner.call(action,name==='merchant_mysql_product_review'?selected.choices:selected);
    }
    return{workspace,result:publicResult(result)};
  }
  async call(name,args={}){
    need(!this.#closing,'MYSQL_PRODUCT_CLOSING');
    const definition=definitions.get(name);need(definition,'MYSQL_PRODUCT_TOOL_NOT_FOUND');input(args,definition);
    const operation=Promise.resolve().then(()=>this.#execute(name,args));this.#pending.add(operation);
    try{return await operation;}finally{this.#pending.delete(operation);}
  }
  close(){
    if(this.#close)return this.#close;this.#closing=true;
    this.#close=(async()=>{
      await Promise.allSettled([...this.#opening.values(),...this.#pending]);
      await this.#reads.close();
      const results=await Promise.allSettled([...this.#entries.values()].map(entry=>entry.close()));
      this.#entries.clear();const failed=results.find(item=>item.status==='rejected');if(failed)throw failed.reason;
    })();return this.#close;
  }
}
