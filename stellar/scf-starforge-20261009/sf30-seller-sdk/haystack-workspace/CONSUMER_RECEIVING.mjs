#!/usr/bin/env node
// MIT. Complete source-selected consumer receiving, review and contractor-return journey.
import {promises as fs,constants as FS} from "node:fs";
import {join,resolve,dirname} from "node:path";
import {pathToFileURL,fileURLToPath} from "node:url";
import {createHash} from "node:crypto";
import {HaystackWorkspace} from "./store.mjs";
import {receiveBundle,verifyBundle,PACKAGE_FORMAT} from "./portable.mjs";
import {parseGrid,encodeGrid} from "./haystack-types.mjs";
import {stringifyJson,canonicalJson} from "./json-codec.mjs";
import {plainRead,exists,syncDirectory} from "./files.mjs";
import {newId} from "./util.mjs";
import {spawn} from "node:child_process";
import {startServer} from "./server.mjs";
import {runConsumerBrowser} from "./CONSUMER_BROWSER.mjs";
import {APPLICATION_FILES} from "./portable.mjs";

export const CONSUMER_RECEIVING_SCHEMA="commons.haystack.consumer-receiving.v1";
const ROOT=dirname(fileURLToPath(import.meta.url));
const CHARLIE_SHA="c44a410c183f9ef9add5757955637d1ce0bad0dabf418f80e6b9a7b4a2b9afe9";
const sha=b=>createHash("sha256").update(b).digest("hex");
const bytes=v=>Buffer.from(stringifyJson(v,2)+"\n");
const equal=(a,b)=>canonicalJson(a)===canonicalJson(b);
const copy=v=>JSON.parse(stringifyJson(v));
const clean=v=>{const result=copy(v);delete result.replayed;return result;};
function need(value,message){if(!value)throw Error(message);}
function uuid(seed){const h=sha(Buffer.from(seed));return h.slice(0,8)+"-"+h.slice(8,12)+"-4"+h.slice(13,16)+"-a"+h.slice(17,20)+"-"+h.slice(20,32);}
async function read(path){return JSON.parse(new TextDecoder("utf-8",{fatal:true}).decode(await plainRead(path)));}
async function optional(path){return await exists(path)?read(path):null;}
async function fileIdentity(path){
 const file=await fs.open(path,FS.O_RDONLY|(FS.O_NOFOLLOW||0)|(FS.O_NONBLOCK||0));
 try{
  const before=await file.stat({bigint:true});need(before.isFile(),"The retained artifact must be an ordinary file.");
  const digest=createHash("sha256"),buffer=Buffer.alloc(262144);let count=0;
  for(;;){const {bytesRead}=await file.read(buffer,0,buffer.length,null);if(!bytesRead)break;digest.update(buffer.subarray(0,bytesRead));count+=bytesRead;}
  const after=await file.stat({bigint:true}),current=await fs.lstat(path,{bigint:true});
  const signature=s=>[s.dev,s.ino,s.size,s.mtimeNs,s.ctimeNs].join(":");
  need(current.isFile()&&!current.isSymbolicLink()&&signature(before)===signature(after)&&signature(before)===signature(current)&&BigInt(count)===before.size,"The original artifact changed while it was read.");
  return{path,bytes:count,sha256:digest.digest("hex")};
 }finally{await file.close();}
}
async function publishTemporary(temporary,path,expected){
 try{await fs.link(temporary,path);}catch(error){if(error.code!=="EEXIST")throw error;}
 const actual=await fileIdentity(path);need(actual.bytes===expected.bytes&&actual.sha256===expected.sha256,"A retained original artifact changed.");
 await syncDirectory(dirname(path));return actual;
}

