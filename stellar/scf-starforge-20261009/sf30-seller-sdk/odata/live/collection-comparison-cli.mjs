// MIT. Complete original OData comparison and receiving on the existing workspace.
import { constants } from 'node:fs';
import { open,lstat,realpath,link,unlink } from 'node:fs/promises';
import { randomUUID } from 'node:crypto';
import { dirname,resolve } from 'node:path';
import { pathToFileURL } from 'node:url';
import { readRequestFile } from '../../../sf88-operator-buyer-cli/request-body.mjs';
import { readJson } from './client.mjs';
import { json } from './config.mjs';
import { createCollectionComparison,openCollectionComparison,readComparisonRows,reviewCollectionComparison,
  publishCollectionComparison,restoreCollectionComparison,comparisonAnalysisMapping,comparisonRetainedFiles } from './collection-comparison.mjs';

const HELP='Complete OData collection comparison\n\n'+
  'create --before DIRECTORY --after DIRECTORY --before-sha256 SHA --after-sha256 SHA --title TITLE --out PRIVATE_DIRECTORY [--fields A,B]\n'+
  'create --workspace DIRECTORY --service ID --id ID --before COLLECTION --after COLLECTION --before-sha256 SHA --after-sha256 SHA --title TITLE [--fields A,B]\n'+
  'list --workspace DIRECTORY --service ID\n'+
  'inspect --directory DIRECTORY [--replay true]\n'+
  'inspect --workspace DIRECTORY --service ID --id ID\n'+
  'rows --directory DIRECTORY [--kind cells|entities --status changed|unchanged|before_only|after_only --offset 0 --limit 100]\n'+
  'review --directory DIRECTORY --input ORIGINAL_REVIEW.json\n'+
  'publish --directory DIRECTORY --revision INTEGER\n'+
  'restore --manifest ORIGINAL_ANALYSIS_SOURCE.json --sha256 SHA --out PRIVATE_DIRECTORY\n'+
  'restore --workspace DIRECTORY --service ID --id ID --manifest ORIGINAL_ANALYSIS_SOURCE.json --sha256 SHA\n'+
  'files --directory DIRECTORY\n'+
  'analysis-mapping --source REGISTERED_NAME --revision INTEGER --out mapping.json\n\n'+
  'rows, review, publish and files also accept --workspace DIRECTORY --service ID --id ID instead of --directory.\n'+
  'The installed odata-live command uses comparison-create, comparison-inspect, comparison-list,\n'+
  'comparison-rows, comparison-review, comparison-publish, comparison-restore, comparison-files\n'+
  'and comparison-analysis-mapping. A comparison keeps both complete original collection inputs.\n'+
  'A source.json transfer includes every declared relative file. Use the original workspace backup\n'+
  'to transfer the service, collections, comparisons, review histories and every published edition together.\n'+
  'Review JSON is {requestId,expectedRevision,scope,entityKey?,field?,status,actor,note}.\n'+
  'Retain the same requestId and decision when retrying an interrupted review save.\n';
function parse(args){
  const [command,...rest]=args,options={};
  for(let index=0;index<rest.length;index+=2){
    const name=rest[index],value=rest[index+1];
    if(typeof name!=='string'||!name.startsWith('--')||Object.hasOwn(options,name.slice(2))||typeof value!=='string'||!value||value.startsWith('--'))
      throw new TypeError('Each named comparison option requires exactly one value.');
    options[name.slice(2)]=value;
  }return {command,options};
}
function required(options,name){if(!options[name])throw new TypeError('--'+name+' is required.');return options[name];}
function only(options,names){for(const name of Object.keys(options))if(!names.includes(name))throw new TypeError('Unsupported comparison option --'+name+'.');}
function integer(value,name,fallback){
  if(value===undefined)return fallback;
  if(!/^(?:0|[1-9][0-9]*)$/.test(value)||!Number.isSafeInteger(Number(value)))throw new TypeError('Choose an explicit nonnegative integer for --'+name+'.');
  return Number(value);
}
function boolean(value,name,fallback=false){
  if(value===undefined)return fallback;
  if(!['true','false'].includes(value))throw new TypeError('Choose true or false for --'+name+'.');return value==='true';
}
function fields(value){if(value===undefined)return undefined;
  const result=value.split(',').map(field=>field.trim());
  if(result.some(field=>!field)||new Set(result).size!==result.length)throw new TypeError('Select distinct original field names separated by commas.');return result;}
