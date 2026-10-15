import fs from "node:fs";
import path from "node:path";
import {randomUUID} from "node:crypto";
import {runtime} from "./runtime.mjs";
export function writeExact(filename,value){
 const bytes=typeof value==="string"?Buffer.from(value,"utf8"):Buffer.from(value),dir=path.dirname(filename);
 const same=()=>{const st=fs.lstatSync(filename);if(!st.isFile()||st.isSymbolicLink())throw Error("Existing destination is not a regular file: "+filename);if(!fs.readFileSync(filename).equals(bytes))throw Error("Existing destination differs: "+filename);};
 if(fs.existsSync(filename)){same();return;}
 const temp=path.join(dir,"."+path.basename(filename)+".pending-"+randomUUID());let fd;
 try{fd=fs.openSync(temp,"wx",0o600);fs.writeFileSync(fd,bytes);fs.fsyncSync(fd);fs.closeSync(fd);fd=undefined;try{fs.linkSync(temp,filename);}catch(e){if(e.code!=="EEXIST")throw e;same();}if(process.platform!=="win32"){const d=fs.openSync(dir,"r");try{fs.fsyncSync(d);}finally{fs.closeSync(d);}}}
 finally{if(fd!==undefined)fs.closeSync(fd);if(fs.existsSync(temp))fs.unlinkSync(temp);}
 same();
}
export function ownedDirectory(destination,identity){
 const root=path.resolve(destination),marker=".cpg-receiving-owner.json",text=JSON.stringify({schema:"tjlabs.cpg-receiving-owner.v1",identity})+"\n";
 try{fs.mkdirSync(root);}catch(e){if(e.code!=="EEXIST")throw e;}
 const st=fs.lstatSync(root);if(!st.isDirectory()||st.isSymbolicLink())throw Error("Destination must be a real directory");
 const m=path.join(root,marker);
 if(!fs.existsSync(m)){const allowedPrefix="."+marker+".pending-";const other=fs.readdirSync(root).filter(x=>!x.startsWith(allowedPrefix));if(other.length)throw Error("Unowned occupied destination; choose an empty directory");}
 writeExact(m,text);return root;
}
export function writeMember(root,name,value){
 if(!name||path.isAbsolute(name)||name.split(/[\\/]/).some(x=>!x||x==="."||x===".."))throw Error("Unsafe output member");
 const parts=name.split("/");let parent=root;
 for(const part of parts.slice(0,-1)){parent=path.join(parent,part);try{fs.mkdirSync(parent);}catch(e){if(e.code!=="EEXIST")throw e;}const st=fs.lstatSync(parent);if(!st.isDirectory()||st.isSymbolicLink())throw Error("Unsafe member directory");}
 const file=path.join(root,...parts);writeExact(file,value);const bytes=fs.readFileSync(file);return {path:name,bytes:bytes.length,sha256:runtime.sha256(bytes)};
}
