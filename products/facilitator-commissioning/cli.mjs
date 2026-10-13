#!/usr/bin/env node
// SPDX-License-Identifier: MIT
import { readFile, writeFile } from 'node:fs/promises';
import { resolve, dirname } from 'node:path';
import { pathToFileURL } from 'node:url';
import { randomUUID } from 'node:crypto';
import { createCommissioningJob, openCommissioningJob, inspectCommissioningTransfer } from './commissioning.mjs';
import { renderCommissioningReport } from './report.mjs';

const HELP = 'Facilitator commissioning — original seller releases and complete customer receiving\n\n' +
'  init --selection FILE --directory NEW_PRIVATE_DIRECTORY\n' +
'  status|report --directory DIR [--store RECEIVED_ORIGINAL_STORE]\n' +
'  request --directory DIR --action review|stage|select|receive-run|buyer-plan|receive --payload FILE --out NEW_COMMAND_JSON\n' +
'  apply --directory DIR --command ORIGINAL_COMMAND_JSON [--store RECEIVED_ORIGINAL_STORE]\n' +
'  run --directory DIR --provider ALIAS --operation-id UUID --expect GENERATION [--store ORIGINAL_STORE]\n' +
'  export --directory DIR --out NEW_PRIVATE_DIRECTORY [--store ORIGINAL_STORE]\n' +
'  inspect-transfer --directory RECEIVED_DIRECTORY\n' +
'  report-html --directory DIR --out NEW_HTML [--store ORIGINAL_STORE]\n\n' +
'The request command retains one UUID and current job revision. Apply continues that exact file.\n' +
'Provider selection changes the next original seller run. Run owns and drains only that selected seller.\n' +
'Buyer signing and approvals stay in the existing SF88 customer operation.\n';

function options(args) {
  const [action,...rest]=args, out={action};
  if(['--help','help',undefined].includes(action))return {action:'help'};
  for(let i=0;i<rest.length;i+=2) {
    if(!rest[i]?.startsWith('--') || rest[i+1]===undefined || Object.hasOwn(out,rest[i].slice(2)))
      throw new TypeError('Use one value for each documented option.');
    out[rest[i].slice(2)]=rest[i+1];
  }
  const allowed={
    init:['selection','directory'],status:['directory','store'],report:['directory','store'],
    request:['directory','store','action-name','action','payload','out'],
    apply:['directory','store','command'],run:['directory','store','provider','operation-id','expect'],
    export:['directory','store','out'],'inspect-transfer':['directory'],
    'report-html':['directory','store','out'],
  };
  if(!allowed[action] || Object.keys(out).some(k=>k!=='action'&&!allowed[action].includes(k)))
    throw new TypeError('Choose a documented command and its options.');
  return out;
}
async function parse(path) { return JSON.parse(await readFile(resolve(path),'utf8')); }
async function freshJson(path,value) {
  await writeFile(resolve(path),JSON.stringify(value,null,2)+'\n',{mode:0o600,flag:'wx'});
}
export async function main(args=process.argv.slice(2)) {
  // Keep the subcommand distinct from --action, which is a persisted domain action.
  const action=args[0], normalized=args.map((v,i)=>i>0&&v==='--action'?'--action-name':v);
  const o=options(normalized);
  if(o.action==='help'){process.stdout.write(HELP);return;}
  if(!o.directory)throw new TypeError('--directory is required.');
  let result;
  if(action==='init') {
    if(!o.selection)throw new TypeError('--selection is required.');
    result=await createCommissioningJob({directory:resolve(o.directory),selection:await parse(o.selection),
      baseDirectory:dirname(resolve(o.selection))});
  } else if(action==='inspect-transfer') result=await inspectCommissioningTransfer(resolve(o.directory));
  else {
    const job=await openCommissioningJob({directory:resolve(o.directory),...(o.store?{store:resolve(o.store)}:{})});
    try {
      if(action==='status')result=await job.inspect();
      else if(action==='report')result=await job.report();
      else if(action==='request') {
        if(!o.payload || !o.out || !['review','stage','select','receive-run','buyer-plan','receive'].includes(o['action-name']))
          throw new TypeError('Choose --action, --payload and --out.');
        const status=await job.inspect(), payload=await parse(o.payload);
        // Receive source paths resolve from their original input file.
        if(o['action-name']==='receive')
          for(const field of ['summaryFile','evidenceFile','outputFile'])
            if(payload[field])payload[field]=resolve(dirname(resolve(o.payload)),payload[field]);
        if(o['action-name']==='buyer-plan')
          for(const field of ['templateFile','outputDirectory'])
            if(payload[field])payload[field]=resolve(dirname(resolve(o.payload)),payload[field]);
        result={operationId:randomUUID(),expectedRevision:status.revision,action:o['action-name'],payload};
        await freshJson(o.out,result);
        result={commandFile:resolve(o.out),command:result};
      } else if(action==='apply') {
        if(!o.command)throw new TypeError('--command is required.');
        result=await job.execute(await parse(o.command));
      } else if(action==='run') {
        const generation=Number(o.expect);
        if(!o.provider || !o['operation-id'] || !Number.isSafeInteger(generation)||generation<0)
          throw new TypeError('Select --provider, original --operation-id and current --expect generation.');
        const run=await job.start({operationId:o['operation-id'],provider:o.provider,expectedGeneration:generation});
        const {completion,close,...started}=run;
        process.stdout.write(JSON.stringify(started,null,2)+'\n');
        await completion;
        result={operationId:o['operation-id'],state:'ORIGINAL_SELLER_STOPPED'};
      } else if(action==='export') {
        if(!o.out)throw new TypeError('--out is required.');
        result=await job.export(resolve(o.out));
      } else if(action==='report-html') {
        if(!o.out)throw new TypeError('--out is required.');
        const report=await job.report(),status=await job.inspect();
        await writeFile(resolve(o.out),renderCommissioningReport(report,status),{mode:0o600,flag:'wx'});
        result={reportFile:resolve(o.out),state:report.state};
      }
    } finally {await job.close();}
  }
  process.stdout.write(JSON.stringify(result,null,2)+'\n');return result;
}
if(process.argv[1] && import.meta.url===pathToFileURL(resolve(process.argv[1])).href)
  main().catch(error=>{process.stderr.write(JSON.stringify({code:error.code??'COMMISSIONING_ERROR',message:error.message})+'\n');process.exitCode=1;});
