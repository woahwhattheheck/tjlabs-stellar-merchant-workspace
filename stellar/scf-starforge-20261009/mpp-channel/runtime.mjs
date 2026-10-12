// MIT. Use the original exact native dependency set and the selected channel contract.
import { createRequire } from 'node:module';
import { join } from 'node:path';
import { pathToFileURL } from 'node:url';
import { loadNative, versions } from '../mpp-charge/runtime.mjs';
import { requireValue as need, hash, now } from '../mpp-charge/storage.mjs';
import { absolute, streamKey } from './config.mjs';
export { versions };
export async function loadChannelNative(dependencyRoot) {
  const native=await loadNative(dependencyRoot);
  const resolver=createRequire(join(absolute(dependencyRoot), 'package.json'));
  const [channelServer,channelClient]=await Promise.all(['@stellar/mpp/channel/server','@stellar/mpp/channel/client']
    .map(name=>import(pathToFileURL(resolver.resolve(name)).href)));
  return {...native, channelServer, channelClient};
}
export function nativeStore(workspace, terms) {
  const prefix='mpp-channel:'+terms.network+':'+terms.address+':';
  return {
    prefix, get:key=>workspace.sdkStore.get(prefix+key),
    put:(key,value)=>workspace.sdkStore.put(prefix+key,value),
    delete:key=>workspace.sdkStore.delete(prefix+key),
    update:(key,fn)=>workspace.sdkStore.update(prefix+key,fn)
  };
}
export const clientCumulativeKey = terms => 'stellar:channel:client:'+terms.network+':'+terms.address+':cumulative';
export const merchantCumulativeKey = terms => 'stellar:channel:cumulative:'+terms.address;
export const closedKey = terms => 'stellar:channel:closed:'+terms.address;
export const settlingKey = terms => 'stellar:channel:settling:'+terms.address;
function networkPassphrase(native, network) {
  if(network==='stellar:testnet') return native.sdk.Networks.TESTNET;
  need(network==='stellar:pubnet', 'MPP_CHANNEL_NETWORK_INVALID'); return native.sdk.Networks.PUBLIC;
}
export { networkPassphrase };
function enumKey(value, name, sdk) {
  try { const v=value.vec(); return v?.length===1 &&
    v[0].switch().value===sdk.xdr.ScValType.scvSymbol().value && v[0].sym().toString()===name; }
  catch { return false; }
}
async function timeout(promise, label) {
  let timer;
  try { return await Promise.race([promise,new Promise((_,reject)=> {
    timer=setTimeout(()=>reject(Object.assign(new Error(label),{code:'MPP_CHANNEL_RPC_TIMEOUT'})),15000);
  })]); } finally { clearTimeout(timer); }
}
export async function observeChannel(native, terms) {
  const sdk=native.sdk, server=new sdk.rpc.Server(terms.rpcUrl);
  const instanceKey=sdk.xdr.LedgerKey.contractData(new sdk.xdr.LedgerKeyContractData({
    contract:sdk.Address.fromString(terms.address).toScAddress(),
    key:sdk.xdr.ScVal.scvLedgerKeyContractInstance(),
    durability:sdk.xdr.ContractDataDurability.persistent()
  }));
  const [state,entries]=await Promise.all([
    native.channelServer.getChannelState({channel:terms.address,network:terms.network,rpcUrl:terms.rpcUrl}),
    timeout(server.getLedgerEntries(instanceKey),'channel instance')
  ]);
  need(state.token===terms.token && state.from===terms.funder && state.to===terms.recipient,
    'MPP_CHANNEL_ONCHAIN_PARTIES_CHANGED');
  const entry=entries.entries?.find(row=>Buffer.from(row.key.toXDR()).equals(Buffer.from(instanceKey.toXDR())));
  need(entry, 'MPP_CHANNEL_INSTANCE_REQUIRED');
  const instance=entry.val.contractData().val().instance();
  const code=Buffer.from(instance.executable().wasmHash()).toString('hex');
  need(code===terms.wasmSha256, 'MPP_CHANNEL_CODE_EDITION_CHANGED');
  const fields=instance.storage() ?? [];
  const commitment=fields.find(row=>enumKey(row.key(),'CommitmentKey',sdk));
  need(commitment && Buffer.from(commitment.val().bytes()).equals(
    Buffer.from(sdk.Keypair.fromPublicKey(terms.commitmentKey).rawPublicKey())),
    'MPP_CHANNEL_COMMITMENT_KEY_CHANGED');
  const withdrawn=fields.find(row=>enumKey(row.key(),'WithdrawnAmount',sdk));
  const withdrawnAtomic=withdrawn?BigInt(sdk.scValToNative(withdrawn.val())).toString():'0';
  return {schema:'stellar-forge.mpp-channel-observation.v1', observedAt:now(),
    network:terms.network, channel:terms.address, token:state.token, funder:state.from, recipient:state.to,
    commitmentKey:terms.commitmentKey, wasmSha256:code, balanceAtomic:state.balance.toString(),
    withdrawnAtomic, refundWaitingPeriod:state.refundWaitingPeriod,
    closeEffectiveAtLedger:state.closeEffectiveAtLedger, currentLedger:state.currentLedger,
    instanceLedger:entries.latestLedger, instanceSha256:hash(entry.val.toXDR())};
}

export async function dependencyRootFor(workspace,config) {
  const binding=await workspace.read('channel-receiving','runtime:'+streamKey(config.channel));
  return binding?absolute(binding.dependencyRoot):config.dependencyRoot;
}
export async function inputPathFor(workspace,config,path) {
  const binding=await workspace.read('channel-receiving','runtime:'+streamKey(config.channel));
  const selected=binding?.files?.[path];
  if(!selected) return path;
  const {regular}=await import('../distribution/runtime-workspace/storage.mjs');
  const bytes=await regular(selected.path,16*1024*1024);
  need(hash(bytes)===selected.sha256, 'MPP_CHANNEL_RECEIVED_INPUT_CHANGED');
  return selected.path;
}
