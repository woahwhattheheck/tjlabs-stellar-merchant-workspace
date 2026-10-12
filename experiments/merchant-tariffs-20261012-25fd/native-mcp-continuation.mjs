// MIT. Continue the SAME retained tariff native operation through original Merchant MCP.
import assert from 'node:assert/strict';
import { createServer } from 'node:http';
import { readFile, writeFile, mkdir, lstat, realpath } from 'node:fs/promises';
import { resolve, join } from 'node:path';
import { pathToFileURL, fileURLToPath } from 'node:url';
import { createHash, randomBytes } from 'node:crypto';

const encode=value=>Buffer.from(JSON.stringify(value,null,2)+'\n');
const sha=bytes=>createHash('sha256').update(bytes).digest('hex');
const gitBlob=bytes=>createHash('sha1').update('blob '+bytes.length+'\0').update(bytes).digest('hex');
const ORIGINAL_MCP_FILES=Object.freeze({
  'pricing.mjs':'29cca304ec00ce1807891127c79b0b4180d49501',
  'pricing-costs.mjs':'5db80f92f2e432ea0b4d8868188f2bd3493a9172',
  'catalog/pricing.mjs':'66bf98151774171f98748da0edd95b62af121acc',
  'providers/pricing.mjs':'95e6f3bd0f64f448cb2292fab673a8ca2146d667',
  'pricing-client.mjs':'a46d216da5d91905b4409ca0d48f94f1b07f9c64',
  'pricing-tariffs.mjs':'fa6ff014e44bdaaca83e1e67e51f36b75ea7ec5c',
  'catalog/pricing-tariffs.mjs':'9aa44c9af44a1d85ac8a3f3b18ae3d4aa6c4ed54',
  'pricing-tariffs-client.mjs':'490381d1a7fccfe06c88619a1075f7c3953ce3fd',
  '../mcp-paid-agent/http-tools.mjs':'5104360037afc9c8cbd48b34280a526555c7c02c',
  'retained-download.mjs':'f8c2e1917772c0b2c6bfdaa681073854104c9673',
  'retained-file-reads.mjs':'0cc3502779b193521cd1d177e8d23b76ab625df2',
  'retained-file-contracts.mjs':'16dbce5411cddc372ac93cbe4813c373b9d81457',
  'host-files.mjs':'a366cc4aa3e3ee3dfb7cb88320b84fcb00ab2fad'
});
async function privateDirectory(path) {
  await mkdir(path,{mode:0o700}).catch(error=>{if(error.code!=='EEXIST')throw error;});
  const value=await lstat(path);
  assert.ok(value.isDirectory()&&!value.isSymbolicLink());
  assert.equal(await realpath(path),path);
  if(process.platform!=='win32')assert.equal(value.mode&0o077,0);
}
async function retain(path,value) {
  const bytes=Buffer.isBuffer(value)?value:encode(value);
  try{await writeFile(path,bytes,{flag:'wx',mode:0o600});}
  catch(error){if(error.code!=='EEXIST')throw error;assert.deepEqual(await readFile(path),bytes,'Retain the same original operation input: '+path);}
  return bytes;
}
const json=async path=>JSON.parse(new TextDecoder('utf-8',{fatal:true}).decode(await readFile(path)));
function same(value,expected,message){assert.equal(value,expected,message);return value;}

/**
 * Call once from native-workflow.mjs after its existing restore/reopen work:
 *
 * const {runTariffMcpContinuation}=await import('./native-mcp-continuation.mjs');
 * result.mcp=await runTariffMcpContinuation({sourceRoot,output,flowResult:result});
 *
 * Then retain the original combined flow-result.json. No new fixture or payment
 * is created. Partial file downloads resume inside this same output/mcp directory.
 */
