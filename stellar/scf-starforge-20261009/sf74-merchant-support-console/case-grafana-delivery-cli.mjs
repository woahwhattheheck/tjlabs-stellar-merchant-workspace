#!/usr/bin/env node
// MIT. Operator commands for the original Grafana → SF49 → Support case workflow.
import {constants} from 'node:fs';
import {open} from 'node:fs/promises';
import {isAbsolute,resolve} from 'node:path';
import {pathToFileURL} from 'node:url';
import {createHash} from 'node:crypto';
import {openCaseStore,retainCaseArtifact} from './case-store.mjs';
import {createCaseSourceDelivery} from './case-source-delivery.mjs';
import {openGrafanaCaseDelivery} from './case-grafana-delivery.mjs';
import {exportCaseSourcePackage,inspectCaseSourcePackage,receiveCaseSourcePackage} from './case-source-package.mjs';

const INPUT_LIMIT=32*1024*1024,CONTEXT_LIMIT=65536;
const SHA=/^[a-f0-9]{64}$/;
const fail=(code,message)=>Object.assign(new Error(message),{code,status:422});
function ensure(value,message,code='GRAFANA_CLI_INPUT'){if(!value)throw fail(code,message);}
function object(value,allowed,label){
  ensure(value&&typeof value==='object'&&!Array.isArray(value)&&
    Object.keys(value).every(k=>allowed.includes(k)),'Use the documented '+label+' fields.');
  return value;
}
function absolute(value,label){
  ensure(typeof value==='string'&&isAbsolute(value)&&!value.includes('\0'),
    'Use an absolute '+label+' path.');
  return resolve(value);
}
async function readJson(path,maximum=INPUT_LIMIT){
  absolute(path,'input');
  const handle=await open(path,constants.O_RDONLY|(constants.O_NOFOLLOW??0)|(constants.O_NONBLOCK??0));
  try{
    const info=await handle.stat();
    ensure(info.isFile()&&info.size>0&&info.size<=maximum,'Use one complete bounded ordinary JSON file.');
    const bytes=await handle.readFile();
    ensure(bytes.length===info.size&&bytes.length<=maximum,'The selected JSON file changed while reading.');
    return JSON.parse(new TextDecoder('utf-8',{fatal:true}).decode(bytes));
  }finally{await handle.close();}
}
function selectedContext(value){
  object(value,['casesDirectory','sourceDirectory','grafanaSource','python'],'context');
  for(const name of ['casesDirectory','sourceDirectory','grafanaSource'])absolute(value[name],name);
  if(value.python!==undefined)ensure(typeof value.python==='string'&&value.python&&!value.python.includes('\0'),'Select the original Python executable.');
  return {...value};
}
function reviewed(value){
  object(value,['selection','reviewSha256','inspection'],'complete saved review');
  ensure(value.selection&&SHA.test(value.reviewSha256??''),'Use the complete frozen review returned by review.');
  return {selection:value.selection,reviewSha256:value.reviewSha256};
}
async function openContext(configuration,{resolveReceiving}={}){
  const context=selectedContext(configuration);
  const environment=process.env,python=context.python??environment.SCF_PYTHON??'python3';
  const store=await openCaseStore(context.casesDirectory);
  const sourceDelivery=await createCaseSourceDelivery({
    store,directory:context.sourceDirectory,environment,python,
  });
  let adapter;
  try{
    adapter=await openGrafanaCaseDelivery({
      store,sourceDelivery,grafanaSource:context.grafanaSource,environment,python,
      ...(resolveReceiving?{resolveReceiving}:{}),
    });
  }catch(error){await sourceDelivery.close();throw error;}
  return {context,store,sourceDelivery,adapter,environment,python,
    async close(){try{await adapter.close();}finally{await sourceDelivery.close();}}};
}
async function intake(owner,input,signal){
  object(input,['id','caseId','caseRevision','actor','label','archive'],'source intake');
  object(input.archive,['path','bytes','sha256'],'original archive');
  const path=absolute(input.archive.path,'original archive');
  ensure(Number.isSafeInteger(input.archive.bytes)&&input.archive.bytes>0&&SHA.test(input.archive.sha256??''),
    'Select the original archive byte count and SHA-256.');
  const file=await open(path,constants.O_RDONLY|(constants.O_NOFOLLOW??0)|(constants.O_NONBLOCK??0));
  try{
    const info=await file.stat();
    ensure(info.isFile()&&info.size===input.archive.bytes,'The original archive size differs.');
    const digest=createHash('sha256');
    for await(const chunk of file.createReadStream({autoClose:false}))digest.update(chunk);
    ensure(digest.digest('hex')===input.archive.sha256,'The original archive bytes differ.','GRAFANA_ARCHIVE_CHANGED');
    const transfer=await owner.sourceDelivery.service.begin({
      id:input.id,kind:'source',caseId:input.caseId,caseRevision:input.caseRevision,
      actor:input.actor,label:input.label??'Grafana project handover',
      files:[{id:'grafana',name:'Grafana_Handover.zip',role:'grafana-target-handover',
        bytes:String(input.archive.bytes),sha256:input.archive.sha256}],
    });
    if(!transfer.files.find(row=>row.id==='grafana')?.present){
      const stream=file.createReadStream({start:0,autoClose:false});
      try{await owner.sourceDelivery.service.upload({id:input.id,fileId:'grafana',stream,signal});}
      finally{stream.destroy();}
    }
    const prepared=await owner.sourceDelivery.service.prepare({id:input.id});
    const members=prepared.descriptor?.files.filter(row=>row.role==='grafana-target-handover'&&
      row.sha256===input.archive.sha256&&Number(row.bytes)===input.archive.bytes)??[];
    ensure(members.length===1,'The prepared source must retain the one exact selected Grafana archive.');
    return {transfer:prepared,inspectionInput:{transferId:input.id,memberPath:members[0].path}};
  }finally{await file.close();}
}
function receivingInput(input){
  object(input,['directory','receivingDirectory','requestId','actor','expectedManifestSha256','grafanaRequestId'],'complete case receiving');
  absolute(input.directory,'original package');absolute(input.receivingDirectory,'receiving');
  ensure(SHA.test(input.expectedManifestSha256??''),'Select the complete case package manifest SHA-256.');
  ensure(typeof input.grafanaRequestId==='string'&&input.grafanaRequestId,'Keep the original Grafana delivery request ID.');
  const {grafanaRequestId,...nativeInput}=input;
  return {nativeInput,grafanaRequestId};
}

