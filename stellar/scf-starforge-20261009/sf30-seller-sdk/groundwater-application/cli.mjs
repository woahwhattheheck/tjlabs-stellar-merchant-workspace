#!/usr/bin/env node
// SPDX-License-Identifier: MIT
import {readFile} from 'node:fs/promises';
import {fileURLToPath} from 'node:url';
import {resolve} from 'node:path';
import {randomUUID} from 'node:crypto';
import {selection,completeSelection,inspectSelection,fields,need,UUID} from './source.mjs';
import {startApplication} from './server.mjs';
import {inspectBackup,receiveBackup,continueReceiving,inspectReceiving,listReceiving} from './receiving.mjs';

export const usage=[
 'groundwater-application inspect --selection /absolute/selection.json',
 'groundwater-application serve --workspace /private/original --receiving-root /private/receiving --source-root /installed/source --python /absolute/python [--actor NAME] [--port 0]',
 'groundwater-application inspect-backup --selection /absolute/selection.json --archive /absolute/backup.zip',
 'groundwater-application receive-backup --selection /absolute/selection.json --request /absolute/reviewed-request.json',
 'groundwater-application continue-receiving --selection /absolute/selection.json --operation ORIGINAL_UUID',
 'groundwater-application receiving --selection /absolute/selection.json --operation ORIGINAL_UUID',
 'groundwater-application receivings --selection /absolute/selection.json',
 'groundwater-application native --input /absolute/original-managed-receiving.json'
].join('\n');
const selectionFields=['workspaceDirectory','receivingDirectory','sourceRoot','python','expectedWorkspace',
 'expectedReceiving','expectedSource','expectedPython','actor','port','operationId'];
async function json(path){return JSON.parse(await readFile(path,'utf8'));}
function options(args,names){
 need(args.length%2===0,'GROUNDWATER_APPLICATION_ARGUMENTS','Use named original option/value pairs.',422);
 const values={};for(let i=0;i<args.length;i+=2){
  need(names.includes(args[i])&&!Object.hasOwn(values,args[i]),'GROUNDWATER_APPLICATION_ARGUMENTS','Use each declared option once.',422);
  values[args[i]]=args[i+1];
 }
 return values;
}
async function selected(path){
 need(path,'GROUNDWATER_APPLICATION_ARGUMENTS','Select the original application JSON.',422);
 const value=await json(path);fields(value,selectionFields,'scientific application selection');
 for(const field of ['expectedWorkspace','expectedReceiving','expectedSource','expectedPython'])
  need(/^[a-f0-9]{64}$/.test(value[field]??''),'GROUNDWATER_APPLICATION_REVIEW_REQUIRED',
   'Use the complete reviewed selection returned by inspect.',422);
 await inspectSelection(value);return value;
}
export async function main(args=process.argv.slice(2)){
 const command=args[0];
 if(!command||['help','--help','-h'].includes(command)){process.stdout.write(usage+'\n');return;}
 if(command==='serve'){
  const initial=selection(args,{requireOperation:false,requireExpected:false});
  const choice=await completeSelection({...initial,operationId:initial.operationId??randomUUID()},{probe:true});
  await startApplication(choice,{onStartup:value=>process.stdout.write(JSON.stringify(value)+'\n')});
  return;
 }
 if(command==='native'){
  const input=options(args.slice(1),['--input']);need(input['--input'],'GROUNDWATER_APPLICATION_ARGUMENTS','Select the original native input.');
  const {runApplicationReceiving}=await import('./native.mjs');
  const abort=new AbortController(),stop=()=>abort.abort(new Error('Original application receiving stopped.'));
  for(const name of ['SIGINT','SIGTERM'])process.on(name,stop);
  try{
   const result=await runApplicationReceiving(await json(input['--input']),{signal:abort.signal});
   process.stdout.write(JSON.stringify(result)+'\n');
  }finally{for(const name of ['SIGINT','SIGTERM'])process.off(name,stop);}
  return;
 }
 const opts=options(args.slice(1),['--selection','--archive','--request','--operation']);
 if(command==='inspect'){
  const input=await json(opts['--selection']);fields(input,selectionFields,'scientific application selection');
  const result=await completeSelection(input,{probe:true});
  process.stdout.write(JSON.stringify(result)+'\n');return;
 }
 const choice=await selected(opts['--selection']);
 let result;
 if(command==='inspect-backup')result=await inspectBackup(choice,opts['--archive']);
 else if(command==='receive-backup')result=await receiveBackup(choice,await json(opts['--request']));
 else if(command==='continue-receiving')result=await continueReceiving(choice,opts['--operation']);
 else if(command==='receiving')result=await inspectReceiving(choice,opts['--operation']);
 else if(command==='receivings')result=await listReceiving(choice);
 else throw new Error(usage);
 process.stdout.write(JSON.stringify(result)+'\n');
}
if(process.argv[1]&&fileURLToPath(import.meta.url)===resolve(process.argv[1]))
 main().catch(error=>{process.stderr.write(JSON.stringify({error:{code:error.code??'GROUNDWATER_APPLICATION_COMMAND',
  message:String(error.message),...(error.detail?{detail:error.detail}:{})}})+'\n');process.exitCode=1;});
