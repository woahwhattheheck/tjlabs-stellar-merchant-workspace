#!/usr/bin/env node
// MIT. Complete source/reporting operations on the original Research workspace.
import {parseArgs} from 'node:util';
import {basename,resolve} from 'node:path';
import {fileURLToPath} from 'node:url';
import {randomUUID} from 'node:crypto';
import {Readable} from 'node:stream';
import {ResearchWorkspaceClient} from '../workspace-client.mjs';
import {readResearchHostFile} from '../workspace-files.mjs';
import {writePortableFile} from '../portable.mjs';
import {need,parseJson,safeCode} from '../../node/store.mjs';
import {FLOW_DEFINITION_SCHEMA,FLOW_TEMPLATES,flowInput,flowDefinition} from './contracts.mjs';

export const STUDY_FLOW_COMMANDS=Object.freeze(['study-flow-help','study-flow-sources','study-flow-show','study-flow-report',
 'study-flow-definition','study-flow-preview','study-flow-prepare','study-flow-commit','study-flow-import-counts','study-flow-export']);
export const STUDY_FLOW_USAGE=String.raw`Study-flow reporting on the existing Research workspace

research-client COMMAND --connection-file /private/application-url.json
  [--directory /original/dossier-store] --id DOSSIER [OPTIONS]

  study-flow-sources [--question ID --review ID --workset ID --revision N --offset N --limit N]
  study-flow-show [--flow ID --edition ID --section overview|flows|editions|records|reports|studies|counts|issues|operations
                  --revision N --offset N --limit N]
  study-flow-report --flow ID [--edition ID --revision N --out complete-report.json]
  study-flow-definition --question ID [--review ID --workset ID --name TEXT
                        --template new-databases|new-all-sources|update-databases|update-all-sources]
                        --out definition.json
  study-flow-preview --definition definition.json [--flow ID --revision N
                     --source-mode current|retained --basis-edition ID --out preview.json]
  study-flow-import-counts --file exact-counts.csv --reason TEXT [--reference SOURCE --revision N --out imported.json]
  study-flow-prepare --action save|review|withdraw --actor-id ID --actor-name NAME --reason TEXT
                    [--flow ID --edition ID --revision N --request-id ID]
                    [--definition definition.json --source-mode current|retained --basis-edition ID]
                    --out exact-request.json
  study-flow-commit --input exact-request.json
  study-flow-export --flow ID [--edition ID --revision N --format svg|html|json|csv
                    --section counts|records|reports|studies|reasons|issues] --file NEW_OUTPUT

Sources and every page retain the original dossier revision. Later page offsets require --revision.
Definition creates an editable selection; identification methods and stage roles must be chosen explicitly.
Preview and count-file import are read-only. Prepare writes the exact request locally, without a dossier mutation.
Commit records that request through the original transaction. After a lost reply, repeat the SAME request file.
A revised payload requires a new request ID; saved history remains intact.
Historical --basis-edition with source-mode retained reuses that exact flow's original source basis.
Use the original export/reopen commands for the complete portable history.
`;
const names=['connection-file','directory','workspace-id','id','revision','flow','edition','section','offset','limit',
 'question','review','workset','input','file','definition','source-mode','basis-edition','actor-id','actor-name',
 'reason','action','request-id','out','format','reference','name','template'];
