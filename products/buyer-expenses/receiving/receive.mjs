// Complete receiving of the original F232 financial project through selected original source.
import { readFile, writeFile, mkdir } from 'node:fs/promises';
import { join, resolve } from 'node:path';
import { pathToFileURL } from 'node:url';
import { randomBytes, createHash } from 'node:crypto';

const input=JSON.parse(await readFile(process.argv[2],'utf8'));
const root=resolve(input.directory), source=resolve(input.sourceRoot), log=join(root,'operation.json');
const record={schema:'stellar-forge.buyer-finance-selected-receiving.v1',operation:input.operation,
 sourceCommit:input.sourceCommit,originalCase:input.originalCase.operation,
 originalProjectSha256:input.originalProjectSha256,startedAt:new Date().toISOString(),phases:[]};
await mkdir(root,{recursive:true,mode:0o700});
async function save(){await writeFile(log,JSON.stringify(record,null,2)+'\n',{mode:0o600});}
async function phase(name,fn){record.currentPhase=name;await save();const value=await fn();record.phases.push({name,at:new Date().toISOString(),value});await save();return value;}
function need(value,message){if(!value)throw new Error(message);}
const importOriginal=path=>import(pathToFileURL(join(source,path)).href);
const {initializeBuyerExpenseMerchant}=await importOriginal('stellar-forge/mcp-merchant-operator/config.mjs');
const {startMerchantMcp}=await importOriginal('stellar-forge/mcp-merchant-operator/serve.mjs');
const {openBuyerExpenseClient,receiveBuyerExpenseProject,inspectBuyerExpenseExport,downloadBuyerExpenseExport}=
 await importOriginal('stellar-forge/mcp-merchant-operator/buyer-expense-client.mjs');
