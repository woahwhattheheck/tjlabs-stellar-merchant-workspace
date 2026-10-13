// MIT. Installed authenticated invoice customer receiving; authored local case only.
import {promises as fs} from 'node:fs';
import {join,resolve,dirname} from 'node:path';
import {pathToFileURL} from 'node:url';
import {createHash,randomUUID} from 'node:crypto';
import {createServer} from 'node:http';
import {AsyncLocalStorage} from 'node:async_hooks';
import {spawn,execFileSync} from 'node:child_process';
const ROOT=resolve(process.argv[2]),REPO=join(ROOT,'source'),OUT=join(ROOT,'receiving');
const OP='SCF-INVOICE-SETTLEMENT-MCP-CUSTOMER-20261013',DIST='stellar/scf-starforge-20261009/distribution/';
const sha=x=>createHash('sha256').update(x).digest('hex'),enc=x=>JSON.stringify(x,null,2)+'\n';
const need=(v,m)=>{if(!v)throw Error(m);};
async function bytes(name){const p=join(OUT,name),s=await fs.lstat(p);need(s.isFile()&&!s.isSymbolicLink(),'Original retained member is not regular:'+name);return fs.readFile(p);}
async function syncDirectory(p){const h=await fs.open(p,'r');try{await h.sync();}finally{await h.close();}}
async function put(name,value){
 const p=join(OUT,name),b=Buffer.isBuffer(value)?value:Buffer.from(typeof value==='string'?value:enc(value));
 await fs.mkdir(dirname(p),{recursive:true,mode:0o700});
 try{need((await bytes(name)).equals(b),'Original retained member changed:'+name);return {path:p,bytes:b.length,sha256:sha(b)};}catch(e){if(e.code!=='ENOENT')throw e;}
 const temp=p+'.partial-'+randomUUID();let h;
 try{h=await fs.open(temp,'wx',0o600);await h.writeFile(b);await h.sync();await h.close();h=null;
  try{await fs.link(temp,p);}catch(e){if(e.code!=='EEXIST')throw e;need((await bytes(name)).equals(b),'Original retained member changed:'+name);}
  await syncDirectory(dirname(p));
 }finally{await h?.close();await fs.unlink(temp).catch(e=>{if(e.code!=='ENOENT')throw e;});await syncDirectory(dirname(p));}
 return {path:p,bytes:b.length,sha256:sha(b)};
}
async function saved(name){try{return JSON.parse(await bytes(name));}catch(e){if(e.code==='ENOENT')return null;throw e;}}
async function retained(name,make){const v=await saved(name);if(v!==null)return v;const next=await make();await put(name,next);return next;}
await fs.mkdir(OUT,{recursive:true,mode:0o700});
const lockFD=Number(process.env.INVOICE_RECEIVING_LOCK_FD);
need(Number.isInteger(lockFD)&&lockFD>=3,'Run the complete original guarded Python entry.');
const lockStat=await fs.stat('/proc/self/fd/'+lockFD);need(lockStat.isFile(),'Original receiving guard is unavailable.');
const childStdio=()=>{const v=Array.from({length:Math.max(3,lockFD+1)},()=> 'ignore');v[1]='pipe';v[2]='pipe';v[lockFD]=lockFD;return v;};
const phases=[];
async function phase(label,work){let result=await saved('phases/'+label+'.json');if(result!==null){phases.push({label,reused:true});return result;}result=await work();await put('phases/'+label+'.json',result);phases.push({label,reused:false});console.log(JSON.stringify({event:'PHASE_PASS',label}));return result;}
let provider,client,server,sourceServer,sourceRoot,cli,activeFault,sequence=0;
const sockets=new Set(),contexts=new AsyncLocalStorage(),owned=new Set(),sourceTasks=new Set();
const requests=[];let networkRequests=0,sourceSequence=0;const tokenEnv='INVOICE_CUSTOMER_RECEIVING_TOKEN';
function errorView(e){return {code:e.code??null,message:e.message,stack:e.stack};}
async function subprocess(name,command,args,{env=process.env,allowFailure=false}={}){
 need(/^[a-z0-9-]+$/.test(name),'Invalid original command label.');
 const base='commands/'+name;await put(base+'.request.json',{command,args});
 const old=await saved(base+'/complete.json');
 async function resultOf(result){
  const stdout=await bytes(result.stdout.path),stderr=await bytes(result.stderr.path);
  need(stdout.length===result.stdout.bytes&&sha(stdout)===result.stdout.sha256&&stderr.length===result.stderr.bytes&&sha(stderr)===result.stderr.sha256,'Original child output changed:'+name);
  need(allowFailure||result.code===0,'Original command failed:'+name+':'+stderr.toString('utf8').slice(-4000));
  return {...result,stdout:stdout.toString('utf8'),stderr:stderr.toString('utf8'),value:result.code===0&&stdout.toString('utf8').trim()?JSON.parse(stdout):null};
 }
 if(old)return resultOf(old);
 const attempts=join(OUT,base,'attempts');await fs.mkdir(attempts,{recursive:true,mode:0o700});
 const names=(await fs.readdir(attempts)).filter(x=>/^[0-9]{6}$/.test(x)).sort();
 // Recover a supervisor's own returned bytes before considering any same-request retry.
 for(const id of names){const stem=base+'/attempts/'+id;const returned=await saved(stem+'/return.json');if(!returned){const process=await saved(stem+'/process.json'),entered=await saved(stem+'/entered.json');if(entered){need(process&&Number.isInteger(process.procPid),'Original entered child has no self-reported proc identity; reconcile its original attempt.');need(process.bootId===(await fs.readFile('/proc/sys/kernel/random/boot_id','utf8')).trim()&&process.pidNamespace===await fs.readlink('/proc/self/ns/pid'),'Original child host closure requires reconciliation.');let live=false;try{const raw=await fs.readFile('/proc/'+process.procPid+'/stat','utf8');live=raw.slice(raw.lastIndexOf(')')+1).trim().split(/\s+/)[19]===process.start;}catch(e){if(e.code!=='ENOENT')throw e;}need(!live,'Original child is still active.');}continue;}
  const raw=await bytes(stem+'/request.json');need(returned.requestSha256===sha(raw),'Original command return bound to different request.');
  if(returned.exitCode===0||allowFailure){const r={code:returned.exitCode,signal:null,attempt:id,stdout:{path:stem+'/stdout.log',...returned.stdout},stderr:{path:stem+'/stderr.log',...returned.stderr}};
   await resultOf(r);await put(base+'/complete.json',r);return resultOf(r);}
 }
 const id=String(names.length?Number(names.at(-1))+1:1).padStart(6,'0'),stem=base+'/attempts/'+id;
 await put(stem+'/request.json',{argv:[command,...args],cwd:ROOT,timeoutSeconds:180});
 const python=process.env.CODEX_PRIMARY_RUNTIME_PYTHON||'python3';
 const child=spawn(python,[join(ROOT,'invoice-receiving-supervisor.py'),join(OUT,stem,'request.json')],{env,stdio:childStdio(),cwd:ROOT});
 owned.add(child);
 try{
  // Supervisor output is only a receipt; actual command logs are fsynced by that independent process.
  child.stdout.resume();child.stderr.on('data',x=>process.stderr.write(x));
  await new Promise((done,reject)=>{child.once('error',reject);child.once('close',done);});
  const returned=await saved(stem+'/return.json');need(returned,'Original child has no durable return; preserve this attempt.');
  need(returned.requestSha256===sha(await bytes(stem+'/request.json')),'Original child return changed its request.');
  const r={code:returned.exitCode,signal:null,attempt:id,stdout:{path:stem+'/stdout.log',...returned.stdout},stderr:{path:stem+'/stderr.log',...returned.stderr}};
  const value=await resultOf(r);await put(base+'/complete.json',r);return value;
 }finally{if(!child.pid||child.exitCode!==null||child.signalCode!==null)owned.delete(child);}
}
async function drain(){
 const failures=[];
 const attempt=async(label,close)=>{try{await close();}catch(error){failures.push({label,error:errorView(error)});}};
 for(const child of [...owned])await attempt('child',async()=>{
  if(child.exitCode===null&&child.signalCode===null){child.kill('SIGTERM');await new Promise(r=>child.once('close',r));}
  owned.delete(child);
 });
 await attempt('customer',async()=>{if(client){await client.disconnect();client=null;}});
 await attempt('provider',async()=>{if(provider){await provider.close();provider=null;}});
 await attempt('mcp',async()=>{if(server){server.closeAllConnections?.();await new Promise((r,j)=>server.close(e=>e&&e.code!=='ERR_SERVER_NOT_RUNNING'?j(e):r()));server=null;}});
 await attempt('source',async()=>{if(sourceServer){sourceServer.closeAllConnections?.();await new Promise((r,j)=>sourceServer.close(e=>e&&e.code!=='ERR_SERVER_NOT_RUNNING'?j(e):r()));sourceServer=null;}await Promise.all([...sourceTasks]);});
 delete process.env[tokenEnv];
 if(failures.length){await put('drain-failures/'+randomUUID()+'.json',{failures});throw Object.assign(Error('Original resources did not all close'),{code:'INVOICE_DRAIN_INCOMPLETE',failures});}
 return {ownedChildren:0,customerClosed:true,providerClosed:true,mcpClosed:true,sourceClosed:true,activeFileReads:0};
}
async function completeOffline(){
 const result=await saved('COMPLETE.json');if(!result)return false;
 need(result.operationId===OP&&result.status==='PASS'&&result.phases?.length===18,'Original completed programme identity differs.');
 for(const row of result.checkpointFiles||[]){const raw=await bytes(row.path);need(raw.length===row.bytes&&sha(raw)===row.sha256,'Original complete checkpoint differs:'+row.path);}
 need(result.checkpointFiles?.length>=18,'Complete checkpoint inventory is absent; inspect the original retained completion.');
 console.log(JSON.stringify({event:'COMPLETE_REOPENED',root:ROOT,phases:18,workspaceId:result.workspaceId,networkRequests:0}));
 return true;
}
try{
 if(!await completeOffline()){
 const installation=await phase('01-original-build-and-install',async()=>{
  const git=(...args)=>execFileSync('git',args,{cwd:REPO,encoding:'utf8',env:{...process.env,GIT_CONFIG_NOSYSTEM:'1'}}).trim();
  try{git('rev-parse','--verify','HEAD');}catch{
   git('init','-q');git('add','--all');git('-c','user.name=Source receiving','-c','user.email=source-receiving@example.invalid','commit','-q','-m',OP+' complete source snapshot');
  }
  const {buildDistribution}=await import(pathToFileURL(join(REPO,DIST+'build.mjs')));
  const build=await retained('build.json',()=>buildDistribution({repository:REPO,ref:git('rev-parse','HEAD'),output:join(ROOT,'distribution'),selection:'invoice-settlement-customer',offline:true,resume:true,python:process.env.CODEX_PRIMARY_RUNTIME_PYTHON??'python3'}));
  await put('build.json',build);
  const {prepareRuntimeInstall,installRuntime,inspectRuntimeInstall}=await import(pathToFileURL(join(REPO,DIST+'runtime-install.mjs')));
  const directory=join(ROOT,'installed');try{await fs.access(join(directory,'runtime-install.json'));}catch{await prepareRuntimeInstall({directory,archive:build.archive,sha256:build.sha256,python:process.env.CODEX_PRIMARY_RUNTIME_PYTHON??'python3'});}
  const installed=await installRuntime({directory,offline:true});
  need(installed.status==='READY','The actual runtime was not installed.');
  const checked=await inspectRuntimeInstall({directory,load:true,source:true});
  await retained('installation-inspection.json',async()=>checked);
  return {sourceCommit:build.sourceCommit,archive:build.archive,archiveSha256:build.sha256,sourceRoot:installed.sourceRoot,packageRoot:join(directory,'package'),directory};
 });
 sourceRoot=installation.sourceRoot;const P=join(sourceRoot,'stellar-forge/mcp-merchant-operator');
 cli=join(P,'invoice-settlement-cli.mjs');
 const [{default:declaration},clientModule,ops,download,{createMcpToolHandler}]=await Promise.all([
  import(pathToFileURL(join(P,'providers/invoice-settlement-workspaces.mjs'))),
  import(pathToFileURL(join(P,'invoice-settlement-client.mjs'))),import(pathToFileURL(join(P,'invoice-settlement-operations.mjs'))),
  import(pathToFileURL(join(P,'invoice-settlement-download.mjs'))),import(pathToFileURL(join(sourceRoot,'stellar-forge/mcp-paid-agent/http-tools.mjs')))]);
 await phase('02-installed-catalogue-and-types',async()=>{
  const pkg=JSON.parse(await fs.readFile(join(installation.packageRoot,'package.json'),'utf8'));
  need(pkg.bin['invoice-settlement-customer']&&pkg.bin['stellar-invoice-settlement'],'Original installed commands absent.');
  const types=[];
  for(const sub of ['client','operations','download']){const item=pkg.exports['./merchant/invoice-settlement/'+sub];need(item?.types&&item?.import,'Typed installed export absent.');
   const bytes=await fs.readFile(join(installation.packageRoot,item.types));types.push({sub,bytes:bytes.length,sha256:sha(bytes)});
   await import(pathToFileURL(join(installation.packageRoot,item.import)));
  }
  const toolList=await subprocess('installed-tools',process.execPath,[cli,'tools']);need(toolList.value.tools.length===13,'Installed catalogue incomplete.');
  return {provider:declaration.id,package:pkg.name,types,toolCount:toolList.value.tools.length};
 });
 async function originalOnline(){
 for(const name of ['workspace','exports','inputs','server','operations'])await fs.mkdir(join(OUT,name),{recursive:true,mode:0o700});
 function account(byte){const payload=Buffer.concat([Buffer.from([48]),Buffer.alloc(32,byte)]);let crc=0;for(const n of payload){crc^=n<<8;for(let j=0;j<8;j++)crc=((crc<<1)^((crc&32768)?0x1021:0))&65535;}const raw=Buffer.concat([payload,Buffer.from([crc&255,crc>>8])]),alphabet='ABCDEFGHIJKLMNOPQRSTUVWXYZ234567';let out='',acc=0,bits=0;for(const n of raw){acc=(acc<<8)|n;bits+=8;while(bits>=5){bits-=5;out+=alphabet[(acc>>>bits)&31];}}if(bits)out+=alphabet[(acc<<(5-bits))&31];return out;}
 const DEST=account(11),SENDER=account(22),network='Test SDF Network ; September 2015';
 const payment={id:'1001',paging_token:'1001',type:'payment',type_i:1,source_account:SENDER,from:SENDER,to:DEST,amount:'10.0000000',asset_type:'native',transaction_hash:sha('invoice-customer-authored-case'),transaction_successful:true,created_at:'2026-10-13T00:00:00Z',transaction:{hash:sha('invoice-customer-authored-case'),ledger:101,successful:true,memo_type:'text',memo:'INV-ONE'}};
 await put('fixture.json',{scope:'Authored local-only API receiving case; zero external customer/provider/payment operations.',payment,network});
 const sourceEndpoint=await saved('server/source-endpoint.json');
 const sourceNames=(await fs.readdir(join(OUT,'source-http')).catch(e=>{if(e.code!=='ENOENT')throw e;return [];})).filter(x=>/^[0-9]{6}\.json$/.test(x)).sort();
 for(const name of sourceNames)requests.push(await saved('source-http/'+name));
 sourceSequence=sourceNames.length?Number(sourceNames.at(-1).slice(0,6)):0;
 sourceServer=createServer((req,res)=>{const task=(async()=>{const u=new URL(req.url,'http://127.0.0.1');const observed={method:req.method,path:u.pathname,query:Object.fromEntries(u.searchParams)};const ordinal=++sourceSequence;await put('source-http/'+String(ordinal).padStart(6,'0')+'.json',observed);requests.push(observed);let value,status=200;
  if(req.method!=='GET'){value={error:'read only'};status=405;}
  else if(u.pathname==='/')value={network_passphrase:network,history_latest_ledger:500,history_elder_ledger:1};
  else if(u.pathname==='/accounts/'+DEST+'/payments'){const rows=Number(u.searchParams.get('cursor')||0)<1001?[payment]:[];const next=new URL(req.url,'http://127.0.0.1:'+sourceServer.address().port);next.searchParams.set('cursor','1001');value={_embedded:{records:rows},_links:{next:{href:next.href}}};}
  else {status=404;value={error:'unknown authored route'};}
  res.writeHead(status,{'Content-Type':'application/json'});res.end(JSON.stringify(value));
 })();sourceTasks.add(task);task.catch(error=>{res.destroy(error);}).finally(()=>sourceTasks.delete(task)); });
 await new Promise((r,j)=>{sourceServer.once('error',j);sourceServer.listen(sourceEndpoint?.port??0,'127.0.0.1',r);});
 await put('server/source-endpoint.json',{port:sourceServer.address().port});
 const connections={horizon:{provider:'horizon',baseUrl:'http://127.0.0.1:'+sourceServer.address().port,network:'stellar:testnet',allowHttp:true}};
 await put('server/native-connections.json',connections);
 await put('server/aliases.json',{schema:'stellar-forge.invoice-workspace-connection.v1',workspaces:{receiving:{directory:join(OUT,'workspace'),label:'Authored installed Invoice & Settlement customer case',connectionsFile:join(OUT,'server/native-connections.json'),inputs:{register:{file:join(OUT,'inputs/register.json'),label:'Authored invoice deposit register'}}}}});
 const resolved=await declaration.configuration.read(join(OUT,'server/aliases.json'),{hostPath:x=>x});
 provider=await declaration.create(await declaration.load(),{invoiceWorkspaces:resolved,exportsDirectory:join(OUT,'exports')});
 const token=randomUUID()+randomUUID();process.env[tokenEnv]=token;
 const priorRequests=(await fs.readdir(join(OUT,'http')).catch(e=>{if(e.code!=='ENOENT')throw e;return [];})).filter(x=>/^[0-9]{6}\.request\.json$/.test(x)).sort();sequence=priorRequests.length?Number(priorRequests.at(-1).slice(0,6)):0;networkRequests=priorRequests.length;
 const protocol={tools:clientModule.invoiceTools(),async call(name,args){const id=String(++sequence).padStart(6,'0'),request={name,args};networkRequests++;
   await put('http/'+id+'.request.json',request);
   try{const value=await provider.call(name,args);await put('http/'+id+'.response.json',{requestSha256:sha(enc(request)),value});
    if(activeFault?.name===name&&(!activeFault.requestId||args.requestId===activeFault.requestId||args.args?.requestId===activeFault.requestId)&&!await saved('faults/'+activeFault.label+'.json')){
     await put('faults/'+activeFault.label+'.json',{request,value,effectReturned:true,responseDelivered:false});
     contexts.getStore().response.destroy();throw Object.assign(Error('Deliberately interrupted original received response'),{code:'RECEIVING_RESPONSE_LOSS'});
    }
    return value;
   }catch(e){await put('http/'+id+'.error.json',errorView(e));throw e;}
 }};
 const handler=createMcpToolHandler(protocol,{bearerToken:token,serverName:'invoice-settlement-original-customer',serverVersion:'1.0.0'});
 server=createServer((request,response)=>{response.on('error',()=>{});contexts.run({response},()=>handler(request,response));});
 server.on('connection',socket=>{sockets.add(socket);socket.on('close',()=>sockets.delete(socket));});
 const oldEndpoint=await saved('server/mcp-endpoint.json');await new Promise((r,j)=>{server.once('error',j);server.listen(oldEndpoint?.port??0,'127.0.0.1',r);});
 const endpoint={url:'http://127.0.0.1:'+server.address().port+'/mcp',port:server.address().port};await put('server/mcp-endpoint.json',endpoint);
 const bound=await phase('03-authenticated-original-workspace',async()=>{
  const rejected=await fetch(endpoint.url,{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify({jsonrpc:'2.0',id:1,method:'tools/list',params:{}})});need(rejected.status===401,'Unauthenticated endpoint accepted a request.');
  const result=await ops.bindInvoiceCustomerConnection({connection:{...ops.invoiceCustomerConnectionTemplate(),url:endpoint.url,workspace:'receiving',tokenEnv}});
  await put('connection.json',result.connection);return result;
 });
 client=await clientModule.openInvoiceMerchantClient({...bound.connection});await client.open();
 async function operation(label,tool,make,{lost=false,cliRun=false}={}){
  const selected=await retained('selected/'+label+'.json',async()=>({tool,args:await make()}));
  const directory=join(OUT,'operations',label);
  await ops.prepareInvoiceOperation({directory,operationId:OP+'.'+label,connection:bound.connection,tool:selected.tool,arguments:selected.args});
  if(lost&&!await saved('faults/'+label+'.json')){
   activeFault={name:'merchant_invoice_'+tool,requestId:selected.args.requestId??selected.args.args?.requestId,label};
   let failure;try{await ops.executeInvoiceOperation({directory,client});}catch(e){failure=errorView(e);}activeFault=null;
   need(failure&&await saved('faults/'+label+'.json'),'Original response loss did not occur.');await put('faults/'+label+'.client.json',failure);
  }
  if(cliRun)return (await subprocess(label,process.execPath,[cli,'run','--directory',directory])).value.value;
  return (await ops.executeInvoiceOperation({directory,client})).value;
 }
 async function change(label,method,body,options={}){return operation(label,'change',async()=>({method,args:{...body,requestId:randomUUID(),expectedRevision:(await client.status()).native.revision}}),options);}
 const definition={schema:'stellar-forge.invoice-programme.v1',name:'Authored original customer invoice',merchantId:'local-receiving-only',networks:['stellar:testnet'],assets:[{id:'xlm',network:'stellar:testnet',type:'stellar',code:'XLM',decimals:7}],invoices:[{id:'INV-ONE',assetId:'xlm',amount:'10.0000000',dueAt:null,orderIds:[],references:[]}]};
 const programme=(await phase('04-programme-response-loss-and-cli-recovery',()=>change('programme','programme.save',{definition},{lost:true,cliRun:true}))).value;
 const selection={programmeId:programme.programmeId,programmeVersion:programme.version};
 await phase('05-original-request-and-offline-reopen',async()=>{
  const request=await saved('selected/programme.json'),before=await client.status(),read=await client.read('request.status',{requestId:request.args.args.requestId});
  need(read.value.record?.result.programmeId===programme.programmeId,'Original request lookup lost its native result.');
  const bad=await subprocess('complete-offline-reopen',process.execPath,[cli,'run','--directory',join(OUT,'operations/programme')],{env:{...process.env,[tokenEnv]:''}});
  need(bad.value.networkRequests===0,'Complete operation reopened a connection.');
  const after=await client.status();need(before.native.revision===after.native.revision,'Reopen advanced original revision.');return {request:read.value,offline:bad.value};
 });
 const original=(await client.read('programme.read',{programmeId:programme.programmeId,version:programme.version})).value;
 const capture=(await phase('06-original-native-capture-start',()=>change('capture-start','capture.start',{...selection,connectionAlias:'horizon',read:{kind:'payments',filters:{accountId:DEST,order:'asc',include_failed:true,join:'transactions'},pageSize:2},selection:{fromLedger:1,throughLedger:500}}))).value;
 const captured=(await phase('07-original-complete-capture',()=>change('capture-run','capture.run',{captureId:capture.captureId}))).value;
 need(captured.status==='COMPLETE','Original source capture did not complete.');
 const state=(await client.status()).value,sourceIds=state.captures[capture.captureId].sources;
 await put('inputs/register.json',{schema:'stellar-forge.horizon-invoice-register.v1',programmeId:original.id,programmeVersion:original.version,programmeSha256:original.sha256,entries:[{id:'INV-ONE',invoiceId:'INV-ONE',role:'collection',account:DEST,fromAccount:SENDER,memo:{type:'text',value:'INV-ONE'},note:'Authored original local terms.'}]});
 const imported=(await phase('08-host-input-import',async()=>{
  const input=await client.inputs({input:'register'});
  let failure;try{await client.importSource({input:'register',expectedSha256:'0'.repeat(64),args:{requestId:randomUUID(),expectedRevision:(await client.status()).native.revision,provider:'document',kind:'horizon-invoice-register'}});}catch(e){failure=errorView(e);}
  need(failure,'Changed source SHA accepted.');
  return operation('register','import',async()=>({input:'register',expectedSha256:input.sha256,args:{...selection,requestId:randomUUID(),expectedRevision:(await client.status()).native.revision,provider:'document',kind:'horizon-invoice-register'}}));
 })).value;
 const reviewedSelection={...selection,registerSourceId:imported.sourceId,sourceIds};
 const review=(await phase('09-native-horizon-review',()=>client.read('horizon.review',reviewedSelection))).value;
 need(review.summary.candidates===1&&review.rows.length===1,'Native original deposit review differs.');
 const decision=(await phase('10-atomic-decision-response-loss',()=>change('horizon-decisions','horizon.apply',{...reviewedSelection,reviewSha256:review.reviewSha256,actor:'Local receiving operator',choices:[{movementId:review.rows[0].movementId,mappingId:'INV-ONE',reason:'Exact authored original account, memo, issuer and amount.'}]},{lost:true}))).value;
 need(decision.decisionIds.length===1&&decision.providerRequests===0&&decision.ledgerMutations===0,'Original decision writer changed its effect.');
 const reconciliation=(await phase('11-complete-reconciliation',()=>change('reconciliation','reconciliation.create',{...selection,sourceIds,asOf:'2026-10-13T06:00:00Z',name:'Authored customer invoice reconciliation'}))).value;
 const reports=(await phase('12-complete-reports',()=>change('reports','report.create',{reconciliationId:reconciliation.reconciliationId,formats:['html','json','csv']}))).value;
 await phase('13-stable-complete-history',async()=>{const x=await client.history({limit:2});need(x.complete&&x.pages.length>1,'Original history was not fully paged.');return x;});
 const exported=await phase('14-export-response-loss',()=>operation('export','export',async()=>({requestId:randomUUID(),expectedRevision:(await client.status()).native.revision,kind:'workspace'}),{lost:true}));
 const publicationId=exported.publication.id;
 const inspected=await phase('15-complete-publication-inspection',()=>download.inspectInvoicePublication({client,publicationId}));
 await phase('16-complete-original-download',async()=>{
  const result=await download.downloadInvoicePublication({client,publicationId,directory:join(OUT,'download'),expectedManifestSha256:inspected.manifestSha256,chunkSize:49152});
  const verified=await download.verifyInvoiceDownload({directory:join(OUT,'download'),publicationId,expectedManifestSha256:inspected.manifestSha256});
  need(verified.files===exported.files.length&&verified.files>100,'Complete original export members were not downloaded.');
  return {result,verified};
 });
 return {bound,selection,reviewedSelection,decision,reconciliation,reports,exported,inspected};
 }
 async function recoveredOnline(){
  if(!await saved('phases/16-complete-original-download.json'))return originalOnline();
  const read=label=>saved('phases/'+label+'.json');
  const bound=await read('03-authenticated-original-workspace'),programme=(await read('04-programme-response-loss-and-cli-recovery')).value;
  const selected=(await saved('selected/horizon-decisions.json')).args.args;
  const reviewedSelection={programmeId:selected.programmeId,programmeVersion:selected.programmeVersion,registerSourceId:selected.registerSourceId,sourceIds:selected.sourceIds};
  const result={bound,selection:{programmeId:programme.programmeId,programmeVersion:programme.version},reviewedSelection,
   decision:(await read('10-atomic-decision-response-loss')).value,reconciliation:(await read('11-complete-reconciliation')).value,
   reports:(await read('12-complete-reports')).value,exported:await read('14-export-response-loss'),inspected:await read('15-complete-publication-inspection')};
  need(result.bound&&result.inspected&&result.exported,'Original online completion is incomplete.');
  return result;
 }
 const onlineResult=await retained('online-result.json',recoveredOnline);
 const {bound,selection,reviewedSelection,decision,reconciliation,reports,exported,inspected}=onlineResult;
 const publicationId=exported.publication.id;
 const stopped=await drain();await put('drain.json',stopped);
 const sourceFiles=(await fs.readdir(join(OUT,'source-http')).catch(e=>{if(e.code!=='ENOENT')throw e;return [];})).filter(x=>/^[0-9]{6}\.json$/.test(x)).sort();
 const completeRequests=[];for(const name of sourceFiles)completeRequests.push(await saved('source-http/'+name));await put('source-http.json',completeRequests);
 const received=await phase('17-offline-native-cold-receive',async()=>{
  const request=await retained('receive-request.json',async()=>({publicationId,requestId:randomUUID(),destination:join(OUT,'received'),directory:join(OUT,'download'),expectedManifestSha256:inspected.manifestSha256}));
  return download.receiveInvoicePackage(request);
 });
 await phase('18-independent-installed-cli-reopen',async()=>{
  const verify=await subprocess('offline-verify',process.execPath,[cli,'verify','--directory',join(OUT,'download'),'--publication-id',publicationId],{env:{...process.env,[tokenEnv]:''}});
  need(verify.value.state==='VERIFIED'&&verify.value.networkRequests===0,'Offline verification used the endpoint.');
  const childSource="import {openInvoiceSettlementOperator} from "+JSON.stringify(pathToFileURL(join(received.result.application.directory,'stellar/scf-starforge-20261009/sf30-seller-sdk/invoice-settlement/operator.mjs')).href)+";const o=await openInvoiceSettlementOperator({workspaceDirectory:"+JSON.stringify(received.result.workspace.directory)+"});try{const s=await o.describe();const r=await o.invoke({method:'horizon.review',args:"+JSON.stringify(reviewedSelection)+"});if(s.workspaceId!=="+JSON.stringify(bound.connection.workspaceId)+"||Object.keys(s.decisions).length!==1||r.summary.blocked!==1)throw Error('Original received state changed');console.log(JSON.stringify({workspaceId:s.workspaceId,decisions:Object.keys(s.decisions).length,review:r.summary}));}finally{await o.close();}";
  await put('cold-reopen.mjs',childSource);const child=await subprocess('cold-reopen',process.execPath,['--max-old-space-size=128',join(OUT,'cold-reopen.mjs')]);return {verification:verify.value,received:child.value};
 });
 const checkpointNames=(await fs.readdir(join(OUT,'phases'))).filter(x=>x.endsWith('.json')).sort().map(x=>'phases/'+x);
 need(checkpointNames.length===18,'Original eighteen phases are incomplete.');checkpointNames.push('online-result.json','drain.json','source-http.json');
 const checkpointFiles=[];for(const path of checkpointNames){const raw=await bytes(path);checkpointFiles.push({path,bytes:raw.length,sha256:sha(raw)});}
 const authenticatedMcpCalls=(await fs.readdir(join(OUT,'http'))).filter(x=>x.endsWith('.request.json')).length;
 const complete={schema:'commons.invoice-settlement-customer-receiving.v1',operationId:OP,status:'PASS',phases:checkpointNames.filter(x=>x.startsWith('phases/')).map(x=>({label:x.slice(7,-5)})),checkpointFiles,completedAt:new Date().toISOString(),
  installation,workspaceId:bound.connection.workspaceId,programme:selection,decisionIds:decision.decisionIds,reconciliationId:reconciliation.reconciliationId,reportId:reports.reportId,
  publicationId,publicationManifestSha256:inspected.manifestSha256,received,authenticatedMcpCalls,localSourceRequests:completeRequests.length,externalProviderRequests:0,ledgerMutations:0,drained:stopped};
 await put('COMPLETE.json',complete);console.log(JSON.stringify({event:'COMPLETE',root:ROOT,phases:18,workspaceId:bound.connection.workspaceId}));
 }
}catch(error){await put('failures/'+randomUUID()+'.json',{operationId:OP,error:errorView(error),phases});console.error(enc(errorView(error)));process.exitCode=1;}
finally{let closed=false;try{await drain();closed=true;}catch(e){console.error(enc(errorView(e)));process.exitCode=1;}console.log(JSON.stringify({event:closed?'OWNED_DRAIN_COMPLETE':'OWNED_DRAIN_INCOMPLETE',exitCode:process.exitCode??0}));}
