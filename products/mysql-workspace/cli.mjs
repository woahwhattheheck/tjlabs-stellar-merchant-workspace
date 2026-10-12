#!/usr/bin/env node
// MIT. Human and agent entry over the original MySQL product and native transport.
import { resolve, join } from 'node:path';
import { pathToFileURL } from 'node:url';
import { initializeMysqlProduct,inspectMysqlProduct,openMysqlProduct,inspectMysqlLaunch,
  inspectMysqlArchive,restoreMysqlArchive } from './workspace.mjs';
import { MysqlProductClient } from './client.mjs';
import { mysqlProductTools } from './merchant-tools.mjs';
import { readPrivate,need,object } from './setup.mjs';

const HELP='MySQL merchant workspace (Node 22+ on Linux)\n\n'+
'  init --dir DIR --source SOURCE_JSON [--name NAME] [--workspace mysql]\n'+
'       [--facilitator HTTPS_URL --allow-local-facilitator] [--seller-port 0] [--operations-port 0]\n'+
'  inspect --dir DIR\n'+
'  review --dir DIR [--port 0] [--token-env MCP_ACCESS_TOKEN] [--browser-only]\n'+
'  open --dir DIR [--expected-binding SHA256] [--port 0] [--token-env MCP_ACCESS_TOKEN] [--browser-only]\n'+
'  tools\n'+
'  call --dir DIR --tool merchant_mysql_product_STATUS --input PRIVATE_JSON\n'+
'       (or select --connection /private/connection.json)\n'+
'  download --dir DIR --kind archive --request-id UUID --output RECEIVING_DIR [--sha256 SHA256]\n'+
'  download --dir DIR --kind client --sha256 SHA256 --output RECEIVING_DIR\n'+
'  receive --dir DIR --request-id UUID --output RECEIVING_DIR --restore NEW_PRODUCT_DIR [--sha256 SHA256]\n'+
'  inspect-archive --archive FILE\n'+
'  restore --archive FILE --dir NEW_PRODUCT_DIR --sha256 SHA256 --product-id UUID\n\n'+
'Open the complete printed browser URL. Save unfinished authoring drafts, prepare the original reviewed SQL\n'+
'package, and open its dataset publication from that same product. Open keeps the native owner in the foreground.\n'+
'Database passwords and agent bearer tokens stay in the inherited environment. Whole-workspace archives retain\n'+
'original source, drafts, SQL packages, candidates, reviews, schedules and versions. Keep the complete private archive.\n';
const optionsByCommand={
  init:['--dir','--source','--name','--workspace','--facilitator','--allow-local-facilitator','--seller-port','--operations-port'],
  inspect:['--dir'],review:['--dir','--port','--token-env','--browser-only'],
  open:['--dir','--port','--token-env','--browser-only','--expected-binding'],
  tools:[],call:['--dir','--connection','--tool','--input'],
  download:['--dir','--connection','--kind','--request-id','--sha256','--output','--chunk-size'],
  receive:['--dir','--connection','--request-id','--sha256','--output','--restore','--chunk-size'],
  'inspect-archive':['--archive'],restore:['--archive','--dir','--sha256','--product-id'],
};
function parse(input){
  const[command,...rest]=input;need(Object.hasOwn(optionsByCommand,command),'MYSQL_PRODUCT_COMMAND',HELP);
  const values=new Map();
  for(let i=0;i<rest.length;i++){
    const key=rest[i];need(optionsByCommand[command].includes(key)&&!values.has(key),'MYSQL_PRODUCT_OPTION',HELP);
    if(['--allow-local-facilitator','--browser-only'].includes(key)){values.set(key,true);continue;}
    need(typeof rest[i+1]==='string'&&!rest[i+1].startsWith('--'),'MYSQL_PRODUCT_OPTION_VALUE',HELP);values.set(key,rest[++i]);
  }
  return{command,values};
}
function required(values,key){need(values.has(key),'MYSQL_PRODUCT_REQUIRED_OPTION',key+' is required.');return values.get(key);}
function integer(values,key,fallback){const v=values.get(key);if(v===undefined)return fallback;
  need(/^(0|[1-9]\d*)$/.test(v)&&Number.isSafeInteger(Number(v)),'MYSQL_PRODUCT_INTEGER',key+' requires an integer.');return Number(v);}
