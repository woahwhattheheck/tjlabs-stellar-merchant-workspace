#!/usr/bin/env node
/* Complete offline receiver. No SDK invocation, credentials, HTTP or host writes. */
import fs from "node:fs";
import path from "node:path";
import vm from "node:vm";
import crypto from "node:crypto";
import {fileURLToPath} from "node:url";
import * as codec from "../operator/codec.mjs";

const root=path.dirname(path.dirname(fileURLToPath(import.meta.url)));
const fail=m=>{throw Error(m);},need=(v,m)=>{if(!v)fail(m);};
const hash=b=>crypto.createHash("sha256").update(b).digest("hex");
function readText(p,max=128*1024*1024){const s=fs.lstatSync(p);need(s.isFile()&&!s.isSymbolicLink()&&s.size<=max,"Expected a bounded regular input: "+p);const b=fs.readFileSync(p),t=b.toString("utf8");need(Buffer.from(t,"utf8").equals(b),"Input is not exact UTF-8: "+p);return t;}
function factory(relative,name){const file=path.join(root,relative),s=readText(file);return vm.runInNewContext(s+";"+name,{},{filename:file});}
const parsers=factory("src/source-parsers.js","createSourceParsers")(),core=factory("src/import-host-core.js","createImportHostCore")({codec,parsers});
function portable(p){need(typeof p==="string"&&p.length&&p.length<=512&&!p.includes("\\")&&!p.startsWith("/")&&!/[\x00-\x1f:]/.test(p),"Unsafe relative path");const a=p.split("/");need(a.every(x=>x&&x!=="."&&x!==".."&&!/[. ]$/.test(x)&&!(/^(con|prn|aux|nul|com[1-9]|lpt[1-9])(?:\.|$)/i.test(x))),"Nonportable path");return p;}
function sourceFiles(){
 const name="source-manifest.json",text=readText(path.join(root,name)),manifest=JSON.parse(text);need(Array.isArray(manifest.files),"Complete source manifest files required");const files=[];
 for(const f of manifest.files){portable(f.path);need(f.path!==name,"Source manifest must exclude itself");const file=path.join(root,...f.path.split("/"));let current=root;for(const part of f.path.split("/")){current=path.join(current,part);need(!fs.lstatSync(current).isSymbolicLink(),"Source contains symlink");}const b=fs.readFileSync(file);need(b.length===f.bytes&&hash(b)===f.sha256,"Application source differs: "+f.path);files.push({path:"application/"+f.path,bytes:b});}
 files.push({path:"application/"+name,bytes:Buffer.from(text)});return files;
}
function prepareFiles(w,selection,extra=[]){
 const h=core.handover(w,selection),files=[{path:"working.json",bytes:Buffer.from(JSON.stringify(h.working,null,2)+"\n")},{path:"report.json",bytes:Buffer.from(JSON.stringify(h.report,null,2)+"\n")},{path:"report.csv",bytes:Buffer.from(core.csv(h.report))},{path:"originals-index.json",bytes:Buffer.from(JSON.stringify(h.originalFiles.map(({content,...f})=>f),null,2)+"\n")},...h.originalFiles.map(f=>({path:f.path,bytes:Buffer.from(f.content)})),...sourceFiles(),...extra];
 const seen=new Set();let total=0;for(const f of files){portable(f.path);const k=f.path.toLowerCase();need(!seen.has(k),"Output path collision: "+f.path);seen.add(k);total+=f.bytes.length;need(total<=256*1024*1024,"Complete native output exceeds 256MiB");}
 need(!seen.has("handover-manifest.json"),"Reserved manifest path collision");const manifest={schema:"tjlabs.import-host-native-handover.v1",workspaceSha256:h.working.sha256,files:files.map(f=>({path:f.path,bytes:f.bytes.length,sha256:hash(f.bytes)}))};files.push({path:"HANDOVER-MANIFEST.json",bytes:Buffer.from(JSON.stringify(manifest,null,2)+"\n")});return files;
}
function syncDir(dir){if(process.platform==="win32")return;const fd=fs.openSync(dir,"r");try{fs.fsyncSync(fd);}finally{fs.closeSync(fd);}}
function ensureDir(dir){try{fs.mkdirSync(dir);}catch(e){if(e.code!=="EEXIST")throw e;}const s=fs.lstatSync(dir);need(s.isDirectory()&&!s.isSymbolicLink(),"Unsafe directory: "+dir);}
function verifyFile(file,bytes){const s=fs.lstatSync(file);need(s.isFile()&&!s.isSymbolicLink()&&s.size===bytes.length&&fs.readFileSync(file).equals(bytes),"Existing output differs; preserved: "+file);}
function writeExact(file,bytes){
 try{verifyFile(file,bytes);return;}catch(e){if(e.code!=="ENOENT")throw e;}
 const dir=path.dirname(file),tmp=path.join(dir,".filio-stage-"+hash(bytes)+"-"+crypto.randomUUID());let fd;
 try{fd=fs.openSync(tmp,"wx",0o600);fs.writeFileSync(fd,bytes);fs.fsyncSync(fd);fs.closeSync(fd);fd=undefined;try{fs.linkSync(tmp,file);}catch(e){if(e.code!=="EEXIST")throw e;verifyFile(file,bytes);}syncDir(dir);}finally{if(fd!==undefined)fs.closeSync(fd);try{fs.unlinkSync(tmp);}catch(e){if(e.code!=="ENOENT")throw e;}}
}
function publish(out,files){
 out=path.resolve(out);const parent=path.dirname(out);need(fs.lstatSync(parent).isDirectory()&&!fs.lstatSync(parent).isSymbolicLink(),"Output parent must be an existing real directory");
 const state=out+".import-host-state",marker=path.join(state,"owner.json"),plan={schema:"tjlabs.import-host-publication.v1",output:out,files:files.map(f=>({path:f.path,bytes:f.bytes.length,sha256:hash(f.bytes)}))},owner=Buffer.from(JSON.stringify(plan,null,2)+"\n");
 ensureDir(state);let owned=false;try{verifyFile(marker,owner);owned=true;}catch(e){if(e.code!=="ENOENT")throw e;}
 if(!owned){need(fs.readdirSync(state).every(n=>/^\.filio-stage-[a-f0-9]{64}-[a-f0-9-]+$/.test(n)),"Unowned recovery directory has unrelated content");try{const st=fs.lstatSync(out);need(st.isDirectory()&&!st.isSymbolicLink()&&fs.readdirSync(out).length===0,"Unowned destination is not empty");}catch(e){if(e.code!=="ENOENT")throw e;}writeExact(marker,owner);}
 ensureDir(out);
 const allowed=new Map(files.map(f=>[f.path,f])),dirs=new Set();for(const f of files){const a=f.path.split("/");a.pop();for(let i=1;i<=a.length;i++)dirs.add(a.slice(0,i).join("/"));}
 function inspect(dir,prefix=""){for(const n of fs.readdirSync(dir)){const rel=prefix+n,file=path.join(dir,n),s=fs.lstatSync(file);need(!s.isSymbolicLink(),"Destination symlink rejected");if(s.isDirectory()){need(dirs.has(rel),"Unplanned directory preserved: "+rel);inspect(file,rel+"/");}else{need(s.isFile(),"Nonregular destination member");if(allowed.has(rel))verifyFile(file,allowed.get(rel).bytes);else need(/^\.filio-stage-[a-f0-9]{64}-[a-f0-9-]+$/.test(n),"Unplanned file preserved: "+rel);}}}
 inspect(out);
 for(const d of [...dirs].sort((a,b)=>a.split("/").length-b.split("/").length))ensureDir(path.join(out,...d.split("/")));
 for(const f of files)writeExact(path.join(out,...f.path.split("/")),f.bytes);
 for(const f of files)verifyFile(path.join(out,...f.path.split("/")),f.bytes);
 return {output:out,files:files.length,bytes:files.reduce((n,f)=>n+f.bytes.length,0),manifestSha256:hash(files.at(-1).bytes)};
}
function usage(){return "node tools/import-host.mjs example --out /absolute/new-directory\nnode tools/import-host.mjs receive --working WORKING.json [--selection SELECTION.json] --out /absolute/new-directory\nnode tools/import-host.mjs apply --working WORKING.json --request REQUEST.json [--selection SELECTION.json] --out /absolute/new-directory\nAll outputs are create-only; exact same plan resumes. No provider/host writes.";}
const args=process.argv.slice(2),command=args.shift();if(!command||command==="--help"){console.log(usage());}else{
 const opts={};while(args.length){const k=args.shift(),v=args.shift();need(["--out","--working","--request","--selection"].includes(k)&&v&&!opts[k],"Unknown, missing or repeated argument");opts[k]=v;}need(opts["--out"],"--out required");
 let w,extra=[],selection=opts["--selection"]?JSON.parse(readText(opts["--selection"])):{};
 if(command==="example"){
  const course=factory("commissioning/run-domain-course.js","runImportHostCourse")({core,codec}),fixture=JSON.parse(readText(path.join(root,"examples/independent-host-fixture.json"))),identity=factory("commissioning/run-host-identity-course.js","runHostIdentityCourse")({core,codec,originalFixture:fixture});
  const bridgeResult=await factory("commissioning/run-host-bridge-course.js","runHostBridgeCourse")({core,codec,createBridge:factory("src/host-bridge.js","createImportHostBridge"),working:course.working});w=core.importWorkspace(course.working);selection={comparisonId:"comparison-1"};extra=[{path:"course/bridge-course.json",bytes:Buffer.from(JSON.stringify(bridgeResult,null,2)+"\n")},{path:"course/original-course.json",bytes:Buffer.from(JSON.stringify(course,null,2)+"\n")},{path:"course/identity-course.json",bytes:Buffer.from(JSON.stringify(identity,null,2)+"\n")}];
 }else{
  need(command==="receive"||command==="apply","Unknown command");need(opts["--working"],"--working required");const raw=readText(opts["--working"]),v=JSON.parse(raw);
  if(v.schema==="commons.import-host-operator-carrier.v1"){const sessions=factory("operator/session.js","createDeskSessionAPI")(core,codec,{parse:t=>parsers.losslessJSON(t,false)}),session=sessions.receive(raw);w=session.workspace;core.validateWorkspace(w);}else w=core.importWorkspace(v);extra.push({path:"received/working-original.json",bytes:Buffer.from(raw)});
  if(command==="apply"){need(opts["--request"],"--request required");const rawRequest=readText(opts["--request"]),request=JSON.parse(rawRequest);w=core.apply(w,request).workspace;extra.push({path:"received/request-original.json",bytes:Buffer.from(rawRequest)});}
 }
 const result=publish(opts["--out"],prepareFiles(w,selection,extra));console.log(JSON.stringify(result,null,2));
}
