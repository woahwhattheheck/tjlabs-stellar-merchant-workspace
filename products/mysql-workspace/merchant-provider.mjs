// MIT. Additive declaration in the original source-owned merchant registry.
import { defineMerchantProvider, MERCHANT_PROVIDER_SCHEMA } from '../../stellar-forge/mcp-merchant-operator/provider-contract.mjs';
import { mysqlProductTools } from './merchant-tools.mjs';
export default defineMerchantProvider({
  schema:MERCHANT_PROVIDER_SCHEMA,id:'mysql-products',family:'mysqlProducts',title:'MySQL merchant products',
  order:457,catalogOrder:457,configKey:'mysqlProducts',summary:true,dependencies:[],
  maxRequestBytes:524288,concurrency:'provider',shutdown:'provider',
  configuration:{input:'mysqlProductConnection',privateExports:true,
    read:async(value,{hostPath})=>(await import('./setup.mjs')).readMysqlProductConfiguration(hostPath(value))},
  tools:mysqlProductTools,load:()=>import('./merchant-owner.mjs'),
  create:(module,config,options)=>new module.MerchantMysqlProducts(config,options),
  instructions:[{prefix:'merchant_mysql_product_',order:457,text:
    'Open the declared complete MySQL product once. Browser, MCP and CLI share its original editor/publisher/versioned seller. Keep exact plan, release, candidate, review, run and request identities. Drafts retain unfinished fields as saved versions; reopening requires fresh native source review before preparing. Dataset configuration selects existing reviewed payment terms and snapshot/revision. Inspect retained outcomes before repeating original publisher writes. Whole-workspace handover closes native activity before copying and keeps credentials as environment references.'}],
});