function compact(value){
  const {directory,schema,status,manifestSha256,selection,counts,analysisProjection,reviews,analysis,restoredFrom,reused,id,sourceCollections}=value;
  return {schema,status,...(id?{id}:{}),directory,manifestSha256,selection,counts,analysisProjection,
    reviews,analysis,...(sourceCollections?{sourceCollections}:{}),...(restoredFrom?{restoredFrom}:{}),...(reused!==undefined?{reused}:{})};
}
async function writeMapping(path,value){
  const target=resolve(path),parent=dirname(target),info=await lstat(parent);
  if(!info.isDirectory()||info.isSymbolicLink()||(info.mode&0o077)!==0||await realpath(parent)!==parent||
    typeof process.getuid==='function'&&info.uid!==process.getuid())throw new TypeError('Choose an owned private output directory.');
  const raw=Buffer.from(json(value)),temporary=target+'.comparison-'+randomUUID()+'.partial';
  const fd=await open(temporary,constants.O_WRONLY|constants.O_CREAT|constants.O_EXCL|constants.O_NOFOLLOW,0o600);
  try{
    await fd.writeFile(raw);await fd.sync();await fd.close();
    try{await link(temporary,target);}catch(error){
      if(error.code!=='EEXIST')throw error;
      if(!(await readRequestFile(target,1048576,{privateFile:true})).equals(raw))throw new TypeError('The existing mapping selects another original source or revision.');
    }
    const directory=await open(parent,constants.O_RDONLY|constants.O_DIRECTORY);try{await directory.sync();}finally{await directory.close();}
  }finally{await fd.close().catch(()=>{});await unlink(temporary).catch(error=>{if(error.code!=='ENOENT')throw error;});}
  return {path:target,source:value.source,sourceRevision:value.source_revision,columns:value.mapping.columns.length};
}
async function originalWorkspace(options,operation){
  const {openODataWorkspace}=await import('../workspace.mjs'),{openODataLiveOperations}=await import('../live-operations.mjs');
  const workspace=await openODataWorkspace({directory:resolve(required(options,'workspace'))});let live;
  try{live=await openODataLiveOperations({workspace});return await operation(live);}
  finally{try{await live?.close();}finally{await workspace.close();}}
}
export async function main(args=process.argv.slice(2)){
  if(!args.length||args.includes('--help')){process.stdout.write(HELP);return;}
  const {command,options:o}=parse(args),shared=['workspace','service','id'],standalone=['directory'];
  const inWorkspace=Object.hasOwn(o,'workspace');
  if(inWorkspace&&o.directory)throw new TypeError('Select the original workspace or one comparison directory.');
  const selector=inWorkspace?shared:standalone;
  const reference=()=>({id:required(o,'service'),comparisonId:required(o,'id')});let result;
  if(command==='create'){
    only(o,[...(inWorkspace?shared:['before','after','out']),'before','after','before-sha256','after-sha256','title','fields',
      'max-input-bytes','max-output-bytes','max-cells']);
    const limits=Object.fromEntries([['max-input-bytes','maxInputBytes'],['max-output-bytes','maxOutputBytes'],['max-cells','maxCells']]
      .filter(([name])=>o[name]!==undefined).map(([name,key])=>[key,integer(o[name],name)]));
    const input={expectedBeforeSha256:required(o,'before-sha256'),expectedAfterSha256:required(o,'after-sha256'),
      title:required(o,'title'),fields:fields(o.fields),...(Object.keys(limits).length?{limits}:{})};
    result=inWorkspace?await originalWorkspace(o,live=>live.compareCollections({...reference(),...input,
      beforeCollectionId:required(o,'before'),afterCollectionId:required(o,'after')})):
      await createCollectionComparison({...input,beforeDirectory:resolve(required(o,'before')),afterDirectory:resolve(required(o,'after')),directory:resolve(required(o,'out'))});
    result=compact(result);
  }else if(command==='list'){
    only(o,['workspace','service']);result=await originalWorkspace(o,live=>live.comparisons({id:required(o,'service')}));
  }else if(command==='inspect'){
    only(o,[...selector,...(inWorkspace?[]:['replay'])]);
    result=compact(inWorkspace?await originalWorkspace(o,live=>live.comparison(reference())):
      await openCollectionComparison(resolve(required(o,'directory')),{replay:boolean(o.replay,'replay')}));
  }else if(command==='rows'){
    only(o,[...selector,'kind','status','offset','limit']);
    const options={kind:o.kind??'cells',offset:integer(o.offset,'offset',0),limit:integer(o.limit,'limit',100),...(o.status?{status:o.status}:{})};
    result=inWorkspace?await originalWorkspace(o,live=>live.comparisonRows({...reference(),...options})):
      await readComparisonRows(resolve(required(o,'directory')),options);
  }else if(command==='review'){
    only(o,[...selector,'input']);const input=await readJson(resolve(required(o,'input')),1048576);
    if(!input||typeof input!=='object'||Array.isArray(input)||Object.keys(input).some(key=>!['requestId','expectedRevision','scope','entityKey','field','status','actor','note'].includes(key)))
      throw new TypeError('Select the original review request body with no workspace-routing fields.');
    result=inWorkspace?await originalWorkspace(o,live=>live.reviewComparison({...reference(),...input})):
      await reviewCollectionComparison(resolve(required(o,'directory')),input);
  }else if(command==='publish'){
    only(o,[...selector,'revision']);const input={expectedRevision:integer(required(o,'revision'),'revision')};
    result=inWorkspace?await originalWorkspace(o,live=>live.publishComparison({...reference(),...input})):
      await publishCollectionComparison(resolve(required(o,'directory')),input);
  }else if(command==='restore'){
    only(o,[...(inWorkspace?shared:['out']),'manifest','sha256']);
    const input={sourceManifest:resolve(required(o,'manifest')),expectedSha256:required(o,'sha256')};
    result=compact(inWorkspace?await originalWorkspace(o,live=>live.restoreComparison({...reference(),...input})):
      await restoreCollectionComparison({...input,directory:resolve(required(o,'out'))}));
  }else if(command==='files'){
    only(o,selector);
    if(inWorkspace){const value=await originalWorkspace(o,live=>live.comparison(reference()));
      result={comparisonSha256:value.manifestSha256,reviewRevision:value.reviews.revision,files:value.retainedFiles};}
    else{const retained=await comparisonRetainedFiles(resolve(required(o,'directory')));
      result={comparisonSha256:retained.comparison.manifestSha256,reviewRevision:retained.comparison.reviews.revision,files:retained.files};}
  }else if(command==='analysis-mapping'){
    only(o,['source','revision','out']);result=await writeMapping(required(o,'out'),comparisonAnalysisMapping(required(o,'source'),integer(required(o,'revision'),'revision')));
  }else throw new TypeError('Unknown comparison command. Use --help.');
  process.stdout.write(json(result));return result;
}
if(process.argv[1]&&import.meta.url===pathToFileURL(resolve(process.argv[1])).href)
  main().catch(error=>{process.stderr.write(json({error:error.code??'ODATA_COMPARISON_COMMAND_FAILED',message:error.message}));process.exitCode=1;});