/** Native command adapter. It adds no archive format, case store or target worker. */
export async function runGrafanaDeliveryCommand({command,configuration,input,signal}){
  signal?.throwIfAborted();
  const context=selectedContext(configuration);
  if(command==='inspect-package'){
    object(input,['directory','expectedManifestSha256'],'package inspection');
    absolute(input.directory,'package');
    ensure(SHA.test(input.expectedManifestSha256??''),'Use the original package manifest SHA-256.');
    return inspectCaseSourcePackage({...input,python:context.python??process.env.SCF_PYTHON??'python3',environment:process.env,signal});
  }
  let receiving=null;
  const owner=await openContext(context,{resolveReceiving:async({caseId})=>
    receiving?.case?.id===caseId?receiving:null});
  const stop=()=>{void owner.close().catch(()=>{});};
  signal?.addEventListener('abort',stop,{once:true});
  try{
    signal?.throwIfAborted();
    switch(command){
      case 'intake':return await intake(owner,input,signal);
      case 'inspect':
        object(input,['transferId','memberPath'],'handover inspection');
        return await owner.adapter.inspect(input);
      case 'review':
        return await owner.adapter.review(input);
      case 'apply':
        return await owner.adapter.apply(reviewed(input));
      case 'status':
        object(input,['caseId','requestId'],'original delivery status');
        return await owner.adapter.inspectCase(input);
      case 'reopen':
        object(input,['caseId','requestId'],'original case reopen');
        return await owner.adapter.reopen(input);
      case 'export':{
        object(input,['id','revision','directory','exportId','generatedAt'],'complete case export');
        absolute(input.directory,'package output');
        return await exportCaseSourcePackage({...input,store:owner.store,
          casesDirectory:context.casesDirectory,sourceDelivery:owner.sourceDelivery,
          python:owner.python,environment:owner.environment,signal});
      }
      case 'receive':{
        const {nativeInput,grafanaRequestId}=receivingInput(input);
        receiving=await receiveCaseSourcePackage({...nativeInput,
          casesDirectory:context.casesDirectory,sourceDelivery:owner.sourceDelivery,
          python:owner.python,environment:owner.environment,signal});
        ensure(receiving.state==='COMPLETE'&&receiving.case?.importedRevision,
          'The original native case receiver did not finish its complete import.');
        const grafana=await owner.adapter.reopen({
          caseId:receiving.case.id,requestId:grafanaRequestId,
        });
        return {receiving,grafana};
      }
      default:throw fail('GRAFANA_CLI_COMMAND','Unknown command. Use --help for the original workflow.');
    }
  }finally{signal?.removeEventListener('abort',stop);await owner.close();}
}

