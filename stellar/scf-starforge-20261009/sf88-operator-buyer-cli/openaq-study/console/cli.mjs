#!/usr/bin/env node
// SPDX-License-Identifier: MIT
import {pathToFileURL} from 'node:url';
import {readFile} from 'node:fs/promises';
import {resolve} from 'node:path';
import {initializeConsole,readConsoleConfiguration} from './config.mjs';
import {startCustomerConsole} from './server.mjs';
import {openOpenAQCustomer} from './client.mjs';
import {need} from '../files.mjs';
const HELP='openaq-buyer-console init --config /absolute/host-selection.json\n'+
 'openaq-buyer-console serve --dir /absolute/customer-console [--port 0] [--startup-json]\n'+
 'openaq-buyer-console inspect --dir /absolute/customer-console\n'+
 'openaq-buyer-console status --connection /absolute/connection.json --id UUID --configuration SHA256\n'+
 'openaq-buyer-console uses the original openaq-buyer commands for acquisition, accounting and portable receiving.\n';
function argumentsFor(args){
 const result={};for(let i=0;i<args.length;i++){
  const name=args[i];need(name.startsWith('--')&&!Object.hasOwn(result,name),'OPENAQ_CUSTOMER_ARGUMENT_INVALID');
  if(name==='--startup-json'){result[name]=true;continue;}
  need(typeof args[i+1]==='string'&&!args[i+1].startsWith('--'),'OPENAQ_CUSTOMER_ARGUMENT_VALUE_REQUIRED');result[name]=args[++i];
 }
 return result;
}
export async function main(argv=process.argv.slice(2)){
 const [command,...rest]=argv;if(!command||['help','--help'].includes(command)){process.stdout.write(HELP);return;}
 const args=argumentsFor(rest),allowed={
  init:['--config'],inspect:['--dir'],status:['--connection','--id','--configuration'],
  serve:['--dir','--port','--startup-json','--expected-configuration','--expected-source']};
 need(allowed[command]&&Object.keys(args).every(name=>allowed[command].includes(name)),'OPENAQ_CUSTOMER_ARGUMENT_INVALID');
 if(command==='init'){
  need(args['--config'],'OPENAQ_CUSTOMER_CONFIG_FILE_REQUIRED');
  const input=JSON.parse(await readFile(resolve(args['--config']),'utf8'));
  process.stdout.write(JSON.stringify(await initializeConsole(input),null,2)+'\n');return;
 }
 if(command==='inspect'){process.stdout.write(JSON.stringify(await readConsoleConfiguration(args['--dir']),null,2)+'\n');return;}
 if(command==='status'){
  const client=await openOpenAQCustomer({connectionFile:args['--connection'],consoleId:args['--id'],configurationSha256:args['--configuration']});
  try{process.stdout.write(JSON.stringify(await client.view(),null,2)+'\n');}finally{await client.close();}return;
 }
 const server=await startCustomerConsole({directory:args['--dir'],port:Number(args['--port']??0),
  expectedConfiguration:args['--expected-configuration'],expectedSource:args['--expected-source']});
 let closing;
 const stop=()=>closing??=(async()=>{
  try{await server.close();}catch(error){process.exitCode=1;process.stderr.write((error.code??error.message??'OPENAQ_CUSTOMER_CLOSE_INCOMPLETE')+'\n');}
  finally{process.removeListener('SIGINT',stop);process.removeListener('SIGTERM',stop);}
 })();
 process.on('SIGINT',stop);process.on('SIGTERM',stop);
 process.stdout.write(args['--startup-json']?JSON.stringify(server.startup)+'\n':'OpenAQ customer studies: '+server.startup.url+'\n');
 return server;
}
if(process.argv[1]&&pathToFileURL(resolve(process.argv[1])).href===import.meta.url){
 main().catch(error=>{process.exitCode=1;process.stderr.write((error.code??error.message??'OPENAQ_CUSTOMER_FAILED')+'\n');});
}
