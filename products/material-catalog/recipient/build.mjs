#!/usr/bin/env node
// MIT. Build a completely offline browser recipient from the original source modules.
import {readFile,writeFile} from 'node:fs/promises';
import {resolve,dirname,join} from 'node:path';
import {fileURLToPath} from 'node:url';
import {openText} from './core.mjs';
import {assembleRecipient} from './assemble.mjs';
const ROOT=dirname(fileURLToPath(import.meta.url));
export async function buildRecipient({output,bundle}){
 if(!output)throw new Error('Select a new output HTML filename.');
 const names=['sha256.mjs','core.mjs','workspace.mjs','reader.html'];
 const values=await Promise.all(names.map(name=>readFile(join(ROOT,name),'utf8')));
 const sources=Object.fromEntries(names.map((name,i)=>[name,values[i]]));
 let summary=null,payload=null;
 if(bundle){
  const bytes=await readFile(bundle),text=new TextDecoder('utf-8',{fatal:true,ignoreBOM:true}).decode(bytes),opened=openText(text,{name:bundle.split(/[\\/]/).at(-1)});
  summary=opened.summary;payload={name:opened.name,base64:bytes.toString('base64'),sha256:opened.identity.sha256};
 }
 const html=assembleRecipient(sources,payload);
 await writeFile(resolve(output),html,{flag:'wx',mode:0o600});
 return {output:resolve(output),bytes:Buffer.byteLength(html),embedded:summary};
}
if(process.argv[1]&&resolve(process.argv[1])===fileURLToPath(import.meta.url)){
 const args=process.argv.slice(2),get=key=>{const i=args.indexOf(key);return i<0?undefined:args[i+1];};
 if(args.some((x,i)=>i%2===0&&!['--output','--bundle'].includes(x))||args.length%2)throw new Error('Usage: node build.mjs --output NEW.html [--bundle ORIGINAL.jsonl]');
 console.log(JSON.stringify(await buildRecipient({output:get('--output'),bundle:get('--bundle')}),null,2));
}
