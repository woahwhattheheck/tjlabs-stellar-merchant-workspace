// MIT. Complete local fixture and recipient course for the installed reporting provider.
import { mkdir, readFile, realpath } from 'node:fs/promises';
import { createHash, randomUUID } from 'node:crypto';
import { resolve, join } from 'node:path';
import { pathToFileURL } from 'node:url';
import { openReportingProgrammeClient } from '../agent-client.mjs';
import { applyProgramme, programmeIdentity, openProgramme } from '../programme.mjs';
import { writePrivate, privateSupportDirectory } from '../../../../stellar-forge/mcp-merchant-operator/host-files.mjs';

const pretty=value=>JSON.stringify(value,null,2)+'\n';
const sha=value=>createHash('sha256').update(value).digest('hex');
function requireValue(value,message){if(!value)throw new Error(message);}
async function directory(value){const path=resolve(value);await mkdir(path,{recursive:true,mode:0o700});requireValue(await realpath(path)===path,'Select the canonical private course directory.');await privateSupportDirectory(path);return path;}
const iso=(base,seconds)=>new Date(Date.parse(base)+seconds*1000).toISOString();

/** Writes explicit LOCAL fixture observations, then their exact host input aliases.
 * It creates no provider run, schedule, recipient send or external receipt.
 */
export async function prepareLocalReportingCourse(directoryName,{endpoint,at=new Date().toISOString()}={}) {
 const root=await directory(directoryName);
 requireValue(typeof endpoint==='string'&&endpoint,'Supply the original merchant MCP endpoint.');
 const actor='Installed reporting client local course',operations=[],inputs={};
 let project=null;
 const request=async(alias,kind,input,seconds)=>{
  const body={operationId:'course-'+alias,actor,at:iso(at,seconds),kind,input};
  const selected=await applyProgramme(project,body);project=selected.project;
  const content=pretty(body),filename=alias+'.json';await writePrivate(join(root,filename),content);
  inputs[alias]={path:join(root,filename),label:'Explicit local course: '+alias};
  operations.push({kind:'apply',input:alias,expectedSha256:sha(content),operationId:body.operationId,expectedProjectSha256:'current'});
  return body;
 };
 const definition={id:'orders.monthly',title:'Monthly orders — local fixture',
  meaning:'The two literal rows are a local execution course fixture. Amounts and original identifiers remain text.',
  parameters:{month:'2026-09'},sourceDescription:'Explicit local fixture; no external database connection.',
  calendar:{status:'proposed',timezone:'UTC',expression:'0 8 1 * *',rule:'Prior closed month; operator commissions the native provider separately.'},
  query:{filename:'orders-monthly.sql',content:'SELECT order_id, amount_cents FROM orders WHERE month = :month;\n',mediaType:'application/sql'}};
 await request('create','create',{id:'reporting-agent-course',label:'Reporting agent local course',reports:[definition]},0);
 const definitionSha256=project.reportingProgramme.definitions.at(-1).sha256;
 await request('complete','run',{id:'local-complete',reportId:'orders.monthly',definitionSha256,
  status:'complete',provider:{runId:'local-fixture-run-1',queryVersion:'literal-sql-v1'},period:{month:'2026-09'},
  parameters:{month:'2026-09'},sourceSnapshot:'The exact two-row local CSV written in this course.',
  reportedRows:2,result:{filename:'local-complete.csv',content:'order_id,amount_cents\n001,1050\n002,2500\n',mediaType:'text/csv'},
  files:[{filename:'local-origin.json',content:pretty({kind:'local-course-fixture',externalProviderRun:false}),mediaType:'application/json'}]},1);
 await request('failed','run',{id:'local-failed',reportId:'orders.monthly',definitionSha256,
  status:'failed',provider:{runId:'local-fixture-failed',queryVersion:'literal-sql-v1'},period:{month:'2026-10'},
  parameters:{month:'2026-10'},sourceSnapshot:'Explicit local failure observation; provider total unknown.',
  reportedRows:null,files:[{filename:'local-error.txt',content:'LOCAL FIXTURE: source query unavailable; total unknown.\n',mediaType:'text/plain'}]},2);
 await request('route-failed','delivery',{id:'local-route-failed',runId:'local-complete',status:'failed',
  routeId:'local-review',destination:'Local course recipient folder',
  receipt:{filename:'local-failed-receipt.json',content:pretty({fixture:true,status:'failed',reason:'Local course retry example'}),mediaType:'application/json'}},3);
 await request('route-return','delivery',{id:'local-route-return',runId:'local-complete',status:'succeeded',
  predecessorId:'local-route-failed',routeId:'local-review',destination:'Local course recipient folder',
  receipt:{filename:'local-receipt.json',content:pretty({fixture:true,status:'accepted',externalSend:false}),mediaType:'application/json'}},4);
 await request('empty','run',{id:'local-empty',reportId:'orders.monthly',definitionSha256,
  status:'complete',provider:{runId:'local-fixture-empty',queryVersion:'literal-sql-v1'},period:{month:'2026-11'},
  parameters:{month:'2026-11'},sourceSnapshot:'Explicit header-only local CSV.',reportedRows:0,
  result:{filename:'local-empty.csv',content:'order_id,amount_cents\n',mediaType:'text/csv'},files:[]},5);
 await request('suppressed','delivery',{id:'local-suppressed',runId:'local-empty',status:'suppressed-empty',
  routeId:'local-review',destination:'Local course recipient folder',reason:'The complete result contains zero rows; selected empty-result policy.'},6);
 const connection={schema:'stellar-forge.reporting-programmes-connection.v1',
  workspaces:{course:{label:'Explicit local reporting agent course',directory:join(root,'host-store'),inputs}}};
 await directory(join(root,'host-store'));
 await writePrivate(join(root,'connection.json'),connection);
 const plan={schema:'stellar-forge.reporting-agent-course.v1',url:endpoint,tokenEnv:'MCP_ACCESS_TOKEN',workspace:'course',
  steps:operations,exports:[{operationId:'course-export-project',format:'project'},{operationId:'course-export-native',format:'native'}]};
 await writePrivate(join(root,'course-plan.json'),plan);
 await writePrivate(join(root,'reference-project.json'),pretty(project));
 await writePrivate(join(root,'COURSE.md'),'# Installed reporting agent local course\n\n'+
  'Load connection.json through the existing merchant reportingProgrammesConnection configuration, then run the exact course-plan.json. '+
  'The original SQL, every full CSV and all local receipts are explicit fixtures. The native provider remains responsible for real query execution and destination sending.\n\n'+
  'Reference project SHA256: '+(await programmeIdentity(project)).projectSha256+'. The host creates its own original table identities; the runner pins its actual current project before every operation.\n');
 return {directory:root,plan:join(root,'course-plan.json'),connection:join(root,'connection.json'),
  referenceProjectSha256:(await programmeIdentity(project)).projectSha256};
}

