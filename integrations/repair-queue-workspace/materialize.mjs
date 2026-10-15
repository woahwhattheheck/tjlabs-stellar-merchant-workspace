#!/usr/bin/env node
import fs from "node:fs/promises";
import path from "node:path";
import crypto from "node:crypto";
const [sourceFile,out]=process.argv.slice(2);
try{
 if(!sourceFile||!out)throw Error("Usage: node materialize.mjs COMPLETE_SOURCE.json NEW_DIRECTORY");
 const raw=await fs.readFile(sourceFile),bank=JSON.parse(new TextDecoder("utf-8",{fatal:true,ignoreBOM:true}).decode(raw).replace(/^\uFEFF/,""));
 if(!bank.files||typeof bank.files!=="object"||Array.isArray(bank.files)||!Array.isArray(bank.manifest))throw Error("Complete files and manifest required");
 const entries=Object.entries(bank.files),manifest=new Map(bank.manifest.map(m=>[m.path,m]));
 if(manifest.size!==bank.manifest.length||manifest.size!==entries.length)throw Error("Manifest population differs");
 const prepared=entries.map(([name,text])=>{
  if(typeof text!=="string"||typeof name!=="string"||!name||name.includes("\\")||name.includes("\0")||path.isAbsolute(name)||/^[A-Za-z]:/.test(name)||name.split("/").some(x=>!x||x==="."||x===".."))throw Error("Unsafe or invalid file path");
  const bytes=Buffer.from(text,"utf8"),m=manifest.get(name),sha=crypto.createHash("sha256").update(bytes).digest("hex");if(!m||m.bytes!==bytes.length||m.sha256!==sha)throw Error("Source hash differs: "+name);return {name,bytes};
 });
 await fs.mkdir(out,{recursive:false});const root=path.resolve(out);
 for(const f of prepared){const target=path.resolve(root,...f.name.split("/")),rel=path.relative(root,target);if(rel.startsWith(".."+path.sep)||path.isAbsolute(rel)||!rel)throw Error("Invalid destination");await fs.mkdir(path.dirname(target),{recursive:true});await fs.writeFile(target,f.bytes,{flag:"wx"})}
 process.stdout.write(JSON.stringify({directory:root,files:prepared.length,sourceSha256:crypto.createHash("sha256").update(raw).digest("hex")})+"\n");
}catch(e){process.stderr.write(e.message+"\n");process.exitCode=1}
