/* MIT. Trusted installed validator for complete native Event mapping sources. */
import {readFile,writeFile,stat} from 'node:fs/promises';
import {dirname,join} from 'node:path';
import {fileURLToPath,pathToFileURL} from 'node:url';
import * as parser from './analysis-source.mjs';
import {createEventMappingWorkingAPI,eventMappingHash,eventMappingBytes,MAX_EVENT_MAPPING_WORKING_BYTES} from './mapping-working.mjs';
import {createEventMappingReviewAPI} from './mapping-review.mjs';
import {renderEventMappingWorking} from './mapping-working-html.mjs';
const need=(ok,message)=>{if(!ok)throw Error(message);};
const canonical=v=>Array.isArray(v)?'['+v.map(canonical).join(',')+']':v&&typeof v==='object'?'{'+Object.keys(v).sort().map(k=>JSON.stringify(k)+':'+canonical(v[k])).join(',')+'}':JSON.stringify(v);
const same=(a,b)=>canonical(a)===canonical(b);
export function checkNativeMappingSource(value,expected,parserSource){
 const workingAPI=createEventMappingWorkingAPI(parser),reviewAPI=createEventMappingReviewAPI({workingAPI,eventMappingHash,eventMappingBytes});
 const full=value?.schema==='stellar-forge.event-mapping-colleague-working.v1'?reviewAPI.reopen(value):workingAPI.reopen(value);
 const working=full.working??full,c=working.comparison,d=working.draft;
 need(working.original.comparison.receiver.core_sha256===eventMappingHash(parserSource),'The complete original source requires its matching installed parser.');
 for(const key of ['workspace_id','programme','input_id'])need(c[key]===expected[key],'The full source belongs to another native '+key+'.');
 need(same(c,expected.comparison),'The complete working source selects a different native comparison.');
 const status=workingAPI.status(working);need(status.ready,'Complete the current source comparison and every original review reason: '+status.errors.join(' '));
 const selection={comparison_sha256:c.comparison_sha256,programme_revision:c.programme_revision,baseline_operation_id:c.baseline_operation_id,reviewer:d.reviewer,note:d.note,decisions:c.required_decisions.map(name=>({name,reason:d.decisions[name]}))};
 need(same(c.mapping,parser.normalizeEventMapping(expected.mapping))&&same(selection,expected.mapping_review),'The compact native request differs from the selected complete working source.');
 return {full,evidence:{schema:'stellar-forge.event-mapping-native-source-validation.v1',working_schema:full.schema,workspace_id:c.workspace_id,programme:c.programme,input_id:c.input_id,comparison_sha256:c.comparison_sha256,programme_revision:c.programme_revision,baseline_operation_id:c.baseline_operation_id,mapping:c.mapping,mapping_review:selection,original_sha256:eventMappingHash(canonical(working.original)),local_assignment_ids:full.review_receiving?.local_assignment_ids??[],local_receipt_ids:full.review_receiving?.local_receipt_ids??[]}};
}
export async function main(argv=process.argv.slice(2)){
 need(argv.length===4,'Use the complete source, native selection, evidence output and editable HTML output paths.');
 const [input,selection,evidencePath,htmlPath]=argv,here=dirname(fileURLToPath(import.meta.url));
 async function exact(path,limit){const before=await stat(path);need(before.isFile()&&before.size>0&&before.size<=limit,'Read a complete regular source within its allowance.');const raw=await readFile(path),after=await stat(path);need(raw.length===before.size&&before.size===after.size&&before.mtimeMs===after.mtimeMs&&before.ctimeMs===after.ctimeMs&&before.ino===after.ino&&before.dev===after.dev,'The original source changed while being read.');return {raw,text:new TextDecoder('utf-8',{fatal:true,ignoreBOM:true}).decode(raw)};}
 const original=await exact(input,MAX_EVENT_MAPPING_WORKING_BYTES),expected=JSON.parse((await exact(selection,32*1024*1024)).text);
 const names=['analysis-source.mjs','mapping-working.mjs','mapping-working-html.mjs','mapping-working-ui.mjs','mapping-review.mjs','mapping-review-ui.mjs'];
 const bodies=Object.fromEntries(await Promise.all(names.map(async name=>[name,(await exact(join(here,name),2*1024*1024)).text])));
 const result=checkNativeMappingSource(JSON.parse(original.text),expected,bodies['analysis-source.mjs']);
 const html=renderEventMappingWorking(result.full,{parserSource:bodies['analysis-source.mjs'],modelSource:bodies['mapping-working.mjs'],controllerSource:bodies['mapping-working-ui.mjs'],reviewModelSource:bodies['mapping-review.mjs'],reviewControllerSource:bodies['mapping-review-ui.mjs']});
 need(Buffer.byteLength(html,'utf8')<=256*1024*1024,'Keep the complete editable HTML within its archive allowance; the whole original remains retained.');
 const evidence={...result.evidence,working_bytes:original.raw.length,working_sha256:eventMappingHash(original.text)};
 await writeFile(evidencePath,JSON.stringify(evidence)+'\n',{flag:'wx',mode:0o600});
 await writeFile(htmlPath,html,{flag:'wx',mode:0o600});
 return {working_bytes:evidence.working_bytes,working_sha256:evidence.working_sha256,html_bytes:Buffer.byteLength(html,'utf8'),html_sha256:eventMappingHash(html)};
}
if(process.argv[1]&&import.meta.url===pathToFileURL(process.argv[1]).href)main().then(v=>process.stdout.write(JSON.stringify(v)+'\n')).catch(e=>{process.stderr.write(String(e.message)+'\n');process.exitCode=1;});
