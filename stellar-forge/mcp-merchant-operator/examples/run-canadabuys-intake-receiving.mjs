#!/usr/bin/env node
// MIT. Complete installed CanadaBuys customer receiving on the original MCP/native application.
import { constants } from 'node:fs';
import { open, readFile, readdir, mkdir, lstat, realpath, link, unlink } from 'node:fs/promises';
import { createHash, randomUUID } from 'node:crypto';
import { resolve, dirname, join, relative, basename, isAbsolute } from 'node:path';
import { pathToFileURL } from 'node:url';
import { createServer } from 'node:http';
import { AsyncLocalStorage } from 'node:async_hooks';
import { spawn } from 'node:child_process';
import { once } from 'node:events';

const SCHEMA='commons.canadabuys-installed-intake-receiving.v1';
const OP='CANADABUYS-INSTALLED-INTAKE-6BA15-20261013';
const PREFIX='merchant_canadabuys_';
const sha=bytes=>createHash('sha256').update(bytes).digest('hex');
function sorted(value){return Array.isArray(value)?value.map(sorted):value&&typeof value==='object'?Object.fromEntries(Object.keys(value).sort().map(key=>[key,sorted(value[key])])):value;}
const same=(a,b)=>JSON.stringify(sorted(a))===JSON.stringify(sorted(b));
const encoded=value=>Buffer.from(JSON.stringify(value,null,2)+'\n');
const now=()=>new Date().toISOString();
function need(value,message,details){if(!value)throw Object.assign(new Error(message),{code:'CUSTOMER_RECEIVING',details});}
function safeRelative(value){need(typeof value==='string'&&value&&value.length<2048&&!isAbsolute(value)&&!/[\\:\0\r\n]/.test(value)&&value.split('/').every(p=>p&&p!=='.'&&p!=='..'),'Use an original relative receiving path');return value;}
function parse(argv){const a={};for(let i=0;i<argv.length;i+=2){need(/^--[a-z-]+$/.test(argv[i]||'')&&argv[i+1]!==undefined&&!Object.hasOwn(a,argv[i].slice(2)),'Use complete unique receiving options');a[argv[i].slice(2)]=argv[i+1];}
 for(const key of ['package-root','command','installation-receipt','source-manifest','input','out'])need(typeof a[key]==='string','Missing --'+key);
 need(Object.keys(a).every(k=>['package-root','command','installation-receipt','source-manifest','input','out'].includes(k)),'Unknown receiving option');return a;}
async function privateDirectory(path){await mkdir(path,{recursive:true,mode:0o700});const s=await lstat(path);need(s.isDirectory()&&!s.isSymbolicLink()&&!(s.mode&0o077)&&await realpath(path)===path,'Receiving directory must be canonical and private',{path});return path;}
async function originalBytes(path,maximum=128*1024*1024){const h=await open(path,constants.O_RDONLY|(constants.O_NOFOLLOW??0));try{const before=await h.stat({bigint:true});need(before.isFile()&&before.size<=BigInt(maximum),'Expected a bounded original file',{path});const bytes=await h.readFile(),after=await h.stat({bigint:true});need(BigInt(bytes.length)===after.size&&['dev','ino','size','mtimeNs','ctimeNs'].every(k=>before[k]===after[k]),'Original file changed while read',{path});return bytes;}finally{await h.close();}}
async function syncDirectory(path){const h=await open(path,constants.O_RDONLY);try{await h.sync();}finally{await h.close();}}
async function immutable(path,bytes){bytes=Buffer.isBuffer(bytes)?bytes:encoded(bytes);await privateDirectory(dirname(path));try{const old=await originalBytes(path,Math.max(bytes.length,1));need(old.equals(bytes),'An original receiving member differs',{path});return;}catch(e){if(e.code!=='ENOENT')throw e;}
 const temporary=join(dirname(path),'.original-'+randomUUID());const h=await open(temporary,'wx',0o600);try{await h.writeFile(bytes);await h.sync();}finally{await h.close();}
 try{try{await link(temporary,path);}catch(e){if(e.code!=='EEXIST')throw e;need((await originalBytes(path,Math.max(bytes.length,1))).equals(bytes),'Concurrent original publication differs',{path});}await syncDirectory(dirname(path));}finally{await unlink(temporary);}}
async function json(path){return JSON.parse(new TextDecoder('utf-8',{fatal:true}).decode(await originalBytes(path)));}
async function optional(path){try{return await json(path);}catch(e){if(e.code==='ENOENT')return null;throw e;}}
async function identity(path){const bytes=await originalBytes(path);return{bytes:bytes.length,sha256:sha(bytes)};}
function errorView(e){return {code:e?.code??'ERROR',message:e?.message??String(e),...(e?.details===undefined?{}:{details:e.details}),...(e?.applied===undefined?{}:{applied:e.applied}),...(e?.stack?{stack:e.stack}: {})};}
function uuid(label){const h=sha(Buffer.from(OP+'\n'+label));return h.slice(0,8)+'-'+h.slice(8,12)+'-4'+h.slice(13,16)+'-8'+h.slice(17,20)+'-'+h.slice(20,32);}
const recordId=(kind,label)=>kind+'-'+uuid(label);
const commandId=label=>OP+':'+label;
function emit(event,fields={}){process.stdout.write(JSON.stringify({event,operationId:OP,at:now(),...fields})+'\n');}

