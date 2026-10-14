#!/usr/bin/env node
import fs from "node:fs";
import path from "node:path";
import crypto from "node:crypto";
import {fileURLToPath} from "node:url";
import {compileApplication} from "./source-build.mjs";
import {renderStandalone,createInitialWorking} from "./src/delivery.mjs";
const root=path.dirname(fileURLToPath(import.meta.url)),argv=process.argv.slice(2),i=argv.indexOf("--out"),arg=i>=0?argv[i+1]:null,accept=argv.includes("--accept-edits");
if(!arg)throw Error("Usage: node build.mjs --out /absolute/delivery [--accept-edits]");
const sha=b=>crypto.createHash("sha256").update(b).digest("hex"),read=p=>fs.readFileSync(path.join(root,p),"utf8"),manifest=JSON.parse(read("PRIVACYBENCH-SOURCE-MANIFEST.json"));
if(manifest.schema!=="tjlabs.privacybench-source-manifest.v1"||!Array.isArray(manifest.files))throw Error("Wrong source manifest");
const seen=new Set(),files=manifest.files.map(row=>{
const p=row.path;if(typeof p!=="string"||!/^[A-Za-z0-9][A-Za-z0-9._/-]*$/.test(p)||p.split("/").some(x=>!x||x==="."||x===".."))throw Error("Unsafe source path");
const key=p.toLowerCase();if([...seen].some(x=>x===key||x.startsWith(key+"/")||key.startsWith(x+"/")))throw Error("Source paths collide");seen.add(key);
let current=root;for(const part of p.split("/")){current=path.join(current,part);if(fs.lstatSync(current).isSymbolicLink())throw Error("Linked source path");}
if(!fs.lstatSync(current).isFile()||row.encoding!=="utf8"||!["100644","100755"].includes(row.mode))throw Error("Source member format differs");
const raw=fs.readFileSync(current),content=raw.toString("utf8");if(!Buffer.from(content).equals(raw))throw Error("Source is not exact UTF-8");
if(!accept&&(raw.length!==row.bytes||sha(raw)!==row.sha256))throw Error("Source changed; review it and use --accept-edits: "+p);
return {...row,bytes:raw.length,sha256:sha(raw),content};
});
const get=p=>{const f=files.find(x=>x.path===p);if(!f)throw Error("Missing complete source "+p);return f;},compiled=compileApplication(files),boot=get("web/standalone-bootstrap.js");
if(!accept&&boot.content!==compiled)throw Error("Retained bootstrap differs from complete current source");
Object.assign(boot,{content:compiled,bytes:Buffer.byteLength(compiled),sha256:sha(Buffer.from(compiled))});
const m={schema:"tjlabs.privacybench-source-manifest.v1",files:files.map(({content,...f})=>f)},mc=JSON.stringify(m,null,2)+"\n";
files.push({path:"PRIVACYBENCH-SOURCE-MANIFEST.json",mode:"100644",encoding:"utf8",bytes:Buffer.byteLength(mc),sha256:sha(Buffer.from(mc)),content:mc});
const bank={schema:"tjlabs.privacybench-complete-application.v1",operation:"PRIVACYBENCH-REVIEW",files},source=JSON.stringify(bank),working=createInitialWorking(bank),html=renderStandalone(bank,working);
const outputs=[["PrivacyBench_Complete_Application_Source.json",Buffer.from(source)],["Open_PrivacyBench_Review.html",Buffer.from(html)],["PrivacyBench_Working_Copy.json",Buffer.from(JSON.stringify(working,null,2)+"\n")],["WORKBENCH_GUIDE.md",Buffer.from(get("WORKBENCH_GUIDE.md").content)],["materialize_source.py",Buffer.from(get("native/materialize-source.py").content)]];
const out=path.resolve(arg),ownerName=".privacybench-delivery-owner.json",owner=Buffer.from(JSON.stringify({schema:"tjlabs.privacybench-delivery-owner.v1",sourceBytes:Buffer.byteLength(source),sourceSha256:sha(Buffer.from(source))}));
function syncdir(dir){if(process.platform==="win32")return;const fd=fs.openSync(dir,"r");try{fs.fsyncSync(fd);}finally{fs.closeSync(fd);}}
function verify(p,b){const s=fs.lstatSync(p);if(!s.isFile()||s.isSymbolicLink()||!fs.readFileSync(p).equals(b))throw Error("Existing output differs: "+p);}
function write(name,b){const final=path.join(out,name);if(fs.existsSync(final)){verify(final,b);return;}const tmp=path.join(out,"."+name+"."+crypto.randomUUID().replace(/-/g,"")+".stage");let fd;try{fd=fs.openSync(tmp,"wx",0o600);fs.writeFileSync(fd,b);fs.fsyncSync(fd);fs.closeSync(fd);fd=undefined;try{fs.linkSync(tmp,final);}catch(e){if(e.code!=="EEXIST")throw e;verify(final,b);}syncdir(out);}finally{if(fd!==undefined)fs.closeSync(fd);try{fs.unlinkSync(tmp);}catch(e){if(e.code!=="ENOENT")throw e;}}}
try{fs.mkdirSync(out);}catch(error){if(error.code!=="EEXIST")throw error;const s=fs.lstatSync(out);if(!s.isDirectory()||s.isSymbolicLink())throw Error("Delivery destination is not a regular directory");const p=path.join(out,ownerName);if(fs.existsSync(p))verify(p,owner);else for(const name of fs.readdirSync(out))if(!/^\.privacybench-delivery-owner\.json\.[0-9a-f]{32}\.stage$/.test(name)||!fs.lstatSync(path.join(out,name)).isFile()||fs.lstatSync(path.join(out,name)).isSymbolicLink())throw Error("Destination contains another unowned delivery");}
write(ownerName,owner);for(const [name,b]of outputs)write(name,b);for(const [name,b]of outputs)verify(path.join(out,name),b);
console.log(JSON.stringify({schema:"tjlabs.privacybench-built.v1",output:out,sourceSha256:sha(Buffer.from(source)),files:outputs.map(([name,b])=>({name,bytes:b.length,sha256:sha(b)}))},null,2));
