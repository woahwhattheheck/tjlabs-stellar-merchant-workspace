// SPDX-License-Identifier: MIT
import {defineMerchantProvider,MERCHANT_PROVIDER_SCHEMA} from '../../stellar-forge/mcp-merchant-operator/provider-contract.mjs';
import {projectPortfolioTools} from './merchant-catalog.mjs';
export default defineMerchantProvider({
 schema:MERCHANT_PROVIDER_SCHEMA,id:'project-portfolio-workspaces',family:'projectPortfolioWorkspaces',
 title:'Project Portfolio migration and reporting',order:470,catalogOrder:470,
 configKey:'projectPortfolioWorkspaces',summary:true,dependencies:[],
 concurrency:'provider',shutdown:'provider',maxRequestBytes:8*1024*1024,
 concurrentTools:['merchant_project_portfolio_cancel_wait','merchant_project_portfolio_pause',
  'merchant_project_portfolio_export_file_release'],
 configuration:{input:'projectPortfolioConnection',privateExports:true,
  read:async(value,{hostPath,base})=>(await import('./merchant.mjs'))
   .readProjectPortfolioMerchantConfiguration(hostPath(value,base))},
 tools:projectPortfolioTools,
 instructions:[{prefix:'merchant_project_portfolio_',order:185,text:
  'Use one declared original Project Portfolio workspace. Upload complete host-configured source files and retain their returned hashes. '+
  'All project parsing, timephased values, corrections, target actions and reporting use the original MPXJ/operator/archive engines. '+
  'Read the full selected edition and saved review before continuing a target operation. Use a stable 64-character requestId for each action; '+
  'after an interrupted reply, read or resume that same request and its original arguments. Native target uncertainty is resolved by the original '+
  'observed operation details and capture workflow. Save portfolio cohorts from original edition IDs; publish their exact reviewed reporting definition. '+
  'Large results and complete customer files are retained as exports. Read their manifest, then every original file byte through nextOffset=null '+
  'using the original expectedManifestSha256, expectedSha256 and readId. Release an unfinished reader before opening another. '+
  'A host restart creates a fresh private connection to the same workspace; original requests, exports and native operation identities remain available.'}],
 initialize:options=>import('./merchant.mjs').then(module=>module.initializeProjectPortfolioMerchant(options)),
 load:()=>import('./merchant.mjs'),
 create:(module,config,options)=>new module.MerchantProjectPortfolio(config,options.projectPortfolio),
});
