#!/usr/bin/env node
// MIT. Operate the existing merchant server without opening a second store.
import {parseArgs} from 'node:util';
import {createHash} from 'node:crypto';
import {constants} from 'node:fs';
import {open,lstat,realpath,mkdtemp,link,rm} from 'node:fs/promises';
import {resolve,dirname,isAbsolute,join} from 'node:path';
import {pathToFileURL} from 'node:url';
import {inspectMerchantOperator,createMerchantOperatorClient,MerchantOperatorError,
  MERCHANT_OPERATOR_CONNECTION_SCHEMA} from './operator-client.mjs';

const fail=code=>{throw new MerchantOperatorError(code);};
const need=(value,code)=>{if(!value)fail(code);};
const digest=raw=>createHash('sha256').update(raw).digest('hex');
async function inputJSON(path,maximum=8*1024*1024,{rawText=false}={}) {
  need(typeof path==='string'&&isAbsolute(path)&&resolve(path)===path,'MERCHANT_OPERATOR_ABSOLUTE_INPUT_REQUIRED');
  need(await realpath(dirname(path))===dirname(path),'MERCHANT_OPERATOR_INPUT_PATH_CHANGED');
  const fd=await open(path,constants.O_RDONLY|constants.O_NOFOLLOW);
  try{
    const first=await fd.stat();
    need(first.isFile()&&first.nlink>=1&&!(first.mode&0o077)&&
      (process.getuid===undefined||first.uid===process.getuid())&&first.size<=maximum,'MERCHANT_OPERATOR_PRIVATE_INPUT_REQUIRED');
    const parts=[];let length=0;const buffer=Buffer.alloc(65536);
    for(;;){const next=await fd.read(buffer,0,buffer.length,null);if(!next.bytesRead)break;
      length+=next.bytesRead;need(length<=maximum,'MERCHANT_OPERATOR_INPUT_TOO_LARGE');
      parts.push(Buffer.from(buffer.subarray(0,next.bytesRead)));}
    const last=await fd.stat(),entry=await lstat(path);
    need(first.dev===last.dev&&first.ino===last.ino&&first.size===last.size&&first.mtimeMs===last.mtimeMs&&
      first.ctimeMs===last.ctimeMs&&entry.dev===first.dev&&entry.ino===first.ino&&length===first.size,
      'MERCHANT_OPERATOR_INPUT_CHANGED');
    const raw=Buffer.concat(parts);let value;
    try{const text=new TextDecoder('utf-8',{fatal:true,ignoreBOM:true}).decode(raw);value=rawText?text:JSON.parse(text.replace(/^\ufeff/,''));}catch{fail('MERCHANT_OPERATOR_INPUT_JSON_INVALID');}
    return {value,sha256:digest(raw)};
  }finally{await fd.close();}
}
async function saveJSON(path,value) {
  need(typeof path==='string'&&isAbsolute(path)&&resolve(path)===path,'MERCHANT_OPERATOR_ABSOLUTE_DESTINATION_REQUIRED');
  const parent=dirname(path),info=await lstat(parent);
  need(info.isDirectory()&&!info.isSymbolicLink()&&!(info.mode&0o077)&&
    (process.getuid===undefined||info.uid===process.getuid())&&await realpath(parent)===parent,
    'MERCHANT_OPERATOR_PRIVATE_DESTINATION_REQUIRED');
  const raw=Buffer.from(JSON.stringify(value,null,2)+'\n');
  const stage=await mkdtemp(join(parent,'.merchant-json-')),temporary=join(stage,'complete');
  try{
    const fd=await open(temporary,'wx',0o600);try{await fd.writeFile(raw);await fd.sync();}finally{await fd.close();}
    try{await link(temporary,path);}
    catch(error){if(error.code!=='EEXIST')throw error;
      const existing=await inputJSON(path,Math.max(raw.length,1024));
      need(existing.sha256===digest(raw),'MERCHANT_OPERATOR_DESTINATION_CHANGED');
    }
    await rm(temporary);
    const directory=await open(parent,constants.O_RDONLY|constants.O_DIRECTORY|constants.O_NOFOLLOW);
    try{await directory.sync();}finally{await directory.close();}
    return {path,bytes:raw.length,sha256:digest(raw)};
  }finally{await rm(stage,{recursive:true,force:true});}
}
async function admitMutationOutput(path) {
  need(typeof path==='string'&&isAbsolute(path)&&resolve(path)===path,'MERCHANT_OPERATOR_ABSOLUTE_DESTINATION_REQUIRED');
  const parent=dirname(path),info=await lstat(parent);
  need(info.isDirectory()&&!info.isSymbolicLink()&&!(info.mode&0o077)&&
    (process.getuid===undefined||info.uid===process.getuid())&&await realpath(parent)===parent,
    'MERCHANT_OPERATOR_PRIVATE_DESTINATION_REQUIRED');
  try{await lstat(path);}catch(error){if(error.code==='ENOENT')return;throw error;}
  fail('MERCHANT_OPERATOR_OUTPUT_ALREADY_EXISTS');
}
const HELP=String.raw`Usage: starforge x402api-merchant-operator COMMAND [OPTIONS]

connect --url ORIGIN --token-env NAME --out /private/connection.json
register --connection FILE [--selection FILE] [--limit 50] [--cursor CURSOR]
         [--revision REVISION] [--out /private/page.json]
register-export --connection FILE --register /private/page.json
                --format json|csv --out /private/invoices.json
invoice|charge|envelope|reconcile --connection FILE --id ORIGINAL_UUID [--out FILE]
create --connection FILE --request /private/original-invoice.json [--out FILE]
authorize --connection FILE --id ORIGINAL_UUID --request /private/authorization.json
result --connection FILE --id ORIGINAL_UUID --out /private/retained-result
observation|observation-summary --connection FILE [--history-sequence INTEGER] [--out FILE]
project|project-status|project-manifest --connection FILE [--operation ORIGINAL_UUID] [--out FILE]
project-begin --connection FILE --operation ORIGINAL_UUID [--out FILE]
project-download --connection FILE --operation ORIGINAL_UUID --out /private/project.zip
invoice-delivery --connection FILE --id ORIGINAL_UUID --out /private/delivery-review.json
invoice-delivery-download --connection FILE --request /private/delivery-review.json --out /private/customer.zip
intake-context|intakes --connection FILE [--out FILE]
intake-prepare --connection FILE --source ORIGINAL_FILE --mapping MAPPING_JSON
               --format csv|json --operation ORIGINAL_UUID [--out REVIEW_JSON]
intake-status|intake-export --connection FILE --operation ORIGINAL_UUID [--out FILE]
intake-run --connection FILE --request REVIEW_JSON [--out RESULT_JSON]

The connection keeps URL/store/tenant and an environment VARIABLE NAME, never
the operator credential. Set that variable privately before running commands.
The server must contain the maintained operator-owner header contract.
Save register first; register-export uses that exact reviewed selection/revision.
JSON inputs and output directories must be private. Existing different output
files are preserved. Mutations are sent once; an UNKNOWN outcome requires the
original invoice inspection or project status, using the same original ID.
`;
export async function main(argv=process.argv.slice(2),{environment=process.env,stdout=process.stdout}={}) {
  const {values,positionals}=parseArgs({args:argv,allowPositionals:true,strict:true,options:{
    connection:{type:'string'},url:{type:'string'},'token-env':{type:'string'},out:{type:'string'},
    selection:{type:'string'},register:{type:'string'},request:{type:'string'},id:{type:'string'},
    source:{type:'string'},mapping:{type:'string'},operation:{type:'string'},limit:{type:'string'},cursor:{type:'string'},revision:{type:'string'},
    format:{type:'string'},'history-sequence':{type:'string'},'connection-sha256':{type:'string'},
    'timeout-ms':{type:'string'},'maximum-download-bytes':{type:'string'},help:{type:'boolean'}
  }});
  if(values.help||positionals[0]==='help'||positionals.length===0){stdout.write(HELP);return;}
  need(positionals.length===1,'MERCHANT_OPERATOR_ONE_COMMAND_REQUIRED');const action=positionals[0];
  const common=['connection','connection-sha256','timeout-ms','maximum-download-bytes','out'];
  const allowed={
    connect:['url','token-env','out','timeout-ms','maximum-download-bytes'],
    register:[...common,'selection','limit','cursor','revision'],
    'register-export':[...common,'register','format'],
    'invoice-delivery':[...common,'id'],'invoice-delivery-download':[...common,'request'],
    invoice:[...common,'id'],create:[...common,'request'],charge:[...common,'id'],
    envelope:[...common,'id'],authorize:[...common,'id','request'],reconcile:[...common,'id'],
    result:[...common,'id'],observation:common,'observation-summary':[...common,'history-sequence'],
    'intake-context':common,intakes:common,
    'intake-prepare':[...common,'source','mapping','format','operation'],
    'intake-status':[...common,'operation'],'intake-export':[...common,'operation'],'intake-run':[...common,'request'],
    project:common,'project-status':[...common,'operation'],'project-manifest':[...common,'operation'],
    'project-begin':[...common,'operation'],'project-download':[...common,'operation']
  };
  need(allowed[action],'MERCHANT_OPERATOR_COMMAND_UNKNOWN');
  need(Object.keys(values).every(key=>allowed[action].includes(key)),'MERCHANT_OPERATOR_OPTION_NOT_USED');
  const numeric=(key)=>{if(values[key]===undefined)return undefined;
    need(/^[1-9][0-9]*$/.test(values[key]),'MERCHANT_OPERATOR_NUMBER_INVALID');
    const n=Number(values[key]);need(Number.isSafeInteger(n),'MERCHANT_OPERATOR_NUMBER_INVALID');return n;};
  const controller=new AbortController(),interrupt=()=>controller.abort();
  process.once('SIGINT',interrupt);process.once('SIGTERM',interrupt);
  try{
    let connection;
    if(action==='connect'){
      const tokenEnvironment=values['token-env'];
      need(values.url&&values.out&&typeof tokenEnvironment==='string'&&/^[A-Z][A-Z0-9_]{0,127}$/.test(tokenEnvironment),
        'MERCHANT_OPERATOR_CONNECTION_INPUT_REQUIRED');
      const found=await inspectMerchantOperator({url:values.url,operatorToken:environment[tokenEnvironment],
        timeoutMs:numeric('timeout-ms'),maxDownloadBytes:numeric('maximum-download-bytes')},{signal:controller.signal});
      connection={schema:found.schema,url:found.url,storeId:found.storeId,tenantId:found.tenantId,tokenEnvironment,
        ...(values['timeout-ms']?{timeoutMs:numeric('timeout-ms')}:{}),
        ...(values['maximum-download-bytes']?{maxDownloadBytes:numeric('maximum-download-bytes')}:{})};
      const saved=await saveJSON(values.out,connection);
      stdout.write(JSON.stringify({...saved,connection,observedMode:found.mode})+'\n');return;
    }
    const selected=await inputJSON(values.connection,65536);connection=selected.value;
    if(values['connection-sha256'])need(selected.sha256===values['connection-sha256'],'MERCHANT_OPERATOR_CONNECTION_CHANGED');
    need(connection?.schema===MERCHANT_OPERATOR_CONNECTION_SCHEMA&&
      Object.keys(connection).every(k=>['schema','url','storeId','tenantId','tokenEnvironment','timeoutMs','maxDownloadBytes','maxJSONBytes'].includes(k))&&
      typeof connection.tokenEnvironment==='string'&&/^[A-Z][A-Z0-9_]{0,127}$/.test(connection.tokenEnvironment),
      'MERCHANT_OPERATOR_CONNECTION_INVALID');
    const mutation=['create','charge','authorize','reconcile','project-begin','intake-prepare','intake-run'].includes(action);
    if(mutation&&values.out)await admitMutationOutput(values.out);
    const client=await createMerchantOperatorClient({...connection,operatorToken:environment[connection.tokenEnvironment],
      timeoutMs:numeric('timeout-ms')??connection.timeoutMs,
      maxDownloadBytes:numeric('maximum-download-bytes')??connection.maxDownloadBytes},{signal:controller.signal});
    const settings={signal:controller.signal};let result,download=false;
    const input=async(key,maximum)=>(await inputJSON(values[key],maximum)).value;
    if(action==='register')result=await client.readRegister({selection:values.selection?await input('selection'): {},
      limit:numeric('limit')??50,cursor:values.cursor,revision:values.revision,...settings});
    else if(action==='register-export'){
      need(values.out&&values.register,'MERCHANT_OPERATOR_REVIEWED_REGISTER_REQUIRED');
      const page=await input('register');
      need(page?.schema==='stellar-forge.merchant-invoice-register.v1'&&page.source?.storeId===connection.storeId&&
        page.config?.tenantId===connection.tenantId,'MERCHANT_OPERATOR_REGISTER_CHANGED');
      const ticket=await client.prepareRegisterExport({selection:page.selection,revision:page.source.revision,
        format:values.format??'json',...settings});
      result=await client.downloadRegisterExport(ticket,values.out,settings);download=true;
    }
    else if(action==='invoice-delivery')result=await client.previewInvoiceDelivery(values.id,settings);
    else if(action==='invoice-delivery-download'){
      need(values.out&&values.request,'INVOICE_DELIVERY_REVIEW_REQUIRED');
      const review=await input('request');
      need(review?.schema==='stellar-forge.merchant-invoice-delivery.v1'&&review.owner?.storeId===connection.storeId&&
        review.owner?.tenantId===connection.tenantId,'MERCHANT_OPERATOR_INVOICE_DELIVERY_CHANGED');
      const ticket=await client.prepareInvoiceDelivery(review.invoiceId,review.revision,settings);
      result={...await client.downloadInvoiceDelivery(ticket,values.out,settings),invoiceId:review.invoiceId,revision:review.revision};download=true;
    }
    else if(action==='invoice')result=await client.inspectInvoice(values.id,settings);
    else if(action==='create')result=await client.createInvoice(await input('request',1048576),settings);
    else if(action==='charge')result=await client.createCharge(values.id,settings);
    else if(action==='envelope')result=await client.paymentEnvelope(values.id,settings);
    else if(action==='authorize'){
      const authorization=await input('request',70000);
      need(authorization&&Object.keys(authorization).length===1,'MERCHANT_OPERATOR_AUTHORIZATION_INPUT_INVALID');
      result=await client.submitPaymentAuthorization(values.id,authorization.paymentSignature,settings);
    }
    else if(action==='reconcile')result=await client.reconcileInvoice(values.id,settings);
    else if(action==='result'){result=await client.downloadInvoiceResult(values.id,values.out,settings);download=true;}
    else if(action==='intake-context')result=await client.intakeContext(settings);
    else if(action==='intakes')result=await client.listIntakes(settings);
    else if(action==='intake-prepare'){
      need(values.source&&values.mapping&&values.operation&&['csv','json'].includes(values.format),'INTAKE_INPUT_REQUIRED');
      const source=await inputJSON(values.source,1048576,{rawText:true}),mapping=await input('mapping',65536);
      const context=await client.intakeContext(settings);
      result=await client.prepareIntake({operation:values.operation,storeId:connection.storeId,tenantId:connection.tenantId,
        configurationSha256:context.configurationSha256,source:{name:values.source.split('/').at(-1),format:values.format,text:source.value},mapping},settings);
    }
    else if(action==='intake-status')result=await client.readIntake(values.operation,settings);
    else if(action==='intake-export')result=await client.exportIntake(values.operation,settings);
    else if(action==='intake-run'){
      const review=await input('request');
      need(review?.schema==='stellar-forge.merchant-intake-status.v1'&&review.storeId===connection.storeId&&review.tenantId===connection.tenantId,
        'INTAKE_OWNER_CHANGED');
      result=await client.runIntake(review.operation,review.planSha256,settings);
    }
    else if(action==='observation')result=await client.observation(settings);
    else if(action==='observation-summary')result=await client.observationSummary({historySequence:values['history-sequence'],...settings});
    else if(action==='project')result=await client.project(settings);
    else if(action==='project-status')result=await client.projectStatus(values.operation,settings);
    else if(action==='project-manifest')result=await client.projectManifest(values.operation,settings);
    else if(action==='project-begin')result=await client.beginProject(values.operation,settings);
    else if(action==='project-download'){result=await client.downloadProject(values.operation,values.out,settings);download=true;}
    if(values.out&&!download){
      try{stdout.write(JSON.stringify(await saveJSON(values.out,result))+'\n');}
      catch(error){
        const recovery=action.startsWith('intake-')?{kind:'intake',operation:result.operation??values.operation,action:'status'}:
          action==='project-begin'?{kind:'project',operation:values.operation,action:'status'}:
          mutation?{kind:'invoice',id:result.order?.id??values.id,action:'inspect'}:null;
        const saveError={code:typeof error?.code==='string'?error.code:'MERCHANT_OPERATOR_OUTPUT_WRITE_FAILED'};
        try{stdout.write(JSON.stringify({outcome:'RECEIVED',result,saveError,destination:values.out,...(recovery?{recovery}:{})})+'\n');}
        finally{throw new MerchantOperatorError('MERCHANT_OPERATOR_RESPONSE_NOT_SAVED',{outcome:'RECEIVED',recovery});}
      }
    }
    else stdout.write(JSON.stringify(result)+'\n');
    return result;
  }finally{process.off('SIGINT',interrupt);process.off('SIGTERM',interrupt);}
}
if(process.argv[1]&&pathToFileURL(resolve(process.argv[1])).href===import.meta.url)
  main().catch(error=>{process.stderr.write(JSON.stringify({error:error?.code??'MERCHANT_OPERATOR_FAILED',
    ...(error?.status?{status:error.status}:{}),...(error?.outcome?{outcome:error.outcome,recovery:error.recovery}:{})})+'\n');
    process.exitCode=1;});
