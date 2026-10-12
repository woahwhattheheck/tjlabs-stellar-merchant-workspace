import assert from 'node:assert/strict';
import {readFile,writeFile,mkdir,stat,readdir} from 'node:fs/promises';
import {createHash} from 'node:crypto';
import {join} from 'node:path';
import {pathToFileURL} from 'node:url';
const root=process.argv[2],source=join(root,'source'),directory=join(root,'received','workspace');
const P='stellar/scf-starforge-20261009/',W=P+'partners/tenderly-stellar-pilot/workspace/',M='stellar-forge/mcp-merchant-operator/';
const load=p=>import(pathToFileURL(join(source,p)).href),sha=b=>createHash('sha256').update(b).digest('hex');
const json=x=>JSON.stringify(x,null,2)+'\n';
const original=await readFile(process.env.TENDERLY_ORIGINAL_DRIVER||'/dev/shm/a5f3-tenderly/mcp-receiving-journey.mjs','utf8');
function originalExpression(text,start,name){
 let quote=null,lineComment=false,blockComment=false,depth=0;
 for(let i=start;i<text.length;i++){
  const ch=text[i],next=text[i+1];
  if(lineComment){if(ch==='\n')lineComment=false;continue;}
  if(blockComment){if(ch==='*'&&next==='/'){blockComment=false;i++;}continue;}
  if(quote){if(ch==='\\'){i++;continue;}if(ch===quote)quote=null;continue;}
  if(ch==='/'&&next==='/'){lineComment=true;i++;continue;}
  if(ch==='/'&&next==='*'){blockComment=true;i++;continue;}
  if(ch==='"'||ch==="'"||ch==='\x60'){quote=ch;continue;}
  if('([{'.includes(ch))depth++;
  else if(')]}'.includes(ch))depth--;
  else if((ch===';'||ch===',')&&depth===0)return text.slice(start,i);
 }
 throw Error('The original initializer did not end: '+name);
}
function originalInitializer(text,name){
 const declaration=new RegExp('(?:\\b(?:const|let|var)\\s+|,\\s*)'+name+'\\s*=').exec(text);
 assert(declaration,'Original declaration must exist: '+name);
 return originalExpression(text,declaration.index+declaration[0].length,name);
}
function originalAssignment(text,target){
 const escaped=target.replace(/[.*+?^${}()|[\]\\]/g,'\\$&');
 const assignment=new RegExp(escaped+'\\s*=(?!=)').exec(text);
 assert(assignment,'Original assignment must exist: '+target);
 return originalExpression(text,assignment.index+assignment[0].length,target);
}
function evaluateOriginal(expression,name,bindings={}){
 try{return Function(...Object.keys(bindings),'return ('+expression+')')(...Object.values(bindings));}
 catch{throw Object.assign(Error('The retained original driver needs its original definition: '+name),{code:'TENDERLY_ORIGINAL_DRIVER_CONTRACT'});}
}
const readOriginal=(name,bindings={})=>evaluateOriginal(originalInitializer(original,name),name,{process,...bindings});
const readAssignment=(target,bindings={})=>evaluateOriginal(originalAssignment(original,target),target,bindings);
const selected=readOriginal('selected'),env={...process.env},counts=readOriginal('counts');
for(const name of ['TENDERLY_ACCESS_KEY','TENDERLY_OPERATION_KEY']){
 env[name]=readAssignment('process.env.'+name,{process:{env}});
 assert.equal(typeof env[name],'string','Original private environment entry: '+name);
}
const originalAlias=readOriginal('alias'),nativeFactory=readOriginal('nativeFactory',{counts,Buffer});
const originalConfig={tenderlyWorkspaces:{workspaces:{[originalAlias]:{merchantOptions:{}}}}};
const merchantOptions=readAssignment('config.tenderlyWorkspaces.workspaces[alias].merchantOptions',
 {config:originalConfig,alias:originalAlias,nativeFactory});
