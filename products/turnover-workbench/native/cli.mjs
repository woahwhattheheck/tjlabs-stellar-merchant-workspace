#!/usr/bin/env node
import fs from "node:fs/promises";
import path from "node:path";
import {createTurnoverCore} from "../src/turnover-core.mjs";
const core=createTurnoverCore(),args=process.argv.slice(2),command=args.shift();
function option(name,required=true){const at=args.indexOf("--"+name);if(at<0){if(required)throw Error("Missing --"+name);return null}const value=args[at+1];if(!value||value.startsWith("--"))throw Error("Missing value for --"+name);args.splice(at,2);return value}
async function original(filename){const body=await fs.readFile(filename),text=new TextDecoder("utf-8",{fatal:true,ignoreBOM:true}).decode(body);if(!Buffer.from(text,"utf8").equals(body))throw Error("Original UTF-8 bytes did not round-trip");return {name:path.basename(filename),text}}
async function json(filename){return JSON.parse((await original(filename)).text)}
async function createFile(filename,text){await fs.writeFile(filename,text,{encoding:"utf8",flag:"wx"})}
function cleanName(name){return path.basename(name).replace(/[^A-Za-z0-9._-]/g,"_")||"original.csv"}
try{
 if(command==="create"){const out=option("out"),id=option("id"),label=option("label");if(args.length)throw Error("Unknown arguments");await createFile(out,JSON.stringify(core.create({id,label}),null,2)+"\n");console.log(out)}
 else if(["receive","review","note"].includes(command)){
  const input=option("workspace"),out=option("out");if(path.resolve(input)===path.resolve(out))throw Error("Use a new output file; retain the previous workspace");
  const w=core.reopen(await json(input));let next;
  if(command==="receive"){
   const id=option("id"),label=option("label"),numerator=option("rate-numerator"),denominator=option("rate-denominator"),oldFile=option("old"),nextFile=option("next"),cuesFile=option("cues"),notesFile=option("notes",false);
   const [old,cut,cues,notes]=await Promise.all([original(oldFile),original(nextFile),original(cuesFile),notesFile?original(notesFile):Promise.resolve({text:""})]);
   next=core.receive(w,{id,label,rate:{numerator,denominator},old,next:cut,cues,notes:notes.text,expectedRevision:w.revision});
  }else{
   const request=await json(option("request"));next=command==="review"?core.review(w,request):core.receiveNote(w,request);
  }
  if(args.length)throw Error("Unknown arguments");await createFile(out,JSON.stringify(next,null,2)+"\n");console.log(out);
 }else if(command==="export"){
  const input=option("workspace"),editionId=option("edition"),directory=option("out");if(args.length)throw Error("Unknown arguments");
  const w=core.reopen(await json(input)),edition=core.editions(w).find(e=>e.id===editionId);if(!edition)throw Error("Unknown edition");
  const files={"turnover-workspace.json":JSON.stringify(w,null,2)+"\n","turnover-report.html":core.report(w,editionId),"comparison.json":JSON.stringify(core.compare(w,editionId),null,2)+"\n"};
  for(const kind of ["cues","events","added","reviews","receiving"])files[kind+".csv"]=core.csv(w,editionId,kind);
  for(const kind of ["old","next","cues"])files[kind+"-"+cleanName(edition[kind].name)]=edition[kind].text;
  await fs.mkdir(directory,{recursive:false});const manifest=[];
  for(const [name,text]of Object.entries(files)){await createFile(path.join(directory,name),text);manifest.push({path:name,bytes:Buffer.byteLength(text,"utf8"),sha256:core.sha256(text)})}
  await createFile(path.join(directory,"MANIFEST.json"),JSON.stringify({schema:"tjlabs.turnover-export.v1",workspaceId:w.id,revision:w.revision,head:w.head,editionId,files:manifest},null,2)+"\n");
  console.log(directory);
 }else throw Error("Commands: create | receive | review | note | export. See docs/TURNOVER.md for complete examples.");
}catch(error){console.error(error.stack||String(error));process.exitCode=1}
