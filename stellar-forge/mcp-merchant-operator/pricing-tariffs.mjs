// MIT. Tariff operations borrow the original MerchantPricing model and file owner.
import { constants } from 'node:fs';
import { open, mkdir, realpath, link, unlink } from 'node:fs/promises';
import { join, resolve } from 'node:path';
import { createHash, randomUUID } from 'node:crypto';
import { failure, privateSupportDirectory, writePrivate } from './host-files.mjs';
import { TARIFF_MCP_OPERATIONS } from './catalog/pricing-tariffs.mjs';
import { TARIFF_REPORT_FILES } from '../../stellar/scf-starforge-20261009/sf97-merchant-revenue-ops/tariffs/public/review.mjs';

const MAX_PORTFOLIO_BYTES=64*1024*1024;
const HASH=/^[a-f0-9]{64}$/;
const UUID=/^[a-f0-9]{8}-[a-f0-9]{4}-[a-f0-9]{4}-[a-f0-9]{4}-[a-f0-9]{12}$/;
const plain=value=>value!==null&&typeof value==='object'&&!Array.isArray(value);
const encode=value=>Buffer.from(JSON.stringify(value,null,2)+'\n');
const sha=bytes=>createHash('sha256').update(bytes).digest('hex');
const canonical=value=>JSON.stringify(value,(_,item)=>plain(item)
  ?Object.fromEntries(Object.keys(item).sort().map(key=>[key,item[key]])):item);
const fail=(code,message)=>failure('PRICING_TARIFF_'+code,message);
const operationByName=new Map(Object.entries(TARIFF_MCP_OPERATIONS).map(([operation,name])=>[name,operation]));
const fileFields=['file','expectedManifestSha256','expectedSha256','readId','offset','limit'];

