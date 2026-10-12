// MIT. Source-owned MCP adapter for the original complete subscription operator.
import {resolve,join} from 'node:path';
import {mkdir} from 'node:fs/promises';
import {RetainedFileReads} from './retained-file-reads.mjs';
import {SubscriptionOperator,readSubscriptionConnection} from '../../stellar/scf-starforge-20261009/sf30-seller-sdk/odata/live/subscriptions/operator.mjs';
import {need,shape,privateDirectory,immutable,bytes} from '../../stellar/scf-starforge-20261009/sf30-seller-sdk/odata/live/subscriptions/files.mjs';
import {SUBSCRIPTION_TOOL_PREFIX} from './catalog/odata-subscriptions.mjs';
export {readSubscriptionConnection};
export class MerchantODataSubscriptions {
 #operator;#reads=new RetainedFileReads({errorPrefix:'ODATA_SUBSCRIPTION',maxImmutableFileBytes:256*1024*1024});#pending=new Set();#closing=false;#close;
 constructor(config){this.#operator=config.odataSubscriptions?new SubscriptionOperator(config.odataSubscriptions):null;}
 get summary(){return {configured:Boolean(this.#operator),...this.#operator?.summary,...this.#reads.summary};}
 call(name,args={}){
  need(!this.#closing,'CLOSING','The original subscription provider is closing.');need(name.startsWith(SUBSCRIPTION_TOOL_PREFIX),'TOOL','Choose an original subscription tool.',400);
  const pending=this.#call(name.slice(SUBSCRIPTION_TOOL_PREFIX.length),args);this.#pending.add(pending);pending.then(()=>this.#pending.delete(pending),()=>this.#pending.delete(pending));return pending;
 }
 async #call(name,args){
  if(name==='status'&&!this.#operator){shape(args,[],'status');return this.summary;}
  need(this.#operator,'NOT_CONFIGURED','Attach the original private subscription connection to this merchant provider.',409);
  const scope='odata-subscriptions:'+this.#operator.configuration.source.sha256;
  if(name==='file_release'){shape(args,['readId'],'file release');need(typeof args.readId==='string','READ_ID','Select the original read ID.',400);await this.#reads.release(scope,args.readId);return {readId:args.readId,state:'RELEASED'};}
  if(name==='file'){
   shape(args,['artifact','path','expectedSha256','readId','offset','limit'],'retained file read');
   return this.#reads.read({scope,key:JSON.stringify([args.artifact,args.path]),kind:'odata-subscription',
    directory:this.#operator.configuration.exportsDirectory,expectedSha256:args.expectedSha256,readId:args.readId,offset:args.offset??0,limit:args.limit??65536,
    load:()=>this.#operator.artifactFile(args)});
  }
  return this.#operator.call(name.replaceAll('_','-'),args);
 }
 close(){return this.#close??=(async()=>{this.#closing=true;await Promise.allSettled([...this.#pending]);await this.#reads.close();await this.#operator?.close();})().catch(error=>{this.#close=null;throw error;});}
}
export async function initializeODataSubscriptionMerchant({directory,connection,name='OData subscription operator'}){
 need(typeof directory==='string'&&typeof connection==='string','CONFIGURATION','Select the private host directory and original connection.',400);
 const selected=await readSubscriptionConnection(resolve(connection)),root=await privateDirectory(resolve(directory),{create:true});
 const releases=await import('../../stellar/scf-starforge-20261009/sf82-seller-pilot/releases.mjs');
 try{await releases.readReleaseState(join(root,'releases'));}catch(error){if(error.code!=='ENOENT')throw error;await releases.initReleaseStore(join(root,'releases'));}
 await privateDirectory(join(root,'customer-exports'),{create:true});
 const configuration=join(root,'merchant-mcp.json');
 await immutable(root,'merchant-mcp.json',bytes({schema:'stellar-forge.merchant-mcp.v1',name,releaseStore:'./releases',exportsDirectory:'./customer-exports',sources:{},odataSubscriptionConnection:resolve(connection)}));
 await (await import('./config.mjs')).readMerchantConfig(configuration);
 return {schema:'stellar-forge.merchant-mcp.v1',configuration,state:'INITIALIZED',connectionSha256:selected.source.sha256,
  publishers:Object.keys(selected.publishers),customers:Object.keys(selected.customers)};
}
