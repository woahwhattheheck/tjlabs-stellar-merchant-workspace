#!/usr/bin/env node
// MIT. Use the maintained Git builder and runtime installer before actual customer receiving.
import {readFile,writeFile,mkdir,lstat,realpath,link,unlink,open} from 'node:fs/promises';
import {join,resolve,dirname} from 'node:path';
import {createHash,randomUUID} from 'node:crypto';
import {pathToFileURL} from 'node:url';
import {execFileSync} from 'node:child_process';
const json=v=>JSON.stringify(v,null,2)+'\n',sha=b=>createHash('sha256').update(b).digest('hex');
const need=(v,m)=>{if(!v)throw Error(m);};
const same=(a,b)=>JSON.stringify(a)===JSON.stringify(b);
const now=()=>new Date().toISOString();
const input=JSON.parse(await readFile(process.argv[2],'utf8')),root=resolve(input.root);
const emit=(event,details={})=>process.stdout.write(JSON.stringify({event,operationId:input.operationId,at:now(),...details})+'\n');
async function exists(p){try{return await lstat(p);}catch(e){if(e.code==='ENOENT')return null;throw e;}}
async function save(p,value){const bytes=Buffer.from(json(value));await mkdir(dirname(p),{recursive:true,mode:0o700});
 if(await exists(p)){need((await readFile(p)).equals(bytes),'Original driver receipt changed: '+p);return value;}
 const t=join(dirname(p),'.driver-'+randomUUID());const h=await open(t,'wx',0o600);
 try{await h.writeFile(bytes);await h.sync();}finally{await h.close();}
 try{await link(t,p);}finally{await unlink(t);}return value;
}
async function read(p){return JSON.parse(await readFile(p,'utf8'));}
const dist=join(root,'source/stellar/scf-starforge-20261009/distribution');
const {buildDistribution}=await import(pathToFileURL(join(dist,'build.mjs')));
const {prepareRuntimeInstall,installRuntime,inspectRuntimeInstall,runtimeCommand}=await import(pathToFileURL(join(dist,'runtime-install.mjs')));
emit('DISTRIBUTION_BUILD_STARTED',{sourceCommit:input.sourceCommit,selection:'canadabuys-customer'});
const build=await buildDistribution({repository:join(root,'git-cache/repository.git'),ref:input.sourceCommit,
 output:join(root,'distribution'),resume:Boolean(await exists(join(root,'distribution'))),offline:true,selection:'canadabuys-customer',python:input.python,
 onProgress:p=>emit('DISTRIBUTION_BUILD_PROGRESS',p)});