async function retainFile(source,target,expected){
 if(!(await exists(target))){
  try{await fs.link(source,target);}
  catch(error){
   if(error.code!=="EEXIST"){
    if(error.code!=="EXDEV")throw error;
    const temporary=target+".pending-"+newId();let input,output;
    try{
     input=await fs.open(source,FS.O_RDONLY|(FS.O_NOFOLLOW||0)|(FS.O_NONBLOCK||0));
     const before=await input.stat({bigint:true});need(before.isFile(),"The original delivery must be an ordinary file.");
     output=await fs.open(temporary,"wx",0o600);
     const digest=createHash("sha256"),buffer=Buffer.alloc(262144);let count=0;
     for(;;){
      const {bytesRead}=await input.read(buffer,0,buffer.length,null);if(!bytesRead)break;
      const chunk=buffer.subarray(0,bytesRead);count+=bytesRead;
      need(count<=expected.bytes,"The original delivery grew during its copy.");
      digest.update(chunk);await output.writeFile(chunk);
     }
     const after=await input.stat({bigint:true}),current=await fs.lstat(source,{bigint:true});
     const signature=v=>[v.dev,v.ino,v.size,v.mtimeNs,v.ctimeNs].join(":");
     need(current.isFile()&&!current.isSymbolicLink()&&signature(before)===signature(after)&&signature(before)===signature(current)&&
      BigInt(count)===before.size&&count===expected.bytes&&digest.digest("hex")===expected.sha256,
      "The original delivery changed during its complete copy.");
     await output.sync();await output.close();output=null;await input.close();input=null;
     await publishTemporary(temporary,target,expected);
    }finally{
     if(output)await output.close();if(input)await input.close();
     await fs.unlink(temporary).catch(error=>{if(error.code!=="ENOENT")throw error;});
    }
   }
  }
  await syncDirectory(dirname(target));
 }
 const actual=await fileIdentity(target);
 need(actual.bytes===expected.bytes&&actual.sha256===expected.sha256,"The retained complete artifact differs from its original native file.");
 return actual;
}
async function retainBytes(path,value){
 const expected={bytes:value.length,sha256:sha(value)};
 if(await exists(path)){const actual=await fileIdentity(path);need(actual.bytes===expected.bytes&&actual.sha256===expected.sha256,"A retained original artifact changed.");return actual;}
 const temporary=path+".pending-"+newId();let file;
 try{file=await fs.open(temporary,"wx",0o600);await file.writeFile(value);await file.sync();await file.close();file=null;return await publishTemporary(temporary,path,expected);}
 finally{if(file)await file.close();await fs.unlink(temporary).catch(error=>{if(error.code!=="ENOENT")throw error;});}
}
async function retain(path,value){await retainBytes(path,bytes(value));return value;}
function sameSource(source,expected){need(source.bytes.length===expected.bytes&&sha(source.bytes)===expected.sha256,"The original native source bytes changed.");}


/** Executes the selected local maintained parser. It never invokes a station,
 * device, email, ontology service or another company's original programme. */
