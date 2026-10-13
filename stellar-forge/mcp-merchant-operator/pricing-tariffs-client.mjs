// MIT. Complete tariff operations over the original authenticated Merchant Pricing MCP.
import { createHash } from 'node:crypto';
import { createRetainedDownload, openMerchantFileClient } from './retained-download.mjs';
import { MAX_RETAINED_CHUNK_BYTES } from './retained-file-contracts.mjs';
import { TARIFF_MCP_OPERATIONS, tariffClientOperations } from './catalog/pricing-tariffs.mjs';
export { TARIFF_MCP_OPERATIONS, tariffClientOperations } from './catalog/pricing-tariffs.mjs';

const MAX_FILE_BYTES=64*1024*1024;
const MAX_PLAN_BYTES=16*1024*1024;
const HASH=/^[a-f0-9]{64}$/;
const UUID=/^[a-f0-9]{8}-[a-f0-9]{4}-[a-f0-9]{4}-[a-f0-9]{4}-[a-f0-9]{12}$/;
const ALIAS=/^[a-z0-9][a-z0-9_-]{0,63}$/;
const plain=value=>value!==null&&typeof value==='object'&&!Array.isArray(value);
const sha=bytes=>createHash('sha256').update(bytes).digest('hex');
const fail=(code,message)=>Object.assign(new Error(message),{code:'PRICING_TARIFF_CLIENT_'+code});
const checkedAlias=value=>{
  if(!ALIAS.test(value??''))throw fail('WORKSPACE_REQUIRED','Supply the original host-declared Pricing alias.');
  return value;
};
const checkedId=(value,label,pattern=UUID)=>{
  if(!pattern.test(value??''))throw fail('IDENTITY_REQUIRED','Supply the original '+label+'.');
  return value;
};
const canonical=value=>JSON.stringify(value,(_,item)=>plain(item)
  ?Object.fromEntries(Object.keys(item).sort().map(key=>[key,item[key]])):item);
function verifyPortfolio(value,id) {
  if(!plain(value)||value.schema!=='stellar-forge.merchant-tariff-portfolio.v1'||
      !Array.isArray(value.plans)||!Array.isArray(value.selections)||value.sha256!==id||
      sha(canonical({schema:value.schema,plans:value.plans,selections:value.selections}))!==id)
    throw fail('PORTFOLIO_CHANGED','The received bytes differ from the selected original tariff portfolio.');
  return value;
}
function portfolioSelection(options) {
  const selected={};
  if(options.portfolioSha256!==undefined)
    selected.portfolioSha256=checkedId(options.portfolioSha256,'portfolioSha256',HASH);
  if(options.selectionRequestId!==undefined)
    selected.selectionRequestId=checkedId(options.selectionRequestId,'selectionRequestId');
  return selected;
}
function checkedPortfolioSelection(info,selectionRequestId) {
  if(selectionRequestId!==undefined&&(info.selectionRequestId!==selectionRequestId||
      info.manifest?.planCount!==1||info.manifest?.selectionCount!==1))
    throw fail('SELECTION_CHANGED','The original portfolio reply belongs to another selection.');
  return info;
}
function verifySelectedPortfolio(value,selectionRequestId) {
  if(selectionRequestId===undefined)return value;
  const item=value.selections[0],plan=value.plans[0];
  if(value.selections.length!==1||value.plans.length!==1||item?.id!==selectionRequestId||
      item.intent?.selection?.planId!==plan?.planId||
      item.intent?.request?.selection?.planId!==plan?.planId)
    throw fail('SELECTION_CHANGED','The received portfolio does not contain exactly the selected original request and plan.');
  return value;
}
async function connected(options,workspace) {
  const client=await openMerchantFileClient({...options,errorPrefix:'PRICING_TARIFF',
    clientName:'starforge-merchant-tariffs',maximumResponseBytes:128*1024*1024});
  await client.call('merchant_pricing_open',{workspace});
  return client;
}
function ownedReply(value,workspace) {
  if(!plain(value)||value.workspace!==workspace)
    throw fail('WORKSPACE_CHANGED','The original MCP reply belongs to a different Pricing alias.');
  return value;
}
function fileSelection(kind,id) {
  return (kind==='plan'||kind==='report')?{planId:id}:kind==='portfolio'?{portfolioSha256:id}:
    kind==='review'?{version:id}:{decision:id};
}
function fileOperation(kind) {
  return kind==='plan'?'download':kind==='report'?'report':kind==='portfolio'?'bundle':
    kind==='review'?'downloadPricing':'downloadRepricing';
}
function checkedManifest(info,kind,id) {
  const manifest=info?.manifest,file=info?.manifestFile;
  if(info?.kind!==kind||info.id!==id||!plain(manifest)||!plain(manifest.files)||
      file?.name!=='manifest.json'||!Number.isSafeInteger(file.bytes)||file.bytes<1||
      file.bytes>MAX_FILE_BYTES||!HASH.test(file.sha256??''))
    throw fail('MANIFEST_CHANGED','Inspect the complete original manifest for this selected artifact.');
  const key=(kind==='plan'||kind==='report')?'planId':kind==='portfolio'?'portfolioSha256':
    kind==='review'?'version':'decision';
  if(manifest[key]!==id)
    throw fail('MANIFEST_CHANGED','The original manifest belongs to another saved artifact.');
  return info;
}
function fileMetadata(info,name) {
  const value=name==='manifest.json'?info.manifestFile:info.manifest.files[name];
  if(typeof name!=='string'||!name||name.startsWith('/')||/[:\\\x00-\x1f\x7f]/.test(name)||
      name.split('/').some(part=>!part||part==='.'||part==='..')||
      !plain(value)||!Number.isSafeInteger(value.bytes)||value.bytes<0||
      value.bytes>MAX_FILE_BYTES||!HASH.test(value.sha256??''))
    throw fail('FILE_REQUIRED','Choose an original file within its saved manifest and size limit.');
  return {name,bytes:value.bytes,sha256:value.sha256};
}

