// MIT. Complete local or attached comparison commands; the caller supplies the original saved request.
import {parseArgs} from 'node:util';
import {resolve} from 'node:path';
import {pathToFileURL} from 'node:url';
import {readBytes,parseJson,writeBytes,jsonBytes,need} from '../../node/store.mjs';
import {openDossierStore} from '../dossier.mjs';
import {ResearchWorkspaceClient} from '../workspace-client.mjs';
const usage='Research comparison\n  adoption list|source|preview|review|lookup|export|file [OPTIONS]\n  comparison read|report --store DIR --id DOSSIER [--case ID --case-version ID --revision N --section SECTION --offset N --limit N]\n  comparison review --store DIR --id DOSSIER --file ORIGINAL_REQUEST.json\n  comparison export --store DIR --id DOSSIER --case ID --format json|html|csv --out FILE [--revision N --case-version ID]\n  comparison file --store DIR --id DOSSIER --run ID [--artifact ID] --out FILE [--revision N]\n  Use --connection-file FILE [--workspace-directory ORIGINAL_DIR] instead of --store to attach the existing authenticated listener. Review replays the exact saved request; a failed transport never creates another request.\n';
export async function main(argv=process.argv.slice(2)){
 const action=argv[0];if(action==='adoption')return(await import('./adoption-cli.mjs')).main(argv.slice(1));if(!action||['help','--help','-h'].includes(action)){process.stdout.write(usage);return;}
 need(['read','review','report','export','file'].includes(action),'COMPARISON_COMMAND_INVALID');
 const keys=['store','connection-file','workspace-directory','id','case','case-version','revision','section','offset','limit','file','out','format','run','artifact'];
 const {values:v}=parseArgs({args:argv.slice(1),options:Object.fromEntries(keys.map(k=>[k,{type:'string'}])),strict:true,allowPositionals:false});
 need(Boolean(v.store)!==Boolean(v['connection-file']),'COMPARISON_CONNECTION_REQUIRED');need(v.id,'DOSSIER_ID_REQUIRED');
 const integer=(key)=>{if(v[key]===undefined)return undefined;need(/^(0|[1-9][0-9]{0,8})$/.test(v[key]),'COMPARISON_NUMBER_INVALID');return Number(v[key]);};
 const selected=Object.fromEntries(Object.entries({revision:integer('revision'),caseId:v.case,caseVersionId:v['case-version']}).filter(([,x])=>x!==undefined));
 let client,api;
 const abort=new AbortController(),stop=()=>abort.abort();process.once('SIGINT',stop);process.once('SIGTERM',stop);
 try{
  if(v.store){need(!v['workspace-directory'],'COMPARISON_ARGUMENT_INVALID');api=await openDossierStore(resolve(v.store));}
  else{client=ResearchWorkspaceClient.fromFile(resolve(v['connection-file']),v['workspace-directory']?{directory:resolve(v['workspace-directory'])}:{});api=client;}
  let result;
  if(action==='read')result=await api.comparison(v.id,{...selected,...(v.section?{section:v.section}:{}),...(v.offset!==undefined?{offset:integer('offset')}:{}),...(v.limit!==undefined?{limit:integer('limit')}:{}),...(client?{signal:abort.signal}:{})});
  else if(action==='report')result=await api.comparisonReport(v.id,{...selected,...(client?{signal:abort.signal}:{})});
  else if(action==='review'){
   need(v.file&&!v.revision,'COMPARISON_ORIGINAL_REQUEST_REQUIRED');
   const input=parseJson(await readBytes(resolve(v.file),128*1024*1024+65536));
   result=client?await api.reviewComparison(v.id,input,{signal:abort.signal}):await api.reviewComparison(v.id,{...input,projection:'metadata'});
  }else{
   need(v.out,'COMPARISON_OUTPUT_REQUIRED');const file=resolve(v.out);
   if(action==='export')result=client?await api.exportCaseComparison(v.id,{...selected,format:v.format??'json',file,signal:abort.signal}):await api.exportComparison(v.id,{...selected,format:v.format??'json'});
   else result=client?await api.comparisonFile(v.id,{revision:selected.revision,runId:v.run,artifactId:v.artifact,file,signal:abort.signal}):await api.comparisonFile(v.id,{revision:selected.revision,runId:v.run,artifactId:v.artifact});
   if(!client){const {body,...metadata}=result;await writeBytes(file,body,{exclusive:true});result={...metadata,file};}
  }
  process.stdout.write(jsonBytes(result));
 }finally{
  process.removeListener('SIGINT',stop);process.removeListener('SIGTERM',stop);if(client)await client.close();
 }
}
if(process.argv[1]&&pathToFileURL(resolve(process.argv[1])).href===import.meta.url)main().catch(error=>{process.stderr.write(JSON.stringify({error:error.code??'COMPARISON_COMMAND_FAILED',outcomeUnknown:error.outcomeUnknown??false})+'\n');process.exitCode=1;});
