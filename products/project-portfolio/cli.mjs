#!/usr/bin/env node
// SPDX-License-Identifier: MIT
import {resolve} from 'node:path';
import {pathToFileURL} from 'node:url';
import {need,fullPath,readJson,atomicJson,inspectProjectPortfolioSelection,initializeProjectPortfolio,
 openProjectPortfolio,runProjectPortfolioCommand} from './workspace.mjs';
import {ProjectPortfolioClient,PROJECT_PORTFOLIO_ACTIONS,newProjectPortfolioRequestId} from './client.mjs';

const HELP=[
 'Project Portfolio — native project migration and reporting',
 '',
 'project-portfolio init --workspace DIR [--connection FILE] [--label NAME] [--python FILE] [--profiles FILE]',
 'project-portfolio serve --workspace DIR [--control DIR] [--python FILE] [--profiles FILE] [--port 0]',
 'project-portfolio inspect --workspace DIR [--python FILE] [--profiles FILE]',
 'project-portfolio merchant-init --dir DIR --connection FILE [--alias NAME] [--files JSON]',
 'project-portfolio request-id',
 '',
 'The following commands require --connection FILE. Add --output FILE to retain complete JSON.',
 '  status [--cursor ID] [--limit 25]',
 '  list --collection requests|editions|cohorts [--cursor ID] [--limit 25]',
 '  read --kind request|edition|source-review|deployment|object|cohort --id ID [--family tasks] [--offset 0] [--limit 50]',
 '  fields --edition ID --family project|tasks|resources|assignments',
 '  companions --edition ID [--ordinal 0] [--offset 0] [--limit 50]',
 '  archive-fields --arguments JSON   (JSON is the complete array of edition IDs)',
 '  table --arguments JSON           (original cohort_id, publication_id, table and pagination)',
 '  query --arguments JSON           (original publication, SQL and parameters)',
 '  action --request ID --kind ACTION --arguments JSON',
 '  request --request ID',
 '  resume --request ID [--retry-failed]',
 '  wait --request ID [--timeout-ms 0] [--interval-ms 750]',
 '  pause --deployment ID --request ID',
 '  upload --file FILE [--archive] [--sha256 HASH]',
 '  download --sha256 HASH --bytes N --output FILE [--filename NAME]',
 '  download --request ID --expected-sha256 HASH --bytes N --output FILE',
 '',
 'Original native command lines:',
 '  project-portfolio source [original Portfolio CLI arguments]',
 '  project-portfolio operator [original operator CLI arguments]',
 'Set PROJECT_PORTFOLIO_PYTHON to the selected Python/MPXJ environment for native commands.',
 '',
 'Actions: '+PROJECT_PORTFOLIO_ACTIONS.join(', '),
 'See OPERATING.md for complete review, target capture, reporting, receiving and restart workflows.'
].join('\n');
function argumentsOf(argv,allowed,boolean=[]){
 const result={};
 for(let i=0;i<argv.length;i++){
  const name=argv[i];need(allowed.includes(name)&&!Object.hasOwn(result,name),'PROJECT_PORTFOLIO_CLI_ARGUMENT','Unknown or repeated option: '+name);
  if(boolean.includes(name)){result[name]=true;continue;}
  const value=argv[++i];need(typeof value==='string'&&value.length>0&&!value.startsWith('--'),'PROJECT_PORTFOLIO_CLI_VALUE',name);
  result[name]=value;
 }
 return result;
}
function required(args,...names){for(const name of names)need(args[name]!==undefined,'PROJECT_PORTFOLIO_CLI_REQUIRED','Supply '+name+'.');}
const absolute=value=>value===undefined?undefined:resolve(value);
function natural(value,fallback){
 if(value===undefined)return fallback;
 need(/^(0|[1-9][0-9]*)$/.test(value)&&Number.isSafeInteger(Number(value)),'PROJECT_PORTFOLIO_CLI_NUMBER');return Number(value);
}
async function emit(value,output){
 if(output){const retained=await atomicJson(absolute(output),value,{immutable:true});process.stdout.write(JSON.stringify(retained)+'\n');}
 else process.stdout.write(JSON.stringify(value)+'\n');
 return value;
}
export async function runProjectPortfolioCLI(argv=process.argv.slice(2)){
 const [command='help',...tail]=argv;
 if(['help','--help','-h'].includes(command)){process.stdout.write(HELP+'\n');return 0;}
 if(command==='source'||command==='operator')return runProjectPortfolioCommand(command,tail);
 if(command==='request-id'){need(tail.length===0,'PROJECT_PORTFOLIO_CLI_ARGUMENT');process.stdout.write(newProjectPortfolioRequestId()+'\n');return 0;}
 if(['serve','init','inspect'].includes(command)){
  const args=argumentsOf(tail,['--workspace','--control','--connection','--label','--python','--profiles','--port','--expected-selection-sha256','--source-directory']);
  required(args,'--workspace');
  const options={workspaceDirectory:absolute(args['--workspace']),controlDirectory:absolute(args['--control']),
   pythonExecutable:args['--python'],profilesFile:absolute(args['--profiles']),sourceDirectory:absolute(args['--source-directory'])};
  if(command==='serve'){
   need(!args['--connection']&&!args['--label'],'PROJECT_PORTFOLIO_CLI_ARGUMENT');
   await openProjectPortfolio({...options,port:natural(args['--port'],0),
    expectedSelectionSha256:args['--expected-selection-sha256']});return 0;
  }
  need(!args['--port']&&!args['--expected-selection-sha256'],'PROJECT_PORTFOLIO_CLI_ARGUMENT');
  if(command==='init')await emit(await initializeProjectPortfolio({...options,
   connectionFile:absolute(args['--connection']),label:args['--label']??'Project portfolio'}));
  else {need(!args['--connection']&&!args['--label'],'PROJECT_PORTFOLIO_CLI_ARGUMENT');await emit(await inspectProjectPortfolioSelection(options));}
  return 0;
 }
 if(command==='merchant-init'){
  const args=argumentsOf(tail,['--dir','--connection','--alias','--label','--name','--files']);
  required(args,'--dir','--connection');
  const {configureProjectPortfolioMerchant}=await import('./merchant.mjs');
  await emit(await configureProjectPortfolioMerchant({directory:absolute(args['--dir']),connectionFile:absolute(args['--connection']),
   workspace:args['--alias']??'portfolio',label:args['--label'],merchantName:args['--name']??'Project portfolio',
   files:args['--files']?await readJson(absolute(args['--files']),2*1024*1024):{}}));return 0;
 }
 const specific={
  status:['--cursor','--limit'],list:['--collection','--cursor','--limit'],
  read:['--kind','--id','--family','--offset','--limit'],fields:['--edition','--family'],
  companions:['--edition','--ordinal','--offset','--limit'],'archive-fields':['--arguments'],
  table:['--arguments'],query:['--arguments'],action:['--request','--kind','--arguments'],
  request:['--request'],resume:['--request','--retry-failed'],wait:['--request','--timeout-ms','--interval-ms'],
  pause:['--deployment','--request'],upload:['--file','--archive','--sha256'],
  download:['--sha256','--request','--expected-sha256','--bytes','--filename']
 };
 need(Object.hasOwn(specific,command),'PROJECT_PORTFOLIO_CLI_COMMAND','Read project-portfolio help for the available commands.');
 const args=argumentsOf(tail,['--connection','--output',...specific[command]],['--retry-failed','--archive']);
 required(args,'--connection');
 const client=new ProjectPortfolioClient({connectionFile:absolute(args['--connection'])});
 const stop=()=>{void client.close();};for(const name of ['SIGINT','SIGTERM','SIGHUP'])process.on(name,stop);
 try{
  const output=absolute(args['--output']);
  if(command==='upload'){
   required(args,'--file');await emit(await client.uploadFile(absolute(args['--file']),
    {archive:Boolean(args['--archive']),expectedSha256:args['--sha256']}),output);return 0;
  }
  if(command==='download'){
   required(args,'--bytes','--output');await emit(await client.download({
    sha256:args['--sha256'],requestId:args['--request'],expectedSha256:args['--expected-sha256'],
    expectedBytes:natural(args['--bytes']),name:args['--filename']??'original.bin'},output));return 0;
  }
  if(command==='wait'){
   required(args,'--request');
   await client.waitRequest(args['--request'],{timeoutMs:natural(args['--timeout-ms'],0),
    intervalMs:natural(args['--interval-ms'],750),includeResult:false});
  }
  let path,options={};
  if(command==='status'){path='/api/state';options.query={cursor:args['--cursor'],limit:natural(args['--limit'],25)};}
  else if(command==='list'){
   required(args,'--collection');need(['requests','editions','cohorts'].includes(args['--collection']),'PROJECT_PORTFOLIO_COLLECTION');
   path='/api/'+args['--collection'];options.query={cursor:args['--cursor'],limit:natural(args['--limit'],25)};
  }else if(command==='read'){
   required(args,'--kind','--id');const routes={request:'requests',edition:'editions','source-review':'source-reviews',deployment:'deployments',object:'objects',cohort:'cohorts'};
   need(routes[args['--kind']],'PROJECT_PORTFOLIO_READ_KIND');
   need(args['--kind']==='edition'||[args['--family'],args['--offset'],args['--limit']].every(value=>value===undefined),'PROJECT_PORTFOLIO_READ_FIELDS');
   path='/api/'+routes[args['--kind']]+'/'+args['--id'];
   options.query={family:args['--family'],offset:natural(args['--offset']),limit:natural(args['--limit'])};
  }else if(command==='fields'){
   required(args,'--edition','--family');path='/api/source-field-catalogue';
   options.query={edition_id:args['--edition'],family:args['--family']};
  }else if(command==='companions'){
   required(args,'--edition');path=args['--ordinal']===undefined?'/api/companion-sources':'/api/companion-capture';
   options.query={edition_id:args['--edition'],ordinal:natural(args['--ordinal']),offset:natural(args['--offset']),limit:natural(args['--limit'])};
  }else if(['archive-fields','table','query'].includes(command)){
   required(args,'--arguments');const body=await readJson(absolute(args['--arguments']),8*1024*1024);
   if(command==='archive-fields'){need(Array.isArray(body),'PROJECT_PORTFOLIO_EDITIONS');path='/api/archive-fields';options.query={editions:body};}
   if(command==='table'){path='/api/archive-table';options.query=body;}
   if(command==='query'){path='/api/archive-query';options={method:'POST',body};}
  }else if(command==='action'){
   required(args,'--request','--kind','--arguments');need(PROJECT_PORTFOLIO_ACTIONS.includes(args['--kind']),'PROJECT_PORTFOLIO_ACTION');
   path='/api/actions';options={method:'POST',requestId:args['--request'],body:{
    request_id:args['--request'],kind:args['--kind'],arguments:await readJson(absolute(args['--arguments']),8*1024*1024)}};
  }else if(command==='request'||command==='wait'){
   required(args,'--request');path='/api/requests/'+args['--request'];options.requestId=args['--request'];
  }else if(command==='resume'){
   required(args,'--request');path='/api/requests/'+args['--request']+'/resume';
   options={method:'POST',requestId:args['--request'],body:{retry_failed:Boolean(args['--retry-failed'])}};
  }else if(command==='pause'){
   required(args,'--deployment','--request');path='/api/deployments/'+args['--deployment']+'/pause';
   options={method:'POST',requestId:args['--request'],body:{request_id:args['--request']}};
  }
  if(output)await emit(await client.saveResponse(path,output,options));
  else await emit(await client.requestJson(path,options));
  return 0;
 }finally{
  for(const name of ['SIGINT','SIGTERM','SIGHUP'])process.removeListener(name,stop);await client.close();
 }
}
if(process.argv[1]&&pathToFileURL(resolve(process.argv[1])).href===import.meta.url){
 runProjectPortfolioCLI().then(code=>{process.exitCode=code;}).catch(error=>{
  process.stderr.write(JSON.stringify({error:{code:error.code??error.name,message:error.message,
   ...(error.requestId?{requestId:error.requestId}:{})}})+'\n');process.exitCode=1;
 });
}