export async function runConsumerReceiving(input) {
 need(input?.schema===CONSUMER_RECEIVING_SCHEMA&&/^[0-9a-f]{8}(?:-[0-9a-f]{4}){3}-[0-9a-f]{12}$/.test(input.operationId),"Retain the complete original consumer programme UUID.");
 need(input.directory?.startsWith("/")&&input.author?.trim(),"Select the original absolute programme directory and named receiving operator.");
 const root=resolve(input.directory),phases=join(root,"phases"),outputs=join(root,"outputs");
 need(root!==dirname(root),"Select an ordinary owned programme directory.");
 await fs.mkdir(root,{recursive:true,mode:0o700});need(!(await fs.lstat(root)).isSymbolicLink(),"Use the original ordinary directory.");
 await retain(join(root,"input.json"),input);await fs.mkdir(phases,{recursive:true});await fs.mkdir(outputs,{recursive:true});
 const artifacts=[],actions=[];
 const priorComplete=await optional(join(root,"complete-result.json"));if(priorComplete)return priorComplete;
 async function progress(phase,state,details={}){
  const row={schema:"commons.haystack.consumer-programme-progress.v1",operationId:input.operationId,phase,state,observedAt:new Date().toISOString(),pid:process.pid,...details};
  const file=await fs.open(join(root,"progress.ndjson"),"a",0o600);
  try{await file.writeFile(stringifyJson(row)+"\n");await file.sync();}finally{await file.close();}
  process.stderr.write("CONSUMER_PROGRESS "+stringifyJson(row)+"\n");
 }
 async function saved(name,producer){const path=join(phases,name+".json"),old=await optional(path);if(old)return old;await progress(name,"started");const value=await producer();await retain(path,value);await progress(name,"completed");return value;}
 async function artifact(name,value){const result=await retainBytes(join(outputs,name),value);artifacts.push({name,...result});return result;}
 async function action(workspace,name,kind,fields){
  await progress(name,"started",{action:kind});
  const intentPath=join(phases,name+".request.json"),resultPath=join(phases,name+".result.json");
  let intent=await optional(intentPath),result=await optional(resultPath);
  const originalWriter=await workspace.writer();
  if(originalWriter){await progress(name,"recovering-original-writer",{writerId:originalWriter.id});await workspace.recoverWriter(originalWriter.id);}
  const current=await workspace.read();
  if(intent){
   const selected={...intent.args};delete selected.expectedRevision;delete selected.operationId;
   need(intent.workspaceId===current.workspaceId&&intent.action===kind&&equal(selected,fields),"The original retained action belongs to another selection: "+name);
  }else{
   intent={schema:"commons.haystack.projection-programme-request.v1",workspaceId:current.workspaceId,action:kind,
    args:{...copy(fields),expectedRevision:current.revision,operationId:uuid(input.operationId+"/"+name)}};
   await retain(intentPath,intent);
  }
  let actual;
  try{actual=await workspace.dispatch("operation.read",{operationId:intent.args.operationId});}
  catch(error){if(error.status!==404)throw error;actual=await workspace.dispatch(kind,intent.args);}
  need(actual.workspaceId===intent.workspaceId&&actual.operationId===intent.args.operationId,"The original native response identity changed: "+name);
  if(result)need(equal(clean(result),clean(actual)),"The saved native operation result changed: "+name);
  else result=await retain(resultPath,actual);
  actions.push({name,workspaceId:intent.workspaceId,action:kind,operationId:intent.args.operationId,revision:result.revision});
  await progress(name,"completed",{action:kind,revision:result.revision});
  return result;
 }
 async function query(workspace,kind,args){const s=await workspace.read();return workspace.dispatch(kind,{...args,expectedRevision:s.revision});}
 async function projection(workspace,projectionId,versionId){return query(workspace,"projection.read",{projectionId,...(versionId?{versionId}:{})});}
 async function deliver(workspace,name,fields){
  globalThis.gc?.();
  const result=await action(workspace,name,"delivery.prepare",fields);
  const manifest=await workspace.deliveryManifest(result.operationId);
  need(manifest.bytes===result.bytes&&manifest.sha256===result.sha256&&manifest.name===result.name,
   "The retained native delivery manifest differs from its original operation return.");
  const source=join(workspace.deliveryDirectory(result.operationId),"payload"),original=await fileIdentity(source);
  need(original.bytes===result.bytes&&original.sha256===result.sha256,"A native delivery differs from its actual original return.");
  const artifactName=name+"-"+result.name.replace(/[^A-Za-z0-9._-]/g,"_");
  const file=await retainFile(source,join(outputs,artifactName),original);
  artifacts.push({name:artifactName,...file});globalThis.gc?.();return{result,file};
 }

 const manifest=input.application;
 need(Array.isArray(manifest)&&new Set(manifest.map(f=>f.name)).size===manifest.length,"Supply the complete source-selected application manifest.");
 for(const name of APPLICATION_FILES)need(manifest.some(f=>f.name===name),"Application source manifest omits "+name);
 for(const f of manifest){
  need(/^[A-Za-z0-9_.-]+$/.test(f.name),"Select application filenames without paths.");
  const actual=await fileIdentity(join(ROOT,f.name));need(actual.bytes===f.bytes&&actual.sha256===f.sha256,"Selected application source changed: "+f.name);
 }
 const original=await plainRead(join(ROOT,"fixture-charlie.json"));need(sha(original)===CHARLIE_SHA,"Retain the exact original full Charlie source.");
 const author=new HaystackWorkspace(join(root,"author"));
 await author.initialize("Selected consumer acceptance and contractor receiving");
 const originalSource=await action(author,"original-source","source.import",{name:"fixture-charlie.json",format:"json-v4",sourceUrl:"https://project-haystack.org/example/download/charlie.json",base64:original.toString("base64"),select:true});
 const modelPreview=await saved("original-model-preview",()=>query(author,"semantic.model.preview",{
  title:"Original point identity and display model",namespace:"urn:consumer-receiving:",
  selection:{nativeSourceIds:[originalSource.source.id],intakeIds:[]},
  naming:{template:"{nativeId}",case:"preserve",separator:"_",description:"Keep the unchanged original native identifier."},mappings:[],
  defaultClasses:{site:"urn:consumer:Site",equip:"urn:consumer:Equipment",point:"urn:consumer:Point",other:"urn:consumer:Other"}
 }));
 const model=await action(author,"original-model","semantic.model.create",{selection:modelPreview.selection,contextId:modelPreview.contextId,content:modelPreview.content,author:input.author,note:"Full 624-row original source retained; this course selects native ID and display fields."});
 const profile={title:"Original identities and display names",description:"Two explicit source-preserving columns for the selected maintained JSON v4 parser.",
  entityIds:modelPreview.content.entities.map(e=>e.id),columns:["id","dis"].map(tag=>({tag,source:{kind:"native",sourceId:originalSource.source.id,tag},conversion:{kind:"preserve",blank:"keep",trim:false}})),overrides:[],meta:{ver:"3.0"}};
 const projected=await action(author,"original-projection","projection.create",{modelId:model.model.id,versionId:model.version.id,profile,author:input.author,note:"Source-preserving ID and display mapping."});
 await action(author,"original-projection-review","projection.review",{projectionId:projected.projection.id,expectedHeadId:projected.version.id,decision:"ready",author:input.author,note:"Every original input row is present with unchanged native identity."});
 const projectedFile=await deliver(author,"selected-parser-input",{kind:"projection-grid",projectionId:projected.projection.id,versionId:projected.version.id,format:"json"});
 const gridBytes=await plainRead(projectedFile.file.path);
 const rows=parseGrid(original,{format:"json-v4"}).grid.rows;
 const expected=rows.map(r=>({id:r.id.val,values:{id:r.id,...(Object.hasOwn(r,"dis")?{dis:r.dis}:{})}}));
 need(expected.length===624&&new Set(expected.map(r=>r.id)).size===624,"The independent original full ID population differs.");
 const expectedFile=await artifact("independent-original-expected-population.json",bytes({source:{bytes:original.length,sha256:sha(original)},rows:expected}));
 async function evidence(workspace,name,path,mediaType="application/json"){
  const value=await plainRead(path),file=await action(workspace,name,"consumer.file.retain",{name:path.split("/").at(-1),mediaType,base64:value.toString("base64"),author:input.author});return file.file.id;
 }
 const inputId=await evidence(author,"retain-target-input",projectedFile.file.path),expectedId=await evidence(author,"retain-independent-expectations",expectedFile.path);
 const parserSource=String.raw`import { promises as fs } from "node:fs";
import { parseGrid } from "./haystack-types.mjs";
import { stringifyJson } from "./json-codec.mjs";
const input = await fs.readFile(process.argv[2]);
const decoded = parseGrid(input,{format:"json-v4"});
const result = {format:"commons.haystack.actual-parser-observation.v1",parser:"retained haystack-types.mjs parseGrid",rows:decoded.grid.rows.map(row=>({id:row.id.val,values:{id:row.id,...(Object.hasOwn(row,"dis")?{dis:row.dis}:{})}})),diagnostics:decoded.diagnostics};
process.stdout.write(stringifyJson(result)+"\n");
`;
 const commandPath=join(ROOT,"consumer-parser-command-"+input.operationId+".mjs");
 await retainBytes(commandPath,Buffer.from(parserSource));
 await artifact("actual-parser-command.mjs",Buffer.from(parserSource));
 const commandId=await evidence(author,"retain-parser-command",commandPath,"text/javascript");
 const target={family:"Haystack JSON v4",product:"Retained haystack-types.mjs parseGrid",version:"selected application source",build:manifest.find(f=>f.name==="haystack-types.mjs").sha256,
  environment:"Original local Node "+process.version+" receiving workspace",operator:input.author};
 const plan={title:"Complete native parser and consumer evidence handover",projectionId:projected.projection.id,projectionVersionId:projected.version.id,target,
  interface:{format:"json-v4",description:"Exact original ID/display projection received by the maintained local parser.",inputFileIds:[inputId],mappingFileIds:[]},
  acceptanceOwner:input.author,questions:[{id:"original-identities-and-display",label:"All 624 original IDs and selected display values remain exact",
   query:"parseGrid(input,{format:'json-v4'}).grid.rows; compare the full original ID set and typed id/dis values",
   expected,expectedEvidenceFileIds:[expectedId],note:"Expected rows selected from the retained original Charlie fixture before opening any target run."}],
  boundaryNote:"This actual local parser receiving course is distinct from Niagara, a live station or a customer acceptance. Partner-operated target evidence remains its original named consumer."};
 const project=await action(author,"frozen-consumer-plan","consumer.project.create",{content:plan,author:input.author,note:"Independent full source population frozen before native consumer execution."});
 const ready=await action(author,"frozen-consumer-plan-review","consumer.plan.review",{projectId:project.project.id,expectedHeadId:project.version.id,decision:"ready",author:input.author,note:"Selected exact original input, native parser build, full expected IDs and independent evidence."});
 async function openRun(name,mode,supersedesRunId=null){
  return action(author,name,"consumer.run.open",{projectId:project.project.id,expectedHeadId:project.version.id,planReviewId:ready.review.id,mode,supersedesRunId,author:input.author,note:"Retain this original execution identity and actual process result."});
 }
 async function execute(name,script,args=[],interrupt=false){
  return saved(name,async()=>{
   const intentPath=join(phases,name+".child.json");
   const completedProcess=await optional(join(phases,name+".process-result.json"));if(completedProcess)return completedProcess;
   need(!await exists(intentPath),"The original read-only child has an unresolved prior lifetime. Reconcile its retained PID/result before continuing this same stage: "+name);
   const stdout=join(outputs,name+".stdout"),stderr=join(outputs,name+".stderr");
   const out=await fs.open(stdout,"wx",0o600),err=await fs.open(stderr,"wx",0o600);
   const startedAt=new Date().toISOString();
   let child,closed=false,exit,timer,killTimer,bytesOut=0,bytesErr=0;
   try{
    child=spawn(process.execPath,[script,...args],{cwd:ROOT,stdio:["ignore","pipe","pipe"],env:process.env});
    const exitPromise=new Promise((resolve,reject)=>{child.once("error",reject);child.once("close",(code,signal)=>{closed=true;resolve({code,signal});});});
    exitPromise.catch(()=>{});
    let outputOverflow=false,outputError=null,outputTail=Promise.resolve(),errorTail=Promise.resolve();
    const overflow=()=>{if(outputOverflow)return;outputOverflow=true;child.kill("SIGTERM");clearTimeout(killTimer);killTimer=setTimeout(()=>child.kill("SIGKILL"),2000);};
    child.stdout.on("data",chunk=>{bytesOut+=chunk.length;if(bytesOut>16*1024*1024){overflow();return;}outputTail=outputTail.then(()=>out.writeFile(chunk)).catch(error=>{outputError=error;overflow();});});
    child.stderr.on("data",chunk=>{bytesErr+=chunk.length;if(bytesErr>16*1024*1024){overflow();return;}errorTail=errorTail.then(()=>err.writeFile(chunk)).catch(error=>{outputError=error;overflow();});});
    timer=setTimeout(()=>child.kill("SIGTERM"),interrupt?300:120000);
    killTimer=setTimeout(()=>child.kill("SIGKILL"),interrupt?2300:122000);
    await retain(intentPath,{schema:"commons.haystack.consumer-original-child.v1",operationId:input.operationId,name,
     pid:child.pid,script,scriptSha256:(await fileIdentity(script)).sha256,args,startedAt,node:process.execPath,nodeVersion:process.version});
    exit=await exitPromise;
    await Promise.all([outputTail,errorTail]);await out.sync();await err.sync();
    if(outputOverflow||outputError){await retain(join(phases,name+".capture-failure.json"),{name,startedAt,endedAt:new Date().toISOString(),...exit,outputOverflow,observedStdoutBytes:bytesOut,observedStderrBytes:bytesErr,error:outputError?String(outputError):null});throw Error("The original child output could not be retained completely; preserve its capture-failure receipt and reconcile before continuation.");}
    const result={schema:"commons.haystack.consumer-native-process.v1",name,startedAt,endedAt:new Date().toISOString(),...exit,
     stdout:await fileIdentity(stdout),stderr:await fileIdentity(stderr),script:await fileIdentity(script),node:process.execPath,nodeVersion:process.version};
    await retain(join(phases,name+".process-result.json"),result);return result;
   }finally{
    clearTimeout(timer);clearTimeout(killTimer);
    if(child&&!closed){child.kill("SIGTERM");await new Promise(resolve=>{const t=setTimeout(()=>{child.kill("SIGKILL");},2000);child.once("close",()=>{closed=true;clearTimeout(t);resolve();});});}
    await out.close();await err.close();
   }
  });
 }
 const failedRun=await openRun("controlled-failed-run","engineering");
 const failedPath=join(outputs,"controlled-failure.mjs");await retainBytes(failedPath,Buffer.from("process.stderr.write('Controlled original receiving failure\\n');process.exitCode=9;\n"));
 const failedProcess=await execute("controlled-failure",failedPath);need(failedProcess.code===9,"Retain the actual failed child result.");
 const failedOutput=await evidence(author,"failed-stderr",failedProcess.stderr.path,"text/plain");
 const failedCommand=await evidence(author,"failed-command",failedPath,"text/javascript");
 const baseContent=(run,processResult,outcome,observed,outputIds,command)=>({externalOperationId:run.run.id,operator:input.author,
  startedAt:processResult.startedAt,endedAt:processResult.endedAt,target,outcome,inputFileIds:[inputId],outputFileIds:outputIds,
  commandFileId:command,stdoutFileId:outputIds[0]||null,stderrFileId:null,
  questions:[{questionId:plan.questions[0].id,status:outcome==="completed"?"observed":"failed",observed,outputFileIds:outputIds,note:"Complete actual original process output and full observed population."}],
  projectionReturnId:null,note:"Actual "+outcome+" process result from the selected local receiving course."});
 const failureContent=baseContent(failedRun,failedProcess,"failed",[],[failedOutput],failedCommand);failureContent.stdoutFileId=null;failureContent.stderrFileId=failedOutput;
 await action(author,"receive-failed-run","consumer.run.receive",{runId:failedRun.run.id,expectedRunHeadId:failedRun.version.id,content:failureContent,author:input.author,note:"Actual nonzero result remains failed."});
 const interruptedRun=await openRun("controlled-interrupted-run","engineering",failedRun.run.id);
 const interruptedPath=join(outputs,"controlled-interruption.mjs");await retainBytes(interruptedPath,Buffer.from("process.stdout.write('Original child ready\\n');setInterval(()=>{},1000);\n"));
 const interruptedProcess=await execute("controlled-interruption",interruptedPath,[],true);need(interruptedProcess.signal,"Retain the actual signal-terminated child result.");
 const interruptedOutput=await evidence(author,"interrupted-stdout",interruptedProcess.stdout.path,"text/plain"),interruptedCommand=await evidence(author,"interrupted-command",interruptedPath,"text/javascript");
 await action(author,"receive-interrupted-run","consumer.run.receive",{runId:interruptedRun.run.id,expectedRunHeadId:interruptedRun.version.id,
  content:baseContent(interruptedRun,interruptedProcess,"interrupted",[],[interruptedOutput],interruptedCommand),author:input.author,note:"Actual interrupted result has no conformance or acceptance."});
 const actualRun=await openRun("actual-parser-run","actual",interruptedRun.run.id);
 const processResult=await execute("actual-parser",commandPath,[projectedFile.file.path]);need(processResult.code===0&&!processResult.signal,"The original parser must finish before receiving its actual evidence.");
 const observed=await read(processResult.stdout.path);need(observed.rows.length===624,"Retain the full actual target population.");
 const actualOutput=await evidence(author,"actual-parser-output",processResult.stdout.path);
 const actualStderr=await evidence(author,"actual-parser-stderr",processResult.stderr.path,"text/plain");
 const receivingContent=baseContent(actualRun,processResult,"completed",observed.rows,[actualOutput],commandId);receivingContent.stderrFileId=actualStderr;
 const preview=await saved("actual-parser-complete-preview",()=>query(author,"consumer.run.preview",{runId:actualRun.run.id,expectedRunHeadId:actualRun.version.id,content:receivingContent}));
 need(preview.result.technicalMatch&&preview.result.eligibleForAcceptance,"The exact native parser result must account for every original selected ID/value.");
 await artifact("actual-parser-complete-preview.json",bytes(preview));
 const returnRun=await openRun("contractor-original-pending-run","actual");
 const issued=await deliver(author,"issue-full-original-workspace",{kind:"workspace"});
 const receiving=await saved("independent-receiving",async()=>receiveBundle(await fs.readFile(issued.file.path),join(root,"contractor")));
 const contractor=new HaystackWorkspace(join(root,"contractor"));
 const contractorState=await contractor.read();need(contractorState.workspaceId===(await author.read()).workspaceId,"Original receiving must preserve workspace identity.");
 const returnProcess=await execute("contractor-actual-parser",commandPath,[projectedFile.file.path]);need(returnProcess.code===0&&!returnProcess.signal,"Retain contractor's actual complete local parser result.");
 const returnObserved=await read(returnProcess.stdout.path);
 const returnOutput=await evidence(contractor,"contractor-parser-output",returnProcess.stdout.path),returnStderr=await evidence(contractor,"contractor-parser-stderr",returnProcess.stderr.path,"text/plain");
 const returnContent=baseContent(returnRun,returnProcess,"completed",returnObserved.rows,[returnOutput],commandId);returnContent.stderrFileId=returnStderr;
 const received=await action(contractor,"contractor-receive","consumer.run.receive",{runId:returnRun.run.id,expectedRunHeadId:returnRun.version.id,content:returnContent,author:input.author,note:"Actual recipient parser result retained in the independently received original workspace."});
 await action(contractor,"contractor-named-review","consumer.run.review",{projectId:project.project.id,expectedHeadId:project.version.id,runId:returnRun.run.id,expectedRunHeadId:received.run.headId,decision:"accept",exceptions:[],author:input.author,note:"Named engineering receiving review of the actual selected local parser; no partner acceptance claimed."});
 const returned=await deliver(contractor,"contractor-complete-consumer-return",{kind:"consumer-return",consumerRunId:returnRun.run.id});
 const returnBytes=await plainRead(returned.file.path),returnPreview=await saved("original-contractor-return-preview",()=>query(author,"consumer.return.preview",{base64:returnBytes.toString("base64")}));
 need(returnPreview.canApply,"The complete original customer evidence must fit its reviewed author receiving state.");
 await artifact("contractor-return-preview.json",bytes(returnPreview));
 let host=null,primary=null,result=null;
 try{
  const originPath=join(phases,"browser-origin.json"),prior=await optional(originPath);
  if(prior)need(/^http:\/\/127\.0\.0\.1:\d+$/.test(prior.url)&&prior.workspaceId===(await author.read()).workspaceId,"Retain the exact original browser origin/workspace.");
  host=await startServer({directory:author.directory,host:"127.0.0.1",port:prior?Number(new URL(prior.url).port):0,token:input.token||"",expectedWorkspaceId:(await author.read()).workspaceId});
  if(!prior)await retain(originPath,{url:host.url,workspaceId:host.identity.workspaceId});
  else need(host.url===prior.url,"The original browser origin changed.");
  const browserInput={schema:"commons.haystack.consumer-browser.v1",operationId:uuid(input.operationId+"/browser"),url:host.url,workspaceId:host.identity.workspaceId,instanceId:host.identity.instanceId,token:input.token||"",
   outputRoot:join(root,"browser"),playwrightModule:input.playwrightModule,chromiumExecutable:input.chromiumExecutable,author:input.author,
   projectId:project.project.id,runId:actualRun.run.id,receivingContent,
   files:{input:{...projectedFile.file,name:"selected-projection.json",mediaType:"application/json"},return:{...returned.file,name:"contractor-consumer-return.json",mediaType:"application/json"}},
   returnRunId:returnRun.run.id,historicalRunIds:[failedRun.run.id,interruptedRun.run.id],returnReviewDecision:"accept",returnExceptions:[]};
  await saved("original-browser-input",async()=>{const {instanceId,...retained}=browserInput;return {...retained,token:""};});
  const browser=await saved("complete-browser-course",()=>runConsumerBrowser(browserInput));
  for(const format of ["json","csv","html"])await deliver(author,"complete-consumer-report-"+format,{kind:"consumer-report",consumerProjectId:project.project.id,format});
  await deliver(author,"linked-projection-report",{kind:"projection-report",projectionId:projected.projection.id,versionId:projected.version.id,format:"html"});
  const final=await deliver(author,"final-complete-workspace",{kind:"workspace"});
  const finalReceive=await saved("final-independent-reopen",async()=>receiveBundle(await fs.readFile(final.file.path),join(root,"final-receiving")));
  const finalWorkspace=new HaystackWorkspace(join(root,"final-receiving")),finalState=await finalWorkspace.read();
  const finalProject=await query(finalWorkspace,"consumer.project.read",{projectId:project.project.id});
  need(finalProject.currentAcceptance?.decision==="accept"&&finalProject.currentAcceptance.current,"Retain the author's explicit current named review of the completed original return.");
  result={schema:"commons.haystack.consumer-receiving-result.v1",operationId:input.operationId,workspaceId:finalState.workspaceId,revision:finalState.revision,
   source:{bytes:original.length,sha256:sha(original),rows:624},projectionId:projected.projection.id,projectionVersionId:projected.version.id,
   projectId:project.project.id,runId:actualRun.run.id,returnRunId:returnRun.run.id,processResult,returnProcess,browser,
   receiving,finalReceive,finalPackage:final,actions,artifacts,completedAt:new Date().toISOString(),state:"COMPLETE",
   meaning:"Actual local selected parser and full original browser/return receiving course. No Niagara/live station or customer business acceptance is inferred."};
 }catch(error){primary=error;}
 if(host){try{await host.close();}catch(error){primary=primary?new AggregateError([primary,error],"Original programme and host closure failed"):error;}}
 if(primary){await progress("programme","CONTINUATION_REQUIRED",{error:String(primary.stack||primary)});throw primary;}
 await retain(join(root,"complete-result.json"),result);await progress("programme","COMPLETE");return result;
}
if(process.argv[1]&&resolve(process.argv[1])===fileURLToPath(import.meta.url)){
 const at=process.argv.indexOf("--input");need(at>=0&&process.argv[at+1],"Use --input with the original complete JSON file.");
 runConsumerReceiving(await read(resolve(process.argv[at+1]))).then(result=>process.stdout.write(stringifyJson(result)+"\n")).catch(error=>{process.stderr.write(String(error.stack||error)+"\n");process.exitCode=1;});
}
