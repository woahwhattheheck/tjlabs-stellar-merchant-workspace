// MIT. Continue the same recorded-performance operation through its installed Pricing interfaces.
import assert from 'node:assert/strict';
import {createServer} from 'node:http';
import {readFile,writeFile,mkdir} from 'node:fs/promises';
import {join,resolve,isAbsolute} from 'node:path';
import {fileURLToPath} from 'node:url';
import {createHash,randomBytes,randomUUID} from 'node:crypto';
import {startWorkspace} from '../workspace/server.mjs';
import {openWorkspace} from '../workspace/model.mjs';
import {openTariffWorkspace} from '../tariffs/workspace.mjs';
import {openPerformanceWorkspace} from './workspace.mjs';
import {inspectCostWorkspaceRestore,restoreCostWorkspace} from '../economics/archive.mjs';
import {createPerformanceClient,PERFORMANCE_FILES} from './client.mjs';
import {runPerformanceCli} from './cli.mjs';
import {buildServicePeriodExample} from '../../merchant-settlement-accounting/customer-statements/examples/service-period.mjs';
import {MerchantPricing,readPricingConfiguration,PRICING_CONNECTION_SCHEMA} from '../../../../stellar-forge/mcp-merchant-operator/pricing.mjs';
import declaration from '../../../../stellar-forge/mcp-merchant-operator/providers/pricing.mjs';
import {PERFORMANCE_MCP_OPERATIONS} from '../../../../stellar-forge/mcp-merchant-operator/catalog/pricing-performance.mjs';
import {callMerchantPricing,downloadMerchantPerformance} from '../../../../stellar-forge/mcp-merchant-operator/pricing-client.mjs';
import {main as pricingCli} from '../../../../stellar-forge/mcp-merchant-operator/pricing-cli.mjs';
import {createMcpToolHandler} from '../../../../stellar-forge/mcp-paid-agent/http-tools.mjs';
import {retainCaseArtifact} from '../../sf74-merchant-support-console/case-store.mjs';

const ROOT=resolve(fileURLToPath(new URL('../',import.meta.url)));
const SCHEMA='stellar-forge.merchant-performance-interface-operation.v1';
const encode=value=>Buffer.from(JSON.stringify(value,null,2)+'\n');
const hash=value=>createHash('sha256').update(value).digest('hex');
const git=value=>createHash('sha1').update('blob '+value.length+'\0').update(value).digest('hex');
const json=async path=>JSON.parse(await readFile(path,'utf8'));
async function optional(path){try{return await json(path);}catch(error){if(error.code==='ENOENT')return null;throw error;}}
async function retain(path,value){
  const bytes=Buffer.isBuffer(value)?value:encode(value);
  await retainCaseArtifact(path,bytes);
  return value;
}
async function keep(path,create){return await optional(path)??retain(path,await create());}
async function privateDirectory(path){await mkdir(path,{recursive:true,mode:0o700});}
function absolute(path){assert.ok(isAbsolute(path)&&resolve(path)===path&&path!=='/');return path;}
// The original declaration owns the definitions. This is its documented tool-factory seam.
function tool(name,description,properties,required,options={}){
  return {name,description,inputSchema:{type:'object',properties,required,additionalProperties:false},
    annotations:{readOnlyHint:Boolean(options.readOnly),idempotentHint:Boolean(options.idempotent),
      destructiveHint:Boolean(options.destructive),openWorldHint:Boolean(options.openWorld)}};
}
function descriptor(name,bytes){return {name,bytes:bytes.length,sha256:hash(bytes)};}
async function closed(server){
  if(server?.listening)await new Promise((done,reject)=>{
    server.close(error=>error?reject(error):done());server.closeIdleConnections?.();
  });
}

/**
 * Call before the original customer operation's final flow-result.json write.
 * All performance, tariff and Pricing writes replay the original full requests.
 * One original producer example exercises paired service capture in this same workspace.
 * Authentication tokens remain in process memory and never enter retained files.
 */
