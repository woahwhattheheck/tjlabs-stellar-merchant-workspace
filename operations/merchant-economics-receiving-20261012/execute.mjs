// Actual source-native SF97 supplier-cost MCP and CLI receiving operation.
// Uses the retained original controlled Linkup/traffic capture; never repurchases.
import assert from 'node:assert/strict';
import {readFile,writeFile,mkdir,rename,open,access} from 'node:fs/promises';
import {join,dirname} from 'node:path';
import {pathToFileURL} from 'node:url';
import {createHash,randomBytes,randomUUID} from 'node:crypto';
import {spawn} from 'node:child_process';

const base=process.env.COST_MCP_BASE;
if(!base||!base.startsWith('/'))throw new Error('COST_MCP_BASE must name the absolute retained operation directory.');
const output=join(base,'output'),root=join(output,'mcp-receiving');
const source=process.env.COST_MCP_SOURCE||join(base,'mcp-execution-source');
const operation=process.env.COST_MCP_OPERATION;
if(operation!=="BC08-SF97-COST-MCP-RECEIVING-20261012-02")throw new Error('Use the exact linked native operation launcher.');
const reportPath=join(output,'cost-mcp-journey-02.json');
const predecessorPath=join(output,'cost-mcp-journey.json');
const predecessorSha="a2f3ce7a7e78fdad06f81f047ddec0eebe8aa9acf3762f7c256025b360f43759";
const sourcePin='c46001aff910fa0356bbccc7410c4626e1ea9544';
const sourceManifestSha="7786426b72019bf6747091155e5c597a595a61fa858449e5f6466071f4b9140b";
const originalBackupSha='df938ab5a61d87a9871934b487dcda5e5b12b79b3f4a02ffd46ca2e409c2a81d';
const originalNativeSha='22ec17eab5f5dc34d70e57a114be36df55eaa4d164e4b01bda03038fce20d9cb';
const hash=bytes=>createHash('sha256').update(bytes).digest('hex');
const exists=async path=>{try{await access(path);return true;}catch(e){if(e.code==='ENOENT')return false;throw e;}};
const json=async path=>JSON.parse(await readFile(path,'utf8'));
const load=path=>import(pathToFileURL(join(source,path)).href);
const scf='stellar/scf-starforge-20261009/';
const mcp='stellar-forge/mcp-merchant-operator/';
await mkdir(root,{recursive:true,mode:0o700});
let report;
if(await exists(reportPath)){
 report=await json(reportPath);
}else{
 const predecessorBytes=await readFile(predecessorPath);
 assert.equal(hash(predecessorBytes),predecessorSha,'The original failed operation must remain byte-identical.');
 const predecessor=JSON.parse(predecessorBytes.toString('utf8'));
 assert.equal(predecessor.operation,'BC08-SF97-COST-MCP-RECEIVING-20261012-01');
 assert.equal(predecessor.status,'FAIL');
 assert.equal(predecessor.checkpoints.length,0);
 assert.equal(predecessor.sourcePin,sourcePin);
 report={...predecessor,operation,sourceManifestSha,status:'RUNNING',
  continuedAt:new Date().toISOString(),
  continuation:{operation:predecessor.operation,report:predecessorPath,sha256:predecessorSha,
   nativeRecord:'b8eb8da11b3045e02c87cfe5887a26df99d0834aaf2e1151d4a65e0dce3035d9',
   nativeExitCode:1,sourceManifestSha:predecessor.sourceManifestSha,
   reason:'Complete the same published local runtime/static source closure before resuming the original five request IDs.',
   originalFailure:predecessor.error}};
}
if(report.operation!==operation)throw new Error('Resume the original registered receiving operation.');
async function atomic(path,bytes){
 await mkdir(dirname(path),{recursive:true,mode:0o700});
 const temporary=path+'.pending-'+process.pid;
 const handle=await open(temporary,'w',0o600);
 try{await handle.writeFile(bytes);await handle.sync();}finally{await handle.close();}
 await rename(temporary,path);
 const parent=await open(dirname(path),'r');try{await parent.sync();}finally{await parent.close();}
}
async function save(name,value){
 if(name){report[name]=value;report.checkpoints.push({name,at:new Date().toISOString()});}
 await atomic(reportPath,Buffer.from(JSON.stringify(report,null,2)+'\n'));
}
async function exactFile(path,bytes){
 if(await exists(path)){assert.equal(hash(await readFile(path)),hash(bytes),'retained selected input changed: '+path);return;}
 const handle=await open(path,'wx',0o600);try{await handle.writeFile(bytes);await handle.sync();}finally{await handle.close();}
}
let server=null,endpoint=null;
const environment={...process.env,MCP_ACCESS_TOKEN:randomBytes(32).toString('hex')};
delete environment.MCP_OAUTH_CONFIG;
delete environment.MCP_OAUTH_CONFIG_FILE;
async function command(args){
 const stdout=[],stderr=[];
 const child=spawn(process.execPath,args,{env:environment,cwd:source,stdio:['ignore','pipe','pipe']});
 child.stdout.on('data',b=>stdout.push(b));child.stderr.on('data',b=>stderr.push(b));
 const exit=await new Promise((resolve,reject)=>{child.on('error',reject);child.on('close',(code,signal)=>resolve({code,signal}));});
 const text=Buffer.concat(stdout).toString('utf8'),diagnostics=Buffer.concat(stderr).toString('utf8');
 if(exit.code!==0)throw Object.assign(new Error('Original pricing CLI failed: '+diagnostics.slice(-6000)),{code:'NATIVE_CLI_FAILED',exit});
 return {result:JSON.parse(text),stderr:diagnostics,exit};
}
async function main(){
 assert.equal(hash(await readFile(join(source,'SOURCE-MANIFEST.json'))),sourceManifestSha);
 assert.equal(hash(await readFile(join(output,'native/linkup-native-journey.json'))),originalNativeSha);
 const original=await json(join(output,'economics-journey.json'));
 assert.equal(original.backup.sha256,originalBackupSha);
 const archive=join(output,'pricing-workspace/economics/exports',original.backup.filename);
 assert.equal(hash(await readFile(archive)),originalBackupSha);
 const native=await json(join(output,'native/linkup-native-journey.json'));
 assert.equal(native.status,'PASS');
 const {restoreCostWorkspace,inspectBundle}=await load(scf+'sf97-merchant-revenue-ops/economics/archive.mjs');
 const {openWorkspace}=await load(scf+'sf97-merchant-revenue-ops/workspace/model.mjs');
 const {initializePricingMerchant,readMerchantConfig}=await load(mcp+'config.mjs');
 const {PRICING_CONNECTION_SCHEMA}=await load(mcp+'pricing.mjs');
 const {startMerchantMcp}=await load(mcp+'serve.mjs');
 const {openMerchantFileClient}=await load(mcp+'retained-download.mjs');
 const {callMerchantPricing}=await load(mcp+'pricing-client.mjs');
 const {initReleaseStore,readReleaseState}=await load(scf+'sf82-seller-pilot/releases.mjs');
 const directory=join(root,'workspace'),received=join(root,'received-workspace');
 const inputs=join(root,'inputs'),mcpDirectory=join(root,'merchant'),releaseStore=join(root,'releases');
 await mkdir(inputs,{recursive:true,mode:0o700});
 if(!report.originalRestore)await save('originalRestore',await restoreCostWorkspace({archive,directory}));
 const config=join(inputs,'seller.json'),snapshot=join(inputs,'traffic.json');
 await exactFile(config,await readFile(join(output,'native/pricing-seller.json')));
 await exactFile(snapshot,await readFile(join(output,'native/pricing-traffic.json')));
 const initial=await openWorkspace({config,snapshot,directory});
 const originalSource=await initial.economics.sourceDownload(original.quoteSourceId);
 const originalEdition=await initial.economics.edition(original.completeEdition);
 const routeIds=originalEdition.report.routes.map(row=>row.routeId);
 const expectedQuoteRates=Object.fromEntries(originalEdition.report.routes.map(row=>[row.routeId,row.proposals.QUOTED.perFulfilledUsd]));
 assert.equal(originalSource.source.sha256,'dd225d6d6a65c5d30060e3d057db2d6b19da6b9ba3b5ea4042b0104ab5dabb01');
 const quote=join(inputs,'linkup-quote.csv'),movedQuote=quote+'.retained';
 if(!await exists(quote)&&!await exists(movedQuote))await exactFile(quote,originalSource.bytes);
 if(await exists(quote))assert.equal(hash(await readFile(quote)),originalSource.source.sha256);
 if(await exists(movedQuote))assert.equal(hash(await readFile(movedQuote)),originalSource.source.sha256);
 const book=JSON.parse(JSON.stringify(originalEdition.input).replaceAll(original.quoteSourceId,report.ids.source));
 book.label='MCP receiving · original Linkup quote';
 book.reason='Receive the exact retained quotation and saved per-route allocation through native MCP; no new supplier charge.';
 const bookPath=join(inputs,'cost-book.json');
 await exactFile(bookPath,Buffer.from(JSON.stringify(book,null,2)+'\n'));
 const metadata=Object.fromEntries(['label','name','kind','supplier','reference','period','note','url']
   .filter(k=>Object.hasOwn(originalSource.source.metadata,k)).map(k=>[k,originalSource.source.metadata[k]]));
 metadata.label='MCP receiving · exact original Linkup quotation';
 const sourceUpload={input:'linkup_quote',expectedSha256:originalSource.source.sha256,
  expectedBytes:originalSource.source.bytes,requestId:report.ids.source,metadata};
 const planningOriginal=await initial.planningSource(original.scenarioPlan.version);
 const pricingConnection=join(root,'pricing-connection.json');
 function configured(workspace,quotePath){return {schema:PRICING_CONNECTION_SCHEMA,workspaces:{linkup:{
   label:'Linkup · retained supplier quotation',config,snapshot,directory:workspace,
   costInputs:{linkup_quote:{label:'Original published tariff quotation',path:quotePath}},
   costBooks:{linkup_book:{label:'Complete retained two-route allocation',path:bookPath}}
 }}};}
 const selectedDirectory=report.restoredReceiving?received:directory;
 await atomic(pricingConnection,Buffer.from(JSON.stringify(configured(selectedDirectory,report.restoredReceiving?movedQuote:quote),null,2)+'\n'));
 if(!await exists(join(releaseStore,'state.json')))await initReleaseStore(releaseStore);
 await readReleaseState(releaseStore);
 const configPath=join(mcpDirectory,'merchant-mcp.json');
 if(!await exists(configPath))await initializePricingMerchant({directory:mcpDirectory,pricing:pricingConnection,releaseStore,name:'SF97 native cost receiving'});
 await readMerchantConfig(configPath);
 async function start(){
   server=await startMerchantMcp({configPath,port:report.port??0,environment});
   endpoint=server.url;const port=Number(new URL(endpoint).port);
   if(report.port)assert.equal(port,report.port);else await save('port',port);
   return openMerchantFileClient({url:endpoint,environment});
 }
 const call=async(name,args={})=>callMerchantPricing({url:endpoint,environment,operation:name,args:{workspace:'linkup',...args}});
 let client=await start();
 await client.call('merchant_pricing_open',{workspace:'linkup'});
 async function cost(name,args={}){return client.call('merchant_pricing_cost_'+name,{workspace:'linkup',...args});}
 if(!report.nativeCliOpened){
   const value=await command([join(source,mcp+'pricing-cli.mjs'),'cost-state','--url',endpoint,'--workspace','linkup']);
   await save('nativeCliOpened',{result:value.result,exit:value.exit});
 }
 if(!report.originalBinding)await save('originalBinding',{
   backupSha256:originalBackupSha,nativeReportSha256:originalNativeSha,sourceSha256:originalSource.source.sha256,
   sourceBytes:originalSource.source.bytes,sourceId:original.quoteSourceId,sourcePricingVersion:originalEdition.pricingVersion,
   sourceEdition:original.completeEdition,sourceEditionRevision:originalEdition.revision,
   scenarioPlan:original.scenarioPlan,originalPlanningSource:planningOriginal
 });
 if(!report.inputInspection)await save('inputInspection',await cost('input',{kind:'SOURCE',input:'linkup_quote'}));
 if(!report.sourceReceipt)await save('sourceReceipt',await cost('upload',sourceUpload));
 assert.equal(report.sourceReceipt.sourceId,report.ids.source);
 assert.equal(report.sourceReceipt.sha256,originalSource.source.sha256);
 if(!report.sourceRows){
   const rows=await cost('source',{sourceId:report.ids.source,delimiter:',',offset:0,limit:100});
   assert.equal(rows.page.total,2);await save('sourceRows',rows);
 }
 const spec=book.imports.find(row=>row.sourceId===report.ids.source);assert.ok(spec);
 if(!report.mappedRows){
   const mapped=await cost('mapping',{sourceId:report.ids.source,delimiter:spec.delimiter??',',mapping:spec.mapping,offset:0,limit:100});
   assert.equal(mapped.page.total,2);await save('mappedRows',mapped);
 }
 if(!report.bookInspection)await save('bookInspection',await cost('input',{kind:'BOOK',input:'linkup_book'}));
 const bookSource={input:'linkup_book',expectedSha256:report.bookInspection.sha256,expectedBytes:report.bookInspection.bytes};
 if(!report.preview)await save('preview',await cost('preview',{bookSource,view:'routes',offset:0,limit:100}));
 if(!report.saveRequest){const state=await cost('state');await save('saveRequest',{bookSource,requestId:report.ids.edition,expectedRevision:state.revision});}
 if(!report.edition)await save('edition',await cost('save',report.saveRequest));
 const edition=report.edition.edition;
 assert.ok(edition);
 if(!report.editionRequest){const request=await cost('request',{kind:'EDITION',requestId:report.ids.edition});assert.equal(request.status,'COMMITTED');await save('editionRequest',request);}
 if(!report.proposal){
   const proposal=await cost('proposal',{edition,basis:'QUOTED',routeIds,view:'changes',offset:0,limit:100});
   assert.equal(proposal.page.total,2);
   assert.deepEqual(Object.fromEntries(proposal.page.items.map(x=>[x.routeId,x.afterPerFulfilledUsd])),expectedQuoteRates);
   await save('proposal',proposal);
 }
 if(!report.applyRequest){const state=await call('capture');await save('applyRequest',{
   edition,basis:'QUOTED',routeIds,proposalSha256:report.proposal.proposalSha256,
   requestId:report.ids.pricing,expectedPricingRevision:state.revision,label:'MCP receiving · source-linked native quote review'
 });}
 if(!report.applied)await save('applied',await cost('apply',report.applyRequest));
 if(!report.editionExport)await save('editionExport',await cost('export',{kind:'COST_EDITION',edition,requestId:report.ids.editionExport}));
 if(!report.backup)await save('backup',await cost('export',{kind:'WORKSPACE_BACKUP',requestId:report.ids.backup}));
 const selections=[{name:'source',kind:'source',id:report.ids.source},{name:'edition',kind:'edition',id:edition},
  {name:'backup',kind:'export',id:report.ids.backup}];
 if(!report.downloads)await save('downloads',{});
 for(const selected of selections){
   if(report.downloads[selected.name])continue;
   const manifest=await cost('manifest',{kind:selected.kind,id:selected.id});
   if(selected.kind==='edition')assert.equal(Object.keys(manifest.manifest.files).length,9);
   const target=join(root,'downloads',selected.name);
   const receipt=await command([join(source,mcp+'pricing-cli.mjs'),'cost-download','--url',endpoint,'--workspace','linkup',
     '--kind',selected.kind,'--id',selected.id,'--out',target,'--manifest-sha256',manifest.manifestFile.sha256,'--chunk-bytes','32768']);
   report.downloads[selected.name]={manifest,result:receipt.result,exit:receipt.exit,directory:target,
     progress:receipt.stderr.split('\n').filter(Boolean).map(line=>{try{return JSON.parse(line);}catch{return {message:line};}})};
   await save();
 }
 const backupPath=join(root,'downloads/backup',report.backup.filename);
 assert.equal(hash(await readFile(backupPath)),report.backup.sha256);
 assert.equal(hash(await readFile(join(root,'downloads/source/original'))),originalSource.source.sha256);
 if(!report.hostRelocated){
   await server.close();server=null;
   if(await exists(quote)&&await exists(movedQuote))throw new Error('Both original host paths exist; retain them for explicit review.');
   if(await exists(quote))await rename(quote,movedQuote);
   assert.equal(hash(await readFile(movedQuote)),originalSource.source.sha256);
   await save('hostRelocated',{pathAlias:'linkup_quote',sourceSha256:originalSource.source.sha256});
   client=await start();await client.call('merchant_pricing_open',{workspace:'linkup'});
 }
 if(!report.sourceReplay){
   const replay=await cost('upload',sourceUpload);
   assert.equal(replay.sourceId,report.ids.source);assert.equal(replay.sha256,originalSource.source.sha256);
   await save('sourceReplay',replay);
 }
 if(!report.backupDownloadReplay){
   const selected=report.downloads.backup;
   const reopened=await command([join(source,mcp+'pricing-cli.mjs'),'cost-download','--url',endpoint,'--workspace','linkup',
     '--kind','export','--id',report.ids.backup,'--out',selected.directory,
     '--manifest-sha256',selected.manifest.manifestFile.sha256,'--chunk-bytes','32768']);
   await save('backupDownloadReplay',{result:reopened.result,exit:reopened.exit});
 }
 await server.close();server=null;
 if(!report.restoredReceiving){
   const verified=await inspectBundle(backupPath);
   const restored=await restoreCostWorkspace({archive:backupPath,directory:received});
   const model=await openWorkspace({config,snapshot,directory:received});
   const saved=await model.economics.edition(edition);
   assert.equal(saved.revision,report.edition.revision);
   assert.ok(saved.pricingLinks.some(x=>x.requestId===report.ids.pricing));
   const sourceRead=await model.economics.sourceDownload(report.ids.source);
   assert.equal(sourceRead.source.sha256,originalSource.source.sha256);
   const scenarioFile=join(received,'plans',original.scenarioPlan.planId,'plan.json');
   const originalScenarioFile=join(directory,'plans',original.scenarioPlan.planId,'plan.json');
   let scenarioByteIdentity=null;
   if(await exists(originalScenarioFile)){scenarioByteIdentity=hash(await readFile(originalScenarioFile));assert.equal(hash(await readFile(scenarioFile)),scenarioByteIdentity);}
   await save('restoredReceiving',{...restored,verifiedArchive:verified.manifest??verified,
      costRevision:saved.revision,sourceSha256:sourceRead.source.sha256,pricingLinkCount:saved.pricingLinks.length,scenarioByteIdentity});
 }
 await atomic(pricingConnection,Buffer.from(JSON.stringify(configured(received,movedQuote),null,2)+'\n'));
 client=await start();await client.call('merchant_pricing_open',{workspace:'linkup'});
 if(!report.restoredScenario){
   const result=await call('load',{planId:original.scenarioPlan.planId});
   assert.equal(result.planId,original.scenarioPlan.planId);
   assert.equal(result.review.reviewSha256,original.scenarioPlan.reviewSha256);
   await save('restoredScenario',result);
 }
 if(!report.restoredCli){
   const value=await command([join(source,mcp+'pricing-cli.mjs'),'cost-state','--url',endpoint,'--workspace','linkup']);
   assert.equal(value.result.revision,report.edition.revision);
   await save('restoredCli',{result:value.result,exit:value.exit});
 }
 await server.close();server=null;
 report.status='PASS';report.finishedAt=new Date().toISOString();delete report.error;
 await save();
 console.log(JSON.stringify({status:'PASS',operation,sourcePin,report:reportPath,sourceId:report.ids.source,
   edition,pricingVersion:report.applied.link.pricingVersion,backup:report.backup,restored:report.restoredReceiving.directory}));
}
try{
 if(report.status==='PASS'){console.log(JSON.stringify({status:'PASS',replayed:true,report:reportPath}));}
 else{delete report.error;report.status='RUNNING';await save();await main();}
}catch(error){
 report.status='FAIL';report.error={code:error.code??error.name,message:error.message,stack:error.stack};
 await save();console.error(JSON.stringify(report.error));process.exitCode=1;
}finally{if(server)await server.close();}
