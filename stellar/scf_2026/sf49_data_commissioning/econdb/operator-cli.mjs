#!/usr/bin/env node
// MIT. Installed Econdb command; original source, publication and payment CLIs remain separate.
import {readFile,lstat} from 'node:fs/promises';
import {resolve} from 'node:path';
import {pathToFileURL} from 'node:url';
import {initializeOperator,operatorStatus,operatorCommand,originalRequest,exportOperator,receiveOperator,inspectOperatorTransfer,preserveFailedCommand,MAX_BODY} from './operator.mjs';
import {startOperator} from './operator-server.mjs';
export async function main(args=process.argv.slice(2)){
 const [command,...rest]=args,options={};
 for(let n=0;n<rest.length;n++){const key=rest[n];if(!/^--[a-z-]+$/.test(key)||Object.hasOwn(options,key))throw Error('Use each documented --option once');
  if(key==='--create'){options[key]=true;continue}
  if(n+1===rest.length||rest[n+1].startsWith('--'))throw Error('Supply a value for '+key);options[key]=rest[++n];
 }
 const specs={init:['directory','title'],serve:['directory','port','create','title'],status:['directory'],command:['directory','request'],request:['directory','id'],export:['directory','destination'],receive:['directory','destination'],'inspect-transfer':['directory'],'preserve-failed':['directory','id','revision','note']};
 if(!specs[command]||Object.keys(options).some(k=>!specs[command].includes(k.slice(2))))throw Error('Commands: init, serve, status, command, request, export, receive, inspect-transfer, preserve-failed. Use --directory and documented command options.');
 if(!options['--directory'])throw Error('Select --directory');const directory=resolve(options['--directory']);let result;
 if(command==='init')result=await initializeOperator({directory,title:options['--title']});
 if(command==='serve'){
  if(options['--create'])await initializeOperator({directory,title:options['--title']});
  const running=await startOperator({directory,port:Number(options['--port']??0)});
  process.stdout.write(JSON.stringify({schema:'econdb.operator-start.v1',directory,url:running.url})+'\n');
  let stopping=false;for(const sig of ['SIGINT','SIGTERM'])process.on(sig,()=>{if(stopping)return;stopping=true;running.close().catch(e=>{process.stderr.write(e.message+'\n');process.exitCode=1})});
  return running;
 }
 if(command==='status')result=await operatorStatus(directory);
 if(command==='request')result=await originalRequest(directory,options['--id']);
 if(command==='command'){const path=resolve(options['--request']??'');if(!options['--request'])throw Error('Select --request FILE.json');const st=await lstat(path);if(!st.isFile()||st.isSymbolicLink()||st.size>MAX_BODY)throw Error('Request must be a regular file within256MiB');result=await operatorCommand({directory,request:JSON.parse(new TextDecoder('utf-8',{fatal:true}).decode(await readFile(path)))})}
 if(command==='export'||command==='receive'){if(!options['--destination'])throw Error('Select a new --destination');result=await(command==='export'?exportOperator:receiveOperator)({directory,destination:resolve(options['--destination'])})}
 if(command==='inspect-transfer')result=await inspectOperatorTransfer(directory);
 if(command==='preserve-failed')result=await preserveFailedCommand({directory,id:options['--id'],expectedRevision:Number(options['--revision']),note:options['--note']});
 process.stdout.write(JSON.stringify(result,null,2)+'\n');return result;
}
if(process.argv[1]&&import.meta.url===pathToFileURL(resolve(process.argv[1])).href)main().catch(e=>{process.stderr.write(JSON.stringify({error:e.message,code:e.code??'ECONDB_OPERATOR'})+'\n');process.exitCode=1});
