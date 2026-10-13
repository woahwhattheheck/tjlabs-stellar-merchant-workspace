import assert from 'node:assert/strict';
import {readFile,writeFile,mkdir} from 'node:fs/promises';
import {join,resolve} from 'node:path';
import {pathToFileURL} from 'node:url';
import {createHash,randomUUID} from 'node:crypto';
import {execFile} from 'node:child_process';
import {promisify} from 'node:util';
const exec=promisify(execFile),root=resolve(process.argv[2]),app=join(root,'application'),legacy=join(root,'legacy-application');
const load=(base,name)=>import(pathToFileURL(join(base,name)).href);
const {parseGrid,encodeGrid}=await load(app,'haystack-types.mjs');
const {stringifyJson}=await load(app,'json-codec.mjs');
const {digest,sha256}=await load(app,'util.mjs');
const {HaystackWorkspace}=await load(app,'store.mjs');
const {startServer}=await load(app,'server.mjs');
const {HaystackClient}=await load(app,'client.mjs');
const {MerchantHaystackWorkspaces,readHaystackWorkspaceConfiguration}=await load(app,'merchant.mjs');
const portable=await load(app,'portable.mjs'),oldPortable=await load(legacy,'portable.mjs');
const original=await readFile(join(app,'fixture-charlie.json')),originalGrid=parseGrid(original).grid;
const normalize=value=>{
  if(Array.isArray(value))return value.map(normalize);
  if(value&&typeof value==='object'){
    if(value._kind==='number'&&!Object.hasOwn(value,'unit')&&typeof value.val==='number')return value.val;
    return Object.fromEntries(Object.entries(value).filter(([key,item])=>!(key==='_kind'&&item==='dict')&&!(key==='meta'&&Object.keys(item).filter(k=>k!=='_kind').length===0)).map(([key,item])=>[key,normalize(item)]));
  }
  return value;
};
const sameValues=(a,b)=>assert.deepEqual(normalize(a),normalize(b));
const derived=encodeGrid(originalGrid,{format:'zinc'}),derivedGrid=parseGrid(derived,{format:'zinc'}).grid;
sameValues(originalGrid,derivedGrid);assert.equal(derivedGrid.rows.length,624);assert.equal(derivedGrid.cols.length,87);
await writeFile(join(root,'charlie.zinc'),derived);
const directory=join(root,'workspace'),workspace=new HaystackWorkspace(directory);
const initial=await workspace.initialize('Original Charlie — Zinc format receiving');
const result={schema:'commons.haystack.zinc-native-result.v1',operationId:'SCF-HAYSTACK-ZINC-B3909-20261013',
  originalSource:{sha256:sha256(original),bytes:original.length,rows:originalGrid.rows.length,columns:originalGrid.cols.length},
  derivedZinc:{sha256:sha256(derived),bytes:derived.length},workspaceId:initial.workspaceId,steps:[]};
