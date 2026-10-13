#!/usr/bin/env node
// MIT. Complete retained-source projection, correction and two-receiver operator journey.
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
import {PROJECTION_BROWSER_SCHEMA} from "./PROJECTION_BROWSER.mjs";

export const PROJECTION_RECEIVING_SCHEMA="commons.haystack.projection-receiving.v1";
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

/**
 * This programme has its own explicitly named receiving lineage. It never sends
 * a grid to a remote station or creates customer acceptance. All mutations use
 * the original workspace action catalogue and immutable original request IDs.
 */
export async function runProjectionReceiving(input){
 need(input?.schema===PROJECTION_RECEIVING_SCHEMA&&/^[0-9a-f]{8}(?:-[0-9a-f]{4}){3}-[0-9a-f]{12}$/.test(input.operationId),"Supply the complete programme with its original UUID.");
 need(typeof input.directory==="string"&&input.directory.startsWith("/")&&typeof input.author==="string"&&input.author.trim(),"Use an absolute owned programme directory and the actual operator name.");
 need(["public-charlie","provided-source"].includes(input.mode),"Choose the retained public Charlie source or an explicitly supplied original source.");
 const root=resolve(input.directory);need(root!==dirname(root),"Choose an ordinary owned programme directory.");
 await fs.mkdir(root,{recursive:true,mode:0o700});
 need(!(await fs.lstat(root)).isSymbolicLink(),"The programme directory must be ordinary.");
 await retain(join(root,"input.json"),input);
 const phases=join(root,"phases"),outputs=join(root,"outputs");await fs.mkdir(phases,{recursive:true});await fs.mkdir(outputs,{recursive:true});
 const artifacts=[],actions=[];
 async function progress(phase,state,details={}){
  const value={schema:"commons.haystack.projection-programme-progress.v1",operationId:input.operationId,
   phase,state,observedAt:new Date().toISOString(),pid:process.pid,memory:process.memoryUsage(),...details};
  const line=stringifyJson(value)+"\n",file=await fs.open(join(root,"progress.ndjson"),"a",0o600);
  try{await file.writeFile(line);await file.sync();}finally{await file.close();}
  process.stderr.write("HAYSTACK_PROJECTION_PROGRESS "+line);
 }
 await progress("programme","entered");

 async function artifact(name,value){const result=await retainBytes(join(outputs,name),value);artifacts.push({name,...result});return result;}
 async function saved(name,producer){
  await progress(name,"started");
  const path=join(phases,name+".json"),old=await optional(path);
  if(old){await progress(name,"completed",{reused:true});return old;}
  const value=await retain(path,await producer());
  await progress(name,"completed",{reused:false});return value;
 }
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
 async function completeComparison(workspace,name,id,before,after){
  await progress(name,"started");
  const path=join(phases,name+".json");
  if(!(await exists(path))){
   const state=await workspace.read(),header={workspaceId:state.workspaceId,projectionId:id,beforeVersionId:before,afterVersionId:after};
   const temporary=path+".pending-"+newId();let file;
   try{
    file=await fs.open(temporary,"wx",0o600);
    await file.writeFile(stringifyJson(header,2).slice(0,-2)+',\n  "rows": [');
    let offset=0,total=null,count=0;
    for(;;){
     const result=await workspace.dispatch("projection.compare",{expectedRevision:state.revision,projectionId:id,beforeVersionId:before,afterVersionId:after,offset,limit:50});
     if(total===null)total=result.total;need(result.total===total&&result.offset===offset,"Projection comparison pagination changed.");
     for(const row of result.items){
      await file.writeFile((count?",\n":"\n")+stringifyJson(row,2).split("\n").map(line=>"    "+line).join("\n"));count++;
     }
     if(!result.hasMore)break;need(result.nextOffset>offset,"Projection comparison did not advance.");offset=result.nextOffset;
    }
    need(count===total,"Projection comparison omitted original rows.");
    await file.writeFile((count?"\n  ":"")+"]\n}\n");await file.sync();await file.close();file=null;
    await publishTemporary(temporary,path,await fileIdentity(temporary));
   }finally{if(file)await file.close();await fs.unlink(temporary).catch(error=>{if(error.code!=="ENOENT")throw error;});}
  }
  const original=await fileIdentity(path),target=join(outputs,"return-comparison.json");
  const actual=await retainFile(path,target,original);
  artifacts.push({name:"return-comparison.json",...actual});await progress(name,"completed");return actual;
 }
 async function reports(workspace,name,id,versionId){
  const result=[];
  for(const [kind,format]of[["projection-grid","json"],["projection-lineage","json"],["projection-lineage","csv"],["projection-report","json"],["projection-report","html"]]){
   const d=await deliver(workspace,name+"-"+kind+"-"+format,{kind,projectionId:id,versionId,format});result.push({kind,format,operationId:d.result.operationId,...d.file});
  }return result;
 }
 async function received(bundle,destination,name){
  need(JSON.parse(bundle.toString("utf8")).format===PACKAGE_FORMAT,"The complete projection needs its original v4 application.");
  globalThis.gc?.();
  // The native receiver verifies the whole package. Release its decoded state before
  // constructing the independent verification view used for the retained baseline.
  const receipt=await receiveBundle(bundle,destination);globalThis.gc?.();
  const verified=verifyBundle(bundle);bundle=null;globalThis.gc?.();
  // Load the received application itself; the authoring checkout is not its runtime.
  const module=await import(pathToFileURL(join(destination,"application","store.mjs")).href);
  const workspace=new module.HaystackWorkspace(destination),state=await workspace.read();
  need(state.workspaceId===verified.state.workspaceId,"The receiver opened a different workspace.");
  for(const [leaf,original]of verified.application){const actual=await plainRead(join(destination,"application",leaf));need(equal([actual.length,sha(actual)],[original.length,sha(original)]),"A received complete application file changed: "+leaf);}
  const baselinePath=join(phases,name+"-baseline.json"),baseline=await optional(baselinePath);
  if(baseline){
   need(baseline.packageSha256===verified.packageSha256&&baseline.stateSha256===sha(bytes(verified.state)),"The original receiver baseline differs.");
   // Recipient edits must not be overwritten or compared against the old baseline.
  }else{
   need(equal(state,verified.state),"The first independent receiver did not reopen the exact original state.");
   await retain(baselinePath,{packageSha256:verified.packageSha256,payloadSha256:verified.payloadSha256,stateSha256:sha(bytes(verified.state)),workspaceId:state.workspaceId,revision:state.revision,applicationFiles:verified.application.size,installationId:receipt.installationId});
  }
  return workspace;
 }
 async function cold(workspace,name,sourceIdentity,projectionId,versionId){
  const module=await import(pathToFileURL(join(workspace.directory,"application","store.mjs")).href);
  const reopened=new module.HaystackWorkspace(workspace.directory),state=await reopened.read();
  sameSource(await reopened.originalSource(sourceIdentity.sha256),sourceIdentity);
  const value=await projection(reopened,projectionId,versionId);need(value.version.id===versionId,"The cold receiver did not reopen its retained version.");
  const result={workspaceId:state.workspaceId,revision:state.revision,projectionId,versionId,history:value.history.map(x=>x.id),returns:value.returns.map(x=>x.id),gridSha256:value.gridSha256};
  return saved(name,async()=>result);
 }
 const done=await optional(join(root,"COMPLETE.json"));
 if(done){
  for(const item of done.artifacts){const actual=await fileIdentity(item.path);need(actual.bytes===item.bytes&&actual.sha256===item.sha256,"A complete programme artifact changed.");}
  for(const recipient of done.receivers){
   const module=await import(pathToFileURL(join(recipient.directory,"application","store.mjs")).href),workspace=new module.HaystackWorkspace(recipient.directory);
   const state=await workspace.read();need(state.workspaceId===done.workspaceId,"A completed receiving workspace changed identity.");
   sameSource(await workspace.originalSource(done.source.sha256),done.source);
   const original=await projection(workspace,done.projectionId,recipient.versionId);need(original.version.id===recipient.versionId,"A retained recipient version disappeared.");
  }return{...done,reused:true};
 }
 const nativePath=input.mode==="public-charlie"?join(ROOT,"fixture-charlie.json"):resolve(input.source?.path||"");
 need(input.mode!=="provided-source"||input.source?.sha256&&input.source?.name&&input.source?.sourceUrl!==undefined,"Bind the supplied original source to its name, exact SHA-256 and original URL (which may be empty).");
 const sourceRaw=await plainRead(nativePath),expectedSha=input.mode==="public-charlie"?CHARLIE_SHA:input.source.sha256;
 need(sha(sourceRaw)===expectedSha,"The supplied complete original source differs from the reviewed input.");
 const originalGrid=parseGrid(sourceRaw,{format:"json-v4"}).grid;
 const sourceIdentity={name:input.mode==="public-charlie"?"fixture-charlie.json":input.source.name,bytes:sourceRaw.length,sha256:expectedSha,
  sourceUrl:input.mode==="public-charlie"?"https://project-haystack.org/example/download/charlie.json":input.source.sourceUrl,
  meaning:input.mode==="public-charlie"?"Retained public Charlie fixture; no customer, live station or vendor acceptance.":"Operator-selected original source; programme edits are explicitly labelled."};
 if(input.mode==="public-charlie")need(originalGrid.rows.length===624&&originalGrid.cols.length===87,"The retained Charlie edition is not the original complete grid.");
 await artifact("original-source.json",sourceRaw);await artifact("original-source-identity.json",bytes(sourceIdentity));
 const workspaceDirectory=join(root,"authoring-workspace"),workspace=new HaystackWorkspace(workspaceDirectory);
 if(!(await exists(join(workspaceDirectory,"workspace.json"))))await workspace.initialize(input.title||"Retained-source typed projection");
 const originalWorkspace=await saved("workspace-identity",async()=>{const s=await workspace.read();return{workspaceId:s.workspaceId};});
 need((await workspace.read()).workspaceId===originalWorkspace.workspaceId,"The programme authoring workspace was replaced.");
 const imported=await action(workspace,"01-source-import","source.import",{name:sourceIdentity.name,base64:sourceRaw.toString("base64"),format:"json-v4",sourceUrl:sourceIdentity.sourceUrl,select:true});
 need(imported.source.id===expectedSha,"The original importer did not retain the complete input identity.");
 const selection={nativeSourceIds:[imported.source.id],intakeIds:[]};
 let modelPreview=await saved("02-model-preview",()=>query(workspace,"semantic.model.preview",{
  title:input.model?.title||"Retained original source model",namespace:input.model?.namespace||"urn:commons:projection:"+input.operationId+":",
  selection,mappings:[],naming:input.model?.naming||{template:"{nativeId}",case:"preserve",separator:"_",description:"Original native identity, with no inferred station observation."}}));
 let content=input.model?.content?copy(input.model.content):copy(modelPreview.content);
 content.notes=(content.notes||"")+"\nOperator programme "+input.operationId+". Original observation status is preserved; no site visit, live station or customer acceptance is inferred.";
 const model=await action(workspace,"03-model-save","semantic.model.create",{contextId:modelPreview.contextId,selection,content,author:input.author,note:"Complete retained-source model for explicit typed projection."});
 let profile=input.profile?copy(input.profile):{
  title:"Native-preserve complete original grid",description:"Explicit original-column selection. Preserve typed values, null and empty values; absent cells remain absent.",
  entityIds:modelPreview.content.entities.map(e=>e.id),columns:originalGrid.cols.map(c=>({tag:c.name,source:{kind:"native",sourceId:expectedSha,tag:c.name},conversion:{kind:"preserve",blank:"keep",trim:false},...(c.meta?{meta:copy(c.meta)}:{})})),
  overrides:[],meta:copy(originalGrid.meta)
 };
 modelPreview=null;content=null;
 let firstPreview=await saved("04-projection-preview",()=>query(workspace,"projection.preview",{modelId:model.model.id,versionId:model.version.id,profile}));
 need(firstPreview.canPublish,"The full projection contains unresolved structural or semantic errors; retain its diagnostics and correct the reviewed profile.");
 if(!input.profile)need(equal(firstPreview.grid,originalGrid),"The complete native-preserve projection changed an original typed cell, absence, order or metadata.");
 firstPreview={counts:firstPreview.counts,gridSha256:firstPreview.gridSha256};
 globalThis.gc?.();
 const created=await action(workspace,"05-projection-save","projection.create",{modelId:model.model.id,versionId:model.version.id,profile,author:input.author,note:"Explicit complete native-preserve profile."});
 profile=null;globalThis.gc?.();
 const projectionId=created.projection.id;
 await action(workspace,"06-projection-review","projection.review",{projectionId,expectedHeadId:created.version.id,decision:"ready",author:input.author,note:"Operator reviewed complete source-bound grid and lineage; this is not station or customer acceptance."});
 const published=await action(workspace,"07-native-publish","projection.publish",{projectionId,expectedHeadId:created.version.id,author:input.author,note:"Publish only into this original local native source store.",select:true});
 const actualNative=await workspace.originalSource(published.source.id);
 need(sha(actualNative.bytes)===firstPreview.gridSha256,"The original native publication differs from the reviewed complete grid.");
 await artifact("published-native-grid.json",actualNative.bytes);
 await reports(workspace,"08-before",projectionId,created.version.id);
 const incoming=await saved("09-return-input",async()=>{
  const selected=parseGrid(actualNative.bytes,{format:"json-v4"}).grid;
  const original=await projection(workspace,projectionId,created.version.id);
  if(input.returned){
   const raw=await plainRead(resolve(input.returned.path));need(sha(raw)===input.returned.sha256,"The provided returned grid changed.");
   return{name:input.returned.name,base64:raw.toString("base64"),bindings:input.returned.bindings,consumerReference:input.returned.consumerReference,decisions:input.returned.decisions,meaning:"Explicitly supplied actual returned grid and operator decisions."};
  }
  need(input.mode==="public-charlie","A provided-source programme needs its actual returned grid and explicit decisions.");
  const candidates=selected.rows.map((row,index)=>({row,index})).filter(x=>typeof x.row.dis==="string");
  need(candidates.length>=2,"Choose two original text-bearing rows for the labelled public-source operator correction.");
  const [kept,adopted]=candidates;
  selected.rows[kept.index].dis+=" [operator programme "+input.operationId+" proposed; keep original]";
  selected.rows[adopted.index].dis+=" [operator programme "+input.operationId+" adopted correction]";
  return{name:"operator-programme-return.json",base64:Buffer.from(encodeGrid(selected,{format:"json-v4",indent:2})).toString("base64"),
   bindings:original.rows.map(r=>({entityId:r.entityId,rowIndex:r.rowIndex})),
   consumerReference:"Operator programme "+input.operationId+"; correction constructed from the actual locally published public-source grid, not an external consumer response.",
   decisions:original.rows.map(r=>({entityId:r.entityId,decision:r.rowIndex===adopted.index?"adopt":"keep"})),
   keptRowIndex:kept.index,adoptedRowIndex:adopted.index,meaning:"Explicit operator-only correction over the retained public fixture."};
 });
 await artifact("incoming-return.json",Buffer.from(incoming.base64,"base64"));
 const returnFields={projectionId,name:incoming.name,base64:incoming.base64,bindings:incoming.bindings,consumerReference:incoming.consumerReference};
 let returnPreview=await saved("10-return-preview",()=>query(workspace,"projection.return.preview",{...returnFields,versionId:created.version.id}));
 returnPreview={returnSha256:returnPreview.returnSha256,source:returnPreview.source,changedRows:returnPreview.changedRows};globalThis.gc?.();
 const applied=await action(workspace,"11-return-apply","projection.return.apply",{...returnFields,expectedHeadId:created.version.id,expectedReturnSha256:returnPreview.returnSha256,decisions:incoming.decisions,author:input.author,note:"Explicit original-grid keep/adopt decisions from the retained programme input."});
 let corrected=await projection(workspace,projectionId,applied.version.id);
 need(corrected.returns.some(r=>r.id===applied.return.id&&r.source.sha256===returnPreview.source.sha256),"The complete original returned file and decisions are not retained.");
 if(input.mode==="public-charlie"&&!input.returned){
  const selected=parseGrid(actualNative.bytes,{format:"json-v4"}).grid,returned=parseGrid(Buffer.from(incoming.base64,"base64"),{format:"json-v4"}).grid;
  need(equal(corrected.grid.rows[incoming.keptRowIndex],selected.rows[incoming.keptRowIndex])&&equal(corrected.grid.rows[incoming.adoptedRowIndex],returned.rows[incoming.adoptedRowIndex]),"The original explicit keep/adopt decisions were not applied to complete rows.");
 }
 corrected=null;globalThis.gc?.();
 await completeComparison(workspace,"12-compare",projectionId,created.version.id,applied.version.id);
 await action(workspace,"13-corrected-review","projection.review",{projectionId,expectedHeadId:applied.version.id,decision:"ready",author:input.author,note:"Review the source-bound corrected projection, including kept original cells."});
 await reports(workspace,"14-after",projectionId,applied.version.id);
 const first=await deliver(workspace,"15-first-complete-workspace",{kind:"workspace"});
 workspace.stateCache=null;globalThis.gc?.();
 const receiverOneDirectory=join(root,"receiver-one"),receiverOne=await received(await plainRead(first.file.path),receiverOneDirectory,"16-receiver-one");
 sameSource(await receiverOne.originalSource(expectedSha),sourceIdentity);
 let receiverOneBase=await projection(receiverOne,projectionId,applied.version.id);
 const recipientModel={modelId:receiverOneBase.modelId,versionId:receiverOneBase.modelVersionId};
 let recipientProfile=copy(receiverOneBase.profile);recipientProfile.description+="\nIndependent receiver one operator edit "+input.operationId+".";
 receiverOneBase=null;globalThis.gc?.();
 const recipient=await action(receiverOne,"17-recipient-edit","projection.save",{projectionId,expectedHeadId:applied.version.id,...recipientModel,profile:recipientProfile,author:input.author,note:"Independent editable receiving; complete earlier source and return history retained."});
 recipientProfile=null;globalThis.gc?.();
 await action(receiverOne,"18-recipient-review","projection.review",{projectionId,expectedHeadId:recipient.version.id,decision:"ready",author:input.author,note:"Review the independent recipient's explicit local edit."});
 workspace.stateCache=null;globalThis.gc?.();
 let browser=null,firstRecipientVersion=recipient.version.id;
 if(input.browser){
  await progress("browser","started");receiverOne.stateCache=null;globalThis.gc?.();
  const module=await import(pathToFileURL(join(receiverOneDirectory,"application","PROJECTION_BROWSER.mjs")).href);
  browser=await module.runProjectionBrowser({schema:PROJECTION_BROWSER_SCHEMA,operationId:uuid(input.operationId+"/browser"),directory:receiverOneDirectory,outputDirectory:join(root,"browser"),
   workspaceId:originalWorkspace.workspaceId,modelId:model.model.id,projectionId,versionId:recipient.version.id,author:input.author,
   playwrightModule:input.browser.module,chromiumExecutable:input.browser.executable});
  await progress("browser","completed");globalThis.gc?.();
  firstRecipientVersion=browser.versionId;
  for(const item of browser.artifacts)artifacts.push({name:"browser/"+item.path.split("/").at(-1),...item});
 }
 await reports(receiverOne,"19-recipient",projectionId,firstRecipientVersion);
 const second=await deliver(receiverOne,"20-second-complete-workspace",{kind:"workspace"});
 receiverOne.stateCache=null;globalThis.gc?.();
 const receiverTwoDirectory=join(root,"receiver-two"),receiverTwo=await received(await plainRead(second.file.path),receiverTwoDirectory,"21-receiver-two");
 let receiverTwoBase=await projection(receiverTwo,projectionId,firstRecipientVersion);
 const secondModel={modelId:receiverTwoBase.modelId,versionId:receiverTwoBase.modelVersionId};
 let secondProfile=copy(receiverTwoBase.profile);
 secondProfile.description+="\nIndependent receiver two operator edit "+input.operationId+".";
 receiverTwoBase=null;globalThis.gc?.();
 const secondEdit=await action(receiverTwo,"22-second-recipient-edit","projection.save",{projectionId,expectedHeadId:firstRecipientVersion,...secondModel,profile:secondProfile,author:input.author,note:"Second independently restored application edit with original source history."});
 secondProfile=null;globalThis.gc?.();
 await action(receiverTwo,"23-second-recipient-review","projection.review",{projectionId,expectedHeadId:secondEdit.version.id,decision:"ready",author:input.author,note:"Review the second recipient's explicit local edit."});
 receiverOne.stateCache=null;globalThis.gc?.();
 await reports(receiverTwo,"24-second-recipient",projectionId,secondEdit.version.id);
 const third=await deliver(receiverTwo,"25-final-complete-workspace",{kind:"workspace"});
 const reopenOne=await cold(receiverOne,"26-first-cold-reopen",sourceIdentity,projectionId,firstRecipientVersion);
 const reopenTwo=await cold(receiverTwo,"27-second-cold-reopen",sourceIdentity,projectionId,secondEdit.version.id);
 need(reopenTwo.history.includes(created.version.id)&&reopenTwo.history.includes(applied.version.id)&&reopenTwo.returns.includes(applied.return.id),"The independent final receiver lost original projection or returned-grid history.");
 const result={schema:PROJECTION_RECEIVING_SCHEMA,operationId:input.operationId,inputSha256:sha(bytes(input)),status:"COMPLETED",workspaceId:originalWorkspace.workspaceId,source:sourceIdentity,modelId:model.model.id,modelVersionId:model.version.id,projectionId,
  originalVersionId:created.version.id,correctedVersionId:applied.version.id,returnId:applied.return.id,
  counts:firstPreview.counts,returnChangedRows:returnPreview.changedRows,actions,artifacts,
  archives:[first.file,second.file,third.file],receivers:[{directory:receiverOneDirectory,...reopenOne},{directory:receiverTwoDirectory,...reopenTwo}],browser,
  meaning:"Actual local source, model, typed projection, original-store publication, explicit correction, complete v4 export and two independent editable receiving journeys. No remote station write or customer acceptance is inferred."};
 await retain(join(root,"COMPLETE.json"),result);await progress("programme","completed");return result;
}
export async function main(argv=process.argv.slice(2)){
 need(argv.length===2&&argv[0]==="--input","Use --input COMPLETE_PROGRAMME_JSON.");
 const result=await runProjectionReceiving(await read(resolve(argv[1])));process.stdout.write(stringifyJson(result)+"\n");
}
if(process.argv[1]&&pathToFileURL(resolve(process.argv[1])).href===import.meta.url)main().catch(error=>{process.stderr.write(stringifyJson({error:error.message,code:error.code??null})+"\n");process.exitCode=1;});