const fetchOriginal=globalThis.fetch;
globalThis.fetch=readAssignment('globalThis.fetch',{counts,fetchOriginal});
const customerInputs=JSON.parse(process.env.TENDERLY_CUSTOMER_DELIVERIES||JSON.stringify([
 ['node','/dev/shm/reidgardas-b710-tenderly/customer-journey/delivery'],
 ['python','/dev/shm/reidgardas-b710-tenderly/customer-journey/delivery-python'],
]));
const events=[],emit=(stage,value={})=>{events.push({stage,...value});console.log(JSON.stringify({stage,...value}));};
let host,client,mcp,reopened;
try{
 const identityBytes=await readFile(join(directory,'workspace.json'));
 const identity=JSON.parse(identityBytes);
 assert.equal(identity.id,'1c5eecfb-93f8-4ce1-bd39-7b6e680212a8');
 assert.equal(sha(identityBytes),'2eb50abf345d42992d214bbc0d7e3d89bac83b36bd96f877225acb52446fb0fa');
 emit('ORIGINAL_WORKSPACE_RECEIVED',{workspaceId:identity.id,archiveSha256:process.env.TENDERLY_ARCHIVE_SHA});
 const [{startTenderlyWorkspace},{TenderlyWorkspaceClient},{MerchantTenderlyWorkspaces,readTenderlyWorkspaceConfiguration},{prepareTenderlyApplication,tenderlyStartup}]=await Promise.all([
 load(W+'server.mjs'),load(W+'connection.mjs'),load(M+'tenderly-workspace.mjs'),load(P+'distribution/runtime-workspace/application-tenderly.mjs')]);
 const inputPath=async(path,kind)=>{const s=await stat(path);assert.equal(kind==='directory'?s.isDirectory():s.isFile(),true);return{path,kind,...(kind==='file'?{sha256:sha(await readFile(path))}:{})};};
 const prepared=await prepareTenderlyApplication({workspaceDirectory:directory},inputPath,source);
 const request={command:'tenderly-workspace',args:[...prepared.args,'--port','0']};
 host=await startTenderlyWorkspace({directory,port:0,env,merchantOptions,launchBinding:{workspaceSha256:sha(identityBytes)}});
 const startup=await tenderlyStartup(request,json({schema:'stellar-forge.tenderly-workspace-startup.v1',status:'TENDERLY_WORKSPACE_READY',
 tenderlyWorkspace:host.url,directory,workspace:identity.id,instanceId:host.instanceId,connection:host.connection,
 workspaceSha256:sha(identityBytes),planFile:null,planSha256:null,facilitator:null}).trim());
 assert.equal(startup.original.instanceId,host.instanceId);
 client=await TenderlyWorkspaceClient.connect(join(directory,'tenderly.connection.json'),{directory,workspaceId:identity.id,workspaceSha256:sha(identityBytes),expectedInstanceId:host.instanceId});
 assert.equal(client.connection.instanceId,host.instanceId);
 const connectionPath=join(root,'managed.json');
 await writeFile(connectionPath,json({schema:'stellar-forge.tenderly-workspace-connection.v1',workspaces:{shared:{label:'Original saved Tenderly case',directory,mode:'managed'}}}),{mode:0o600});
 const config=await readTenderlyWorkspaceConfiguration(connectionPath);
 mcp=new MerchantTenderlyWorkspaces({tenderlyWorkspaces:config});
 const call=(name,args={})=>mcp.call('merchant_tenderly_'+name,{workspace:'shared',...args});
 const opened=await call('open');
 assert.equal(opened.instanceId,host.instanceId);assert.equal(opened.ownership,'managed');
 const base=new URL(host.url).origin;
 for(const path of ['/','/app.mjs','/style.css']){const r=await fetch(base+path);assert.equal(r.status,200,path);assert((await r.arrayBuffer()).byteLength>0);}
 const modes={directory:(await stat(directory)).mode&0o777,connection:(await stat(join(directory,'tenderly.connection.json'))).mode&0o777};
 assert.deepEqual(modes,{directory:448,connection:384});
 emit('APPLICATIONS_SDK_MCP_SHARED',{instanceId:host.instanceId,workspaceId:identity.id,browserAssets:3,modes});
 const inspected=await client.inspectProfile(selected.profile);
 const preview=await call('profile_preview',{plan:inspected.plan});
 assert(preview.native);
 const saved=await call('profile_save',{plan:inspected.plan,label:'Original source acceptance'});
 assert.equal(saved.native.id,selected.profile);
 await call('prepare',{profile:selected.profile});
 await call('profile_open',{profile:selected.profile});
 assert.equal((await client.status()).profile,selected.profile);
 const operation=(await call('operation',{profile:selected.profile,operationKey:selected.operationKey})).native;
 assert.equal(operation.state,'COMPLETE');assert.equal(operation.generation,selected.currentGeneration);
 const response=await client.response({profile:selected.profile,operationKey:selected.operationKey});
 assert.equal(response.bytes.length,selected.responseBytes);assert.equal(sha(response.bytes),selected.responseSha256);
 const observation=await client.providerResponse({profile:selected.profile,lookupId:selected.lookupId,observationId:selected.observationId});
 assert.equal(sha(observation.bytes),selected.responseSha256);
 const lookup=await call('provider_lookup',{profile:selected.profile,operationKey:selected.operationKey,simulationId:selected.simulationId});
 assert(lookup.native);
 const recovered=await call('provider_recover',{profile:selected.profile,lookupId:selected.lookupId,observationId:selected.observationId,expectedGeneration:selected.expectedGeneration,reference:selected.reference});
 assert(recovered.native);
 const after=(await call('operation',{profile:selected.profile,operationKey:selected.operationKey})).native;
 assert.equal(after.state,'COMPLETE');assert.equal(after.generation,selected.currentGeneration);
 emit('ORIGINAL_PROVIDER_RECOVERY_REOPENED',{profile:selected.profile,generation:after.generation,responseBytes:response.bytes.length,responseSha256:sha(response.bytes)});
 const fileInput={profile:selected.profile,kind:'response',id:selected.operationKey,expectedSha256:selected.responseSha256,offset:0,limit:16384};
 const first=await call('file_read',fileInput);
 const chunkKey=typeof first.data==='string'?'data':null;
 assert(chunkKey,'Original retained-file chunk field must be present: '+Object.keys(first).join(','));
 const chunks=[Buffer.from(first[chunkKey],'base64')];assert(first.nextOffset>0);
 const before=host.instanceId;
 assert.equal((await call('close',{instanceId:before})).state,'DETACHED');
 assert.equal((await client.status()).profile,selected.profile);
 assert.equal((await call('open')).instanceId,before);
 let offset=first.nextOffset,readId;
 while(offset!==null){
   const part=await call('file_read',{...fileInput,offset,...(readId?{readId}:{})});
   assert.equal(part.offset,offset);chunks.push(Buffer.from(part[chunkKey],'base64'));readId=part.readId;offset=part.nextOffset;
 }
 const complete=Buffer.concat(chunks);assert.equal(complete.length,selected.responseBytes);assert.equal(sha(complete),selected.responseSha256);
 emit('MANAGED_DETACH_AND_RESUME',{instanceId:before,bytes:complete.length,sha256:sha(complete),chunks:chunks.length});
 const started=await call('start',{profile:selected.profile});
 assert.equal(started.native.state,'RUNNING');assert.equal((await client.status()).state,'RUNNING');
 assert.equal((await call('close',{instanceId:before})).state,'DETACHED');
 assert.equal((await client.status()).state,'RUNNING');
 assert.equal((await call('open')).instanceId,before);
 assert.equal((await call('stop',{profile:selected.profile})).native.state,'OPEN');
 const {receiveBytes,openCapture,exportCapture}=await load(P+'sf88-operator-buyer-cli/tenderly-analysis/library.mjs');
 const {analysisRequest,expectedFromRequest}=await load(P+'partners/tenderly-stellar-pilot/customer/contract.mjs');
 const requestPage=await client.requests({profile:selected.profile,limit:100});
 const rows=requestPage.records??requestPage.items??[];
 let packet;
 for(const item of rows){const current=await client.inspectRequest(item.id);if(current.packet?.operation?.operationKey===selected.operationKey){packet=current.packet;break;}}
 assert(packet,'Retained original customer request is present');
 const simulation=analysisRequest(expectedFromRequest(packet.body,inspected.plan.networkId));
 const capture=await receiveBytes(response.bytes,{workspace:join(root,'analysis'),request:simulation,label:'Original saved Tenderly provider result'});
 const captureId=capture.id??capture.record?.id;assert(captureId);
 const reopenedCapture=await openCapture(join(root,'analysis'),captureId);assert.equal(sha(reopenedCapture.responseBytes),selected.responseSha256);
 const exported=await exportCapture(join(root,'analysis'),captureId,join(root,'analysis-export'));
 for(const [name,meta] of Object.entries(exported.manifest.files)){const bytes=await readFile(join(exported.directory,name));assert.equal(bytes.length,meta.bytes);assert.equal(sha(bytes),meta.sha256);}
 const {openExport}=await load(P+'partners/tenderly-stellar-pilot/customer/client.mjs');
 const customerResults=[];
 for(const [language,path] of customerInputs){
   const savedExport=await openExport(path);customerResults.push({language,intentId:savedExport.manifest.intentId,files:Object.keys(savedExport.manifest.files).length,responseSha256:savedExport.manifest.files['response.json'].sha256});
 }
 emit('ORIGINAL_CUSTOMER_AND_ANALYSIS_RECEIVED',{captureId,analysisFiles:Object.keys(exported.manifest.files).length,customers:customerResults});
 await mcp.close();mcp=null;
 await host.close();host=null;
 await assert.rejects(()=>client.status(),error=>error.code==='TENDERLY_INSTANCE_CHANGED');
 await client.close();client=null;
 reopened=await startTenderlyWorkspace({directory,port:0,env,merchantOptions});
 assert.notEqual(reopened.instanceId,before);assert.equal(reopened.model.manifest.id,identity.id);
 const follow=await TenderlyWorkspaceClient.connect(join(directory,'tenderly.connection.json'));
 await follow.openProfile(selected.profile);
 const retained=await follow.response({profile:selected.profile,operationKey:selected.operationKey});
 assert.equal(sha(retained.bytes),selected.responseSha256);
 await follow.close();await reopened.close();reopened=null;
 assert.deepEqual(counts,{providerHttp:0,verified:0,settled:0,cancelled:0});
 const result={schema:'stellar-forge.tenderly-managed-customer-receiving.v1',
  operation:'SCF-TENDERLY-SHARED-OPERATOR-E881-20261012',sourceCommit:'b9d888ab2c417d956c804b9b9133ed86ac3c9c0a',
  completedAt:new Date().toISOString(),originalArchiveSha256:process.env.TENDERLY_ARCHIVE_SHA,
  workspaceId:identity.id,workspaceSha256:sha(identityBytes),profile:selected.profile,operationKey:selected.operationKey,
  generation:selected.currentGeneration,responseBytes:retained.bytes.length,responseSha256:sha(retained.bytes),
  captureId,analysisFiles:Object.keys(exported.manifest.files).length,customers:customerResults,ownerRestart:true,originalCounters:counts,events};
 await writeFile(join(root,'receiving-result.json'),json(result),{flag:'wx',mode:0o600});
 emit('COMPLETE',{operation:result.operation,sourceCommit:result.sourceCommit,stages:events.length+1,
  workspaceId:identity.id,responseBytes:result.responseBytes,responseSha256:result.responseSha256,ownerRestart:true});
}catch(error){console.error(JSON.stringify({stage:'FAILED',code:error.code??null,message:error.message,stack:error.stack?.split('\n').slice(0,7)}));process.exitCode=1;}
finally{globalThis.fetch=fetchOriginal;for(const resource of [mcp,client,host,reopened])if(resource)await resource.close().catch(()=>{});}
