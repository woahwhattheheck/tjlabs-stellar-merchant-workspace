#!/usr/bin/env node
// MIT. One original-case governance receiving through three existing owned consoles.
// The caller owns these servers. This programme borrows and closes only its clients.
import {open,lstat,realpath,mkdir,link,unlink} from 'node:fs/promises';
import {constants} from 'node:fs';
import {resolve,join,dirname} from 'node:path';
import {createHash,randomUUID} from 'node:crypto';
import {connectGrantPortfolio,saveGrantPortfolioFile} from '../../client.mjs';

const SCHEMA='stellar-forge.governance-receiving.v1';
const COLLECTIONS=['committees','meetings','decisions','evaluations','findings','responses','followups'];
const HASH=/^[0-9a-f]{64}$/,OP=/^[A-Za-z0-9][A-Za-z0-9._:-]{0,110}$/;
const need=(v,m)=>{if(!v)throw Error(m);};
const bytes=v=>Buffer.from(JSON.stringify(v,null,2)+'\n');
const sha=b=>createHash('sha256').update(b).digest('hex');
const same=(a,b)=>JSON.stringify(a)===JSON.stringify(b);
async function syncParent(path){const fd=await open(dirname(path),constants.O_RDONLY|constants.O_DIRECTORY);try{await fd.sync();}finally{await fd.close();}}
async function read(path,maximum=64*1024*1024){
 const fd=await open(path,constants.O_RDONLY|constants.O_NOFOLLOW|constants.O_NONBLOCK);
 try{const before=await fd.stat();need(before.isFile()&&before.size<=maximum,'Select a bounded complete regular file.');
  const body=await fd.readFile(),after=await fd.stat(),named=await lstat(path);
  need(before.dev===after.dev&&before.ino===after.ino&&before.size===after.size&&before.mtimeMs===after.mtimeMs&&
   before.ctimeMs===after.ctimeMs&&named.ino===before.ino&&named.dev===before.dev&&body.length===before.size,'The original selected file changed.');
  return body;
 }finally{await fd.close();}
}
async function retain(path,body){
 try{const old=await read(path,Math.max(body.length,64*1024*1024));need(old.equals(body),'An original receiving artifact differs: '+path);await syncParent(path);return;}
 catch(e){if(e.code!=='ENOENT')throw e;}
 const temporary=path+'.pending-'+randomUUID();let fd;
 try{fd=await open(temporary,constants.O_WRONLY|constants.O_CREAT|constants.O_EXCL|constants.O_NOFOLLOW,0o600);
  await fd.writeFile(body);await fd.sync();await fd.close();fd=null;
  try{await link(temporary,path);}catch(e){if(e.code!=='EEXIST')throw e;need((await read(path,Math.max(body.length,64*1024*1024))).equals(body),'A competing output differs.');}
  await syncParent(path);
 }finally{if(fd)await fd.close();await unlink(temporary).catch(e=>{if(e.code!=='ENOENT')throw e;});}
}
async function fileIdentity(path){
 const fd=await open(path,constants.O_RDONLY|constants.O_NOFOLLOW|constants.O_NONBLOCK);
 try{const before=await fd.stat();need(before.isFile()&&before.size<=4*1024*1024*1024,'Select the bounded original file.');
  const buffer=Buffer.alloc(1024*1024),hash=createHash('sha256');let total=0;
  for(;;){const {bytesRead}=await fd.read(buffer,0,buffer.length,null);if(!bytesRead)break;total+=bytesRead;need(total<=before.size,'The selected file grew.');hash.update(buffer.subarray(0,bytesRead));}
  const after=await fd.stat(),named=await lstat(path);
  need(total===before.size&&before.dev===after.dev&&before.ino===after.ino&&before.size===after.size&&
   before.mtimeMs===after.mtimeMs&&before.ctimeMs===after.ctimeMs&&named.dev===before.dev&&named.ino===before.ino,'The complete original file changed.');
  return {bytes:total,sha256:hash.digest('hex')};
 }finally{await fd.close();}
}
async function run(inputFile,out){
 const original=await read(inputFile,2*1024*1024),input=JSON.parse(original);
 need(input.schema===SCHEMA&&OP.test(input.operationId),'Select the whole original-case receiving input and stable operation ID.');
 need(Array.isArray(input.steps)&&input.steps.length>0&&input.steps.length<=100,'Supply the full reviewed producer actions.');
 need(input.recipientAction?.action==='portfolio.save','Supply the actual reviewed recipient edit.');
 need(input.archive&&HASH.test(input.archive.sha256)&&Number.isSafeInteger(input.archive.bytes),'Select the complete original portfolio archive.');
 need(typeof input.authorization==='string'&&input.authorization.trim(),'Retain the actual internal case/programme authorization reference.');
 await mkdir(out,{recursive:true,mode:0o700});need(await realpath(out)===out,'Keep the exact receiving directory.');
 const dir=await lstat(out);need(dir.isDirectory()&&(dir.mode&0o077)===0,'Keep the private original operation directory.');
 await retain(join(out,'receiving-input.json'),original);
 const source={archive:input.archive,input:{bytes:original.length,sha256:sha(original)},operationId:input.operationId,
  sourceSchema:SCHEMA,authorization:input.authorization};
 await retain(join(out,'selection.json'),bytes(source));
 const clients=[],steps=[],artifacts=[];let failure=null,final=null;
 const stageNames=['01-original-workspaces','02-original-archive','03-original-case',
  ...input.steps.map((_,index)=>'04-producer-step-'+String(index+1).padStart(3,'0')),
  '05-complete-producer','06-complete-delivery','07-independent-receiving','08-recipient-reopen',
  '09-recipient-edit','10-recipient-reopen','11-earlier-import-replay','12-complete-return',
  '13-independent-return','14-return-history'];
 async function verifyArtifacts(receipts){
  need(Array.isArray(receipts)&&receipts.length<=100000,'Keep the complete bounded original artifact index.');
  const found=new Set();
  for(const receipt of receipts){
   need(receipt&&typeof receipt.path==='string'&&/^[A-Za-z0-9][A-Za-z0-9._-]{0,399}$/.test(receipt.path)&&
    !found.has(receipt.path)&&HASH.test(receipt.sha256)&&Number.isSafeInteger(receipt.bytes)&&receipt.bytes>=0,
    'Keep every exact original artifact identity once.');
   found.add(receipt.path);const observed=await fileIdentity(join(out,receipt.path));
   need(observed.bytes===receipt.bytes&&observed.sha256===receipt.sha256,'A complete retained artifact differs: '+receipt.path);
  }
 }
 function rememberArtifacts(receipts){
  for(const receipt of receipts){const old=artifacts.find(x=>x.path===receipt.path);
   need(!old||same(old,receipt),'An original artifact receipt changed.');if(!old)artifacts.push(receipt);}
 }
 function capture(name,value){return save(name,bytes(value));}
 async function save(name,body){await retain(join(out,name),body);const receipt={path:name,bytes:body.length,sha256:sha(body)};
  if(!artifacts.some(a=>a.path===name))artifacts.push(receipt);return receipt;}
 async function stage(name,fn){
  const path=name+'.json';let prior;
  try{prior=JSON.parse(await read(join(out,path)));}catch(e){if(e.code!=='ENOENT')throw e;}
  if(prior){
   need(prior.schema==='stellar-forge.governance-receiving-stage.v1'&&prior.name===name&&
    prior.inputSha256===source.input.sha256,'The retained original completed stage differs.');
   await verifyArtifacts(prior.artifacts);rememberArtifacts(prior.artifacts);
   await capture(path,prior);steps.push({name,state:'COMPLETE',artifact:path});return prior.value;
  }
  const value=await fn(),completed={schema:'stellar-forge.governance-receiving-stage.v1',name,
   inputSha256:source.input.sha256,value,artifacts:artifacts.map(r=>({...r}))};
  await capture(path,completed);steps.push({name,state:'COMPLETE',artifact:path});return value;
 }
 async function action(client,label,request){
  need(request.operationId&&request.action,'Keep the original whole request.');
  await capture(label+'-request.json',request);
  // Original admission resolves an existing request before revision CAS.
  let result=await client.action(request);if(result.state==='RUNNING')result=await client.wait(request.operationId);
  // Retain every observed state without pinning a retryable failure as the final result.
  await capture(label+'-observed-'+sha(bytes(result))+'.json',result);
  need(result.state==='COMPLETED','The original request needs explicit correction/continuation: '+request.operationId);
  await capture(label+'-accepted-response.json',result);
  const replay=await client.action(request);
  need(replay.id===result.id&&replay.inputSha256===result.inputSha256&&same(replay.result,result.result),
   'Original request replay differs.');
  return result.result;
 }
 async function verify(client,portfolio,label){
  const actual=await client.portfolio(portfolio.id,{revision:portfolio.revision});
  need(actual.snapshot===portfolio.snapshot&&same(actual,portfolio),'The saved original portfolio differs.');
  const governance=actual.definition.governance;
  if(governance){for(const collection of COLLECTIONS){
    let total=0;for await(const page of client.pages({portfolioId:actual.id,revision:actual.revision,table:'governance_'+collection,limit:50})){
     need(page.snapshot===actual.snapshot,'A full register page selected a different snapshot.');total+=page.rows.length;
     for(const row of page.rows){
      const read=await client.governanceRecord({portfolioId:actual.id,revision:actual.revision,collection,id:row.id});
      need(same(read.record,row),'The complete record reader differs from its original table.');
      const history=await client.governanceHistory({portfolioId:actual.id,revision:actual.revision,collection,id:row.id});
      need(history.history.length>0&&same(history.history.at(-1).record,row),'Original record history lost its selected edition.');
      const review=await client.governanceReview({portfolioId:actual.id,revision:actual.revision,collection,id:row.id});
      need(same(review.record,row),'The full dependency review selected another edition.');
      await capture(label+'-'+collection+'-'+row.id+'.json',{read,history,review});
     }
    }need(total===governance.records[collection].length,'The complete register traversal omitted records.');
   }
   for(const document of actual.definition.programme.records.documents){if(!document.object)continue;
    const receipt=await client.openProgrammeDocument({portfolioId:actual.id,revision:actual.revision,id:document.id});
    const name='evidence-'+document.object.sha256,target=join(out,name);
    const saved=await saveGrantPortfolioFile(receipt,target);await syncParent(target);
    need(saved.bytes===document.object.bytes&&saved.sha256===document.object.sha256,'Original evidence download differs.');
    if(!artifacts.some(a=>a.path===name))artifacts.push({path:name,bytes:saved.bytes,sha256:saved.sha256});
   }
  }
  await capture(label+'-portfolio.json',actual);return actual;
 }
 async function exportOne(client,portfolio,label){
  const descriptor=await action(client,label,{operationId:input.operationId+':'+label,action:'portfolio.export',
   payload:{portfolioId:portfolio.id,revision:portfolio.revision}});
  const target=join(out,label+'.zip');await client.downloadExport(descriptor.sha256,target,{bytes:descriptor.bytes});
  const info=await fileIdentity(target);need(info.sha256===descriptor.sha256&&info.bytes===descriptor.bytes,'Complete portable archive differs.');
  artifacts.push({path:label+'.zip',...info});return {path:target,...info};
 }
 async function receive(client,archive,label){
  const uploaded=await client.uploadFile(archive.path,{sha256:archive.sha256});
  need(uploaded.bytes===archive.bytes&&uploaded.sha256===archive.sha256,'The original full handoff upload differs.');
  return action(client,label,{operationId:input.operationId+':'+label,action:'portfolio.receive',payload:{object:archive.sha256}});
 }
 try{
  for(const name of ['producer','recipient','return']){
   need(typeof input.connections?.[name]==='string','Select three actual original console connection files.');
   const client=await connectGrantPortfolio({consoleUrlFile:input.connections[name]});clients.push(client);
  }
  const [producer,recipient,returnClient]=clients,states=await Promise.all(clients.map(c=>c.state()));
  need(new Set(states.map(s=>s.workspaceId)).size===3,'Receiving requires three distinct actual original workspaces.');
  const archivePath=resolve(input.archive.path),info=await fileIdentity(archivePath);
  need(info.bytes===input.archive.bytes&&info.sha256===input.archive.sha256,'The selected original archive changed.');
  let complete;
  try{complete=JSON.parse(await read(join(out,'COMPLETE.json')));}catch(e){if(e.code!=='ENOENT')throw e;}
  if(complete){
   need(complete.schema==='stellar-forge.governance-receiving-result.v1'&&complete.operationId===input.operationId&&
    same(complete.input,source.input)&&complete.state==='COMPLETE'&&complete.lifetimes==='CLOSED'&&
    same(complete.steps.map(x=>x.name),stageNames)&&complete.steps.every(x=>x.state==='COMPLETE'&&x.artifact===x.name+'.json')&&
    complete.final?.producer?.id===input.portfolio.id&&complete.final?.recipient?.id===input.portfolio.id,
    'Keep the complete original receiving report and its ordered whole journey.');
   await verifyArtifacts(complete.artifacts);
   const first=JSON.parse(await read(join(out,'01-original-workspaces.json')));
   need(first.schema==='stellar-forge.governance-receiving-stage.v1'&&first.inputSha256===source.input.sha256&&
    same(first.value.workspaces.map(x=>x.workspaceId),states.map(x=>x.workspaceId)),
    'The original completed receiving workspaces differ.');
   for(const row of complete.steps)need(complete.artifacts.some(a=>a.path===row.artifact),'A completed stage is missing from its full report.');
   rememberArtifacts(complete.artifacts);steps.push(...complete.steps);final=complete.final;
  }else{
  const workspaceStage=await stage('01-original-workspaces',async()=>{
   return {workspaces:states.map(s=>({workspaceId:s.workspaceId,revision:s.revision}))};
  });
  need(same(workspaceStage.workspaces.map(s=>s.workspaceId),states.map(s=>s.workspaceId)),
   'The original console workspace identities changed.');
  await stage('02-original-archive',()=>receive(producer,{path:archivePath,...info},'receive-original'));
  let current=await producer.portfolio(input.portfolio.id,{revision:input.portfolio.revision});
  need(current.snapshot===input.portfolio.snapshot,'The original reviewed portfolio selection differs.');
  await stage('03-original-case',()=>verify(producer,current,'original'));
  const reserved=['receive-original','producer-delivery','receive-producer','recipient-return','receive-return'].map(label=>input.operationId+':'+label);
  const supplied=[...input.steps,input.recipientAction].map(request=>request.operationId);
  need(supplied.every(id=>typeof id==='string'&&id.length<=160)&&new Set([...reserved,...supplied]).size===reserved.length+supplied.length,
   'Each original reviewed request needs its own distinct retained identity.');
  const requestIds=new Set();
  for(let index=0;index<input.steps.length;index++){
   const request=input.steps[index];need(request.action==='portfolio.save'&&request.payload?.id===current.id&&
    request.payload.expectedPortfolioRevision===current.revision&&request.payload.governance&&
    !requestIds.has(request.operationId),'Keep each reviewed governance action on its exact original predecessor.');
   requestIds.add(request.operationId);
   current=await stage('04-producer-step-'+String(index+1).padStart(3,'0'),()=>action(producer,'producer-step-'+index,request));
  }
  const governed=current.definition.governance;
  need(governed&&COLLECTIONS.every(name=>governed.records[name].some(r=>r.publication)),
   'A whole governance journey requires actual recorded editions in all seven registers; incomplete supplied input stays incomplete.');
  await stage('05-complete-producer',()=>verify(producer,current,'producer'));
  const delivery=await stage('06-complete-delivery',()=>exportOne(producer,current,'producer-delivery'));
  const received=await stage('07-independent-receiving',()=>receive(recipient,delivery,'receive-producer'));
  need(received.portfolioId===current.id,'Independent receiving selected another original portfolio.');
  await stage('08-recipient-reopen',()=>verify(recipient,current,'recipient-original'));
  const edit=input.recipientAction;
  need(edit.payload.id===current.id&&edit.payload.expectedPortfolioRevision===current.revision&&edit.payload.governance,
   'The actual recipient edit selects the complete received edition.');
  const revised=await stage('09-recipient-edit',()=>action(recipient,'recipient-edit',edit));
  need(revised.revision>current.revision,'The supplied recipient action did not create a following original revision.');
  await stage('10-recipient-reopen',()=>verify(recipient,revised,'recipient-edited'));
  await stage('11-earlier-import-replay',async()=>{
   const before=await recipient.portfolio(revised.id,{revision:revised.revision});
   const stateBefore=await recipient.state(),latestBefore=stateBefore.portfolios.find(p=>p.id===revised.id);
   need(latestBefore&&latestBefore.revision>=revised.revision,'Retain the actual recipient edition before replay.');
   const latestPortfolioBefore=await recipient.portfolio(revised.id,{revision:latestBefore.revision});
   await receive(recipient,delivery,'receive-producer');
   const after=await recipient.portfolio(revised.id,{revision:revised.revision});
   const state=await recipient.state(),latest=state.portfolios.find(p=>p.id===revised.id);
   need(latest&&latest.revision===latestBefore.revision&&same(before,after),'Earlier import replay changed the recipient revision.');
   const latestPortfolioAfter=await recipient.portfolio(revised.id,{revision:latest.revision});
   need(same(latestPortfolioBefore,latestPortfolioAfter),'Earlier import replay changed later recipient work.');
   return {revision:after.revision,snapshot:after.snapshot,latestRevision:latest.revision,latestSnapshot:latestPortfolioAfter.snapshot};
  });
  const returned=await stage('12-complete-return',()=>exportOne(recipient,revised,'recipient-return'));
  await stage('13-independent-return',()=>receive(returnClient,returned,'receive-return'));
  await stage('14-return-history',()=>verify(returnClient,revised,'return'));
  final={producer:{id:current.id,revision:current.revision,snapshot:current.snapshot},
         recipient:{id:revised.id,revision:revised.revision,snapshot:revised.snapshot},delivery,returned};
  }
 }catch(error){failure={name:error.name,message:error.message,code:error.code||null};}
 finally{
  const closed=await Promise.allSettled(clients.map(client=>client.dispose()));
  const errors=closed.filter(v=>v.status==='rejected').map(v=>String(v.reason));
  if(errors.length)failure={...(failure||{name:'ClientCloseError'}),closureErrors:errors};
 }
 const report={schema:'stellar-forge.governance-receiving-result.v1',operationId:input.operationId,
  input:source.input,state:failure?'INTERRUPTED':'COMPLETE',lifetimes:clients.every(c=>c.closed)?'CLOSED':'UNRESOLVED',
  steps,artifacts,final,error:failure};
 if(report.lifetimes!=='CLOSED')report.state='INTERRUPTED';
 await retain(join(out,(report.state==='COMPLETE'?'COMPLETE':'INTERRUPTED-'+sha(bytes(report)))+'.json'),bytes(report));
 if(report.state!=='COMPLETE')throw Object.assign(Error('The original governance receiving remains interrupted.'),{report});
 return report;
}
const args=process.argv.slice(2);if(args.length!==4||args[0]!=='--input'||args[2]!=='--out')throw Error('Use --input ORIGINAL.json --out PRIVATE_DIRECTORY');
const result=await run(resolve(args[1]),resolve(args[3]));
process.stdout.write(JSON.stringify(result,null,2)+'\n');
