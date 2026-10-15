#!/usr/bin/env node
import fs from "node:fs/promises";
import path from "node:path";
import {createBreweryCore} from "../src/brewery-core.mjs";
const core=createBreweryCore(),args=process.argv.slice(2),command=args.shift();
function option(name){const at=args.indexOf("--"+name);if(at<0||!args[at+1]||args[at+1].startsWith("--"))throw Error("Missing --"+name);const value=args[at+1];args.splice(at,2);return value}
async function original(filename){const bytes=await fs.readFile(filename),text=new TextDecoder("utf-8",{fatal:true,ignoreBOM:true}).decode(bytes);if(!Buffer.from(text,"utf8").equals(bytes))throw Error("Original UTF-8 bytes did not round-trip");return {name:path.basename(filename),text}}
async function json(filename){const body=(await original(filename)).text;return JSON.parse(body.charCodeAt(0)===0xfeff?body.slice(1):body)}
async function write(filename,body){await fs.writeFile(filename,body,{encoding:"utf8",flag:"wx"})}
function filename(name){return path.basename(name).replace(/[^A-Za-z0-9._-]/g,"_")||"original.csv"}
try{
 if(command==="create"){const id=option("id"),label=option("label"),out=option("out");if(args.length)throw Error("Unknown arguments");await write(out,JSON.stringify(core.create({id,label}),null,2)+"\n");console.log(out)}
 else if(command==="receive"||command==="review"){
  const input=option("workspace"),requestPath=option("request"),out=option("out");if(args.length)throw Error("Unknown arguments");
  if(path.resolve(input)===path.resolve(out)||path.resolve(requestPath)===path.resolve(out))throw Error("Choose a new output path and retain prior originals");
  const w=core.reopen(await json(input)),request=await json(requestPath);
  if(command==="receive"){
   const sources={};for(const [key,file]of Object.entries(request.sources)){if(typeof file!=="string")throw Error("Each intake source must be a relative/absolute UTF-8 CSV filename");sources[key]=await original(path.resolve(path.dirname(requestPath),file))}
   request.sources=sources;
  }else if(request.evidencePath){request.evidence=await original(path.resolve(path.dirname(requestPath),request.evidencePath));delete request.evidencePath}
  const next=command==="receive"?core.receive(w,request):core.review(w,request);
  await write(out,JSON.stringify(next,null,2)+"\n");console.log(out);
 }else if(command==="export"){
  const input=option("workspace"),id=option("edition"),out=option("out");if(args.length)throw Error("Unknown arguments");
  const w=core.reopen(await json(input)),e=core.editions(w).find(e=>e.id===id);if(!e)throw Error("Unknown edition");
  const files={"brewery-workspace.json":JSON.stringify(w,null,2)+"\n","reconciliation.html":core.report(w,id),"analysis.json":JSON.stringify(core.analyse(w,id),null,2)+"\n"};
  for(const kind of ["buckets","movements","exceptions","reviews","duplicates","recipes","accounts","orders"])files[kind+".csv"]=core.csv(w,id,kind);
  for(const [key,s]of Object.entries(e.sources))files[key+"-"+filename(s.name)]=s.text;
  await fs.mkdir(out,{recursive:false});const manifest=[];
  for(const [name,body]of Object.entries(files)){await write(path.join(out,name),body);manifest.push({path:name,bytes:Buffer.byteLength(body,"utf8"),sha256:core.sha256(body)})}
  await write(path.join(out,"MANIFEST.json"),JSON.stringify({schema:"tjlabs.brewery-export.v1",workspaceId:w.id,revision:w.revision,head:w.head,editionId:id,sourceSha256:e.sourceSha256,files:manifest},null,2)+"\n");console.log(out);
 }else throw Error("Commands: create | receive | review | export. See docs/RECONCILIATION.md.");
}catch(error){console.error(error.stack||String(error));process.exitCode=1}