export async function runPerformanceInterfaces({
  settings,nativeRun,output,performanceId,envelope,saveInput,proposalSave,proposalCommit
}={}){
  process.umask(0o077);output=absolute(output);nativeRun=absolute(nativeRun);
  assert.equal(resolve(settings.directory),join(nativeRun,'pricing'));
  assert.equal(envelope.record.performanceId,performanceId);
  assert.equal(saveInput.requestId,performanceId);
  assert.equal(proposalSave.performanceId,performanceId);
  assert.equal(proposalCommit.performanceId,performanceId);
  await privateDirectory(output);
  const requests=join(output,'requests'),downloads=join(output,'downloads');
  await privateDirectory(requests);await privateDirectory(downloads);
  const sourceBytes=encode(envelope),sourceSha256=hash(sourceBytes);
  const intent=await keep(join(output,'operation.json'),async()=>({
    schema:SCHEMA,nativeRun,performanceId,sourceId:envelope.id,sourceSha256,
    performanceRequestId:saveInput.requestId,proposalRequestId:proposalSave.requestId,
    pricingRequestId:proposalCommit.pricingRequestId,backupRequestId:randomUUID(),
    originalNativeOperationSha256:hash(await readFile(join(nativeRun,'operation.json'))),
    createdAt:new Date().toISOString()
  }));
  assert.equal(intent.schema,SCHEMA);assert.equal(intent.nativeRun,nativeRun);
  assert.equal(intent.performanceId,performanceId);assert.equal(intent.sourceId,envelope.id);
  assert.equal(intent.sourceSha256,sourceSha256);assert.equal(intent.proposalRequestId,proposalSave.requestId);
  assert.equal(intent.pricingRequestId,proposalCommit.pricingRequestId);
  assert.equal(intent.originalNativeOperationSha256,hash(await readFile(join(nativeRun,'operation.json'))));
  for(const [name,value] of Object.entries({
    'performance-save.json':saveInput,'monthly-proposal-save.json':proposalSave,
    'monthly-proposal-commit.json':proposalCommit,'performance-source.json':envelope
  }))await retain(join(requests,name),value);
  const previous=await optional(join(output,'flow-result.json'));
  if(previous){assert.equal(previous.state,'COMPLETE');assert.equal(previous.sourceSha256,sourceSha256);return previous;}

  const producerPath=resolve(ROOT,'../merchant-settlement-accounting/customer-statements/examples/service-period.mjs');
  const producerBytes=await readFile(producerPath);
  assert.equal(git(producerBytes),'ef370439f66bf1a078ff2f6158a33597c114cc46');
  const service=await keep(join(requests,'original-service-example-capture.json'),async()=>{
    const example=buildServicePeriodExample();
    return {requestId:randomUUID(),label:'Original repository service-period example pair',
      opening:{name:'example-service-opening.json',text:encode(example.openingRaw).toString('utf8')},
      closing:{name:'example-service-closing.json',text:encode(example.closingRaw).toString('utf8')}};
  });
  await retain(join(downloads,'example-service-opening.json'),Buffer.from(service.opening.text));
  await retain(join(downloads,'example-service-closing.json'),Buffer.from(service.closing.text));

  let integrated,server,owner;
  const seen=new Set(),httpMethods=[],files={},assets=[];
  let capturedService,httpProposal,httpCommit;
  try{
    integrated=await startWorkspace({...settings,port:0});
    const bootstrap=await fetch(new URL('/api/state',integrated.url),{redirect:'error',signal:AbortSignal.timeout(20000)});
    assert.equal(bootstrap.status,200);
    const bootstrapState=await bootstrap.json();
    const http=createPerformanceClient({url:integrated.performanceUrl,token:bootstrapState.token,
      signal:AbortSignal.timeout(180000)});
    assert.equal(http.apiPrefix,'/api/performance');
    const h=async(name,...args)=>{const value=await http[name](...args);httpMethods.push(name);return value;};
    const state=await h('state');assert.ok(state.reviews.items.some(row=>row.performanceId===performanceId));
    const sources=await h('sources',{limit:1});assert.ok(sources.total>=1);
    const source=await h('source',saveInput.inputs.usageVersion);assert.equal(source.version,saveInput.inputs.usageVersion);
    capturedService=await h('captureServicePeriod',service);
    assert.equal(capturedService.requestId,service.requestId);
    const services=await h('servicePeriods',{limit:100});
    assert.ok(services.items.some(row=>row.sourceId===capturedService.sourceId));
    const preview=await h('preview',saveInput.inputs);
    assert.equal(preview.review.performanceSha256,saveInput.performanceSha256);
    const replay=await h('save',saveInput);assert.equal(replay.recovered,true);
    assert.ok((await h('list',{limit:100})).items.some(row=>row.performanceId===performanceId));
    assert.equal((await h('load',performanceId)).record.review.performanceSha256,saveInput.performanceSha256);
    assert.deepEqual(await h('capture',performanceId),envelope);
    assert.equal((await h('inspect',envelope)).id,envelope.id);
    assert.equal((await h('receive',envelope)).recovered,true);
    httpProposal=await h('proposal',{performanceId,proposedMonthlyRequests:proposalSave.proposedMonthlyRequests});
    assert.equal(httpProposal.proposalSha256,proposalSave.proposalSha256);
    assert.equal((await h('saveProposal',proposalSave)).recovered,true);
    httpCommit=await h('commitProposal',proposalCommit);assert.equal(httpCommit.recovered,true);
    const httpDirectory=join(downloads,'http');await privateDirectory(httpDirectory);
    for(const name of PERFORMANCE_FILES){
      const download=await h('download',performanceId,name),bytes=Buffer.from(download.bytes);
      if(name==='source.json')assert.deepEqual(bytes,sourceBytes);
      files[name]=descriptor(name,bytes);await retain(join(httpDirectory,name),bytes);
    }
    for(const [path,name] of [['/performance/','index.html'],['/performance/browser.mjs','browser.mjs'],['/performance/style.css','style.css']]){
      const response=await fetch(new URL(path,integrated.url),{redirect:'error',signal:AbortSignal.timeout(20000)});
      assert.equal(response.status,200);const bytes=Buffer.from(await response.arrayBuffer());
      assert.deepEqual(bytes,await readFile(new URL('./public/'+name,import.meta.url)));
      assets.push({path,...descriptor(name,bytes)});
    }
    await integrated.close();integrated=null;

    // Run the original native CLI over these same immutable sources and state.
    const nativeArgs=['--config',settings.config,'--state',settings.directory];
    if(settings.snapshot)nativeArgs.push('--snapshot',settings.snapshot);
    if(settings.history)nativeArgs.push('--history',settings.history);
    if(settings.opsUrl)nativeArgs.push('--ops-url',settings.opsUrl);
    const cliDirectory=join(downloads,'native-cli');await privateDirectory(cliDirectory);
    const cliSource=join(cliDirectory,'source.json');
    if(!await optional(cliSource))await runPerformanceCli(['capture',...nativeArgs,'--performance',performanceId,'--output',cliSource]);
    assert.deepEqual(await readFile(cliSource),sourceBytes);
    const cliInspect=join(cliDirectory,'inspection.json');
    if(!await optional(cliInspect))await runPerformanceCli(['inspect',...nativeArgs,'--input',cliSource,'--output',cliInspect]);
    assert.equal((await json(cliInspect)).id,envelope.id);
    const cliCommit=join(cliDirectory,'native-commit-recovery.json');
    if(!await optional(cliCommit))await runPerformanceCli(['proposal-commit',...nativeArgs,
      '--input',join(requests,'monthly-proposal-commit.json'),'--output',cliCommit]);
    assert.equal((await json(cliCommit)).recovered,true);

    // Carry the original saved review, later native proposal journals and paired
    // service captures through the existing complete backup, then receive the
    // original complete tariff portfolio before reopening its native continuation.
    const originalModel=await openWorkspace(settings);
    const originalTariffs=await openTariffWorkspace({model:originalModel,directory:settings.directory});
    const portfolio=await keep(join(requests,'complete-tariff-portfolio.json'),()=>originalTariffs.bundle());
    const backupInput=await keep(join(requests,'complete-workspace-backup.json'),async()=>({
      kind:'WORKSPACE_BACKUP',requestId:intent.backupRequestId}));
    const backup=await originalModel.economics.bundle(backupInput);
    const backupFile=await originalModel.economics.exportFile(intent.backupRequestId);
    const backupBytes=await readFile(backupFile.path);
    assert.equal(backupBytes.length,backup.bytes);assert.equal(hash(backupBytes),backup.sha256);
    const archive=join(downloads,'complete-workspace.tar');await retain(archive,backupBytes);
    const receivedDirectory=join(output,'received-pricing');
    const restorePreview=await inspectCostWorkspaceRestore({archive,directory:receivedDirectory});
    assert.ok(restorePreview.contents.performanceReviews>=1);
    assert.ok(restorePreview.contents.performanceProposals>=1);
    assert.ok(restorePreview.contents.performanceSelections>=1);
    assert.ok(restorePreview.contents.performanceServicePeriods>=1);
    const restore=await restoreCostWorkspace({archive,directory:receivedDirectory,expectedArchiveSha256:backup.sha256});
    const restoredSettings={...settings,directory:receivedDirectory};
    const receivedModel=await openWorkspace(restoredSettings);
    const receivedTariffs=await openTariffWorkspace({model:receivedModel,directory:receivedDirectory});
    const receivedPortfolio=await receivedTariffs.receive(portfolio);
    assert.equal(receivedPortfolio.status,'TARIFF_PORTFOLIO_RECEIVED');
    const receivedPerformance=await openPerformanceWorkspace({model:receivedModel,tariffs:receivedTariffs,directory:receivedDirectory});
    assert.deepEqual(await receivedPerformance.capture(performanceId),envelope);
    assert.equal((await receivedPerformance.receive(envelope)).recovered,true);
    const receivedRecord=await receivedPerformance.load(performanceId);
    assert.ok(receivedRecord.operations.proposals.some(row=>row.proposalRequestId===proposalSave.requestId));
    assert.ok(receivedRecord.operations.selections.some(row=>row.pricingRequestId===proposalCommit.pricingRequestId));
    assert.equal((await receivedPerformance.saveProposal(proposalSave)).recovered,true);
    assert.equal((await receivedPerformance.commitProposal(proposalCommit)).recovered,true);
    assert.equal((await receivedPerformance.captureServicePeriod(service)).recovered,true);
    assert.deepEqual(await receivedModel.download(httpCommit.result.pricing.version,'manifest.json'),
      await originalModel.download(httpCommit.result.pricing.version,'manifest.json'));
    const receivingResult={schema:'stellar-forge.merchant-performance-native-receiving.v1',
      backup,archive,restore,sourceId:envelope.id,performanceId,tariffPortfolioSha256:portfolio.sha256,
      requiredPricingVersion:httpCommit.result.pricing.version,
      proposalRequestId:proposalSave.requestId,pricingRequestId:proposalCommit.pricingRequestId,
      completeProposalHistory:true,originalRequestsRecovered:true};
    const receivingPath=join(output,'receiving-result.json'),previousReceiving=await optional(receivingPath);
    if(previousReceiving){
      // Keep the first complete native receipt. A later restore reports its
      // same-archive replay; every other source/result field must remain equal.
      const stable=value=>{
        const {replayed,...restored}=value.restore;assert.equal(typeof replayed,'boolean');
        return {...value,restore:restored};
      };
      assert.deepEqual(stable(previousReceiving),stable(receivingResult));
    }else await retain(receivingPath,receivingResult);

    // Existing MerchantPricing, declaration and original authenticated HTTP handler.
    const connectionPath=join(output,'pricing-connection.json');
    await retain(connectionPath,{schema:PRICING_CONNECTION_SCHEMA,workspaces:{
      recorded:{...restoredSettings,label:'Received original recorded-performance operation'}
    }});
    const configuration={pricing:await readPricingConfiguration(connectionPath)};
    owner=new MerchantPricing(configuration);
    const tools=declaration.tools(tool),names=new Set(tools.map(row=>row.name));
    for(const name of Object.values(PERFORMANCE_MCP_OPERATIONS))assert.ok(names.has(name));
    const provider={tools,async call(name,args){seen.add(name);return owner.call(name,args);}};
    const token=randomBytes(32).toString('hex');
    const endpointPath=join(output,'mcp-endpoint.json');
    const previousEndpoint=await optional(endpointPath);
    const previousCheckpoint=await optional(join(downloads,'mcp-complete','download-state','checkpoint.json'));
    if(previousEndpoint){
      assert.equal(previousEndpoint.schema,'stellar-forge.merchant-performance-interface-endpoint.v1');
      assert.equal(previousEndpoint.performanceId,performanceId);
    }
    // The original downloader binds its checkpoint to the exact endpoint.
    // Preserve its loopback port across process restarts before the first call.
    const resumedEndpoint=previousEndpoint?.endpoint??previousCheckpoint?.endpoint??null;
    let selectedPort=0;
    if(resumedEndpoint!==null){
      assert.equal(typeof resumedEndpoint,'string');
      const endpoint=new URL(resumedEndpoint);
      assert.equal(endpoint.href,resumedEndpoint);assert.equal(endpoint.protocol,'http:');
      assert.equal(endpoint.hostname,'127.0.0.1');assert.ok(endpoint.port);
      assert.ok(endpoint.pathname==='/'||endpoint.pathname==='/mcp');
      assert.equal(endpoint.username,'');assert.equal(endpoint.password,'');
      assert.equal(endpoint.search,'');assert.equal(endpoint.hash,'');
      selectedPort=Number(endpoint.port);assert.ok(Number.isInteger(selectedPort)&&selectedPort>0&&selectedPort<=65535);
      if(previousCheckpoint)assert.equal(previousCheckpoint.endpoint,resumedEndpoint);
    }
    server=createServer(createMcpToolHandler(provider,{bearerToken:token,maxRequestBytes:declaration.maxRequestBytes,
      serverName:'starforge-recorded-performance-operation',instructions:declaration.instructions.map(row=>row.text).join('\n\n')}));
    await new Promise((done,reject)=>{
      server.once('error',reject);server.listen(selectedPort,'127.0.0.1',()=>{server.off('error',reject);done();});
    });
    const endpoint=resumedEndpoint??new URL('http://127.0.0.1:'+server.address().port).href;
    await retain(endpointPath,{schema:'stellar-forge.merchant-performance-interface-endpoint.v1',performanceId,endpoint});
    const connection={url:endpoint,environment:{MCP_ACCESS_TOKEN:token}};
    const call=(operation,args={})=>callMerchantPricing({...connection,operation,args:{workspace:'recorded',...args}});
    const stateMcp=await call('performance-state');
    assert.ok(stateMcp.reviews.items.some(row=>row.performanceId===performanceId));
    assert.ok((await call('performance-sources',{limit:1})).total>=1);
    assert.equal((await call('performance-source',{version:saveInput.inputs.usageVersion})).version,saveInput.inputs.usageVersion);
    assert.equal((await call('performance-capture-service',service)).recovered,true);
    assert.ok((await call('performance-service-periods',{limit:100})).items.some(row=>row.sourceId===capturedService.sourceId));
    assert.equal((await call('performance-preview',{inputs:saveInput.inputs})).review.performanceSha256,saveInput.performanceSha256);
    assert.equal((await call('performance-save',saveInput)).recovered,true);
    assert.ok((await call('performance-list',{limit:100})).items.some(row=>row.performanceId===performanceId));
    assert.equal((await call('performance-load',{performanceId})).record.review.performanceSha256,saveInput.performanceSha256);
    const capture=await call('performance-capture',{performanceId});
    assert.equal(capture.sourceId,envelope.id);assert.equal(capture.manifest.performanceSha256,saveInput.performanceSha256);
    for(const [name,metadata] of Object.entries(capture.manifest.files))assert.deepEqual(metadata,{bytes:files[name].bytes,sha256:files[name].sha256});
    assert.equal((await call('performance-inspect',{source:envelope})).id,envelope.id);
    assert.equal((await call('performance-receive',{source:envelope})).recovered,true);
    assert.equal((await call('performance-proposal',{performanceId,proposedMonthlyRequests:proposalSave.proposedMonthlyRequests})).proposalSha256,proposalSave.proposalSha256);
    assert.equal((await call('performance-save-proposal',proposalSave)).recovered,true);
    assert.equal((await call('performance-commit-proposal',proposalCommit)).recovered,true);

    const completeDirectory=join(downloads,'mcp-complete');
    let prefixBytes=0;
    try{
      await downloadMerchantPerformance({...connection,workspace:'recorded',performanceId,
        directory:completeDirectory,chunkSize:4096,expectedManifestSha256:capture.manifestFile.sha256,
        onProgress:progress=>{
          if(progress.file==='source.json'&&progress.bytes>0&&progress.bytes<progress.total){
            prefixBytes=progress.bytes;
            throw Object.assign(new Error('The original source prefix and checkpoint are retained for cold continuation.'),
              {code:'PERFORMANCE_DOWNLOAD_PREFIX_RETAINED'});
          }
        }});
    }catch(error){if(error.code!=='PERFORMANCE_DOWNLOAD_PREFIX_RETAINED')throw error;}
    // A previous complete operation may already have all bytes. Otherwise the
    // original downloader resumes its own persisted checkpoint after a full
    // reader-owner close, including its original READ_NOT_FOUND recovery.
    await owner.close();owner=new MerchantPricing(configuration);
    const complete=await downloadMerchantPerformance({...connection,workspace:'recorded',performanceId,
      directory:completeDirectory,chunkSize:4096,expectedManifestSha256:capture.manifestFile.sha256});
    assert.equal(complete.state,'COMPLETE');assert.equal(complete.resumed,true);
    if(prefixBytes)assert.ok(complete.resumedBytes>=prefixBytes);
    for(const name of PERFORMANCE_FILES)assert.deepEqual(await readFile(join(completeDirectory,name)),await readFile(join(httpDirectory,name)));
    await owner.close();owner=new MerchantPricing(configuration);
    const cold=await downloadMerchantPerformance({...connection,workspace:'recorded',performanceId,
      directory:completeDirectory,chunkSize:4096,expectedManifestSha256:complete.manifestSha256});
    assert.equal(cold.state,'COMPLETE');assert.equal(cold.resumed,true);
    assert.equal(cold.manifestSha256,complete.manifestSha256);

    let cliReceived;
    const cliMcp=await pricingCli(['performance-inspect','--url',connection.url,'--workspace','recorded','--source-file',cliSource],
      {environment:connection.environment,write:value=>{cliReceived=value;}});
    assert.equal(cliMcp.id,envelope.id);assert.deepEqual(cliReceived,cliMcp);
    await retain(join(cliDirectory,'mcp-inspection.json'),cliMcp);
    for(const name of Object.values(PERFORMANCE_MCP_OPERATIONS))assert.ok(seen.has(name),'Dispatch original Pricing method '+name);
    assert.equal(new Set(httpMethods).size,16);

    const result={schema:'stellar-forge.merchant-performance-interface-result.v1',state:'COMPLETE',
      completedAt:new Date().toISOString(),performanceId,sourceId:envelope.id,sourceSha256,
      operationDirectory:output,originalNative:nativeRun,
      http:{state:'COMPLETE',apiPrefix:'/api/performance',methods:[...new Set(httpMethods)],assets},
      cli:{state:'COMPLETE',nativeSource:descriptor('source.json',await readFile(cliSource)),
        originalMcpInspection:true,originalNativeCommitRecovered:true},
      mcp:{state:'COMPLETE',operations:Object.values(PERFORMANCE_MCP_OPERATIONS),
        transport:'Original MerchantPricing and createMcpToolHandler',requestBytes:declaration.maxRequestBytes,
        prefixBytes,coldOwnerReopen:true,completeDownload:complete,coldDownload:cold},
      receiving:{state:'COMPLETE',directory:receivedDirectory,backupSha256:backup.sha256,
        tariffPortfolioSha256:portfolio.sha256,completeProposalHistory:true,originalRequestsRecovered:true},
      files,proposal:{requestId:proposalSave.requestId,pricingRequestId:proposalCommit.pricingRequestId,
        proposalSha256:httpProposal.proposalSha256,pricingVersion:httpCommit.result.pricing.version},
      servicePeriod:{origin:'MAINTAINED_REPOSITORY_EXAMPLE',sourceId:capturedService.sourceId,
        requestId:service.requestId,producer:{path:'merchant-settlement-accounting/customer-statements/examples/service-period.mjs',
          gitBlob:git(producerBytes),sha256:hash(producerBytes),bytes:producerBytes.length},
        opening:descriptor(service.opening.name,Buffer.from(service.opening.text)),
        closing:descriptor(service.closing.name,Buffer.from(service.closing.text)),
        totals:capturedService.totals},
      sourceModule:descriptor('interfaces-native.mjs',await readFile(fileURLToPath(import.meta.url)))};
    await owner.close();owner=null;await closed(server);server=null;
    await retain(join(output,'flow-result.json'),result);
    return result;
  }catch(error){
    await writeFile(join(output,'failure.json'),encode({code:error.code??'PERFORMANCE_INTERFACE_FAILED',
      message:error.message,stack:error.stack,httpMethods,mcpMethods:[...seen]}),{mode:0o600}).catch(()=>{});
    throw error;
  }finally{
    await owner?.close();await closed(server);await integrated?.close();
  }
}
