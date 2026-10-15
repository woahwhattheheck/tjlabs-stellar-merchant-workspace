#!/usr/bin/env node
import fs from "node:fs";
import path from "node:path";
import {createCostingAPI} from "../costing/core.mjs";
import {reportMarkdown,reportHTML,reportCSV} from "../costing/report.mjs";
import {runtime} from "./runtime.mjs";
import {writeExact,ownedDirectory,writeMember} from "./io.mjs";
const api=createCostingAPI(runtime),[command,...args]=process.argv.slice(2),read=f=>fs.readFileSync(f,"utf8"),json=f=>api.parseJSON(read(f)),workspace=f=>api.importWorkspace(read(f)),save=(f,v)=>writeExact(path.resolve(f),typeof v==="string"?v:JSON.stringify(v,null,2)+"\n");
function required(n){if(args.length<n)throw Error("Insufficient arguments; see docs/NATIVE.md");}
function saved(w,out){save(out,api.exportWorkspace(w).content);process.stdout.write(JSON.stringify({workspace:path.resolve(out),rootSha256:w.rootSha256})+"\n");}
try{
 if(command==="blank"){required(1);saved(api.createWorkspace({title:args[1]||"Blank CPG costing workspace",createdAt:new Date().toISOString()}),args[0]);}
 else if(command==="source"){required(4);const w=workspace(args[0]),raw=fs.readFileSync(args[1]),p={name:path.basename(args[1]),mediaType:args[4]||"application/octet-stream",content_base64:runtime.toBase64(raw)},r=api.addSource(w,p,json(args[2]));saved(r.workspace,args[3]);process.stdout.write(JSON.stringify({sourceId:r.sourceId})+"\n");}
 else if(command==="inspect"||command==="map"){required(4);const w=workspace(args[0]),v=command==="inspect"?api.inspectSource(w,args[1],json(args[2])):api.mapTable(w,args[1],json(args[2]));save(args[3],v);}
 else if(command==="save"){required(4);const r=api.saveEdition(workspace(args[0]),json(args[1]),json(args[2]));saved(r.workspace,args[3]);process.stdout.write(JSON.stringify({editionId:r.editionId,ready:r.report.summary.ready})+"\n");}
 else if(command==="review"){required(4);saved(api.review(workspace(args[0]),json(args[1]),json(args[2])),args[3]);}
 else if(command==="compare"){required(4);save(args[3],api.compare(workspace(args[0]),args[1],args[2]));}
 else if(command==="report"){required(3);const w=workspace(args[0]),e=w.editions.find(x=>x.id===args[1]);if(!e)throw Error("Edition not found");save(args[2],e.report);}
 else if(command==="receive"){
  required(2);const w=workspace(args[0]),root=ownedDirectory(args[1],{workspaceRoot:w.rootSha256,engine:api.engine}),members=[];
  members.push(writeMember(root,"CPG_Costing_Workspace.json",api.exportWorkspace(w).content));
  const originals=[];for(let i=0;i<w.sources.length;i++){const s=api.readSource(w,w.sources[i].id),name="originals/"+String(i+1).padStart(4,"0")+".original";members.push(writeMember(root,name,runtime.fromBase64(s.content_base64)));originals.push({sourceId:s.id,originalName:s.name,mediaType:s.mediaType,bodySha256:s.bodySha256,bytes:s.bytes,receivedPath:name});}
  members.push(writeMember(root,"originals/index.json",JSON.stringify(originals,null,2)+"\n"));
  for(let i=0;i<w.editions.length;i++){const e=w.editions[i],dir="editions/"+String(i+1).padStart(4,"0");for(const [name,body]of[["input.json",JSON.stringify(e.input,null,2)+"\n"],["report.json",JSON.stringify(e.report,null,2)+"\n"],["report.md",reportMarkdown(e.report)],["report.html",reportHTML(e.report)],["report.csv",reportCSV(e.report)]])members.push(writeMember(root,dir+"/"+name,body));if(e.parentEditionId)members.push(writeMember(root,dir+"/comparison.json",JSON.stringify(api.compare(w,e.parentEditionId,e.id),null,2)+"\n"));}
  members.push(writeMember(root,"reviews.json",JSON.stringify(w.reviews,null,2)+"\n"));
  const complete={schema:"tjlabs.cpg-receiving-result.v1",engine:api.engine,rootSha256:w.rootSha256,members};writeMember(root,"COMPLETE.json",JSON.stringify(complete,null,2)+"\n");process.stdout.write(JSON.stringify({destination:root,rootSha256:w.rootSha256,members:members.length})+"\n");
 }else throw Error("Usage: costing-cli.mjs blank|source|inspect|map|save|review|compare|report|receive … ; see docs/NATIVE.md");
}catch(e){process.stderr.write(e.stack+"\n");process.exitCode=1;}