export async function runTariffMcpContinuation({
  sourceRoot,output,flowResult,
  merchantRoot=resolve(sourceRoot,'../../../stellar-forge/mcp-merchant-operator')
}={}) {
  process.umask(0o077);
  same(await realpath(sourceRoot),sourceRoot);
  same(await realpath(output),output);
  same(await realpath(merchantRoot),merchantRoot);
  const original=flowResult??await json(join(output,'flow-result.json'));
  same(original.status,'COMPLETE');
  same(original.operationDirectory,output);
  same(original.sourceRoot,sourceRoot);
  const operation=await json(join(output,'operation.json'));
  const seed=await json(join(output,'seed-result.json'));
  const tariffRequest=await json(join(output,'tariff-save-request.json'));
  const tariffSaved=await json(join(output,'tariff-save-result.json'));
  const previewInput=await json(join(output,'tariff-preview-input.json'));
  const preview=await json(join(output,'tariff-preview.json'));
  const commitRequest=await json(join(output,'selection-request.json'));
  const committed=await json(join(output,'selection-result.json'));
  const repricingRequest=await json(join(output,'repricing-request.json'));
  const repriced=await json(join(output,'repricing-result.json'));
  const originalPortfolio=await json(join(output,'tariff-portfolio.json'));
  same(original.tariffPlan,operation.tariffRequestId);
  same(tariffSaved.planId,original.tariffPlan);
  same(original.pricingVersion,committed.pricing.version);
  same(original.repricingDecision,repriced.decision);
  const folder=join(output,'mcp');
  await privateDirectory(folder);
  const sourceFiles=[];
  for(const [name,expected] of Object.entries(ORIGINAL_MCP_FILES)){
    const bytes=await readFile(resolve(merchantRoot,name));
    same(gitBlob(bytes),expected,'Execute the exact reviewed original MCP source: '+name);
    sourceFiles.push({name,gitBlob:expected,sha256:sha(bytes),bytes:bytes.length});
  }
  const moduleBytes=await readFile(fileURLToPath(import.meta.url));
  const intent={
    schema:'stellar-forge.merchant-tariff-mcp-continuation.v1',
    operationDirectory:output,sourceRoot,merchantRoot,
    originalOperationSha256:sha(await readFile(join(output,'operation.json'))),
    tariffPlan:original.tariffPlan,pricingVersion:original.pricingVersion,
    repricingDecision:original.repricingDecision,portfolioSha256:originalPortfolio.sha256,
    module:{gitBlob:gitBlob(moduleBytes),sha256:sha(moduleBytes),bytes:moduleBytes.length},sourceFiles
  };
  // Preserve the first attempt and its retained file offsets when a source-owned
  // caller repair resumes this operation. Only the caller module may differ;
  // source leaves, original requests, workspace and all selected IDs must match.
  let intentPath=join(folder,'operation.json');
  try {
    const previous=await json(intentPath);
    const {module:oldModule,...oldBinding}=previous;
    const {module:newModule,...newBinding}=intent;
    assert.deepEqual(newBinding,oldBinding,'A caller repair must retain the original operation binding.');
    if(oldModule.gitBlob!==newModule.gitBlob)
      intentPath=join(folder,'operation-'+newModule.gitBlob+'.json');
  } catch(error) { if(error.code!=='ENOENT')throw error; }
  const intentBytes=await retain(intentPath,intent),intentSha256=sha(intentBytes);
  try{
    const previous=await json(join(folder,'result.json'));
    same(previous.intentSha256,intentSha256);
    same(previous.status,'COMPLETE');
    return previous;
  }catch(error){if(error.code!=='ENOENT')throw error;}

  const imported=name=>import(pathToFileURL(resolve(merchantRoot,name)).href);
  const {MerchantPricing,readPricingConfiguration,PRICING_CONNECTION_SCHEMA}=await imported('pricing.mjs');
  const {default:declaration}=await imported('providers/pricing.mjs');
  const {createMcpToolHandler}=await imported('../mcp-paid-agent/http-tools.mjs');
  const {
    createMerchantTariffClient,TARIFF_MCP_OPERATIONS,downloadMerchantTariffPlan,
    downloadMerchantTariffPortfolio,downloadMerchantTariffPricingReview
  }=await imported('pricing-tariffs-client.mjs');
  const {downloadMerchantPriceDecision}=await imported('pricing-client.mjs');
  const {openMerchantFileClient}=await imported('retained-download.mjs');

  const connectionPath=join(folder,'pricing-connection.json');
  const fixtureSettings={
    config:join(sourceRoot,'illustrative-service.json'),
    snapshot:join(sourceRoot,'illustrative-native-shape-snapshot.json')
  };
  await retain(connectionPath,{
    schema:PRICING_CONNECTION_SCHEMA,
    workspaces:{
      original:{...fixtureSettings,label:'Existing native tariff operation',directory:join(output,'pricing')},
      received:{...fixtureSettings,label:'Existing restored native tariff operation',directory:original.receivedDirectory}
    }
  });
  const config={pricing:await readPricingConfiguration(connectionPath)};
  const owner=new MerchantPricing(config),seen=new Set(),calls=[];
  // Provider declarations expose a catalog factory, not the resulting tools.
  // This is the original MerchantOperator catalog builder contract.
  function tool(name,description,properties={},required=[],{
    readOnly=false,destructive=false,idempotent=false,openWorld=false
  }={}) {
    return {name,description,annotations:{readOnlyHint:readOnly,destructiveHint:destructive,
      idempotentHint:idempotent,openWorldHint:openWorld},
      inputSchema:{type:'object',properties,required,additionalProperties:false}};
  }
  const provider={
    tools:declaration.tools(tool),
    async call(name,args){
      seen.add(name);calls.push(name);
      return owner.call(name,args);
    }
  };
  for(const name of Object.values(TARIFF_MCP_OPERATIONS))
    assert.ok(provider.tools.some(tool=>tool.name===name),'The original Pricing catalogue must own '+name);
  const token=randomBytes(32).toString('hex');
  const handler=createMcpToolHandler(provider,{
    bearerToken:token,maxRequestBytes:declaration.maxRequestBytes,
    serverName:'starforge-original-pricing-operation',
    instructions:declaration.instructions.map(row=>row.text).join('\n\n')
  });
  const server=createServer(handler);
  let failure=null;
  try{
    await new Promise((done,reject)=>{
      server.once('error',reject);
      server.listen(0,'127.0.0.1',()=>{server.off('error',reject);done();});
    });
    const endpoint='http://127.0.0.1:'+server.address().port;
    const connection={url:endpoint,environment:{MCP_ACCESS_TOKEN:token}};
    const client=createMerchantTariffClient({...connection,workspace:'original'});
    const receiver=createMerchantTariffClient({...connection,workspace:'received'});

    // These are the operation's existing immutable requests and results.
    same((await client.state()).pricing.revision,committed.pricing.revision);
    same((await client.source(seed.version)).version,seed.version);
    same((await client.preview(previewInput)).review.tariffReviewSha256,preview.review.tariffReviewSha256);
    const saved=await client.save(tariffRequest);
    same(saved.planId,tariffSaved.planId);same(saved.recovered,true);
    assert.ok((await client.list()).plans.some(plan=>plan.planId===tariffSaved.planId));
    same((await client.load(tariffSaved.planId)).review.tariffReviewSha256,preview.review.tariffReviewSha256);
    const selected=await client.selection({
      planId:tariffSaved.planId,comparisonId:commitRequest.selection.comparisonId
    });
    same(selected.pricingInput.commercial.routes.dataset.unitPriceUsd,'0.0114');
    const recovery=await client.commitSelection(commitRequest);
    same(recovery.recovered,true);same(recovery.pricing.version,committed.pricing.version);
    const csv=await client.download(tariffSaved.planId,'comparison.csv',{chunkSize:4096});
    assert.deepEqual(Buffer.from(csv.bytes),await readFile(join(output,'tariff-comparison.csv')));
    const portfolio=await client.bundle({chunkSize:4096});
    same(portfolio.sha256,originalPortfolio.sha256);
    const received=await receiver.receive(portfolio);
    same(received.status,'TARIFF_PORTFOLIO_RECEIVED');
    const priceSource=await client.repricingSource(committed.pricing.version);
    same(priceSource.version,committed.pricing.version);
    const priceFile=await client.downloadRepricing(repriced.decision,'seller.json',{chunkSize:4096});
    assert.deepEqual(Buffer.from(priceFile.bytes),await readFile(join(output,'repriced-seller.json')));
    const termsFile=await client.downloadPricing(committed.pricing.version,'terms.json',{chunkSize:4096});
    assert.deepEqual(Buffer.from(termsFile.bytes),await readFile(join(output,'selected-pricing-terms.json')));
    const {requestId,expectedRevision,label,reviewSha256,...repricingInput}=repricingRequest;
    const pricePreview=await client.previewRepricing(repricingInput);
    same(pricePreview.reviewSha256,repricingRequest.reviewSha256);
    same(pricePreview.quoteConversion.rows[0].amount,'114000');
    const priceRecovery=await client.saveRepricing(repricingRequest);
    same(priceRecovery.decision,repriced.decision);same(priceRecovery.recovered,true);
    let stage;
    try{
      stage=await client.stageRepricing({decision:repriced.decision,reviewSha256:repricingRequest.reviewSha256});
    }catch(error){
      // The unchanged illustrative operation declares neither a source package
      // nor a release store. Preserve the original native response at this method.
      if(!['RELEASE_STORE_REQUIRED','RELEASE_SOURCE_REQUIRED'].includes(error.code))throw error;
      stage={code:error.code,message:error.reason??error.message,
        sourcePackageAvailable:priceSource.sourcePackageAvailable,releaseAvailable:priceSource.releaseAvailable};
    }

    // Full original writers retain every manifest-named file and their checkpoints.
    const downloadOptions={...connection,workspace:'original',chunkSize:4096};
    const exports={
      plan:await downloadMerchantTariffPlan({...downloadOptions,planId:tariffSaved.planId,directory:join(folder,'plan')}),
      portfolio:await downloadMerchantTariffPortfolio({...downloadOptions,portfolioSha256:portfolio.sha256,directory:join(folder,'portfolio')}),
      pricing:await downloadMerchantTariffPricingReview({...downloadOptions,version:committed.pricing.version,directory:join(folder,'pricing')}),
      decision:await downloadMerchantPriceDecision({...downloadOptions,decision:repriced.decision,directory:join(folder,'decision')})
    };
    for(const value of Object.values(exports))same(value.state,'COMPLETE');
    same((await json(join(folder,'portfolio','tariff-portfolio.json'))).sha256,portfolio.sha256);

    // Close the original alias, draining its exact retained file owner. The same
    // typed client reopens it on the original not-open response, preserving IDs.
    const control=await openMerchantFileClient(connection);
    await control.call('merchant_pricing_close',{workspace:'original'});
    same((await client.bundle({portfolioSha256:portfolio.sha256})).sha256,portfolio.sha256);
    const resumed=await downloadMerchantTariffPortfolio({
      ...downloadOptions,portfolioSha256:portfolio.sha256,directory:join(folder,'portfolio'),
      expectedManifestSha256:exports.portfolio.manifestSha256
    });
    same(resumed.state,'COMPLETE');same(resumed.resumed,true);
    same(resumed.manifestSha256,exports.portfolio.manifestSha256);
    same((await receiver.bundle({chunkSize:4096})).sha256,portfolio.sha256);
    for(const name of Object.values(TARIFF_MCP_OPERATIONS))
      assert.ok(seen.has(name),'The same native operation must dispatch '+name);

    const result={
      schema:'stellar-forge.merchant-tariff-mcp-result.v1',status:'COMPLETE',intentSha256,
      operationDirectory:output,sourceRoot,merchantRoot,completedAt:new Date().toISOString(),
      tariffPlan:tariffSaved.planId,pricingVersion:committed.pricing.version,repricingDecision:repriced.decision,
      operations:Object.values(TARIFF_MCP_OPERATIONS),dispatches:calls.length,
      transport:{implementation:'original createMcpToolHandler',requestLimit:declaration.maxRequestBytes},
      recovery:{tariffSave:saved.recovered,selection:recovery.recovered,repricing:priceRecovery.recovered,
        portfolioDownload:resumed.resumed,portfolioManifestSha256:resumed.manifestSha256},
      portfolio:{sha256:portfolio.sha256,plans:received.plans.length,selections:received.selections},
      selected:{unitPriceUsd:'0.0114',atomicAmount:'114000'},stage,exports,sourceFiles
    };
    await owner.close();
    await new Promise((done,reject)=>server.close(error=>error?reject(error):done()));
    await retain(join(folder,'result.json'),result);
    return result;
  }catch(error){
    failure=error;
    const record={code:error.code??'ORIGINAL_MCP_CONTINUATION_FAILED',message:error.message,stack:error.stack,
      intentSha256,operations:[...seen],dispatches:calls.length};
    await writeFile(join(folder,'failure.json'),encode(record),{mode:0o600}).catch(()=>{});
    throw error;
  }finally{
    await owner.close().catch(error=>{if(!failure)throw error;});
    if(server.listening)
      await new Promise((done,reject)=>server.close(error=>error?reject(error):done())).catch(error=>{if(!failure)throw error;});
  }
}
