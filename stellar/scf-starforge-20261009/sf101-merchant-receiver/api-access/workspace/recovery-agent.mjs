// MIT. Read-only recovery of original generated and manual API-pass agent state.
import {join} from 'node:path';
import {decodeApiPassWorkspaceConfiguration} from '../../../../../stellar-forge/mcp-merchant-operator/api-pass-connection.mjs';
import {inspectApiPassAgentSetup} from './agent-setup.mjs';
import {canonical as originalCanonical} from './configuration.mjs';
import {absolute,inside,need,HASH,UUID,same,sha,directory,file,jsonFile,present} from './recovery-files.mjs';

export const API_PASS_MANUAL_AGENT_RECOVERY_SCHEMA='stellar-forge.sf101.api-pass-manual-agent-recovery.v1';
const SETUP_SCHEMA='stellar-forge.sf101.api-pass-agent-setup.v1';
const MEMBER_NAMES=['setup.json','connection.json','merchant/merchant-mcp.json','client-settings.json'];
const identity=(path,value)=>({path,bytes:value.bytes,sha256:value.sha256});

/**
 * Inspect the declared original agent using logical paths and held mapped files.
 * The shared decoder validates the actual native connection contract without
 * creating directories. No setup, listener, purchase, task or MCP call is made.
 */
export async function inspectApiPassRecoveryAgent({directory:root,workspaceDirectory,workspaceId,stateRoot,
 map=path=>path,include,signal}={}){
 root=absolute(root);workspaceDirectory=absolute(workspaceDirectory);stateRoot=absolute(stateRoot);
 need(UUID.test(workspaceId??'')&&inside(stateRoot,root)&&inside(stateRoot,workspaceDirectory)
  &&!inside(root,workspaceDirectory),'API_RECOVERY_AGENT_BINDING_INVALID');
 const within=path=>{absolute(path);need(inside(stateRoot,path),'API_RECOVERY_DEPENDENCY_OUTSIDE_ROOT');return path;};
 async function inspectDirectory(path,{optional=false}={}){
  within(path);const actual=map(path),exists=await present(actual);
  if(!exists){need(optional,'API_RECOVERY_AGENT_DIRECTORY_MISSING');if(include)await include(path,{missing:true});return false;}
  await directory(actual);if(include)await include(path);return true;
 }
 async function inspectFile(path,{optional=false,maximum=1024*1024,expected,parse=false,capture=true}={}){
  within(path);const actual=map(path),exists=await present(actual);
  if(!exists){need(optional,'API_RECOVERY_ORIGINAL_FILE_MISSING');if(include&&capture)await include(path,{missing:true});return null;}
  const value=parse?await jsonFile(actual,maximum):await file(actual,{maximum,contents:true,signal});
  if(expected)need(value.sha256===expected.sha256&&(expected.bytes===undefined||value.bytes===expected.bytes),'API_RECOVERY_ORIGINAL_FILE_CHANGED');
  if(include&&capture)await include(path,{expected:{bytes:value.bytes,sha256:value.sha256}});
  return value;
 }
 await inspectDirectory(root);
 const marker=await present(map(join(root,'setup.json')));
 const connectionFile=join(root,'connection.json');
 // Keep member ordering and the original generated-setup profile hash unchanged.
 const members=[],values={},records={};
 const names=marker?MEMBER_NAMES:['connection.json'];
 for(const name of names){
  const path=join(root,name),value=await inspectFile(path,{parse:true});
  members.push({name,...identity(path,value)});values[name]=value.value;records[name]=value;
 }
 const connection=records['connection.json'];
 const decoded=decodeApiPassWorkspaceConfiguration(connection.raw,connectionFile);
 const matches=Object.entries(decoded.workspaces).filter(([,value])=>
  value.workspaceId===workspaceId&&value.launchFile===join(workspaceDirectory,'api-pass-workspace-launch.json'));
 need(matches.length===1,'API_RECOVERY_AGENT_WORKSPACE_AMBIGUOUS');
 const [alias,selected]=matches[0];
 // Preserve every configured alias and its own complete dependency closure. A
 // connection spanning roots cannot be silently narrowed during full recovery.
 for(const [name,definition]of Object.entries(decoded.workspaces)){
  within(definition.launchFile);
  const launch=await inspectFile(definition.launchFile,{optional:true,parse:true,capture:false});
  if(launch)need(launch.value.schema==='stellar-forge.sf101.api-pass-workspace-launch.v1'
   &&launch.value.workspaceId===definition.workspaceId,'API_RECOVERY_AGENT_BINDING_INVALID');
  for(const key of ['operationDirectory','exportDirectory','snapshotDirectory'])
   await inspectDirectory(definition[key],{optional:true});
  for(const input of Object.values(definition.files))
   await inspectFile(input.path,{expected:{sha256:input.sha256},maximum:{handoff:65536,body:1048576,'approved-request':32768}[input.kind]});
  for(const purchase of Object.values(definition.purchases)){
   await inspectDirectory(purchase.directory);
   const metadata=await inspectFile(join(purchase.directory,'customer.json'),{maximum:2*1024*1024,expected:{sha256:purchase.customerSha256},parse:true});
   need(metadata.value.schema==='stellar-forge.sf101.api-purchase-customer.v1'
    &&metadata.value.intentId===purchase.intentId&&metadata.value.orderReference===purchase.orderReference,'API_RECOVERY_AGENT_PURCHASE_INVALID');
  }
 }
 if(marker){
  const setup=values['setup.json'],customer=values['connection.json']?.workspaces?.customer;
  need(alias==='customer'&&setup.schema===SETUP_SCHEMA&&setup.directory===root
   &&setup.workspaceDirectory===workspaceDirectory&&setup.workspaceId===workspaceId
   &&customer?.workspaceId===workspaceId&&customer.launchFile===join(workspaceDirectory,'api-pass-workspace-launch.json'),
   'API_RECOVERY_AGENT_BINDING_INVALID');
  for(const [key,name]of [['operationDirectory','operations'],['exportDirectory','exports'],['snapshotDirectory','reads']])
   need(customer[key]===join(root,name),'API_RECOVERY_AGENT_BINDING_INVALID');
  const merchant=values['merchant/merchant-mcp.json'],client=values['client-settings.json'];
  need(merchant.schema==='stellar-forge.merchant-mcp.v1'&&merchant.apiPassWorkspaceConnection===connectionFile
   &&client.mcpServers?.['starforge-api-customer']?.env?.MCP_MERCHANT_CONFIG===join(root,'merchant','merchant-mcp.json'),
   'API_RECOVERY_AGENT_BINDING_INVALID');
  return {directory:root,members,sha256:sha(JSON.stringify(originalCanonical({directory:root,workspaceDirectory,files:members})))};
 }
 // Other original manual files, including private-session.json, CLI operations
 // and download journals, are retained as exact bytes by the full directory
 // capture. Their contents, tokens and stale listener endpoints are not exposed.
 const paths={operationDirectory:selected.operationDirectory,exportDirectory:selected.exportDirectory,snapshotDirectory:selected.snapshotDirectory};
 const value={schema:API_PASS_MANUAL_AGENT_RECOVERY_SCHEMA,kind:'manual',directory:root,
  workspaceDirectory,workspaceId,workspace:alias,connectionFile,connectionSha256:connection.sha256,
  expectedEntrySha256:selected.expectedEntrySha256??null,...paths,members};
 return {...value,sha256:sha(JSON.stringify(originalCanonical(value)))};
}

