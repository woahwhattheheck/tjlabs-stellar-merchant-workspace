// Apache-2.0. Configured original odr installations; no parallel business store.
import {createHash,randomUUID} from 'node:crypto';
import {dirname,join} from 'node:path';
import {lstat,realpath} from 'node:fs/promises';
import {OdrInstallation,ODR_SOURCE,canonicalDirectory,exact,plain,readPrivateJSON,requestId,selectedPath,odrError} from './client.mjs';
import {odrWorkspaceTools} from './catalog.mjs';
export const ODR_WORKSPACE_CONNECTION_SCHEMA='stellar-forge.odr-workspace-connection.v1';
const keep=value=>Object.fromEntries(Object.entries(value).filter(([,v])=>v!==undefined));
function alias(value){if(typeof value!=='string'||!/^[a-z0-9][a-z0-9_-]{0,63}$/.test(value)||['__proto__','prototype','constructor'].includes(value))throw odrError('INVALID_PARAMS','Select a configured odr workspace alias.');return value;}
export async function readOdrWorkspaceConfiguration(path){
  const selected=await readPrivateJSON(path,131072),raw=selected.value;
  exact(raw,['schema','workspaces'],['schema','workspaces']);
  if(raw.schema!==ODR_WORKSPACE_CONNECTION_SCHEMA||!plain(raw.workspaces)||!Object.keys(raw.workspaces).length||Object.keys(raw.workspaces).length>32)throw odrError('ODR_CONFIGURATION','Select one to thirty-two original installations.');
  const base=dirname(selected.path),workspaces=Object.create(null),seen=new Set();
  for(const[name,input]of Object.entries(raw.workspaces)){
    alias(name);exact(input,['label','directory','sourceDirectory','application','node','python','handover','receiveHandover','receiveArchive','transferDirectory','binding'],['directory']);
    const directory=await canonicalDirectory(selectedPath(input.directory,base),{missing:true,privateOnly:true});
    if(seen.has(directory))throw odrError('ODR_CONFIGURATION','Give each actual installation directory one alias.');seen.add(directory);
    const sourceDirectory=await canonicalDirectory(selectedPath(input.sourceDirectory??ODR_SOURCE,base)),script=join(sourceDirectory,'native','operations.py');
    if(!(await lstat(script)).isFile()||await realpath(script)!==script)throw odrError('ODR_SOURCE','Select the complete native adapter source.');
    const value={directory,sourceDirectory,python:selectedPath(input.python??'/usr/bin/python3',base),node:input.node===undefined?undefined:selectedPath(input.node,base),label:input.label??name};
    if(typeof value.label!=='string'||!value.label.trim()||value.label.length>240||/[\0\r\n]/.test(value.label))throw odrError('ODR_CONFIGURATION','Use a complete short label.');
    // Temporary original inputs may have been retired after a completed receive;
    // their exact surviving bytes are checked by the original named lifecycle.
    for(const key of ['application','handover','receiveHandover','receiveArchive'])if(input[key]!==undefined)value[key]=selectedPath(input[key],base);
    if(input.transferDirectory!==undefined)value.transferDirectory=await canonicalDirectory(selectedPath(input.transferDirectory,base),{privateOnly:true});
    if(input.binding!==undefined){exact(input.binding,['installation_id','source_identity'],['installation_id','source_identity']);value.binding={...input.binding};}
    workspaces[name]=value;
  }
  return{schema:ODR_WORKSPACE_CONNECTION_SCHEMA,workspaces,selectionSha256:createHash('sha256').update(selected.bytes).digest('hex')};
}
const definitions=new Map(odrWorkspaceTools((name,description,properties,required)=>({name,properties,required})).map(x=>[x.name,x]));
function source(selected){if(!selected.application)throw odrError('ODR_SOURCE_SELECTION','Select the complete original APPLICATION_SOURCE.json in this private connection.');return{application:selected.application};}
function native(selected){if(!selected.node)throw odrError('ODR_NODE_SELECTION','Select the actual installed Node executable in this private connection.');return {python:selected.python,node:selected.node};}
function identifier(value){if(typeof value!=='string'||!/^[A-Za-z0-9][A-Za-z0-9_.:-]{0,159}$/.test(value))throw odrError('INVALID_PARAMS','Use a complete original record identifier.');}
export class MerchantOdrWorkspaces{
  #workspaces;#clients=new Map();#closing=false;#closed;
  constructor(config){this.#workspaces=structuredClone(config.odrWorkspaces?.workspaces??{});}
  get summary(){return{configured:Object.keys(this.#workspaces).length>0,ownership:'ORIGINAL_ODR_INSTALLATION',workspaces:Object.entries(this.#workspaces).map(([workspace,v])=>({workspace,label:v.label})),activeCalls:[...this.#clients.values()].reduce((n,x)=>n+x.activeCalls,0),closing:this.#closing};}
  #select(name){const selected=this.#workspaces[name];if(!selected)throw odrError('ODR_NOT_CONFIGURED','Select a host-configured original installation.');let client=this.#clients.get(name);if(!client){client=new OdrInstallation({directory:selected.directory,sourceDirectory:selected.sourceDirectory,python:selected.python,...(selected.binding?{binding:selected.binding}:{})});this.#clients.set(name,client);}return{selected,client};}
  async call(name,args={}){
    if(this.#closing)throw odrError('ODR_CLOSING','The original adapter is draining its calls.');
    const definition=definitions.get(name);if(!definition)throw odrError('TOOL_NOT_FOUND','Unknown odr operation.');exact(args,Object.keys(definition.properties),definition.required);
    const input=structuredClone(args),action=name.slice('merchant_odr_'.length),nameAlias=alias(input.workspace),id=input.requestId;
    if(id!==undefined){if(action==='request')identifier(id);else requestId(id);}
    if(input.originInstallationId!==undefined)requestId(input.originInstallationId);
    for(const key of ['recordId','baselineId'])if(input[key]!==undefined)identifier(input[key]);
    if(input.kind!==undefined){if(action==='export'){if(!['workspace','report','application'].includes(input.kind))throw odrError('INVALID_PARAMS','Choose a complete original export.');}else identifier(input.kind);}
    if(input.measurementIds!==undefined){if(!Array.isArray(input.measurementIds)||!input.measurementIds.length||input.measurementIds.length>50||new Set(input.measurementIds).size!==input.measurementIds.length)throw odrError('INVALID_PARAMS','Select distinct original measurement IDs.');input.measurementIds.forEach(identifier);}
    if(input.expectedDigest!==undefined&&!/^[a-f0-9]{64}$/.test(input.expectedDigest))throw odrError('INVALID_PARAMS','Select the actual original handover digest.');
    if(input.port!==undefined&&(!Number.isInteger(input.port)||input.port<0||input.port>65535))throw odrError('INVALID_PARAMS','Select a loopback port.');
    const{selected,client}=this.#select(nameAlias);let reply;
    if(action==='status')reply=await client.inspect();
    else if(action==='source')reply=await client.source(source(selected));
    else if(action==='prepare'){if(selected.receiveArchive)throw odrError('ODR_RECEIVING_SELECTION','Receive the selected whole installation archive.');reply=await client.prepare(keep({...source(selected),...native(selected),handover:selected.handover}),id);}
    else if(action==='adopt_source')reply=await client.adoptSource(source(selected),id);
    else if(action==='receive'){if(!selected.receiveArchive)throw odrError('ODR_ARCHIVE_SELECTION','Select the complete original installation archive.');reply=await client.receive({archive_path:selected.receiveArchive,...native(selected)},id);if(reply.installation?.paths.directory!==selected.directory)throw odrError('ODR_RECEIVING_CHANGED','The receiver selected another directory.');}
    else if(action==='snapshot'||action==='export'){
      if(!selected.transferDirectory)throw odrError('ODR_TRANSFER_DIRECTORY','Select a private transfer directory in the connection.');
      const suffix=action==='snapshot'?'.zip':input.kind==='report'?'.md':'.json',file=join(selected.transferDirectory,id+suffix);
      reply=action==='snapshot'?await client.snapshot(file,id):await client.export(input.kind,file,id);
    }else if(action==='state')reply=await client.state();
    else if(action==='record')reply=await client.record(input.kind,input.recordId);
    else if(action==='history')reply=await client.history(input.kind,input.recordId);
    else if(action==='handover')reply=await client.call('workspace.handover');
    else if(action==='compare')reply=await client.call('workspace.comparison',{ids:input.measurementIds,baseline_id:input.baselineId});
    else if(action==='receive_workspace'){if(!selected.receiveHandover)throw odrError('ODR_HANDOVER_SELECTION','Select the original onward handover file in the private connection.');reply=await client.receiveWorkspace(selected.receiveHandover,input.expectedDigest,id);}
    else if(action==='request')reply=await client.request(id,input.originInstallationId);
    else if(action==='commands'){if(!selected.transferDirectory)throw odrError('ODR_TRANSFER_DIRECTORY','Select a private readiness directory.');reply=await client.call('commands.describe',keep({port:input.port,ready_file:join(selected.transferDirectory,'service-'+randomUUID()+'.json')}));}
    else throw odrError('TOOL_NOT_FOUND','Unknown original odr operation.');
    return{...reply,workspace:nameAlias};
  }
  close(){return this.#closed??=(async()=>{this.#closing=true;await Promise.allSettled([...this.#clients.values()].map(c=>c.close()));})();}
}