let launch,merchant;
try{
  launch=await startServer({directory,port:0,expectedWorkspaceId:initial.workspaceId});
  const client=new HaystackClient({url:launch.url});await client.connect();
  const request=async(action,fields)=>{const args={...fields,operationId:randomUUID(),expectedRevision:(await client.request('workspace.status')).revision};
    const first=await client.request(action,args),again=await client.request(action,args);
    assert.equal(again.operationId,first.operationId);assert.equal(again.replayed,true);return first;};
  const imported=await request('source.import',{name:'fixture-charlie.json',base64:original.toString('base64'),select:true});
  assert.equal(imported.source.format,'json-v4');assert.deepEqual(Buffer.from(await client.sourceBytes(imported.source.id)),original);
  const oldState=await workspace.read(),oldBundle=await oldPortable.buildBundle(oldState,{applicationRoot:legacy});
  assert.equal(JSON.parse(oldBundle.bytes).format,'commons.haystack.package.v3');
  const oldVerified=portable.verifyBundle(oldBundle.bytes);assert.equal(oldVerified.state.sha256,oldState.sha256);
  await portable.receiveBundle(oldBundle.bytes,join(root,'legacy-received'));
  const oldModule=await load(join(root,'legacy-received','application'),'store.mjs');
  assert.equal((await new oldModule.HaystackWorkspace(join(root,'legacy-received')).read()).sha256,oldState.sha256);
  result.steps.push({name:'original-json-default-and-v3-cold-receiving',state:'COMPLETE',files:oldVerified.application.size});
  const hostFile=join(root,'host.json');
  await writeFile(hostFile,stringifyJson({schema:'stellar-forge.haystack-workspace-host.v1',workspaces:{turnover:{
    workspaceId:initial.workspaceId,connectionFile:join(directory,'connection.json'),inputs:{charlie:{
      kind:'source',path:join(root,'charlie.zinc'),sha256:sha256(derived),format:'zinc',name:'charlie.zinc'
    }}}}})+'\n',{mode:0o600});
  const config=await readHaystackWorkspaceConfiguration(hostFile);
  assert.equal(config.workspaces.turnover.inputs.charlie.format,'zinc');
  merchant=new MerchantHaystackWorkspaces({haystackWorkspaces:config});
  const zincArgs={workspace:'turnover',input:'charlie',expectedSha256:sha256(derived),operationId:randomUUID(),
    expectedRevision:(await client.request('workspace.status')).revision,select:true};
  const zincImported=await merchant.call('merchant_haystack_import_file',zincArgs);
  const zincAgain=await merchant.call('merchant_haystack_import_file',zincArgs);
  assert.equal(zincAgain.operationId,zincImported.operationId);assert.equal(zincAgain.replayed,true);
  assert.equal(zincImported.source.format,'zinc');assert.equal(zincImported.source.id,sha256(derived));
  assert.deepEqual(Buffer.from(await client.sourceBytes(zincImported.source.id)),derived);
  const range=await client.request('source.read',{sourceId:zincImported.source.id,offset:0,length:4096});
  assert.equal(range.mediaType,'text/zinc; charset=utf-8');
  const download=await fetch(launch.url+'/api/source/'+zincImported.source.id,{headers:{'X-Haystack-Workspace':initial.workspaceId,'X-Haystack-Instance':launch.identity.instanceId}});
  assert.equal(download.status,200);assert.equal(download.headers.get('content-type'),'text/zinc; charset=utf-8');
  assert.deepEqual(Buffer.from(await download.arrayBuffer()),derived);
  await request('source.select',{sourceIds:[zincImported.source.id]});
  const baseline=await request('edition.save',{title:'Original Zinc edition'});
  const proposal=await request('proposal.prepare',{title:'Retained typed tag review',edits:[
    {recordKey:zincImported.source.id+':0',tag:'zincReviewed',action:'set',value:{_kind:'marker'}},
    {recordKey:zincImported.source.id+':0',tag:'zincSignedZero',action:'set',value:-0}
  ]});
  await request('proposal.review',{proposalId:proposal.proposal.id,decision:'accept'});
  const reviewed=await request('edition.save',{title:'Reviewed Zinc edition'});
  const exported={};
  for(const format of ['json','zinc']){
    const delivery=await request('delivery.prepare',{kind:'native-grid',format,sourceId:zincImported.source.id,editionId:reviewed.edition.id});
    const bytes=Buffer.from(await client.deliveryBytes(delivery.operationId));assert.equal(sha256(bytes),delivery.sha256);
    exported[format]=parseGrid(bytes,{format:format==='zinc'?'zinc':'json-v4'}).grid;
    assert.equal(Object.is(exported[format].rows[0].zincSignedZero,-0),true);
    assert.equal(exported[format].rows[0].zincReviewed._kind,'marker');
  }
  sameValues(exported.json,exported.zinc);assert.deepEqual(Buffer.from(await client.sourceBytes(zincImported.source.id)),derived);
  result.steps.push({name:'http-merchant-replay-editions-reviewed-grid-exports',state:'COMPLETE',sourceId:zincImported.source.id,baseline:baseline.edition.id,reviewed:reviewed.edition.id});
  const precision=parseGrid('ver:"3.0"\nv\n9007199254740993\n-1e-999\n',{format:'zinc'});
  for(const d of precision.diagnostics)assert.match(d.id,/^[0-9a-f]{64}$/);
  assert(precision.diagnostics.some(d=>d.details.originalLiteral==='9007199254740993'));
  assert(precision.diagnostics.some(d=>d.code==='NUMBER_UNDERFLOW'));
  const cliOut=join(root,'cli-grid.zinc'),cliRequest=join(root,'cli-native.request.json');
  await exec(process.execPath,[join(app,'cli.mjs'),'native-grid','--directory',directory,'--source-id',zincImported.source.id,'--edition',reviewed.edition.id,'--format','zinc','--request-file',cliRequest,'--out',cliOut],{maxBuffer:1024*1024});
  sameValues(parseGrid(await readFile(cliOut),{format:'zinc'}).grid,exported.zinc);
  const importRequest=join(root,'cli-import.request.json');
  const cli=await exec(process.execPath,[join(app,'cli.mjs'),'import','--directory',directory,'--file',join(root,'charlie.zinc'),'--format','zinc','--request-file',importRequest],{maxBuffer:1024*1024});
  const cliImported=JSON.parse(cli.stdout);assert.equal(cliImported.source.id,zincImported.source.id);assert.equal(cliImported.alreadyRetained,true);
  result.steps.push({name:'native-cli-format-and-original-diagnostic-identities',state:'COMPLETE',diagnostics:precision.diagnostics});
  for(const path of ['/','/app.js','/semantic.html','/semantic.js','/ZINC_CONTRACT.md']){
    const response=await fetch(launch.url+path);assert.equal(response.status,200);assert((await response.arrayBuffer()).byteLength>0);
  }
  const bundle=await request('delivery.prepare',{kind:'workspace'}),bytes=Buffer.from(await client.deliveryBytes(bundle.operationId));
  assert.equal(JSON.parse(bytes).format,'commons.haystack.package.v6');const verified=portable.verifyBundle(bytes);
  assert.equal(verified.application.size,portable.APPLICATION_FILES.length);
  const received=await portable.receiveBundle(bytes,join(root,'received'));
  assert.equal((await portable.receiveBundle(bytes,join(root,'received'))).replayed,true);
  const coldModule=await load(join(root,'received','application'),'store.mjs'),cold=new coldModule.HaystackWorkspace(join(root,'received'));
  assert.equal((await cold.read()).sha256,verified.state.sha256);
  assert.deepEqual((await cold.originalSource(zincImported.source.id)).bytes,derived);
  const coldGrid=(await load(join(root,'received','application'),'reports.mjs')).nativeGrid(await cold.read(),{sourceId:zincImported.source.id,editionId:reviewed.edition.id,format:'zinc'});
  sameValues(parseGrid(coldGrid.bytes,{format:'zinc'}).grid,exported.zinc);
  result.steps.push({name:'v6-complete-portable-cold-receiving',state:'COMPLETE',applicationFiles:received.applicationFiles,packageSha256:sha256(bytes),packageBytes:bytes.length});
  await writeFile(join(root,'received-workspace.json'),bytes);
  result.state='COMPLETE';result.revision=(await workspace.read()).revision;
}finally{if(merchant)await merchant.close();if(launch)await launch.close();}
await writeFile(join(root,'RESULT.json'),stringifyJson(result,2)+'\n');
process.stdout.write(stringifyJson(result)+'\n');
