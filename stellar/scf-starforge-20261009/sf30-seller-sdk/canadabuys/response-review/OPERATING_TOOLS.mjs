// MIT. Continue the same saved response-return customer through the installed MCP product.
import { readFile, open, mkdir, rename, unlink, link, stat, realpath } from 'node:fs/promises';
import { createServer } from 'node:http';
import { createHash, randomBytes, randomUUID } from 'node:crypto';
import { join, resolve, dirname } from 'node:path';
import { pathToFileURL } from 'node:url';
import { parseArgs } from 'node:util';
import model from './model.cjs';
import { canonical } from '../core.mjs';

const schema='starforge.canadabuys.response-review-mcp-course.v1';
const need=(value,message)=>{if(!value)throw new Error(message);};
const sha=value=>createHash('sha256').update(value).digest('hex');
const encode=value=>Buffer.from(JSON.stringify(value,null,2)+'\n');
const decode=bytes=>new TextDecoder('utf-8',{fatal:true}).decode(bytes);
const same=(a,b)=>canonical(a)===canonical(b);
const modelOptions={hash:sha,hashBytes:bytes=>sha(Buffer.from(bytes))};
async function optionalJSON(path){try{return JSON.parse(decode(await readFile(path)));}catch(error){if(error.code==='ENOENT')return null;throw error;}}
async function syncDirectory(path){const file=await open(path,'r');try{await file.sync();}finally{await file.close();}}
async function atomic(path,value){
 const temporary=path+'.'+randomUUID()+'.tmp',file=await open(temporary,'wx',0o600);
 try{await file.writeFile(encode(value));await file.sync();await file.close();await rename(temporary,path);await syncDirectory(dirname(path));}
 catch(error){await file.close().catch(()=>{});await unlink(temporary).catch(()=>{});throw error;}
}
async function immutable(path,bytes){
 const temporary=path+'.'+randomUUID()+'.pending',file=await open(temporary,'wx',0o600);
 try{
  await file.writeFile(bytes);await file.sync();await file.close();
  try{await link(temporary,path);}catch(error){if(error.code!=='EEXIST')throw error;need((await readFile(path)).equals(bytes),'The original complete file changed: '+path);}
  await syncDirectory(dirname(path));
 }finally{await file.close().catch(()=>{});await unlink(temporary).catch(error=>{if(error.code!=='ENOENT')throw error;});}
 const saved=await readFile(path);need(saved.equals(bytes),'The complete retained file differs: '+path);
 return {path,bytes:bytes.length,sha256:sha(bytes)};
}
async function originalFile(info){
 need(info&&typeof info.path==='string'&&Number.isSafeInteger(info.bytes)&&/^[a-f0-9]{64}$/.test(info.sha256),'Keep the complete original artifact selection.');
 const bytes=await readFile(info.path);
 need(bytes.length===info.bytes&&sha(bytes)===info.sha256,'The complete original artifact changed: '+info.path);
 return bytes;
}
function recordMatches(actual,expected){
 return actual?.id===expected?.id&&actual?.revision===expected?.revision
  &&actual?.editionSha256===expected?.editionSha256&&actual?.sha256===expected?.sha256&&actual?.bytes===expected?.bytes;
}
async function privateRoot(path){
 await mkdir(path,{recursive:true,mode:0o700});
 const info=await stat(path);
 need(info.isDirectory()&&await realpath(path)===path&&(process.platform==='win32'||(info.mode&0o077)===0),
  'Use the original canonical private course directory.');
}
async function listen(server,port){
 await new Promise((resolve,reject)=>{
  const failure=error=>{server.off('listening',ready);reject(error);};
  const ready=()=>{server.off('error',failure);resolve();};
  server.once('error',failure);server.once('listening',ready);server.listen(port,'127.0.0.1');
 });
}
async function closeServer(server){
 if(!server?.listening)return;
 await new Promise((resolve,reject)=>{
  server.close(error=>error?reject(error):resolve());
  server.closeIdleConnections?.();
 });
}
function toolFailure(error){
 const view={};
 for(const key of ['code','message','applied','outcomeUnknown','reopenRequired','status','details','commitUncertainty'])
  if(error[key]!==undefined)view[key]=error[key];
 return view;
}

