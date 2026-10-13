// MIT. Host-only setup and exact continuation for the original whole-host handoff operator.
import { readdir, lstat } from 'node:fs/promises';
import { isAbsolute, join, resolve } from 'node:path';
import { createHash } from 'node:crypto';
import { exact, line, failure } from '../../../../stellar-forge/mcp-merchant-operator/host-files.mjs';
import { CONFIG_SCHEMA, readMerchantConfig } from '../../../../stellar-forge/mcp-merchant-operator/config.mjs';
import { initReleaseStore, readReleaseState } from '../../sf82-seller-pilot/releases.mjs';
import { readHostHandoffMerchantConfiguration } from './host-handoff-merchant.mjs';
import { completeHostSetup, inspectHostSetup, hostSetupControlDirectory, readHostSetupConnection } from './host-handoff-setup-state.mjs';

const digest=raw=>createHash('sha256').update(raw).digest('hex');
const need=(ok,code,message)=>{if(!ok)throw failure(code,message);};
const pendingState=/^state\.json\.[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}\.tmp$/;

export async function initializeHostHandoffMerchant(options = {}) {
  exact(options,['directory','connection','name','operation'],['directory','connection']);
  for(const key of ['directory','connection'])
    if(typeof options[key]!=='string'||!isAbsolute(options[key])||resolve(options[key])!==options[key]||options[key]==='/')
      throw failure('CONFIGURATION_ERROR',key+' must be a normalized absolute host path.');
  const operation=options.operation??'initialize';
  need(['initialize','inspect','resume'].includes(operation),'HOST_SETUP_OPERATION',
    'Choose initialize, read-only inspect, or explicit resume of the original retained setup.');
  const root=options.directory,hostHandoffConnection=options.connection;
  // Inspection is recorded-only and remains available after source/connection changes.
  if(operation==='inspect')return inspectHostSetup(root);
  const name=line(options.name??'Starforge whole-host handoffs','Merchant name');
  const releaseStore=join(root,'releases'),exportsDirectory=join(root,'customer-exports');
  const controlDirectory=hostSetupControlDirectory(root);
  const selected=await readHostHandoffMerchantConfiguration(hostHandoffConnection,{
    operatorDirectory:root,releaseStore,exportsDirectory,setupDirectory:controlDirectory
  });
  const connectionBytes=await readHostSetupConnection(hostHandoffConnection);
  need(digest(connectionBytes)===selected.connectionSha256,'HOST_SETUP_CONNECTION_CHANGED',
    'The original connection changed during setup admission; no replacement inputs were adopted.');
  const configuration=join(root,'merchant-mcp.json');
  const configurationBytes=Buffer.from(JSON.stringify({
    schema:CONFIG_SCHEMA,name,releaseStore:'./releases',
    exportsDirectory:'./customer-exports',sources:{},hostHandoffConnection
  },null,2)+'\n');
  const validateRelease=async()=>{
    const state=await readReleaseState(releaseStore);
    const names=await readdir(releaseStore),releases=await readdir(join(releaseStore,'releases'));
    for(const name of names.filter(x=>pendingState.test(x))) {
      const item=await lstat(join(releaseStore,name));
      need(item.isFile()&&!item.isSymbolicLink()&&item.nlink>=1&&item.nlink<=2&&
        item.uid===process.getuid()&&!(item.mode&0o077),'HOST_SETUP_RELEASE_STORE_NOT_EMPTY',
        'Preserve an unexpected original release initialization temporary.');
    }
    need(state.generation===0&&state.active===null&&state.previous===null&&
      Array.isArray(state.history)&&state.history.length===0&&releases.length===0&&
      names.every(x=>['state.json','releases','.sf82-state.lock.lifetime','.sf82-run.lock.lifetime'].includes(x)||pendingState.test(x)),
    'HOST_SETUP_RELEASE_STORE_NOT_EMPTY','Preserve the populated or unrelated original release store.');
  };
  return completeHostSetup({
    directory:root,connection:hostHandoffConnection,name,connectionBytes,configurationBytes,operation,
    prepareRelease:async()=>{
      // The maintained resume path holds its original Linux state lease and
      // exclusively publishes initial state, even on first initialization.
      await initReleaseStore(releaseStore,{resume:true});
      await validateRelease();
    },
    validateRelease,
    validateComplete:async()=>{
      const current=await readMerchantConfig(configuration);
      need(current.hostHandoffs?.connectionSha256===selected.connectionSha256,
        'HOST_SETUP_CONNECTION_CHANGED','The original connection changed before setup completion.');
      const currentRaw=await readHostSetupConnection(hostHandoffConnection);
      need(currentRaw.equals(connectionBytes),'HOST_SETUP_CONNECTION_CHANGED',
        'The complete original connection bytes changed before setup completion.');
    },
    result:async()=>({
      schema:CONFIG_SCHEMA,configuration,state:'INITIALIZED',hostHandoffsConfigured:true,
      ownership:'ORIGINAL_WHOLE_HOST_HANDOFF',
      hosts:Object.entries(selected.hosts).map(([host,value])=>({
        host,label:value.label,source:Boolean(value.selectionFile),receiving:Boolean(value.restoreDirectory)
      }))
    })
  });
}
