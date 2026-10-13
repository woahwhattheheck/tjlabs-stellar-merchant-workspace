// MIT. Complete original managed intake -> agent files -> cold private artifact receiving.
import assert from 'node:assert/strict';
import {createHash,randomUUID} from 'node:crypto';
import {constants} from 'node:fs';
import {mkdir,lstat,realpath,open,readFile,rename,link,unlink} from 'node:fs/promises';
import {join,dirname,resolve} from 'node:path';
import {createMerchantIntakeClient,MERCHANT_INTAKE_CONNECTION_SCHEMA} from './project-intake-client.mjs';
import {readMerchantProjectConfiguration} from '../../stellar-forge/mcp-merchant-operator/merchant-project-connection.mjs';
import {MerchantProjects} from '../../stellar-forge/mcp-merchant-operator/merchant-projects.mjs';
import {merchantProjectTools} from '../../stellar-forge/mcp-merchant-operator/merchant-project-protocol.mjs';
import {MAX_RETAINED_CHUNK_BYTES} from '../../stellar-forge/mcp-merchant-operator/retained-file-contracts.mjs';

const SCHEMA='stellar-forge.merchant-project-agent-receiving.v1';
const hash=value=>createHash('sha256').update(value).digest('hex');
const encoded=value=>Buffer.from(JSON.stringify(value,null,2)+'\n');
async function optional(path) {
 try{return JSON.parse(await readFile(path,'utf8'));}catch(error){if(error.code==='ENOENT')return null;throw error;}
}
async function directory(path) {
 assert.equal(resolve(path),path);
 await mkdir(path,{recursive:true,mode:0o700});
 const info=await lstat(path);
 assert(info.isDirectory()&&!info.isSymbolicLink()&&!(info.mode&0o077)&&await realpath(path)===path);
}
async function sync(path) {
 const handle=await open(path,constants.O_RDONLY|constants.O_DIRECTORY|constants.O_NOFOLLOW);
 try{await handle.sync();}finally{await handle.close();}
}
async function save(path,value,replace=false) {
 const raw=Buffer.isBuffer(value)?value:encoded(value),temporary=path+'.'+randomUUID()+'.partial';
 await directory(dirname(path));
 const file=await open(temporary,'wx',0o600);
 try{await file.writeFile(raw);await file.sync();}finally{await file.close();}
 try {
  if(replace)await rename(temporary,path);
  else try{await link(temporary,path);}
   catch(error){if(error.code!=='EEXIST')throw error;assert.deepEqual(await readFile(path),raw);}
  await sync(dirname(path));
 } finally {await unlink(temporary).catch(error=>{if(error.code!=='ENOENT')throw error;});}
 return {path,bytes:raw.length,sha256:hash(raw)};
}
async function fileIdentity(path,expected) {
 const handle=await open(path,constants.O_RDONLY|constants.O_NOFOLLOW);
 try {
  const before=await handle.stat({bigint:true});
  assert(before.isFile()&&before.size===BigInt(expected.bytes));
  const digest=createHash('sha256'),buffer=Buffer.alloc(65536);let position=0;
  for(;;){const next=await handle.read(buffer,0,buffer.length,position);if(!next.bytesRead)break;
   digest.update(buffer.subarray(0,next.bytesRead));position+=next.bytesRead;}
  const after=await handle.stat({bigint:true});
  for(const key of ['dev','ino','size','mtimeNs','ctimeNs'])assert.equal(after[key],before[key]);
  assert.equal(position,expected.bytes);assert.equal(digest.digest('hex'),expected.sha256);
  return {path,bytes:position,sha256:expected.sha256};
 } finally {await handle.close();}
}
async function artifactBytes(owner,artifact,destination,{restart=false}={}) {
 const stage=destination+'.'+randomUUID()+'.partial';
 const file=await open(stage,'wx',0o600),digest=createHash('sha256');
 let offset=0,readId,interrupted=false;
 try {
  for(;;) {
   const response=await owner.call('merchant_project_file',{project:'original',
    artifactId:artifact.artifactId,expectedSha256:artifact.payload.sha256,offset,
    limit:offset===0?31:MAX_RETAINED_CHUNK_BYTES,...(readId?{readId}:{})});
   const piece=response.native;
   assert.equal(piece.offset,offset);assert.equal(piece.file.bytes,artifact.payload.bytes);
   assert.equal(piece.file.sha256,artifact.payload.sha256);
   assert.equal(piece.encoding,'base64');
   const bytes=Buffer.from(piece.data,'base64');assert.equal(bytes.length,piece.bytesRead);
   assert.equal(bytes.toString('base64'),piece.data);
   await file.writeFile(bytes);digest.update(bytes);offset+=bytes.length;
   if(piece.nextOffset===null)break;
   assert.equal(piece.nextOffset,offset);assert(bytes.length>0);
   readId=piece.readId;
   if(restart&&!interrupted) {
    await owner.call('merchant_project_file_release',{project:'original',readId});
    readId=undefined;interrupted=true;
   }
  }
  assert.equal(offset,artifact.payload.bytes);assert.equal(digest.digest('hex'),artifact.payload.sha256);
  await file.sync();await file.close();
  try{await link(stage,destination);}
  catch(error){if(error.code!=='EEXIST')throw error;await fileIdentity(destination,artifact.payload);}
  await sync(dirname(destination));
  return {path:destination,bytes:offset,sha256:artifact.payload.sha256,reopenedRead:interrupted};
 } finally {
  await file.close().catch(()=>{});
  if(readId)await owner.call('merchant_project_file_release',{project:'original',readId});
  await unlink(stage).catch(error=>{if(error.code!=='ENOENT')throw error;});
 }
}
async function makeOwner(configuration) {
 const retained=await readMerchantProjectConfiguration(configuration);
 return new MerchantProjects({merchantProjects:retained});
}
async function readWholeArtifacts(owner,directory,artifacts) {
 const files=[];
 for(const artifact of artifacts) files.push(await artifactBytes(owner,artifact,
  join(directory,artifact.artifactId+'.received'),{restart:artifact.kind==='manifest'}));
 return files;
}
/** Operates the existing listener only. The calling Applications owner starts/stops it. */
export async function receiveMerchantProjectAgent({url,selectionSha256,operatorToken,tokenEnvironment,
 directory:root,expectedInvoices}) {
 assert(Array.isArray(expectedInvoices)&&expectedInvoices.length===5&&new Set(expectedInvoices).size===5);
 assert(/^[A-Z][A-Z0-9_]{0,127}$/.test(tokenEnvironment));
 await directory(root);await directory(join(root,'artifacts'));await directory(join(root,'received'));
 const intent={schema:SCHEMA,selectionSha256,expectedInvoices:[...expectedInvoices].sort(),tokenEnvironment};
 await save(join(root,'intent.json'),intent);
 const existing=await optional(join(root,'complete.json'));
 if(existing){await verifyMerchantProjectAgent(existing,{selectionSha256,expectedInvoices});return existing;}
 // Current listener addresses change across original Application starts; the selection stays fixed.
 const connectionFile=join(root,'connection.json'),configuration=join(root,'connection-config.json');
 await save(connectionFile,{schema:MERCHANT_INTAKE_CONNECTION_SCHEMA,url,selectionSha256},true);
 await save(configuration,{schema:'stellar-forge.merchant-project-agent.v1',
  projects:{original:{label:'Original received merchant',connectionFile,selectionSha256,
   tokenEnvironment,exportsDirectory:join(root,'artifacts')}}});
 const previous=process.env[tokenEnvironment];process.env[tokenEnvironment]=operatorToken;
 let owner=null;
 try {
  const tools=merchantProjectTools((name,description,properties,required,annotations)=>
   ({name,description,inputSchema:{properties,required},annotations}));
  assert.equal(tools.length,14);
  const client=await createMerchantIntakeClient({url,selectionSha256,operatorToken});
  const state=await client.status();assert.equal(state.state,'COMPLETE');
  const typedManifest=await client.manifest(),typedReceipt=await client.receipt(),typedReview=await client.review();
  const inventory=[];
  for await(const page of client.inventoryPages({limit:7}))inventory.push(...page.rows);
  assert.deepEqual(inventory,typedManifest.files);
  const typedOrders=[];
  for await(const page of typedReview.registerPages({limit:2}))typedOrders.push(...page.orders);
  assert.deepEqual(typedOrders.map(row=>row.id).sort(),[...expectedInvoices].sort());
  owner=await makeOwner(configuration);
  assert.equal((await owner.call('merchant_project_projects',{})).configured,true);
  assert.equal((await owner.call('merchant_project_status',{project:'original'})).native.selectionSha256,selectionSha256);
  const mcpInventory=[];let offset=0;
  for(;;) {
   const page=(await owner.call('merchant_project_inventory',{project:'original',offset,limit:11})).native;
   mcpInventory.push(...page.rows);if(page.nextOffset===null)break;offset=page.nextOffset;
  }
  assert.deepEqual(mcpInventory,inventory);
  // Replay the one native receipt already accepted by the browser operation.
  const received=(await owner.call('merchant_project_receive',
   {project:'original',expectedSelectionSha256:selectionSha256})).native;
  assert.equal(received.state,'COMPLETE');
  assert.equal(received.selection.request.operation,client.connection.operation);
  const artifacts=[];
  for(const kind of ['manifest','receipt'])
   artifacts.push((await owner.call('merchant_project_'+kind,{project:'original'})).native.artifact);
  const invoices=[];let cursor,revision;
  for(;;) {
   const page=(await owner.call('merchant_project_register',{project:'original',limit:2,
    ...(cursor?{cursor}:{}),...(revision?{revision}:{})})).native;
   revision??=page.source.revision;assert.equal(page.source.revision,revision);
   invoices.push(...page.orders);if(page.page.next===null)break;cursor=page.page.next;
  }
  assert.deepEqual(invoices.map(row=>row.id).sort(),[...expectedInvoices].sort());
  for(const invoiceId of expectedInvoices) {
   const invoice=(await owner.call('merchant_project_invoice',{project:'original',invoiceId})).native;
   assert.equal(invoice.invoice.id,invoiceId);assert.equal(invoice.invoice.state,'COMPLETE');
   artifacts.push(invoice.artifact);
   for(const kind of ['envelope','result'])
    artifacts.push((await owner.call('merchant_project_'+kind,{project:'original',invoiceId})).native.artifact);
  }
  for(const format of ['json','csv'])
   artifacts.push((await owner.call('merchant_project_register_export',
    {project:'original',revision,format})).native.artifact);
  const files=await readWholeArtifacts(owner,join(root,'received'),artifacts);
  const manifest=artifacts.find(row=>row.kind==='manifest'),receipt=artifacts.find(row=>row.kind==='receipt');
  assert.deepEqual(JSON.parse(await readFile(join(root,'received',manifest.artifactId+'.received'),'utf8')),typedManifest);
  assert.deepEqual(JSON.parse(await readFile(join(root,'received',receipt.artifactId+'.received'),'utf8')),typedReceipt);
  const direct=await typedReview.downloadInvoiceResult(expectedInvoices[0],join(root,'typed-original-result.bin'));
  const original=artifacts.find(row=>row.kind==='invoice-result'&&row.invoiceId===expectedInvoices[0]);
  assert.equal(direct.sha256,original.payload.sha256);assert.equal(direct.bytes,original.payload.bytes);
  files.push({path:direct.path,bytes:direct.bytes,sha256:direct.sha256});
  await owner.close();owner=null;
  const result={...intent,state:'COMPLETE',configuration,operation:client.connection.operation,
   storeId:client.connection.storeId,manifestSha256:client.connection.manifestSha256,root,
   invoices:invoices.map(row=>({id:row.id,state:row.state})),revision,inventory,
   tools:tools.map(row=>row.name),artifacts,files,
   nativeReceiveReplayed:true,typedClientReceived:true,providerClosed:true};
  await save(join(root,'complete.json'),result);
  await verifyMerchantProjectAgent(result,{selectionSha256,expectedInvoices});
  return result;
 } finally {
  try{if(owner)await owner.close();}
  finally{if(previous===undefined)delete process.env[tokenEnvironment];else process.env[tokenEnvironment]=previous;}
 }
}
/** Reopens retained files through the real provider with no live Application or credential. */
export async function verifyMerchantProjectAgent(result,{selectionSha256,expectedInvoices}) {
 assert.equal(result.schema,SCHEMA);assert.equal(result.state,'COMPLETE');
 assert.equal(result.selectionSha256,selectionSha256);
 assert.deepEqual(result.expectedInvoices,[...expectedInvoices].sort());
 assert.deepEqual(result.invoices.map(row=>row.id).sort(),[...expectedInvoices].sort());
 assert(result.invoices.every(row=>row.state==='COMPLETE'));
 assert.equal(result.artifacts.length,19);assert.equal(result.tools.length,14);
 assert.equal(result.nativeReceiveReplayed,true);assert.equal(result.providerClosed,true);
 for(const file of result.files)await fileIdentity(file.path,file);
 const owner=await makeOwner(result.configuration);
 try {
  const found=[];let after;
  for(;;) {
   const page=(await owner.call('merchant_project_artifacts',{project:'original',limit:5,...(after?{after}:{})})).native;
   found.push(...page.artifacts);if(page.nextAfter===null)break;after=page.nextAfter;
  }
  for(const artifact of result.artifacts) {
   assert.equal(artifact.selectionSha256,selectionSha256);assert.equal(artifact.operation,result.operation);
   assert.equal(artifact.storeId,result.storeId);assert.equal(artifact.manifestSha256,result.manifestSha256);
   assert.deepEqual(found.find(row=>row.artifactId===artifact.artifactId),artifact);
   const file=result.files.find(row=>row.path===join(result.root,'received',artifact.artifactId+'.received'));
   assert(file);assert.equal(file.bytes,artifact.payload.bytes);assert.equal(file.sha256,artifact.payload.sha256);
   const received=await artifactBytes(owner,artifact,file.path,{restart:artifact.kind==='manifest'});
   assert.equal(received.sha256,file.sha256);assert.equal(received.bytes,file.bytes);
  }
 } finally {await owner.close();}
 return {state:'COMPLETE',selectionSha256,originalOperation:result.operation,artifacts:result.artifacts.length,
  invoices:result.invoices.length,files:result.files.length,offlineReopened:true};
}
