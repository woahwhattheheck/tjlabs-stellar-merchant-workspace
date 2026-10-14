// MIT. Rebuild the complete browser Research factory from maintained native sources.
import {readFile,writeFile} from 'node:fs/promises';
import {resolve,dirname} from 'node:path';
import {fileURLToPath} from 'node:url';
const root=resolve(dirname(fileURLToPath(import.meta.url)),"..");
const read=p=>readFile(resolve(root,p),"utf8");
const prepare=await read("source/research-dossiers/comparison/original-output/prepare.mjs");
const need=(v,m)=>{if(!v)throw Error(m);};
for(const marker of ["const LIMIT=","export async function original(","function utf8(","export async function retain("])need(prepare.includes(marker),"Maintained source marker changed: "+marker);
const pieces={
 "__CONTRACTS__":(await read("source/research-dossiers/comparison/contracts.mjs")).replace(/^import .*;\n/gm,"").replace(/^export /gm,""),
 "__HELPERS__":prepare.slice(prepare.indexOf("const LIMIT="),prepare.indexOf("export async function original(")),
 "__PURE__":prepare.slice(prepare.indexOf("function utf8("),prepare.indexOf("export async function retain(")).replace(/^export /gm,""),
 "__REVIEW__":(await read("source/research-dossiers/comparison/original-output/review.mjs")).replace(/^export /gm,"")
};
let source=await read("integration/research-factory-template.js");
for(const [marker,body]of Object.entries(pieces)){need(source.split(marker).length===2,"Template marker count: "+marker);source=source.replace(marker,()=>body);}
const target=resolve(root,"src/native-research.js");
if(process.argv.includes("--write"))await writeFile(target,source);else need(await readFile(target,"utf8")===source,"Browser Research factory differs; inspect current native changes then rebuild explicitly.");
process.stdout.write(JSON.stringify({file:"src/native-research.js",characters:source.length,mode:process.argv.includes("--write")?"written":"exact"})+"\n");
