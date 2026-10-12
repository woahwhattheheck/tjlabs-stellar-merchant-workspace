#!/usr/bin/env node
/** Complete DataCove case, Workshare and Delivery receiving through the maintained console. */
import fs from 'node:fs';
import {mkdir,readFile,writeFile,lstat} from 'node:fs/promises';
import {resolve,join,dirname} from 'node:path';
import {fileURLToPath,pathToFileURL} from 'node:url';
import {createHash,randomUUID} from 'node:crypto';

const CASE_ID = 'datacove-sensorthings-commissioning-20261012';
const OPERATION_ID = 'datacove-complete-workshare-intake-0c7a-20261012';
const SOURCE_SHA256 = '8cb5bc3256d7e1bebe154cce7017a6e4510f0784643ffb79cc9235be1b7a97a7';
const SOURCE_BYTES = 38686;
const basename = dirname(fileURLToPath(import.meta.url));
const hash = bytes => createHash('sha256').update(bytes).digest('hex');
const encoded = value => JSON.stringify(value,null,2)+'\n';
function problem(message,code='DATACOVE_RECEIVING_IDENTITY') {
  return Object.assign(new Error(message),{code});
}
async function retained(path,content) {
  const bytes = Buffer.isBuffer(content)?content:Buffer.from(content);
  try { await writeFile(path,bytes,{flag:'wx',mode:0o600}); }
  catch(error) { if(error.code!=='EEXIST')throw error;
    const actual=await readFile(path);
    if(!actual.equals(bytes))throw problem('An original retained file differs: '+path);
  }
}
function argumentsFrom(argv) {
  const out={};
  for(let i=0;i<argv.length;i+=2) {
    const key=argv[i],value=argv[i+1];
    if(!['--console-root','--workspace','--input','--out'].includes(key)||!value||out[key])
      throw problem('Use --console-root ABS --workspace ABS --out ABS [--input ORIGINAL_JSON].','DATACOVE_RECEIVING_ARGUMENTS');
    out[key]=value;
  }
  for(const key of ['--console-root','--workspace','--out'])
    if(!out[key]||resolve(out[key])!==out[key])throw problem('Use an absolute '+key+' path.','DATACOVE_RECEIVING_ARGUMENTS');
  return out;
}
function verifySaved(state,sourceSha) {
  const run=state.selected;
  if(!run)return null;
  if(run.operation_id!==OPERATION_ID||run.cases?.length!==1||run.cases[0].case_id!==CASE_ID||
     !run.sources?.some(source=>source.sha256===sourceSha))
    throw problem('The existing operation belongs to different original source or case.');
  return run;
}
export async function receiveDataCove({consoleRoot,workspace,inputFile=join(basename,'datacove-case-receiving.json'),directory}) {
  consoleRoot=resolve(consoleRoot);workspace=resolve(workspace);directory=resolve(directory);
  const source=await readFile(inputFile);
  if(source.length!==SOURCE_BYTES||hash(source)!==SOURCE_SHA256)throw problem('Use the exact original complete DataCove receiving source.');
  const packet=JSON.parse(new TextDecoder('utf-8',{fatal:true}).decode(source));
  if(packet.prepared_case?.id!==CASE_ID||packet.workshare_input?.plan?.phases?.length!==6||
     packet.workshare_input?.plan?.commercial?.amount!=='7800.00')
    throw problem('The original case, six-phase plan or fixed terms differ.');
  // The maintained Workshare derives this relationship from the case's literal URLs.
  const record=packet.prepared_case.case,sourceCase=packet.workshare_input.source,plan=packet.workshare_input.plan;
  const partnerId='case-party-'+hash(Buffer.from(record.partner_url)).slice(0,16);
  const buyerId='case-buyer-'+hash(Buffer.from(record.buyer_url)).slice(0,16);
  const relationship='DSR-'+partnerId+'--'+buyerId;
  if(sourceCase.partner.source_url!==record.partner_url||sourceCase.opportunity.source_url!==record.buyer_url||
     sourceCase.partner.id!==partnerId||sourceCase.opportunity.id!==buyerId||
     sourceCase.operation_id!==relationship||plan.operation_id!==relationship)
    throw problem('The selected Workshare must identify this original case and its URL-derived relationship.');
  await mkdir(directory,{recursive:true,mode:0o700});
  const info=await lstat(directory);
  if(!info.isDirectory()||info.isSymbolicLink()||(info.mode&0o077)!==0)
    throw problem('Use an existing private receiving directory.');
  const module=await import(pathToFileURL(join(consoleRoot,'tools/revenue_owner_console_20261010/case_receiving_cli.mjs')));
  const cli=module.main;
  if(typeof cli!=='function'||typeof module.exportReceivingRun!=='function')
    throw problem('Use the current installed native Case Receiving CLI.','DATACOVE_RECEIVING_RUNTIME');
  const status=await cli(['status','--workspace',workspace,'--run',OPERATION_ID]);
  let saved=verifySaved(status,SOURCE_SHA256),applied=null,reviewDirectory=null;
  if(!saved) {
    reviewDirectory=join(directory,'review-'+randomUUID());
    await mkdir(reviewDirectory,{mode:0o700});
    const original=join(reviewDirectory,'DataCove_Complete_Workshare_Receiving.json');
    await retained(original,source);
    const inspectionPath=join(reviewDirectory,'inspection.json');
    await cli(['inspect','--workspace',workspace,'--source',original,'--operation-id',OPERATION_ID,
      '--reviewed-by','0C7A DataCove delivery owner','--title','DataCove complete source-to-FROST commissioning workshare',
      '--out',inspectionPath]);
    const inspection=JSON.parse(await readFile(inspectionPath,'utf8'));
    const entries=inspection.inspection?.entries;
    if(!Array.isArray(entries)||entries.length!==1||entries[0].case_id!==CASE_ID)
      throw problem('Inspect only the original complete DataCove company case.');
    const entry=entries[0];
    const choices={...entry.default_selection,delivery:'MERGE',scope:'KEEP',mail:'KEEP',
      source_events:'IMPORT',workshare:'IMPORT',retained_work:'KEEP',delivery_board:'START',item_choices:{}};
    const incomingIds=new Set(packet.prepared_case.delivery.items.map(item=>item.id));
    for(const conflict of entry.item_conflicts||[]) {
      const itemId=conflict.id||conflict.item_id||conflict.incoming?.id;
      if(!incomingIds.has(itemId))throw problem('A changed work item is outside this original packet.');
      choices.item_choices[itemId]=['datacove-original-assets','datacove-original-native-receiving'].includes(itemId)?'CURRENT':'INCOMING';
    }
    const request={...inspection.request,selections:[choices]};
    const requestPath=join(reviewDirectory,'selected.request.json');
    await retained(requestPath,encoded(request));
    const reviewPath=join(reviewDirectory,'review.json');
    const reviewed=await cli(['preview','--workspace',workspace,'--request',requestPath,'--out',reviewPath]);
    if(reviewed.state!=='REVIEWED')throw Object.assign(problem('Resolve the original selected-case review.','DATACOVE_RECEIVING_REVIEW'),{details:reviewed});
    // The native writer owns the selected-case transaction and original operation replay.
    applied=await module.applyReceivingRequest({workspaceDirectory:workspace,
      request:JSON.parse(await readFile(reviewPath,'utf8')).request,directory:join(directory,'complete-handover')});
    saved=verifySaved(await cli(['status','--workspace',workspace,'--run',OPERATION_ID]),SOURCE_SHA256);
    if(!saved)throw problem('The native save did not reopen the original receiving run.');
  }
  const exported=await module.exportReceivingRun({workspaceDirectory:workspace,runId:OPERATION_ID,
    directory:join(directory,'complete-handover')});
  const result={schema:'commons.datacove-case-receiving-result.v1',operation_id:OPERATION_ID,
    case_id:CASE_ID,source:{filename:'DataCove_Complete_Workshare_Receiving.json',bytes:SOURCE_BYTES,sha256:SOURCE_SHA256},
    receiving_run:saved,applied,exported,review_directory:reviewDirectory,completed_at:new Date().toISOString()};
  // Each final observation is retained independently; the original native output directory pins its saved edition.
  const resultPath=join(directory,'result-'+randomUUID()+'.json');
  await retained(resultPath,encoded(result));
  return {...result,result_path:resultPath};
}
export async function main(argv=process.argv.slice(2)) {
  const args=argumentsFrom(argv);
  return receiveDataCove({consoleRoot:args['--console-root'],workspace:args['--workspace'],
    inputFile:args['--input'],directory:args['--out']});
}
if(process.argv[1]&&resolve(process.argv[1])===fileURLToPath(import.meta.url)) {
  main().then(value=>process.stdout.write(encoded(value))).catch(error=>{
    process.stderr.write(encoded({error:error.code||'DATACOVE_RECEIVING_FAILED',message:error.message,
      ...(error.details?{details:error.details}:{})}));process.exitCode=1;
  });
}
