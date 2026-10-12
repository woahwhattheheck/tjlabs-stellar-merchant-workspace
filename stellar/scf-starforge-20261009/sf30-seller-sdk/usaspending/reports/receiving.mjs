// MIT. Receive the original SF88 file and reopen the complete editable report.
import {mkdir,lstat,realpath,open,readFile,link,unlink,readdir} from 'node:fs/promises';
import {resolve,join,dirname,relative,isAbsolute,sep} from 'node:path';
import {randomUUID} from 'node:crypto';
import {canonical,sha,plain,now} from '../core.mjs';
import {demand} from '../transactions/core.mjs';
import {fundingDeliveryFiles} from './core.mjs';
import {MAX_ASSET_BYTES} from '../../response-asset.mjs';
import {readSource} from '../../../sf88-operator-buyer-cli/resource-library/source.mjs';
import {verifyFile,directory,readSnapshot} from '../../../sf88-operator-buyer-cli/resource-library/files.mjs';
const same=(a,b)=>canonical(a)===canonical(b);
export async function receiveFundingFile(workspace,file,{expectedSha256}={}) {
  return workspace.fundingReports.receive(await readSnapshot(resolve(file),MAX_ASSET_BYTES),{expectedSha256});
}
export async function adoptFundingBuyer(workspace,{inbox,intentId,receivingRoot},{signal}={}) {
  demand(typeof intentId==='string'&&intentId.length>0&&typeof inbox==='string','FUNDING_REPORT_BUYER_SELECTION_REQUIRED');
  const root=await directory(resolve(receivingRoot)),source=await readSource({kind:'inbox',source:resolve(inbox)});
  const matches=source.resources.filter(r=>r.intentId===intentId);
  demand(matches.length===1,'FUNDING_REPORT_BUYER_RESPONSE_REQUIRED','Select one original buyer intent with a completed response file.',409);
  const original=matches[0],verified=await verifyFile(original,{roots:[root],maxFileBytes:MAX_ASSET_BYTES,indexBytes:0,tempRoot:workspace.directory,spool:true,signal});
  try {
    signal?.throwIfAborted();
    // Read the SAME verified descriptor. Its file position is independent of the
    // explicit-position writes used by the original response-file verifier.
    const bytes=await verified.file.readFile();
    demand(bytes.length===verified.bytes&&sha(bytes)===verified.sha256,'FUNDING_REPORT_BUYER_BYTES_CHANGED');
    return workspace.fundingReports.receive(bytes,{expectedSha256:verified.sha256,receipt:{kind:'original_buyer_response',
      intentId:original.intentId,inboxId:original.inboxId,configSha256:original.configSha256,sourceSha256:source.details.sourceSha256,
      buyerStatus:original.buyerStatus,httpStatus:original.httpStatus,paymentTerms:original.paymentTerms,url:original.url,method:original.method}});
  } finally {await verified.dispose();}
}
async function privateDirectory(path,{create=false}={}) {
  if(create)await mkdir(path,{recursive:true,mode:0o700});
  const st=await lstat(path);
  demand(st.isDirectory()&&!st.isSymbolicLink()&&await realpath(path)===path,'FUNDING_REPORT_RECEIVING_DIRECTORY_INVALID');
  demand(process.platform==='win32'||((st.mode&0o077)===0&&(typeof process.getuid!=='function'||st.uid===process.getuid())),'FUNDING_REPORT_PRIVATE_DIRECTORY_REQUIRED');
}
async function originalFile(path,bytes) {
  try {const current=await readSnapshot(path,Math.max(bytes.length,1));demand(current.length===bytes.length&&sha(current)===sha(bytes),'FUNDING_REPORT_RECEIVING_FILE_CHANGED','Keep the existing file and select a new receiving directory.',409);return false;}
  catch(error){if(error.code!=='ENOENT')throw error;}
  const tmp=join(dirname(path),'.funding-'+randomUUID()),f=await open(tmp,'wx',0o600);
  try {await f.writeFile(bytes);await f.sync();} finally {await f.close();}
  try {
    try {await link(tmp,path);}
    catch(error){if(error.code!=='EEXIST')throw error;const prior=await readSnapshot(path,Math.max(bytes.length,1));demand(prior.length===bytes.length&&sha(prior)===sha(bytes),'FUNDING_REPORT_RECEIVING_FILE_CHANGED',undefined,409);}
  } finally {await unlink(tmp).catch(()=>{});}
  return true;
}
/** Missing files in this exact retained selection are recovered. Existing files
 * are read and preserved; completion is the last atomically published file. */
export async function extractFundingReport(workspace,{reportId,directory:target,deliveryId},{receivingRoot}={}) {
  demand(typeof target==='string'&&target.trim(),'FUNDING_REPORT_RECEIVING_DIRECTORY_REQUIRED');
  target=resolve(target);
  if(receivingRoot){
    const root=await directory(resolve(receivingRoot)),part=relative(root,target);
    demand(part&&part!=='..'&&!part.startsWith('..'+sep)&&!isAbsolute(part),'FUNDING_REPORT_RECEIVING_OUTSIDE_ROOT',undefined,403);
  }
  const row=workspace.fundingReports.record(reportId),asset=workspace.fundingReports.export(reportId,{kind:'delivery',deliveryId});
  const files=fundingDeliveryFiles(row.packet).map(f=>({name:f.name,bytes:Buffer.from(f.contentBase64,'base64'),sha256:f.sha256}));
  files.push({name:row.id+'.funding-report.gz',bytes:asset,sha256:sha(asset)});
  const selection={schema:'stellar-forge.usaspending-funding-report.receiving.v1',reportId:row.id,reportSha256:row.packet.sha256,
    assetSha256:sha(asset),deliveryId:deliveryId??null,files:files.map(f=>({name:f.name,bytes:f.bytes.length,sha256:f.sha256}))};
  let made=false;
  try{await mkdir(target,{mode:0o700});made=true;}catch(error){if(error.code!=='EEXIST')throw error;}
  await privateDirectory(target);
  const plan=join(target,'receiving-selection.json'),planBytes=Buffer.from(JSON.stringify(selection,null,2)+'\n');
  if(!made){
    try {demand(same(JSON.parse(await readSnapshot(plan,1024*1024)),selection),'FUNDING_REPORT_RECEIVING_SELECTION_CHANGED',undefined,409);}
    catch(error){if(error.code!=='ENOENT')throw error;demand((await readdir(target)).length===0,'FUNDING_REPORT_RECEIVING_DIRECTORY_IN_USE',undefined,409);}
  }
  await originalFile(plan,planBytes);
  for(const file of files){
    demand(/^[A-Za-z0-9._/-]+$/.test(file.name)&&!file.name.startsWith('/')&&!file.name.split('/').some(p=>!p||p==='.'||p==='..'),'FUNDING_REPORT_RECEIVING_PATH_INVALID');
    const path=join(target,file.name);
    await privateDirectory(dirname(path),{create:true});await originalFile(path,file.bytes);
  }
  const completion={...selection,selectionSha256:sha(planBytes)},created=await originalFile(join(target,'receiving-complete.json'),Buffer.from(JSON.stringify(completion,null,2)+'\n'));
  if(created)workspace.operation('funding_report_files_received',row.id,{directory:target,reportSha256:row.packet.sha256,assetSha256:selection.assetSha256,files:files.length});
  return {reportId:row.id,directory:target,report:join(target,'report.html'),originalFile:join(target,row.id+'.funding-report.gz'),files:files.length,
    reportSha256:row.packet.sha256,assetSha256:selection.assetSha256,replayed:!created};
}
