// MIT. Reopen the independently received native workspace and original publishers.
import {pathToFileURL} from 'node:url';
import {assert,readFile,mkdir,join,hash,jsonBytes,save,optional,fileIdentity,privateDirectory,waitFor,paged,exactRows,captureOnce,native,SDK} from './common.mjs';
export async function reopenZarrHandover({input,inputSha256,received,result,outputDirectory}){
 await privateDirectory(outputDirectory,true);
 const intentFile=join(outputDirectory,'intent.json');
 const basis={operationId:input.operationId,inputSha256,archive:received.archive,manifest:received.manifest,workspaceId:received.workspaceId,sourceManifestSha256:input.sourceManifest.sha256};
 let intent=await optional(intentFile);if(intent)assert.deepEqual(intent.basis,basis);else{intent={basis};await save(intentFile,intent,{createOnly:true});}
 const saved=await optional(join(outputDirectory,'result.json'));
 if(saved?.state==='PASS'){assert.deepEqual(saved.basis,basis);for(const f of saved.files)assert.deepEqual(await fileIdentity(join(outputDirectory,f.name)),{bytes:f.bytes,sha256:f.sha256});return {file:join(outputDirectory,'result.json'),sha256:hash(await readFile(join(outputDirectory,'result.json'))),state:'PASS',value:saved};}
 const sourceStage=JSON.parse(await readFile(join(received.bundleDirectory,'original-source-stage/result.json')));
 const selectedInput={...input,workspaceDirectory:received.workspaceDirectory};
 const status=await native(selectedInput,['status','--directory',received.workspaceDirectory]);
 assert.equal(status.workspaceId,result.workspace.id);assert.equal(status.revision,result.workspace.revision);
 assert.deepEqual(status.results.map(x=>x.id),received.originalResults);
 assert.deepEqual(status.frozen.map(x=>x.id),received.originalFrozen);
 const originalConnections=JSON.parse(await readFile(join(received.bundleDirectory,'receiving/merchant/connections.json')));
 const destinations=join(outputDirectory,'destinations');await mkdir(destinations,{recursive:true,mode:0o700});
 const connectionsFile=join(outputDirectory,'connections.json');
 await save(connectionsFile,{schema:'stellar-forge.zarr-workspace-connections.v1',inputs:[],
  destinations:[{id:'received',title:'Explicit later packet receiving',path:destinations}],publisher:originalConnections.publisher},{createOnly:true});
 const [{startZarrServer},{readZarrSourceFile},{chromium}]=await Promise.all([
  import(pathToFileURL(join(input.sourceRoot,SDK,'zarr/workspace/server.mjs')).href),
  import(pathToFileURL(join(input.sourceRoot,SDK,'zarr/source.mjs')).href),
  import(pathToFileURL(input.browser.module).href)]);
 let service,browser;const errors=[],publications=[];
 const stage={directory:outputDirectory,intent,intentFile};
 try{
  service=await startZarrServer({directory:received.workspaceDirectory,connectionsFile,python:input.python,sourceDirectory:join(input.sourceRoot,SDK,'zarr'),port:0});
  for(const selected of received.publisherSelections){
   const frozen=await native(selectedInput,['frozen','--directory',received.workspaceDirectory,'--id',selected.frozenId]);
   assert.equal(frozen.id,selected.frozenId);
   const source=await readZarrSourceFile(frozen.sourceFile);assert.equal(source.hash,selected.frozenId);
   assert.equal(source.config.rows.length,selected.rows);
   await service.withPublisher(selected.frozenId,async publisher=>{
    const runs=[];
    for(let index=0;index<selected.runs.length;index++){
     const original=selected.runs[index],run=publisher.run(original.runId);
     assert.equal(run.state,'PUBLISHED');assert.equal(run.plan,original.planId);assert.equal(run.data.publication.snapshot,original.snapshot);
     const expected=index===1?[...source.config.rows].reverse():source.config.rows;
     const read=await paged(async query=>(await publisher.inspect(original.runId,query)).preview,expected.length);
     assert.equal(read.snapshot,original.snapshot);const values=exactRows(read.rows,expected,'Complete received original publication');
     assert.equal(values.valuesSha256,original.valuesSha256);runs.push({id:run.id,state:run.state,snapshot:read.snapshot,...values});
    }
    const target=await publisher.target();assert.equal(target.connected,true);assert.equal(target.versions.current,selected.runs.at(-1).snapshot);
    publications.push({id:selected.id,frozenId:selected.frozenId,runs,targetSnapshot:target.versions.current});
   });
  }
  browser=await chromium.launch({executablePath:input.browser.executable,headless:true,args:['--no-sandbox','--disable-dev-shm-usage']});
  const page=await browser.newPage({viewport:{width:1440,height:1000}});
  page.on('pageerror',error=>errors.push(error.message));
  const loaded=page.waitForResponse(r=>new URL(r.url()).pathname==='/api/status'&&r.ok());
  await page.goto(service.url);await loaded;await page.locator("button[data-tab='publisher']").waitFor();
  await captureOnce(stage,page,'received-overview.png');
  await page.click("button[data-tab='publisher']");await page.locator('#frozen-select').selectOption(result.frozen.primary);
  await page.locator("form[data-form='publisher-plan']").waitFor();
  for(const run of publications.find(x=>x.id==='primary').runs)await waitFor(()=>page.locator("button[data-pub-inspect='"+run.id+"']").isVisible(),'received original publication '+run.id);
  await captureOnce(stage,page,'received-publisher.png');
  await page.close();await browser.close();browser=null;
  await service.close();service=null;
  assert.deepEqual(await native(selectedInput,['status','--directory',received.workspaceDirectory]),status);
  assert.deepEqual(errors,[]);
  const report={schema:'stellar-forge.zarr-complete-reopen.v1',state:'PASS',basis,workspaceId:status.workspaceId,revision:status.revision,
   nativeResults:status.results.length,frozenSources:status.frozen.length,publications,additionalArrayReads:0,additionalPublications:0,
   servicesClosed:true,errors,files:[]};
  for(const name of ['received-overview.png','received-publisher.png'])report.files.push({name,...await fileIdentity(join(outputDirectory,name))});
  await save(join(outputDirectory,'result.json'),report,{createOnly:true});
  return {file:join(outputDirectory,'result.json'),sha256:hash(await readFile(join(outputDirectory,'result.json'))),state:'PASS',value:report};
 }finally{try{await service?.close();}finally{await browser?.close();}}
}