function originalPortfolio(value) {
  if (!plain(value)||value.schema!=='stellar-forge.merchant-tariff-portfolio.v1'||
      !Array.isArray(value.plans)||!Array.isArray(value.selections)||!HASH.test(value.sha256??'')||
      sha(canonical({schema:value.schema,plans:value.plans,selections:value.selections}))!==value.sha256)
    throw fail('PORTFOLIO_CHANGED','Use the complete original tariff portfolio and its original content digest.');
  return value;
}
function selectedPortfolio(value,selectionRequestId) {
  if(selectionRequestId===undefined)return value;
  if(!UUID.test(selectionRequestId??''))
    throw fail('SELECTION_REQUEST_REQUIRED','Choose the original pricingRequestId for the selected tariff journal.');
  const item=value.selections[0],plan=value.plans[0];
  if(value.selections.length!==1||value.plans.length!==1||item?.id!==selectionRequestId||
      item.intent?.selection?.planId!==plan?.planId||
      item.intent?.request?.selection?.planId!==plan?.planId)
    throw fail('SELECTION_CHANGED','The retained portfolio does not contain exactly this original selection and its plan.');
  return value;
}
function portfolioInspection(review) {
  return {schema:'stellar-forge.merchant-tariff-portfolio-inspection.v1',
    portfolioSha256:review.sha256,sourceReviewSchema:review.schema,
    planCount:review.plans.length,selectionCount:review.selections.length,
    plans:review.plans.map(record=>({planId:record.planId,version:record.version,
      label:record.label,sourceLabel:record.sourceLabel,tariffReviewSha256:record.review.tariffReviewSha256})),
    selections:review.selections.map(item=>({id:item.id,planId:item.intent.selection.planId,
      comparisonId:item.intent.selection.comparisonId,planRequestId:item.intent.request.planRequestId,
      pricingRequestId:item.intent.request.pricingRequestId,completed:item.result!==null,
      scenarioPlanId:item.result?.scenarioPlan?.planId??null,pricingVersion:item.result?.pricing?.version??null}))};
}
function retainedPath(name) {
  if (typeof name!=='string'||!name||name.startsWith('/')||/[:\\\x00-\x1f\x7f]/.test(name)||
      name.split('/').some(part=>!part||part==='.'||part==='..'))
    throw fail('FILE_REQUIRED','Choose a file named in the exact retained manifest.');
  return name;
}
/** The enclosing Pricing owner registers each call and drains its existing file reader. */
export class MerchantPricingTariffs {
  #settings; #model; #files; #operatorReleaseStore; #releaseView; #workspace; #exports; #manifests=new Map();
  constructor({settings,model,files,operatorReleaseStore,releaseView}) {
    this.#settings=settings;this.#model=model;this.#files=files;
    this.#operatorReleaseStore=operatorReleaseStore;this.#releaseView=releaseView;
    this.#exports=join(settings.directory,'tariff-exports');
  }
  async #native() {
    this.#workspace??=(async()=>{
      const {openTariffWorkspace}=await import('../../stellar/scf-starforge-20261009/sf97-merchant-revenue-ops/tariffs/workspace.mjs');
      return openTariffWorkspace({model:this.#model(),directory:this.#settings.directory});
    })();
    try{return await this.#workspace;}catch(error){this.#workspace=null;throw error;}
  }
  async #exportDirectory() {
    await mkdir(this.#exports,{mode:0o700}).catch(error=>{if(error.code!=='EEXIST')throw error;});
    await privateSupportDirectory(this.#exports);
    if(await realpath(this.#exports)!==this.#exports)
      throw fail('PRIVATE_EXPORT_REQUIRED','Keep retained portfolios inside this original private Pricing directory.');
  }
  async #exportBytes(id) {
    if(!HASH.test(id??''))throw fail('PORTFOLIO_REQUIRED','Select the original retained portfolioSha256.');
    await this.#exportDirectory();
    const handle=await open(join(this.#exports,id+'.json'),constants.O_RDONLY|(constants.O_NOFOLLOW??0));
    try{
      const stat=await handle.stat();
      if(!stat.isFile()||stat.size>MAX_PORTFOLIO_BYTES||
          process.platform!=='win32'&&(stat.mode&0o077))
        throw fail('PORTFOLIO_CHANGED','The retained original portfolio changed type, permissions or size.');
      const bytes=await handle.readFile();
      if(bytes.length>MAX_PORTFOLIO_BYTES)throw fail('PORTFOLIO_CHANGED','The retained portfolio exceeds its original size limit.');
      const value=originalPortfolio(JSON.parse(new TextDecoder('utf-8',{fatal:true}).decode(bytes)));
      if(value.sha256!==id)throw fail('PORTFOLIO_CHANGED','The retained export belongs to a different original portfolio.');
      return {bytes,value,path:join(this.#exports,id+'.json')};
    }finally{await handle.close();}
  }
  async #capturePortfolio(selectionRequestId) {
    const value=selectedPortfolio(originalPortfolio(await(await this.#native()).bundle(
      selectionRequestId===undefined?{}:{selectionRequestId})),selectionRequestId),bytes=encode(value);
    if(bytes.length>MAX_PORTFOLIO_BYTES)throw fail('PORTFOLIO_TOO_LARGE','The complete native portfolio exceeds its original 64 MiB limit.');
    await this.#exportDirectory();
    const target=join(this.#exports,value.sha256+'.json');
    try{
      const existing=await this.#exportBytes(value.sha256);
      if(!existing.bytes.equals(bytes))throw fail('PORTFOLIO_CHANGED','The existing content-addressed export differs from its original portfolio.');
      return existing;
    }catch(error){if(error.code!=='ENOENT')throw error;}
    const pending=join(this.#exports,'.'+randomUUID()+'.pending');
    try{
      await writePrivate(pending,bytes);
      try{await link(pending,target);}
      catch(error){
        if(error.code!=='EEXIST')throw error;
        const existing=await this.#exportBytes(value.sha256);
        if(!existing.bytes.equals(bytes))throw fail('PORTFOLIO_CHANGED','A concurrent export differs from the original portfolio.');
      }
      const directory=await open(this.#exports,'r');
      try{await directory.sync();}finally{await directory.close();}
    }finally{await unlink(pending).catch(error=>{if(error.code!=='ENOENT')throw error;});}
    return {bytes,value,path:target};
  }
  #remember(key,value) {
    if(this.#manifests.size>=32)this.#manifests.delete(this.#manifests.keys().next().value);
    this.#manifests.set(key,value);return value;
  }
  async #manifest(kind,id,selectedPortfolio) {
    const key=kind+':'+id,cached=this.#manifests.get(key);
    if(cached)return cached;
    const workspace=await this.#native();let bytes,manifest;
    if(kind==='plan'||kind==='report') {
      const plan=await workspace.load(id),files={};
      for(const name of (kind==='report'?TARIFF_REPORT_FILES:['plan.json','tariffs.json','comparison.csv'])){
        const data=await workspace.download(id,name);
        files[name]={bytes:data.length,sha256:sha(data)};
      }
      manifest={schema:kind==='report'?'stellar-forge.merchant-tariff-report-files.v1':'stellar-forge.merchant-tariff-plan-files.v1',planId:id,
        version:plan.version,tariffReviewSha256:plan.review.tariffReviewSha256,files};
      bytes=encode(manifest);
    }else if(kind==='portfolio'){
      const captured=selectedPortfolio??await this.#exportBytes(id);
      manifest={schema:'stellar-forge.merchant-tariff-portfolio-files.v1',portfolioSha256:id,
        planCount:captured.value.plans.length,selectionCount:captured.value.selections.length,
        files:{'tariff-portfolio.json':{bytes:captured.bytes.length,sha256:sha(captured.bytes)}}};
      bytes=encode(manifest);
    }else{
      bytes=await(kind==='review'?workspace.downloadPricing(id,'manifest.json'):workspace.downloadRepricing(id,'manifest.json'));
      manifest=JSON.parse(new TextDecoder('utf-8',{fatal:true}).decode(bytes));
    }
    return this.#remember(key,{bytes,manifest,manifestFile:{name:'manifest.json',bytes:bytes.length,sha256:sha(bytes)}});
  }
  async #download(kind,id,args,selectedPortfolio) {
    const selectors={kind,id,...((kind==='plan'||kind==='report')?{planId:id}:kind==='portfolio'?{portfolioSha256:id}:
      kind==='review'?{version:id}:{decision:id})};
    if(args.view===undefined||args.view==='manifest'){
      if(fileFields.some(key=>args[key]!==undefined))
        throw fail('FILE_VIEW_REQUIRED','Use view:file with the exact manifest digest to read original file bytes.');
      const original=await this.#manifest(kind,id,selectedPortfolio);
      return {...selectors,manifest:original.manifest,manifestFile:original.manifestFile,
        fileReads:this.#files.status(args.workspace)};
    }
    if(args.view!=='file'||!HASH.test(args.expectedManifestSha256??''))
      throw fail('MANIFEST_REQUIRED','Use view:file with the exact expectedManifestSha256.');
    const file=retainedPath(args.file);
    const read=await this.#files.read({scope:args.workspace,kind:'pricing-tariff-'+kind,
      key:JSON.stringify(['tariff',kind,id,file,args.expectedManifestSha256]),
      directory:this.#settings.directory,readId:args.readId,offset:args.offset,limit:args.limit,
      expectedSha256:args.expectedSha256,
      load:async()=>{
        const original=await this.#manifest(kind,id,selectedPortfolio);
        if(original.manifestFile.sha256!==args.expectedManifestSha256)
          throw fail('MANIFEST_CHANGED','The original retained manifest differs from the selected digest.');
        if(file==='manifest.json')return {name:file,bytes:original.bytes};
        if(!Object.hasOwn(original.manifest.files,file))
          throw fail('FILE_NOT_FOUND','Choose a file named in the original retained manifest.');
        const metadata=original.manifest.files[file];
        if(kind==='portfolio'){
          await this.#exportDirectory();
          const handle=await open(join(this.#exports,id+'.json'),constants.O_RDONLY|(constants.O_NOFOLLOW??0));
          try{
            const info=await handle.stat();
            if(!info.isFile()||info.size!==metadata.bytes||process.platform!=='win32'&&(info.mode&0o077))
              throw fail('PORTFOLIO_CHANGED','The retained portfolio no longer matches its original file identity.');
            return {readonlyFileHandle:handle,name:file,bytes:metadata.bytes,sha256:metadata.sha256,type:'application/json'};
          }catch(error){await handle.close();throw error;}
        }
        const workspace=await this.#native(),bytes=await((kind==='plan'||kind==='report')?workspace.download(id,file):
          kind==='review'?workspace.downloadPricing(id,file):workspace.downloadRepricing(id,file));
        if(bytes.length!==metadata.bytes||sha(bytes)!==metadata.sha256)
          throw fail('FILE_CHANGED','The selected original bytes differ from their saved manifest.');
        return {name:file,bytes};
      }});
    return {...selectors,manifestSha256:args.expectedManifestSha256,...read};
  }
  async call(name,args) {
    const operation=operationByName.get(name),workspace=await this.#native();
    const {workspace:alias,...input}=args;
    switch(operation){
      case 'state':return workspace.state();
      case 'source':return workspace.source(input.version);
      case 'preview':return workspace.preview(input);
      case 'save':return workspace.save(input);
      case 'list':return workspace.list();
      case 'load':return workspace.load(input.planId);
      case 'selection':return workspace.selection(input);
      case 'commitSelection':return workspace.commitSelection(input);
      case 'inspectPortfolio':return portfolioInspection(await workspace.inspectPortfolio(input.bundle));
      case 'receive':return workspace.receive(input.bundle);
      case 'repricingSource':return workspace.repricingSource(input.version);
      case 'previewRepricing':return workspace.previewRepricing(input);
      case 'saveRepricing':return workspace.saveRepricing(input);
      case 'stageRepricing':{
        const result=await workspace.stageRepricing(input);
        return {...result,release:this.#releaseView(result.release),
          operatorReleaseStore:Boolean(this.#settings.releaseStore&&this.#operatorReleaseStore&&
            resolve(this.#settings.releaseStore)===resolve(this.#operatorReleaseStore))};
      }
      case 'download':return this.#download('plan',input.planId,args);
      case 'report':return this.#download('report',input.planId,args);
      case 'downloadPricing':return this.#download('review',input.version,args);
      case 'downloadRepricing':return this.#download('decision',input.decision,args);
      case 'bundle':{
        if(args.view==='file'&&(!input.portfolioSha256||input.selectionRequestId!==undefined))
          throw fail('PORTFOLIO_REQUIRED','Select the original manifest first, then repeat only its portfolioSha256 for each file chunk.');
        const captured=input.portfolioSha256
          ?(input.selectionRequestId===undefined?null:await this.#exportBytes(input.portfolioSha256))
          :await this.#capturePortfolio(input.selectionRequestId);
        if(captured)selectedPortfolio(captured.value,input.selectionRequestId);
        const result=await this.#download('portfolio',input.portfolioSha256??captured.value.sha256,args,captured);
        return input.selectionRequestId===undefined?result:{...result,selectionRequestId:input.selectionRequestId};
      }
      default:throw failure('TOOL_NOT_FOUND','Unknown original tariff operation.');
    }
  }
}