const integer=(value,minimum=0)=>{
 if(value===undefined)return undefined;need(/^(0|[1-9][0-9]*)$/.test(value),'FLOW_CLI_INTEGER_INVALID');
 const n=Number(value);need(Number.isSafeInteger(n)&&n>=minimum,'FLOW_CLI_INTEGER_INVALID');return n;
};
async function inputFile(file,maximum=16*1024*1024){
 need(typeof file==='string'&&file,'FLOW_INPUT_FILE_REQUIRED');
 return readResearchHostFile(resolve(file),maximum);
}
const document=async file=>parseJson(await inputFile(file));
async function saveJson(file,value){
 need(typeof file==='string'&&file,'FLOW_OUTPUT_FILE_REQUIRED');
 const bytes=Buffer.from(JSON.stringify(value,null,2)+'\n');
 return writePortableFile(resolve(file),{filename:basename(file),contentType:'application/json; charset=utf-8',body:Readable.from([bytes])});
}
export async function main(argv=process.argv.slice(2),{output=process.stdout,signal}={}){
 const command=argv[0];
 if(!command||command==='study-flow-help'||['--help','-h'].includes(command)){output.write(STUDY_FLOW_USAGE);return;}
 need(STUDY_FLOW_COMMANDS.includes(command),'FLOW_COMMAND_INVALID');
 const parsed=parseArgs({args:argv.slice(1),options:Object.fromEntries(names.map(name=>[name,{type:'string'}])),strict:true,allowPositionals:false});
 const o=parsed.values;need(o['connection-file']&&o.id,'FLOW_CONNECTION_AND_DOSSIER_REQUIRED');
 const client=new ResearchWorkspaceClient({connectionFile:resolve(o['connection-file']),
 ...(o.directory?{directory:resolve(o.directory)}:{}),...(o['workspace-id']?{expectedWorkspaceId:o['workspace-id']}:{})});
 const readOptions={revision:integer(o.revision,1),flowId:o.flow,editionId:o.edition,signal};
 const actualRevision=async()=>readOptions.revision??(await client.metadata(o.id)).revision;
 let value;
 try{
 await client.status({signal});
 if(command==='study-flow-sources')value=await client.studyFlowSources(o.id,{...readOptions,questionId:o.question,reviewId:o.review,
 workSetId:o.workset,offset:integer(o.offset),limit:integer(o.limit,1)});
 else if(command==='study-flow-show')value=await client.studyFlow(o.id,{...readOptions,section:o.section,
 offset:integer(o.offset),limit:integer(o.limit,1)});
 else if(command==='study-flow-report')value=await client.studyFlowReport(o.id,readOptions);
 else if(command==='study-flow-definition'){
 need(o.question,'FLOW_QUESTION_REQUIRED');
 const source=await client.studyFlowSources(o.id,{questionId:o.question,reviewId:o.review,revision:await actualRevision(),signal});
 const workSets=source.workSets.filter(v=>(!o.workset||v.id===o.workset)&&(!o.review||v.reviewId===o.review));
 need(!o.workset||workSets.some(v=>v.id===o.workset),'ELIGIBILITY_WORKSET_NOT_FOUND');
 const editions=[...new Set(workSets.flatMap(v=>v.editionIds))];
 const definition=flowDefinition({schema:FLOW_DEFINITION_SCHEMA,name:o.name??'Study flow',
 template:o.template??'new-all-sources',questionId:o.question,reviewId:o.review??null,
 workSetIds:o.review?workSets.map(v=>v.id):[],editionIds:editions.length?editions:source.editions.map(v=>v.id),
 routes:[],stages:[],records:[],retrievals:[],reportAnchors:[],reportedCounts:[],exclusionReasons:[],
 previous:{},coverage:{statement:'',completeSearch:false},notes:''});
 value=await saveJson(o.out,definition);output.write(JSON.stringify({file:value,sourceRevision:source.dossier.revision,
 next:'Choose identification routes, native stage roles and reporting coverage in the saved definition or Study flow pane.'},null,2)+'\n');return value;
 }else if(command==='study-flow-preview'){
 value=await client.previewStudyFlow(o.id,{expectedRevision:await actualRevision(),definition:await document(o.definition),
 ...(o.flow?{flowId:o.flow}:{}),sourceMode:o['source-mode']??'current',basisEditionId:o['basis-edition']??null},{signal});
 }else if(command==='study-flow-import-counts'){
 const bytes=await inputFile(o.file,1024*1024);
 const body=new TextDecoder('utf-8',{fatal:true,ignoreBOM:true}).decode(bytes);
 value=await client.importStudyFlowCounts(o.id,{expectedRevision:await actualRevision(),body,filename:basename(o.file),
 reference:o.reference??'',reason:o.reason},{signal});
 }else if(command==='study-flow-prepare'){
 need(o.out&&o['actor-id']&&o['actor-name']&&o.reason,'FLOW_ACTOR_REASON_AND_OUTPUT_REQUIRED');
 const action=o.action??'save',revision=await actualRevision();
 let selected;if(o.flow)selected=await client.studyFlow(o.id,{flowId:o.flow,revision,signal});
 const request={requestId:o['request-id']??'flow_'+randomUUID(),expectedRevision:revision,
 actor:{id:o['actor-id'],name:o['actor-name']},action,...(o.flow?{flowId:o.flow}:{}),
 data:action==='save'?{definition:await document(o.definition),sourceMode:o['source-mode']??'current',
 basisEditionId:o['basis-edition']??null,supersedes:selected?.flows.find(v=>v.id===o.flow)?.currentEditionId??null,reason:o.reason}:
 {editionId:o.edition??selected?.flows.find(v=>v.id===o.flow)?.currentEditionId,reason:o.reason}};
 value=await saveJson(o.out,flowInput(request));output.write(JSON.stringify({file:value,requestId:request.requestId,
 expectedRevision:revision,action,prepared:true},null,2)+'\n');return value;
 }else if(command==='study-flow-commit'){
 const request=flowInput(await document(o.input));
 value=await client.reviewStudyFlow(o.id,request,{signal});
 }else if(command==='study-flow-export'){
 need(o.file,'FLOW_OUTPUT_FILE_REQUIRED');value=await client.exportStudyFlow(o.id,{...readOptions,file:resolve(o.file),
 format:o.format??'json',section:o.section??'counts'});
 }
 if(o.out&&command!=='study-flow-export')value={file:await saveJson(o.out,value)};
 output.write(JSON.stringify(value,null,2)+'\n');return value;
 }finally{await client.close();}
}
if(process.argv[1]&&resolve(process.argv[1])===fileURLToPath(import.meta.url)){
 main().catch(error=>{process.stderr.write(JSON.stringify({error:safeCode(error.code??error.message,'FLOW_COMMAND_FAILED'),
 ...(error.outcomeUnknown!==undefined?{outcomeUnknown:error.outcomeUnknown,recovery:error.recovery}:{})})+'\n');process.exitCode=1;});
}