/**
 * Synchronously captures every caller input before the first await. Native UUIDs,
 * source bindings and review hashes are always supplied by the caller.
 */
export class MerchantTariffClient {
  #workspace; #options; #connection;
  constructor({workspace,...options}={}) {
    this.#workspace=checkedAlias(workspace);this.#options={...options};
  }
  get workspace(){return this.#workspace;}
  async #connected() {
    this.#connection??=connected(this.#options,this.#workspace);
    try{return await this.#connection;}catch(error){this.#connection=null;throw error;}
  }
  #invoke(operation,args={},options={}) {
    if(!Object.hasOwn(TARIFF_MCP_OPERATIONS,operation)||!plain(args))
      throw fail('ARGUMENTS','Choose an original tariff operation with its exact argument object.');
    const input=structuredClone(args);
    if(Object.hasOwn(input,'workspace')&&input.workspace!==this.#workspace)
      throw fail('WORKSPACE_CHANGED','Use the selected Pricing alias throughout this client.');
    input.workspace=this.#workspace;
    return this.#send(TARIFF_MCP_OPERATIONS[operation],input,{requestSignal:options.signal});
  }
  async #send(name,input,requestOptions) {
    const client=await this.#connected();
    let result;
    try{result=await client.call(name,input,requestOptions);}
    catch(error){
      if(error.code!=='PRICING_NOT_OPEN')throw error;
      // This original error is raised by #entry before dispatch. Reopen the
      // same alias and retry only the unchanged request that was not admitted.
      await client.call('merchant_pricing_open',{workspace:this.#workspace},requestOptions);
      result=await client.call(name,input,requestOptions);
    }
    return ownedReply(result,this.#workspace);
  }
  state(options){return this.#invoke('state',{},options);}
  source(version,options){return this.#invoke('source',{version},options);}
  preview(input,options){return this.#invoke('preview',input,options);}
  save(input,options){return this.#invoke('save',input,options);}
  list(options){return this.#invoke('list',{},options);}
  load(planId,options){return this.#invoke('load',{planId},options);}
  selection(input,options){return this.#invoke('selection',input,options);}
  commitSelection(input,options){return this.#invoke('commitSelection',input,options);}
  inspectPortfolio(bundle,options){return this.#invoke('inspectPortfolio',{bundle},options);}
  receive(bundle,options){return this.#invoke('receive',{bundle},options);}
  repricingSource(version,options){return this.#invoke('repricingSource',{version},options);}
  previewRepricing(input,options){return this.#invoke('previewRepricing',input,options);}
  saveRepricing(input,options){return this.#invoke('saveRepricing',input,options);}
  stageRepricing(input,options){return this.#invoke('stageRepricing',input,options);}
  async #artifact(kind,id,name,options={}) {
    const operation=fileOperation(kind),selector=fileSelection(kind,id);
    const info=checkedManifest(await this.#invoke(operation,{...selector,view:'manifest'},options),kind,id);
    return this.#readArtifact(kind,id,name,info,options);
  }
  async #readArtifact(kind,id,name,info,options={}) {
    const operation=fileOperation(kind),selector=fileSelection(kind,id),file=fileMetadata(info,name);
    const chunkSize=options.chunkSize??65536;
    if(!Number.isSafeInteger(chunkSize)||chunkSize<1||chunkSize>MAX_RETAINED_CHUNK_BYTES)
      throw fail('CHUNK_SIZE','Use an original chunk size from 1 through '+MAX_RETAINED_CHUNK_BYTES+'.');
    const chunks=[];let offset=0,readId=null;
    try{
      while(offset<file.bytes||file.bytes===0&&chunks.length===0){
        const limit=Math.min(chunkSize,Math.max(1,file.bytes-offset));
        const value=await this.#invoke(operation,{...selector,view:'file',file:name,
          expectedManifestSha256:info.manifestFile.sha256,expectedSha256:file.sha256,
          offset,limit,...(readId?{readId}:{})},options);
        const count=Math.min(limit,file.bytes-offset),next=offset+count<file.bytes?offset+count:null;
        if(value.kind!==kind||value.id!==id||value.manifestSha256!==info.manifestFile.sha256||
            value.file?.name!==file.name||value.file?.bytes!==file.bytes||value.file?.sha256!==file.sha256||
            !UUID.test(value.readId??'')||readId&&value.readId!==readId||
            value.offset!==offset||value.bytesRead!==count||value.nextOffset!==next||
            value.encoding!=='base64'||typeof value.data!=='string')
          throw fail('CHUNK_CHANGED','The returned chunk differs from the original file, digest or byte offset.');
        const bytes=Buffer.from(value.data,'base64');
        if(bytes.length!==count||bytes.toString('base64')!==value.data)
          throw fail('CHUNK_CHANGED','The original file chunk is not canonical complete Base64.');
        chunks.push(bytes);offset+=count;readId=next===null?null:value.readId;
        if(next===null)break;
      }
    }finally{
      if(readId){
        const client=await this.#connected();
        await client.call('merchant_pricing_file_release',{workspace:this.#workspace,readId},
          {requestSignal:null,timeoutMs:2000}).catch(()=>{});
      }
    }
    const bytes=Buffer.concat(chunks,offset);
    if(bytes.length!==file.bytes||sha(bytes)!==file.sha256)
      throw fail('FILE_CHANGED','The complete downloaded bytes differ from their original SHA-256.');
    const contentType=name.endsWith('.json')?'application/json':name.endsWith('.csv')?'text/csv; charset=utf-8':name.endsWith('.html')?'text/html; charset=utf-8':'application/octet-stream';
    return {filename:name,contentType,bytes,sha256:file.sha256,manifestSha256:info.manifestFile.sha256,
      headers:Object.freeze({'content-length':String(file.bytes),'x-content-sha256':file.sha256})};
  }
  download(planId,name,options){return this.#artifact('plan',checkedId(planId,'planId'),name,options);}
  report(planId,name='report.html',options){return this.#artifact('report',checkedId(planId,'planId'),name,options);}
  downloadRepricing(decision,name,options){return this.#artifact('decision',checkedId(decision,'decision'),name,options);}
  downloadPricing(version,name,options){return this.#artifact('review',checkedId(version,'saved version'),name,options);}
  async bundle(options={}) {
    const capturedOptions={...options},selected=portfolioSelection(capturedOptions);
    const info=await this.#invoke('bundle',{...selected,view:'manifest'},capturedOptions);
    checkedManifest(info,'portfolio',info.portfolioSha256);
    checkedPortfolioSelection(info,selected.selectionRequestId);
    const file=await this.#readArtifact('portfolio',info.portfolioSha256,'tariff-portfolio.json',info,capturedOptions);
    return verifySelectedPortfolio(verifyPortfolio(
      JSON.parse(new TextDecoder('utf-8',{fatal:true}).decode(file.bytes)),info.portfolioSha256),
      selected.selectionRequestId);
  }
}
export function createMerchantTariffClient(options){return new MerchantTariffClient(options);}

function parsePlanManifest(bytes,id) {
  const value=JSON.parse(new TextDecoder('utf-8',{fatal:true}).decode(bytes));
  if(value?.schema!=='stellar-forge.merchant-tariff-plan-files.v1'||value.planId!==id||
      !UUID.test(value.version??'')||!HASH.test(value.tariffReviewSha256??'')||!plain(value.files)||
      Object.keys(value.files).length!==3)
    throw fail('MANIFEST_CHANGED','Use the complete original tariff plan file manifest.');
  const files=['plan.json','tariffs.json','comparison.csv'].map(name=>{
    const file=value.files[name];
    if(!plain(file)||!Number.isSafeInteger(file.bytes)||file.bytes<0||file.bytes>MAX_PLAN_BYTES||
        !HASH.test(file.sha256??''))throw fail('MANIFEST_CHANGED','Retain all three original tariff plan files.');
    return {name,bytes:file.bytes,sha256:file.sha256};
  });
  return {...value,exportId:id,files};
}
function parseReportManifest(bytes,id) {
  const value=JSON.parse(new TextDecoder('utf-8',{fatal:true}).decode(bytes));
  const names=['report.html','band-charges.csv','thresholds.csv','plan.json','tariffs.json','comparison.csv'];
  if(value?.schema!=='stellar-forge.merchant-tariff-report-files.v1'||value.planId!==id||
      !UUID.test(value.version??'')||!HASH.test(value.tariffReviewSha256??'')||!plain(value.files)||
      Object.keys(value.files).length!==names.length)
    throw fail('MANIFEST_CHANGED','Use the complete saved-plan report manifest with all six original files.');
  const files=names.map(name=>{
    const file=value.files[name];
    if(!plain(file)||!Number.isSafeInteger(file.bytes)||file.bytes<0||file.bytes>MAX_FILE_BYTES||
        !HASH.test(file.sha256??''))throw fail('MANIFEST_CHANGED','Retain the complete original report and its plan files.');
    return {name,bytes:file.bytes,sha256:file.sha256};
  });
  return {...value,exportId:id,files};
}
function parsePortfolioManifest(bytes,id) {
  const value=JSON.parse(new TextDecoder('utf-8',{fatal:true}).decode(bytes));
  const file=value?.files?.['tariff-portfolio.json'];
  if(value?.schema!=='stellar-forge.merchant-tariff-portfolio-files.v1'||value.portfolioSha256!==id||
      !plain(value.files)||Object.keys(value.files).length!==1||!plain(file)||
      !Number.isSafeInteger(file.bytes)||file.bytes<1||file.bytes>MAX_FILE_BYTES||
      !HASH.test(file.sha256??'')||!Number.isSafeInteger(value.planCount)||value.planCount<0||
      !Number.isSafeInteger(value.selectionCount)||value.selectionCount<0)
    throw fail('MANIFEST_CHANGED','Use the complete original portfolio file manifest.');
  return {...value,exportId:id,files:[{name:'tariff-portfolio.json',bytes:file.bytes,sha256:file.sha256}]};
}

function parseReviewManifest(bytes,id) {
  const value=JSON.parse(new TextDecoder('utf-8',{fatal:true}).decode(bytes));
  if(value?.schema!=='stellar-forge.merchant-pricing-version.v1'||value.version!==id||
      !UUID.test(value.requestId??'')||!HASH.test(value.requestSha256??'')||
      !HASH.test(value.sellerSha256??'')||!HASH.test(value.snapshotSha256??'')||!plain(value.files))
    throw fail('MANIFEST_CHANGED','Use the complete original saved Pricing manifest.');
  const files=Object.entries(value.files).map(([name,file])=>{
    if(!name||name.startsWith('/')||/[:\\\x00-\x1f\x7f]/.test(name)||
        name.split('/').some(part=>!part||part==='.'||part==='..')||
        name==='manifest.json'||name==='download-state'||name.startsWith('download-state/')||
        !plain(file)||!Number.isSafeInteger(file.bytes)||file.bytes<0||file.bytes>MAX_FILE_BYTES||
        !HASH.test(file.sha256??''))throw fail('MANIFEST_CHANGED','An original Pricing file has an invalid saved identity.');
    return {name,bytes:file.bytes,sha256:file.sha256};
  });
  for(const name of ['seller.json','terms.json',value.sourceFile??'snapshot.json','report/report.json'])
    if(!Object.hasOwn(value.files,name))throw fail('MANIFEST_CHANGED','Retain the original seller, terms, observations and report together.');
  if(value.files['seller.json'].sha256!==value.sellerSha256)
    throw fail('MANIFEST_CHANGED','The original seller file differs from the saved Pricing source.');
  return {...value,exportId:id,files};
}

function retainedClient(original,workspace,kind) {
  return {endpoint:original.endpoint,async call(name,args,options){
    const {exportId,...input}=args;
    let result;
    if(name.endsWith('_file_release'))
      result=await original.call('merchant_pricing_file_release',{workspace,readId:input.readId},options);
    else {
      const view=name.endsWith('_manifest')?'manifest':'file';
      result=await original.call(TARIFF_MCP_OPERATIONS[fileOperation(kind)],
        {workspace,...fileSelection(kind,exportId),view,...input},options);
      if(result.kind!==kind||result.id!==exportId)
        throw fail('IDENTITY_CHANGED','The original download reply belongs to another saved artifact.');
    }
    ownedReply(result,workspace);
    return {...result,exportId,...(name.endsWith('_manifest')?{state:'MANIFEST_RETAINED'}:{})};
  }};
}
function downloader(workspace,kind) {
  checkedAlias(workspace);
  return createRetainedDownload({manifestName:'manifest.json',
    parseManifest:kind==='plan'?parsePlanManifest:kind==='report'?parseReportManifest:kind==='review'?parseReviewManifest:parsePortfolioManifest,
    maximumBytes:kind==='plan'?MAX_PLAN_BYTES:MAX_FILE_BYTES,
    maximumManifestBytes:kind==='review'?MAX_FILE_BYTES:65536,
    maximumCheckpointBytes:kind==='review'?MAX_FILE_BYTES:1024*1024,nestedFiles:kind==='review',
    stateSchema:'stellar-forge.tariff-'+kind+'-download-state.v1',
    resultSchema:'stellar-forge.tariff-'+kind+'-download.v1',
    toolPrefix:'merchant_pricing_tariff',errorPrefix:'PRICING_TARIFF',
    clientName:'starforge-merchant-tariffs',
    validateExportId:value=>checkedId(value,kind==='portfolio'?'portfolioSha256':(kind==='plan'||kind==='report')?'planId':'version',kind==='portfolio'?HASH:UUID),
    describe:value=>(kind==='plan'||kind==='report')?{planId:value.planId,version:value.version,tariffReviewSha256:value.tariffReviewSha256}:
      kind==='review'?{version:value.version,sellerSha256:value.sellerSha256,snapshotSha256:value.snapshotSha256}:
      {portfolioSha256:value.portfolioSha256,planCount:value.planCount,selectionCount:value.selectionCount},
    connect:async options=>retainedClient(await connected(options,workspace),workspace,kind)});
}

/** Uses the original private-directory writer and retained chunk/reopen checkpoints. */
export function downloadMerchantTariffPlan({workspace,planId,...options}={}) {
  checkedId(planId,'planId');return downloader(workspace,'plan').download({...options,exportId:planId});
}
export function inspectMerchantTariffPlan({workspace,planId,...options}={}) {
  checkedId(planId,'planId');return downloader(workspace,'plan').inspect({...options,exportId:planId});
}
export async function downloadMerchantTariffPortfolio({workspace,portfolioSha256,selectionRequestId,...options}={}) {
  checkedAlias(workspace);
  const selected=portfolioSelection({portfolioSha256,selectionRequestId});
  const original=await connected(options,workspace);
  const info=ownedReply(await original.call(TARIFF_MCP_OPERATIONS.bundle,
    {workspace,...selected,view:'manifest'}),workspace);
  checkedManifest(info,'portfolio',info.portfolioSha256);
  checkedPortfolioSelection(info,selectionRequestId);
  const {url,tokenEnv,environment,maximumResponseBytes,...downloadOptions}=options;
  const result=await downloader(workspace,'portfolio').download({...downloadOptions,
    client:retainedClient(original,workspace,'portfolio'),exportId:info.portfolioSha256});
  return selectionRequestId===undefined?result:{...result,selectionRequestId};
}
export function inspectMerchantTariffPortfolio({workspace,portfolioSha256,...options}={}) {
  checkedId(portfolioSha256,'portfolioSha256',HASH);
  return downloader(workspace,'portfolio').inspect({...options,exportId:portfolioSha256});
}

export function downloadMerchantTariffPricingReview({workspace,version,...options}={}) {
  checkedId(version,'saved Pricing version');return downloader(workspace,'review').download({...options,exportId:version});
}
export function inspectMerchantTariffPricingReview({workspace,version,...options}={}) {
  checkedId(version,'saved Pricing version');return downloader(workspace,'review').inspect({...options,exportId:version});
}

/** Receives every saved report file through the original private retained downloader. */
export function downloadMerchantTariffReport({workspace,planId,...options}={}) {
  checkedId(planId,'planId');return downloader(workspace,'report').download({...options,exportId:planId});
}
export function inspectMerchantTariffReport({workspace,planId,...options}={}) {
  checkedId(planId,'planId');return downloader(workspace,'report').inspect({...options,exportId:planId});
}