export const GRAFANA_DELIVERY_HELP=
'Grafana delivery through the original Support case and source services\n\n'+
'node case-grafana-delivery-cli.mjs COMMAND --context /ABS/context.json --input /ABS/input.json [--out /ABS/result.json]\n\n'+
'Commands: intake, inspect, review, apply, status, reopen, export, inspect-package, receive\n'+
'Context: casesDirectory, sourceDirectory, grafanaSource, optional python.\n'+
'All paths are absolute. Input files contain the documented original command objects.\n'+
'intake retains one complete Grafana ZIP using the original SF49 source service.\n'+
'review saves the full frozen case/source/task selection; apply uses that unchanged review.\n'+
'export preserves the complete selected case revision, history and source bundles.\n'+
'receive uses a separate context, retains the full package and reopens its Grafana delivery.\n'+
'Repeat the same saved receive input to resume and inspect the same original import.\n'+
'--out uses the native immutable artifact writer; a different result needs a new filename.\n';

export async function grafanaDeliveryMain(argv=process.argv.slice(2)){
  if(argv.length===0||argv.length===1&&['--help','-h'].includes(argv[0])){
    process.stdout.write(GRAFANA_DELIVERY_HELP);return;
  }
  const command=argv[0],options={};
  ensure(['intake','inspect','review','apply','status','reopen','export','inspect-package','receive'].includes(command),
    'Unknown command. Use --help.','GRAFANA_CLI_COMMAND');
  for(let i=1;i<argv.length;i+=2){
    const key=argv[i],value=argv[i+1];
    ensure(['--context','--input','--out'].includes(key)&&value&&!Object.hasOwn(options,key),
      'Use each of --context, --input and --out at most once, followed by an absolute file path.');
    options[key]=absolute(value,key.slice(2));
  }
  ensure(options['--context']&&options['--input'],'Both --context and --input are required.');
  if(['intake','review','apply','export','receive'].includes(command))
    ensure(options['--out'],'Retain the complete result with --out for this operation.');
  const configuration=selectedContext(await readJson(options['--context'],CONTEXT_LIMIT));
  const input=await readJson(options['--input']);
  const controller=new AbortController();
  const stop=()=>controller.abort(fail('GRAFANA_CLI_INTERRUPTED','The original command was interrupted. Reopen its retained request.'));
  process.once('SIGINT',stop);process.once('SIGTERM',stop);
  let result;
  try{result=await runGrafanaDeliveryCommand({command,configuration,input,signal:controller.signal});}
  finally{process.removeListener('SIGINT',stop);process.removeListener('SIGTERM',stop);}
  const bytes=Buffer.from(JSON.stringify(result,null,2)+'\n');
  if(options['--out']){
    const artifact=await retainCaseArtifact(options['--out'],bytes);
    process.stdout.write(JSON.stringify({command,resultFile:options['--out'],...artifact})+'\n');
  }else process.stdout.write(bytes);
  return result;
}
if(process.argv[1]&&pathToFileURL(resolve(process.argv[1])).href===import.meta.url){
  grafanaDeliveryMain().catch(error=>{
    process.stderr.write(JSON.stringify({error:error.code??'GRAFANA_CLI_FAILED',
      message:error.message,status:error.status??null})+'\n');
    process.exitCode=1;
  });
}
