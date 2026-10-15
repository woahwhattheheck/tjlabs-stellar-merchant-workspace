import * as fs from "node:fs/promises";
import path from "node:path";
import {pathToFileURL} from "node:url";
export function buildDesk(sources,working) {
  const required=["vendor/archive-codec.mjs","src/delivery-core.mjs","src/storage.mjs","src/desk.mjs","src/shell.html"];
  for(const p of required)if(typeof sources[p]!=="string")throw Error("Missing complete source: "+p);
  const clean=s=>s.replace(/^export /gm,""),json=x=>JSON.stringify(x).replace(/</g,"\\u003c").replace(/\u2028/g,"\\u2028").replace(/\u2029/g,"\\u2029");
  const runtime=[clean(sources[required[0]]),clean(sources[required[1]]),clean(sources[required[2]]),clean(sources[required[3]])].join("\n");
  const shell=sources["src/shell.html"],packed={runtime,shell};
  function portable(value) {
    const encode=x=>JSON.stringify(x).replace(/</g,"\\u003c").replace(/\u2028/g,"\\u2028").replace(/\u2029/g,"\\u2029");
    const s=SOURCE.runtime+"\nconst SOURCE="+encode(SOURCE)+";\nconst INITIAL="+encode(value)+";\n"+portable.toString()+"\n"+boot.toString()+"\nboot();";
    return SOURCE.shell.replace("__APP_SCRIPT__",()=>s.replace(/<\/script/gi,"<\\/script"));
  }
  function boot(){const codec=createArchiveCodec(),core=createDeliveryCore(codec),store=createDeliveryStore(globalThis.indexedDB,x=>core.hash(x));globalThis.pipelineDesk=mountDeliveryDesk(core,codec,store,INITIAL,portable)}
  const script=runtime+"\nconst SOURCE="+json(packed)+";\nconst INITIAL="+json(working)+";\n"+portable.toString()+"\n"+boot.toString()+"\nboot();";
  return shell.replace("__APP_SCRIPT__",()=>script.replace(/<\/script/gi,"<\\/script"));
}
async function main(args) {
  const[input,out]=args;if(!input||!out)throw Error("Usage: node build.mjs WORKING.json OUTPUT.html");
  const paths=["vendor/archive-codec.mjs","src/delivery-core.mjs","src/storage.mjs","src/desk.mjs","src/shell.html"],sources={};
  for(const p of paths)sources[p]=await fs.readFile(new URL(p,import.meta.url),"utf8");
  const original=await fs.readFile(input),working=JSON.parse(new TextDecoder("utf-8",{fatal:true,ignoreBOM:true}).decode(original).replace(/^\uFEFF/,""));
  const html=buildDesk(sources,working);await fs.writeFile(out,html,{flag:"wx"});process.stdout.write(out+"\n");
}
if(process.argv[1]&&import.meta.url===pathToFileURL(path.resolve(process.argv[1])).href)main(process.argv.slice(2)).catch(e=>{process.stderr.write(e.message+"\n");process.exitCode=1});
