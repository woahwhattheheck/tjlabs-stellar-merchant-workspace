// MIT. Complete installed Datactivist customer continuation on the original saved case.
import {readFile,writeFile,mkdir,lstat,copyFile} from 'node:fs/promises';
import {resolve,join,dirname} from 'node:path';
import {fileURLToPath,pathToFileURL} from 'node:url';
import {createHash,randomUUID} from 'node:crypto';
import {createRequire} from 'node:module';
import {spawn} from 'node:child_process';

const here=dirname(fileURLToPath(import.meta.url));
const raw=process.argv[2];
if(!raw)throw new Error('Choose the original customer receiving configuration JSON.');
const args=JSON.parse(raw.trimStart().startsWith('{')?raw:await readFile(resolve(raw),'utf8'));
const operation='DATACTIVIST-PUBLISHER-OPERATING-018A-20261012-01';
const hash=bytes=>createHash('sha256').update(bytes).digest('hex');
const need=(ok,message)=>{if(!ok)throw new Error(message);};
const exists=async path=>{try{await lstat(path);return true;}catch(error){if(error.code==='ENOENT')return false;throw error;}};
const readJSON=async path=>JSON.parse(await readFile(path,'utf8'));
const encoded=value=>JSON.stringify(value,null,2)+'\n';
const attempt=new Date().toISOString().replace(/[^0-9TZ]/g,'')+'-'+randomUUID().slice(0,8);
const root=resolve(args.root),logs=join(root,'logs',attempt),node=resolve(args.node??process.execPath);
const python=args.python??process.env.CODEX_PRIMARY_RUNTIME_PYTHON??'python3';
const sourceFile=resolve(args.sourceFile),archiveFile=resolve(args.archiveFile);
const originalResultFile=resolve(args.originalResult),installer=resolve(args.installer);
await mkdir(logs,{recursive:true,mode:0o700});
const selectedSource=await readFile(sourceFile),selectedArchive=await readFile(archiveFile);
need(hash(selectedSource)===args.sourceSha256,'The complete selected source JSON differs from its supplied SHA-256.');
need(hash(selectedArchive)===args.archiveSha256,'The original publisher workspace archive differs from its supplied SHA-256.');
const archive=JSON.parse(selectedArchive),original=await readJSON(originalResultFile);
need(original.operationId===operation&&original.complete===true,'Continue the completed original publisher operation.');
need(archive.schema==='stellar-forge.datagouv-portable-workspace.v1'&&archive.complete===true,'Use the original complete native DataGouv archive.');
const archivedStage=original.stages.find(stage=>stage.name==='complete_archive_and_independent_receiving');
need(archivedStage?.archiveSha256===args.archiveSha256,'The supplied archive is not the original programme result.');
const workspaceId=archive.workspace.id,publicationId=original.publicationId,snapshot=original.snapshot;
need(typeof workspaceId==='string'&&typeof publicationId==='string'&&typeof snapshot==='string','The original case identities are incomplete.');
const pin={schema:'stellar-forge.datagouv-customer-receiving-pin.v1',operationId:operation,
 sourceSha256:args.sourceSha256,archiveSha256:args.archiveSha256,originalResultSha256:hash(await readFile(originalResultFile)),
 workspaceId,publicationId,snapshot};
