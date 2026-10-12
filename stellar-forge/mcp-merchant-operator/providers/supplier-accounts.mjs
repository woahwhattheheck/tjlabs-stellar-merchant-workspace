// MIT. Lazy source-owned supplier-account provider for the maintained Merchant host.
import { defineMerchantProvider, MERCHANT_PROVIDER_SCHEMA } from '../provider-contract.mjs';
import { supplierAccountTools } from '../catalog/supplier-accounts.mjs';
export default defineMerchantProvider({
  schema:MERCHANT_PROVIDER_SCHEMA,id:'supplier-accounts',family:'supplierAccounts',
  title:'Supplier account configuration and receiving',order:365,catalogOrder:365,
  configKey:'supplierAccountWorkspaces',summary:true,dependencies:[],maxRequestBytes:2097152,
  concurrentTools:['merchant_supplier_account_close'],
  configuration:{input:'supplierAccountWorkspaceConnection',privateExports:true,
    read:async(value,{hostPath})=>(await import('../supplier-account-connection.mjs')).readSupplierAccountWorkspaceConfiguration(hostPath(value))},
  tools:supplierAccountTools,
  load:()=>import('../supplier-account-workspaces.mjs'),
  create:(module,config)=>new module.MerchantSupplierAccountWorkspaces(config),
  initialize:async options=>(await import('../supplier-account-connection.mjs')).initializeSupplierAccountMerchant(options),
  instructions:[{prefix:'merchant_supplier_account_',order:575,text:
    'Choose a host-declared account alias and open its original workspace. Retain the returned workspaceId for every write. Read proposal for the complete account array and every binding assignment against the current source SHA. Prepare once, inspect the original immutable review, then explicitly apply its current revision and review SHA. Native errors return their actual change ID, status and revision; reopen that change and recover the same interrupted save. Saved membership takes effect on the original merchant’s next normal start. Original quota directories and their dispatch history retain their account identities. Read every history page using the first page’s token; a changed token requires a new walk. Retain complete reports or native backups under stable export IDs, inspect the immutable manifest and download every byte with original hashes through the maintained receiving client. Host-selected receiving inputs carry exact byte lengths and hashes. Receive into a new or empty workspace, or replay the same original backup to preserve later receiving history. Refresh workspaceId after receiving. Close drains accepted native operations and retained file descriptors.'}]
});
