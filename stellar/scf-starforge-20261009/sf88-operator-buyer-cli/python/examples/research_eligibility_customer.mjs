#!/usr/bin/env node
// MIT. Complete customer delivery on the original, already running Research workspace.
import {parseArgs} from 'node:util';
import {resolve,join,delimiter,isAbsolute} from 'node:path';
import {fileURLToPath} from 'node:url';
import {spawn} from 'node:child_process';

const BUYER='stellar/scf-starforge-20261009/sf88-operator-buyer-cli';
const MAX_OUTPUT=16*1024*1024;
const need=(value,code)=>{if(!value)throw Object.assign(new Error(code),{code});};
const absolute=(value)=>{need(typeof value==='string'&&isAbsolute(value),'ELIGIBILITY_CUSTOMER_ABSOLUTE_PATH_REQUIRED');return resolve(value);};

/** Attach to the existing original listener; its owner retains lifecycle authority. */
export async function receiveEligibilityCustomer({
  checkout,connection,directory,dossierId,reviewId,operationId,revision,workSetId,workspaceId,
  python='python3',node=process.execPath,timeout=900,replayRequests=[],signal
}={}){
  checkout=absolute(checkout);connection=absolute(connection);directory=absolute(directory);
  need(typeof dossierId==='string'&&typeof reviewId==='string'&&typeof operationId==='string',
    'ELIGIBILITY_CUSTOMER_SELECTION_REQUIRED');
  need(Number.isSafeInteger(timeout)&&timeout>=1&&timeout<=3600,'ELIGIBILITY_CUSTOMER_TIMEOUT_INVALID');
  need(revision===undefined||Number.isSafeInteger(revision)&&revision>=1,'ELIGIBILITY_CUSTOMER_REVISION_INVALID');
  need(Array.isArray(replayRequests),'ELIGIBILITY_CUSTOMER_REQUEST_FILES_INVALID');
  need(!signal?.aborted,'ELIGIBILITY_CUSTOMER_CANCELLED_BEFORE_START');
  const source=join(checkout,BUYER,'python'),args=[
    join(source,'examples/research_eligibility_customer.py'),'--checkout',checkout,
    '--connection',connection,'--directory',directory,'--dossier-id',dossierId,
    '--review-id',reviewId,'--operation-id',operationId,'--node',node,'--timeout',String(timeout),
    ...(revision!==undefined?['--revision',String(revision)]:[]),
    ...(workSetId?['--work-set-id',workSetId]:[]),...(workspaceId?['--workspace-id',workspaceId]:[]),
    ...replayRequests.flatMap(file=>['--replay-request',absolute(file)])
  ];
  const group=process.platform!=='win32';
  const result=await new Promise((done,reject)=>{
    const child=spawn(python,args,{cwd:checkout,env:{...process.env,
      PYTHONPATH:[source,process.env.PYTHONPATH].filter(Boolean).join(delimiter)},
      detached:group,stdio:['ignore','pipe','pipe']});
    const chunks={stdout:[],stderr:[]},sizes={stdout:0,stderr:0};
    let problem=null,stopping=false,timer;
    const terminate=kind=>{
      if(!child.pid)return;
      try{if(group)process.kill(-child.pid,kind);else child.kill(kind);}
      catch(error){if(error.code!=='ESRCH')problem??=error;}
    };
    const stop=()=>{
      if(stopping)return;stopping=true;terminate('SIGTERM');
      timer=setTimeout(()=>terminate('SIGKILL'),10000);timer.unref();
    };
    for(const name of ['stdout','stderr'])child[name].on('data',chunk=>{
      sizes[name]+=chunk.length;
      if(sizes[name]>MAX_OUTPUT){problem??=Object.assign(new Error('ELIGIBILITY_CUSTOMER_OUTPUT_LIMIT'),
        {code:'ELIGIBILITY_CUSTOMER_OUTPUT_LIMIT'});stop();return;}
      chunks[name].push(chunk);
    });
    child.once('error',error=>{problem=error;});
    child.once('close',(code,terminated)=>{
      clearTimeout(timer);signal?.removeEventListener('abort',stop);
      if(problem){reject(problem);return;}
      const stdout=Buffer.concat(chunks.stdout).toString('utf8'),stderr=Buffer.concat(chunks.stderr).toString('utf8');
      let value,error;try{value=JSON.parse(stdout);}catch{}
      try{error=JSON.parse(stderr);}catch{}
      if(code!==0||stopping||value?.state!=='COMPLETE'){
        reject(Object.assign(new Error(error?.error??'ELIGIBILITY_CUSTOMER_INCOMPLETE'),
          {code:error?.error??'ELIGIBILITY_CUSTOMER_INCOMPLETE',exitCode:code,signal:terminated}));return;
      }
      try{
        need(value.schema==='stellar-forge.research-eligibility-customer.v1'&&
          value.selection?.dossierId===dossierId&&value.selection.reviewId===reviewId&&
          (revision===undefined||value.selection.revision===revision)&&
          value.file===join(directory,'complete.json')&&value.archive?.file===join(directory,'Eligibility_Delivery.zip'),
          'ELIGIBILITY_CUSTOMER_RECEIPT_CHANGED');
        done(value);
      }catch(error){reject(error);}
    });
    if(signal?.aborted)stop();else signal?.addEventListener('abort',stop,{once:true});
  });
  return result;
}

