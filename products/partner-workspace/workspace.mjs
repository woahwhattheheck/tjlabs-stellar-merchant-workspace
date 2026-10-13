// Apache-2.0. Configured original partner installations; no parallel business store.
import {createHash,randomUUID} from 'node:crypto';
import {dirname,join} from 'node:path';
import {lstat,realpath} from 'node:fs/promises';
import {PartnerInstallation,PARTNER_SOURCE,canonicalDirectory,exact,plain,readPrivateJSON,requestId,selectedPath,partnerError} from './client.mjs';
import {partnerWorkspaceTools} from './catalog.mjs';
export const PARTNER_WORKSPACE_CONNECTION_SCHEMA='stellar-forge.partner-workspace-connection.v1';
const keep=value=>Object.fromEntries(Object.entries(value).filter(([,v])=>v!==undefined));
function alias(value){if(typeof value!=='string'||!/^[a-z0-9][a-z0-9_-]{0,63}$/.test(value)||['__proto__','prototype','constructor'].includes(value))throw partnerError('INVALID_PARAMS','Select a configured partner workspace alias.');return value;}
export async function readPartnerWorkspaceConfiguration(path){
  const selected=await readPrivateJSON(path,131072),raw=selected.value;
  exact(raw,['schema','workspaces'],['schema','workspaces']);
  if(raw.schema!==PARTNER_WORKSPACE_CONNECTION_SCHEMA||!plain(raw.workspaces)||!Object.keys(raw.workspaces).length||Object.keys(raw.workspaces).length>32)throw partnerError('PARTNER_CONFIGURATION','Select one to thirty-two original installations.');
  const base=dirname(selected.path),workspaces=Object.create(null),seen=new Set();
  for(const[name,input]of Object.entries(raw.workspaces)){
    alias(name);exact(input,['label','directory','sourceDirectory','sourceRoot','sourceManifest','python','workspaceArchive','receiveArchive','transferDirectory','binding'],['directory']);
    const directory=await canonicalDirectory(selectedPath(input.directory,base),{missing:true,privateOnly:true});
    if(seen.has(directory))throw partnerError('PARTNER_CONFIGURATION','Give each actual installation directory one alias.');seen.add(directory);
    const sourceDirectory=await canonicalDirectory(selectedPath(input.sourceDirectory??PARTNER_SOURCE,base)),script=join(sourceDirectory,'native','operations.py');
    if(!(await lstat(script)).isFile()||await realpath(script)!==script)throw partnerError('PARTNER_SOURCE','Select the complete native adapter source.');
    const value={directory,sourceDirectory,python:selectedPath(input.python??'/usr/bin/python3',base),label:input.label??name};
    if(typeof value.label!=='string'||!value.label.trim()||value.label.length>240||/[\0\r\n]/.test(value.label))throw partnerError('PARTNER_CONFIGURATION','Use a complete short label.');
    // Temporary original inputs may have been retired after a completed receive;
    // their exact surviving bytes are checked by the original named lifecycle.
    for(const key of ['sourceRoot','sourceManifest','workspaceArchive','receiveArchive'])if(input[key]!==undefined)value[key]=selectedPath(input[key],base);
    if(input.transferDirectory!==undefined)value.transferDirectory=await canonicalDirectory(selectedPath(input.transferDirectory,base),{privateOnly:true});
    if(input.binding!==undefined){exact(input.binding,['installation_id','source_identity'],['installation_id','source_identity']);value.binding={...input.binding};}
    workspaces[name]=value;
  }
  return{schema:PARTNER_WORKSPACE_CONNECTION_SCHEMA,workspaces,selectionSha256:createHash('sha256').update(selected.bytes).digest('hex')};
}
const definitions=new Map(partnerWorkspaceTools((name,description,properties,required)=>({name,properties,required})).map(x=>[x.name,x]));
function source(selected){if(!selected.sourceRoot||!selected.sourceManifest)throw partnerError('PARTNER_SOURCE_SELECTION','Select the complete original source root and manifest in this private connection.');return{source_root:selected.sourceRoot,source_manifest:selected.sourceManifest};}
function identifier(value){if(typeof value!=='string'||!/^[A-Za-z0-9][A-Za-z0-9_.:-]{0,159}$/.test(value))throw partnerError('INVALID_PARAMS','Use a complete original record identifier.');}
export class MerchantPartnerWorkspaces{
  #workspaces;#clients=new Map();#closing=false;#closed;
  constructor(config){this.#workspaces=structuredClone(config.partnerWorkspaces?.workspaces??{});}
  get summary(){return{configured:Object.keys(this.#workspaces).length>0,ownership:'ORIGINAL_PARTNER_INSTALLATION',workspaces:Object.entries(this.#workspaces).map(([workspace,v])=>({workspace,label:v.label})),activeCalls:[...this.#clients.values()].reduce((n,x)=>n+x.activeCalls,0),closing:this.#closing};}
  #select(name){const selected=this.#workspaces[name];if(!selected)throw partnerError('PARTNER_NOT_CONFIGURED','Select a host-configured original installation.');let client=this.#clients.get(name);if(!client){client=new PartnerInstallation({directory:selected.directory,sourceDirectory:selected.sourceDirectory,python:selected.python,...(selected.binding?{binding:selected.binding}:{})});this.#clients.set(name,client);}return{selected,client};}
  async call(name,args={}){
    if(this.#closing)throw partnerError('PARTNER_CLOSING','The original adapter is draining its calls.');
    const definition=definitions.get(name);if(!definition)throw partnerError('TOOL_NOT_FOUND','Unknown partner operation.');exact(args,Object.keys(definition.properties),definition.required);
    const input=structuredClone(args),action=name.slice('merchant_partner_'.length),nameAlias=alias(input.workspace),id=input.requestId;
    if(id!==undefined){if(action==='request')identifier(id);else requestId(id);}
    if(input.originInstallationId!==undefined)requestId(input.originInstallationId);
    for(const key of ['recordId','sourceId','importId'])if(input[key]!==undefined)identifier(input[key]);
    if(input.kind!==undefined){if(action==='export'){if(!['workspace','report','csv'].includes(input.kind))throw partnerError('INVALID_PARAMS','Choose a complete original export.');}else identifier(input.kind);}
    if(input.importIds!==undefined){if(!Array.isArray(input.importIds)||!input.importIds.length||input.importIds.length>100||new Set(input.importIds).size!==input.importIds.length)throw partnerError('INVALID_PARAMS','Select distinct original mobility imports.');input.importIds.forEach(identifier);}
    if(input.port!==undefined&&(!Number.isInteger(input.port)||input.port<0||input.port>65535))throw partnerError('INVALID_PARAMS','Select a loopback port.');
    const{selected,client}=this.#select(nameAlias);let reply;
    if(action==='status')reply=await client.inspect();
    else if(action==='source')reply=await client.source(source(selected));
    else if(action==='prepare'){if(selected.receiveArchive)throw partnerError('PARTNER_RECEIVING_SELECTION','Receive the selected whole installation archive.');reply=await client.prepare(keep({...source(selected),python:selected.python,workspace_archive:selected.workspaceArchive}),id);}
    else if(action==='adopt_source')reply=await client.adoptSource(source(selected),id);
    else if(action==='receive'){if(!selected.receiveArchive)throw partnerError('PARTNER_ARCHIVE_SELECTION','Select the complete original installation archive.');reply=await client.receive({archive_path:selected.receiveArchive,python:selected.python},id);if(reply.installation?.paths.directory!==selected.directory)throw partnerError('PARTNER_RECEIVING_CHANGED','The receiver selected another directory.');}
    else if(action==='snapshot'||action==='export'){
      if(!selected.transferDirectory)throw partnerError('PARTNER_TRANSFER_DIRECTORY','Select a private transfer directory in the connection.');
      const suffix=action==='snapshot'||input.kind==='workspace'?'.zip':input.kind==='report'?'.md':'.csv',file=join(selected.transferDirectory,id+suffix);
      reply=action==='snapshot'?await client.snapshot(file,id):await client.export(input.kind,file,id);
    }else if(action==='state')reply=await client.state();
    else if(action==='record')reply=await client.record(input.kind,input.recordId);
    else if(action==='history')reply=await client.history(input.kind,input.recordId);
    else if(action==='evidence')reply=await client.call('workspace.source',{id:input.sourceId});
    else if(action==='compare')reply=await client.call('workspace.compare',{ids:input.importIds});
    else if(action==='stations')reply=await client.call('workspace.stations',{id:input.importId});
    else if(action==='request')reply=await client.request(id,input.originInstallationId);
    else if(action==='commands'){if(!selected.transferDirectory)throw partnerError('PARTNER_TRANSFER_DIRECTORY','Select a private readiness directory.');reply=await client.call('commands.describe',keep({port:input.port,ready_file:join(selected.transferDirectory,'service-'+randomUUID()+'.json')}));}
    else throw partnerError('TOOL_NOT_FOUND','Unknown original partner operation.');
    return{...reply,workspace:nameAlias};
  }
  close(){return this.#closed??=(async()=>{this.#closing=true;await Promise.allSettled([...this.#clients.values()].map(c=>c.close()));})();}
}
