// MIT. Exercise the complete original commissioning facade against one retained paid job.
import assert from 'node:assert/strict';
import {readFile,mkdir} from 'node:fs/promises';
import {join} from 'node:path';
import {createHash} from 'node:crypto';
import {MerchantPreparationWorkspaces,readPreparationWorkspaceConfiguration}
 from '../../../sf30-seller-sdk/data-preparation/mcp.mjs';
const sha=value=>createHash('sha256').update(value).digest('hex');
const schema='stellar-forge.data-preparation-workspaces.v1';
const names=['catalog','request','prepare','order','receive','reopen','result_files','file','file_release'];
export async function openCommissioningCourse({directory,project,customer,python,immutable}){
 const paths={order:join(directory,'prepared-order'),download:join(directory,'buyer-download'),
  package:join(directory,'mcp-package'),editable:join(directory,'mcp-customer')};
 await mkdir(paths.download,{recursive:true,mode:0o700});
 const configPath=join(directory,'commissioning-configuration.json');
 await immutable(configPath,Buffer.from(JSON.stringify({schema,python,workspaces:{original:{
  directory:project.workspace,inputs:{project:{kind:'project',file:project.path,sha256:project.archive.sha256}},
  destinations:Object.fromEntries(Object.entries(paths).map(([name,directory])=>[name,{directory}])),
  jobCustomers:{original:{label:'Original native Request customer',customer}}
 }}})+'\n'));
 let owner,closed=false;
 const calls=[];
 async function attach(){owner=new MerchantPreparationWorkspaces({preparationWorkspaces:await readPreparationWorkspaceConfiguration(configPath)});}
 await attach();
 async function call(name,args){
  assert.equal(closed,false);assert.ok(names.includes(name));
  const value=await owner.call('merchant_preparation_job_'+name,{workspace:'original',...args});
  calls.push({tool:'merchant_preparation_job_'+name});return value;
 }
 async function fullFile(args,expected){
  let offset=0,readId,chunks=[],count=0;
  do{
   const value=await call('file',{...args,expectedSha256:expected.sha256,offset,limit:65536,...(readId?{readId}:{})});
   assert.equal(value.offset,offset);assert.equal(value.file.sha256,expected.sha256);
   assert.equal(value.file.bytes,expected.bytes);assert.equal(value.encoding,'base64');
   const body=Buffer.from(value.data,'base64');assert.equal(body.length,value.bytesRead);
   chunks.push(body);count++;readId=value.readId;offset=value.nextOffset;
  }while(offset!==null);
  const body=Buffer.concat(chunks);assert.equal(body.length,expected.bytes);assert.equal(sha(body),expected.sha256);
  return {body,chunks:count,bytes:body.length,sha256:expected.sha256};
 }
 async function prepare({merchantOrigin,reference,label}){
  const selected=await call('prepare',{sourceInput:'project',expectedSourceSha256:project.archive.sha256,
   orderDestination:'order',pipelineId:project.pipeline.id,revision:project.pipeline.revision,
   reportName:'Complete original supplier reconciliation'});
  const order=await call('order',{orderDestination:'order'});
  assert.deepEqual(selected.prepared,order.prepared);
  const read=[];
  for(const file of order.files){
   const result=await fullFile({kind:'order',orderDestination:'order',selection:file.selection},file);
   read.push({name:file.name,bytes:result.bytes,sha256:result.sha256,chunks:result.chunks});
  }
  // Release a live descriptor, then resume its exact offset through a fresh facade.
  const file=order.files.find(x=>x.selection==='project.zip');assert.ok(file.bytes>1);
  const first=await call('file',{kind:'order',orderDestination:'order',selection:file.selection,
   expectedSha256:file.sha256,offset:0,limit:1});
  assert.equal(first.bytesRead,1);assert.equal(first.nextOffset,1);
  const released=await call('file_release',{readId:first.readId});assert.equal(released.released,true);
  await owner.close();await attach();
  const resumed=await call('file',{kind:'order',orderDestination:'order',selection:file.selection,
   expectedSha256:file.sha256,offset:1,limit:1});
  assert.equal(resumed.offset,1);assert.equal(resumed.data,(await readFile(join(paths.order,'project.zip'))).subarray(1,2).toString('base64'));
  if(resumed.nextOffset!==null)await call('file_release',{readId:resumed.readId});
  const catalog=await call('catalog',{customer:'original',merchantOrigin});
  const requestArgs={customer:'original',orderDestination:'order',expectedOrderSha256:order.orderSha256,
   merchantOrigin,expectedCatalogSha256:catalog.catalogSha256,reference,label};
  const request=await call('request',requestArgs);
  const replay=await call('request',requestArgs);
  assert.equal(replay.requestId,request.requestId);assert.deepEqual(replay.files,request.files);
  assert.deepEqual(replay.request.input,request.request.input);
  assert.equal(replay.request.requestAttempts,request.request.requestAttempts);
  assert.equal(replay.reused,true);
  return {order,catalog,request,replay,requestArgs,read};
 }
 async function receive({bytes,expected,job}){
  assert.equal(bytes.length,expected.bytes);assert.equal(sha(bytes),expected.sha256);
  await immutable(join(paths.download,expected.filename),bytes);
  const args={downloadDestination:'download',packageDestination:'package',destination:'editable',
   expectedBytes:expected.bytes,expectedSourceSha256:expected.sha256,expectedFilename:expected.filename,job};
  const received=await call('receive',args);
  const reused=await call('receive',args);
  assert.equal(reused.workspace.directory,received.workspace.directory);
  assert.deepEqual(reused.package.package,received.package.package);
  const selection=await call('result_files',{packageDestination:'package',job});
  assert.equal(selection.job.id,job.id);assert.equal(selection.package.sha256,expected.sha256);
  const read=[];
  for(const file of selection.files){
   const result=await fullFile({kind:'result',packageDestination:'package',selection:file.selection,job},file);
   read.push({name:file.name,bytes:result.bytes,sha256:result.sha256,chunks:result.chunks});
  }
  await owner.close();await attach();
  const reopened=await call('reopen',{packageDestination:'package',destination:'editable',
   expectedBytes:expected.bytes,expectedSourceSha256:expected.sha256,expectedFilename:expected.filename,job});
  assert.equal(reopened.workspace.directory,received.workspace.directory);
  return {received,reused,reopened,selection,read,editableDirectory:paths.editable,
   packagePath:join(paths.download,expected.filename)};
 }
 async function reopen({expected,job}){
  return call('reopen',{packageDestination:'package',destination:'editable',expectedBytes:expected.bytes,
   expectedSourceSha256:expected.sha256,expectedFilename:expected.filename,job});
 }
 return {paths,prepare,receive,reopen,
  summary:()=>({tools:[...new Set(calls.map(x=>x.tool))].sort(),calls:calls.length}),
  async close(){if(!closed){closed=true;await owner.close();}}};
}