async function requireComplete(result){
 requireValue(result?.operation?.state==='complete','The original operation is '+result?.operation?.state+': '+JSON.stringify(result?.operation?.error||{}));
 return result;
}

/** Runs only the selected exact host aliases. Every mutation has its own retained
 * directory. An interrupted course continues through the explicit resume command.
 */
export async function runReportingAgentCourse(plan,outputDirectory,{resume=false}={}) {
 requireValue(plan?.schema==='stellar-forge.reporting-agent-course.v1'&&Array.isArray(plan.steps)&&Array.isArray(plan.exports),'Open the complete original course plan.');
 const root=await directory(outputDirectory);
 let saved=null;
 try{saved=JSON.parse(await readFile(join(root,'selected-course.json'),'utf8'));}catch(error){if(error.code!=='ENOENT')throw error;}
 if(saved){
  requireValue(resume,'The complete original course already exists. Use resume with the same plan and directory.');
  requireValue(JSON.stringify(saved.plan)===JSON.stringify(plan),'Resume the exact original complete course plan.');
 }
 const client=await openReportingProgrammeClient({url:plan.url,tokenEnv:plan.tokenEnv||'MCP_ACCESS_TOKEN',
  workspace:plan.workspace,expectedNativeId:saved?.selection.nativeId||plan.expectedNativeId});
 if(!saved)await writePrivate(join(root,'selected-course.json'),{plan,selection:client.selection()});
 const receivingId=randomUUID();
 const outcomes=[];
 try{
  const available=await client.readAll('inputs');
  await writePrivate(join(root,'input-identities-'+receivingId+'.json'),available);
  for(let index=0;index<plan.steps.length;index++){
   const step=plan.steps[index],status=await client.status();
   requireValue(['apply','receive_desk','receive_project'].includes(step.kind),'Select an original reporting input operation.');
   const {kind,...args}=step;
   if(args.expectedProjectSha256==='current')args.expectedProjectSha256=status.project.projectSha256;
   const path=join(root,'step-'+String(index+1).padStart(2,'0'));
   let retained=false;try{await readFile(join(path,'request.json'));retained=true;}catch(error){if(error.code!=='ENOENT')throw error;}
   let result;
   if(retained){
    requireValue(resume,'Continue the original saved operation through resume.');
    try{result=await client.recover({directory:path});}
    catch(error){if(error.code!=='REPORTING_OPERATION_NOT_FOUND')throw error;result=await client.replay({directory:path});}
   }else{
    for(const [alias,pin]of [[args.input,args.expectedSha256],...(kind==='receive_desk'?[[args.context,args.expectedContextSha256]]:[])]){
     const row=available.items.find(item=>item.alias===alias);
     requireValue(row?.available&&row.file?.sha256===pin,'The selected complete host input has changed: '+alias);
    }
    const prepared=await client.prepare(kind,args);
    result=await client.execute(prepared,{directory:path});
   }
   await requireComplete(result.result);outcomes.push(result);
  }
  for(const selected of plan.exports){
   const status=await client.status();
   const path=join(root,'export-'+selected.format);
   let retained=false;try{await readFile(join(path,'request.json'));retained=true;}catch(error){if(error.code!=='ENOENT')throw error;}
   let result;
   if(retained){
    requireValue(resume,'Continue the exact original export through resume.');
    try{result=await client.recover({directory:path});}
    catch(error){if(error.code!=='REPORTING_OPERATION_NOT_FOUND')throw error;result=await client.replay({directory:path});}
   }else{
    const prepared=await client.prepare('export',{...selected,expectedProjectSha256:status.project.projectSha256});
    result=await client.execute(prepared,{directory:path});
   }
   await requireComplete(result.result);
   const publications=result.result.operation.publications.filter(item=>item.format===selected.format);
   requireValue(publications.length===1,'The original export must retain one selected complete output.');
   const downloaded=await client.download(publications[0].publicationId,{directory:join(root,'recipient-'+selected.format)});
   if(selected.format==='project'){
    const original=await readFile(join(downloaded.directory,downloaded.publication.file.name),'utf8');
    const reopened=await openProgramme(original),identity=await programmeIdentity(reopened);
    requireValue(identity.projectSha256===publications[0].projectSha256,'The complete downloaded project reopens with another identity.');
   }
   outcomes.push({...result,downloaded});
  }
  const history=await client.readAll('history'),publications=await client.readAll('publications');
  await writePrivate(join(root,'complete-history-'+receivingId+'.json'),history);
  await writePrivate(join(root,'complete-publications-'+receivingId+'.json'),publications);
  const result={schema:'stellar-forge.reporting-agent-course-result.v1',selection:client.selection(),outcomes,
   current:await client.status(),historyCount:history.items.length,publicationCount:publications.items.length};
  await writePrivate(join(root,'course-result-'+receivingId+'.json'),result);return result;
 }finally{
  // Preserve the shared provider lifetime. The operator may explicitly close the
  // original instance after completing all agent/browser recipient work.
 }
}
async function main(args){
 if(args[0]==='prepare-local'){
  requireValue(args.length===3,'Usage: agent-course.mjs prepare-local PRIVATE_DIRECTORY MCP_URL');
  console.log(JSON.stringify(await prepareLocalReportingCourse(args[1],{endpoint:args[2]}),null,2));return;
 }
 if(args[0]==='run'||args[0]==='resume'){
  requireValue(args.length===3,'Usage: agent-course.mjs run|resume COMPLETE_PLAN_JSON PRIVATE_OUTPUT_DIRECTORY');
  const plan=JSON.parse(await readFile(args[1],'utf8'));
  console.log(JSON.stringify(await runReportingAgentCourse(plan,args[2],{resume:args[0]==='resume'}),null,2));return;
 }
 throw new Error('Use prepare-local PRIVATE_DIRECTORY MCP_URL, or run|resume COMPLETE_PLAN_JSON PRIVATE_OUTPUT_DIRECTORY.');
}
if(process.argv[1]&&import.meta.url===pathToFileURL(resolve(process.argv[1])).href)
 main(process.argv.slice(2)).catch(error=>{console.error(error.code||'REPORTING_AGENT_COURSE',error.message);process.exitCode=1;});
