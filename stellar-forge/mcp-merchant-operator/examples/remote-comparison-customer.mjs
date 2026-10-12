#!/usr/bin/env node
// MIT. Continue a complete customer comparison through the original HTTP merchant and client.
import { readFile, writeFile, mkdir, rename, open, stat } from 'node:fs/promises';
import { dirname, join, resolve } from 'node:path';
import { pathToFileURL } from 'node:url';
import { createHash, randomBytes } from 'node:crypto';
import { spawn } from 'node:child_process';

const need=(ok,message)=>{if(!ok)throw new Error(message);};
const json=raw=>JSON.parse(new TextDecoder('utf-8',{fatal:true}).decode(raw));
const encoded=value=>Buffer.from(JSON.stringify(value,null,2)+'\n');
const sha=raw=>createHash('sha256').update(raw).digest('hex');
const exists=async path=>{try{await stat(path);return true;}catch(error){if(error.code==='ENOENT')return false;throw error;}};
async function save(path,value){
  const raw=Buffer.isBuffer(value)?value:encoded(value),temporary=path+'.next';
  const handle=await open(temporary,'w',0o600);
  try{await handle.writeFile(raw);await handle.sync();}finally{await handle.close();}
  await rename(temporary,path);
  const parent=await open(dirname(path),'r');try{await parent.sync();}finally{await parent.close();}
}
async function immutable(path,value){
  const raw=Buffer.isBuffer(value)?value:encoded(value);
  if(await exists(path)){need((await readFile(path)).equals(raw),'A retained original file changed: '+path);return;}
  const handle=await open(path,'wx',0o600);try{await handle.writeFile(raw);await handle.sync();}finally{await handle.close();}
}
async function identity(path){const raw=await readFile(path);return{path,bytes:raw.length,sha256:sha(raw)};}
const progress=(phase,extra={})=>process.stdout.write(JSON.stringify({phase,...extra})+'\n');
const descriptorPath=resolve(process.argv[2]??'');
const descriptorRaw=await readFile(descriptorPath),input=json(descriptorRaw);
need(input.schema==='stellar-forge.odata-remote-comparison-customer-input.v1','Select the original remote customer input.');
const checkout=resolve(input.checkout),out=resolve(input.outputDirectory);
await mkdir(out,{recursive:true,mode:0o700});
for(const name of ['steps','requests','logs'])await mkdir(join(out,name),{recursive:true,mode:0o700});
const journalPath=join(out,'remote-customer-operation.json');
let journal=await exists(journalPath)?json(await readFile(journalPath)):
  {schema:'stellar-forge.odata-remote-comparison-customer-operation.v1',operation_id:input.operationId,input_sha256:sha(descriptorRaw),state:'RUNNING',steps:{}};
