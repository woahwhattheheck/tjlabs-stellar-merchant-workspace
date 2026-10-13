// MIT. Original maintained resumable writer; complete Econdb bytes and native receiver.
import {createRetainedDownload,openMerchantFileClient} from './retained-download.mjs';
import {HANDOVER_MANIFEST,HANDOVER_SCHEMA} from './econdb-workspace.mjs';
import {receiveOperator,inspectOperatorTransfer} from '../../stellar/scf_2026/sf49_data_commissioning/econdb/operator.mjs';
const SHA=/^[a-f0-9]{64}$/,ALIAS=/^[a-z0-9][a-z0-9_-]{0,63}$/,UUID=/^[0-9a-f]{8}-[0-9a-f]{4}-4[0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/;
function need(v,m){if(!v)throw Object.assign(new Error(m),{code:'ECONDB_DOWNLOAD_INVALID'});}
export function parseEcondbHandover(bytes,exportId){
 const m=JSON.parse(new TextDecoder('utf-8',{fatal:true,ignoreBOM:true}).decode(bytes));
 need(m?.schema===HANDOVER_SCHEMA&&m.exportId===exportId&&ALIAS.test(exportId)&&UUID.test(m.workspaceId)&&Number.isSafeInteger(m.revision)&&m.revision>=0&&SHA.test(m.transferSha256)&&Array.isArray(m.files),'Select the complete original Econdb handover.');
 const names=new Set();let count=0;
 for(const f of m.files){
  need(f&&Object.keys(f).every(k=>['name','bytes','sha256'].includes(k))&&typeof f.name==='string'&&f.name.length<=4096&&!f.name.includes('\\')&&!f.name.includes('\0')&&!f.name.startsWith('/')&&f.name.split('/').every(p=>p&&p!=='.'&&p!=='..'),'Unsafe original handover member.');
  need(f.name==='operator-transfer.json'||f.name.startsWith('workspace/'),'Unknown complete handover member.');
  need(!names.has(f.name)&&Number.isSafeInteger(f.bytes)&&f.bytes>=0&&f.bytes<=8*1024*1024*1024&&SHA.test(f.sha256),'Invalid original file identity.');names.add(f.name);count+=f.bytes;need(Number.isSafeInteger(count),'Complete byte total exceeds safe integer range.');
 }
 need(names.has('operator-transfer.json')&&names.has('workspace/workspace.json')&&names.has('workspace/state.json'),'Complete native transfer members are required.');
 return m;
}
const writer=createRetainedDownload({
 manifestName:HANDOVER_MANIFEST,parseManifest:parseEcondbHandover,maximumBytes:8*1024*1024*1024,
 stateSchema:'stellar-forge.econdb-download-state.v1',resultSchema:'stellar-forge.econdb-download.v1',
 toolPrefix:'merchant_econdb_handover',errorPrefix:'ECONDB',clientName:'starforge-econdb-receiver',
 nestedFiles:true,maximumManifestBytes:64*1024*1024,maximumCheckpointBytes:128*1024*1024,
 fileRequestTimeoutMs:240000,describe:m=>({workspaceId:m.workspaceId,revision:m.revision})
});
async function clientFor(options){
 const{workspace,workspaceId,client,url,tokenEnv,environment,signal}=options;
 need(ALIAS.test(workspace)&&UUID.test(workspaceId),'Choose the original workspace alias and UUID.');
 need(!(client&&url),'Use one original native client or MCP URL.');
 const original=client??await openMerchantFileClient({url,tokenEnv,environment,signal,errorPrefix:'ECONDB',clientName:'starforge-econdb-receiver'});
 need(original&&typeof original.call==='function'&&typeof original.endpoint==='string','Select the original connected client.');
 return{endpoint:original.endpoint+'#econdb='+encodeURIComponent(workspace+':'+workspaceId),
  call:(name,args,callOptions)=>original.call(name,{workspace,workspaceId,...args},callOptions)};
}
export async function downloadEcondbHandover(options){
 const client=await clientFor(options);
 const result=await writer.download({client,exportId:options.exportId,directory:options.directory,expectedManifestSha256:options.expectedManifestSha256,signal:options.signal,onProgress:options.onProgress,chunkSize:options.chunkSize});
 const checked=await inspectOperatorTransfer(result.directory);
 need(checked.manifest.workspaceId===options.workspaceId,'Downloaded native workspace differs from the selected original.');
 return result;
}
export async function inspectEcondbHandover(options){const result=await writer.inspect({client:await clientFor(options),exportId:options.exportId});need(result.manifest.workspaceId===options.workspaceId,'Manifest workspace differs.');return result;}
export async function receiveEcondbHandover({directory,destination}){return receiveOperator({directory,destination});}
