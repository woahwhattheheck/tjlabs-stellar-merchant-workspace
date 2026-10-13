#!/usr/bin/env node
// MIT. Complete remote subscriber receiving through the original native product.
import {resolve} from 'node:path';
import {pathToFileURL} from 'node:url';
import {
 inspectMerchantODataSubscriptions,inspectMerchantODataSubscriptionPublisher,listMerchantODataSubscriptionEditions,
 readMerchantODataSubscriptionRows,listMerchantODataSubscriptionArtifacts,inspectMerchantODataSubscriptionArtifact,
 createMerchantODataSubscriptionDelivery,downloadMerchantODataSubscriptionArtifact,inspectODataSubscriptionDownload,
 receiveODataSubscriptionDownload,fetchODataSubscription,inspectReceivedODataSubscription,readReceivedODataSubscriptionRows,
 backupReceivedODataSubscription,exportReceivedODataSubscription,restoreODataSubscriptionCustomer,
 receivedODataSubscriptionAnalysisMapping
} from './odata-subscription-client.mjs';

const HELP=[
 'OData subscription customer',
 '',
 'Remote discovery and selection:',
 'status --url URL',
 'publisher --url URL --publisher ALIAS',
 'editions --url URL --publisher ALIAS [--offset 0 --limit 50]',
 'publisher-rows --url URL --publisher ALIAS --revision N [--kind rows|changes --edition-sha256 SHA --offset 0 --limit 50]',
 'artifacts --url URL [--offset 0 --limit 50]',
 'artifact --url URL --artifact ALIAS [--sha256 NATIVE_MANIFEST_SHA]',
 'delivery --url URL --publisher ALIAS --artifact ALIAS --from N --to N --edition-sha256 SHA [--from-edition-sha256 SHA]',
 '',
 'Complete retained transfer and native receiving:',
 'download --url URL --artifact ALIAS --sha256 NATIVE_MANIFEST_SHA --out DOWNLOAD_DIRECTORY',
 'fetch --url URL --publisher ALIAS --artifact ALIAS --from N --to N --edition-sha256 SHA [--from-edition-sha256 SHA] --download DOWNLOAD_DIRECTORY --out CUSTOMER_DIRECTORY',
 'verify-download --directory DOWNLOAD_DIRECTORY [--sha256 NATIVE_MANIFEST_SHA]',
 'receive --download DOWNLOAD_DIRECTORY --sha256 NATIVE_MANIFEST_SHA --out CUSTOMER_DIRECTORY',
 '',
 'Local customer operation:',
 'inspect --directory CUSTOMER_DIRECTORY',
 'rows --directory CUSTOMER_DIRECTORY [--offset 0 --limit 100]',
 'backup --directory CUSTOMER_DIRECTORY --revision N --edition-sha256 SHA --out BACKUP_DIRECTORY',
 'export --directory CUSTOMER_DIRECTORY --revision N --edition-sha256 SHA --out ANALYSIS_DIRECTORY [--title TEXT]',
 'restore --source-directory NATIVE_DIRECTORY --kind customer-backup|analysis --sha256 NATIVE_MANIFEST_SHA --out CUSTOMER_DIRECTORY',
 'analysis-mapping --directory CUSTOMER_DIRECTORY --source REGISTERED_ALIAS --source-revision N',
 '',
 'Remote commands accept --token-env MCP_ACCESS_TOKEN (default). Keep the bearer in that environment variable.',
 'download and fetch accept --chunk-size 196608 and --progress true|false. Repeat the exact command and directories to resume.',
 '--from 0 selects a complete baseline at --to. Positive --from also requires its exact --from-edition-sha256.',
 'A positive starting edition must equal the receiving customer; use a separate empty customer to reopen an older baseline.',
 'Choose a stable artifact alias for each complete selection; repeat it after a lost response.',
 'Source/download and customer/export directories must be separate. The original native files stay unchanged.',
 'All results are JSON on stdout; progress and errors use stderr. Remote pages have a maximum of 100 items.',
 'Analysis source revision is the actual source registration revision, independently of the subscription edition.',
 ''
].join('\n');
function parse(args){
 const [command,...values]=args,options={};
 for(let i=0;i<values.length;i+=2){
  const name=values[i],value=values[i+1];
  if(typeof name!=='string'||!/^--[a-z][a-z-]*$/.test(name)||Object.hasOwn(options,name.slice(2))||
     typeof value!=='string'||!value||value.startsWith('--'))throw new TypeError('Each option requires one value and may appear once. Use --help.');
  options[name.slice(2)]=value;
 }
 return {command,options};
}
function only(input,names){if(Object.keys(input).some(key=>!names.includes(key)))throw new TypeError('Unknown option for this command. Use --help.');}
function required(input,name){if(!input[name])throw new TypeError('--'+name+' is required.');return input[name];}
function integer(value,fallback){
 if(value===undefined)return fallback;
 if(!/^(?:0|[1-9][0-9]*)$/.test(value)||!Number.isSafeInteger(Number(value)))throw new TypeError('Use an explicit nonnegative integer.');
 return Number(value);
}
const REMOTE=['url','token-env'],PAGING=['offset','limit'];
const DELIVERY=['publisher','artifact','from','to','edition-sha256','from-edition-sha256'];
const write=value=>process.stdout.write(JSON.stringify(value,null,2)+'\n');
const path=(input,name)=>resolve(required(input,name));
const page=input=>({offset:integer(input.offset,0),limit:integer(input.limit,50)});
const selectedDelivery=input=>({publisher:required(input,'publisher'),artifact:required(input,'artifact'),
 fromRevision:integer(required(input,'from')),toRevision:integer(required(input,'to')),
 expectedEditionSha256:required(input,'edition-sha256'),expectedFromEditionSha256:input['from-edition-sha256']});