need(build.status==='PACKAGED'&&build.sourceCommit===input.sourceCommit,'Original maintained distribution did not package');
const buildPath=join(root,'receipts/distribution.json');if(!(await exists(buildPath)))await save(buildPath,build);
else {const saved=await read(buildPath);need(saved.archive===build.archive&&saved.sha256===build.sha256&&saved.sourceCommit===build.sourceCommit,'Original packaged archive changed');}
const runtime=join(root,'runtime');
let prepared;
if(await exists(join(runtime,'runtime-install.json'))){
 const plan=await read(join(runtime,'runtime-install.json'));need(plan.source.sourceCommit===input.sourceCommit&&plan.archiveSha256===build.sha256,'Retained installed source differs');
 prepared=await read(join(root,'receipts/runtime-prepared.json'));
}else{
 need(!(await exists(runtime)),'Original runtime preparation is incomplete; preserve its preparation receipt before using maintained recovery');
 prepared=await prepareRuntimeInstall({directory:runtime,archive:build.archive,sha256:build.sha256,native:false,features:[],operator:true,python:input.python});
 await save(join(root,'receipts/runtime-prepared.json'),prepared);
}
emit('RUNTIME_INSTALL_STARTED',{directory:runtime,sourceCommit:input.sourceCommit});
const installed=await installRuntime({directory:runtime,offline:true,npm:input.npm,cache:join(root,'npm-cache')});
need(installed.status==='READY'&&installed.ready,'Maintained runtime installer did not verify READY');
const inspection=await inspectRuntimeInstall({directory:runtime,load:true,source:true,python:input.python});
need(inspection.ready&&inspection.sourceVerified&&inspection.sourceCommit===input.sourceCommit,'Installed original source/profile did not verify');
for(const [name,result]of [['runtime-installed',installed],['runtime-inspected',inspection]])if(!(await exists(join(root,'receipts/'+name+'.json'))))await save(join(root,'receipts/'+name+'.json'),result);
const packageRoot=await realpath(join(runtime,'package')),packageJson=await read(join(packageRoot,'package.json')),manifest=await read(join(packageRoot,'manifest.json'));
const command=await realpath(join(packageRoot,packageJson.bin['canadabuys-customer']));
const dispatch=await runtimeCommand({directory:runtime,args:['canadabuys-customer','--help']});
need(dispatch.sourceCommit===input.sourceCommit&&dispatch.args.includes('canadabuys-customer'),'Original runtime command selection changed');
const exportInput=[['client','openCanadaBuysMerchantClient'],['download','downloadCanadaBuysPublication'],['operations','prepareCanadaBuysEvidenceIntake'],['operations','refreshCanadaBuysEvidenceIntake'],['operations','prepareCanadaBuysIntakeOperation']];
const exportProgram='const names='+JSON.stringify(exportInput)+';const name='+JSON.stringify(packageJson.name)+';const rows=[];for(const [sub,fn]of names){const spec=name+"/merchant/canadabuys/"+sub,url=import.meta.resolve(spec),m=await import(spec);if(typeof m[fn]!=="function")throw Error("Installed export missing");rows.push({subpath:sub,url,function:fn});}process.stdout.write(JSON.stringify(rows));';
const exportBytes=execFileSync(process.execPath,['--input-type=module','--eval',exportProgram],{cwd:packageRoot,maxBuffer:65536,timeout:30000,stdio:['ignore','pipe','pipe']});
const exports=JSON.parse(exportBytes);need(exports.length===5,'Original installed package export count changed');
const receiptPath=join(root,'installation.json'),sourcePath=join(root,'source-manifest.json');
const existing=await exists(receiptPath);
if(!existing)await save(receiptPath,{schema:'commons.canadabuys-customer-installed.v1',operationId:input.operationId,state:'INSTALLED',
 packageRoot,command,exitCode:0,sourceCommit:input.sourceCommit,archive:{path:build.archive,bytes:build.archiveBytes,sha256:build.sha256},
 maintainedInstaller:{prepared,installed,inspection,dispatch},exports,actualNode:process.execPath,nodeVersion:process.version,at:now()});
else{const kept=await read(receiptPath);need(kept.sourceCommit===input.sourceCommit&&kept.packageRoot===packageRoot&&kept.command===command,'Original installation receipt changed');}
await save(sourcePath,{schema:'commons.canadabuys-customer-source.v1',operationId:input.operationId,sourceCommit:input.sourceCommit,
 files:manifest.files.map(({path,bytes,sha256,gitBlob,mode})=>({path,bytes,sha256,gitBlob,mode}))});
emit('INSTALLED_CUSTOMER_RECEIVING_STARTED',{packageRoot,command,sourceCommit:input.sourceCommit,files:manifest.files.length});
const runner=join(packageRoot,'source/stellar-forge/mcp-merchant-operator/examples/run-canadabuys-intake-receiving.mjs');
const {main}=await import(pathToFileURL(runner));
const result=await main(['--package-root',packageRoot,'--command',command,'--installation-receipt',receiptPath,
 '--source-manifest',sourcePath,'--input',join(root,'input/canadabuys-original-receiving-input.json'),'--out',join(root,'receiving')]);
need(result.status==='PASS'&&result.servicesDrained,'Original installed customer receiving did not finish');
await save(join(root,'execution.json'),{schema:'commons.canadabuys-customer-complete-execution.v1',operationId:input.operationId,
 status:'PASS',sourceCommit:input.sourceCommit,installation:await read(receiptPath),receiving:result});
emit('INSTALLED_CUSTOMER_COMPLETE',{status:'PASS',sourceCommit:input.sourceCommit,result:join(root,'execution.json')});
