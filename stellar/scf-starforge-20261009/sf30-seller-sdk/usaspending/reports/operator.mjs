// MIT. Funding-report delivery on the original private award HTTP and CLI owner.
import {resolve,join,basename} from 'node:path';
import {mkdir} from 'node:fs/promises';
import {plain,requireThat} from '../core.mjs';
import {MAX_ASSET_BYTES} from '../../response-asset.mjs';
import {prepareFundingMerchant,fundingMerchantCatalog,serveFundingMerchant} from './merchant.mjs';
import {receiveFundingFile,adoptFundingBuyer,extractFundingReport} from './receiving.mjs';

export const FUNDING_REPORT_HELP=[
'Funding reports use the original reviewed award transaction source:',
'  report-state',
'  report-prepare --file REPORT_REQUEST.json',
'  report-draft --report ID [--out FILE]',
'  report-publish --report ID --sha256 REVIEWED_REPORT_SHA256',
'  report-export --report ID --kind delivery|json|html|csv --out FILE [--delivery ID]',
'  report-receive --file ORIGINAL.funding-report.gz [--sha256 ORIGINAL_FILE_SHA256]',
'  report-adopt-buyer --inbox ORIGINAL_SF88_INBOX --intent ORIGINAL_INTENT --receiving-root DIRECTORY',
'  report-extract --report ID --directory PRIVATE_OUTPUT [--delivery ID]',
'  report-merchant-prepare --file MERCHANT_REQUEST.json',
'  report-merchant-catalog --merchant ID [--out FILE]',
'  report-merchant-serve --merchant ID [--port 8423 --facilitator HTTPS_URL]',
'    [--allow-local-facilitator --availability-dir DIRECTORY]',
'',
].join('\n');
const formats={delivery:{type:'application/gzip',ext:'funding-report.gz'},json:{type:'application/json; charset=utf-8',ext:'json'},html:{type:'text/html; charset=utf-8',ext:'html'},csv:{type:'text/csv; charset=utf-8',ext:'csv'}};
function fields(input,allowed){requireThat(plain(input)&&Object.keys(input).every(k=>allowed.includes(k)),'FUNDING_REPORT_OPTIONS_INVALID');}
function originalUpload(body){
  requireThat(typeof body.contentBase64==='string'&&body.contentBase64.length>0&&body.contentBase64.length<=Math.ceil(MAX_ASSET_BYTES/3)*4&&/^[A-Za-z0-9+/]*={0,2}$/.test(body.contentBase64),'FUNDING_REPORT_UPLOAD_INVALID');
  const bytes=Buffer.from(body.contentBase64,'base64');
  requireThat(bytes.toString('base64')===body.contentBase64,'FUNDING_REPORT_UPLOAD_INVALID');return bytes;
}
export async function fundingReportGet(workspace,url) {
  const q=url.searchParams,path=url.pathname,model=workspace.fundingReports;
  if(path==='/api/funding-reports/state')return {value:model.state()};
  if(path==='/api/funding-reports/draft')return {value:model.draft(q.get('report'))};
  if(path==='/api/funding-reports/catalog'){
    const result=await fundingMerchantCatalog(workspace,q.get('merchant'));
    return {value:result.catalog,options:{filename:result.id+'-catalog.json'}};
  }
  if(path==='/api/funding-reports/export'){
    const kind=q.get('kind')??'delivery',format=formats[kind];requireThat(format,'FUNDING_REPORT_EXPORT_KIND_INVALID');
    const reportId=q.get('report');
    return {value:model.export(reportId,{kind,deliveryId:q.get('delivery')??undefined}),options:{type:format.type,filename:reportId+'.'+format.ext}};
  }
  throw Object.assign(new Error('Unknown funding-report operation.'),{code:'NOT_FOUND',status:404});
}
export async function fundingReportPost(workspace,path,body,{startJob,receivingRoot}={}) {
  const model=workspace.fundingReports;
  if(path==='/api/funding-reports/prepare')return {value:model.prepare(body)};
  if(path==='/api/funding-reports/publish'){fields(body,['reportId','expectedSha256']);return {value:model.publish(body)};}
  if(path==='/api/funding-reports/receive'){
    fields(body,['contentBase64','expectedSha256']);return {value:model.receive(originalUpload(body),{expectedSha256:body.expectedSha256})};
  }
  if(path==='/api/funding-reports/merchant'){
    fields(body,['reportId','origin','path','payment']);return {status:202,value:startJob('funding_report_merchant',signal=>prepareFundingMerchant(workspace,body,{signal}))};
  }
  if(path==='/api/funding-reports/adopt-buyer'){
    fields(body,['inbox','intentId']);requireThat(receivingRoot,'RECEIVING_ROOT_REQUIRED','Launch this operator with the original buyer receiving root.',409);
    // The inbox path is host-local operator input. Its original saved response
    // must still pass the declared receiving-root and exact native file checks.
    return {status:202,value:startJob('funding_report_buyer_receiving',signal=>adoptFundingBuyer(workspace,{...body,receivingRoot},{signal}))};
  }
  if(path==='/api/funding-reports/extract'){
    fields(body,['reportId','name','deliveryId']);requireThat(typeof body.name==='string'&&body.name===basename(body.name)&&/^[A-Za-z0-9][A-Za-z0-9._-]{0,127}$/.test(body.name),'FUNDING_REPORT_RECEIVING_NAME_INVALID');
    const root=receivingRoot??join(workspace.directory,'funding-receiving');await mkdir(root,{recursive:true,mode:0o700});
    return {status:202,value:startJob('funding_report_files_receiving',()=>extractFundingReport(workspace,{reportId:body.reportId,directory:join(root,body.name),deliveryId:body.deliveryId},{receivingRoot:root}))};
  }
  throw Object.assign(new Error('Unknown funding-report operation.'),{code:'NOT_FOUND',status:404});
}
export async function fundingReportCommand(workspace,o,{only,need,json,output,signal}) {
  const model=workspace.fundingReports;
  switch(o.command){
    case 'report-state':only(o,[]);return model.state();
    case 'report-prepare':only(o,['file']);return model.prepare(await json(need(o,'file'),128*1024));
    case 'report-draft':only(o,['report','out']);return output(o,model.draft(need(o,'report')));
    case 'report-publish':only(o,['report','sha256']);return model.publish({reportId:need(o,'report'),expectedSha256:need(o,'sha256')});
    case 'report-export':{
      only(o,['report','kind','delivery','out']);need(o,'out');const kind=need(o,'kind');requireThat(formats[kind],'FUNDING_REPORT_EXPORT_KIND_INVALID');
      return output(o,model.export(need(o,'report'),{kind,deliveryId:o.delivery}),{text:kind!=='json'});
    }
    case 'report-receive':only(o,['file','sha256']);return receiveFundingFile(workspace,need(o,'file'),{expectedSha256:o.sha256});
    case 'report-adopt-buyer':only(o,['inbox','intent','receiving-root']);return adoptFundingBuyer(workspace,{inbox:need(o,'inbox'),intentId:need(o,'intent'),receivingRoot:need(o,'receiving-root')},{signal});
    case 'report-extract':only(o,['report','directory','delivery']);return extractFundingReport(workspace,{reportId:need(o,'report'),directory:need(o,'directory'),deliveryId:o.delivery});
    case 'report-merchant-prepare':only(o,['file']);return prepareFundingMerchant(workspace,await json(need(o,'file'),65536),{signal});
    case 'report-merchant-catalog':only(o,['merchant','out']);return output(o,(await fundingMerchantCatalog(workspace,need(o,'merchant'))).catalog);
    default:throw Object.assign(new Error('Unknown report command. Use --help.'),{code:'COMMAND_UNKNOWN'});
  }
}
export {serveFundingMerchant};
