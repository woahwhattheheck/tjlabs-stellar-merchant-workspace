#!/usr/bin/env node
// Complete original Haystack registry course. No target driver is invoked or fabricated.
import {promises as fs} from "node:fs";
import {resolve,join,dirname} from "node:path";
import {fileURLToPath,pathToFileURL} from "node:url";
import {createHash} from "node:crypto";
import {spawnSync} from "node:child_process";
import {HaystackWorkspace} from "./store.mjs";
import {HaystackClient} from "./client.mjs";
import {startServer} from "./server.mjs";
import {verifyBundle,receiveBundle,PACKAGE_MAX_BYTES,APPLICATION_FILES} from "./portable.mjs";
import {plainRead,createOnlyFile} from "./files.mjs";
import {canonicalJson,stringifyJson} from "./json-codec.mjs";
const sha=b=>createHash("sha256").update(b).digest("hex");
const json=v=>Buffer.from(stringifyJson(v,2)+"\n");
const same=(a,b)=>canonicalJson(a)===canonicalJson(b);
const need=(c,m)=>{if(!c)throw Error(m);};
const clean=v=>{const c=structuredClone(v);delete c.replayed;return c;};
function uuid(seed){const b=createHash("sha256").update(seed).digest().subarray(0,16);b[6]=(b[6]&15)|80;b[8]=(b[8]&63)|128;const s=b.toString("hex");return s.slice(0,8)+"-"+s.slice(8,12)+"-"+s.slice(12,16)+"-"+s.slice(16,20)+"-"+s.slice(20);}
async function retain(path,bytes){await fs.mkdir(dirname(path),{recursive:true,mode:0o700});await createOnlyFile(path,bytes);const actual=await plainRead(path,Math.max(bytes.length,1));need(actual.equals(bytes),"Complete retained bytes differ: "+path);return{path,bytes:bytes.length,sha256:sha(bytes)};}
async function exists(p){try{await fs.lstat(p);return true;}catch(e){if(e.code==="ENOENT")return false;throw e;}}
export async function receiveVolttronProgramme({programmeFile,directory,outputDirectory,browserModule=null,chromium=null}={}){
 const programmePath=resolve(programmeFile),programmeBytes=await plainRead(programmePath,192*1024*1024),p=JSON.parse(programmeBytes.toString("utf8"));
 need(p.schema==="commons.haystack.volttron-receiving-programme.v1"&&typeof p.operationId==="string"&&p.operationId.length>0,"Select the original complete registry programme.");
 for(const key of ["registries","configurations","profiles","editions","receivings"])need(Array.isArray(p[key]),"Retain the complete "+key+" selection.");
 need(p.registries.length&&p.configurations.length&&p.profiles.length&&p.editions.length,"The whole course requires original registry/configuration/profile/edition inputs.");
 const root=resolve(directory),out=resolve(outputDirectory);need(root!==out&&!out.startsWith(root+"/"),"Keep receiving outputs outside the workspace.");
 await fs.mkdir(out,{recursive:true,mode:0o700});
 const input=async ref=>{need(ref&&typeof ref.path==="string"&&/^[0-9a-f]{64}$/.test(ref.sha256),"Bind each original input to its complete SHA-256.");const bytes=await plainRead(resolve(dirname(programmePath),ref.path),PACKAGE_MAX_BYTES);need(sha(bytes)===ref.sha256&&(!("bytes"in ref)||ref.bytes===bytes.length),"An original input changed: "+ref.path);return bytes;};
 for(const collection of ["registries","configurations","profiles","editions","receivings","returns","contractorReturns"]){need(new Set((p[collection]||[]).map(r=>r.key)).size===(p[collection]||[]).length,"Use distinct original keys for every "+collection+" input.");for(const row of p[collection]||[])need(typeof row.key==="string"&&/^[a-zA-Z0-9][a-zA-Z0-9_.-]{0,99}$/.test(row.key)&&row.key!==".."&&!row.key.includes(".."),"Use safe unique programme keys.");}
 const inputs={};for(const collection of ["registries","configurations"])for(const row of p[collection]){need(row.key&&!inputs[collection+":"+row.key],"Use unique selected input keys.");inputs[collection+":"+row.key]=await input(row);}
 for(const row of p.receivings)inputs["evidence:"+row.key]=await input(row.evidence);
 for(const row of p.returns||[])inputs["return:"+row.key]=await input(row.package);
 const sourceRoot=dirname(fileURLToPath(import.meta.url)),sourceSelection=[];
 for(const name of APPLICATION_FILES){const bytes=await plainRead(join(sourceRoot,name),32*1024*1024);sourceSelection.push({name,bytes:bytes.length,sha256:sha(bytes)});}
 const binding={sourceSelection,schema:"commons.haystack.volttron-receiving-binding.v1",operationId:p.operationId,programmeSha256:sha(programmeBytes),directory:root,outputDirectory:out,browserModule:browserModule?resolve(browserModule):null,chromium:chromium?resolve(chromium):null,inputs:Object.entries(inputs).map(([key,bytes])=>({key,bytes:bytes.length,sha256:sha(bytes)}))};
 await retain(join(out,"programme-binding.json"),json(binding));await retain(join(out,"original-programme.json"),programmeBytes);
 const completed=join(out,"complete-receiving.json");
 if(await exists(completed)){const saved=JSON.parse((await plainRead(completed,192*1024*1024)).toString("utf8"));need(same(saved.binding,binding),"The completed programme source binding differs.");for(const f of saved.deliveries){const bytes=await plainRead(f.path,PACKAGE_MAX_BYTES);need(bytes.length===f.bytes&&sha(bytes)===f.sha256,"A completed full delivery changed.");}for(const b of saved.browser||[])for(const f of b.files){const bytes=await plainRead(f.path,PACKAGE_MAX_BYTES);need(bytes.length===f.bytes&&sha(bytes)===f.sha256,"A completed browser output changed.");}return saved;}
 const workspace=new HaystackWorkspace(root);await workspace.initialize(p.title||"Registry receiving");
 const original=await workspace.dispatch("workspace.status",{});await retain(join(out,"workspace-identity.json"),json({workspaceId:original.workspaceId}));
 const server=await startServer({directory:root,expectedWorkspaceId:original.workspaceId,port:0});
 let client;
 const viewBytes=value=>{const v=structuredClone(value);delete v.revision;return json(v);};
 const receipts={},deliveries=[],comparisons=[],browserReceipts=[],contractorReturns=[];
 let completeReport,primaryError;
 const status=()=>client.request("workspace.status",{});
 const read=async(action,args={})=>client.request(action,{...args,expectedRevision:(await status()).revision});
 async function mutate(key,action,fields,targetClient=client){
   const operationId=uuid(p.operationId+":"+key),requestPath=join(out,"requests",operationId+".json");
   let args;if(await exists(requestPath)){const retained=JSON.parse((await plainRead(requestPath,288*1024*1024)).toString("utf8"));need(retained.workspaceId===original.workspaceId&&retained.action===action&&retained.operationId===operationId,"The original request binding differs.");args=retained.args;const {operationId:omit,expectedRevision:rev,...saved}=args;need(same(saved,fields),"The original source-bound operation fields changed.");}
   else{args={...structuredClone(fields),operationId,expectedRevision:(await targetClient.request("workspace.status",{})).revision};await retain(requestPath,json({workspaceId:original.workspaceId,operationId,action,args}));}
   let receipt;try{receipt=await targetClient.request("operation.read",{operationId});}catch(e){if(e.status!==404)throw e;receipt=await targetClient.request(action,args);}
   const replay=await targetClient.request(action,args);need(same(clean(receipt),clean(replay)),"The original operation replay changed.");await retain(requestPath+".receipt.json",json(clean(receipt)));receipts[key]=clean(receipt);return receipt;
 }
 async function deliver(key,args){
   const receipt=await mutate("delivery:"+key,"delivery.prepare",args),bytes=Buffer.from(await client.deliveryBytes(receipt.operationId));
   need(bytes.length===receipt.bytes&&sha(bytes)===receipt.sha256,"A complete delivery differs from its original manifest.");
   const saved=await retain(join(out,"deliveries",key,receipt.name),bytes);deliveries.push({key,...saved,receipt:clean(receipt)});return{receipt,bytes};
 }
 const registryIds={},configurationIds={},profiles={},editions={},receivings={};
 try{
   client=new HaystackClient({url:server.url,workspaceId:original.workspaceId,instanceId:server.identity.instanceId});
   await client.connect();
   for(const row of p.registries){const r=await mutate("registry:"+row.key,"semantic.intake.import",{name:row.name,format:row.format,base64:inputs["registries:"+row.key].toString("base64"),sourceUrl:row.sourceUrl||"",...(row.delimiter?{delimiter:row.delimiter}:{})});registryIds[row.key]=r.intake.id;
     const actual=Buffer.from(await client.completeBytes("semantic.source.read",{intakeId:r.intake.id}));need(actual.equals(inputs["registries:"+row.key]),"The native intake lost original bytes.");}
   for(const row of p.configurations){const r=await mutate("configuration:"+row.key,"volttron.configuration.import",{name:row.name,base64:inputs["configurations:"+row.key].toString("base64"),author:row.author,note:row.note||""});configurationIds[row.key]=r.configurationId;}
   for(const row of p.profiles){need(!profiles[row.key],"Each profile has a unique programme key.");const content=structuredClone(row.content);
     for(const ref of row.bindings){need(Number.isSafeInteger(ref.bindingIndex)&&content.bindings[ref.bindingIndex]&&registryIds[ref.registryKey]&&configurationIds[ref.configurationKey],"Bind every selected profile device to original source keys.");const b=content.bindings[ref.bindingIndex];b.intakeId=registryIds[ref.registryKey];b.configurationId=configurationIds[ref.configurationKey];}
     const r=await mutate("profile:"+row.key,"volttron.profile.save",{content,author:row.author,note:row.note||""});profiles[row.key]={profileId:r.profileId,profileVersionId:r.versionId};}
   for(const row of p.editions){need(profiles[row.profileKey]&&!editions[row.key],"Select a unique edition and retained profile.");const selection=profiles[row.profileKey],args={...selection,decisions:row.decisions,author:row.author,note:row.note||"",...(row.parentKey?{parentEditionId:editions[row.parentKey]?.editionId}:{})};
     if(row.parentKey)need(args.parentEditionId,"Select a previously retained edition as the parent.");const r=await mutate("edition:"+row.key,"volttron.edition.save",args);editions[row.key]={editionId:r.editionId,...selection};const full=await read("volttron.edition.read",{editionId:r.editionId});
     need(full.review.rows.length===row.decisions.length,"Every original physical row must have an explicit decision.");
     if(row.expectedCounts)for(const[k,v]of Object.entries(row.expectedCounts))need(full.review.counts[k]===v,"Actual selected count differs: "+row.key+"/"+k);
     await retain(join(out,"editions",row.key+".json"),viewBytes(full));
     for(const format of ["json","csv","html"])await deliver(row.key+"-"+format,{kind:"volttron-report",registryEditionId:r.editionId,format});
     if(full.review.targetReady)for(let i=0;i<full.review.manifest.length;i++){const file=full.review.manifest[i],delivered=await deliver(row.key+"-target-"+i,{kind:"volttron-output",registryEditionId:r.editionId,name:file.name});need(delivered.receipt.sha256===file.sha256&&delivered.receipt.bytes===file.bytes,"The target file differs from its frozen source manifest.");}
   }
   for(const row of p.comparisons||[]){need(editions[row.beforeKey]&&editions[row.afterKey],"Select both complete editions.");const result=await read("volttron.edition.compare",{beforeEditionId:editions[row.beforeKey].editionId,afterEditionId:editions[row.afterKey].editionId});await retain(join(out,"comparisons",row.beforeKey+"--"+row.afterKey+".json"),viewBytes(result));comparisons.push(result);}
   for(const row of p.receivings){need(editions[row.editionKey],"Select the exact receiving edition.");const evidence=JSON.parse(inputs["evidence:"+row.key].toString("utf8"));
     if(row.supersedesKey){const prior=p.receivings.find(value=>value.key===row.supersedesKey);need(receivings[row.supersedesKey]&&typeof evidence.supersedesReceivingId==="string"&&prior?.originalReceivingId===evidence.supersedesReceivingId,"Bind an original successor to its exact retained predecessor source receipt.");evidence.supersedesReceivingId=receivings[row.supersedesKey];}
     // Never populate observation values or outcome from the expected registry.
     const r=await mutate("receiving:"+row.key,"volttron.receiving.record",{editionId:editions[row.editionKey].editionId,evidence,author:row.author,note:row.note||""});
     receivings[row.key]=r.receivingId;const full=await read("volttron.receiving.read",{receivingId:r.receivingId});await retain(join(out,"receivings",row.key+".json"),viewBytes(full));
     for(let i=0;i<full.receiving.result.outputs.length;i++)await deliver("receiving-"+row.key+"-"+i,{kind:"volttron-receiving-output",receivingId:r.receivingId,name:full.receiving.result.outputs[i].name});
   }
   for(const row of p.returns||[]){const bytes=inputs["return:"+row.key],preview=await read("volttron.return.preview",{base64:bytes.toString("base64")});await retain(join(out,"returns",row.key+"-preview.json"),viewBytes(preview));await mutate("return:"+row.key,"volttron.return.apply",{base64:bytes.toString("base64"),decisions:row.decisions,author:row.author,note:row.note||""});}

   for(const course of p.contractorReturns||[]){
     need(typeof course.key==="string"&&/^[a-zA-Z0-9][a-zA-Z0-9_-]{0,80}$/.test(course.key)&&Array.isArray(course.profiles)&&course.profiles.length,"Select one complete original contractor course.");
     const basis=await deliver("contractor-"+course.key+"-basis",{kind:"workspace"}),destination=join(out,"contractor-"+course.key),received=await receiveBundle(basis.bytes,destination);
     const {startServer:contractorServer}=await import(pathToFileURL(join(destination,"application/server.mjs")).href);
     const contractor=await contractorServer({directory:destination,expectedWorkspaceId:original.workspaceId,port:0});
     let returned,contractorError;
     try{
       const peer=new HaystackClient({url:contractor.url,workspaceId:original.workspaceId,instanceId:contractor.identity.instanceId});await peer.connect();
       for(const row of course.profiles){
         const selected=profiles[row.profileKey];need(selected,"Select an original profile in the contractor source course.");
         const content=structuredClone(row.content);
         for(const ref of row.bindings){need(Number.isSafeInteger(ref.bindingIndex)&&content.bindings[ref.bindingIndex]&&registryIds[ref.registryKey]&&configurationIds[ref.configurationKey],"Bind contractor content to retained original sources.");const binding=content.bindings[ref.bindingIndex];binding.intakeId=registryIds[ref.registryKey];binding.configurationId=configurationIds[ref.configurationKey];}
         await mutate("contractor:"+course.key+":profile:"+row.profileKey,"volttron.profile.save",{profileId:selected.profileId,expectedHeadId:selected.profileVersionId,content,author:row.author,note:row.note||""},peer);
       }
       const receipt=await mutate("contractor:"+course.key+":workspace","delivery.prepare",{kind:"workspace"},peer),bytes=Buffer.from(await peer.deliveryBytes(receipt.operationId));
       need(bytes.length===receipt.bytes&&sha(bytes)===receipt.sha256,"The complete contractor package differs from its original receipt.");
       const saved=await retain(join(out,"deliveries","contractor-"+course.key+"-returned",receipt.name),bytes);deliveries.push({key:"contractor-"+course.key+"-returned",...saved,receipt:clean(receipt)});
       const checked=verifyBundle(bytes);need(checked.state.workspaceId===original.workspaceId,"The returned contractor selected another workspace.");returned={bytes,receipt:clean(receipt),saved};
     }catch(error){contractorError=error;throw error;}finally{try{await contractor.close();}catch(cleanupError){if(contractorError)throw new AggregateError([contractorError,cleanupError],"Contractor receiving and server cleanup both failed.");throw cleanupError;}}
     const previewPath=join(out,"returns","contractor-"+course.key+"-preview.json");
     let preview;if(await exists(previewPath))preview=JSON.parse((await plainRead(previewPath,PACKAGE_MAX_BYTES)).toString("utf8"));else{preview=await read("volttron.return.preview",{base64:returned.bytes.toString("base64")});await retain(previewPath,viewBytes(preview));}
     need(preview.workspaceId===original.workspaceId&&preview.profiles.length===Object.keys(profiles).length,"Review every complete returned original profile.");
     const choices=preview.profiles.map(row=>({profileId:row.profileId,expectedLocalHeadId:row.localHeadId,expectedIncomingHeadId:row.incomingHeadId}));
     const kept=await mutate("contractor:"+course.key+":keep","volttron.return.apply",{base64:returned.bytes.toString("base64"),decisions:choices.map(row=>({...row,decision:"keep"})),author:course.author,note:course.keepNote});
     need(kept.return.outcomes.length===choices.length&&kept.return.outcomes.every(row=>row.decision==="keep"&&row.headId===row.expectedLocalHeadId),"The retained explicit KEEP changed an original profile head.");
     const adopted=await mutate("contractor:"+course.key+":adopt","volttron.return.apply",{base64:returned.bytes.toString("base64"),decisions:choices.map(row=>({...row,decision:"adopt"})),author:course.author,note:course.adoptNote});
     need(adopted.return.outcomes.length===choices.length&&adopted.return.outcomes.every(row=>row.decision==="adopt"),"Retain every explicit returned adoption.");
     contractorReturns.push({key:course.key,received,package:returned.saved,preview:previewPath,keep:clean(kept),adopt:clean(adopted)});
   }

   const finalState=await workspace.read(),finalSummary=await read("volttron.status"),pack=await deliver("complete-workspace",{kind:"workspace"}),verified=verifyBundle(pack.bytes);
   need(same(verified.state,finalState),"Complete workspace package lost source, history or registry state.");const destination=join(out,"independent-workspace"),received=await receiveBundle(pack.bytes,destination);
   // Load the delivered composed store, not an old parent class.
   const {HaystackWorkspace:ReceivedWorkspace}=await import(pathToFileURL(join(destination,"application/store.mjs")).href);
   const cold=new ReceivedWorkspace(destination);need(same(await cold.read(),verified.state),"Cold received workspace differs.");
   const coldSummary=await cold.dispatch("volttron.status",{expectedRevision:verified.state.revision});need(same(coldSummary,finalSummary),"Cold registry status differs.");
   for(const edition of verified.state.volttron.editions){const before=await workspace.dispatch("volttron.edition.read",{expectedRevision:verified.state.revision,editionId:edition.id}),after=await cold.dispatch("volttron.edition.read",{expectedRevision:verified.state.revision,editionId:edition.id});need(same(before,after),"A historical edition changed on cold receiving.");}
   for(const receiving of verified.state.volttron.receivings){const before=await workspace.dispatch("volttron.receiving.read",{expectedRevision:verified.state.revision,receivingId:receiving.id}),after=await cold.dispatch("volttron.receiving.read",{expectedRevision:verified.state.revision,receivingId:receiving.id});need(same(before,after),"A retained original receiving changed.");}
   const cliFile=join(destination,"application/cli.mjs"),cliOut=join(out,"cold-cli-status.json"),cli=spawnSync(process.execPath,[cliFile,"volttron-status","--directory",destination,"--out",cliOut],{encoding:"utf8",maxBuffer:2*1024*1024});
   need(cli.status===0,"The delivered CLI did not open the cold workspace: "+cli.stderr);const cliStatus=JSON.parse((await plainRead(cliOut,8*1024*1024)).toString("utf8"));need(same(cliStatus,coldSummary),"The maintained CLI status differs.");
   if(browserModule){
     const {receiveVolttronBrowser}=await import(new URL("./VOLTTRON_BROWSER.mjs",import.meta.url).href);
     const selection=p.browserEditions?.map(k=>{need(editions[k],"Select a retained browser edition.");return editions[k].editionId;})||Object.values(editions).map(e=>e.editionId);
     browserReceipts.push(await receiveVolttronBrowser({url:server.url,workspaceId:original.workspaceId,editionIds:selection,outputDirectory:join(out,"browser-author"),playwrightModule:browserModule,chromium}));
     const {startServer:receivedServer}=await import(pathToFileURL(join(destination,"application/server.mjs")).href),other=await receivedServer({directory:destination,expectedWorkspaceId:original.workspaceId,port:0});
     let independentError;try{browserReceipts.push(await receiveVolttronBrowser({url:other.url,workspaceId:original.workspaceId,editionIds:selection,outputDirectory:join(out,"browser-independent"),playwrightModule:browserModule,chromium}));}catch(error){independentError=error;throw error;}finally{try{await other.close();}catch(cleanupError){if(independentError)throw new AggregateError([independentError,cleanupError],"Independent browser and server cleanup both failed.");throw cleanupError;}}
   }
   const report={contractorReturns,schema:"commons.haystack.volttron-complete-receiving.v1",operationId:p.operationId,binding,workspaceId:original.workspaceId,finalRevision:verified.state.revision,registries:registryIds,configurations:configurationIds,profiles,editions,receivings,comparisons,deliveries,received,cli:{status:cli.status,file:cliOut},browser:browserReceipts,execution:{nativeIntake:true,retainedReceivingRecords:p.receivings.length,actualTargetEvidence:p.receivings.filter(r=>JSON.parse(inputs["evidence:"+r.key].toString("utf8")).mode==="actual").length,browser:!!browserModule,returnedPackages:(p.returns||[]).length},sourceSelection:[...verified.application].map(([name,bytes])=>({name,bytes:bytes.length,sha256:sha(bytes)}))};
   completeReport=report;
 }catch(error){primaryError=error;throw error;}finally{try{await server.close();}catch(cleanupError){if(primaryError)throw new AggregateError([primaryError,cleanupError],"Original receiving and server cleanup both failed.");throw cleanupError;}}
 await retain(join(out,"complete-receiving.json"),json(completeReport));return completeReport;
}
if(process.argv[1]&&resolve(process.argv[1])===fileURLToPath(import.meta.url)){
 const flags={};for(let i=2;i<process.argv.length;i+=2){const key=process.argv[i];need(["--programme","--directory","--output","--playwright","--chromium"].includes(key)&&!Object.hasOwn(flags,key)&&process.argv[i+1],"Use the complete original programme/directory/output and optional selected browser paths.");flags[key]=process.argv[i+1];}
 receiveVolttronProgramme({programmeFile:flags["--programme"],directory:flags["--directory"],outputDirectory:flags["--output"],browserModule:flags["--playwright"],chromium:flags["--chromium"]}).then(r=>process.stdout.write(stringifyJson({operationId:r.operationId,workspaceId:r.workspaceId,finalRevision:r.finalRevision,report:join(resolve(flags["--output"]),"complete-receiving.json")})+"\n")).catch(e=>{process.stderr.write(e.stack+"\n");process.exitCode=1;});
}
