#!/usr/bin/env node
// MIT. Use the already running original Customer closing workbench.
import {readFile,writeFile} from 'node:fs/promises';
import {isAbsolute} from 'node:path';
import {pathToFileURL} from 'node:url';
const operations=new Set(['catalogue','save','calendar','compile','prepare','request','resume','history','export','import']);
export async function runServiceCalendarCli(argv=process.argv.slice(2)){
  if(argv.includes('--help')||!argv.length){
    process.stdout.write('Customer service calendars\n\ncustomer-service-calendar OPERATION --workbench http://127.0.0.1:4419 [--request /absolute/input.json] [--out /absolute/result.json]\n\nOperations: catalogue, save, calendar, compile, prepare, request, resume, history, export, import.\nUse the already running Customer closing application. Request bodies match its documented calendar HTTP operations. Existing output files are preserved. calendar requests can choose format html/csv for the complete window.\n');return;
  }
  const [operation,...rest]=argv;
  if(!operations.has(operation))throw Error('Choose a documented service calendar operation.');
  const options={};for(let i=0;i<rest.length;i+=2){
    if(!['--workbench','--request','--out'].includes(rest[i])||!rest[i+1]||options[rest[i]])throw Error('Supply each documented option once with its value.');
    options[rest[i]]=rest[i+1];
  }
  const origin=new URL(options['--workbench']);
  if(!['http:','https:'].includes(origin.protocol)||!['127.0.0.1','[::1]','localhost'].includes(origin.hostname)||
    origin.username||origin.password||origin.search||origin.hash||origin.pathname!=='/')throw Error('Choose the original loopback workbench origin.');
  let body={};if(options['--request']){
    if(!isAbsolute(options['--request']))throw Error('Use an absolute request path.');
    const raw=await readFile(options['--request']);if(raw.length>19_000_000)throw Error('Use a complete request up to 19 MB.');
    body=JSON.parse(raw.toString('utf8'));
    if(!body||typeof body!=='object'||Array.isArray(body))throw Error('The request must be one complete JSON object.');
  }
  async function receive(path,value,token){
    const response=await fetch(new URL(path,origin),{method:value===undefined?'GET':'POST',redirect:'error',
      headers:value===undefined?{Origin:origin.origin}:{Origin:origin.origin,'Content-Type':'application/json','X-Workbench-Token':token},
      body:value===undefined?undefined:JSON.stringify(value)});
    const result=await response.json();
    if(!response.ok)throw Object.assign(new Error(result.error?.message??'The original workbench operation failed.'),{code:result.error?.code});
    return result;
  }
  const context=await receive('/api/context');
  const result=operation==='catalogue'?await receive('/api/service-schedules/catalogue'):
    await receive('/api/service-schedules/'+operation,body,context.csrfToken);
  const output=result.filename&&typeof result.content==='string'?result.content:JSON.stringify(result,null,2)+'\n';
  if(options['--out']){
    if(!isAbsolute(options['--out']))throw Error('Use an absolute output path.');
    await writeFile(options['--out'],output,{flag:'wx',mode:0o600});
    process.stdout.write(JSON.stringify({saved:options['--out'],bytes:Buffer.byteLength(output),...(result.filename?{format:result.mimeType}: {})})+'\n');
  }else process.stdout.write(output);
}
if(process.argv[1]&&import.meta.url===pathToFileURL(process.argv[1]).href)runServiceCalendarCli().catch(error=>{
  process.stderr.write(JSON.stringify({error:{code:error.code??'SERVICE_CALENDAR_CLI',message:error.message}})+'\n');process.exitCode=1;
});