const original=input.originalCase.original,expected=input.originalCase.receiving;
const received=join(root,'received'),restored=join(root,'restored'),connection=join(root,'connection.json');
let session=null;
const tokenEnv='BUYER_FINANCE_RECEIVING_TOKEN';
process.env[tokenEnv]=randomBytes(32).toString('hex');
try{
 const receipt=await phase('receive-original-project',()=>receiveBuyerExpenseProject({
  archive:input.originalProject,directory:received,expectedSha256:input.originalProjectSha256}));
 need(receipt.workspace===original.workspaceId&&receipt.revision===expected.revision,'Original project identity/revision changed');
 need(receipt.successful_requests===expected.successful_requests,'Original successful requests changed');
 need(receipt.accountant_return_count===expected.accountant_return_count,'Original accountant returns changed');
 await writeFile(connection,JSON.stringify({schema:'stellar-forge.buyer-expense-connection.v1',workspaces:{
  original:{directory:join(received,'project'),python:'python3'},restored:{directory:join(restored,'project'),python:'python3'}
 }},null,2)+'\n',{mode:0o600});
 const initialized=await phase('initialize-selected-merchant',()=>initializeBuyerExpenseMerchant({
  directory:join(root,'merchant'),connection,name:'Original governed buyer finance receiving'}));
 session=await startMerchantMcp({configPath:initialized.configuration,port:0,tokenEnv});
 const endpoint=session.url+'/mcp';record.endpoint=endpoint;await save();
 let client=await openBuyerExpenseClient({url:endpoint,tokenEnv});
 const opened=await phase('open-original-expenses',()=>client.open({workspace:'original'}));
 const state=await phase('read-original-financial-state',()=>client.state({workspace:'original'}));
 need(state.id===original.workspaceId&&state.revision===expected.revision,'Opened native financial state changed');
 const history=await phase('read-original-request-history',()=>client.history({workspace:'original',kind:'requests',offset:0,limit:200}));
 need(history.total===expected.successful_requests,'Native original request history changed');
 await phase('read-original-periods',()=>client.state({workspace:'original',view:'periods',offset:0,limit:200}));
 await phase('read-original-issued-edition',()=>client.issued({workspace:'original',id:original.closeId,view:'allocations',offset:0,limit:200}));
 await phase('read-original-accountant-returns',()=>client.accountantReturns({workspace:'original',closeId:original.closeId,offset:0,limit:200}));
 await phase('read-original-accountant-return',()=>client.accountantReturn({workspace:'original',id:original.accountantReturnId,view:'rows',offset:0,limit:200}));
 const exportId='buyer-finance-selected-project-6200-20261012';
 const exported=await phase('export-original-complete-project',()=>client.export({
  workspace:'original',exportId,kind:'project',expectedRevision:state.revision}));
 need(exported.state==='COMPLETE'&&exported.manifest.workspaceId===original.workspaceId,'Complete project export changed identity');
 const inspected=await phase('inspect-original-project-export',()=>inspectBuyerExpenseExport({url:endpoint,tokenEnv,exportId}));
 need(inspected.manifestSha256===exported.manifestSha256,'Original manifest inspection changed');
 const directory=join(root,'download');
 await phase('download-original-complete-project',()=>downloadBuyerExpenseExport({url:endpoint,tokenEnv,exportId,directory,
  expectedManifestSha256:exported.manifestSha256,chunkSize:65536}));
 const file=exported.manifest.files[0],downloaded=join(directory,file.name),bytes=await readFile(downloaded);
 need(bytes.length===file.bytes&&createHash('sha256').update(bytes).digest('hex')===file.sha256,'Downloaded original project differs');
 record.finalProject={path:downloaded,bytes:file.bytes,sha256:file.sha256,manifestSha256:exported.manifestSha256};
 await phase('close-original-expenses',()=>client.close({workspace:'original',instanceId:opened.instanceId}));
 const second=await phase('receive-selected-source-project',()=>receiveBuyerExpenseProject({
  archive:downloaded,directory:restored,expectedSha256:file.sha256}));
 need(second.workspace===original.workspaceId&&second.revision===state.revision,'Selected project receive changed original identity');
 need(second.successful_requests===expected.successful_requests&&second.accountant_return_count===expected.accountant_return_count,
  'Selected project receive changed original requests or accountant returns');
 await phase('open-received-expenses',()=>client.open({workspace:'restored'}));
 const reopened=await phase('read-received-financial-state',()=>client.state({workspace:'restored'}));
 need(reopened.id===state.id&&reopened.revision===state.revision,'Received original financial state changed');
 await phase('drain-original-merchant',async()=>{await session.close();session=null;return {closed:true};});
 session=await startMerchantMcp({configPath:initialized.configuration,port:0,tokenEnv});
 client=await openBuyerExpenseClient({url:session.url+'/mcp',tokenEnv});
 await phase('reopen-after-merchant-restart',()=>client.open({workspace:'restored'}));
 const final=await phase('read-retained-restart-state',()=>client.state({workspace:'restored'}));
 need(final.id===state.id&&final.revision===state.revision,'Restart changed original financial identity');
 const finalHistory=await phase('read-retained-restart-requests',()=>client.history({workspace:'restored',kind:'requests',offset:0,limit:200}));
 need(finalHistory.total===expected.successful_requests,'Restart changed original request history');
 await phase('read-retained-accountant-return',()=>client.accountantReturn({workspace:'restored',id:original.accountantReturnId,view:'rows',offset:0,limit:200}));
 await phase('complete-original-drain',async()=>{await session.close();session=null;return {closed:true};});
 record.outcome='PASS';record.completedAt=new Date().toISOString();record.workspaceId=state.id;record.revision=state.revision;
 record.successfulRequests=expected.successful_requests;record.accountantReturns=expected.accountant_return_count;
 await save();console.log(JSON.stringify(record));
}catch(error){
 record.outcome='FAILED';record.error={code:error.code??error.name,message:error.message};record.failedAt=new Date().toISOString();
 await save();throw error;
}finally{
 if(session)await session.close();delete process.env[tokenEnv];
}