const output=value=>process.stdout.write(JSON.stringify(value,null,2)+'\n');
export async function main(input=process.argv.slice(2)){
  if(!input.length||input.length===1&&['--help','help'].includes(input[0])){process.stdout.write(HELP);return null;}
  const{command,values:v}=parse(input);
  if(command==='init'){
    const runtime={sellerPort:integer(v,'--seller-port',0),operationsPort:integer(v,'--operations-port',0),
      allowLocalFacilitator:v.has('--allow-local-facilitator'),...(v.has('--facilitator')?{facilitator:v.get('--facilitator')}:{})};
    const result=await initializeMysqlProduct({directory:resolve(required(v,'--dir')),sourceFile:resolve(required(v,'--source')),
      ...(v.has('--name')?{name:v.get('--name')}:{}) ,...(v.has('--workspace')?{workspace:v.get('--workspace')}:{}) ,runtime});
    output(result);return result;
  }
  if(command==='inspect'){const result=await inspectMysqlProduct(resolve(required(v,'--dir')));output(result);return result;}
  if(['review','open'].includes(command)){
    const options={directory:resolve(required(v,'--dir')),port:integer(v,'--port',0),
      tokenEnv:v.get('--token-env')??'MCP_ACCESS_TOKEN',browserOnly:v.has('--browser-only'),
      ...(v.has('--expected-binding')?{expectedBindingSha256:v.get('--expected-binding')}:{})};
    if(command==='review'){const result=await inspectMysqlLaunch(options);output(result);return result;}
    const active=await openMysqlProduct(options);
    const{operator,close,...record}=active;process.stdout.write(JSON.stringify(record)+'\n');
    let stopping=false;
    for(const signal of ['SIGINT','SIGTERM'])process.once(signal,()=>{
      if(stopping)return;stopping=true;active.close().catch(error=>{
        process.stderr.write(JSON.stringify({error:error.code??'MYSQL_PRODUCT_CLOSE_FAILED',message:error.message})+'\n');process.exitCode=1;});
    });
    return active;
  }
  if(command==='tools'){const result=mysqlProductTools((name,description,properties,required=[],annotations={})=>({
    name,description,inputSchema:{type:'object',properties,required,additionalProperties:false},annotations}));output(result);return result;}
  if(command==='inspect-archive'){const result=await inspectMysqlArchive(resolve(required(v,'--archive')));output(result);return result;}
  if(command==='restore'){const result=await restoreMysqlArchive({archive:resolve(required(v,'--archive')),
    directory:resolve(required(v,'--dir')),expectedSha256:required(v,'--sha256'),expectedProductId:required(v,'--product-id')});
    output(result);return result;}
  need(!(v.has('--dir')&&v.has('--connection')),'MYSQL_PRODUCT_CLIENT_SELECTION');
  const connectionFile=v.has('--connection')?resolve(v.get('--connection')):join(resolve(required(v,'--dir')),'connection.json');
  const client=new MysqlProductClient({connectionFile});let result;
  if(command==='call'){
    const name=required(v,'--tool');let args={};
    if(v.has('--input'))args=JSON.parse(new TextDecoder('utf-8',{fatal:true}).decode(await readPrivate(resolve(v.get('--input')),524288)));
    need(object(args),'MYSQL_PRODUCT_INPUT_INVALID');result=await client.call(name,args);
  }else{
    const settings={requestId:v.get('--request-id'),sha256:v.get('--sha256'),directory:resolve(required(v,'--output')),
      chunkSize:integer(v,'--chunk-size',196608)};
    if(command==='receive')result=await client.receiveHandover({...settings,restoreDirectory:resolve(required(v,'--restore'))});
    else result=await client.receiveFiles({...settings,kind:required(v,'--kind')});
  }
  output(result);return result;
}
if(process.argv[1]&&import.meta.url===pathToFileURL(resolve(process.argv[1])).href)
  main().catch(error=>{process.stderr.write(JSON.stringify({error:error.code??'MYSQL_PRODUCT_FAILED',message:error.message})+'\n');process.exitCode=1;});
