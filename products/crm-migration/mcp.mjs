// MIT. No independent workspace writer: all actions use its selected managed listener.
import {join,dirname,resolve,basename} from 'node:path';
import {readJSON,readBytes,privateDirectory,need,decode} from './host/io.mjs';
import {CrmClient} from './host/client.mjs';
import {crmTools} from './tools.mjs';
import runtime from './runtime/crm-runtime.cjs';
const alias=v=>{need(typeof v==='string'&&/^[a-z0-9][a-z0-9_-]{0,63}$/.test(v),'CRM_ALIAS','Choose a configured host alias.');return v;};
const defs=new Map(crmTools((name,description,properties,required)=>({name,properties,required})).map(d=>[d.name,d]));
export async function readCrmConfiguration(path){
 const r=await readJSON(path,1024*1024),v=r.value;need(v.schema==='stellar-forge.crm-host.v1'&&v.workspaces&&Object.keys(v.workspaces).length>0&&Object.keys(v.workspaces).length<=32,'CRM_CONFIG','Declare 1–32 CRM workspaces.');
 const workspaces=Object.create(null),seen=new Set();
 for(const [key,input]of Object.entries(v.workspaces)){alias(key);const directoryIdentity=await privateDirectory(resolve(dirname(path),input.directory)),directory=directoryIdentity.path;need(!seen.has(directory),'CRM_ALIAS_DUPLICATE','Declare one alias per original workspace.');seen.add(directory);
 const original=runtime.workspace.restore((await readJSON(join(directory,'workspace.json'))).value);
 need(!input.workspaceId||input.workspaceId===original.id,'CRM_WORKSPACE_CHANGED','Configured workspace identity differs from its complete original.',409);
 const inputs=Object.create(null);for(const [name,s]of Object.entries(input.inputs||{})){alias(name);need(/^[a-f0-9]{64}$/.test(s.sha256||''),'CRM_INPUT_HASH','Declare the exact original input hash.');const file=await readBytes(resolve(dirname(path),s.file));need(file.sha256===s.sha256,'CRM_INPUT_CHANGED','The declared complete input differs.',409);inputs[name]={file:file.path,filename:basename(file.path),sha256:file.sha256,bytes:file.bytes.length};}
 workspaces[key]={label:input.label||key,directory,directoryIdentity,workspaceId:original.id,inputs};}
 return {path,sha256:r.sha256,workspaces};
}
export class MerchantCrm{
 constructor(config){this.config=config;this.clients=new Map();this.tail=Promise.resolve();this.closing=false;}
 get summary(){return {configured:!!this.config.crmMigration,connected:[...this.clients.keys()],closing:this.closing};}
 async dispatch(name,args){
 const d=defs.get(name);need(d&&args&&Object.keys(args).every(k=>Object.hasOwn(d.properties,k))&&d.required.every(k=>Object.hasOwn(args,k)),'CRM_TOOL','Use the declared CRM tool fields.');
 const all=this.config.crmMigration?.workspaces||{};
 if(name==='merchant_crm_status'&&!args.workspace)return {...this.summary,workspaces:Object.entries(all).map(([workspace,s])=>({workspace,label:s.label,workspaceId:s.workspaceId,inputs:Object.entries(s.inputs).map(([sourceInput,i])=>({sourceInput,filename:i.filename,sha256:i.sha256,bytes:i.bytes}))}))};
 const scope=all[alias(args.workspace)];need(scope,'CRM_WORKSPACE','Choose a configured workspace.',404);
 let c=this.clients.get(args.workspace);
 if(name==='merchant_crm_connect'){const next=await CrmClient.connect(scope.directory,{workspaceId:scope.workspaceId,instanceId:args.instanceId,directoryIdentity:scope.directoryIdentity});await c?.close();this.clients.set(args.workspace,next);return {...next.identity,status:await next.status()};}
 if(name==='merchant_crm_disconnect'){await c?.close();this.clients.delete(args.workspace);return {workspace:args.workspace,state:'DISCONNECTED'};}
 if(name==='merchant_crm_file'){
 const currentDirectory=await privateDirectory(scope.directory);need(currentDirectory.dev===scope.directoryIdentity.dev&&currentDirectory.ino===scope.directoryIdentity.ino,'CRM_DIRECTORY_CHANGED','The configured original export directory was replaced.',409);
 const id=args.fileId,offset=args.offset??0,limit=args.limit??196608;
 need(/^[a-f0-9]{64}$/.test(id||'')&&Number.isSafeInteger(offset)&&offset>=0&&Number.isInteger(limit)&&limit>0&&limit<=196608,'CRM_FILE_SELECTION','Select a complete retained file and valid byte range.');
 const r=await readBytes(join(scope.directory,'exports',id+'.zip'));need(r.sha256===id&&offset<=r.bytes.length,'CRM_FILE_CHANGED','Original retained file or range differs.',409);
 const end=Math.min(r.bytes.length,offset+limit);return {fileId:id,sha256:id,bytes:r.bytes.length,offset,nextOffset:end<r.bytes.length?end:null,contentBase64:r.bytes.subarray(offset,end).toString('base64')};}
 if(name==='merchant_crm_status'&&!c)return {workspace:args.workspace,state:'DISCONNECTED'};
 need(c,'CRM_DISCONNECTED','Connect the existing CRM application.',409);
 if(name==='merchant_crm_status')return c.status();
 if(name==='merchant_crm_browser')return c.browser();
 if(name==='merchant_crm_action'){need(['configure','compare','review','decide'].includes(args.operation?.kind),'CRM_ACTION','Choose an original mapping, comparison or review action.');const r=await c.apply(args.operation);return {receipt:r.receipt,reused:r.reused,revision:r.archive.workspace.revision,sha256:r.archive.sha256};}
 if(name==='merchant_crm_ingest'){
 const selected=scope.inputs[alias(args.sourceInput)];need(selected&&selected.sha256===args.expectedSourceSha256,'CRM_INPUT','Select a declared original source and its exact SHA.',409);
 const source=await readBytes(selected.file);need(source.sha256===selected.sha256&&source.bytes.length===selected.bytes,'CRM_INPUT_CHANGED','The original source changed.',409);
 const o=args.operation,r=await c.apply({id:o.id,actor:o.actor,at:o.at,expected_revision:o.expected_revision,kind:'ingest',payload:{id:o.sourceId,filename:selected.filename,content:decode(source.bytes),role:o.role,edition:o.edition,origin:o.origin,delimiter:','}});
 return {receipt:r.receipt,reused:r.reused,revision:r.archive.workspace.revision,sha256:r.archive.sha256};}
 if(name==='merchant_crm_export')return c.export(args.expectedSha256);
 if(name==='merchant_crm_inspect'){
 const a=await c.workspace(),ws=a.workspace;need(a.sha256===args.expectedSha256,'CRM_REVISION_CHANGED','Reload the workspace summary before paging changed data.',409);
 let rows;switch(args.collection){
 case 'sources':rows=Object.values(ws.sourceWorkspace.sources).map(s=>({id:s.id,filename:s.filename,role:s.role,edition:s.edition,origin:s.origin,sha256:s.sha256,bytes:s.bytes,headers:s.table.headers,records:s.table.rows.length}));break;
 case 'configurations':rows=Object.values(ws.contracts);break;
 case 'runs':rows=Object.values(ws.runs).map(r=>({id:r.id,title:r.title,contract_id:r.contract_id,actor:r.actor,at:r.at,findings:r.output.findings.length,totals:r.output.totals,decision:r.decision}));break;
 case 'operations':rows=ws.operations.map(r=>({id:r.id,revision:r.revision,kind:r.request.kind,actor:r.request.actor,at:r.request.at,result:r.result}));break;
 case 'findings':rows=ws.runs[args.id]?.output.findings;break;
 case 'rows':rows=ws.sourceWorkspace.sources[args.id]?.table.rows;break;}
 need(Array.isArray(rows),'CRM_COLLECTION','Select an existing source, run or collection.');
 const offset=args.offset??0,limit=args.limit??20;need(Number.isSafeInteger(offset)&&offset>=0&&Number.isInteger(limit)&&limit>0&&limit<=50,'CRM_PAGE','Choose an offset and 1–50 rows.');
 return {sha256:a.sha256,revision:ws.revision,collection:args.collection,id:args.id,offset,total:rows.length,nextOffset:offset+limit<rows.length?offset+limit:null,rows:rows.slice(offset,offset+limit)};
 }
 throw Error('Unknown CRM action');
 }
 call(name,args={}){need(!this.closing,'CRM_CLOSING','The CRM attachment is closing.',409);const p=this.tail.then(()=>this.dispatch(name,args));this.tail=p.catch(()=>{});return p;}
 close(){if(this.closed)return this.closed;this.closing=true;return this.closed=(async()=>{await this.tail;await Promise.all([...this.clients.values()].map(c=>c.close()));this.clients.clear();})();}
}
