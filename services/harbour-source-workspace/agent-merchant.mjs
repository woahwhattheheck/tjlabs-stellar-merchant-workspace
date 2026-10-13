// MIT. Original merchant-host transport around the installed Harbour client.
import {RetainedFileReads} from '../../stellar-forge/mcp-merchant-operator/retained-file-reads.mjs';
import {HarbourSourceClient} from './agent-client.mjs';
import {harbourTools,actionNames,validate,PREFIX} from './agent-tools.mjs';
import {need,clone,canonical} from './agent-io.mjs';
export {harbourTools};
const definitions=new Map(harbourTools((name,description,properties,required)=>({name,properties,required})).map(x=>[x.name,x]));
const pick=(value,keys)=>Object.fromEntries(keys.filter(k=>value[k]!==undefined).map(k=>[k,value[k]]));
export class MerchantHarbourSource{
 #config;#exports;#clients=new Map();#reads;#pending=new Set();#closing=false;#close;
 constructor(config){this.#config=config.harbourSource;this.#exports=config.exportsDirectory;this.#reads=new RetainedFileReads({errorPrefix:'HARBOUR_SERIES_FILE',maxSnapshotBytes:512*1024*1024});}
 summary(){return{configured:Boolean(this.#config),workspaces:Object.keys(this.#config?.workspaces??{}),...this.#reads.summary};}
 #client(alias){const entry=this.#config?.workspaces?.[alias];need(entry,'Select a configured original Harbour workspace.');if(!this.#clients.has(alias))this.#clients.set(alias,new HarbourSourceClient(entry));return this.#clients.get(alias);}
 call(name,args={}){
  need(!this.#closing,'The Harbour provider is closing.');const def=definitions.get(name);need(def,'Select a documented original Harbour tool.');
  validate(args,{type:'object',properties:def.properties,required:def.required,additionalProperties:false});const input=clone(args);
  const task=Promise.resolve().then(()=>this.#run(name.slice(PREFIX.length),input)).then(result=>{need(Buffer.byteLength(JSON.stringify(result??null))<=1024*1024,'The complete response is too large. Page the selection or download its entire original with file_read.','HARBOUR_AGENT_USE_FILE_READ');return result??null;});
  this.#pending.add(task);task.then(()=>this.#pending.delete(task),()=>this.#pending.delete(task));return task;
 }
 async #run(name,input){
  if(name==='workspaces')return{workspaces:Object.entries(this.#config?.workspaces??{}).map(([workspace,row])=>({workspace,label:row.label,genesis:row.genesis,inputs:Object.entries(row.inputs).map(([input,x])=>({input,label:x.label,kind:x.kind,filename:x.filename,bytes:x.bytes,sha256:x.sha256}))}))};
  const {workspace,...args}=input,client=this.#client(workspace);
  if(name==='file_release'){await this.#reads.release(workspace,args.readId);return{released:true};}
  if(name==='file_read'){
   const selection=pick(args,['kind','id','section','tableId','selectionId','operatingProfileId','financialProfileId','preparationId','returnId','operationId','expectedRevision','expectedHead']);
   if(args.kind==='operation')need(args.operationId,'Select the original operation ID.');
   else need(Number.isSafeInteger(args.expectedRevision)&&typeof args.expectedHead==='string','Pin complete file selection to its observed revision and head.');
   if(['source','original','target','returned','target-preview'].includes(args.kind))need(args.id,'Select the original file or edition ID.');
   return this.#reads.read({scope:workspace,key:canonical(selection),kind:args.kind,directory:this.#exports,...pick(args,['readId','expectedSha256','offset','limit']),load:()=>client.originalFile(selection)});
  }
  if(name==='status')return client.status();
  if(['section','rows','analyse','target'].includes(name))return client[name](args);
  if(name==='operation')return client.operation(args.operationId);
  if(name==='replay_operation')return client.replay(args.operationId);
  if(name==='apply_input')return client.applyInput({operationId:args.operationId,inputAlias:args.input,expectedSha256:args.expectedSha256,expectedHead:args.expectedHead??null});
  if(Object.hasOwn(actionNames,name)){const {input:inputAlias,expectedSha256,expectedHead,...data}=args;return client.mutate(actionNames[name],data,{inputAlias:inputAlias??null,expectedSha256:expectedSha256??null,expectedHead:expectedHead??null});}
  throw Error('The original Harbour method is unavailable.');
 }
 close(){if(!this.#close){this.#closing=true;this.#close=(async()=>{await Promise.allSettled([...this.#pending]);const results=await Promise.allSettled([this.#reads.close(),...[...this.#clients.values()].map(x=>x.close())]);const failed=results.find(x=>x.status==='rejected');if(failed)throw failed.reason;})().catch(error=>{this.#close=null;throw error;});}return this.#close;}
}
