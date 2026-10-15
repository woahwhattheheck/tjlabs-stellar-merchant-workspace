#!/usr/bin/env node
import fs from "node:fs";
import path from "node:path";
import {fileURLToPath} from "node:url";
import {runtime} from "./runtime.mjs";
import {ownedDirectory,writeMember} from "./io.mjs";
import {createTelemetryAPI} from "../telemetry/core.mjs";
import {demonstration} from "../telemetry/example.mjs";
import {reportMarkdown,reportHTML,pairsCSV} from "../telemetry/report.mjs";
const api=createTelemetryAPI(runtime),argv=process.argv.slice(2),command=argv.shift(),args={};
for(let i=0;i<argv.length;i+=2){if(!argv[i].startsWith("--")||argv[i+1]===undefined||args[argv[i].slice(2)]!==undefined)throw Error("Arguments must be unique --name value pairs");args[argv[i].slice(2)]=argv[i+1];}
const allowed=new Set(["workspace","input","file","name","type","source-id","format","array-pointer","out","at","operation","parent","prepared-by","note","edition","reviewer","decision","left","right","title"]);
for(const k of Object.keys(args))if(!allowed.has(k))throw Error("Unknown argument --"+k);
const required=k=>{if(!args[k])throw Error("Required --"+k);return args[k];};
function read(name,max){const f=path.resolve(name),st=fs.lstatSync(f);if(!st.isFile()||st.isSymbolicLink()||st.size>max)throw Error("Expected bounded regular input file: "+f);return fs.readFileSync(f);}
const readText=(name,max)=>runtime.decode(new Uint8Array(read(name,max)));
function sourceBank(){
 const root=path.resolve(path.dirname(fileURLToPath(import.meta.url)),".."),manifestPath=path.join(root,"source-manifest.json"),raw=readText(manifestPath,4*1024*1024),manifest=api.parseJSON(raw),files=[];
 if(manifest.schema!=="tjlabs.telemetry-source-manifest.v1"||!Array.isArray(manifest.files))throw Error("Complete maintained source manifest required");
 const names=new Set();
 for(const f of manifest.files){if(typeof f.path!=="string"||path.isAbsolute(f.path)||f.path.split(/[\\/]/).some(x=>!x||x==="."||x==="..")||names.has(f.path))throw Error("Unsafe/duplicate source member");names.add(f.path);const parts=f.path.split("/");let p=root;for(const x of parts){p=path.join(p,x);if(fs.lstatSync(p).isSymbolicLink())throw Error("Source symlink rejected");}const b=read(p,20*1024*1024);if(b.length!==f.bytes||runtime.sha256(b)!==f.sha256)throw Error("Changed source: "+f.path);files.push({...f,content:runtime.decode(new Uint8Array(b))});}
 files.push({path:"source-manifest.json",mode:"100644",encoding:"utf8",bytes:runtime.encode(raw).length,sha256:runtime.sha256(raw),content:raw});
 return {schema:"tjlabs.telemetry-complete-source.v1",files};
}
const source=sourceBank();let w=null,input=null,result=null,report=null;
if(args.workspace)w=api.importWorkspace(readText(args.workspace,128*1024*1024));
if(args.input)input=api.parseJSON(readText(args.input,8*1024*1024));
const meta=()=>({operationId:required("operation"),expectedRoot:w.rootSha256,at:required("at")});
if(command==="blank"){w=api.createWorkspace({title:args.title||"Telemetry workspace",createdAt:required("at")});input=api.blankInput();}
else if(command==="demo"){const d=demonstration(runtime,api);w=d.workspace;input=d.input;result=d.comparison;}
else if(command==="source"){if(!w)throw Error("--workspace required");const b=read(required("file"),20*1024*1024),r=api.addSource(w,{name:args.name||path.basename(args.file),mediaType:args.type||"application/octet-stream",content_base64:runtime.toBase64(new Uint8Array(b))},meta());w=r.workspace;result={sourceId:r.sourceId};}
else if(command==="inspect"){if(!w)throw Error("--workspace required");result=api.inspectSource(w,required("source-id"),{format:args.format||"csv",arrayPointer:args["array-pointer"]||""});}
else if(command==="analyse"){if(!w||!input)throw Error("--workspace and --input required");report=api.analyse(input,w);}
else if(command==="freeze"){if(!w||!input)throw Error("--workspace and --input required");const r=api.saveEdition(w,{name:required("name"),input,parentEditionId:args.parent||null,preparedBy:args["prepared-by"]||"",note:args.note||""},meta());w=r.workspace;report=r.report;result={editionId:r.editionId};}
else if(command==="review"){if(!w)throw Error("--workspace required");w=api.review(w,{editionId:required("edition"),decision:required("decision"),reviewer:required("reviewer"),note:required("note")},meta());}
else if(command==="compare"){if(!w)throw Error("--workspace required");result=api.compare(w,required("left"),required("right"));}
else if(command==="receive"){if(!w)throw Error("--workspace required");}
else throw Error("Commands: blank, demo, source, inspect, analyse, freeze, review, compare, receive");
const exported=api.exportWorkspace(w),sourceText=JSON.stringify(source)+"\n",identity=runtime.sha256(api.canonical({command,args:Object.fromEntries(Object.entries(args).filter(([k])=>k!=="out")),workspaceSha256:exported.sha256,inputSha256:input?runtime.sha256(api.canonical(input)):null,sourceSha256:runtime.sha256(sourceText)}));
const root=ownedDirectory(required("out"),identity),written=[];
const emit=(name,content)=>written.push(writeMember(root,name,content));
emit("Telemetry_Workspace.json",exported.content);
emit("Telemetry_Complete_Source.json",sourceText);
if(input)emit("Selected_Input.json",JSON.stringify(input,null,2)+"\n");
if(result)emit("Result.json",JSON.stringify(result,null,2)+"\n");
if(report){emit("Preview_Report.json",JSON.stringify(report)+"\n");emit("Preview_Report.md",reportMarkdown(report));emit("Preview_Report.html",reportHTML(report));emit("Preview_Pairs.csv",pairsCSV(report));}
for(let i=0;i<w.sources.length;i++){const s=api.readSource(w,w.sources[i].id),safe=s.name.replace(/[^A-Za-z0-9._-]/g,"_").slice(0,120)||"original";emit("originals/"+String(i+1).padStart(4,"0")+"_"+safe,runtime.fromBase64(s.content_base64));}
for(const e of w.editions){emit("editions/"+e.id+"/Input.json",JSON.stringify(e.input,null,2)+"\n");emit("editions/"+e.id+"/Report.json",JSON.stringify(e.report)+"\n");emit("editions/"+e.id+"/Report.md",reportMarkdown(e.report));emit("editions/"+e.id+"/Report.html",reportHTML(e.report));emit("editions/"+e.id+"/Pairs.csv",pairsCSV(e.report));}
const handoff={schema:"tjlabs.telemetry-native-receiving.v1",engine:api.engine,command,identity,workspaceSha256:exported.sha256,rootSha256:w.rootSha256,files:written};
writeMember(root,"COMPLETE.json",JSON.stringify(handoff,null,2)+"\n");
const fresh=api.importWorkspace(readText(path.join(root,"Telemetry_Workspace.json"),128*1024*1024));
if(fresh.rootSha256!==w.rootSha256)throw Error("Materialized working source did not independently reopen");
for(const f of written){const b=read(path.join(root,f.path),256*1024*1024);if(b.length!==f.bytes||runtime.sha256(b)!==f.sha256)throw Error("Materialized member differs: "+f.path);}
process.stdout.write(JSON.stringify({directory:root,files:written.length,workspaceSha256:exported.sha256,rootSha256:w.rootSha256,complete:"COMPLETE.json"})+"\n");
