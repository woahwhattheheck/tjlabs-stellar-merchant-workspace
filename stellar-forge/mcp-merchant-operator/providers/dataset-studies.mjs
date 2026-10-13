// MIT. Original SF30 studies own their source, files and borrowed browser lifecycle.
import {defineMerchantProvider,MERCHANT_PROVIDER_SCHEMA} from '../provider-contract.mjs';
import {datasetStudyTools} from '../catalog/dataset-studies.mjs';
export default defineMerchantProvider({
 schema:MERCHANT_PROVIDER_SCHEMA,id:'dataset-studies',family:'datasetStudies',title:'dataset query studies',
 order:545,catalogOrder:415,configKey:'datasetStudies',summary:true,dependencies:[],
 concurrency:'provider',shutdown:'provider',maxRequestBytes:9*1024*1024,
 configuration:{input:'datasetStudyConnection',privateExports:true,
   read:async(value,{hostPath})=>(await import('../dataset-studies.mjs')).readDatasetStudiesConfiguration(hostPath(value))},
 tools:datasetStudyTools,
 instructions:[{prefix:'merchant_dataset_study_',text:'Open a declared original dataset study workspace and use its returned persistent workspaceId plus process instanceId. Save raw unfinished controls with an explicit native revision and operation time. Query uses the original engine and saved source snapshot. Whole-result jobs retain all original pages and resume the same job. Download complete immutable study/result packages through the retained file tools; browser views borrow this same owner. Host source/import paths belong only in the private connection file.'}],
 load:()=>import('../dataset-studies.mjs'),
 create:(module,config,options)=>new module.MerchantDatasetStudies(config,options),
 initialize:async options=>(await import('../dataset-studies-setup.mjs')).initializeDatasetStudiesMerchant(options)
});
