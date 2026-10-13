// MIT. Explicit private configuration for the original company SQLite workspace.
// Select this module as adapterModule in the invoice SDP desk configuration.
import {promises as fs,constants} from 'node:fs';
import path from 'node:path';
import {openBloccpayWorkspace} from '../lib/workspace.mjs';
import {createSDPCompanyTransactions} from '../lib/sdp-sdk-adapter.mjs';
import {invariant,parseSourceJSON} from '../lib/source-json.mjs';

async function privateJSON(file){
 invariant(typeof file==='string'&&path.isAbsolute(file),'ABSOLUTE_PRIVATE_CONFIGURATION_REQUIRED');
 const handle=await fs.open(file,constants.O_RDONLY|constants.O_NOFOLLOW);
 try{
  const stat=await handle.stat();
  invariant(stat.isFile()&&stat.size<=2*1024*1024&&(stat.mode&0o077)===0,'PRIVATE_CONFIGURATION_MODE_REQUIRED');
  return parseSourceJSON(await handle.readFile(),{maxBytes:2*1024*1024}).value;
 }finally{await handle.close();}
}
export async function openTransactions({scope,signal}){
 const selected=await privateJSON(process.env.BLOCCPAY_SDP_ADAPTER_CONFIG);
 invariant(selected.schema==='bloccpay.sdp-sdk-adapter.configuration.v1','SDK_ADAPTER_CONFIGURATION_REQUIRED');
 invariant(path.isAbsolute(selected.workspaceDirectory??'')&&
  typeof selected.expectedWorkspaceId==='string'&&selected.expectedWorkspaceId,'ORIGINAL_COMPANY_WORKSPACE_REQUIRED');
 const original=await fs.lstat(path.join(selected.workspaceDirectory,'workspace.sqlite'));
 invariant(original.isFile()&&!original.isSymbolicLink(),'ORIGINAL_COMPANY_DATABASE_REQUIRED');
 const config=await privateJSON(selected.configurationFile);
 const company=await openBloccpayWorkspace({
  directory:selected.workspaceDirectory,connections:config.connections,name:config.name,
  sourceDirectory:path.resolve(import.meta.dirname,'..'),runtimeDirectory:selected.runtimeDirectory,
  expectedManifestSha256:selected.expectedManifestSha256,
 });
 let transactions=null,closed=false,closePromise=null;
 async function close(){
  if(closed)return;
  if(closePromise)return closePromise;
  const pending=(async()=>{if(transactions)await transactions.close();await company.close();closed=true;})();
  closePromise=pending;
  try{await pending;}catch(error){if(closePromise===pending)closePromise=null;throw error;}
 }
 try{
  invariant(company.describe().workspace.id===selected.expectedWorkspaceId,'ORIGINAL_COMPANY_WORKSPACE_ID_MISMATCH');
  transactions=createSDPCompanyTransactions({
   workspace:company,connectionAlias:selected.connectionAlias,scope,
   programmeVersionId:selected.programmeVersionId,evidence:selected.evidence??{},
   subscriptionId:selected.subscriptionId??null,signal,
  });
  return{...transactions,close};
 }catch(error){
  try{await close();}
  catch(cleanup){error.cleanupError={code:cleanup.code??cleanup.name,message:cleanup.message};error.close=close;}
  throw error;
 }
}
