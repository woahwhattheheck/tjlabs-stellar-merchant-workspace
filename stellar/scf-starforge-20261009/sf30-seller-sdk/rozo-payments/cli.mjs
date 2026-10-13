#!/usr/bin/env node
import { readFileSync, writeFileSync, openSync, closeSync, fsyncSync, existsSync, mkdirSync, createWriteStream, lstatSync, realpathSync, linkSync, unlinkSync } from 'node:fs';
import { join, resolve, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';
import { createHash, randomUUID } from 'node:crypto';
import { RozoWorkspace, inspectRozoWorkspace } from './store.mjs';
import { RozoService } from './service.mjs';
import { acquireLease } from './lease.mjs';
import { inspectRozoSource, selectRozoSource, loadRozoConfiguration, materializePublisher } from './source.mjs';
import { receiveDelivery, putOriginal, hashOriginalFile } from './delivery.mjs';
import { assert, canonical, jsonDigest, digest, integer, id } from './model.mjs';

const HERE=fileURLToPath(new URL('.',import.meta.url)),ROOT=fileURLToPath(new URL('../../../../',import.meta.url));
const help=String.raw`ROZO merchant payments and original Checkout workspace (Node 24+)
  init --workspace DIR
  inspect --workspace DIR
  serve --workspace DIR --config FILE [--host 127.0.0.1 --port 0]
        [--source-root ROOT --source-manifest FILE --source-sha256 SHA]
        [--expected-workspace-id ID --expected-origin-id ID --startup-file FILE]
        [--merchant-config FILE --accounting ALIAS --buyer ALIAS]
  state --workspace DIR [--profile ID --offset 0 --limit 100]
  run --workspace DIR --config FILE --input ORIGINAL-REQUEST.json
  run --workspace DIR --config FILE --command COMMAND --payload PAYLOAD.json
      --request-id ID --revision N --actor ACTOR
  request --workspace DIR --request-id ID
  resume --workspace DIR --config FILE --request-id ID [--retry]
  history --workspace DIR --kind KIND --id ID
  report --workspace DIR --id ID
  object --workspace DIR --sha256 SHA --out FILE
  callback --workspace DIR --config FILE --profile ID --file RAW-BODY
           --timestamp MILLISECONDS --signature sha256=HEX
  export | handover --workspace DIR --config FILE --id DELIVERY-ID
           --request-id ID --revision N --actor ACTOR --title TITLE
           [--source-root ROOT --source-manifest FILE --source-sha256 SHA]
  receive --archive ZIP --directory DIR --sha256 SHA
          [--activate --request-id ID --actor ACTOR]
  publisher --publisher checkout|intent-common|contracts --directory DIR
  finance-plan --workspace DIR --merchant-config FILE --accounting ALIAS [--buyer ALIAS]
         --directory DRAFT-DIR --report-id ID --report-sha256 SHA --actor ACTOR
         --source-details SOURCE-METADATA.json [--operation-id ID]
  native-finance --workspace DIR --config FILE --merchant-config FILE --accounting ALIAS
         [--buyer ALIAS] --plan REVIEWED-PLAN.json --directory ORIGINAL-FINANCE-DIR
         --chromium FILE --playwright-module FILE [--python FILE --maintenance-continuation FILE]
  receive-finance --archive ZIP --sha256 SHA --directory PACKAGE-DIR --receiver NEW-DIR
         [--merchant-config FILE --accounting ALIAS --python FILE]
  native --directory DIR [--chromium FILE --playwright-module FILE]
         [--source-root ROOT --source-manifest FILE --source-sha256 SHA]
  native-applications --directory ORIGINAL-NATIVE-DIR --repository CHECKOUT --ref COMMIT
         --chromium FILE --playwright-module FILE [--python FILE --npm FILE]
All original request JSON is retained before dispatch. No command signs or sends funds.
Working exports are review snapshots. Handover drains and seals the original owner.
Complete archive operations require Python 3 stdlib (ROZO_PYTHON or --python).
`;
export function argumentsOf(args){
  const [command,...rest]=args,flags={},pos=[];
  for(let i=0;i<rest.length;i++){
    const key=rest[i];if(!key.startsWith('--')){pos.push(key);continue;}
    assert(!Object.hasOwn(flags,key),'CLI_ARGUMENT','An option is repeated: '+key);
    if(['--retry','--activate','--help'].includes(key)){flags[key]=true;continue;}
    assert(i+1<rest.length&&!rest[i+1].startsWith('--'),'CLI_ARGUMENT','Supply the complete value for '+key);flags[key]=rest[++i];
  }assert(!pos.length,'CLI_ARGUMENT','Unexpected positional arguments.');return {command,flags};
}
function need(flags,key){assert(typeof flags[key]==='string'&&flags[key].length,'CLI_ARGUMENT','Supply '+key);return flags[key];}
const jsonFile=path=>JSON.parse(path==='-'?readFileSync(0,'utf8'):readFileSync(path,'utf8'));
const result=value=>process.stdout.write(JSON.stringify(value)+'\n');
function serviceFor(w,flags,finance={}){
  let configuration={config:{schema:'stellar-forge.rozo-connections.v1',connections:{}},connections:{},publisherSelections:{}};
  if(flags['--config'])configuration=loadRozoConfiguration(resolve(flags['--config']));
  const sourceRoot=resolve(flags['--source-root']??ROOT),selected=selectRozoSource(sourceRoot,{sourceManifest:flags['--source-manifest'],expectedSha256:flags['--source-sha256'],optional:!flags['--source-manifest']&&!flags['--source-sha256']});
  const sourceManifest=selected?.sourceManifest??null,sourceIdentity=selected?.sourceIdentity??null;
  return new RozoService({...finance,workspace:w,connections:configuration.connections,publisherSelections:configuration.publisherSelections,sourceIdentity,delivery:{sourceRoot,sourceManifest,configuration,python:flags['--python']??process.env.ROZO_PYTHON}});
}
function inputEnvelope(w,flags,command,payload){
  if(flags['--input'])return jsonFile(flags['--input']);
  const requestId=need(flags,'--request-id'),actor=need(flags,'--actor'),prior=w.request(requestId);
  let expectedRevision;
  if(flags['--revision']!==undefined){assert(/^\d+$/.test(flags['--revision']),'CLI_REVISION','Use the exact whole expected revision.');expectedRevision=Number(flags['--revision']);}
  else{assert(prior,'CLI_REVISION','Supply --revision for a new original request.');expectedRevision=prior.envelope.expectedRevision;}
  return {workspaceId:w.meta().workspaceId,requestId,expectedRevision,actor,command,payload};
}
function retainInput(w,envelope){
  const directory=join(w.directory,'cli-requests');mkdirSync(directory,{recursive:true,mode:0o700});id(envelope.requestId);
  putOriginal(join(directory,envelope.requestId+'.json'),Buffer.from(canonical(envelope)+'\n'));
}
async function exportObject(w,hash,out){
  const original=w.bytes(hash,{offset:0,length:1}),target=resolve(out);mkdirSync(dirname(target),{recursive:true,mode:0o700});
  const reuse=()=>{const identity=hashOriginalFile(target);assert(identity.bytes===original.bytes&&identity.sha256===hash,'FILE_EXISTS','An existing destination contains another file.',409);return identity;};
  if(existsSync(target)){const identity=reuse();return {path:target,sha256:hash,bytes:identity.bytes,reused:true};}
  const temp=target+'.rozo-partial-'+randomUUID(),fd=openSync(temp,'wx',0o600),h=createHash('sha256');let offset=0,reused=false;
  try{
    try{
      while(offset<original.bytes){const value=w.bytes(hash,{offset,length:1024*1024});assert(value.sha256===hash&&value.bytes===original.bytes&&value.offset===offset&&value.length>0,'RANGE_IDENTITY','The original range changed.');writeFileSync(fd,value.data);h.update(value.data);offset+=value.length;}
      assert(offset===original.bytes&&h.digest('hex')===hash,'FILE_IDENTITY','The complete original file hash differs.');fsyncSync(fd);
    }finally{closeSync(fd);}
    try{linkSync(temp,target);}catch(error){if(error.code!=='EEXIST')throw error;reuse();reused=true;}
  }finally{unlinkSync(temp);}
  return {path:target,sha256:hash,bytes:offset,reused};
}
export async function main(args=process.argv.slice(2)){
  const {command,flags}=argumentsOf(args);if(!command||command==='help'||flags['--help']){process.stdout.write(help);return;}
  if(command==='receive-finance'){const {receiveFinanceCommand}=await import('./finance-cli.mjs');result(await receiveFinanceCommand(flags));return;}
  if(command==='publisher'){
    const ids={checkout:'RozoAI/rozo-checkout-skill','intent-common':'RozoAI/intent-pay',contracts:'RozoAI/rozo-intents-contracts'},publisher=ids[need(flags,'--publisher')];assert(publisher,'PUBLISHER','Select checkout, intent-common or contracts.');
    const catalogue=jsonFile(join(HERE,'publishers.json')),row=catalogue.publishers.find(p=>p.repository===publisher);
    result(materializePublisher(join(HERE,row.capsule),resolve(need(flags,'--directory')),{expectedSha256:row.capsuleSha256}));return;
  }
  if(command==='receive'){result(await receiveDelivery(resolve(need(flags,'--archive')),resolve(need(flags,'--directory')),{sha256:need(flags,'--sha256'),activate:flags['--activate']===true,requestId:flags['--request-id'],actor:flags['--actor']??'Receiving operator',python:flags['--python']}));return;}
  if(command==='native'){const selected=selectRozoSource(resolve(flags['--source-root']??ROOT),{sourceManifest:flags['--source-manifest'],expectedSha256:flags['--source-sha256']});const {runRozoJourney}=await import('./native-journey.mjs');result(await runRozoJourney({directory:resolve(need(flags,'--directory')),chromium:flags['--chromium'],playwrightModule:flags['--playwright-module'],sourceRoot:selected.sourceRoot,sourceManifest:selected.sourceManifest,python:flags['--python']}));return;}
  if(command==='native-applications'){const {runRozoApplications}=await import('./native-applications.mjs');result(await runRozoApplications({directory:resolve(need(flags,'--directory')),repository:resolve(need(flags,'--repository')),ref:need(flags,'--ref'),chromium:flags['--chromium'],playwrightModule:flags['--playwright-module'],python:flags['--python'],npm:flags['--npm']}));return;}
  const directory=resolve(need(flags,'--workspace'));
  if(command==='inspect'){result(inspectRozoWorkspace(directory));return;}
  const reading=['state','request','history','report','object','finance-plan'].includes(command),w=new RozoWorkspace(directory,{create:command==='init',readOnly:reading});let service,owner,server;
  try{
    if(command==='init'){result(inspectRozoWorkspace(directory));return;}
    if(command==='request'){result({workspaceId:w.meta().workspaceId,request:w.request(need(flags,'--request-id'))});return;}
    if(command==='history'){result(w.history(need(flags,'--kind'),need(flags,'--id')));return;}
    if(command==='report'){const value=w.get('report',need(flags,'--id'));assert(value,'REPORT_MISSING','The original report is absent.',404);result(value);return;}
    if(command==='object'){result(await exportObject(w,need(flags,'--sha256'),need(flags,'--out')));return;}
    const operate=async(finance={})=>{
    service=serviceFor(w,flags,finance);
    if(command==='state'){result(service.state({profileId:flags['--profile']??null,offset:Number(flags['--offset']??0),limit:Number(flags['--limit']??100)}));return;}
    if(command==='finance-plan'){const {financeCommand}=await import('./finance-cli.mjs');result(await financeCommand(command,service,flags));return;}
    need(flags,'--config');owner=acquireLease(w,'operator');
    if(command==='native-finance'){const {financeCommand}=await import('./finance-cli.mjs');result(await financeCommand(command,service,flags));return;}
    if(command==='serve'){
      const m=w.meta();if(flags['--expected-workspace-id'])assert(m.workspaceId===flags['--expected-workspace-id'],'WORKSPACE_IDENTITY','The reviewed original workspace ID differs.',409);
      if(flags['--expected-origin-id'])assert(m.originId===flags['--expected-origin-id'],'WORKSPACE_IDENTITY','The reviewed original origin ID differs.',409);
      assert(service.sourceIdentity,'SOURCE_MANIFEST','Serve the complete original distribution manifest or standalone INSTALLED_SOURCE.json.',409);
      const {startRozoServer}=await import('./server.mjs');server=await startRozoServer({service,host:flags['--host']??'127.0.0.1',port:Number(flags['--port']??0)});
      if(flags['--startup-file']){const path=resolve(flags['--startup-file']);mkdirSync(dirname(path),{recursive:true,mode:0o700});if(existsSync(path))assert(lstatSync(path).isFile()&&!lstatSync(path).isSymbolicLink(),'STARTUP_PATH','The startup receipt must be an ordinary file.');const fd=openSync(path,'w',0o600);try{writeFileSync(fd,JSON.stringify(server.startup)+'\n');fsyncSync(fd);}finally{closeSync(fd);}}
      result(server.startup);
      await new Promise(resolve=>{const done=()=>resolve();process.once('SIGTERM',done);process.once('SIGINT',done);server.server.once('close',done);});return;
    }
    if(command==='resume'){result(await service.resume(need(flags,'--request-id'),{retry:flags['--retry']===true}));return;}
    if(command==='callback'){result(service.callback(need(flags,'--profile'),{rawBody:readFileSync(need(flags,'--file')),headers:{'x-rozo-timestamp':need(flags,'--timestamp'),'x-rozo-signature':need(flags,'--signature'),'content-type':'application/json'}}));return;}
    let envelope;
    if(command==='run')envelope=inputEnvelope(w,flags,flags['--command']??'',flags['--payload']?jsonFile(flags['--payload']):{});
    else if(command==='export'||command==='handover')envelope=inputEnvelope(w,flags,command==='handover'?'workspace.handover':'workspace.export',{id:need(flags,'--id'),title:need(flags,'--title')});
    else throw Error('Unknown command. Use rozo-payments help.');
    retainInput(w,envelope);result(await service.execute(envelope,{retry:flags['--retry']===true}));
    };
    if(flags['--merchant-config']||flags['--accounting']||flags['--buyer']){
      need(flags,'--merchant-config');
      assert(flags['--accounting']||flags['--buyer'],'ROZO_FINANCE_CONFIGURATION','Select a configured Accounting or Buyer alias.');
      const {openMerchantOperator}=await import('../../../../stellar-forge/mcp-merchant-operator/operator.mjs');
      const operator=await openMerchantOperator(resolve(flags['--merchant-config']));
      try{
        return await operator.withRozoFinanceOwners({accountingId:flags['--accounting']??null,buyerId:flags['--buyer']??null},
          async finance=>{
            try{return await operate(finance);}
            finally{if(server){await server.close();server=null;service=null;}else if(service){await service.close();service=null;}}
          });
      }finally{await operator.close();}
    }
    return await operate();
  }finally{if(server)await server.close();else await service?.close();owner?.release();w.close();}
}
if(process.argv[1]&&realpathSync(process.argv[1])===fileURLToPath(import.meta.url))main().catch(error=>{process.stderr.write(JSON.stringify({error:{code:error.code??'ROZO_ERROR',message:error.message,details:error.details??{}}})+'\n');process.exitCode=1;});
