import assert from 'node:assert/strict';
import {mkdir,writeFile,readFile,open,link,unlink} from 'node:fs/promises';
import {join,resolve,dirname,basename} from 'node:path';
import {pathToFileURL} from 'node:url';
import {randomUUID,createHash} from 'node:crypto';
export async function runAcceptedRenewalFinancial({sourceRoot,operationRoot,handoverPath,caseDirectory=null,producerResultPath=null,sourceCommit=null}){
if(!sourceRoot||!operationRoot||!handoverPath)throw new Error('sourceRoot, operationRoot and handoverPath are required');
if(sourceCommit!==null&&!/^[0-9a-f]{40}$/.test(sourceCommit))throw new Error('Use the original source commit SHA');
sourceRoot=resolve(sourceRoot);operationRoot=resolve(operationRoot);handoverPath=resolve(handoverPath);
const load=path=>import(pathToFileURL(join(sourceRoot,path)));
const support='stellar/scf-starforge-20261009/sf74-merchant-support-console/';
const accounting='stellar/scf-starforge-20261009/merchant-settlement-accounting/';
const {openCaseStore}=await load(support+'case-store.mjs');
const {openAccountingWorkspace}=await load(accounting+'workspace/store.mjs');
const {ReceivablesWorkspace}=await load(accounting+'receivables/store.mjs');
const {ServiceAgreementWorkspace}=await load(accounting+'service-agreements/store.mjs');
const {createServiceAgreementsServer}=await load(accounting+'service-agreements/server.mjs');
const {createServiceAgreementClient}=await load(accounting+'service-agreements/client.mjs');
const digest=value=>createHash('sha256').update(value).digest('hex');
const json=value=>JSON.stringify(value,null,2)+'\n';
const save=async(path,value)=>{
 const bytes=Buffer.isBuffer(value)?value:Buffer.from(typeof value==='string'?value:json(value));
 const temporary=join(dirname(path),'.'+basename(path)+'.'+randomUUID()+'.part');
 let handle;
 try{
  handle=await open(temporary,'wx',0o600);await handle.writeFile(bytes);await handle.sync();await handle.close();handle=null;
  await link(temporary,path);
  const directoryHandle=await open(dirname(path),'r');try{await directoryHandle.sync();}finally{await directoryHandle.close();}
 }finally{await handle?.close();await unlink(temporary).catch(error=>{if(error.code!=='ENOENT')throw error;});}
};
function sourceStrKey(version, fill) {
  const bytes = Buffer.alloc(35, fill); bytes[0] = version;
  let crc = 0;
  for (const byte of bytes.subarray(0, 33)) {
    crc ^= byte << 8;
    for (let i = 0; i < 8; i++) crc = ((crc << 1) ^ (crc & 0x8000 ? 0x1021 : 0)) & 65535;
  }
  bytes[33] = crc & 255; bytes[34] = crc >> 8;
  const alphabet = 'ABCDEFGHIJKLMNOPQRSTUVWXYZ234567'; let result = '', bits = 0, acc = 0;
  for (const byte of bytes) {
    acc = (acc << 8) | byte; bits += 8;
    while (bits >= 5) { bits -= 5; result += alphabet[(acc >>> bits) & 31]; }
    acc &= (1 << bits) - 1;
  }
  return result;
}

const financialDirectory=join(operationRoot,'operated-accounting'),
  exportDirectory=join(operationRoot,'agreement-export'),outboxDir=join(operationRoot,'outbox'),
  proofDir=join(operationRoot,'proofs'),termsFile=join(operationRoot,'accounting-terms.json');
await mkdir(operationRoot,{mode:0o700});
for(const d of [exportDirectory,outboxDir,proofDir])await mkdir(d,{mode:0o700});
const renewalJson=await readFile(handoverPath,'utf8');
const acceptedHandover=JSON.parse(renewalJson),caseId=acceptedHandover.case?.id;
if(!caseId)throw new Error('The original handover must include its saved case identity');
const quoteContent=Buffer.from(acceptedHandover.materials.quote.data,'base64').toString('utf8'),
 responseContent=Buffer.from(acceptedHandover.materials.acceptance.data,'base64').toString('utf8');
const producerOutcome=producerResultPath?JSON.parse(await readFile(producerResultPath,'utf8')):{caseId,caseRevision:acceptedHandover.case.revision};
await save(join(operationRoot,'accepted-handover.json'),renewalJson);
await save(join(operationRoot,'accepted-quotation.json'),quoteContent);
await save(join(operationRoot,'accepted-response.json'),responseContent);
if(caseDirectory){
 caseDirectory=resolve(caseDirectory);
 const caseStore=await openCaseStore(caseDirectory);
 await save(join(operationRoot,'operated-case-export.json'),await caseStore.read(caseId));
}
await save(join(operationRoot,'producer-result.json'),producerOutcome);
await save(join(operationRoot,'source-inputs.json'),{sourceRoot,sourceCommit,handoverPath,caseDirectory,producerResultPath,acceptedHandoverSha256:digest(renewalJson)});
await save(termsFile,{schema:'stellar-forge.merchant-accounting-terms.v1',routes:[{
  routeId:'native-renewal',method:'GET',network:'stellar:testnet',asset:sourceStrKey(16,1),payTo:sourceStrKey(48,2),
  amountAtomic:'1000000',unitPriceUsd:'1',unitCostUsd:null,priceBasis:'Original native receiving workspace'
}]});
let workspace=await openAccountingWorkspace({directory:financialDirectory,outboxDir,proofDir,termsFile}),running;
try{
 const receivables=await new ReceivablesWorkspace(workspace).init();
 const agreements=await new ServiceAgreementWorkspace(workspace,{receivables}).init();
 const actor='Native accepted renewal operator';
 const request=value=>({revision:workspace.state.revision,actor,requestId:randomUUID(),...value});
 const customerRequest={revision:workspace.state.revision,actor,reference:'C12-ACCEPTED-RENEWAL',
   name:'Native Journey Merchant',email:'',address:'Original native operating workspace',note:'Retained operational service renewal'};
 await save(join(operationRoot,'request-customer.json'),customerRequest);
 const customer=(await receivables.saveCustomer(customerRequest)).customer;
 const settingsRequest=request({name:'Native service agreement merchant',invoicePrefix:'RN',creditPrefix:'CR'});
 await save(join(operationRoot,'request-settings.json'),settingsRequest);
 await receivables.settings(settingsRequest);
 const createRequest=request({reference:'C12-2026-11',title:'Accepted operational service continuation',customerId:customer.id,
   startDate:'2026-11-01',termMonths:3,billingMonths:1,invoiceTiming:'START',dueDays:30,currencyScale:2,
   quoteContent,responseContent,renewalJson});
 await save(join(operationRoot,'request-agreement-create.json'),createRequest);
 const created=await agreements.create(createRequest),agreementId=created.agreementId;
 const replayRequest={...createRequest,revision:workspace.state.revision};
 await save(join(operationRoot,'request-agreement-replay.json'),replayRequest);
 const replayed=await agreements.create(replayRequest);
 assert.equal(replayed.agreementId,agreementId);
 assert.deepEqual(created.agreement.periods.map(row=>[row.startDate,row.endDate,row.amount]),
   [['2026-11-01','2026-12-01','125.00'],['2026-12-01','2027-01-01','125.00'],['2027-01-01','2027-02-01','125.00']]);
 let assignmentError;
 const duplicateRequest=request({...createRequest,revision:workspace.state.revision,requestId:randomUUID(),reference:'C12-SECOND-CALENDAR'});
 await save(join(operationRoot,'request-duplicate-calendar.json'),duplicateRequest);
 try{await agreements.create(duplicateRequest);}
 catch(error){assignmentError=error;}
 assert.equal(assignmentError?.code,'AGREEMENT_RENEWAL_ALREADY_ASSIGNED');
 assert.equal(assignmentError.details.agreementId,agreementId);
 const preview=await agreements.preview(agreementId,{periodId:'p-0-1',asOf:'2026-11-01'});
 const billRequest=request({expectedVersion:preview.agreementVersion,
   periodId:preview.period.id,previewSha256:preview.previewSha256});
 await save(join(operationRoot,'agreement-billing-preview.json'),preview);
 await save(join(operationRoot,'request-agreement-bill.json'),billRequest);
 const bill=await agreements.bill(agreementId,billRequest);
 const invoicePreview=await receivables.preview(bill.invoice.id);
 const issueRequest=request({expectedVersion:invoicePreview.expectedVersion,
   previewSha256:invoicePreview.previewSha256});
 await save(join(operationRoot,'invoice-preview.json'),invoicePreview);
 await save(join(operationRoot,'request-invoice-issue.json'),issueRequest);
 const issued=await receivables.issue(bill.invoice.id,issueRequest);
 const detail=await agreements.detail(agreementId,{asOf:'2026-11-01'});
 const sourceId=detail.agreement.editions[0].sourceId;
 const originalRenewal=await agreements.sourceFile(agreementId,sourceId,'renewal.json');
 assert.equal(originalRenewal.bytes.toString('utf8'),renewalJson);
 assert.deepEqual(detail.agreement.editions[0].renewal.acceptedHead,acceptedHandover.acceptedHead);
 assert.deepEqual(detail.agreement.editions[0].renewal.servicePeriod,{
   effectiveFrom:'2026-11-01T00:00:00.000Z',effectiveUntil:'2027-02-01T00:00:00.000Z'});
 const exported=await agreements.exportAgreement(agreementId,{asOf:'2026-11-01'});
 for(const file of exported.files){assert(!/[\\/]/.test(file.name));await save(join(exportDirectory,file.name),file.bytes);}
 await save(join(operationRoot,'financial-agreement-detail.json'),detail);
 await workspace.close();workspace=null;
 running=await createServiceAgreementsServer({directory:financialDirectory,port:0});
 const client=createServiceAgreementClient({baseUrl:new URL('/api/service-agreements',running.url).href,fetch});
 const reopened=await client.detail(agreementId,{asOf:'2026-11-01'});
 assert.equal(reopened.workspaceId,detail.workspaceId);assert.equal(reopened.agreement.id,agreementId);
 const download=await fetch(new URL('/api/service-agreements/agreements/'+agreementId+'/export?format=tar&asOf=2026-11-01',running.url));
 assert.equal(download.status,200);
 const tar=Buffer.from(await download.arrayBuffer());await save(join(operationRoot,'accepted-service-agreement.tar'),tar);
 const result={schema:'stellar-forge.accepted-service-renewal-native-result.v1',operation:'SCF-SERVICE-AGREEMENTS-84DF-20261012',
   sourceCommit,result:'complete',node:process.version,
   caseId,caseRevision:producerOutcome.caseRevision,agreementId,workspaceId:detail.workspaceId,
   acceptedHead:acceptedHandover.acceptedHead,servicePeriod:detail.agreement.editions[0].renewal.servicePeriod,
   periodAmounts:reopened.periods.map(row=>({id:row.id,startDate:row.startDate,endDate:row.endDate,amount:row.amount,status:row.status})),
   invoiceId:issued.invoice.id,invoiceNumber:issued.invoice.number,invoiceStatus:issued.invoice.status,
   originalRenewalSha256:digest(renewalJson),sourceFileCount:exported.files.filter(file=>file.name.startsWith('source-'+sourceId+'-')).length,
   exportFiles:exported.files.length,exportTarBytes:tar.length,exportTarSha256:digest(tar),
   duplicateCalendar:{code:assignmentError.code,originalAgreementId:assignmentError.details.agreementId},
   artifacts:{caseDirectory,financialDirectory,exportDirectory,archive:join(operationRoot,'accepted-service-agreement.tar')}};
 await save(join(operationRoot,'native-result.json'),result);
 process.stdout.write(JSON.stringify({phase:'accepted-renewal-native-complete',...result})+'\n');
 return result;
}finally{if(running)await running.close();if(workspace)await workspace.close();}

}

if(process.argv[1]&&import.meta.url===pathToFileURL(resolve(process.argv[1])).href){
 const [sourceRoot,operationRoot,handoverPath,caseDirectory,producerResultPath,sourceCommit]=process.argv.slice(2);
 await runAcceptedRenewalFinancial({sourceRoot,operationRoot,handoverPath,caseDirectory,producerResultPath,sourceCommit});
}