export async function main(argv=process.argv.slice(2)){
 const a=parse(argv),root=resolve(a.out),pkg=await realpath(resolve(a['package-root'])),cli=await realpath(resolve(a.command));
 await privateDirectory(root);const path=name=>join(root,safeRelative(name));
 const sourceRoot=join(pkg,'source');
 const providerRoot=join(sourceRoot,'stellar-forge/mcp-merchant-operator');
 const nativeRoot=join(sourceRoot,'stellar/scf-starforge-20261009/sf30-seller-sdk/canadabuys');
 const [{acquireStateLease},clientModule,operationModule,downloadModule,providerModule,httpModule,{CanadaBuysWorkspace}]=await Promise.all([
  import(pathToFileURL(join(sourceRoot,'stellar/scf-starforge-20261009/merchant-fleet-gateway/state-lease.mjs'))),
  import(pathToFileURL(join(providerRoot,'canadabuys-client.mjs'))),
  import(pathToFileURL(join(providerRoot,'canadabuys-operations.mjs'))),
  import(pathToFileURL(join(providerRoot,'canadabuys-download.mjs'))),
  import(pathToFileURL(join(providerRoot,'canadabuys-workspace.mjs'))),
  import(pathToFileURL(join(sourceRoot,'stellar-forge/mcp-paid-agent/http-tools.mjs'))),
  import(pathToFileURL(join(nativeRoot,'workspace.mjs'))),
 ]);
 const lease=await acquireStateLease(root);
 const {openCanadaBuysMerchantClient,canadaBuysTools}=clientModule;
 const {prepareCanadaBuysOperation,executeCanadaBuysOperation,showCanadaBuysOperation,adoptCanadaBuysPublication,bindCanadaBuysCustomerConnection}=operationModule;
 const {downloadCanadaBuysPublication,inspectCanadaBuysPublication,verifyCanadaBuysDownload,receiveCanadaBuysPackage}=downloadModule;
 const {MerchantCanadaBuysWorkspaces,readCanadaBuysWorkspaceConfiguration}=providerModule;
 const {createMcpToolHandler}=httpModule;
 const children=new Set(),clients=new Set(),sockets=new Set(),httpContext=new AsyncLocalStorage();
 let server=null,provider=null,connection=null,client=null,activeFault=null,sequence=0,pending=0,mainError=null,drain=null;
 const valueAt=name=>optional(path(name));
 const save=(name,value)=>immutable(path(name),value);
 async function retained(name,build){const old=await valueAt(name);if(old)return old;const value=await build();await save(name,value);return value;}
 async function phase(name,build){const old=await valueAt('phases/'+name+'.json');if(old){need(old.schema===SCHEMA+'.phase'&&old.operationId===OP&&old.name===name,'Saved phase differs');emit('PHASE_REUSED',{phase:name});return old.value;}
  emit('PHASE_STARTED',{phase:name});const value=await build();await save('phases/'+name+'.json',{schema:SCHEMA+'.phase',operationId:OP,name,completedAt:now(),value});emit('PHASE_COMPLETE',{phase:name});return value;}
 async function expectFailure(name,operation,accept){const old=await valueAt('observations/'+name+'.json');if(old)return old;let selected;try{await operation();}catch(e){selected=e;}need(selected&&accept(selected),'Expected the original receiving boundary',{name,error:selected&&errorView(selected)});const result={at:now(),error:errorView(selected)};await save('observations/'+name+'.json',result);return result;}
 async function cliCommand(name,args,{offline=false,allowFailure=false}={}){
  const selected=await retained('cli/'+name+'.request.json',async()=>({schema:SCHEMA+'.cli-request',operationId:OP,command:[process.execPath,cli,...args],offline}));
  need(same(selected.command,[process.execPath,cli,...args])&&selected.offline===offline,'Original installed CLI request changed');
  const old=await valueAt('cli/'+name+'.result.json');if(old){need(same(old.request,selected),'Original CLI result changed');return old;}
  need(!await valueAt('cli/'+name+'.entered.json'),'The original CLI attempt has no terminal receipt; preserve its original operation and reconcile its owned process before dispatch',{name});
  await save('cli/'+name+'.entered.json',{schema:SCHEMA+'.cli-entered',operationId:OP,request:selected,at:now()});
  const env={...process.env};if(offline)delete env.CANADABUYS_INTAKE_RECEIVING_TOKEN;
  const child=spawn(process.execPath,[cli,...args],{env,stdio:['ignore','pipe','pipe'],cwd:root});children.add(child);
  const stdout=[],stderr=[];let size=0;
  child.stdout.on('data',b=>{size+=b.length;if(size>128*1024*1024)child.kill('SIGTERM');else stdout.push(b);});
  child.stderr.on('data',b=>{size+=b.length;if(size>128*1024*1024)child.kill('SIGTERM');else stderr.push(b);});
  let code,signal;const timer=setTimeout(()=>child.kill('SIGTERM'),120000),killer=setTimeout(()=>child.kill('SIGKILL'),125000);
  try{[code,signal]=await once(child,'close');}finally{clearTimeout(timer);clearTimeout(killer);children.delete(child);}
  const out=Buffer.concat(stdout),err=Buffer.concat(stderr);await save('cli/'+name+'.stdout.json',out);await save('cli/'+name+'.stderr.log',err);
  let value=null;try{value=JSON.parse(out.toString('utf8'));}catch{}
  const result={request:selected,code,signal,stdout:{bytes:out.length,sha256:sha(out)},stderr:{bytes:err.length,sha256:sha(err)},value,completedAt:now()};
  await save('cli/'+name+'.result.json',result);need(allowFailure||code===0&&value,'Original installed CLI did not complete',{name,code,signal,error:err.toString('utf8').slice(-4000)});return result;
 }
 async function closeAll(){
  const failures=[];for(const child of children){try{child.kill('SIGTERM');await Promise.race([once(child,'close'),new Promise((_,reject)=>setTimeout(()=>{child.kill('SIGKILL');reject(Error('Owned CLI failed to drain'));},10000))]);}catch(e){failures.push(errorView(e));}}
  for(const c of clients){try{await c.disconnect();}catch(e){failures.push(errorView(e));}}
  if(provider){try{await provider.close();}catch(e){failures.push(errorView(e));}}
  if(server){try{const closed=new Promise((res,rej)=>server.close(e=>e?rej(e):res()));server.closeIdleConnections?.();await closed;}catch(e){failures.push(errorView(e));}}
  need(children.size===0&&pending===0&&[...clients].every(c=>c.closed&&c.activeFileReads===0),'Original customer clients or requests did not drain',{children:children.size,pending});
  if(failures.length)throw Object.assign(Error('Original owned services did not fully drain'),{details:failures});
  return{at:now(),ownedChildren:0,pendingRequests:0,activeFileReads:0,providerClosed:true,httpListening:server?.listening??false};
 }
 async function inventory(directory,relativePath=''){const rows=[];for(const entry of (await readdir(directory,{withFileTypes:true})).sort((x,y)=>x.name.localeCompare(y.name))){const name=relativePath?relativePath+'/'+entry.name:entry.name,full=join(directory,entry.name);if(name==='lease.lock'||name==='MANIFEST.json'||name==='result.json')continue;need(!entry.isSymbolicLink(),'Receiving inventory contains a symbolic link',{name});if(entry.isDirectory())rows.push(...await inventory(full,name));else{need(entry.isFile(),'Receiving inventory contains a special file',{name});rows.push({path:name,...await identity(full)});}}return rows;}
 try{
  const inputBytes=await originalBytes(resolve(a.input)),fixture=JSON.parse(inputBytes);
  const manifest=await json(resolve(a['source-manifest'])),installation=await json(resolve(a['installation-receipt']));
  need(manifest.operationId===OP&&Array.isArray(manifest.files)&&manifest.files.length>=45,'Retain the complete selected application/source closure');
  need(installation.operationId===OP&&installation.state==='INSTALLED'&&installation.packageRoot===pkg&&installation.command===cli&&installation.exitCode===0,'Use the actual original installed distribution receipt');
  await save('receiving-input.json',{schema:SCHEMA+'.input',operationId:OP,packageRoot:pkg,command:cli,input:{bytes:inputBytes.length,sha256:sha(inputBytes)},sourceManifest:await identity(resolve(a['source-manifest'])),installation:await identity(resolve(a['installation-receipt']))});
  for(const f of manifest.files){const bytes=await originalBytes(join(sourceRoot,safeRelative(f.path)));need(bytes.length===f.bytes&&sha(bytes)===f.sha256,'Current installed source differs from the original input',{path:f.path});}
  const packageBytes=await originalBytes(join(pkg,'package.json')),packageJson=JSON.parse(packageBytes);
  need(cli===await realpath(join(pkg,packageJson.bin['canadabuys-customer'])),'The installed command is not the declared customer CLI');
  await phase('00-installed-source-and-entry',async()=>{
   const files=[];for(const f of manifest.files){const name=safeRelative(f.path),bytes=await originalBytes(join(sourceRoot,name));need(bytes.length===f.bytes&&sha(bytes)===f.sha256,'Installed original source changed',{name});await save('application/'+name,bytes);files.push({path:name,bytes:f.bytes,sha256:f.sha256});}
   await save('installation/package.json',packageBytes);await save('installation/receipt.json',installation);await save('installation/source-manifest.json',manifest);
   await save('input/canadabuys-original-receiving-input.json',inputBytes);await save('receiving-source/run-canadabuys-intake-receiving.mjs',await originalBytes(new URL(import.meta.url)));
   const types=[];for(const sub of ['client','download','operations']){const declared=packageJson.exports['./merchant/canadabuys/'+sub];need(declared&&typeof declared.types==='string','Installed typed export missing',{sub});const typePath=join(pkg,declared.types);const text=(await originalBytes(typePath)).toString('utf8');const imports=[...text.matchAll(/(?:from\s*|import\()\s*['"]([^'"]+)['"]/g)].map(m=>m[1]);for(const specifier of imports.filter(x=>x.startsWith('.')))need((await lstat(resolve(dirname(typePath),specifier.replace(/\.mjs$/,'.d.mts')))).isFile(),'Original native type import missing',{sub,specifier});types.push({subpath:sub,file:relative(pkg,typePath),...await identity(typePath)});}
   return{packageName:packageJson.name,packageVersion:packageJson.version,packageSha256:sha(packageBytes),command:cli,files,types,sourceCommit:manifest.sourceCommit??null,fixture:{bytes:inputBytes.length,sha256:sha(inputBytes),scope:'Complete retained one-row tender and award projections, plus explicitly generated amendment and fictional review documents'}};
  });
  const completed=await valueAt('result.json');if(completed){const saved=await valueAt('MANIFEST.json');need(saved&&saved.operationId===OP&&same(saved.files,await inventory(root)),'Complete receiving archive members changed');need(completed.status==='PASS'&&completed.servicesDrained,'Existing receiving result is incomplete');await lease.close();emit('RECEIVING_REOPENED',completed);return completed;}
  await privateDirectory(path('workspace'));await privateDirectory(path('exports'));await privateDirectory(path('inputs'));
  const inputAliases={};
  for(const [key,capture] of Object.entries(fixture.captures)){need(Buffer.byteLength(capture.rawText)===Buffer.from(capture.rawText).length&&sha(Buffer.from(capture.rawText))===capture.meta.expectedSha256,'Original captured source differs',{key});await save('inputs/'+key+'.csv',Buffer.from(capture.rawText));inputAliases[key.toLowerCase()]={file:path('inputs/'+key+'.csv'),label:capture.meta.label,url:capture.meta.url,stream:capture.stream,retrievedAt:capture.meta.retrievedAt};}
  for(const [key,doc] of Object.entries(fixture.documents)){need(Buffer.byteLength(doc.content)===doc.bytes&&sha(Buffer.from(doc.content))===doc.sha256,'Original example document differs',{key});await save('inputs/'+key+'.txt',Buffer.from(doc.content));inputAliases[key.toLowerCase()]={file:path('inputs/'+key+'.txt'),label:'GENERATED RECEIVING EXAMPLE '+key};}
  for(const name of ['native-intake','invalid-intake','refreshed-intake','changed-intake'])
   inputAliases[name]={file:path('inputs/'+name+'.json'),label:'Original selected '+name};
  const configuration=await retained('server/workspaces.json',async()=>({schema:'starforge.canadabuys.workspace-connection.v1',workspaces:{receiving:{directory:path('workspace'),label:'Original CanadaBuys customer receiving',operator:'customer-receiving',inputs:inputAliases}}}));
  const resolvedConfiguration=await readCanadaBuysWorkspaceConfiguration(path('server/workspaces.json'));
  provider=new MerchantCanadaBuysWorkspaces({canadabuysWorkspaces:resolvedConfiguration,exportsDirectory:path('exports')});
  await privateDirectory(path('http'));sequence=(await readdir(path('http'))).filter(x=>/^[0-9]{6}\.request\.json$/.test(x)).length;
  const protocol={
   tools:canadaBuysTools(),
   async call(name,args){
    const n=String(++sequence).padStart(6,'0'),request={schema:SCHEMA+'.native-request',operationId:OP,sequence,name,args,at:now()};
    await save('http/'+n+'.request.json',request);pending++;
    try{const value=await provider.call(name,args);await save('http/'+n+'.result.json',{requestSha256:sha(encoded(request)),value,at:now()});
     const fault=activeFault;
     if(fault&&name===fault.tool&&(fault.commandId===null||args.commandId===fault.commandId)&&!await valueAt('faults/'+fault.label+'.json')){
      await save('faults/'+fault.label+'.json',{schema:SCHEMA+'.lost-response',operationId:OP,request,value,at:now(),effectReturned:true,transportReplyDelivered:false});
      httpContext.getStore().response.destroy();throw Object.assign(Error('Original native response deliberately retained before its HTTP connection was closed'),{code:'RECEIVING_RESPONSE_LOSS'});
     }
     return value;
    }catch(e){await save('http/'+n+'.error.json',{requestSha256:sha(encoded(request)),error:errorView(e),at:now()});throw e;}
    finally{pending--;}
   }
  };
  const secret={token:randomUUID()+randomUUID()};
  process.env.CANADABUYS_INTAKE_RECEIVING_TOKEN=secret.token;
  const handler=createMcpToolHandler(protocol,{bearerToken:secret.token,serverName:'canadabuys-original-customer-receiving',serverVersion:'0.1.0'});
  server=createServer((request,response)=>{response.on('error',()=>{});httpContext.run({response},()=>handler(request,response));});
  server.on('connection',socket=>{sockets.add(socket);socket.on('close',()=>sockets.delete(socket));});
  const savedEndpoint=await valueAt('server/endpoint.json');await new Promise((res,rej)=>{server.once('error',rej);server.listen(savedEndpoint?.port??0,'127.0.0.1',res);});
  const port=server.address().port;const endpoint={schema:SCHEMA+'.endpoint',operationId:OP,url:'http://127.0.0.1:'+port+'/mcp',port};
  await save('server/endpoint.json',endpoint);
  const bound=await phase('01-authenticated-installed-client',async()=>{
   const bound=await bindCanadaBuysCustomerConnection({connection:{schema:'stellar-forge.canadabuys-customer-connection.v1',url:endpoint.url,tokenEnv:'CANADABUYS_INTAKE_RECEIVING_TOKEN',workspace:'receiving',workspaceId:null}});
   need(bound.observation.native.id,'Original native workspace missing');await save('connection.json',bound.connection);
   const result=await cliCommand('installed-tools',['tools'],{offline:true});need(result.value.tools.length===39,'Installed catalogue omitted original tools');return bound;
  });
  connection=bound.connection;need(connection.url===endpoint.url,'Original MCP endpoint changed');
  client=await openCanadaBuysMerchantClient({...connection});clients.add(client);await client.open();
  async function revision(){return(await client.status()).native.revision;}
  async function operation(label,tool,args,{lost=false,cliRun=false}={}){
   const selected=await retained('selected/'+label+'.json',async()=>({label,tool,args:typeof args==='function'?await args():args}));
   need(selected.label===label&&selected.tool===tool,'Original operation selection changed');
   const directory=path('operations/'+label);await privateDirectory(dirname(directory));
   const prepared=await prepareCanadaBuysOperation({directory,operationId:OP+':'+label,connection,tool,arguments:selected.args});
   if(lost&&!await valueAt('faults/'+label+'.json')){
    const fault={label,tool:PREFIX+tool,commandId:selected.args.commandId??null};
    // Each fault has its own immutable selector. The protocol chooses the active file below.
    await save('faults/'+label+'.selection.json',fault);activeFault=fault;
   }
   if(cliRun){
    const result=await cliCommand(label+'-run',['run','--directory',directory],{allowFailure:lost});
    return{prepared,result,directory};
   }
   return{prepared,result:await executeCanadaBuysOperation({directory,client}),directory};
  }

  const intake=await phase('02-original-complete-projection-intake',async()=>{
   const values={};
   for(const key of ['tender','award','generatedAmendment']){
    const capture=fixture.captures[key],alias=key.toLowerCase(),label='import-'+alias;
    const value=await operation(label,'import',async()=>({input:alias,stream:capture.stream,expectedSha256:capture.meta.expectedSha256,expectedRevision:await revision()}));
    values[key]=value.result.value;need(values[key].sha256===capture.meta.expectedSha256,'Imported bytes changed');
   }
   const sources=await client.collect('status',{collection:'sources',limit:1});need(sources.complete&&sources.items.length===3&&sources.pages.length===3,'Source collection lost an original page');
   for(const [key,capture] of Object.entries(fixture.captures)){
    const item=sources.items.find(x=>x.sha256===capture.meta.expectedSha256);need(item,'Original source identity missing',{key});
    const actual=await client.source({sourceId:item.id,includeBody:true});
    need(actual.source.rawText===capture.rawText&&same(actual.source.columns,capture.columns)&&actual.source.rowCount===1,'A complete retained source projection changed',{key});
    await save('observations/source-'+key+'.json',actual);
   }
   const notices=await client.collect('status',{collection:'notices',limit:1});
   const notice=notices.items.find(x=>x.entries?.some(e=>e.summary?.referenceNumber===fixture.expected.originalTenderReference)||x.summary?.referenceNumber===fixture.expected.originalTenderReference);
   need(notice&&notices.complete,'The original tender notice was not retained');
   const detail=await client.notice({noticeId:notice.id});
   const editions=await client.collect('entries',{noticeId:notice.id,limit:1});need(editions.items.length===2&&editions.pages.length===2,'Original and generated editions were not both retained');
   const rows=[];for(const selected of editions.items){const e=await client.entry({entryId:selected.id,includeDocument:true});rows.push(e.entry);}
   const original=rows.find(e=>same(e.row,fixture.captures.tender.row)),amendment=rows.find(e=>same(e.row,fixture.captures.generatedAmendment.row));
   need(original&&amendment&&Object.keys(original.row).length===fixture.expected.originalTenderFields,'A complete bilingual original row changed');
   const compare=await client.collect('compare',{beforeId:original.id,afterId:amendment.id,includeValues:true,limit:1});need(compare.complete&&compare.items.length>0,'Full original source comparison did not finish');
   await save('observations/source-editions.json',{detail,editions,rows,compare});
   return {noticeId:notice.id,originalEntryId:original.id,currentEntryId:detail.notice.currentEntry.id,sources,values,scope:'One complete original tender row, one complete original award row, one explicitly generated amendment; no current whole-feed capture'};
  });
  const noticeId=intake.noticeId;
  const prepared=await phase('03-installed-original-document-preparation',async()=>{
   const selectedDocs=Object.entries(fixture.documents).slice(0,3);
   need(selectedDocs.length===3,'The original receiving fixture must retain three complete example documents');
   const manifest={noticeId,commandId:commandId('atomic-documents'),capturedAt:'2026-10-12T16:34:03Z',
    documents:selectedDocs.map(([key,doc])=>({path:path('inputs/'+key+'.txt'),title:'GENERATED RECEIVING EXAMPLE '+key,
     kind:'OTHER',language:'en',bytes:doc.bytes,sha256:doc.sha256,
     notes:'Explicit generated receiving document; not a customer procurement submission.'}))};
   await save('inputs/documents.json',manifest);
   const value=await cliCommand('intake-prepare',['prepare-intake','--connection',path('connection.json'),
    '--manifest',path('inputs/documents.json'),'--request-out',path('inputs/native-intake.json')]);
   const original=await json(path('inputs/native-intake.json'));
   need(original.workspaceId===connection.workspaceId&&original.noticeId===noticeId&&original.documents.length===3,
    'Installed preparation lost original workspace/notice/documents');
   for(let i=0;i<3;i++){const bytes=Buffer.from(original.documents[i].bodyBase64,'base64');
    need(bytes.equals(Buffer.from(selectedDocs[i][1].content))&&sha(bytes)===selectedDocs[i][1].sha256,
     'Prepared original document bytes changed');}
   return {request:original,identity:await identity(path('inputs/native-intake.json')),value:value.value};
  });
  const rejected=await phase('04-invalid-last-document-rolls-back-entire-intake',async()=>{
   const bad=structuredClone(prepared.request);bad.commandId=commandId('invalid-batch');
   bad.documents.at(-1).review={state:'REVIEWED',reviewedBy:'Generated reviewer',reviewedAt:'2026-10-12T16:34:03Z'};
   await save('inputs/invalid-intake.json',bad);
   const inspected=await client.inspectEvidenceIntake({input:'invalid-intake',expectedSha256:(await identity(path('inputs/invalid-intake.json'))).sha256});
   const before=await client.bidderStatus();
   const result=await expectFailure('invalid-native-batch',()=>operation('invalid-intake','bidder_intake',
    {input:'invalid-intake',expectedSha256:inspected.file.sha256,...inspected.selection}),e=>e.code==='INTAKE_REVIEW_REQUIRED');
   const after=await client.bidderStatus();
   need(before.native.revision===after.native.revision&&after.counts.evidence===0,
    'An invalid later document partially saved the batch');
   return {before,after,result};
  });
  const refreshed=await phase('05-retained-request-and-explicit-save-revision',async()=>{
   await operation('advance-unrelated-profile','bidder_create',async()=>({kind:'profile',
    record:{...fixture.profile,id:recordId('profile','intake-profile')},expectedRevision:await revision(),
    commandId:commandId('advance-unrelated-profile')}));
   const inspected=await client.inspectEvidenceIntake({input:'native-intake',expectedSha256:prepared.identity.sha256});
   const conflict=await expectFailure('original-intake-revision',()=>operation('old-revision-intake','bidder_intake',
    {input:'native-intake',expectedSha256:prepared.identity.sha256,...inspected.selection}),e=>e.code==='REVISION_CONFLICT');
   need((await client.bidderStatus()).counts.evidence===0,'A revision conflict changed evidence');
   const result=await cliCommand('refresh-intake',['refresh-intake','--connection',path('connection.json'),
    '--request',path('inputs/native-intake.json'),'--request-out',path('inputs/refreshed-intake.json')]);
   const selected=await json(path('inputs/refreshed-intake.json')),{applyRevision,...original}=selected;
   need(same(original,prepared.request)&&applyRevision===await revision(),'Save revision refresh replaced original intake fields');
   const args={input:'refreshed-intake',expectedSha256:(await identity(path('inputs/refreshed-intake.json'))).sha256};
   const inspection=await client.inspectEvidenceIntake(args);
   need(inspection.documents.length===3&&inspection.totalBytes===prepared.request.documents.reduce((n,d)=>n+d.bytes,0),
    'Complete inspected file identities changed');
   return {request:selected,inspection,result:result.value,conflict};
  });
  const accepted=await phase('06-lost-native-save-response-and-original-command-recovery',async()=>{
   const directory=path('operations/accepted-intake');
   const planned=await cliCommand('intake-plan',['intake-plan','--connection',path('connection.json'),
    '--input','refreshed-intake','--expected-sha256',refreshed.inspection.file.sha256,
    '--directory',directory,'--operation-id',commandId('accepted-intake')]);
   const fault={label:'accepted-intake',tool:PREFIX+'bidder_intake',commandId:prepared.request.commandId};
   if(!await valueAt('faults/accepted-intake.json')){await save('faults/accepted-intake.selection.json',fault);activeFault=fault;}
   const first=await cliCommand('intake-save-lost',['run','--directory',directory],{allowFailure:true});
   const saved=await valueAt('faults/accepted-intake.json');
   need(first.code!==0&&saved?.effectReturned===true&&saved.value.records.length===3,
    'The original complete native response loss was not retained');
   const retry=await cliCommand('intake-save-recovered',['run','--directory',directory]);
   need(retry.value.state==='COMPLETE'&&retry.value.value.alreadyApplied===true
    &&same(retry.value.value.records,saved.value.records),'Original intake recovery changed a saved edition');
   const status=await client.bidderStatus();
   need(status.counts.evidence===3,'Original intake was duplicated after response loss');
   const count=sequence;
   const reuse=await cliCommand('intake-save-offline-reopen',['run','--directory',directory],{offline:true});
   need(reuse.value.reused===true&&sequence===count,'Completed original operation dispatched again');
   return {records:saved.value.records,planned:planned.value,retry:retry.value,status,operationDirectory:directory};
  });
  const reviewed=await phase('07-later-review-and-original-intake-edition-replay',async()=>{
   const record=accepted.records[0];
   const value=await operation('review-original-evidence','bidder_update',{kind:'evidence',recordId:record.id,
    expectedRevision:record.revision,commandId:commandId('review-original-evidence'),
    record:{review:{state:'REVIEWED',reviewedBy:'GENERATED RECEIVING REVIEWER',
     reviewedAt:'2026-10-13T00:00:00Z',note:'Generated exercise review only.'}}});
   need(value.result.value.record.revision===2,'Original evidence review did not append one edition');
   const replay=await client.intakeEvidence({input:'refreshed-intake',expectedSha256:refreshed.inspection.file.sha256,
    ...refreshed.inspection.selection});
   need(replay.alreadyApplied&&same(replay.records,accepted.records)
    &&replay.native.revision===await revision(),'Native replay failed to retain original evidence editions');
   const current=await client.bidderRecord({kind:'evidence',recordId:record.id,history:true});
   need(current.record.revision===2&&current.record.history.length===2,'Intake replay replaced later evidence review');
   return {value:value.result.value,replay,current};
  });
  const contradictions=await phase('08-original-source-and-command-contradictions',async()=>{
   const before=await client.bidderStatus();
   const changed=structuredClone(refreshed.request);changed.documents[0].notes+=' Changed original request.';
   await save('inputs/changed-intake.json',changed);
   const inspected=await client.inspectEvidenceIntake({input:'changed-intake'});
   const command=await expectFailure('changed-native-command',()=>operation('changed-command-intake','bidder_intake',
    {input:'changed-intake',expectedSha256:inspected.file.sha256,...inspected.selection}),e=>e.code==='COMMAND_ID_REUSED');
   const hash=await expectFailure('changed-input-hash',()=>client.intakeEvidence({input:'refreshed-intake',
    expectedSha256:'0'.repeat(64),...refreshed.inspection.selection}),e=>e.code==='CANADABUYS_INPUT_CHANGED');
   const after=await client.bidderStatus();need(after.native.revision===before.native.revision&&after.counts.evidence===3,
    'Contradictory original input mutated the native workspace');return {before,after,command,hash};
  });
  const exported=await phase('09-complete-package-and-exact-original-evidence-download',async()=>{
   const packageExport=await operation('export-complete-intake-package','export',
    async()=>({format:'package',scope:'all',expectedRevision:await revision()}));
   const publication=packageExport.result.value,downloadDirectory=path('downloads/package');
   const inspection=await inspectCanadaBuysPublication({client,publicationId:publication.publication.id});
   const download=await cliCommand('download-complete-intake-package',['download','--connection',path('connection.json'),
    '--publication-id',publication.publication.id,'--directory',downloadDirectory,
    '--manifest-sha256',inspection.manifestSha256]);
   const evidence=[];
   for(const [index,record]of accepted.records.entries()){
    const item=await operation('export-original-evidence-'+index,'export',
     async()=>({format:'evidence',evidenceId:record.id,recordRevision:1,expectedRevision:await revision()}));
    const original=item.result.value,dir=path('downloads/evidence-'+index);
    const manifest=await inspectCanadaBuysPublication({client,publicationId:original.publication.id});
    const receipt=await downloadCanadaBuysPublication({client,publicationId:original.publication.id,directory:dir,
     expectedManifestSha256:manifest.manifestSha256});
    const body=await originalBytes(join(dir,original.files[0].file));
    need(body.equals(Buffer.from(prepared.request.documents[index].bodyBase64,'base64')),
     'Downloaded original evidence bytes changed');
    evidence.push({publication:original.publication,receipt,file:original.files[0]});
   }
   return {publication:publication.publication,download:download.value,directory:downloadDirectory,
    manifestSha256:inspection.manifestSha256,evidence};
  });
  const received=await phase('10-offline-cold-receiving-and-later-local-history',async()=>{
   const before=sequence;
   const verify=await cliCommand('verify-complete-intake-package',['verify','--directory',exported.directory,
    '--publication-id',exported.publication.id,'--manifest-sha256',exported.manifestSha256],{offline:true});
   const receiving=await cliCommand('receive-complete-intake-package',['receive','--directory',exported.directory,
    '--publication-id',exported.publication.id,'--manifest-sha256',exported.manifestSha256,
    '--workspace-directory',path('received-workspace'),'--expected-revision','0','--operator','customer'],{offline:true});
   need(sequence===before&&verify.value.networkRequests===0&&receiving.value.networkRequests===0,
    'Cold complete receiving used the provider');
   const cold=new CanadaBuysWorkspace(path('received-workspace'),{operator:'customer'});
   let metadata,local;
   try{
    for(const [index,record]of accepted.records.entries()){
     const original=cold.bidderDesk.evidenceFile(record.id,{revision:1});
     need(original.body.equals(Buffer.from(prepared.request.documents[index].bodyBase64,'base64'))
      &&original.record.editionSha256===record.editionSha256,'Cold original document/edition changed');
    }
    const current=cold.bidderDesk.get('evidence',accepted.records[0].id,{history:true});
    need(current.revision===2&&current.history.length===2,'Cold receiving lost later review history');
    const selected=await retained('selected/cold-local-evidence-edit.json',async()=>({expectedRevision:current.revision,
     commandId:commandId('cold-local-edit'),notes:current.notes+'\nLater local receiving note.'}));
    local=cold.bidderDesk.update('evidence',current.id,selected).record;metadata=cold.metadata();
   }finally{cold.close();}
   const reopened=await cliCommand('reopen-complete-intake-package',['receive','--directory',exported.directory,
    '--publication-id',exported.publication.id,'--manifest-sha256',exported.manifestSha256,
    '--workspace-directory',path('received-workspace'),'--expected-revision',String(metadata.revision),'--operator','customer'],{offline:true});
   need(reopened.value.result.alreadyReceived===true&&sequence===before,'Original package replay changed local state');
   const observed=new CanadaBuysWorkspace(path('received-workspace'),{operator:'customer'});
   try{const record=observed.bidderDesk.get('evidence',local.id,{history:true});
    need(record.revision===3&&record.notes===local.notes&&record.history.length===3,
     'Same package reopen replaced a later local evidence edition');
    return {verify:verify.value,receiving:receiving.value,reopened:reopened.value,workspace:observed.metadata(),record};
   }finally{observed.close();}
  });
  const summary={workspaceId:connection.workspaceId,receivedWorkspaceId:received.workspace.id,documents:3,
   originalRecordIds:accepted.records.map(r=>r.id),originalIntakeCommandId:prepared.request.commandId,
   intakeSha256:accepted.retry.value.intakeSha256,atomicInvalidBatchRejected:true,explicitRevisionRefresh:true,
   originalSaveResponseRecovered:true,originalEditionsRetained:true,sourceContradictionsRejected:true,
   completePublicationId:exported.publication.id,evidenceDownloads:exported.evidence.length,
   coldReceivingOffline:true,laterLocalEvidenceEditRetained:true};
  await save('completion-candidate.json',{schema:SCHEMA+'.candidate',operationId:OP,summary,prepared,rejected,
   refreshed,accepted,reviewed,contradictions,exported,received,at:now()});
 }catch(e){mainError=e;await save('failures/'+now().replaceAll(':','')+'-'+randomUUID()+'.json',{schema:SCHEMA+'.failure',operationId:OP,error:errorView(e),at:now()}).catch(()=>{});}
 finally{
  try{drain=await closeAll();}catch(e){if(mainError)mainError.drainError=errorView(e);else mainError=e;}
  delete process.env.CANADABUYS_INTAKE_RECEIVING_TOKEN;
 }
 try{
  if(mainError)throw mainError;
  const candidate=await valueAt('completion-candidate.json');need(candidate,'Original complete receiving candidate is missing');
  await save('drain.json',{schema:SCHEMA+'.drain',operationId:OP,...drain});
  const guide="# Installed CanadaBuys original document intake\n\nThis complete case uses the maintained installed CLI, authenticated MCP transport and native SQLite engine. Three generated receiving documents remain explicitly labelled examples. It verifies the original all-or-none transaction, a rejected later document, explicit save-revision refresh, a lost native response and same-command recovery, later review history, exact document exports and offline full-package receiving. Original captured source rows are retained with full identities; no procurement or payment was submitted.\n\nOpen received-workspace with the installed canadabuys serve command, then Bidder desk → Decision & reports. All original requests, responses, source, documents, file receipts and later local edit are retained.\n\n"+JSON.stringify(candidate.summary,null,2)+'\n';
  await save('START_HERE.md',Buffer.from(guide));
  const files=await inventory(root);await save('MANIFEST.json',{schema:SCHEMA+'.files',operationId:OP,files});
  const result={schema:SCHEMA,operationId:OP,status:'PASS',completedAt:candidate.at,servicesDrained:true,summary:candidate.summary,installedSource:await valueAt('phases/00-installed-source-and-entry.json'),phases:(await readdir(path('phases'))).filter(x=>x.endsWith('.json')).sort(),files:files.length,manifest:await identity(path('MANIFEST.json')),guide:await identity(path('START_HERE.md')),workspace:path('workspace'),receivedWorkspace:path('received-workspace'),completeOutput:root};
  await save('result.json',result);emit('RECEIVING_COMPLETE',result);return result;
 }finally{await lease.close();}
}
if(process.argv[1]&&import.meta.url===pathToFileURL(resolve(process.argv[1])).href){
 main().catch(error=>{process.stderr.write(JSON.stringify({status:'INCOMPLETE',operationId:OP,error:errorView(error)})+'\n');process.exitCode=1;});
}