const pinFile=join(root,'source-pin.json');
if(await exists(pinFile))need(JSON.stringify(await readJSON(pinFile))===JSON.stringify(pin),'Continue this exact selected original source and saved case.');
else await writeFile(pinFile,encoded(pin),{flag:'wx',mode:0o600});
const resultFile=join(root,'CUSTOMER_RECEIVING_RESULT.json');
if(await exists(resultFile)){
 const prior=await readJSON(resultFile);
 if(prior.complete===true&&prior.package){
  need(prior.sourceSha256===pin.sourceSha256&&prior.archiveSha256===pin.archiveSha256&&prior.workspaceId===workspaceId,'The retained customer result identifies another selection.');
  const retained=await readFile(prior.package.path);need(hash(retained)===prior.package.sha256&&retained.length===prior.package.bytes,'The completed customer package changed.');
  process.stdout.write(JSON.stringify({state:'DATACTIVIST_CUSTOMER_RECEIVING_COMPLETE',reused:true,operationId:operation,result:resultFile,package:prior.package})+'\n');process.exit(0);
 }
 await copyFile(resultFile,join(root,'CUSTOMER_RECEIVING_RESULT.previous-'+attempt+'.json'));
}
const result={...pin,schema:'stellar-forge.datagouv-customer-receiving-result.v1',complete:false,startedAt:new Date().toISOString(),attempt,logs,stages:[]};
let sequence=0,service,browser;
async function stage(name,detail){result.stages.push({name,completedAt:new Date().toISOString(),...detail});await writeFile(resultFile,encoded(result),{mode:0o600});process.stdout.write(JSON.stringify({stage:name,...detail})+'\n');}
async function runJSON(executable,argv,label){
 const tag=String(++sequence).padStart(3,'0')+'-'+label;
 return new Promise((done,reject)=>{
  const child=spawn(executable,argv,{cwd:root,stdio:['ignore','pipe','pipe'],shell:false});
  const stdout=[],stderr=[];child.stdout.on('data',chunk=>stdout.push(chunk));child.stderr.on('data',chunk=>stderr.push(chunk));
  child.once('error',reject);
  child.once('close',async(code,signal)=>{try{
   const out=Buffer.concat(stdout),err=Buffer.concat(stderr);
   await writeFile(join(logs,tag+'.stdout'),out,{mode:0o600});await writeFile(join(logs,tag+'.stderr'),err,{mode:0o600});
   need(code===0,'Native '+label+' ended '+String(code??signal)+'; full output is retained under '+logs);
   done(JSON.parse(out.toString('utf8')));
  }catch(error){reject(error);}});
 });
}
const installed=async(argv,label)=>runJSON(python,['-B',installer,...argv],label);
async function install(directory,source,sourceSha,archivePath,archiveSha,label){
 return installed(['install','--directory',directory,'--source',source,'--source-sha256',sourceSha,
  '--archive',archivePath,'--archive-sha256',archiveSha,'--node',node],label);
}
function sameCase(status){
 need(status.state==='READY'&&status.native.workspace.id===workspaceId,'The installed original receiver opened another workspace.');
 need(status.native.selection.publicationId===publicationId,'The original selected publication changed during installed receiving.');
 const current=status.native.publications.find(row=>row.id===publicationId);
 need(current?.snapshot===snapshot,'The installed receiver changed the original dataset snapshot.');
 const changes=status.source.changes??[];
 need(changes.length===0,'The received application differs from its complete source selection.');
 return status;
}
async function start(directory,label){
 const tag=String(++sequence).padStart(3,'0')+'-'+label;
 const child=spawn(python,['-B',installer,'serve','--directory',directory,'--node',node,'--port','0'],
  {cwd:root,stdio:['ignore','pipe','pipe'],shell:false});
 const state={child,url:null,stdout:[],stderr:[],closed:null,logTag:tag};
 state.closed=new Promise(resolveExit=>{child.once('close',(code,signal)=>resolveExit({code,signal}));});
 child.stdout.on('data',chunk=>state.stdout.push(chunk));child.stderr.on('data',chunk=>state.stderr.push(chunk));
 const ready=await new Promise((done,reject)=>{
  let text='';const timer=setTimeout(()=>reject(new Error('The installed server did not report its original loopback URL.')),60000);
  child.once('error',error=>{clearTimeout(timer);reject(error);});
  child.once('close',(code,signal)=>{if(!state.url){clearTimeout(timer);reject(new Error('The installed server ended before ready: '+String(code??signal)));}});
  child.stdout.on('data',chunk=>{
   text+=chunk.toString('utf8');let at;
   while((at=text.indexOf('\n'))>=0){const line=text.slice(0,at);text=text.slice(at+1);
    try{const value=JSON.parse(line);if(value.state==='SERVING'&&typeof value.url==='string'){
     const origin=new URL(value.url);need(origin.hostname==='127.0.0.1'&&origin.protocol==='http:','Use the original local server URL.');
     state.url=value.url;clearTimeout(timer);done(state);
    }}catch(error){if(line.trim().startsWith('{')&&error.message.startsWith('Use ')){clearTimeout(timer);reject(error);}}
   }
  });
 }).catch(async error=>{try{await stop(state);}catch(cleanup){error.message+=' Cleanup: '+cleanup.message;}throw error;});
 state.logTag=tag;
 return ready;
}
async function stop(state){
 if(!state)return;
 if(state.child.exitCode===null&&state.child.signalCode===null)state.child.kill('SIGTERM');
 let timer;
 const finish=await Promise.race([state.closed,new Promise(resolveTimeout=>{timer=setTimeout(()=>resolveTimeout(null),30000);})]);
 clearTimeout(timer);
 if(!finish){state.child.kill('SIGKILL');await state.closed;}
 await writeFile(join(logs,state.logTag+'.stdout'),Buffer.concat(state.stdout),{mode:0o600});
 await writeFile(join(logs,state.logTag+'.stderr'),Buffer.concat(state.stderr),{mode:0o600});
 need(finish!==null,'The owned original service required forced shutdown; saved output is retained.');
 need(finish.code===0,'The owned original service did not close cleanly: '+String(finish.code??finish.signal));
}
async function customer(status,label){
 const summary=await runJSON(python,['-B',join(here,'installed_customer.py'),'--url',service.url,
  '--application',status.source.directory,'--workspace',status.workspace,'--node',node,
  '--workspace-id',workspaceId,'--publication-id',publicationId,'--snapshot',snapshot,'--label',label],label);
 const detail=await readJSON(summary.result);
 need(detail.complete===true&&detail.allOriginalCellsCompared===true&&detail.http.rows===34844&&detail.native.rows===34844,
  'The installed customer operation did not receive the complete original publication.');
 return detail;
}
async function inspectBrowser(url,leadingCode){
 const require=createRequire(import.meta.url),module=await import(pathToFileURL(require.resolve(args.playwrightModule)));
 const chromium=module.chromium??module.default?.chromium;
 need(typeof chromium?.launch==='function','Choose the actual installed JavaScript Playwright module.');
 browser=await chromium.launch({headless:true,executablePath:resolve(args.browserExecutable),args:['--no-sandbox','--disable-dev-shm-usage']});
 const directory=join(root,'browser');await mkdir(directory,{recursive:true,mode:0o700});const views=[],errors=[],downloads=[];
 for(const width of [1440,390]){
  const context=await browser.newContext({viewport:{width,height:960},acceptDownloads:true});
  const page=await context.newPage();page.on('pageerror',error=>errors.push(error.message));
  await page.goto(url,{waitUntil:'networkidle'});
  await page.waitForFunction(()=>document.getElementById('connection').textContent==='Workspace open');
  async function capture(view){
   const size=await page.evaluate(()=>({viewport:innerWidth,document:document.documentElement.scrollWidth,body:document.body.scrollWidth}));
   need(size.document===width&&size.body<=width,'The installed '+view+' view overflows '+width+'px.');
   const path=join(directory,view+'-'+width+'.png');await page.screenshot({path,fullPage:true});
   const raw=await readFile(path);views.push({view,width,...size,path,bytes:raw.length,sha256:hash(raw)});
  }
  for(const view of ['overview','sources','publications','compare','portal','handover']){
   await page.locator('nav a[href="#'+view+'"]').click();await page.waitForFunction(id=>!document.getElementById(id).hidden,view);await capture(view);
  }
  await page.locator('nav a[href="#sources"]').click();await page.getByRole('button',{name:'Open source',exact:true}).first().click();
  await page.waitForSelector('#source-detail:not([hidden])');
  need(await page.locator('#source-rows tbody tr').count()===25,'The installed source preview omitted original rows.');
  await capture('source-detail');
  const pending=page.waitForEvent('download');await page.locator('#source-csv').click();const download=await pending;
  const csv=join(directory,'original-'+width+'.csv');await download.saveAs(csv);
  const bytes=await readFile(csv);need(hash(bytes)==='fec6338a55ea2c4eaaa76d63e8e4d97d9c1e7d8d5666924b8a292eb58a830e05','The installed browser changed its full original source download.');
  downloads.push({kind:'original',width,path:csv,bytes:bytes.length,sha256:hash(bytes)});
  await page.locator('nav a[href="#publications"]').click();await page.getByRole('button',{name:'Open current',exact:true}).click();
  await page.waitForSelector('#publication-detail:not([hidden])');
  await page.locator('#query-form input[name=query]').fill('where_cog_commune='+leadingCode+'&limit=250');
  await page.getByRole('button',{name:'Run query',exact:true}).click();
  await page.waitForFunction(()=>document.querySelectorAll('#query-rows tbody tr').length===1);
  need((await page.locator('#query-rows').innerText()).includes(leadingCode),'The installed browser changed the original leading-zero code.');
  await capture('publication-detail');
  if(width===1440){
   await page.locator('nav a[href="#handover"]').click();
   const pendingExport=page.waitForEvent('download');await page.locator('#export-workspace').click();const exported=await pendingExport;
   const file=join(directory,'browser-workspace.datawork');await exported.saveAs(file);
   const raw=await readFile(file),body=JSON.parse(raw);
   need(body.schema==='stellar-forge.datagouv-portable-workspace.v1'&&body.complete===true&&body.workspace.id===workspaceId,
    'The browser handover did not export this complete original workspace.');
   downloads.push({kind:'workspace',width,path:file,bytes:raw.length,sha256:hash(raw)});
  }
  await context.close();
 }
 await browser.close();browser=null;need(errors.length===0,'The installed application reported browser errors: '+errors.join('; '));
 return {views,downloads,errors};
}
try{
 const compile=await runJSON(python,['-B','-c',
  'import ast,json,runpy,sys; p=sys.argv[1]; ast.parse(open(p,encoding="utf-8").read(),filename=p); runpy.run_path(p,run_name="datactivist_installer_source"); print(json.dumps({"compile":"passed","import":"passed","path":p}))',installer],'installer-source');
 await stage('complete_installer_source',compile);
 const firstDirectory=join(root,'customer-one');
 const first=sameCase(await install(firstDirectory,sourceFile,args.sourceSha256,archiveFile,args.archiveSha256,'original-install'));
 const resumed=sameCase(await installed(['resume','--directory',firstDirectory,'--node',node],'original-resume'));
 need(JSON.stringify(first.native.selection)===JSON.stringify(resumed.native.selection),'Resuming installation changed the original selection.');
 await stage('original_customer_installation',{directory:firstDirectory,workspaceId,publicationId,snapshot,applicationFiles:first.source.files,source:first.source.directory,workspace:first.workspace});
 service=await start(firstDirectory,'first-server');
 const firstCustomer=await customer(first,'independent-installation');
 await stage('complete_first_installed_customer',{rows:firstCustomer.http.rows,httpPages:firstCustomer.http.pages,nativePages:firstCustomer.native.pages,sha256:firstCustomer.http.sha256,allOriginalCellsCompared:true});
 const browserResult=await inspectBrowser(service.url,firstCustomer.leadingZeroQuery);
 await stage('installed_desktop_and_phone',browserResult);
 await stop(service);service=null;
 const beforeArchive=sameCase(await installed(['status','--directory',firstDirectory,'--node',node],'first-cold-status'));
 need(JSON.stringify(first.native.selection)===JSON.stringify(beforeArchive.native.selection),'The installed customer changed the original edition decision.');
 const firstHandover=join(root,'first-handover');
 const exported=await installed(['archive','--directory',firstDirectory,'--out',firstHandover,'--node',node],'first-export');
 need(exported.state==='COMPLETE'&&exported.workspaceId===workspaceId,'The installed native handover did not finish.');
 await stage('complete_installed_handover',{directory:firstHandover,source:exported.source,workspace:exported.workspace,workspaceId});
 const secondDirectory=join(root,'customer-two');
 const second=sameCase(await installed(['install','--directory',secondDirectory,
  '--archive',join(firstHandover,'workspace.datawork'),'--archive-sha256',exported.workspace.sha256,
  '--node',node],'fresh-archive-only-install'));
 service=await start(secondDirectory,'second-server');
 const secondCustomer=await customer(second,'independent-reopen');
 need(secondCustomer.http.sha256===firstCustomer.http.sha256,'Independent receiving changed the original complete customer query.');
 await stop(service);service=null;
 const reopened=sameCase(await installed(['status','--directory',secondDirectory,'--node',node],'second-cold-status'));
 need(JSON.stringify(second.native.selection)===JSON.stringify(reopened.native.selection),'Cold receiving changed the original edition decision.');
 await stage('fresh_independent_customer_reopen',{directory:secondDirectory,workspaceId,publicationId,snapshot,rows:secondCustomer.http.rows,httpPages:secondCustomer.http.pages,nativePages:secondCustomer.native.pages,sha256:secondCustomer.http.sha256,allOriginalCellsCompared:true,applicationFiles:second.source.files});
 const delivery=join(root,'delivery');
 const finalHandover=await installed(['archive','--directory',secondDirectory,'--out',delivery,'--node',node],'final-customer-handover');
 need(finalHandover.state==='COMPLETE'&&finalHandover.workspaceId===workspaceId,'The full continuing customer package did not complete.');
 await copyFile(join(second.source.directory,'stellar/scf-starforge-20261009/sf30-seller-sdk/datagouv/CUSTOMER.md'),join(delivery,'CUSTOMER.md'));
 result.complete=true;result.completedAt=new Date().toISOString();result.finalHandover=finalHandover;result.delivery=delivery;
 await writeFile(resultFile,encoded(result),{mode:0o600});await copyFile(resultFile,join(delivery,'CUSTOMER_RECEIVING_RESULT.json'));
 const zip=join(root,'Datactivist_Complete_Customer_Handover.zip');
 const archiveResult=await runJSON(python,['-B','-c',
  'import hashlib,json,pathlib,sys,zipfile; root=pathlib.Path(sys.argv[1]); out=pathlib.Path(sys.argv[2]); browser=pathlib.Path(sys.argv[3]); members=[]; z=zipfile.ZipFile(out,"w",zipfile.ZIP_DEFLATED,compresslevel=6); files=[(p,"Datactivist_Customer/"+p.relative_to(root).as_posix()) for p in root.rglob("*") if p.is_file() and p.name!=".customer-install.lock"]+[(p,"Datactivist_Customer/browser/"+p.relative_to(browser).as_posix()) for p in browser.rglob("*") if p.is_file()]; [(z.write(p,n),members.append({"path":n,"bytes":p.stat().st_size,"sha256":hashlib.sha256(p.read_bytes()).hexdigest()})) for p,n in sorted(files,key=lambda row:row[1])]; z.writestr("Datactivist_Customer/CONTENTS.json",json.dumps({"schema":"datactivist.customer-delivery-members.v1","files":members},ensure_ascii=False,indent=2)+"\\n"); z.close(); print(json.dumps({"path":str(out),"bytes":out.stat().st_size,"sha256":hashlib.sha256(out.read_bytes()).hexdigest(),"members":len(members)+1}))',
  delivery,zip,join(root,'browser')],'complete-customer-zip');
 result.package=archiveResult;
 await writeFile(resultFile,encoded(result),{mode:0o600});
 process.stdout.write(JSON.stringify({state:'DATACTIVIST_CUSTOMER_RECEIVING_COMPLETE',operationId:operation,workspaceId,publicationId,snapshot,sourceSha256:args.sourceSha256,originalArchiveSha256:args.archiveSha256,result:resultFile,package:archiveResult})+'\n');
}catch(error){
 result.complete=false;result.completedAt=new Date().toISOString();result.error={name:error.name,message:error.message,stack:error.stack};
 await writeFile(resultFile,encoded(result),{mode:0o600});process.stderr.write(encoded(result.error));process.exitCode=1;
}finally{
 await browser?.close();
 if(service){try{await stop(service);}catch(error){process.stderr.write(JSON.stringify({cleanup:error.message})+'\n');process.exitCode=1;}}
}
