#!/usr/bin/env node
import {promises as fs} from "node:fs";
import {resolve} from "node:path";
import {pathToFileURL} from "node:url";
import {openInvoiceWorkspace} from "../workspace.mjs";
import {loadInvoiceSettlementConfiguration} from "../operator.mjs";
import {createSDPWorkspace} from "./sdp-workspace.mjs";
import {strictJSON} from "./sdp-native.mjs";
import {SDPContractError} from "./sdp-contract.mjs";
import {normalizeNetwork} from "../../settlement-audit/native-http.mjs";
const help="SDP batch operator\n\nUses an existing invoice workspace and programme version.\nConfiguration: scope, programmeId, programmeVersion, connectionAlias, connectionsFile.\nOptional adapterModule exports validateAddress and the customer's transactions object.\nAll paths are absolute; private connections remain outside the exported workspace.\n\nnode sdp-cli.mjs prepare --workspace PATH --config PATH --input batch.json\nnode sdp-cli.mjs capture --workspace PATH --config PATH --prepared-source UUID --disbursement-id ID\nnode sdp-cli.mjs receive --workspace PATH --config PATH --prepared-source UUID --input snapshot.json\nnode sdp-cli.mjs report --workspace PATH --config PATH --source-id UUID --output report.html\nnode sdp-cli.mjs project-payments --workspace PATH --config PATH --observation-source UUID\nnode sdp-cli.mjs inspect --workspace PATH --config PATH --disbursement-id ID\nnode sdp-cli.mjs create-draft --workspace PATH --config PATH --prepared-source UUID\nnode sdp-cli.mjs upload --workspace PATH --config PATH --prepared-source UUID --disbursement-id ID --observation-source UUID\nnode sdp-cli.mjs status --workspace PATH --config PATH --prepared-source UUID --snapshot-source UUID --status STARTED|PAUSED|CANCELED\nnode sdp-cli.mjs webhook-import --workspace PATH --config PATH --body PATH --headers PATH --secret-env NAME\n\ncreate-draft/upload/status dispatch actual provider writes using the original customer's durable mutation adapter.\nThe batch operationId identifies one original intent. Repeated dispatches reconcile that exact attempt.\nWorkspace and application delivery use the existing invoice CLI workspace-export/package-inspect/package-receive.\n";
function need(ok,code,message){if(!ok)throw new SDPContractError(code,message);}
function options(argv){
 const command=argv.shift()??"help",out={};
 const allowed=new Set(["workspace","config","input","prepared-source","disbursement-id","source-id","observation-source","snapshot-source","status","output","body","headers","secret-env","max-pages"]);
 while(argv.length){const flag=argv.shift();need(flag.startsWith("--")&&allowed.has(flag.slice(2)),"UNKNOWN_OPTION","Select a documented --option");
  const key=flag.slice(2),value=argv.shift();need(value&&!value.startsWith("--")&&!Object.hasOwn(out,key),"INVALID_OPTION","Supply each option once with a value");out[key]=value;}
 return {command,out};
}
async function input(path){need(path,"INPUT_REQUIRED","Select an original JSON input file");return strictJSON(await fs.readFile(resolve(path)));}
async function writeExact(path,body){const handle=await fs.open(resolve(path),"wx",0o600);try{await handle.writeFile(body);await handle.sync();}finally{await handle.close();}}
export async function main(argv=process.argv.slice(2),io={}){
 const {command,out}=options([...argv]),write=io.write??(x=>process.stdout.write(x));
 if(command==="help"){write(help);return;}
 need(out.workspace&&out.config,"WORKSPACE_REQUIRED","Select the existing workspace and exact programme/connection configuration");
 const config=await input(out.config);
 const selected=await loadInvoiceSettlementConfiguration({workspaceDirectory:resolve(out.workspace),connectionsFile:config.connectionsFile,profileFile:config.profileFile});
 const connection=selected.connections?.[config.connectionAlias];
 const needsProvider=["capture","inspect","create-draft","upload","status"].includes(command);
 if(needsProvider)need(connection?.provider==="sdp","ORIGINAL_CONNECTION_REQUIRED","Select an existing named SDP connection");
 if(connection){
  const base=new URL(connection.baseUrl),scope=new URL(config.scope.origin);
  need(base.href.replace(/\/+$/,"")===scope.href.replace(/\/+$/,""),"CONNECTION_SCOPE_MISMATCH","Connection URL differs from selected SDP scope");
  need(normalizeNetwork(connection.network)===config.scope.networkPassphrase,"CONNECTION_SCOPE_MISMATCH","Connection network differs from selected SDP scope");
  const headers=new Headers(connection.headers??{});
  need((connection.tenantName??headers.get("SDP-Tenant-Name"))===config.scope.tenantName&&(connection.walletId??headers.get("X-Wallet-Id"))===config.scope.sourceWalletId,"CONNECTION_SCOPE_MISMATCH","Connection tenant or wallet differs from selected SDP scope");
 }
 const adapter=config.adapterModule?await import(pathToFileURL(resolve(config.adapterModule)).href):{};
 const controller=new AbortController(),stop=()=>controller.abort(new Error("Operator interrupted"));
 process.on("SIGINT",stop);process.on("SIGTERM",stop);
 let workspace,transactions,ownedTransactions=false;
 try{
  workspace=await openInvoiceWorkspace({directory:resolve(out.workspace),...selected,signal:controller.signal});
  ownedTransactions=typeof adapter.openTransactions==="function";
  transactions=typeof adapter.openTransactions==="function"?await adapter.openTransactions({workspace,scope:config.scope,signal:controller.signal}):adapter.transactions;
  const getToken=connection?async()=>{
   if(typeof adapter.getToken==="function")return adapter.getToken({connectionAlias:config.connectionAlias});
   const h=new Headers(connection.headers??{}),token=connection.token??connection.apiKey;
   if(token!==undefined)return token;
   const value=h.get("authorization");need(value?.startsWith("Bearer "),"CREDENTIAL_REQUIRED","Use the existing SDP Bearer credential");return value.slice(7);
  }:undefined;
  const desk=createSDPWorkspace({workspace,programmeId:config.programmeId,programmeVersion:config.programmeVersion,
   scope:config.scope,connectionAlias:config.connectionAlias,getToken,transactions,validateAddress:adapter.validateAddress,allowLoopback:config.allowLoopback===true});
  let result;
  if(command==="prepare")result=await desk.prepare(await input(out.input));
  else if(command==="capture"){
   const maxPages=out["max-pages"]===undefined?1000:Number(out["max-pages"]);
   result=await desk.capture({preparedSourceId:out["prepared-source"],disbursementId:out["disbursement-id"],maxPages,signal:controller.signal});
  }else if(command==="receive")result=await desk.receiveSnapshot({preparedSourceId:out["prepared-source"],snapshot:await input(out.input)});
  else if(command==="report"){
   const source=await desk.read(out["source-id"],{json:false});need(source.source.kind==="sdp.report","REPORT_REQUIRED","Select the saved SDP report source");
   need(out.output,"OUTPUT_REQUIRED","Select the report output path");await writeExact(out.output,source.body);
   result={sourceId:out["source-id"],output:resolve(out.output),bytes:source.body.length};
  }else if(command==="project-payments")result=await desk.projectPaymentObservation({observationSourceId:out["observation-source"]});
  else if(command==="inspect")result=await desk.inspect({disbursementId:out["disbursement-id"],signal:controller.signal});
  else if(command==="create-draft")result=await desk.createDraft({preparedSourceId:out["prepared-source"],signal:controller.signal});
  else if(command==="upload")result=await desk.uploadInstructions({preparedSourceId:out["prepared-source"],disbursementId:out["disbursement-id"],observationSourceId:out["observation-source"],signal:controller.signal});
  else if(command==="status")result=await desk.status({preparedSourceId:out["prepared-source"],snapshotSourceId:out["snapshot-source"],status:out.status,signal:controller.signal});
  else if(command==="webhook-import"){
   const name=out["secret-env"];need(name&&/^[A-Za-z_][A-Za-z0-9_]*$/.test(name),"SECRET_ENV_REQUIRED","Select the existing organization webhook secret environment name");
   const secret=process.env[name];need(secret,"SECRET_REQUIRED","Selected webhook secret is unavailable");
   result=await desk.receiveSignedEvent({rawBody:await fs.readFile(resolve(out.body)),headers:await input(out.headers),secret,singleTenantInstallation:config.singleTenantInstallation===true});
  }else throw new SDPContractError("UNKNOWN_COMMAND","Select a documented SDP command");
  if(out.output&&command!=="report")await writeExact(out.output,Buffer.from(JSON.stringify(result,null,2)+"\n"));
  write(JSON.stringify(result,null,2)+"\n");return result;
 }finally{try{if(ownedTransactions&&typeof transactions?.close==="function")await transactions.close();}finally{try{await workspace?.close();}finally{process.off("SIGINT",stop);process.off("SIGTERM",stop);}}}
}
if(process.argv[1]&&import.meta.url===pathToFileURL(resolve(process.argv[1])).href)
 main().catch(error=>{process.stderr.write(JSON.stringify({error:{code:error.code??"SDP_OPERATOR_ERROR",message:error.message,providerOutcome:error.result??null}})+"\n");process.exitCode=1;});