/**
 * Original browser/HTTP workspace owners must be fully closed before entry.
 * Reuses the completed response-review-journey, its actual original two DBs and
 * confirmed command inputs. Creates no response, return, workspace or case.
 * publicationSelections is an explicit {step:{publicationId,note}} recovery map.
 */
export async function operateResponseReviewTools({
 sourceDirectory,caseDirectory,workspaceDirectory,receivingDirectory,responseDirectory,outputDirectory,
 publicationSelections={}
}={}){
 sourceDirectory=resolve(sourceDirectory);caseDirectory=resolve(caseDirectory);
 workspaceDirectory=resolve(workspaceDirectory||join(caseDirectory,'operator-workspace'));
 receivingDirectory=resolve(receivingDirectory||join(caseDirectory,'receiving-workspace'));
 responseDirectory=resolve(responseDirectory||join(caseDirectory,'response-review-journey'));
 const directory=resolve(outputDirectory||join(caseDirectory,'response-review-mcp'));
 await privateRoot(directory);
 const at=path=>import(pathToFileURL(join(sourceDirectory,path)));
 const mcp='stellar-forge/mcp-merchant-operator/';
 const {acquireStateLease}=await at('stellar/scf-starforge-20261009/merchant-fleet-gateway/state-lease.mjs');
 const lease=await acquireStateLease(directory);
 let result,owner,client,receiverClient,httpServer,opened,receiverOpened,failure;
 const resultPath=join(directory,'result.json');
 const save=async()=>{lease.assertHeld();await atomic(resultPath,result);};
 try{
  const original=await optionalJSON(join(responseDirectory,'original-customer-result.json'));
  need(original?.status==='completed'&&original.binding?.operation==='SCF-CANADABUYS-PROCUREMENT-9FCD-20261012',
   'Continue the completed original APM2 response and its receiving operation.');
  const journey=original.journey;
  need(journey?.phase==='COMPLETE'&&journey.record&&journey.receipt?.returnedRecord,
   'Keep the completed original hosted, standalone and received response.');
  const binding=original.binding,selected=journey.record;
  need(journey.workspaceId===binding.workspaceId&&journey.workshareId===binding.workshareId,
   'The response course belongs to another saved customer.');
  for(const path of [workspaceDirectory,receivingDirectory]){
   const db=await stat(join(path,'workspace.sqlite'));need(db.isFile()&&db.size>0,'The original customer database is required.');
   need(await realpath(path)===path,'Keep both original database directories canonical.');
  }
  const returnedBytes=await originalFile(journey.downloads.returned);
  const returned=await model.validateTransfer(JSON.parse(decode(returnedBytes)),modelOptions);
  need(returned.base.workspaceId===binding.workspaceId&&returned.base.record.id===selected.id,
   'The complete original return belongs to another response.');
  const received=JSON.parse(decode(await originalFile(original.downloads.received)));
  need(recordMatches(received.record,selected)&&same(received.document.binding,returned.base.document.binding),
   'The complete received original response differs.');
  const requests=[];
  for(const entry of journey.requests||[]){
   need(['/prepare','/apply'].includes(entry.endpoint),'Keep the original response command endpoint.');
   const bytes=await originalFile(entry),body=JSON.parse(decode(bytes));
   need(body.commandId===entry.commandId&&body.workspaceId===binding.workspaceId,
    'The retained original command binding changed.');
   if(!entry.confirmed){requests.push({entry,body,bytes,available:false,reason:'Original submitted request has no retained accepted result.'});continue;}
   const expected=entry.endpoint==='/prepare'?returned.base.record:selected;
   need(recordMatches(entry.confirmed.record,expected),
    'The confirmed command belongs to a different original response edition.');
   if(entry.endpoint==='/apply')need(recordMatches(entry.confirmed.returnedRecord,journey.receipt.returnedRecord),
    'The confirmed original returned-evidence record changed.');
   requests.push({entry,body,bytes,available:true});
  }
  const course={operation:binding.operation,workspaceId:binding.workspaceId,receivingWorkspaceId:binding.receivingWorkspaceId,
   noticeId:binding.noticeId,workshareId:binding.workshareId,record:{id:selected.id,revision:selected.revision,
    editionSha256:selected.editionSha256,sha256:selected.sha256,bytes:selected.bytes},
   returned:{bytes:returnedBytes.length,sha256:sha(returnedBytes)},
   received:{bytes:original.downloads.received.bytes,sha256:original.downloads.received.sha256},
   requests:requests.map(({entry,available})=>({endpoint:entry.endpoint,commandId:entry.commandId,
    bytes:entry.bytes,sha256:entry.sha256,confirmed:available})),
   workspaceDirectory,receivingDirectory,responseDirectory};
  result=await optionalJSON(resultPath);
  if(result)need(result.schema===schema&&same(result.course,course),'This retained MCP course belongs to another source, input or saved customer.');
  else result={schema,course,directory,startedAt:new Date().toISOString(),status:'running',steps:{},downloads:{},replays:[],reconciliation:{}};
  const inputsDirectory=join(directory,'inputs');await privateRoot(inputsDirectory);
  const inputs={};
  for(let index=0;index<requests.length;index++){
   const item=requests[index],alias='original-'+index;
   item.alias=alias;item.file=await immutable(join(inputsDirectory,alias+'.json'),item.bytes);
   inputs[alias]={file:item.file.path,label:'Complete original response '+item.entry.endpoint+' '+item.entry.commandId};
  }
  const compareInput=await immutable(join(inputsDirectory,'original-return-comparison.json'),
   encode({recordId:selected.id,transfer:returned}));
  inputs['original-return']={file:compareInput.path,label:'The complete original named response return'};
  const providerDeclaration=JSON.parse(decode(await readFile(join(sourceDirectory,
   'stellar/scf-starforge-20261009/distribution/contributions/merchant-provider-canadabuys-workspaces.json'))));
  const provider=(await at(providerDeclaration.merchantProviders['canadabuys-workspaces'])).default;
  const configurationPath=join(directory,'provider-connection.json');
  await immutable(configurationPath,encode({schema:'starforge.canadabuys.workspace-connection.v1',workspaces:{
   original:{directory:workspaceDirectory,label:'Original response customer',operator:'TJLabs original MCP continuation',inputs,deliveries:{}},
   receiver:{directory:receivingDirectory,label:'Original received response',operator:'TJLabs original MCP receiving',inputs:{},deliveries:{}}
  }}));
  const configuration=await provider.configuration.read(configurationPath,{hostPath:path=>path});
  const exportsDirectory=join(directory,'exports');await privateRoot(exportsDirectory);
  owner=provider.create(await provider.load(),{canadabuysWorkspaces:configuration,exportsDirectory});
  const catalog=provider.tools((name,description,properties,required,annotations)=>({
   name,description,inputSchema:{type:'object',properties,required,additionalProperties:false},annotations
  }));
  const required=['response_status','response_inspect','response_prepare','response_record','response_export','response_compare','response_apply'];
  const names=new Set(catalog.map(value=>value.name));
  need(names.size===catalog.length&&required.every(name=>names.has('merchant_canadabuys_'+name)),
   'The original response MCP contribution is incomplete.');
  const {createMcpToolHandler}=await at('stellar-forge/mcp-paid-agent/http-tools.mjs');
  const token=randomBytes(32).toString('base64url');
  const handler=createMcpToolHandler({tools:catalog,call:(name,args)=>owner.call(name,args)},{
   bearerToken:token,allowedClientOrigins:[],serverName:'canadabuys-original-response-course',serverVersion:'1',
   maxRequestBytes:provider.maxRequestBytes,instructions:provider.instructions.map(value=>value.text).join('\n'),
   toolErrorView:toolFailure
  });
  httpServer=createServer(handler);
  await listen(httpServer,result.transport?.port??0);
  const port=httpServer.address().port,url='http://127.0.0.1:'+port+'/mcp';
  if(result.transport)need(result.transport.url===url,'Reopen the original retained loopback transport endpoint.');
  else{result.transport={port,url,catalogTools:catalog.length};await save();}
  const {openCanadaBuysMerchantClient}=await at(mcp+'canadabuys-client.mjs');
  const environment={CANADABUYS_RESPONSE_COURSE_TOKEN:token};
  const connection={schema:'stellar-forge.canadabuys-customer-connection.v1',url,
   tokenEnv:'CANADABUYS_RESPONSE_COURSE_TOKEN',workspace:'original',workspaceId:binding.workspaceId,maximumResponseBytes:4*1024*1024};
  client=await openCanadaBuysMerchantClient({...connection,environment});
  opened=await client.open();need(opened.native.id===binding.workspaceId,'The original provider opened a different workspace.');
  const {prepareCanadaBuysOperation,executeCanadaBuysOperation,showCanadaBuysOperation,adoptCanadaBuysPublication}=
   await at(mcp+'canadabuys-operations.mjs');
  const {verifyCanadaBuysDownload}=await at(mcp+'canadabuys-download.mjs');
  const operationsDirectory=join(directory,'operations');await privateRoot(operationsDirectory);
  async function operation(name,tool,argumentsForNew){
   const operationDirectory=join(operationsDirectory,name);
   let observation;
   try{observation=await showCanadaBuysOperation(operationDirectory);}
   catch(error){if(error.code!=='ENOENT')throw error;}
   if(!observation){
    const args=await argumentsForNew();
    await prepareCanadaBuysOperation({directory:operationDirectory,operationId:'response-course-'+name,connection,tool,arguments:args});
    observation=await showCanadaBuysOperation(operationDirectory);
   }
   need(observation.request.request.name==='merchant_canadabuys_'+tool
    &&same(observation.request.connection,connection),'The retained step belongs to another original request/connection.');
   let completed;
   if(observation.state==='COMPLETE')completed={value:observation.value,...observation.completion};
   else{
    const selection=publicationSelections[name];
    try{
     completed=selection?await adoptCanadaBuysPublication({directory:operationDirectory,
      publicationId:selection.publicationId,note:selection.note,client}):
      await executeCanadaBuysOperation({directory:operationDirectory,client});
    }catch(error){
     if(error.code==='CANADABUYS_CLIENT_RECONCILIATION_REQUIRED'){
      const published=await client.collect('status',{collection:'publications',limit:500});
      const args=observation.request.request.arguments;
      const candidates=published.items.filter(value=>{
       const s=value.selection;
       return s?.workspaceId===binding.workspaceId&&value.sourceRevision===args.expectedRevision
        &&(tool==='response_compare'?value.format==='response-comparison'&&s.inputSha256===args.expectedSha256:
         value.format==='response-'+args.format&&s.recordId===args.recordId&&s.recordRevision===args.recordRevision);
      });
      result.reconciliation[name]={operationDirectory,request:observation.request.request,candidates,
       instruction:'Select the observed original publication UUID and evidence note in publicationSelections; continue this same operation.'};
      await save();
     }
     throw error;
    }
   }
   result.steps[name]={operationDirectory,request:observation.request.request,outcome:completed.outcome,
    result:completed.value,completedAt:completed.completedAt};delete result.reconciliation[name];await save();
   return completed.value;
  }
  async function download(name,value){
   need(value.publication?.id,'The original publication result did not retain its UUID.');
   const folder=join(directory,'downloads',name);
   await mkdir(dirname(folder),{recursive:true,mode:0o700});
   const downloaded=await client.downloadPublication(value.publication.id,folder);
   const verified=await verifyCanadaBuysDownload({directory:folder,publicationId:value.publication.id});
   need(verified.files===1&&verified.manifest.workspace.id===binding.workspaceId,
    'The full original response publication selected another file set/workspace.');
   const descriptor=verified.manifest.files[0],path=join(folder,descriptor.name),bytes=await readFile(path);
   need(bytes.length===descriptor.bytes&&sha(bytes)===descriptor.sha256,'The complete native publication changed after download.');
   result.downloads[name]={path,bytes:bytes.length,sha256:descriptor.sha256,mime:descriptor.mime,
    publicationId:value.publication.id,manifestSha256:verified.manifestSha256,directory:folder,
    state:verified.state,download:downloaded};
   await save();return {bytes,value:verified.manifest.originalResponse.publication};
  }
  result.status='running';delete result.failure;await save();
  const records=await client.collect('response_status',{collection:'records',limit:500});
  const workshares=await client.collect('response_status',{collection:'workshares',limit:500});
  need(records.items.some(value=>value.id===selected.id)&&workshares.items.some(value=>value.id===binding.workshareId),
   'The complete native response/workshare pages omitted the original selected customer.');
  const historical=await client.responseRecord({recordId:selected.id,recordRevision:selected.revision});
  need(recordMatches(historical.record,selected)&&historical.document.workshare.id===binding.workshareId,
   'The original native historical response changed.');
  result.catalog={tools:catalog.length,records:records.items.length,recordPages:records.pages.length,
   workshares:workshares.items.length,worksharePages:workshares.pages.length};
  result.selectedRecord=historical;await save();

  result.replays=[];
  for(let index=0;index<requests.length;index++){
   const item=requests[index];
   if(!item.available){result.replays.push({commandId:item.entry.commandId,endpoint:item.entry.endpoint,status:'UNCONFIRMED_REQUEST_RETAINED',reason:item.reason});continue;}
   const operationName=item.entry.endpoint.slice(1);
   const inspected=await client.inspectResponse({operation:operationName,input:item.alias,
    expectedSha256:item.file.sha256,commandId:item.entry.commandId});
   need(inspected.file.sha256===item.file.sha256&&inspected.file.bytes===item.file.bytes,
    'MCP inspected a different complete original command.');
   const before=(await client.status({limit:1})).native;
   const replay=await operation('replay-'+index,'response_'+operationName,async()=>({
    input:item.alias,expectedSha256:item.file.sha256,commandId:item.entry.commandId}));
   const after=(await client.status({limit:1})).native;
   need(replay.alreadyApplied===true&&recordMatches(replay.record,item.entry.confirmed.record)
    &&before.id===after.id&&before.revision===after.revision,'Original command replay must reopen its exact saved result without another revision.');
   if(item.entry.confirmed.returnedRecord)need(recordMatches(replay.returnedRecord,item.entry.confirmed.returnedRecord),
    'Original apply replay returned different retained supplier evidence.');
   result.replays.push({commandId:item.entry.commandId,endpoint:item.entry.endpoint,status:'ORIGINAL_RESULT_REOPENED',record:replay.record,workspace:after});
   await save();
  }
  result.replayAvailability=requests.some(item=>item.available)?'CONFIRMED_ORIGINAL_INPUTS':'ORIGINAL_INPUTS_NOT_RETAINED';
  await save();

  let document;
  for(const format of ['document','transfer','editor','markdown']){
   const value=await operation('export-'+format,'response_export',async()=>({
    recordId:selected.id,recordRevision:selected.revision,
    expectedRevision:(await client.status({limit:1})).native.revision,format
   }));
   const saved=await download(format,value),publication=saved.value;
   need(publication.selection?.workspaceId===binding.workspaceId&&publication.selection.recordId===selected.id
    &&publication.selection.recordRevision===selected.revision&&publication.selection.editionSha256===selected.editionSha256
    &&publication.selection.evidenceSha256===selected.sha256,'The publication changed its selected original response edition.');
   const text=decode(saved.bytes);
   if(format==='document'){
    const full=JSON.parse(text);model.validateDocument(full.document);
    need(recordMatches(full.record,selected)&&full.workspace.id===binding.workspaceId&&same(full.document,received.document),
     'The complete MCP document differs from the response already saved in the original receiver.');
    document=full.document;
    const attachments=[];
    const attachmentDirectory=join(directory,'attachments');await privateRoot(attachmentDirectory);
    for(const attachment of document.attachments){
     const bytes=Buffer.from(attachment.base64,'base64');
     need(bytes.toString('base64')===attachment.base64&&bytes.length===attachment.bytes&&sha(bytes)===attachment.sha256,
      'A complete original response attachment differs.');
     const retained=await immutable(join(attachmentDirectory,attachment.id),bytes);
     attachments.push({...retained,id:attachment.id,name:attachment.name,mime:attachment.mime,description:attachment.description});
    }
    result.attachments=attachments;
   }else if(format==='transfer'){
    const transfer=await model.validateTransfer(JSON.parse(text),modelOptions);
    need(transfer.base.workspaceId===binding.workspaceId&&recordMatches(transfer.base.record,selected)
     &&same(transfer.base.document,document)&&same(transfer.draft.content,document.content),
     'The full editable transfer omitted or changed original response contents.');
    result.transfer={transferId:transfer.transferId,answers:transfer.draft.content.answers.length,
     annexes:transfer.draft.content.annexes.length,attachments:transfer.attachments.length};
   }else if(format==='editor'){
    const prefix='<script>window.CANADABUYS_RESPONSE_TRANSFER=',start=text.indexOf(prefix);
    const end=text.indexOf(';</script>',start+prefix.length);
    need(start>=0&&end>start&&!/<script\b[^>]*src=|<link\b[^>]*href=/i.test(text),
     'The original offline editor did not retain all selected local assets.');
    const transfer=await model.validateTransfer(JSON.parse(text.slice(start+prefix.length,end)),modelOptions);
    need(recordMatches(transfer.base.record,selected)&&same(transfer.base.document,document),
     'The standalone editor embedded another response edition.');
    result.editor={transferId:transfer.transferId,completeInlineAssets:true,networkPolicy:'connect-src none'};
   }else{
    need(text===model.markdown(document),'The complete Markdown differs from the selected native response.');
    result.markdown={characters:text.length,answers:document.content.answers.length,annexes:document.content.annexes.length};
   }
   await save();
  }

  const inspected=await client.inspectResponse({operation:'compare',input:'original-return',expectedSha256:compareInput.sha256});
  need(inspected.file.sha256===compareInput.sha256&&inspected.selection.recordId===selected.id,
   'The original comparison request changed.');
  const comparisonValue=await operation('compare-original-return','response_compare',async()=>({
   input:'original-return',expectedSha256:compareInput.sha256,expectedRevision:(await client.status({limit:1})).native.revision
  }));
  const savedComparison=await download('comparison',comparisonValue),comparison=JSON.parse(decode(savedComparison.bytes));
  need(comparison.workspace.id===binding.workspaceId&&comparison.current.record.id===selected.id
   &&comparison.incoming.sha256===sha(canonical(returned))&&comparison.incoming.transferId===returned.transferId
   &&Array.isArray(comparison.comparison.rows),'The complete comparison lost its original incoming file or native context.');
  need(savedComparison.value.selection.reviewSha256===comparison.comparison.reviewSha256
   &&savedComparison.value.selection.contextSha256===comparison.comparison.contextSha256,
   'The retained comparison differs from its native publication identity.');
  result.comparison={reviewSha256:comparison.comparison.reviewSha256,contextSha256:comparison.comparison.contextSha256,
   current:comparison.current.record,rows:comparison.comparison.rows.length,
   counts:comparison.comparison.rows.reduce((out,row)=>(out[row.status]=(out[row.status]||0)+1,out),{}),
   changedSource:comparison.comparison.changedSource,changedWorkshare:comparison.comparison.changedWorkshare,
   returnReady:comparison.comparison.returnReady};

  receiverClient=await openCanadaBuysMerchantClient({...connection,workspace:'receiver',workspaceId:binding.receivingWorkspaceId,environment});
  receiverOpened=await receiverClient.open();
  const receiverRecord=await receiverClient.responseRecord({recordId:selected.id,recordRevision:selected.revision});
  need(receiverOpened.native.id===binding.receivingWorkspaceId&&recordMatches(receiverRecord.record,selected),
   'The same original receiving workspace no longer reopens its exact response edition.');
  result.receiver={native:receiverRecord.native,record:receiverRecord.record,completeDocument:original.downloads.received};
  result.producerInspection={status:'AWAITING_PRODUCER_VIEW',originalViews:journey.views,
   files:[...Object.values(result.downloads).map(({path,bytes,sha256,mime})=>({path,bytes,sha256,mime})),...result.attachments],
   instruction:'Open the exact downloaded editor at desktop and narrow widths, read the complete Markdown/JSON/comparison and every attached original. Operate the offline controls and reopen a downloaded working copy. LOOK at the actual output and repair observed defects in this same customer.'};
  result.status='native-completed';result.nativeCompletedAt=new Date().toISOString();await save();
 }catch(error){
  failure=error;
  if(result){result.status='failed';result.failure={message:error.message,code:error.code,at:new Date().toISOString()};await save().catch(saveError=>{error.saveError=saveError.message;});}
 }finally{
  try{
  const closing=[];
  for(const [name,selectedClient,instance]of [['receiver',receiverClient,receiverOpened],['original',client,opened]]){
   if(selectedClient){
    if(instance)try{await selectedClient.closeWorkspace(instance.instanceId);}catch(error){closing.push({owner:name,action:'closeWorkspace',message:error.message});}
    try{await selectedClient.disconnect();}catch(error){closing.push({owner:name,action:'disconnect',message:error.message});}
   }
  }
  if(owner)try{await owner.close();}catch(error){closing.push({owner:'provider',message:error.message});}
  if(httpServer)try{await closeServer(httpServer);}catch(error){closing.push({owner:'transport',message:error.message});}
  if(closing.length){
   if(failure)failure.closing=closing;
   else failure=Object.assign(new Error('The original MCP owners did not close completely.'),{closing});
   if(result){result.status='close-incomplete';result.closing=closing;await save();}
  }
  if(!failure&&result?.status==='native-completed'){
   result.closedOwners={at:new Date().toISOString(),workspaceClients:true,provider:true,http:true};
   await save();
   try{
    const {renderResponseReviewTools}=await import('./RENDERED_TOOLS.mjs');
    await renderResponseReviewTools({caseDirectory,result,save});
    result.status='completed';result.completedAt=new Date().toISOString();await save();
   }catch(error){
    failure=error;result.status='render-failed';
    result.failure={message:error.message,code:error.code,at:new Date().toISOString()};await save();
   }
  }
  }catch(error){
   if(failure)failure.finalizationError={message:error.message,code:error.code};
   else failure=error;
  }finally{
   try{await lease.close();}catch(error){
    if(failure)failure.leaseCloseError={message:error.message,code:error.code};
    else failure=error;
   }
  }
 }
 if(failure)throw failure;
 return result;
}
if(process.argv[1]&&import.meta.url===pathToFileURL(resolve(process.argv[1])).href){
 const {values}=parseArgs({options:{'source-root':{type:'string'},'case-root':{type:'string'},output:{type:'string'},'adopt-publications':{type:'string'}}});
 const publicationSelections=values['adopt-publications']?JSON.parse(decode(await readFile(resolve(values['adopt-publications'])))):{};
 await operateResponseReviewTools({sourceDirectory:values['source-root'],caseDirectory:values['case-root'],
  outputDirectory:values.output,publicationSelections}).then(result=>process.stdout.write(JSON.stringify({status:result.status,directory:result.directory,record:result.course.record})+'\n'))
  .catch(error=>{process.stderr.write(JSON.stringify({message:error.message,code:error.code})+'\n');process.exitCode=1;});
}