const selectedCustomer=input=>({directory:path(input,'directory'),output:path(input,'out'),
 expectedRevision:integer(required(input,'revision')),expectedEditionSha256:required(input,'edition-sha256')});
function transferOptions(input){
 if(input.progress!==undefined&&!['true','false'].includes(input.progress))throw new TypeError('--progress requires true or false.');
 return {chunkSize:integer(input['chunk-size'],196608),...(input.progress==='true'?{onProgress:event=>{
  process.stderr.write(JSON.stringify({schema:'stellar-forge.odata-subscription-progress.v1',...event})+'\n');
 }}:{})};
}
export async function main(args=process.argv.slice(2)){
 if(!args.length||args.includes('--help')){process.stdout.write(HELP);return;}
 const {command,options:input}=parse(args),controller=new AbortController();
 const abort=()=>controller.abort(new Error('Customer transfer interrupted; repeat the original command to resume.'));
 process.once('SIGINT',abort);process.once('SIGTERM',abort);
 const remote=()=>({url:required(input,'url'),tokenEnv:input['token-env']??'MCP_ACCESS_TOKEN',signal:controller.signal});
 try{
  let result;
  if(command==='status'){
   only(input,REMOTE);result=await inspectMerchantODataSubscriptions(remote());
  }else if(command==='publisher'){
   only(input,[...REMOTE,'publisher']);result=await inspectMerchantODataSubscriptionPublisher({...remote(),publisher:required(input,'publisher')});
  }else if(command==='editions'){
   only(input,[...REMOTE,'publisher',...PAGING]);result=await listMerchantODataSubscriptionEditions({...remote(),publisher:required(input,'publisher'),...page(input)});
  }else if(command==='publisher-rows'){
   only(input,[...REMOTE,'publisher','revision','kind','edition-sha256',...PAGING]);
   result=await readMerchantODataSubscriptionRows({...remote(),publisher:required(input,'publisher'),revision:integer(required(input,'revision')),
    kind:input.kind??'rows',expectedEditionSha256:input['edition-sha256'],...page(input)});
  }else if(command==='artifacts'){
   only(input,[...REMOTE,...PAGING]);result=await listMerchantODataSubscriptionArtifacts({...remote(),...page(input)});
  }else if(command==='artifact'){
   only(input,[...REMOTE,'artifact','sha256']);result=await inspectMerchantODataSubscriptionArtifact({...remote(),artifact:required(input,'artifact'),expectedSha256:input.sha256});
  }else if(command==='delivery'){
   only(input,[...REMOTE,...DELIVERY]);result=await createMerchantODataSubscriptionDelivery({...remote(),...selectedDelivery(input)});
  }else if(command==='download'){
   only(input,[...REMOTE,'artifact','sha256','out','chunk-size','progress']);
   result=await downloadMerchantODataSubscriptionArtifact({...remote(),artifact:required(input,'artifact'),expectedSha256:required(input,'sha256'),
    directory:path(input,'out'),...transferOptions(input)});
  }else if(command==='fetch'){
   only(input,[...REMOTE,...DELIVERY,'download','out','chunk-size','progress']);
   result=await fetchODataSubscription({...remote(),...selectedDelivery(input),directory:path(input,'download'),
    customerDirectory:path(input,'out'),...transferOptions(input)});
  }else if(command==='verify-download'){
   only(input,['directory','sha256']);result=await inspectODataSubscriptionDownload({directory:path(input,'directory'),expectedSha256:input.sha256,signal:controller.signal});
  }else if(command==='receive'){
   only(input,['download','sha256','out']);result=await receiveODataSubscriptionDownload({directory:path(input,'download'),
    customerDirectory:path(input,'out'),expectedSha256:required(input,'sha256'),signal:controller.signal});
  }else if(command==='inspect'){
   only(input,['directory']);result=await inspectReceivedODataSubscription({directory:path(input,'directory')});
  }else if(command==='rows'){
   only(input,['directory',...PAGING]);result=await readReceivedODataSubscriptionRows({directory:path(input,'directory'),
    offset:integer(input.offset,0),limit:integer(input.limit,100)});
  }else if(command==='backup'){
   only(input,['directory','revision','edition-sha256','out']);result=await backupReceivedODataSubscription(selectedCustomer(input));
  }else if(command==='export'){
   only(input,['directory','revision','edition-sha256','out','title']);result=await exportReceivedODataSubscription({...selectedCustomer(input),title:input.title});
  }else if(command==='restore'){
   only(input,['source-directory','kind','sha256','out']);result=await restoreODataSubscriptionCustomer({sourceDirectory:path(input,'source-directory'),
    customerDirectory:path(input,'out'),kind:required(input,'kind'),expectedSha256:required(input,'sha256'),signal:controller.signal});
  }else if(command==='analysis-mapping'){
   only(input,['directory','source','source-revision']);result=await receivedODataSubscriptionAnalysisMapping({directory:path(input,'directory'),
    source:required(input,'source'),sourceRevision:integer(required(input,'source-revision'))});
  }else throw new TypeError('Unknown OData subscription customer command. Use --help.');
  write(result);return result;
 }finally{process.removeListener('SIGINT',abort);process.removeListener('SIGTERM',abort);}
}
if(process.argv[1]&&import.meta.url===pathToFileURL(resolve(process.argv[1])).href)main().catch(error=>{
 const result={error:typeof error.code==='string'?error.code:'ODATA_SUBSCRIPTION_CUSTOMER_FAILED',message:error.message};
 for(const key of ['applied','outcomeUnknown','reopenRequired','commitUncertainty','status'])if(error[key]!==undefined)result[key]=error[key];
 process.stderr.write(JSON.stringify(result)+'\n');process.exitCode=1;
});
