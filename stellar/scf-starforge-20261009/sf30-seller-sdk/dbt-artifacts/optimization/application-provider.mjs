// MIT. The original managed project owner serves both artifact and optimization desks.
import {join,resolve} from 'node:path';
import {inspectMerchantRuntime} from '../../../sf46-release/runtime-package.mjs';
import {APPLICATION_PROVIDER_SCHEMA,observeApplicationStartup} from '../../../distribution/runtime-workspace/application-provider.mjs';
import {dbtApplication,prepareDbtApplication,dbtStartup} from '../application-provider.mjs';
const ROOT='stellar/scf-starforge-20261009/sf30-seller-sdk/dbt-artifacts/optimization/';
const files=['cli.mjs','cli.py','engine.py','server.py','ui/index.html','ui/app.js','ui/style.css'];
export function optimizationApplication(common=[]){return {...dbtApplication(common),id:'dbt-optimization',command:'dbt-optimize',title:'dbt run optimization',requiredSource:ROOT+'cli.mjs',description:'Compare retained run timing, review workload and dependency paths, save improvement plans, and receive the complete editable project.'};}
export async function prepareOptimization(settings,context){
 const original=await prepareDbtApplication(settings,context);
 const runtime=await inspectMerchantRuntime(resolve(context.runtimeDirectory),{load:false,source:false});
 for(const file of files)original.inputs.push(await context.inputPath(join(runtime.sourceRoot,ROOT+file),'file'));
 return original;
}
export async function optimizationStartup(request,text){
 if(request.command!=='dbt-optimize')return null;
 const original=await dbtStartup({...request,command:'dbt-project'},text);
 return original?{...original,url:new URL('/optimization/',original.url).href}:null;
}
export default {schema:APPLICATION_PROVIDER_SCHEMA,id:'dbt-optimization',order:414,
 catalog({common}){return [optimizationApplication(common)];},
 prepare(type,settings,context){return prepareOptimization(settings,context);},
 matchRequest(request){return !request.pythonCommand&&request.command==='dbt-optimize';},
 createObserver(request,directory){return observeApplicationStartup(request,directory,text=>text.startsWith('{')&&text.includes('"schema":"stellar-forge.dbt-workspace-startup.v1"')?()=>optimizationStartup(request,text):null);}
};
