#!/usr/bin/env node
// MIT. TokenJunkieLabs. Reopen the retained original customer workspace on its existing loopback endpoint.
import {createServer} from 'node:http';
import {resolve,dirname} from 'node:path';
import {pathToFileURL} from 'node:url';
import {readDurableCaseInput} from './durable-customer-case.mjs';
import {MerchantAccounting,normalizeAccountingConfig} from '../../stellar-forge/mcp-merchant-operator/accounting.mjs';
import {accountingTools} from '../../stellar-forge/mcp-merchant-operator/catalog/accounting.mjs';
import {withMerchantOperationErrors} from '../../stellar-forge/mcp-merchant-operator/operation-error.mjs';
import {withServiceAgreementToolErrors} from '../../stellar-forge/mcp-merchant-operator/service-agreements-errors.mjs';
import {createMcpToolHandler} from '../../stellar-forge/mcp-paid-agent/http-tools.mjs';
export async function serveRetainedCustomerCase({handover,environment=process.env}={}){
  const path=resolve(handover),saved=await readDurableCaseInput(path,16_000_000);
  if(saved.schema!=='stellar-forge.receivables-retained-customer-handover.v1'||
    !/^[a-f0-9]{64}$/.test(saved.workspaceId??'')||!saved.hostConfig||!saved.workspace)
    throw new Error('Select the original retained customer handover with its committed workspace identity.');
  const endpoint=new URL(saved.url),token=environment[saved.tokenEnv];
  if(endpoint.protocol!=='http:'||endpoint.hostname!=='127.0.0.1'||endpoint.pathname!=='/mcp'||
    endpoint.username||endpoint.password||endpoint.search||endpoint.hash||!endpoint.port)
    throw new Error('Reopen the exact original loopback MCP endpoint.');
  if(typeof token!=='string'||token.length<24||/[^\x21-\x7e]/.test(token))
    throw new Error('Configure the retained bearer-token environment variable with a current secret of at least24 printable characters.');
  const raw=await readDurableCaseInput(resolve(saved.hostConfig),1_000_000);
  const accounting=normalizeAccountingConfig(raw,dirname(saved.hostConfig)),host=new MerchantAccounting({accounting},{environment});
  let server;
  try{
    await host.call('merchant_accounting_open',{workspace:saved.workspace});
    const current=await host.call('merchant_accounting_receivables_status',{workspace:saved.workspace,
      customerId:saved.customerId,asOf:saved.accountDate});
    if(current.workspaceId!==saved.workspaceId)throw new Error('The retained host configuration belongs to a different original workspace.');
    const tools=accountingTools((name,description,properties,required,annotations)=>
      ({name,description,inputSchema:{type:'object',properties,required,additionalProperties:false},annotations}));
    const handler=createMcpToolHandler({tools,call:(name,args)=>host.call(name,args)},
      {bearerToken:token,serverName:'merchant-retained-customer-case',instructions:'Continue the retained original merchant customer workspace.',
        maxRequestBytes:32*1024*1024,toolErrorView:withServiceAgreementToolErrors(withMerchantOperationErrors(()=>({})))});
    server=createServer(handler);
    await new Promise((done,reject)=>{server.once('error',reject);server.listen(Number(endpoint.port),'127.0.0.1',()=>{
      server.off('error',reject);done();});});
    let closing;
    const close=()=>closing??=(async()=>{await new Promise(done=>server.close(done));await host.close();})();
    return{url:endpoint.href,workspace:saved.workspace,workspaceId:current.workspaceId,revision:current.revision,
      caseDirectory:saved.caseDirectory,close};
  }catch(error){if(server)await new Promise(done=>server.close(()=>done()));await host.close().catch(()=>{});throw error;}
}
export async function main(args=process.argv.slice(2)){
  if(args.length===1&&args[0]==='--help'){process.stdout.write('serve-retained-customer-case.mjs --handover ORIGINAL_PRIVATE_RETENTION_JSON\n');return;}
  if(args.length!==2||args[0]!=='--handover')throw new Error('Supply --handover and the original retained private JSON file.');
  const running=await serveRetainedCustomerCase({handover:args[1]});
  process.stdout.write(JSON.stringify({status:'READY',...Object.fromEntries(Object.entries(running).filter(([key])=>key!=='close'))},null,2)+'\n');
  await new Promise((done,reject)=>{let closing=false;const stop=()=>{if(closing)return;closing=true;
    running.close().then(done,reject);};process.once('SIGINT',stop);process.once('SIGTERM',stop);});
}
if(process.argv[1]&&import.meta.url===pathToFileURL(resolve(process.argv[1])).href)main().catch(error=>{
  process.stderr.write(JSON.stringify({code:error.code??'ERROR',message:error.message})+'\n');process.exitCode=2;
});
