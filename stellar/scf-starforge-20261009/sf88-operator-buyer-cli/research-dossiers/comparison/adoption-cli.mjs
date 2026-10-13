// MIT. Operate one complete returned-comparison adoption on the original store or listener.
import {parseArgs} from 'node:util';
import {resolve} from 'node:path';
import {pathToFileURL} from 'node:url';
import {readBytes,parseJson,writeBytes,jsonBytes,need} from '../../node/store.mjs';
import {openDossierStore} from '../dossier.mjs';
import {writePortableFile} from '../portable.mjs';
import {ResearchWorkspaceClient} from '../workspace-client.mjs';
import {ADOPTION_REQUEST_LIMIT,adoptionRequest} from './adoption-contracts.mjs';
const usage='Research comparison adoption\n'+
 '  list --store DIR --id DOSSIER [--revision N --offset N --limit N]\n'+
 '  source --store DIR --id DOSSIER --source-id RETURN_SOURCE [--case-version ID --section cases|candidates|runs|judgments|decisions|sources --revision N --offset N --limit N]\n'+
 '  preview --store DIR --id DOSSIER --file ORIGINAL_REQUEST.json [--out PREPARED_REVIEW.json]\n'+
 '  review --store DIR --id DOSSIER --file PREPARED_REVIEW.json\n'+
 '  lookup --store DIR --id DOSSIER (--plan-id ID | --request-id ID) [--revision N]\n'+
 '  export --store DIR --id DOSSIER --plan-id ID --out FILE [--revision N --format json|html|source --sha256 HASH]\n'+
 '  file --store DIR --id DOSSIER --source-id ID --run ID [--artifact ID] --out FILE [--revision N --sha256 HASH]\n'+
 '  Replace --store with --connection-file FILE [--workspace-directory ORIGINAL_DIR] to use the existing authenticated listener. Receive the complete portable branch through the original dossier-return source intake first. Preview and review never generate another request ID.\n';
export async function main(argv=process.argv.slice(2)){
 const action=argv[0];if(!action||['help','--help','-h'].includes(action)){process.stdout.write(usage);return;}
 need(['list','source','preview','review','lookup','export','file'].includes(action),'ADOPTION_COMMAND_INVALID');
 const keys=['store','connection-file','workspace-directory','id','revision','offset','limit','source-id','case-version','section','file','out','plan-id','request-id','format','run','artifact','sha256'];
 const {values:v}=parseArgs({args:argv.slice(1),options:Object.fromEntries(keys.map(k=>[k,{type:'string'}])),strict:true,allowPositionals:false});
 need(Boolean(v.store)!==Boolean(v['connection-file']),'ADOPTION_CONNECTION_REQUIRED');need(v.id,'DOSSIER_ID_REQUIRED');
 const number=key=>{if(v[key]===undefined)return undefined;need(/^(0|[1-9][0-9]{0,8})$/.test(v[key]),'ADOPTION_NUMBER_INVALID');return Number(v[key]);};
 const pick=o=>Object.fromEntries(Object.entries(o).filter(([,value])=>value!==undefined));
 const revision=number('revision'),paging=pick({revision,offset:number('offset'),limit:number('limit')});
 const abort=new AbortController(),stop=()=>abort.abort();let client,api;
 process.once('SIGINT',stop);process.once('SIGTERM',stop);
 try{
  if(v.store){need(!v['workspace-directory'],'ADOPTION_ARGUMENT_INVALID');api=await openDossierStore(resolve(v.store));}
  else{client=ResearchWorkspaceClient.fromFile(resolve(v['connection-file']),v['workspace-directory']?{directory:resolve(v['workspace-directory'])}:{});api=client;}
  const signal=client?{signal:abort.signal}:{};
  let result;
  if(action==='list')result=await api.comparisonAdoptions(v.id,{...paging,...signal});
  else if(action==='source'){
   need(v['source-id'],'ADOPTION_SOURCE_REQUIRED');
   result=await api.comparisonAdoptionSource(v.id,{...paging,...pick({sourceId:v['source-id'],caseVersionId:v['case-version'],section:v.section}),...signal});
  }else if(action==='lookup'){
   need(Boolean(v['plan-id'])!==Boolean(v['request-id']),'ADOPTION_LOOKUP_REQUIRED');
   result=await api.comparisonAdoption(v.id,{...pick({planId:v['plan-id'],requestId:v['request-id'],revision}),...signal});
  }else if(action==='preview'||action==='review'){
   need(v.file&&v.revision===undefined,'ADOPTION_ORIGINAL_REQUEST_REQUIRED');
   const input=parseJson(await readBytes(resolve(v.file),ADOPTION_REQUEST_LIMIT));
   if(action==='preview'){
    const request=adoptionRequest(input);
    result=await api.previewComparisonAdoption(v.id,request,signal);
    if(v.out){
     need(result.eligible,'ADOPTION_PREVIEW_NOT_READY');
     const prepared={...request,previewSha256:result.previewSha256};
     await writeBytes(resolve(v.out),jsonBytes(prepared),{exclusive:true});
     result={...result,preparedRequestFile:resolve(v.out)};
    }
   }else result=await api.reviewComparisonAdoption(v.id,input,signal);
  }else{
   need(v.out,'ADOPTION_OUTPUT_REQUIRED');
   const selected=action==='export'?pick({planId:v['plan-id'],revision,format:v.format??'json'}):pick({sourceId:v['source-id'],runId:v.run,artifactId:v.artifact,revision});
   const method=action==='export'?'exportComparisonAdoption':'comparisonAdoptionFile';
   if(client)result=await api[method](v.id,{...selected,file:resolve(v.out),...pick({expectedSha256:v.sha256}),...signal});
   else{
    const original=await api[method](v.id,selected),saved=await writePortableFile(resolve(v.out),{...original,body:original.stream??original.body});
    result={...saved,revision:original.revision};
    if(v.sha256!==undefined&&result.sha256!==v.sha256){const error=Error('The complete retained download differs from the selected SHA-256.');Object.assign(error,{code:'ADOPTION_EXPORTED_FILE_CHANGED',destinationPublished:true,file:result});throw error;}
   }
  }
  process.stdout.write(jsonBytes(result));
 }finally{
  process.removeListener('SIGINT',stop);process.removeListener('SIGTERM',stop);if(client)await client.close();
 }
}
if(process.argv[1]&&pathToFileURL(resolve(process.argv[1])).href===import.meta.url)main().catch(error=>{
 process.stderr.write(JSON.stringify({error:error.code??'ADOPTION_COMMAND_FAILED',outcomeUnknown:error.outcomeUnknown??false,
  ...(error.requestId?{requestId:error.requestId}:{}),...(error.details===undefined?{}:{details:error.details}),
  ...(error.destinationPublished?{destinationPublished:true,file:error.file}:{}),...(error.recovery?{recovery:error.recovery}:{})})+'\n');process.exitCode=1;
});
