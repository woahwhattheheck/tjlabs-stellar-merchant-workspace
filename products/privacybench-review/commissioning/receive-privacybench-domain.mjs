#!/usr/bin/env node
// MIT. Actual maintained-engine receiving course; no evaluator/network call.
import {readFile} from "node:fs/promises";
import {resolve,dirname} from "node:path";
import {fileURLToPath} from "node:url";
import {createHash} from "node:crypto";
import {loadPrivacyBench,writeExactFiles} from "../native/privacybench-workspace.mjs";
const root=resolve(dirname(fileURLToPath(import.meta.url)),".."),{api,codec}=await loadPrivacyBench(root),json=x=>JSON.stringify(x,null,2)+"\n",hash=b=>createHash("sha256").update(b).digest("hex"),need=(v,m)=>{if(!v)throw Error(m);};
const original=JSON.parse(await readFile(resolve(root,"examples/complete-authored-workspace.json"),"utf8")),w=await api.importWorkspace(original);
need(w.revision===9&&w.sources.length===2&&w.editions.length===2&&w.comparisons.length===1&&w.reviews.length===2,"Authored reference shape changed");
const first=await api.inspectEdition(w,w.editions[0].id),originalRun=await readFile(resolve(root,"examples/reference-native-run.json"));
need(Buffer.from(json(first.run)).equals(originalRun),"Original maintained Research run differs");
for(const op of w.operations)need((await api.apply(w,op.request)).replayed,"Original request did not replay");
const reopened=await api.importWorkspace(await api.exportWorkspace(w));need(api.digest(w)===api.digest(reopened),"Independent reopening differs");
const returned=JSON.parse(await readFile(resolve(root,"examples/reviewer-return.json"),"utf8"));
let x=await api.apply(w,{id:"course-return-source",type:"source.add",actor:"Native software receiving",at:"2026-10-14T16:40:00.000Z",input:{name:"reviewer-return.json",role:"prior_review",mediaType:"application/json",text:json(returned)}});
const input={returnSourceId:x.result.id,reviewer:"Native software receiving",note:"Exact source/subject/chain validation before adoption."},preview=await api.previewAdoption(x.workspace,input);
need(preview.additions.length===1&&preview.alreadyPresent.length===2,"Return completeness differs");
x=await api.apply(x.workspace,{id:"course-return-adopt",type:"review.adopt",actor:"Native software receiving",at:"2026-10-14T16:40:00.000Z",input:{...input,previewSha256:preview.sha256}});
const final=await api.exportWorkspace(x.workspace);need(api.digest(await api.importWorkspace(final))===api.digest(x.workspace),"Adopted workspace reopening differs");
const result={schema:"tjlabs.privacybench-native-domain-receiving.v1",originalRun:{bytes:originalRun.length,sha256:hash(originalRun)},originalRows:first.table.rows.length,originalOperations:w.revision,reviewerReturn:{added:preview.additions.length,alreadyPresent:preview.alreadyPresent.length},finalRevision:x.workspace.revision,evaluatorExecuted:false};
const files=[];const add=(path,content)=>{const b=Buffer.from(content);files.push({path,content,bytes:b.length,sha256:hash(b)});};
add("domain-receiving.json",json(result));add("original-reopened.json",json(await api.exportWorkspace(reopened)));add("returned-adopted.json",json(final));
for(const edition of x.workspace.editions){const p=await api.prepareResearch(x.workspace,{editionId:edition.id});for(const f of p.files)files.push({...f,path:"research/"+codec.sha256Bytes(codec.utf8Encode(edition.id)).slice(0,24)+"/"+f.path});}
if(!process.argv[2])throw Error("Usage: node commissioning/receive-privacybench-domain.mjs /absolute/owned-output");
await writeExactFiles(process.argv[2],files);console.log(json(result));
