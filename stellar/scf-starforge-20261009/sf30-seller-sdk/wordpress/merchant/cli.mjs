#!/usr/bin/env node
// MIT. Complete WordPress operations through the original merchant host.
import {resolve} from 'node:path';
import {pathToFileURL} from 'node:url';
import {readPrivate} from '../files.mjs';
import {openWordPressMerchantClient,readWordPressValue,downloadWordPressExport,
  inspectWordPressExport,reopenWordPressExport,receiveWordPressSourcePacket,
  wordpressMerchantTools,wordpressActionNames,wordpressActionContract} from './client.mjs';
import {initializeWordPressMerchant} from './setup.mjs';
import {decode,need,plain,MAX_REQUEST_BYTES} from './contracts.mjs';

const help=[
  'starforge-merchant merchant-wordpress tools',
  'starforge-merchant merchant-wordpress init --directory ABS --connection ABS [--name NAME]',
  'starforge-merchant merchant-wordpress call --url MCP_URL --token-env ENV --action TOOL --args ABS_JSON',
  'starforge-merchant merchant-wordpress act --url MCP_URL --token-env ENV --workspace ALIAS --action NATIVE_ACTION --operation-id UUID --expected-revision N --args ABS_JSON',
  'starforge-merchant merchant-wordpress value --url MCP_URL --token-env ENV --workspace ALIAS --export-id SHA [--manifest-sha256 SHA] [--file NAME]',
  'starforge-merchant merchant-wordpress inspect --url MCP_URL --token-env ENV --workspace ALIAS --export-id SHA [--manifest-sha256 SHA]',
  'starforge-merchant merchant-wordpress download --url MCP_URL --token-env ENV --workspace ALIAS --export-id SHA --directory ABS [--manifest-sha256 SHA] [--chunk-size BYTES]',
  'starforge-merchant merchant-wordpress reopen --workspace ALIAS --export-id SHA --directory ABS [--manifest-sha256 SHA]',
  'starforge-merchant merchant-wordpress receive --url MCP_URL --token-env ENV --workspace ALIAS --export-id SHA --receiver ALIAS [--manifest-sha256 SHA]',
  '',
  'Use the saved original operation UUID and expected workspace revision for mutations.',
  'After a lost reply, call operation with that original UUID before any new action.',
  'publisher.prepare input.exportId is the original workspace export UUID from state.exports[].id.',
  'Top-level --export-id selects the SHA-256 merchant export returned by a completed capture.',
  'value reads every original JSON byte; download resumes the same private directory.',
  'reopen verifies the complete local manifest and file without contacting the merchant endpoint.',
  'receive selects a configured source receiver alias; its tool arguments contain no local path.',
  'Only environment-variable names appear in credential options.'
].join('\n');

const definitions={
  tools:[],
  init:['directory','connection','name'],
  call:['url','token-env','action','args'],
  act:['url','token-env','workspace','action','operation-id','expected-revision','args'],
  value:['url','token-env','workspace','export-id','manifest-sha256','file'],
  inspect:['url','token-env','workspace','export-id','manifest-sha256'],
  download:['url','token-env','workspace','export-id','directory','manifest-sha256','chunk-size'],
  reopen:['workspace','export-id','directory','manifest-sha256'],
  receive:['url','token-env','workspace','export-id','receiver','manifest-sha256']
};

export async function main(argv=process.argv.slice(2),
  {environment=process.env,signal,write=value=>process.stdout.write(value)}={}){
  const [command,...rest]=argv;
  if(!command||command==='help'||command==='--help'){
    need(!rest.length,'WORDPRESS_MERCHANT_CLI_INPUT','Help takes no options.');
    write(help+'\n');return;
  }
  const allowed=definitions[command];
  need(allowed,'WORDPRESS_MERCHANT_CLI_INPUT','Choose a declared merchant-wordpress command.');
  const flags=Object.create(null);
  for(let i=0;i<rest.length;i+=2){
    const key=rest[i],value=rest[i+1];
    need(/^--[a-z][a-z-]*$/.test(key??'')&&typeof value==='string'&&value.length>0&&
      !value.startsWith('--')&&!Object.hasOwn(flags,key)&&allowed.includes(key.slice(2)),
      'WORDPRESS_MERCHANT_CLI_INPUT','Use one value after each declared option.');
    flags[key]=value;
  }
  const required=key=>{
    const value=flags['--'+key];
    need(typeof value==='string'&&value.length,'WORDPRESS_MERCHANT_CLI_INPUT','Missing --'+key);
    return value;
  };
  const integer=(key,minimum=0)=>{
    const value=required(key);
    need(/^(0|[1-9][0-9]*)$/.test(value)&&Number.isSafeInteger(Number(value))&&Number(value)>=minimum,
      'WORDPRESS_MERCHANT_CLI_INPUT','Use an exact integer for --'+key);
    return Number(value);
  };
  const remote=()=>({url:required('url'),tokenEnv:flags['--token-env']??'MCP_ACCESS_TOKEN',environment,signal});
  const selected=()=>({workspace:required('workspace'),exportId:required('export-id'),
    ...(flags['--manifest-sha256']?{expectedManifestSha256:flags['--manifest-sha256']}:{})});
  const input=async()=>{
    const value=decode(await readPrivate(resolve(required('args')),MAX_REQUEST_BYTES));
    need(plain(value),'WORDPRESS_MERCHANT_CLI_INPUT','Use one original JSON argument object.');
    return value;
  };
  let result;
  if(command==='tools')result={tools:wordpressMerchantTools,
    actions:wordpressActionNames.map(name=>({name,inputFields:wordpressActionContract[name]}))};
  else if(command==='init')result=await initializeWordPressMerchant({
    directory:resolve(required('directory')),connection:resolve(required('connection')),
    ...(flags['--name']?{name:flags['--name']}:{})});
  else if(command==='call'){
    const args=await input(),client=await openWordPressMerchantClient(remote());
    result=await client.call(required('action'),args);
  }else if(command==='act'){
    const args={workspace:required('workspace'),operationId:required('operation-id'),
      expectedRevision:integer('expected-revision'),action:required('action'),input:await input()},
      client=await openWordPressMerchantClient(remote());
    result=await client.act(args);
  }else if(command==='value')result=await readWordPressValue({...remote(),...selected(),
    ...(flags['--file']?{file:flags['--file']}:{})});
  else if(command==='inspect')result=await inspectWordPressExport({...remote(),...selected()});
  else if(command==='download')result=await downloadWordPressExport({...remote(),...selected(),
    directory:resolve(required('directory')),...(flags['--chunk-size']?{chunkSize:integer('chunk-size',1)}:{})});
  else if(command==='reopen')result=await reopenWordPressExport({...selected(),
    directory:resolve(required('directory')),signal});
  else if(command==='receive')result=await receiveWordPressSourcePacket({...remote(),...selected(),
    receiver:required('receiver')});
  write(JSON.stringify(result,null,2)+'\n');
  return result;
}

if(process.argv[1]&&pathToFileURL(resolve(process.argv[1])).href===import.meta.url){
  const controller=new AbortController(),stop=()=>controller.abort(new Error('WordPress merchant command cancelled.'));
  process.once('SIGINT',stop);process.once('SIGTERM',stop);
  try{await main(undefined,{signal:controller.signal});}
  catch(error){
    process.stderr.write(JSON.stringify({error:{code:error.code??error.name,message:error.message,
      ...(error.operationId?{operationId:error.operationId}:{}),...(error.action?{action:error.action}:{})}})+'\n');
    process.exitCode=1;
  }finally{process.off('SIGINT',stop);process.off('SIGTERM',stop);}
}
