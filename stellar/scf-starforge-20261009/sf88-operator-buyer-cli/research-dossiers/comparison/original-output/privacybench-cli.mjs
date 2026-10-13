// SPDX-License-Identifier: MIT
// Installed provider intake; no evaluator or native dossier write is dispatched here.
import {parseArgs} from 'node:util';
import {resolve,dirname,basename} from 'node:path';
import {pathToFileURL} from 'node:url';
import {createHash} from 'node:crypto';
import {retain} from './prepare.mjs';
import {privacyBenchCatalog,privacyBenchCriteria,privacyBenchTable,privacyBenchUtf8,privacyBenchImplementation,
 readPrivacyBenchFile,preparePrivacyBench} from './privacybench.mjs';
const need=(ok,code)=>{if(!ok)throw Object.assign(new Error(code),{code});};
const output=x=>Buffer.from(JSON.stringify(x,null,2)+'\n');
const usage='Research comparison privacybench\n  catalog [--out FILE]\n  profile --results ORIGINAL_RESULTS.json --dataset ID --dataset-revision REVISION --cohort REF [--out FILE]\n  prepare --selection COMPLETE_SELECTION.json --directory PRIVATE_OUTPUT_DIRECTORY\nProfile and prepare retain original producer quantities; they never run an evaluator or write a comparison. Prepare requires the complete explicitly selected protocol, candidate, run and original file identities. Import the resulting plan/files through the maintained original-output desk or original comparison request.\n';
export async function main(argv=process.argv.slice(2)){
 const action=argv[0];if(!action||['help','--help','-h'].includes(action)){process.stdout.write(usage);return;}
 need(['catalog','profile','prepare'].includes(action),'PRIVACYBENCH_COMMAND_INVALID');
 const allowed=action==='catalog'?['out']:action==='profile'?['results','dataset','dataset-revision','cohort','out']:['selection','directory'];
 const{values:v}=parseArgs({args:argv.slice(1),options:Object.fromEntries(allowed.map(k=>[k,{type:'string'}])),strict:true,allowPositionals:false});
 let result;
 if(action==='catalog')result=privacyBenchCatalog(await privacyBenchImplementation());
 else if(action==='profile'){
  need(v.results&&v.dataset&&v['dataset-revision']&&v.cohort,'PRIVACYBENCH_PROFILE_ARGUMENTS_REQUIRED');
  const selected=resolve(v.results),body=await readPrivacyBenchFile(selected);
  const table=privacyBenchTable(privacyBenchUtf8(body),{datasetId:v.dataset,datasetRevision:v['dataset-revision'],cohortRef:v.cohort});
  const sourceImplementation=await privacyBenchImplementation();
  result={schema:'sf88-privacybench-output-profile/v1',source:{path:selected,name:basename(selected),bytes:body.length,sha256:createHash('sha256').update(body).digest('hex')},
   providerReview:{...table.review,sourceImplementation},criteria:privacyBenchCriteria(),rows:table.rows,metricRows:table.rows.length,sourceImplementation};
 }else{
  need(v.selection&&v.directory,'PRIVACYBENCH_SELECTION_AND_DIRECTORY_REQUIRED');
  const selected=resolve(v.selection),body=await readPrivacyBenchFile(selected,4*1024*1024);
  result=await preparePrivacyBench(JSON.parse(privacyBenchUtf8(body)),{baseDirectory:dirname(selected),directory:v.directory});
 }
 if(v.out){await retain(resolve(v.out),output(result));process.stdout.write(output({file:resolve(v.out),bytes:output(result).length,sha256:createHash('sha256').update(output(result)).digest('hex')}));}
 else process.stdout.write(output(result));
}
if(process.argv[1]&&pathToFileURL(resolve(process.argv[1])).href===import.meta.url)main().catch(error=>{
 process.stderr.write(JSON.stringify({error:error.code??'PRIVACYBENCH_COMMAND_FAILED',message:error.message,details:error.details??{}})+'\n');process.exitCode=1;
});