need(journal.operation_id===input.operationId&&journal.input_sha256===sha(descriptorRaw),'Preserve the selected original customer operation.');
const persist=()=>save(journalPath,journal);
await persist();
const native=(path)=>import(pathToFileURL(join(checkout,path)).href);
const base='stellar/scf-starforge-20261009/sf30-seller-sdk/odata/';
const merchant='stellar-forge/mcp-merchant-operator/';
const cli=join(checkout,merchant,'odata-comparison-cli.mjs');
let session=null,activeChild=null;
async function step(label,args){
  const selected=JSON.stringify(args),prior=journal.steps[label],completedPath=join(out,'steps',label+'.json');
  if(prior&&prior.state!=='COMPLETE'&&await exists(completedPath)){
    const last=prior.attempts.at(-1);
    need(last?.exit?.value===0,'Preserve the incomplete original customer return: '+label);
    const raw=await readFile(completedPath),original=await readFile(join(out,'logs',label+'-'+last.number+'.stdout.json'));
    need(raw.equals(original),'The published original customer return changed: '+label);
    json(raw);prior.result=await identity(completedPath);prior.state='COMPLETE';await persist();
  }
  if(prior){
    need(prior.command===selected,'The retained customer command changed: '+label);
    if(prior.state==='COMPLETE'){
      const body=await readFile(prior.result.path);
      need(body.length===prior.result.bytes&&sha(body)===prior.result.sha256,'The retained customer result changed: '+label);
      return json(body);
    }
  }
  const item=prior??{command:selected,attempts:[]};
  journal.steps[label]=item;
  const attempt={number:item.attempts.length+1,started_at:new Date().toISOString()};
  item.attempts.push(attempt);item.state='RUNNING';await persist();
  const prefix=join(out,'logs',label+'-'+attempt.number);
  const stdout=await open(prefix+'.stdout.json','wx',0o600),stderr=await open(prefix+'.stderr.log','wx',0o600);
  let code;
  try{
    activeChild=spawn(process.execPath,[cli,...args],{cwd:checkout,env:process.env,stdio:['ignore','pipe','pipe']});
    const originalChild=activeChild;
    const exited=new Promise(done=>{
      originalChild.once('error',error=>done({error}));
      originalChild.once('close',(value,signal)=>done({value,signal}));
    });
    attempt.pid=originalChild.pid;
    try{attempt.process_stat=await readFile('/proc/'+activeChild.pid+'/stat','utf8');}catch{}
    await persist();
    let size=0;
    const copyOut=(async()=>{for await(const chunk of activeChild.stdout){size+=chunk.length;need(size<=32*1024*1024,'The original customer reply exceeded its retained bound.');await stdout.write(chunk);}})();
    const copyErr=(async()=>{for await(const chunk of activeChild.stderr)await stderr.write(chunk);})();
    code=await exited;
    await Promise.all([copyOut,copyErr]);await stdout.sync();await stderr.sync();
    if(code.error)throw code.error;
  }finally{await stdout.close();await stderr.close();activeChild=null;}
  attempt.finished_at=new Date().toISOString();attempt.exit=code;await persist();
  if(code.value!==0){
    const error=new Error('Original customer command '+label+' returned '+JSON.stringify(code)+': '+(await readFile(prefix+'.stderr.log','utf8')).slice(-6000));
    throw error;
  }
  const raw=await readFile(prefix+'.stdout.json'),result=json(raw),path=join(out,'steps',label+'.json');
  await immutable(path,raw);item.result=await identity(path);item.state='COMPLETE';await persist();
  progress('remote-customer-command',{step:label,status:'COMPLETE'});
  return result;
}
async function direct(label,fn){
  const old=journal.steps[label],completedPath=join(out,'steps',label+'.json');
  if(old?.state==='RUNNING'&&await exists(completedPath)){
    json(await readFile(completedPath));old.result=await identity(completedPath);old.state='COMPLETE';await persist();
  }
  if(old?.state==='COMPLETE'){
    const raw=await readFile(old.result.path);
    need(raw.length===old.result.bytes&&sha(raw)===old.result.sha256,'The retained original result changed: '+label);return json(raw);
  }
  journal.steps[label]={...(old??{}),state:'RUNNING'};await persist();
  const result=await fn(),path=join(out,'steps',label+'.json');
  await immutable(path,result);journal.steps[label]={...journal.steps[label],state:'COMPLETE',result:await identity(path)};await persist();return result;
}
async function pageAll(label,command,common,field,limit=50){
  const items=[];let offset=0,page=0;
  do{
    const value=await step(label+'-'+page,[command,...common,'--offset',String(offset),'--limit',String(limit)]);
    need(Array.isArray(value[field]),'The original page lacks '+field);
    items.push(...value[field]);offset=value.page.nextOffset;page++;
    need(page<1000,'The original page continuation exceeded its complete bound.');
  }while(offset!==null);
  return items;
}
try{
  const baselineRaw=await readFile(input.workspaceTransfer),worked=json(await readFile(input.worked));
  need(sha(baselineRaw)===input.workspaceTransferSha256,'The original complete workspace transfer changed.');
  need(worked.comparison_sha256===input.comparisonSha256,'The selected completed comparison changed.');
  const {openODataWorkspace}=await native(base+'workspace.mjs');
  const workspaceDirectory=join(out,'merchant-workspace');
  await direct('restore-original-workspace',async()=>{
    const workspace=await openODataWorkspace({directory:workspaceDirectory});
    try{return await workspace.restore(json(baselineRaw));}finally{await workspace.close();}
  });
  const connection=join(out,'merchant-connection.json');
  await immutable(connection,{schema:'stellar-forge.odata-workspace-connection.v1',
    workspaces:{customer:{label:'Original Orders customer comparison',directory:workspaceDirectory}}});
  const {initializeODataWorkspaceMerchant}=await native(merchant+'config.mjs');
  const merchantDirectory=join(out,'merchant');
  if(!await exists(join(merchantDirectory,'merchant-mcp.json')))
    await initializeODataWorkspaceMerchant({directory:merchantDirectory,connection,name:'Original Orders customer'});
  const tokenPath=join(out,'merchant-access.private');
  if(!await exists(tokenPath))await immutable(tokenPath,Buffer.from(randomBytes(32).toString('hex')));
  process.env.F971_ODATA_CUSTOMER_TOKEN=await readFile(tokenPath,'utf8');
  const {startMerchantMcp}=await native(merchant+'serve.mjs');
  session=await startMerchantMcp({configPath:join(merchantDirectory,'merchant-mcp.json'),port:journal.port??0,
    tokenEnv:'F971_ODATA_CUSTOMER_TOKEN',environment:process.env});
  const port=Number(new URL(session.url).port);
  need(journal.port===undefined||journal.port===port,'The resumed download selected a different original listener.');
  journal.port=port;journal.endpoint=session.url;journal.state='RUNNING';await persist();
  const remote=['--url',session.url,'--workspace','customer','--service',input.liveServiceId,'--token-env','F971_ODATA_CUSTOMER_TOKEN'];
  const selected=[...remote,'--comparison',input.comparisonId];
  progress('original-mcp-listening',{url:session.url,operation_id:input.operationId});
  const collections=await pageAll('collections','collections',remote,'collections',1);
  need(collections.length>=2,'The original source collections are absent.');
  const comparisons=await pageAll('comparisons','list',remote,'comparisons',1);
  need(comparisons.some(item=>item.id===input.comparisonId&&item.manifestSha256===input.comparisonSha256),'The merchant did not return the selected original comparison.');
  const initial=await step('original-inspect',['inspect',...selected,'--offset','0','--limit','100']);
  need(initial.manifestSha256===input.comparisonSha256&&initial.counts.beforeRows===830&&initial.counts.afterRows===830&&
    initial.counts.matched===830&&initial.counts.changedCells===4150,'The complete original source comparison differs.');
  const originalEditions=await pageAll('original-editions','editions',selected,'editions',2);
  need(originalEditions.some(item=>item.sha256===worked.source_document_sha256),'The original frozen review edition is absent.');
  const rows=await step('original-cells',['rows',...selected,'--kind','cells','--status','changed','--offset','0','--limit','100']);
  need(rows.total===4150&&rows.rows.length===100,'The original changed-cell page differs.');
  const entities=await step('original-entities',['rows',...selected,'--kind','entities','--status','changed','--offset','800','--limit','100']);
  need(entities.total===830&&entities.rows.length===30&&entities.nextOffset===null,'The original final entity page differs.');
  const cell=rows.rows[0];
  need(typeof cell.entityKey==='string'&&typeof cell.field==='string'&&cell.change==='selection_changed','Select the original field-selection cell.');
  let revision=initial.reviews.revision,firstRequest;
  const notes=[
    ['comparison','accepted','Both retained collections contain the same 830 original Orders. The 4,150 changed cells record the explicit country-projection field selection.'],
    ['entity','note','This original entity remains in both complete collections; its unselected after-fields remain distinct from source nulls.'],
    ['column','accepted','The selected field is retained in the full original collection and omitted from the country projection; its source values remain available.'],
    ['cell','note','This retained cell records selection_changed. Preserve its original before value and explicit after selection state.']
  ];
  for(const [scope,status,note]of notes){
    const requestPath=join(out,'requests','review-'+scope+'.json');
    let request;
    if(await exists(requestPath))request=json(await readFile(requestPath));
    else{
      request={schema:'stellar-forge.odata-comparison-review-request.v1',liveServiceId:input.liveServiceId,comparisonId:input.comparisonId,
        requestId:'F971-ODATA-REMOTE-20261012-R1-'+scope,expectedRevision:revision,scope,
        ...(['entity','cell'].includes(scope)?{entityKey:cell.entityKey}:{}),
        ...(['column','cell'].includes(scope)?{field:cell.field}:{}),
        status,actor:'Remote customer receiving analyst',note};
      await immutable(requestPath,request);
    }
    const saved=await step('review-'+scope,['review',...selected,'--request',requestPath,'--request-sha256',sha(await readFile(requestPath))]);
    revision=saved.reviewRevision;if(!firstRequest)firstRequest={path:requestPath,review:saved.review};
  }
  const retried=await step('review-original-retry',['review',...selected,'--request',firstRequest.path]);
  need(retried.reused===true&&retried.review.version===firstRequest.review.version&&retried.reviewRevision===revision,
    'The exact original review retry changed its saved version.');
  const reviewed=await step('reviewed-inspect',['inspect',...selected,'--offset','0','--limit','100']);
  need(reviewed.reviews.revision===initial.reviews.revision+4,'The customer review history changed unexpectedly.');
  const publication=await step('publish-selected-review',['publish',...selected,'--revision',String(reviewed.reviews.revision)]);
  need(publication.comparisonSha256===input.comparisonSha256,'Publication selected another original comparison.');
  const currentEditions=await pageAll('published-editions','editions',selected,'editions',2);
  need(currentEditions.some(item=>item.editionId===publication.editionId&&item.sha256===publication.sha256)&&
    originalEditions.every(old=>currentEditions.some(item=>item.editionId===old.editionId&&item.sha256===old.sha256)),
    'Publication lost an original frozen edition.');
  const source=await step('published-source',['source',...selected,'--edition',publication.editionId,'--sha256',publication.sha256]);
  const download=join(out,'download');
  const downloaded=await step('complete-download',['download',...selected,'--edition',publication.editionId,'--sha256',publication.sha256,
    '--out',download,'--chunk-size','131072','--progress','true']);
  const reopenedDownload=await step('same-download-reopen',['download',...selected,'--edition',publication.editionId,'--sha256',publication.sha256,
    '--out',download,'--chunk-size','131072']);
  need(downloaded.sourceSha256===publication.sha256&&reopenedDownload.sourceSha256===publication.sha256,'The reopened complete download changed.');
  const verified=await step('offline-download-verification',['verify-download','--directory',download,'--sha256',publication.sha256,'--edition',publication.editionId]);
  const receiving=join(out,'received-comparison');
  const received=await step('offline-native-receive',['receive','--download',download,'--out',receiving,'--sha256',publication.sha256,'--edition',publication.editionId]);
  const receivedAgain=await step('offline-native-reopen',['receive','--download',download,'--out',receiving,'--sha256',publication.sha256,'--edition',publication.editionId]);
  const replay=await step('offline-source-replay',['inspect-received','--directory',receiving,'--replay','true']);
  need(replay.manifestSha256===input.comparisonSha256&&replay.reviews.revision===publication.reviewRevision&&
    receivedAgain.comparison.reused===true,'The independently received comparison changed.');
  const offlineRows=await step('offline-last-cells',['received-rows','--directory',receiving,'--kind','cells','--status','changed','--offset','4100','--limit','100']);
  need(offlineRows.total===4150&&offlineRows.rows.length===50&&offlineRows.nextOffset===null,'The offline final changed-cell page differs.');
  const remoteTarget='orders-remote-customer-received',remoteReceiving=[...remote,'--comparison',remoteTarget];
  const restored=await step('remote-original-receive',['restore-remote',...remoteReceiving,'--source-comparison',input.comparisonId,
    '--source-edition',publication.editionId,'--sha256',publication.sha256]);
  const restoredAgain=await step('remote-original-reopen',['restore-remote',...remoteReceiving,'--source-comparison',input.comparisonId,
    '--source-edition',publication.editionId,'--sha256',publication.sha256]);
  need(restored.manifestSha256===input.comparisonSha256&&restoredAgain.reviews.revision===publication.reviewRevision,
    'The original destination merchant did not retain the selected edition.');
  await session.close();session=null;
  const backup=await direct('customer-workspace-transfer',async()=>{
    const workspace=await openODataWorkspace({directory:workspaceDirectory});
    try{
      const path=join(out,'OData_Remote_Customer_Workspace.json');
      if(await exists(path)){
        const saved=json(await readFile(path));
        need(saved.schema==='stellar-forge.odata-transfer.v1'&&Array.isArray(saved.files)&&
          saved.files.some(file=>file.path==='live/products/'+input.liveServiceId+'/comparisons/'+input.comparisonId+
            '/editions/'+publication.editionId+'/source.json'&&file.sha256===publication.sha256),
          'The retained complete customer workspace changed.');
        return await identity(path);
      }
      const result=await workspace.backup();await immutable(path,result);return await identity(path);
    }finally{await workspace.close();}
  });
  const result={schema:'stellar-forge.odata-remote-comparison-customer.v1',operation_id:input.operationId,state:'COMPLETE',
    baseline_sha256:input.archiveSha256,comparison_sha256:input.comparisonSha256,source_rows:830,changed_cells:4150,
    original_review_revision:initial.reviews.revision,review_revision:publication.reviewRevision,
    original_editions:originalEditions,new_edition:publication,review_retry:retried,
    original_endpoint:journal.endpoint,source,download:downloaded,download_reopen:reopenedDownload,
    verified_download:verified,receiving:received,receiving_reopen:receivedAgain,offline_replay:replay,
    remote_receiving:restored,remote_receiving_reopen:restoredAgain,workspace_transfer:backup,
    analysis_source_manifest:join(download,'source.json'),comparison_directory:receiving};
  await immutable(join(out,'remote-customer-result.json'),result);
  journal.state='COMPLETE';journal.finished_at=new Date().toISOString();delete journal.error;await persist();
  progress('remote-comparison-customer',{state:'COMPLETE',comparison:input.comparisonSha256,edition:publication.editionId,review_revision:publication.reviewRevision});
}catch(error){
  journal.state='NEEDS_ATTENTION';journal.error={name:error.name,code:error.code??null,message:error.message,stack:error.stack};await persist();
  process.stderr.write(JSON.stringify(journal.error)+'\n');process.exitCode=1;
}finally{
  if(activeChild&&!activeChild.killed)activeChild.kill('SIGTERM');
  if(session)try{await session.close();}catch(error){journal.close_error={message:error.message};await persist();process.exitCode=1;}
}