export async function main(argv=process.argv.slice(2),{output=process.stdout}={}){
  const {values}=parseArgs({args:argv,options:{
    checkout:{type:'string'},connection:{type:'string'},directory:{type:'string'},
    'dossier-id':{type:'string'},'review-id':{type:'string'},'operation-id':{type:'string'},
    revision:{type:'string'},'work-set-id':{type:'string'},'workspace-id':{type:'string'},
    python:{type:'string',default:'python3'},node:{type:'string',default:process.execPath},
    timeout:{type:'string',default:'900'},'replay-request':{type:'string',multiple:true},
    help:{type:'boolean',short:'h',default:false}
  },strict:true});
  if(values.help){
    output.write('Deliver a saved original eligibility review through Python and complete customer receiving.\n'+
      'Usage: research-eligibility-customer --checkout SOURCE --connection PRIVATE_CONNECTION.json\n'+
      '  --directory CUSTOMER_DIRECTORY --dossier-id ORIGINAL_ID --review-id ORIGINAL_REVIEW\n'+
      '  --operation-id ORIGINAL_CONTINUATION [--revision N] [--work-set-id ORIGINAL_WORKSET]\n'+
      '  [--workspace-id ORIGINAL_WORKSPACE] [--python EXISTING_PYTHON] [--node EXISTING_NODE]\n'+
      '  [--replay-request ORIGINAL_COMMITTED_REQUEST.json ...] [--timeout SECONDS]\n'+
      'The existing listener stays with its owner. Outputs include all twelve complete files,\n'+
      'the original JSON/gzip receivers, exact ZIP and independent editable receiving.\n');
    return;
  }
  const controller=new AbortController(),stop=()=>controller.abort();
  process.once('SIGINT',stop);process.once('SIGTERM',stop);
  try{
    const value=await receiveEligibilityCustomer({
      checkout:values.checkout,connection:values.connection,directory:values.directory,
      dossierId:values['dossier-id'],reviewId:values['review-id'],operationId:values['operation-id'],
      revision:values.revision===undefined?undefined:Number(values.revision),
      workSetId:values['work-set-id'],workspaceId:values['workspace-id'],
      python:values.python,node:values.node,timeout:Number(values.timeout),
      replayRequests:values['replay-request']??[],signal:controller.signal
    });output.write(JSON.stringify(value)+'\n');return value;
  }finally{process.removeListener('SIGINT',stop);process.removeListener('SIGTERM',stop);}
}
if(process.argv[1]&&resolve(process.argv[1])===fileURLToPath(import.meta.url)){
  try{await main();}catch(error){process.stderr.write(JSON.stringify({state:'INCOMPLETE',error:error.code??error.name})+'\n');process.exitCode=1;}
}
