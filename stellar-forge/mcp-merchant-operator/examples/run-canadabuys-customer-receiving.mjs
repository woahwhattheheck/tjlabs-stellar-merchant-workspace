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

const SCHEMA='commons.canadabuys-customer-receiving.v1';
const OP='CANADABUYS-AGENT-CUSTOMER-6BA15-20261012';
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
  const env={...process.env};if(offline)delete env.CANADABUYS_CUSTOMER_RECEIVING_TOKEN;
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
   await save('input/canadabuys-original-receiving-input.json',inputBytes);await save('receiving-source/run-canadabuys-customer-receiving.mjs',await originalBytes(new URL(import.meta.url)));
   const types=[];for(const sub of ['client','download','operations']){const declared=packageJson.exports['./merchant/canadabuys/'+sub];need(declared&&typeof declared.types==='string','Installed typed export missing',{sub});const typePath=join(pkg,declared.types);const text=(await originalBytes(typePath)).toString('utf8');const imports=[...text.matchAll(/(?:from\s*|import\()\s*['"]([^'"]+)['"]/g)].map(m=>m[1]);for(const specifier of imports.filter(x=>x.startsWith('.')))need((await lstat(resolve(dirname(typePath),specifier.replace(/\.mjs$/,'.d.mts')))).isFile(),'Original native type import missing',{sub,specifier});types.push({subpath:sub,file:relative(pkg,typePath),...await identity(typePath)});}
   return{packageName:packageJson.name,packageVersion:packageJson.version,packageSha256:sha(packageBytes),command:cli,files,types,sourceCommit:manifest.sourceCommit??null,fixture:{bytes:inputBytes.length,sha256:sha(inputBytes),scope:'Complete retained one-row tender and award projections, plus explicitly generated amendment and fictional review documents'}};
  });
  const completed=await valueAt('result.json');if(completed){const saved=await valueAt('MANIFEST.json');need(saved&&saved.operationId===OP&&same(saved.files,await inventory(root)),'Complete receiving archive members changed');need(completed.status==='PASS'&&completed.servicesDrained,'Existing receiving result is incomplete');await lease.close();emit('RECEIVING_REOPENED',completed);return completed;}
  await privateDirectory(path('workspace'));await privateDirectory(path('exports'));await privateDirectory(path('inputs'));
  const inputAliases={};
  for(const [key,capture] of Object.entries(fixture.captures)){need(Buffer.byteLength(capture.rawText)===Buffer.from(capture.rawText).length&&sha(Buffer.from(capture.rawText))===capture.meta.expectedSha256,'Original captured source differs',{key});await save('inputs/'+key+'.csv',Buffer.from(capture.rawText));inputAliases[key.toLowerCase()]={file:path('inputs/'+key+'.csv'),label:capture.meta.label,url:capture.meta.url,stream:capture.stream,retrievedAt:capture.meta.retrievedAt};}
  for(const [key,doc] of Object.entries(fixture.documents)){need(Buffer.byteLength(doc.content)===doc.bytes&&sha(Buffer.from(doc.content))===doc.sha256,'Original example document differs',{key});await save('inputs/'+key+'.txt',Buffer.from(doc.content));inputAliases[key.toLowerCase()]={file:path('inputs/'+key+'.txt'),label:'GENERATED RECEIVING EXAMPLE '+key};}
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
  process.env.CANADABUYS_CUSTOMER_RECEIVING_TOKEN=secret.token;
  const handler=createMcpToolHandler(protocol,{bearerToken:secret.token,serverName:'canadabuys-original-customer-receiving',serverVersion:'0.1.0'});
  server=createServer((request,response)=>{response.on('error',()=>{});httpContext.run({response},()=>handler(request,response));});
  server.on('connection',socket=>{sockets.add(socket);socket.on('close',()=>sockets.delete(socket));});
  const savedEndpoint=await valueAt('server/endpoint.json');await new Promise((res,rej)=>{server.once('error',rej);server.listen(savedEndpoint?.port??0,'127.0.0.1',res);});
  const port=server.address().port;const endpoint={schema:SCHEMA+'.endpoint',operationId:OP,url:'http://127.0.0.1:'+port+'/mcp',port};
  await save('server/endpoint.json',endpoint);
  const bound=await phase('01-authenticated-installed-client',async()=>{
   const bound=await bindCanadaBuysCustomerConnection({connection:{schema:'stellar-forge.canadabuys-customer-connection.v1',url:endpoint.url,tokenEnv:'CANADABUYS_CUSTOMER_RECEIVING_TOKEN',workspace:'receiving',workspaceId:null}});
   need(bound.observation.native.id,'Original native workspace missing');await save('connection.json',bound.connection);
   const result=await cliCommand('installed-tools',['tools'],{offline:true});need(result.value.tools.length===37,'Installed catalogue omitted original tools');return bound;
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
  const profile=await phase('03-lost-profile-response-and-original-command',async()=>{
   const id=recordId('profile','customer-profile');
   const first=await operation('profile-create','bidder_create',async()=>({kind:'profile',record:{...fixture.profile,id},commandId:commandId('profile-create'),expectedRevision:await revision()}),{lost:true,cliRun:true});
   const fault=await valueAt('faults/profile-create.json');need(fault&&fault.value.record.id===id&&fault.value.record.revision===1&&first.result.code!==0,'Original committed profile response loss was not exercised');
   const before=sequence;const retried=await cliCommand('profile-create-resume',['run','--directory',first.directory]);
   need(retried.value.state==='COMPLETE'&&retried.value.value.alreadyApplied===true&&retried.value.value.record.id===id,'Same original command did not recover its committed record');
   const record=await client.bidderRecord({kind:'profile',recordId:id,history:true});
   need(record.record.history.length===1&&record.record.revision===1,'Profile response recovery duplicated an edition');
   const noNetwork=sequence;const shown=await cliCommand('profile-offline-show',['show','--directory',first.directory],{offline:true});
   const reopened=await cliCommand('profile-offline-complete',['run','--directory',first.directory],{offline:true});
   need(sequence===noNetwork&&shown.value.state==='COMPLETE'&&reopened.value.reused&&reopened.value.networkRequests===0,'Completed original operation did not reopen offline');
   await save('observations/profile-original-history.json',record);
   return{record:retried.value.value.record,commandId:commandId('profile-create'),requestSha256:first.prepared.requestSha256,first:fault,continued:retried.value,httpCallsDuringResume:sequence-before,offlineReopen:reopened.value};
  });
  async function createRecord(label,kind,input,{inputAlias,expectedSha256}={}){
   const answer=await operation(label,'bidder_create',async()=>({kind,record:{...input,id:recordId(kind,label)},expectedRevision:await revision(),commandId:commandId(label),...(inputAlias?{input:inputAlias,expectedSha256}:{})}));
   return answer.result.value.record;
  }
  const docs=await phase('04-original-evidence-and-complete-record-pages',async()=>{
   const reviewed=await retained('selected/evidence-review.json',async()=>({state:'REVIEWED',reviewedBy:'Generated customer receiving reviewer',reviewedAt:now(),note:'Reviewed generated receiving text only; no actual supplier qualification or official attachment claim.'}));
   const clause=await createRecord('clause','evidence',{noticeId,title:'Generated receiving clause R-1',kind:'ANNEX',version:'1',sourceUrl:'',localOrigin:'clauseV1.txt',language:'en',review:reviewed,notes:'The full original source listing is separately retained.'},{inputAlias:'clausev1',expectedSha256:fixture.documents.clauseV1.sha256});
   const supplier=await createRecord('supplier','evidence',{title:'Fictional supplier project record',kind:'SUPPLIER',version:'1',language:'en',review:reviewed,notes:'Illustrative data, not an actual company qualification.'},{inputAlias:'supplierv1',expectedSha256:fixture.documents.supplierV1.sha256});
   const link=await createRecord('link-only','evidence',{noticeId,title:'Original CanadaBuys listing, attachment clauses unreviewed',kind:'SOLICITATION',sourceUrl:fixture.captures.tender.meta.url,accessState:'LINK_ONLY',notes:'No solicitation attachment bytes were acquired by this receiving run.'});
   need(clause.sha256===fixture.documents.clauseV1.sha256&&supplier.sha256===fixture.documents.supplierV1.sha256&&link.sha256===null&&link.bytes===null,'Evidence byte or unresolved provenance changed');
   const updated=await operation('profile-evidence','bidder_update',{kind:'profile',recordId:profile.record.id,expectedRevision:1,commandId:commandId('profile-evidence'),record:{evidenceIds:[supplier.id],commercial:{note:'Generated customer evidence linked; original thresholds retained.'}}});
   need(updated.result.value.record.commercial.maximumBidCost===fixture.profile.commercial.maximumBidCost&&updated.result.value.record.capacity.minimumLeadDays===fixture.profile.capacity.minimumLeadDays,'Partial original profile update lost fields');
   const records=await client.collect('bidder_list',{kind:'evidence',limit:1});need(records.complete&&records.pages.length===3&&records.items.length===3,'Complete bidder pagination omitted a document');
   await save('cli/evidence-page.args.json',{kind:'evidence',limit:1});
   const read=await cliCommand('installed-evidence-pages',['read','--connection',path('connection.json'),'--tool','bidder_list','--args',path('cli/evidence-page.args.json'),'--all']);
   need(same(read.value.items,records.items)&&read.value.complete,'Installed CLI lost a complete evidence page');
   return{clause,supplier,link,profile:updated.result.value.record,records};
  });
  const decision=await phase('05-explicit-requirements-assessment-and-decision',async()=>{
   const review=await retained('selected/requirement-review.json',async()=>({reviewedBy:'Generated receiving reviewer',reviewedAt:now()}));
   const mandatory=await createRecord('mandatory','requirement',{noticeId,kind:'MANDATORY',applicability:'APPLIES',requirementText:'GENERATED RECEIVING CLAUSE R-1: identify a project lead and dated project record.',
    sourceEvidence:[{evidenceId:docs.clause.id,revision:1,sha256:docs.clause.sha256,pageOrSection:'R-1',quote:'',note:'Generated clause only'}],
    supplierEvidence:[{evidenceId:docs.supplier.id,revision:1,sha256:docs.supplier.sha256,pageOrSection:'Illustrative record',quote:'',note:'Fictional supplier only'}],
    assessment:'MET',...review,owner:'Example customer coordinator',notes:'This example does not claim a complete real requirement inventory.'});
   const unresolved=await createRecord('unknown-requirement','requirement',{noticeId,kind:'UNKNOWN',applicability:'UNKNOWN',requirementText:'Review the governing original solicitation attachments and amendments before any actual bid decision.',
    sourceEvidence:[{evidenceId:docs.link.id,revision:1,pageOrSection:'Original source listing',quote:'',note:'Uncaptured attachments'}],
    supplierEvidence:[],assessment:'UNKNOWN',clarificationQuestion:'Which original attachment editions govern this opportunity?',owner:'Example customer coordinator'});
   const selection={noticeId,sourceEntryId:intake.currentEntryId,profileId:docs.profile.id,profileRevision:docs.profile.revision};
   const assessed=await retained('observations/selected-assessment.json',()=>client.bidderAssess(selection));
   need(assessed.contextSha256===sha(Buffer.from(JSON.stringify(sorted(assessed.context)))),'Original assessment context digest differs');
   need(assessed.assessment.mandatoryReview.eligibility==='NOT_DETERMINED'&&assessed.assessment.mandatoryReview.automaticDecision===null&&assessed.assessment.requirements.unresolved===1,'Unknown original requirements became an automatic bid decision');
   const record=await createRecord('decision','decision',{...selection,contextSha256:assessed.contextSha256,choice:'INVESTIGATE',rationale:'Generated customer receiving: retain the complete original context and obtain governing attachment evidence before a real decision.',reviewedBy:'Generated receiving reviewer',owner:'Example customer coordinator',unknowns:['Governing solicitation attachments remain unreviewed.'],nextActions:[{id:'original-attachments',task:'Obtain the exact original attachments and review their requirement inventory',owner:'Example customer coordinator',dueAt:null,status:'OPEN'}]});
   need(record.choice==='INVESTIGATE'&&record.contextSha256===assessed.contextSha256&&record.context.requirements.length===2,'Saved original decision lost its full context');
   return{record,mandatory,unresolved,assessment:assessed};
  });
  const exported=await phase('06-original-export-response-loss-and-explicit-adoption',async()=>{
   const started=await operation('package-export','export',async()=>({expectedRevision:await revision(),format:'package',scope:'all'}),{lost:true,cliRun:true});
   const original=await valueAt('faults/package-export.json');need(original&&original.value.publication.format==='package'&&started.result.code!==0,'Original export response loss was not retained');
   const before=sequence;const held=await cliCommand('package-export-held',['run','--directory',started.directory],{allowFailure:true});
   need(held.code!==0&&sequence===before,'An unresolved original export was dispatched again');
   const unknown=await showCanadaBuysOperation(started.directory);need(unknown.state==='RECONCILIATION_REQUIRED','Original export ambiguity was not preserved');
   const publications=await client.collect('status',{collection:'publications',limit:1});
   need(publications.items.filter(x=>x.id===original.value.publication.id).length===1,'Original publication missing from native history');
   const inspected=await client.files({publicationId:original.value.publication.id});
   need(same(inspected,original.value),'Original retained publication bytes or selection changed');
   await cliCommand('publication-selection-template',['publication-selection','--directory',started.directory,'--out',path('publication-selection-template.json')],{offline:true});
   const template=await valueAt('publication-selection-template.json');
   const evidence={...template,publicationId:inspected.publication.id,note:'Selected the one original completed package from the retained native export response and current original publication history; no second export requested.'};
   await save('original-publication-selection.json',evidence);
   const adopted=await cliCommand('package-export-adopt',['adopt-publication','--directory',started.directory,'--evidence',path('original-publication-selection.json')]);
   need(adopted.value.state==='COMPLETE'&&adopted.value.outcome==='ADOPTED_ORIGINAL_PUBLICATION'&&same(adopted.value.value,inspected),'Original publication was not adopted exactly');
   const exportRequests=await nativeRequests('export');need(exportRequests.length===1,'Package response recovery created another export');
   return{publication:inspected.publication,files:inspected.files,adoption:adopted.value,requestSha256:unknown.requestSha256,originalResponse:original};
  });
  async function nativeRequests(short){const values=[];for(const name of (await readdir(path('http'))).filter(x=>x.endsWith('.request.json')).sort()){const v=await json(path('http/'+name));if(v.name===PREFIX+short)values.push(v);}return values;}
  const downloaded=await phase('07-complete-original-package-download-and-prefix-resume',async()=>{
   const publicationId=exported.publication.id,directory=path('downloads/package');
   const selected=await retained('observations/package-manifest.json',()=>inspectCanadaBuysPublication({client,publicationId}));
   let interrupted=await valueAt('observations/download-interruption.json');
   const savedProgress=await valueAt('observations/download-first-progress.json');
   if(!interrupted&&savedProgress){
    const checkpoint=await valueAt('downloads/package/download-state/checkpoint.json');const first=checkpoint?.files?.[savedProgress.file];
    need(first&&first.bytes===savedProgress.bytes&&savedProgress.bytes===1024,'Original saved pause no longer matches its verified prefix');
    interrupted={at:null,error:{code:'RECEIVING_DOWNLOAD_PAUSE',message:'Recovered the original first synced prefix after the controller ended before its pause receipt.'},recoveredFrom:await identity(path('observations/download-first-progress.json'))};await save('observations/download-interruption.json',interrupted);
   }
   if(!interrupted){
    const expected=await expectFailure('download-interruption',()=>downloadCanadaBuysPublication({client,publicationId,directory,expectedManifestSha256:selected.manifestSha256,chunkSize:1024,onProgress:async progress=>{await save('observations/download-first-progress.json',progress);throw Object.assign(Error('Receiving interruption after the first synced original file chunk'),{code:'RECEIVING_DOWNLOAD_PAUSE'});}}),e=>e.code==='RECEIVING_DOWNLOAD_PAUSE');
    need(expected.error.code==='RECEIVING_DOWNLOAD_PAUSE','Original download pause changed');
   }
   const progress=await valueAt('observations/download-first-progress.json');need(progress.bytes===1024&&progress.total>progress.bytes,'Receiving did not retain an original partial prefix');
   const before=await identity(path('downloads/package/download-state/checkpoint.json'));
   const result=await cliCommand('package-download-resume',['download','--connection',path('connection.json'),'--publication-id',publicationId,'--directory',directory,'--manifest-sha256',selected.manifestSha256,'--chunk-size','4096']);
   need(result.value.state==='COMPLETE'&&result.value.resumed&&result.value.resumedBytes===1024&&result.value.bytes===exported.files[0].bytes,'Complete original download did not preserve its checkpointed prefix');
   const verified=await verifyCanadaBuysDownload({directory,publicationId,expectedManifestSha256:selected.manifestSha256});
   need(verified.state==='VERIFIED'&&verified.networkRequests===0&&verified.bytes===exported.files[0].bytes,'Offline full original-byte verification failed');
   const packet=await json(join(directory,exported.files[0].file));
   need(packet.sources.length===3&&packet.bidderDesk.records.some(x=>x.kind==='decision'&&x.id===decision.record.id),'Complete downloaded native package omitted source or decision graph');
   for(const [key,capture] of Object.entries(fixture.captures))need(packet.sources.some(x=>x.sha256===capture.meta.expectedSha256&&x.rawText===capture.rawText),'Downloaded package changed full original source bytes',{key});
   return{publicationId,directory,manifestSha256:selected.manifestSha256,result:result.value,verification:verified,checkpointBefore:before,packageId:packet.packageId};
  });
  const released=await phase('08-original-read-lease-structured-release',async()=>{
   const file=exported.files[0],chunk=await client.fileRead({publicationId:exported.publication.id,file:file.file,expectedSha256:file.sha256,offset:0,limit:1});
   need(chunk.bytesRead===1&&chunk.nextOffset===1&&client.activeFileReads===1,'Original explicit file lease was not retained');
   const result=await client.fileRelease({readId:chunk.readId});
   need(result.workspace===connection.workspace&&result.readId===chunk.readId&&result.released===true&&client.activeFileReads===0,'Successful original file release lacked its structured acknowledgment');
   const again=await client.fileRelease({readId:chunk.readId});need(again.released===true,'Repeated original release changed its idempotent result');
   const requests=await nativeRequests('file_read'),errors=[];for(const request of requests){const e=await valueAt('http/'+String(request.sequence).padStart(6,'0')+'.error.json');if(e)errors.push(e.error.code);}
   need(errors.includes('CANADABUYS_FILE_READ_NOT_FOUND'),'Original expired reader was not reconciled during partial-download resume');
   return{readId:chunk.readId,result,repeated:again,expiredOriginalReadRecovered:true};
  });
  const publications=await phase('09-complete-decision-report-and-evidence-files',async()=>{
   const answer={};
   for(const [label,selection] of [['decision-html',{format:'decision-html',decisionId:decision.record.id,recordRevision:1}],['supplier-evidence',{format:'evidence',evidenceId:docs.supplier.id,recordRevision:1}]]){
    const result=await operation('export-'+label,'export',async()=>({...selection,expectedRevision:await revision()}));
    const published=result.result.value,dir=path('downloads/'+label);
    const manifest=await retained('observations/'+label+'.manifest.json',()=>client.inspectPublication(published.publication.id));
    const receipt=await cliCommand(label+'-download',['download','--connection',path('connection.json'),'--publication-id',published.publication.id,'--directory',dir,'--manifest-sha256',manifest.manifestSha256]);
    const verified=await verifyCanadaBuysDownload({directory:dir,publicationId:published.publication.id,expectedManifestSha256:manifest.manifestSha256});
    const bytes=await originalBytes(join(dir,published.files[0].file));
    if(label==='supplier-evidence')need(bytes.equals(Buffer.from(fixture.documents.supplierV1.content)),'Original supplier evidence bytes changed');
    else need(bytes.toString('utf8').includes(decision.record.id)&&bytes.toString('utf8').includes('INVESTIGATE'),'Original complete decision report lost its saved decision');
    answer[label]={publication:published.publication,files:published.files,download:receipt.value,verification:verified};
   }
   return answer;
  });
  const received=await phase('10-offline-installed-package-receiving',async()=>{
   const before=sequence;
   const verification=await cliCommand('package-offline-verify',['verify','--directory',downloaded.directory,'--publication-id',downloaded.publicationId,'--manifest-sha256',downloaded.manifestSha256],{offline:true});
   const result=await cliCommand('package-offline-receive',['receive','--directory',downloaded.directory,'--publication-id',downloaded.publicationId,'--manifest-sha256',downloaded.manifestSha256,'--workspace-directory',path('received-workspace'),'--expected-revision','0','--operator','customer'],{offline:true});
   need(sequence===before&&verification.value.networkRequests===0&&result.value.networkRequests===0&&result.value.result.alreadyReceived!==true,'Original offline package receiving used a provider or omitted first receiving');
   need(result.value.source.workspaceId===connection.workspaceId&&result.value.source.publicationId===downloaded.publicationId,'Receiving lost the original publication/workspace binding');
   return result.value;
  });
  const reopened=await phase('11-later-local-edit-and-same-package-reopen',async()=>{
   const workspace=new CanadaBuysWorkspace(path('received-workspace'),{operator:'customer'});
   let local,metadata;
   try{
    const original=workspace.bidderDesk.get('profile',docs.profile.id);
    const wanted={expectedRevision:original.revision,commandId:commandId('received-local-edit'),description:original.description+'\nA later local customer edit retained after receiving.'};
    const selected=await retained('selected/received-local-profile-edit.json',async()=>wanted);
    local=workspace.bidderDesk.update('profile',docs.profile.id,selected).record;metadata=workspace.metadata();
    need(local.revision===docs.profile.revision+1,'Local original profile edit did not append one edition');
   }finally{workspace.close();}
   const before=sequence;
   const repeated=await cliCommand('package-offline-reopen',['receive','--directory',downloaded.directory,'--publication-id',downloaded.publicationId,'--manifest-sha256',downloaded.manifestSha256,'--workspace-directory',path('received-workspace'),'--expected-revision',String(metadata.revision),'--operator','customer'],{offline:true});
   need(sequence===before&&repeated.value.result.alreadyReceived===true&&repeated.value.workspace.revision===metadata.revision,'Same original package overwrote later local state');
   const cold=new CanadaBuysWorkspace(path('received-workspace'),{operator:'customer'});
   try{const actual=cold.bidderDesk.get('profile',docs.profile.id,{history:true}),actualDecision=cold.bidderDesk.get('decision',decision.record.id);
    need(actual.description===local.description&&actual.revision===local.revision&&actual.history.length===3&&actualDecision.contextSha256===decision.record.contextSha256,'Cold original workspace lost history or saved decision');
    const supplier=cold.bidderDesk.evidenceFile(docs.supplier.id,{revision:1});need(supplier.body.equals(Buffer.from(fixture.documents.supplierV1.content)),'Cold receiving lost the original evidence body');
    return{workspace:cold.metadata(),profile:actual,decision:actualDecision,receiving:repeated.value,networkRequests:0};
   }finally{cold.close();}
  });
  const opening=await phase('12-received-workspace-operator-opening',async()=>{
   const {startCanadaBuysServer}=await import(pathToFileURL(join(nativeRoot,'server.mjs')));
   const service=await startCanadaBuysServer({directory:path('received-workspace'),operator:'customer',title:'Received CanadaBuys customer workspace',port:0});
   try{
    const response=await fetch(service.url,{redirect:'error'});need(response.ok,'Original received operator application did not open');
    const bytes=Buffer.from(await response.arrayBuffer());need(bytes.toString('utf8').includes('CanadaBuys'),'Original operator page did not return its application');
    await save('observations/received-operator.html',bytes);
    return{url:service.url,workspace:reopened.workspace,body:{bytes:bytes.length,sha256:sha(bytes)},command:'canadabuys serve --workspace '+path('received-workspace')+' --operator customer',nextView:'Bidder desk → Decision & reports',readOnlyApplicationOpen:true};
   }finally{await service.close();}
  });
  const summary={workspaceId:connection.workspaceId,receivedWorkspaceId:reopened.workspace.id,sourceRows:{originalTender:1,originalAward:1,generatedAmendment:1},originalColumns:{tender:fixture.expected.originalTenderFields,award:fixture.expected.originalAwardFields},profileId:profile.record.id,decisionId:decision.record.id,decisionChoice:decision.record.choice,packageId:downloaded.packageId,originalPublicationId:downloaded.publicationId,downloadedFiles:3,downloadedBytes:downloaded.result.bytes+Object.values(publications).reduce((n,x)=>n+x.download.bytes,0),commandResponseRecovered:true,unknownExportReplayed:false,exactOriginalPublicationAdopted:true,laterLocalEditsPreserved:true};
  await save('completion-candidate.json',{schema:SCHEMA+'.candidate',operationId:OP,summary,profile,docs,decision,exported,downloaded,released,publications,received,reopened,opening,at:now()});
 }catch(e){mainError=e;await save('failures/'+now().replaceAll(':','')+'-'+randomUUID()+'.json',{schema:SCHEMA+'.failure',operationId:OP,error:errorView(e),at:now()}).catch(()=>{});}
 finally{
  try{drain=await closeAll();}catch(e){if(mainError)mainError.drainError=errorView(e);else mainError=e;}
  delete process.env.CANADABUYS_CUSTOMER_RECEIVING_TOKEN;
 }
 try{
  if(mainError)throw mainError;
  const candidate=await valueAt('completion-candidate.json');need(candidate,'Original complete receiving candidate is missing');
  await save('drain.json',{schema:SCHEMA+'.drain',operationId:OP,...drain});
  const guide='# CanadaBuys customer receiving\n\nThe installed customer CLI completed against the original authenticated MCP handler and native SQLite application. The fixture retained one complete original tender row, one complete original award row and an explicitly generated amendment. All supplier documents and review records are labelled generated examples.\n\nOpen the received workspace:\n\n    canadabuys serve --workspace received-workspace --operator customer\n\nFollow its printed loopback URL, then Bidder desk → Decision & reports. The complete source, original HTTP and customer operation journals, three full publication downloads, original manifest and later local profile edit are retained in this directory. The client kept the original bidder command after response loss, held the unresolved export, and adopted that original publication without another export request.\n\n'+JSON.stringify(candidate.summary,null,2)+'\n';
  await save('START_HERE.md',Buffer.from(guide));
  const files=await inventory(root);await save('MANIFEST.json',{schema:SCHEMA+'.files',operationId:OP,files});
  const result={schema:SCHEMA,operationId:OP,status:'PASS',completedAt:candidate.at,servicesDrained:true,summary:candidate.summary,installedSource:await valueAt('phases/00-installed-source-and-entry.json'),phases:(await readdir(path('phases'))).filter(x=>x.endsWith('.json')).sort(),files:files.length,manifest:await identity(path('MANIFEST.json')),guide:await identity(path('START_HERE.md')),workspace:path('workspace'),receivedWorkspace:path('received-workspace'),completeOutput:root};
  await save('result.json',result);emit('RECEIVING_COMPLETE',result);return result;
 }finally{await lease.close();}
}
if(process.argv[1]&&import.meta.url===pathToFileURL(resolve(process.argv[1])).href){
 main().catch(error=>{process.stderr.write(JSON.stringify({status:'INCOMPLETE',operationId:OP,error:errorView(error)})+'\n');process.exitCode=1;});
}
