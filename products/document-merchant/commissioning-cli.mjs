#!/usr/bin/env node
// MIT. Commission and run document jobs from one retained original commerce selection.
import {resolve,dirname} from 'node:path';
import {fileURLToPath} from 'node:url';
import {realpathSync} from 'node:fs';
import {absolute,ownedDirectory,writeExact,encoded,digest}
  from '../../stellar/scf-starforge-20261009/sf101-merchant-receiver/api-application/workspace/configuration.mjs';
import {acquireStateLease} from '../../stellar/scf-starforge-20261009/merchant-fleet-gateway/state-lease.mjs';
import {inspectCommerceSetup} from '../../stellar/scf-starforge-20261009/sf66-demo-launcher/commerce-setup.mjs';
import {reviewDocumentCommissioning,prepareDocumentCommissioning,inspectDocumentCommissioning,
  openCommissionedDocumentService} from './commissioning.mjs';
import {documentError} from './contracts.mjs';
const HELP=[
  'Document merchant commissioning from original commerce','',
  '  document-merchant commission offers --commerce-directory DIR [--out FILE]',
  '  document-merchant commission review|prepare --commerce-directory DIR --directory DIR --intent ID',
  '       --provider mintpdf|snaplab|pdfmint [--anonymous]',
  '       (--customer-options FILE | --customer-directory DIR)',
  '       [--seller-port N] [--customer-port N] [--operator-port N] [--operations-port N]',
  '       [--expected-selection SHA] [--out FILE]',
  '  document-merchant commission inspect --directory DIR [--out FILE]',
  '  document-merchant commission serve --directory DIR [--expected-selection SHA]','',
  'offers and review read the retained original source without starting a payment or renderer.',
  'prepare creates or resumes the same original document setup and complete customer options.',
  'serve owns the original Jobs service and drains its original facilitator after accepted work.',
  'Keep the original operator/signers in their selected environment and route the actual HTTPS origin.',
  'Use case-document-options.json with the existing saved-case PDF workflow, or customer-options.json',
  'with the installed batch/Document production customer. See COMMISSIONING.md.'
].join('\n');
function fail(message){throw documentError('DOCUMENT_COMMISSION_COMMAND_INVALID',message);}
function parse(argv){
  const [command,...tail]=argv;
  if(!command||['--help','-h','help'].includes(command)){if(tail.length)fail('Help takes no options.');return {command:'help'};}
  const byCommand={
    offers:['commerce-directory','out'],
    review:['commerce-directory','directory','intent','provider','anonymous','customer-options','customer-directory',
      'seller-port','customer-port','operator-port','operations-port','out'],
    prepare:['commerce-directory','directory','intent','provider','anonymous','customer-options','customer-directory',
      'seller-port','customer-port','operator-port','operations-port','expected-selection','out'],
    inspect:['directory','out'],serve:['directory','expected-selection']
  };
  if(!byCommand[command])fail('Choose offers, review, prepare, inspect or serve.');
  const options={};
  for(let i=0;i<tail.length;i++){
    const flag=tail[i],name=flag?.startsWith('--')?flag.slice(2):'';
    if(!byCommand[command].includes(name)||Object.hasOwn(options,name))fail('Unknown or repeated option: '+flag);
    if(name==='anonymous'){options[name]=true;continue;}
    const value=tail[++i];if(!value||value.startsWith('--'))fail('Supply a value for '+flag+'.');
    options[name]=value;
  }
  const required=command==='offers'?['commerce-directory']:['directory',
    ...(['review','prepare'].includes(command)?['commerce-directory','intent','provider']:[])];
  for(const name of required)if(!options[name])fail('Supply --'+name+'.');
  if(options['expected-selection']&&!/^[a-f0-9]{64}$/.test(options['expected-selection']))fail('Supply the complete selected SHA256.');
  return {command,options};
}
function input(options){
  const value={commerceDirectory:absolute(resolve(options['commerce-directory'])),
    directory:absolute(resolve(options.directory)),intentId:options.intent,provider:options.provider,
    anonymous:options.anonymous===true};
  if(Boolean(options['customer-options'])===Boolean(options['customer-directory']))
    fail('Select one complete --customer-options FILE or the original --customer-directory DIR.');
  for(const [flag,key] of [['customer-options','customerOptionsFile'],['customer-directory','customerDirectory']])
    if(options[flag])value[key]=absolute(resolve(options[flag]));
  for(const [flag,key] of [['seller-port','sellerPort'],['customer-port','customerPort'],
    ['operator-port','operatorPort'],['operations-port','operationsPort']]){
    if(options[flag]===undefined)continue;
    if(!/^(0|[1-9][0-9]*)$/.test(options[flag])||Number(options[flag])>65535)fail('--'+flag+' needs a port from 0 to 65535.');
    value[key]=Number(options[flag]);
  }
  return value;
}
async function save(file,value){
  file=absolute(resolve(file));await ownedDirectory(dirname(file),{create:true});
  const lease=await acquireStateLease(dirname(file)),bytes=encoded(value);
  try{lease.assertHeld();await writeExact(file,bytes);return {path:file,bytes:bytes.length,sha256:digest(bytes)};}
  finally{await lease.close();}
}
export async function runDocumentCommissioningCommand(argv=process.argv.slice(2),{
  print=value=>console.log(value),environment=process.env,signal
}={}){
  const {command,options}=parse(argv);if(command==='help')return print(HELP);
  const emit=async value=>{const output=options.out?await save(options.out,value):value;print(JSON.stringify(output,null,2));return value;};
  if(command==='offers'){
    const source=await inspectCommerceSetup(absolute(resolve(options['commerce-directory'])));
    return emit({commerceDirectory:source.directory,operatorWorkspace:source.workspace,
      publicOrigin:source.publicOrigin,payer:source.payer,sharedBudget:source.sharedBudget,
      selections:source.selections.map(({intentId,routeId,acceptIndex,originalTerms})=>
        ({intentId,routeId,acceptIndex,originalTerms}))});
  }
  if(command==='review')return emit(await reviewDocumentCommissioning(input(options)));
  if(command==='prepare')return emit(await prepareDocumentCommissioning(input(options),
    {expectedSelection:options['expected-selection']}));
  if(command==='inspect')return emit(await inspectDocumentCommissioning(absolute(resolve(options.directory))));
  const stop=new AbortController(),combined=signal?AbortSignal.any([signal,stop.signal]):stop.signal;
  const interrupt=()=>stop.abort(documentError('DOCUMENT_COMMISSION_STOPPED'));
  process.once('SIGINT',interrupt);process.once('SIGTERM',interrupt);
  let opened;
  try{
    opened=await openCommissionedDocumentService({directory:absolute(resolve(options.directory)),
      expectedSelection:options['expected-selection']},{environment,signal:combined});
    const c=opened.commissioning,l=opened.launch;
    print(JSON.stringify({schema:'stellar-forge.document-commerce-launch.v1',state:'LISTENING',
      selectionSha256:c.selectionSha256,directory:c.directory,originalOperator:c.original.operatorWorkspace,
      originalIntentId:c.original.intentId,publicOrigin:c.original.publicOrigin,
      seller:l.seller,customer:l.customer,operator:l.operator,operations:l.operations,
      customerOptions:c.customerOptions,consumerOptions:c.consumerOptions,
      compositionOptions:c.compositionOptions,routes:c.routes,pid:l.pid,instanceId:l.instanceId}));
    return await opened.closed;
  }catch(error){if(combined.aborted&&(error===combined.reason||error?.name==='AbortError'))return;throw error;}
  finally{process.off('SIGINT',interrupt);process.off('SIGTERM',interrupt);await opened?.close();}
}
function direct(){
  if(!process.argv[1])return false;
  try{return realpathSync(resolve(process.argv[1]))===realpathSync(fileURLToPath(import.meta.url));}catch{return false;}
}
if(direct())runDocumentCommissioningCommand().catch(error=>{
  console.error(error.code?error.code+': '+error.message:'DOCUMENT_COMMISSION_FAILED');process.exitCode=1;
});
