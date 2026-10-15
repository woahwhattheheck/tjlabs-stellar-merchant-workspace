#!/usr/bin/env node
import fs from "node:fs/promises";
import path from "node:path";
import {createRepairQueueCore} from "./repair-queue-core.mjs";
import {createArchiveCodec} from "./archive-codec.mjs";
const core=createRepairQueueCore(createArchiveCodec());
const argv=process.argv.slice(2),action=argv.shift(),opts={};
while(argv.length){const k=argv.shift();if(!k.startsWith("--")||!argv.length)throw Error("Use --key value");opts[k.slice(2)]=argv.shift()}
async function read(file){const bytes=await fs.readFile(file);return new TextDecoder("utf-8",{fatal:true,ignoreBOM:true}).decode(bytes)}
async function json(file){return JSON.parse((await read(file)).replace(/^\uFEFF/,""))}
async function main(){
 if(!["receive","review","observe","report"].includes(action)||!opts.out)throw Error("Usage: cli.mjs receive --input intake.json [--workspace workspace.json] --out NEW_DIRECTORY | review/observe --workspace workspace.json --input record.json --out NEW_DIRECTORY | report --workspace workspace.json --edition ID --out NEW_DIRECTORY");
 let original=null,incomingDesk=null,w;
 if(opts.workspace){original=await read(opts.workspace);const x=JSON.parse(original.replace(/^\uFEFF/,""));if(x.schema==="tjlabs.repair-queue-desk.v1"){incomingDesk=x;w=core.reopen(x.workspace)}else w=core.reopen(x)}
 if(action==="receive"){const i=await json(opts.input);if(i.old?.path)i.old={name:path.basename(i.old.path),text:await read(i.old.path)};if(i.next?.path)i.next={name:path.basename(i.next.path),text:await read(i.next.path)};w=core.receive(w||core.create({id:i.workspaceId||"repair-queue",label:i.workspaceLabel||"Repair queue receiving"}),i)}
 if(action==="review"||action==="observe"){if(!w)throw Error("Workspace required");w=core[action](w,await json(opts.input))}
 if(!w||!w.editions.length)throw Error("At least one edition required");const id=opts.edition||w.editions.at(-1).id,a=core.analyse(w,id);
 await fs.mkdir(opts.out,{recursive:false});
 const write=(n,s)=>fs.writeFile(path.join(opts.out,n),s,{flag:"wx"});
 const current=incomingDesk?{...incomingDesk,workspace:w}:w;
 await write("workspace.json",JSON.stringify(current,null,2)+"\n");await write("core-workspace.json",JSON.stringify(w,null,2)+"\n");if(original!==null)await write("original-input-workspace.json",original);
 await write("comparison.json",JSON.stringify(a,null,2)+"\n");await write("comparison.csv",core.csv(w,id));
 await write("report.html",'<!doctype html><html><head><meta charset="utf-8"><title>Repair queue comparison</title><style>body{font:15px system-ui;margin:24px;color:#202020}table{border-collapse:collapse;width:100%}td,th{border:1px solid #bbb;padding:8px;vertical-align:top}pre{white-space:pre-wrap;overflow-wrap:anywhere}</style></head><body>'+core.report(w,id)+'</body></html>');
 for(let n=0;n<w.editions.length;n++)for(const role of ["old","next"]){const s=w.editions[n][role];if(s)await write("edition-"+(n+1)+"-"+role+".csv",s.text)}
 await write("manifest.json",JSON.stringify({schema:"repair-queue.native-output.v1",workspaceId:w.id,editionId:id,sources:w.editions.map(e=>({id:e.id,sourcePair:e.sourcePair,old:e.old&&{name:e.old.name,sha256:e.old.sha256,bytes:e.old.bytes},next:{name:e.next.name,sha256:e.next.sha256,bytes:e.next.bytes}})),summary:a.summary},null,2)+"\n");
 process.stdout.write(JSON.stringify({directory:opts.out,summary:a.summary})+"\n");
}
main().catch(e=>{process.stderr.write(e.message+"\n");process.exitCode=1});