/** Re-open only the selected retained metadata; later journals and edits remain. */
export async function reopenApiPassRecoveryAgent(retained,{stateRoot,workspaceDirectory,workspaceId}={}){
 need(retained&&typeof retained.directory==='string','API_RECOVERY_AGENT_BINDING_INVALID');
 if(retained.kind!=='manual'){
  // Older generated records deliberately retain the same public shape.
  const inspected=await inspectApiPassAgentSetup(retained.directory,{workspaceDirectory,workspaceId});
  need(inspected.initialized,'API_RECOVERY_COMPLETE_AGENT_REQUIRED');
  return {agentDirectory:inspected.directory,expectedAgentSetupSha256:inspected.sha256};
 }
 need(retained.schema===API_PASS_MANUAL_AGENT_RECOVERY_SCHEMA,'API_RECOVERY_AGENT_BINDING_INVALID');
 const current=await inspectApiPassRecoveryAgent({directory:retained.directory,stateRoot,workspaceDirectory,workspaceId});
 need(current.kind==='manual'&&same(current,retained),'API_RECOVERY_MANUAL_AGENT_SELECTION_CHANGED');
 return {manualAgent:{schema:API_PASS_MANUAL_AGENT_RECOVERY_SCHEMA,directory:current.directory,
  workspace:current.workspace,workspaceId:current.workspaceId,connectionFile:current.connectionFile,
  expectedConnectionSha256:current.connectionSha256,expectedEntrySha256:current.expectedEntrySha256,
  operationDirectory:current.operationDirectory,exportDirectory:current.exportDirectory,snapshotDirectory:current.snapshotDirectory,
  setupCreated:false,executionStarted:false}};
}
