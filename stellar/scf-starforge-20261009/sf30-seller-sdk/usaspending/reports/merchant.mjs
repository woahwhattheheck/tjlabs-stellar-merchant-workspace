// MIT. Complete funding reports through the original SF30 asset merchant.
import {mkdir,writeFile,readFile,realpath} from 'node:fs/promises';
import {join,resolve,dirname,basename} from 'node:path';
import {randomUUID} from 'node:crypto';
import {canonical,sha,now,id,plain} from '../core.mjs';
import {demand} from '../transactions/core.mjs';
import {createAssetBundle,verifyAssetBundle,exportAssetCatalog} from '../../asset-cli.mjs';
import {compileHttpSellerOffer,normalizeSellerPaymentOptions} from '../../seller.mjs';
import {readSellerConfig,startSellerService} from '../../serve.mjs';
const parse=row=>row?{...row,config:JSON.parse(row.config),result:JSON.parse(row.result)}:null;
const safeError=error=>({code:error.code??'FUNDING_REPORT_MERCHANT_FAILED',message:error.message});
function parameters(input,report) {
  demand(plain(input)&&Object.keys(input).every(k=>['reportId','origin','path','payment'].includes(k)),'FUNDING_REPORT_MERCHANT_OPTIONS_INVALID');
  demand(typeof input.origin==='string'&&typeof input.path==='string'&&/^\/[A-Za-z0-9_.~/-]+$/.test(input.path),'FUNDING_REPORT_MERCHANT_ROUTE_REQUIRED');
  const origin=new URL(input.origin);
  demand(origin.protocol==='https:'&&!origin.username&&!origin.password&&!origin.search&&!origin.hash&&origin.pathname==='/'&&origin.origin===input.origin.replace(/\/$/,''),'FUNDING_REPORT_MERCHANT_ORIGIN_INVALID');
  const payment=normalizeSellerPaymentOptions({payment:input.payment})[0];
  demand(!input.path.startsWith('/_seller/')&&!input.path.includes('//')&&new URL(input.path,origin).pathname===input.path,'FUNDING_REPORT_MERCHANT_ROUTE_INVALID');
  const definition={method:'GET',description:report.packet.content.title,payment,serviceName:'Federal funding reports',tags:['federal-awards','reports']};
  compileHttpSellerOffer({...definition,url:origin.origin+input.path});
  return {reportId:report.id,reportSha256:report.packet.sha256,assetSha256:report.asset_sha256,origin:origin.origin,path:input.path,payment,definition};
}
export function fundingMerchant(workspace,merchantId) {
  const row=parse(workspace.db.prepare('SELECT * FROM award_funding_report_merchants WHERE id=?').get(id(merchantId)));
  demand(row,'FUNDING_REPORT_MERCHANT_NOT_FOUND',undefined,404);
  const report=workspace.fundingReports.record(row.report_id),config=parameters({reportId:row.report_id,origin:row.config.origin,path:row.config.path,payment:row.config.payment},report);
  demand(canonical(row.config)===canonical(config)&&row.input_sha256===sha(config)&&row.id==='FM-'+sha(config).slice(0,48),'FUNDING_REPORT_MERCHANT_BINDING_CHANGED',undefined,409);
  return row;
}
async function completed(workspace,row) {
  const result=row.result,report=workspace.fundingReports.record(row.report_id);
  demand(result.status==='ready'&&typeof result.bundle==='string'&&typeof result.catalog==='string','FUNDING_REPORT_MERCHANT_NOT_READY',undefined,409);
  const directory=dirname(result.bundle),root=join(workspace.directory,'funding-merchants',row.id),attemptName=basename(directory);
  demand(dirname(directory)===root&&/^attempt-[a-f0-9-]{36}$/.test(attemptName)&&result.bundle===join(directory,'merchant')&&result.catalog===join(directory,'catalog.json'),'FUNDING_REPORT_MERCHANT_WORKSPACE_CHANGED','Regenerate the retained report merchant inside this receiving workspace.',409);
  const actualWorkspace=await realpath(workspace.directory),actualDirectory=await realpath(directory);
  demand(actualDirectory===join(actualWorkspace,'funding-merchants',row.id,attemptName)&&await realpath(result.bundle)===join(actualDirectory,'merchant')&&await realpath(result.catalog)===join(actualDirectory,'catalog.json'),'FUNDING_REPORT_MERCHANT_DIRECTORY_CHANGED',undefined,409);
  const checked=await verifyAssetBundle(result.bundle),bytes=await readFile(result.catalog),config=await readSellerConfig(join(result.bundle,'seller.json'));
  const route=config.routes[0];
  demand(checked.configSha256===result.configSha256&&sha(bytes)===result.catalogSha256&&checked.routes===1&&checked.totalRouteBytes===report.asset.length&&result.reportSha256===report.packet.sha256&&result.assetSha256===report.asset_sha256&&result.bytes===report.asset.length,'FUNDING_REPORT_MERCHANT_FILES_CHANGED',undefined,409);
  demand(config.publicOrigin===row.config.origin&&config.routes.length===1&&route.id==='funding_report'&&route.path===row.config.path&&canonical(route.definition)===canonical(row.config.definition)&&route.responseAsset.sha256===report.asset_sha256&&route.responseAsset.contentType==='application/gzip'&&route.responseAsset.downloadName===report.id+'.funding-report.gz','FUNDING_REPORT_MERCHANT_CONFIG_CHANGED',undefined,409);
  return {...result,catalogValue:JSON.parse(bytes)};
}
async function ready(workspace,merchantId) {
  const row=fundingMerchant(workspace,merchantId);
  return prepareFundingMerchant(workspace,{reportId:row.report_id,origin:row.config.origin,path:row.config.path,payment:row.config.payment});
}
export async function prepareFundingMerchant(workspace,input,{signal}={}) {
  demand(plain(input),'FUNDING_REPORT_MERCHANT_OPTIONS_INVALID');
  const report=workspace.fundingReports.record(input.reportId);
  demand(report.status==='published','FUNDING_REPORT_PUBLICATION_REQUIRED','Publish the reviewed complete report before preparing its merchant.',409);
  const config=parameters(input,report),inputSha256=sha(config),merchantId='FM-'+inputSha256.slice(0,48);
  let row=parse(workspace.db.prepare('SELECT * FROM award_funding_report_merchants WHERE id=?').get(merchantId));
  if(row?.result.status==='ready'){
    try{return {id:merchantId,reportId:report.id,...await completed(workspace,row),replayed:true};}
    catch(error){row.result.previousFileError=safeError(error);}
  }
  const controller=new AbortController(),abort=()=>controller.abort(signal.reason);
  signal?.addEventListener('abort',abort,{once:true});if(signal?.aborted)abort();
  let attempt;
  try {
    row=workspace.tx(()=>{
      const current=parse(workspace.db.prepare('SELECT * FROM award_funding_report_merchants WHERE id=?').get(merchantId));
      if(current)demand(current.input_sha256===inputSha256,'FUNDING_REPORT_MERCHANT_ID_CONFLICT',undefined,409);
      workspace.transactions.idle({id:merchantId,owner:current?.result.owner});
      const attempts=current?.result.attempts??[],directory=join(workspace.directory,'funding-merchants',merchantId,'attempt-'+randomUUID());
      attempt={directory,startedAt:now(),status:'preparing'};
      const result={status:'preparing',owner:{pid:process.pid,processIdentity:workspace.identity,instance:workspace.instance},
        attempts:[...attempts,attempt],...(row?.result.previousFileError?{previousFileError:row.result.previousFileError}:{})};
      if(current)workspace.db.prepare('UPDATE award_funding_report_merchants SET result=? WHERE id=?').run(canonical(result),merchantId);
      else workspace.db.prepare('INSERT INTO award_funding_report_merchants VALUES(?,?,?,?,?,?)').run(merchantId,report.id,now(),inputSha256,canonical(config),canonical(result));
      workspace.operation('funding_report_merchant_preparing',merchantId,{reportId:report.id,reportSha256:report.packet.sha256,assetSha256:report.asset_sha256,attempt:directory});
      return {config,result};
    });
    workspace.active.set(merchantId,controller);controller.signal.throwIfAborted();
    await mkdir(attempt.directory,{recursive:true,mode:0o700});
    const asset=join(attempt.directory,'report.funding-report.gz');
    await writeFile(asset,report.asset,{flag:'wx',mode:0o600});
    controller.signal.throwIfAborted();
    const seller={schema:'stellar-forge.seller-service.v1',publicOrigin:config.origin,maxResponseBytes:Math.max(1024*1024,report.asset.length),assetBudgetBytes:Math.max(1024*1024,report.asset.length),
      routes:[{id:'funding_report',path:config.path,definition:config.definition,responseAsset:{file:asset,sha256:report.asset_sha256,contentType:'application/gzip',downloadName:report.id+'.funding-report.gz'}}]};
    const bundle=join(attempt.directory,'merchant'),prepared=await createAssetBundle(seller,{out:bundle}),catalog=join(attempt.directory,'catalog.json');
    controller.signal.throwIfAborted();
    const catalogResult=await exportAssetCatalog(bundle,catalog),checked=await verifyAssetBundle(bundle);
    const catalogBytes=await readFile(catalog);demand(sha(catalogBytes)===catalogResult.catalogSha256,'FUNDING_REPORT_CATALOG_CHANGED');
    controller.signal.throwIfAborted();
    const result={status:'ready',owner:null,attempts:row.result.attempts.map(a=>a.directory===attempt.directory?{...a,status:'ready',completedAt:now()}:a),
      bundle,catalog,configSha256:checked.configSha256,catalogSha256:catalogResult.catalogSha256,bytes:report.asset.length,assetSha256:report.asset_sha256,
      reportSha256:report.packet.sha256,url:config.origin+config.path,...(row.result.previousFileError?{previousFileError:row.result.previousFileError}:{})};
    workspace.tx(()=>{
      workspace.db.prepare('UPDATE award_funding_report_merchants SET result=? WHERE id=?').run(canonical(result),merchantId);
      workspace.operation('funding_report_merchant_ready',merchantId,{reportId:report.id,catalogSha256:result.catalogSha256,configSha256:result.configSha256,assetSha256:result.assetSha256});
    });
    return {id:merchantId,reportId:report.id,...result,catalogValue:JSON.parse(catalogBytes),replayed:false};
  } catch(error) {
    if(attempt)workspace.tx(()=>{
      const current=fundingMerchant(workspace,merchantId),result={...current.result,status:'interrupted',owner:null,error:safeError(error),
        attempts:current.result.attempts.map(a=>a.directory===attempt.directory?{...a,status:'interrupted',endedAt:now(),error:safeError(error)}:a)};
      workspace.db.prepare('UPDATE award_funding_report_merchants SET result=? WHERE id=?').run(canonical(result),merchantId);
      workspace.operation('funding_report_merchant_interrupted',merchantId,safeError(error));
    });
    throw error;
  } finally {signal?.removeEventListener('abort',abort);if(workspace.active.get(merchantId)===controller)workspace.active.delete(merchantId);}
}
export async function fundingMerchantCatalog(workspace,merchantId) {
  const result=await ready(workspace,merchantId);
  return {id:result.id,reportId:result.reportId,sha256:result.catalogSha256,catalog:result.catalogValue};
}
export async function serveFundingMerchant(workspace,merchantId,{port=8423,facilitator,allowLocalFacilitator=false,nativeFactory=null,availabilityDirectory}={}) {
  const prepared=await ready(workspace,merchantId),config=await readSellerConfig(join(prepared.bundle,'seller.json'));
  demand(!nativeFactory||!facilitator,'ONE_NATIVE_FACTORY_REQUIRED');
  if(facilitator){
    const endpoint=new URL(facilitator);
    demand(!endpoint.username&&!endpoint.password&&!endpoint.hash&&!endpoint.search&&(endpoint.protocol==='https:'||allowLocalFacilitator&&endpoint.protocol==='http:'&&endpoint.hostname==='127.0.0.1'),'FACILITATOR_URL_INVALID');
    const [{HTTPFacilitatorClient},{createNativeSellerServer}]=await Promise.all([import('@x402/core/server'),import('../../native-factory.mjs')]);
    nativeFactory=compiled=>createNativeSellerServer(compiled,{facilitatorClient:new HTTPFacilitatorClient({url:endpoint.href.replace(/\/$/,'')})});
  }
  const session=await startSellerService({config,port,nativeFactory,availabilityDirectory});
  return Object.assign(session,{merchantId:prepared.id,reportId:prepared.reportId,reportSha256:prepared.reportSha256,assetSha256:prepared.assetSha256});
}
