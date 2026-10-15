import { readFile,mkdir,writeFile } from "node:fs/promises";
import { resolve,join } from "node:path";
import { createHash } from "node:crypto";
const [input,target]=process.argv.slice(2);if(!input||!target)throw Error("Usage: node materialize.mjs source.json new-directory");
const bank=JSON.parse(await readFile(resolve(input),"utf8"));if(!bank.files||!Array.isArray(bank.manifest))throw Error("Complete source bank required");
const paths=Object.keys(bank.files);if(paths.length!==bank.manifest.length)throw Error("Manifest count differs");const checked=new Set;
for(const entry of bank.manifest){const {path,bytes,sha256}=entry;if(typeof path!=="string"||!path||path.startsWith("/")||path.includes("\\")||path.split("/").some(p=>p===".."||p==="."||p==="")||checked.has(path))throw Error("Unsafe or duplicate path");checked.add(path);const body=bank.files[path];if(typeof body!=="string")throw Error("Missing UTF-8 source "+path);if(Buffer.byteLength(body)!==bytes||createHash("sha256").update(body).digest("hex")!==sha256)throw Error("Source differs: "+path)}
const directory=resolve(target);await mkdir(directory);for(const path of paths){const parent=path.split("/").slice(0,-1).join("/");if(parent)await mkdir(join(directory,parent),{recursive:true});await writeFile(join(directory,path),bank.files[path],{flag:"wx"})}console.log(JSON.stringify({directory,files:paths.length}));
