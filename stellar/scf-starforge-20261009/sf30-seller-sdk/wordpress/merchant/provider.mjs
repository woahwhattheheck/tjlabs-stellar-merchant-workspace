// MIT. Source-owned WordPress merchant declaration; native owners load on use.
import {defineMerchantProvider,MERCHANT_PROVIDER_SCHEMA} from '../../../../../stellar-forge/mcp-merchant-operator/provider-contract.mjs';
import {wordpressMerchantTools} from './catalog.mjs';
import {MAX_REQUEST_BYTES} from './contracts.mjs';
export default defineMerchantProvider({
  schema:MERCHANT_PROVIDER_SCHEMA,id:'wordpress-workspaces',family:'wordpressWorkspaces',
  title:'WordPress source and merchant workspace',order:460,catalogOrder:460,configKey:'wordpressWorkspaces',
  maxRequestBytes:MAX_REQUEST_BYTES+65536,
  configuration:{input:'wordpressConnection',privateExports:true,
    read:async(value,{hostPath})=>(await import('./connection.mjs')).readWordPressConfiguration(hostPath(value))},
  tools:()=>wordpressMerchantTools,
  load:()=>import('./runtime.mjs'),
  create:(module,config)=>new module.MerchantWordPressWorkspaces(config),
  initialize:async options=>(await import('./setup.mjs')).initializeWordPressMerchant(options),
  concurrency:'provider',shutdown:'drain',
  instructions:[{order:460,prefix:'merchant_wordpress_',
    text:'Operate the host-declared original WordPress workspace. Explicitly open its standalone controller or borrow the current Applications operation. Preserve workspace UUID/identity, current revision, original action UUID, source capture and edition IDs. Read the saved action after an uncertain reply and reuse its exact inputs. Discovery and capture retain real WordPress REST responses before cursor movement. Review original mappings and editions, then use the same Socrata publisher, SF82 release and configured SF88 Buyer session. publisher.prepare selects the original export UUID; top-level manifest/file/json/receive select immutable merchant SHA-256 exports. A preview is accompanied by the complete retained file; read every byte when the value is required. Only an original source-packet export can be received into a declared receiver. Source and signer credentials remain in original environment references. Private controller tokens stay inside the host. Release closes only a server owned by this provider.'}]
});
