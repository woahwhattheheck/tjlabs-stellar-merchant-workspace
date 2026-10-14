#!/usr/bin/env node
// MIT. Read-only source-bound PrivacyBench workspace and exact portable exports.
import {readFile,mkdir,lstat,open,link,unlink} from "node:fs/promises";
import {resolve,dirname,join} from "node:path";
import {createHash,randomUUID} from "node:crypto";
import vm from "node:vm";
import {fileURLToPath} from "node:url";
import * as codec from "../src/codec.mjs";
export async function loadPrivacyBench(root=resolve(dirname(fileURLToPath(import.meta.url)),"..")){
 const context=vm.createContext({console,Uint8Array,Map,Set,WeakMap,Date,JSON,Math,Number,String,Object,Array,RegExp,BigInt,Error,structuredClone,TextEncoder,TextDecoder});
 for(const p of ["src/native-research.js","src/native-privacybench.js","src/privacybench-workspace.js"])vm.runInContext(await readFile(join(root,p),"utf8"),context,{filename:p});
 const nativeResearch=context.createNativeResearch({codec}),nativePrivacyBench=context.createNativePrivacyBench({codec,nativeResearch});
 return {codec,nativeResearch,nativePrivacyBench,api:context.createPrivacyBenchWorkspace({codec,nativePrivacyBench,nativeResearch})};
}
const hash=b=>createHash("sha256").update(b).digest("hex");
async function exact(path,body){
 body=Buffer.isBuffer(body)?body:Buffer.from(body);await mkdir(dirname(path),{recursive:true});
 try{const st=await lstat(path);if(!st.isFile()||st.isSymbolicLink()||!Buffer.from(await readFile(path)).equals(body))throw Error("Conflicting existing output: "+path);return;}catch(e){if(e.code!=="ENOENT")throw e;}
 const temp=path+".stage-"+randomUUID();let handle;
 try{handle=await open(temp,"wx",0o600);await handle.writeFile(body);await handle.sync();await handle.close();handle=null;try{await link(temp,path);}catch(e){if(e.code!=="EEXIST")throw e;const st=await lstat(path);if(!st.isFile()||st.isSymbolicLink()||!Buffer.from(await readFile(path)).equals(body))throw Error("Conflicting concurrent output: "+path);}}
 finally{await handle?.close();await unlink(temp).catch(e=>{if(e.code!=="ENOENT")throw e;});}
}
export async function writeExactFiles(destination,files){
 const root=resolve(destination);let st;try{st=await lstat(root);}catch(e){if(e.code!=="ENOENT")throw e;await mkdir(root,{recursive:true});st=await lstat(root);}if(!st.isDirectory()||st.isSymbolicLink())throw Error("Output must be a real directory.");
 const seen=new Set();for(const f of files){if(typeof f.path!=="string"||!/^[A-Za-z0-9][A-Za-z0-9._/-]*$/.test(f.path)||f.path.split("/").some(x=>!x||x==="."||x==="..")||f.path.endsWith("/"))throw Error("Unsafe output path.");const key=f.path.toLowerCase();for(const old of seen)if(old===key||old.startsWith(key+"/")||key.startsWith(old+"/"))throw Error("Output path collision.");seen.add(key);const b=Buffer.from(f.content);if(b.length!==f.bytes||hash(b)!==f.sha256)throw Error("Changed prepared file: "+f.path);}
 for(const f of files){let dir=root;for(const part of f.path.split("/").slice(0,-1)){dir=join(dir,part);try{await mkdir(dir);}catch(e){if(e.code!=="EEXIST")throw e;}const s=await lstat(dir);if(!s.isDirectory()||s.isSymbolicLink())throw Error("Unsafe output directory.");}await exact(join(root,f.path),f.content);}
}
export async function main(args){
 const [command,input,output,selector]=args;if(!command||!input)throw Error("Usage: node native/privacybench-workspace.mjs inspect|receive|apply|research|report|review-return INPUT [OUTPUT] [SELECTOR_OR_REQUEST]");
 const {api}=await loadPrivacyBench(),raw=JSON.parse(await readFile(resolve(input),"utf8")),envelope=raw.schema==="tjlabs.privacybench-editable.v1"?raw.working:raw,w=await api.importWorkspace(envelope);
 if(command==="inspect"){console.log(JSON.stringify({id:w.id,label:w.label,revision:w.revision,sources:w.sources.length,editions:w.editions.length,comparisons:w.comparisons.length,reviews:w.reviews.length},null,2));return;}
 if(!output)throw Error("Explicit output path required.");
 if(command==="receive"){await exact(resolve(output),JSON.stringify(await api.exportWorkspace(w),null,2)+"\n");return;}
 if(command==="apply"){if(!selector)throw Error("Original request JSON required.");const q=JSON.parse(await readFile(resolve(selector),"utf8")),r=await api.apply(w,q);await exact(resolve(output),JSON.stringify(await api.exportWorkspace(r.workspace),null,2)+"\n");console.log(JSON.stringify(r.result));return;}
 if(command==="research"){if(!selector)throw Error("Saved edition ID required.");const p=await api.prepareResearch(w,{editionId:selector});await writeExactFiles(output,p.files);return;}
 if(command==="report"||command==="review-return"){const [subject,...ids]=String(selector||"").split("/"),subjectId=ids.join("/");const r=command==="report"?await api.report(w,{subject,id:subjectId}):await api.exportReviewReturn(w,{subject,subjectId});await exact(resolve(output),JSON.stringify(r,null,2)+"\n");return;}
 throw Error("Unknown command.");
}
if(process.argv[1]&&resolve(process.argv[1])===fileURLToPath(import.meta.url))main(process.argv.slice(2)).catch(error=>{console.error(error.code||error.message);process.exitCode=1;});
