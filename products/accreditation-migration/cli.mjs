#!/usr/bin/env node
import fs from 'node:fs/promises';
import path from 'node:path';
import {parseArgs} from 'node:util';
import {initializeWorkspace,acquireWorkspace,loadProject,saveAction,atomicWrite,native,inspectDocument,fillDocument,runReceiving,handover,receiveHandover,serve,APPLICATION_ROOT} from './server.mjs';
import {report,canonicalJSON,keyOf,prepareFormFill,reopenProject,serializeProject} from './workbench.mjs';
import {need,base64FromBytes,utf8Text} from './lib/data.mjs';
const {values:args,positionals}=parseArgs({allowPositionals:true,options:{
workspace:{type:'string'},source:{type:'string'},input:{type:'string'},output:{type:'string'},entity:{type:'string'},mapping:{type:'string'},database:{type:'string'},python:{type:'string'},port:{type:'string'},title:{type:'string'},'project-id':{type:'string'},'request-id':{type:'string'},'source-url':{type:'string'},'source-id':{type:'string'},'document-key':{type:'string'},'document-edition':{type:'string'},role:{type:'string'},visibility:{type:'string'},accreditation:{type:'string'},'template-edition':{type:'string'},help:{type:'boolean'},'max-body-mb':{type:'string'}}});
const command=positionals[0]||'help',python=args.python||'python3',readJSON=async filename=>JSON.parse(utf8Text(new Uint8Array(await fs.readFile(path.resolve(filename)))));
async function output(value){const text=canonicalJSON(value)+'\n';if(args.output)await atomicWrite(path.resolve(args.output),text);else process.stdout.write(text);}
const help={application:'Accreditation migration',runtime:'Node.js 20+, Python 3.11+',commands:{
init:'--workspace DIR [--source complete-source-packet.json] [--project-id ID] [--title TITLE]',
serve:'--workspace DIR [--port 8116] [--database target.sqlite] [--python python3]',
inspect:'--workspace DIR',
'import-csv':'--workspace DIR --entity ENTITY --input original.csv [--mapping field-maps.json] [--source-url URL] [--source-id ID]',
'add-document':'--workspace DIR --input original.docx [--document-key KEY] [--role application] [--visibility client_private] [--source-id S21] [--source-url URL]',
'map-document':'--workspace DIR --document-key ORIGINAL_KEY_OR_COMPOSITE_KEY',
'fill-document':'--workspace DIR --document-key ORIGINAL_COMPOSITE_KEY --mapping saved-bindings.json',
target:'--workspace DIR [--database target.sqlite]',
mapping:'--workspace DIR --input complete-mapping.json',
prepare:'--workspace DIR [--request-id ID]',
receive:'--workspace DIR [--request-id ID] [--database target.sqlite]',
extract:'--workspace DIR [--request-id ID] [--database target.sqlite]',
reconcile:'--workspace DIR --input complete-native-result.json [--request-id ID]',
fees:'--workspace DIR --input fee-calculation.json',
export:'--workspace DIR --output complete-handover.json',
'receive-handover':'--input complete-handover.json --output CLEAN_DIRECTORY'
}};
try{
 if(command==='help'||args.help){await output(help);}
 else if(command==='receive-handover'){need(args.input&&args.output,'ARGUMENT','Choose the complete input and a clean output directory.');const result=await receiveHandover(await readJSON(args.input),args.output);process.stdout.write(canonicalJSON(result)+'\n');}
 else if(command==='serve'){
  need(args.workspace,'ARGUMENT','Choose --workspace DIR.');const application=await serve({workspace:path.resolve(args.workspace),port:Number(args.port||8116),python,database:args.database,maxBodyBytes:Number(args['max-body-mb']||256)*1024*1024});
  process.stdout.write(canonicalJSON({url:application.url,workspace:application.workspace,pid:process.pid})+'\n');
  const stop=()=>application.close().then(()=>process.exit(0),error=>{process.stderr.write(error.stack+'\n');process.exit(1);});
  process.once('SIGINT',stop);process.once('SIGTERM',stop);
 }else{
  need(args.workspace,'ARGUMENT','Choose --workspace DIR.');const lock=await acquireWorkspace(path.resolve(args.workspace)),workspace=lock.root;
  try{
   let p=await initializeWorkspace(workspace,{source:args.source,projectId:args['project-id'],title:args.title}),detail;
   const change=async action=>{const result=await saveAction(workspace,{...action,expected_revision:p.revision});p=result.project;return result.detail;};
   const database=args.database?path.resolve(args.database):path.join(workspace,'target.sqlite');
   const request=()=>{const r=args['request-id']?p.runs.find(r=>r.request_id===args['request-id']):p.runs.at(-1);need(r,'REQUEST','Prepare or select the saved original request.');return r;};
   if(command==='init'||command==='inspect')detail=report(p);
   else if(command==='import-csv'){need(args.input&&args.entity,'ARGUMENT','Choose --input original.csv and --entity ENTITY.');const content=utf8Text(new Uint8Array(await fs.readFile(path.resolve(args.input)))),fields=args.mapping?await readJSON(args.mapping):undefined;detail=await change({type:'import_csv',entity:args.entity,filename:path.basename(args.input),content,fields,source_url:args['source-url'],source_id:args['source-id']});}
   else if(command==='add-document'){need(args.input,'ARGUMENT','Choose the complete original file.');const bytes=new Uint8Array(await fs.readFile(path.resolve(args.input)));const d=await change({type:'add_asset',filename:path.basename(args.input),base64:base64FromBytes(bytes),document_key:args['document-key']||path.basename(args.input),document_role:args.role||'application',visibility:args.visibility||'client_private',source_url:args['source-url'],source_id:args['source-id'],accreditation_key:args.accreditation,template_edition:args['template-edition'],document_edition_id:args['document-edition']});detail={document_key:keyOf(p,'document',d.document),path:d.asset.path,bytes:d.asset.bytes,sha256:d.asset.sha256};}
   else if(command==='map-document'||command==='fill-document'){
    const matching=p.records.document.filter(d=>keyOf(p,'document',d)===args['document-key']||d.document_key===args['document-key']);
    need(matching.length===1,'DOCUMENT','Choose one exact retained document edition.');const doc=matching[0],documentKey=keyOf(p,'document',doc);
    if(command==='map-document'){const map=await inspectDocument(workspace,documentKey,{python});await change({type:'document_controls',document_key:documentKey,map});detail={document:documentKey,counts:map.counts,original:{filename:map.original.filename,bytes:map.original.bytes,sha256:map.original.sha256}};}
    else{need(args.mapping,'ARGUMENT','Choose --mapping saved-bindings.json.');const input=await readJSON(args.mapping),prepared=prepareFormFill(p,{...input,document_key:documentKey}),filled=await fillDocument(workspace,prepared,{python});detail=await change({type:'document_filled',prepared,...filled});}
   }
   else if(command==='target'){const schema=await native(python,['describe','--database',database,'--contract',path.join(APPLICATION_ROOT,'contracts/data-contract.json')]);await change({type:'bind_target',schema});detail={mapping:p.mapping.mapping_id,version:p.mapping.version,schema};}
   else if(command==='mapping'){need(args.input,'ARGUMENT','Choose the complete mapping file.');await change({type:'save_mapping',mapping:await readJSON(args.input)});detail=p.mapping;}
   else if(command==='prepare'){const run=await change({type:'prepare_receiving',request_id:args['request-id']});const filename=path.join(workspace,'requests',run.request_id,'request.json');await atomicWrite(filename,run.request_text);detail={request_id:run.request_id,request_file:filename,bytes:run.request_bytes,sha256:run.request_sha256,source_revision:run.project_revision};}
   else if(command==='receive'){
    const id=request().request_id;await change({type:'native_started',request_id:id});
    try{const result=await runReceiving(workspace,{requestId:id,python,database});detail=await change({type:'receive_result',request_id:id,result});}
    catch(error){await change({type:'native_failure',request_id:id,error:{code:error.code||'NATIVE',message:error.message,details:error.details||{}}});throw error;}
   }
   else if(command==='extract'){const run=request(),result=await native(python,['extract','--database',database,'--project-id',p.project_id]);need(result.status==='EXTRACTED','TARGET_RETURN','Receive the actual native extract.');detail=await change({type:'receive_result',request_id:run.request_id,result});}
   else if(command==='reconcile'){need(args.input,'ARGUMENT','Choose the complete returned target result.');detail=await change({type:'receive_result',request_id:request().request_id,result:await readJSON(args.input)});}
   else if(command==='fees'){need(args.input,'ARGUMENT','Choose the complete fee calculation input.');detail=await change({type:'fee_calculation',input:await readJSON(args.input)});}
   else if(command==='export'){need(args.output,'ARGUMENT','Choose --output complete-handover.json.');const bundle=await handover(workspace);await atomicWrite(path.resolve(args.output),canonicalJSON(bundle)+'\n');process.stdout.write(canonicalJSON({output:path.resolve(args.output),project_id:p.project_id,revision:p.revision,members:bundle.members.length})+'\n');}
   else throw new Error('Unknown command '+command+'. Run help for the complete operating commands.');
   if(command!=='export')await output({command,project_id:p.project_id,revision:p.revision,result:detail??null});
  }finally{await lock.release();}
 }
}catch(error){process.stderr.write(JSON.stringify({error:{code:error.code||'APPLICATION',message:error.message,details:error.details||{}}})+'\n');process.exitCode=1;}
