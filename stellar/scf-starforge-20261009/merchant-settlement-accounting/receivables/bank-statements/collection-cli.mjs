// SPDX-License-Identifier: MIT
import {constants} from 'node:fs';
import {open,mkdir,lstat} from 'node:fs/promises';
import {isAbsolute,resolve,join} from 'node:path';
import {randomUUID} from 'node:crypto';
import {createCollection,appendFiles,updateItem,receiveCollection,sourceInputForItem,encodeBytes,decodeBytes,sha256} from './public/source-collection-model.mjs';
import {readBankStatementSource} from './source.mjs';
import {sourcePreview,previewIdentity} from './domain.mjs';
const help='Original bank statement collections\n\n'+
 'starforge bank-statements collection prepare --manifest /absolute/original-files.json --out /absolute/new-collection.json\n'+
 'starforge bank-statements collection inspect --input /absolute/collection.json --out /absolute/new-review.json\n'+
 'starforge bank-statements collection extract --input /absolute/collection.json --out /absolute/new-originals-directory\n\n'+
 'Manifest: {workspaceId:"original UUID",name:"collection",files:[{path:"/absolute/original.xml",mapping:{format:"CAMT053",columns:{},camtDetailPolicy:"PRESERVE_ONLY"},included:true,note:""}]}.\n'+
 'Each file retains its complete bytes and own explicit interpretation. Inspect uses the installed original source parser and includes every selected statement section or its actual source error. Complete collection files open in Statement collections in the existing bank browser. Outputs are create-only; extract also retains the complete source collection.\n';
const problem=(code,message)=>{throw Object.assign(new Error(message),{code});};
function absolute(value){if(typeof value!=='string'||!isAbsolute(value)||value!==resolve(value)||value==='/')problem('COLLECTION_PATH','Use an absolute normalized file or directory path.');return value;}
async function read(path,limit){
 const handle=await open(absolute(path),constants.O_RDONLY|(constants.O_NOFOLLOW??0)|(constants.O_NONBLOCK??0));
 try{const before=await handle.stat();if(!before.isFile()||before.size<1||before.size>limit)problem('COLLECTION_INPUT','Choose one complete regular file within the declared byte limit.');
  const bytes=await handle.readFile(),after=await handle.stat();if(bytes.length!==before.size||after.size!==before.size||after.mtimeMs!==before.mtimeMs)problem('COLLECTION_INPUT_CHANGED','The original file changed during reading.');return bytes;
 }finally{await handle.close();}
}
async function readJson(path,limit=192000000){const bytes=await read(path,limit);try{return JSON.parse(new TextDecoder('utf-8',{fatal:true}).decode(bytes));}catch{problem('COLLECTION_JSON','Use a complete UTF-8 JSON file.');}}
async function write(path,bytes){
 const file=await open(absolute(path),constants.O_WRONLY|constants.O_CREAT|constants.O_EXCL|(constants.O_NOFOLLOW??0),0o600);
 try{await file.writeFile(bytes);await file.sync();}finally{await file.close();}
 return {path,bytes:bytes.length,sha256:await sha256(bytes)};
}
const encoded=value=>Buffer.from(JSON.stringify(value),'utf8');
export async function runBankCollectionCli(argv,{stdout=process.stdout}={}){
 const [command='help',...rest]=argv;
 if(command==='help'||command==='--help'){stdout.write(help);return;}
 if(!['prepare','inspect','extract'].includes(command))problem('COLLECTION_COMMAND','Choose prepare, inspect or extract.');
 const flags={};for(let i=0;i<rest.length;i+=2){if(!['--manifest','--input','--out'].includes(rest[i])||!rest[i+1]||rest[i+1].startsWith('--')||Object.hasOwn(flags,rest[i]))problem('COLLECTION_ARGUMENT','Supply each documented option and value once.');flags[rest[i]]=rest[i+1];}
 const required=command==='prepare'?['--manifest','--out']:['--input','--out'];
 if(Object.keys(flags).length!==2||!required.every(k=>Object.hasOwn(flags,k)))problem('COLLECTION_ARGUMENT','Supply exactly the input and output options for this command.');
 absolute(flags['--out']);
 let collection;
 if(command==='prepare'){
  const manifest=await readJson(flags['--manifest'],8000000);
  if(!manifest||!Array.isArray(manifest.files)||!manifest.files.length||manifest.files.length>1000)problem('COLLECTION_MANIFEST','Select one to 1,000 original files with their explicit interpretations.');
  collection=createCollection({id:randomUUID(),workspaceId:manifest.workspaceId,name:manifest.name||'Original bank statements'});
  const entries=[];let total=0;
  for(const entry of manifest.files){const bytes=await read(entry.path,16000000);total+=bytes.length;if(total>128000000)problem('COLLECTION_LIMIT','The collection exceeds 128 MB of original files.');
   entries.push({id:randomUUID(),file:{name:entry.path.split('/').at(-1),dataBase64:encodeBytes(bytes)},mapping:entry.mapping});}
  collection=await appendFiles(collection,entries);
  for(let i=0;i<manifest.files.length;i++){const original=manifest.files[i];if(original.included!==undefined||original.note!==undefined)collection=updateItem(collection,collection.items[i].id,{...(original.included!==undefined?{included:original.included}:{}),...(original.note!==undefined?{note:original.note}:{})});}
  const output=await write(flags['--out'],encoded(collection));stdout.write(JSON.stringify({schema:collection.schema,collectionId:collection.id,files:collection.items.length,output})+'\n');return;
 }
 collection=await receiveCollection(await readJson(flags['--input']));
 if(command==='inspect'){
  const items=[];for(const item of collection.items){
   const selected={id:item.id,file:{name:item.file.name,bytes:item.file.bytes,sha256:item.file.sha256},included:item.included,note:item.note,mapping:item.mapping};
   if(!item.included){items.push({...selected,status:item.note.trim()?'EXCLUDED':'EXCLUSION_NOTE_REQUIRED'});continue;}
   try{const input=sourceInputForItem(item),report=readBankStatementSource(input);items.push({...selected,status:'REVIEWED',preview:{...sourcePreview(report),reviewSha256:previewIdentity(report,input)}});}
   catch(error){items.push({...selected,status:'SOURCE_REVIEW',problem:{code:error.code||'SOURCE_ERROR',message:error.message,details:error.details||{}}});}
  }
  const report={schema:'stellar-forge.bank-source-collection-review.v1',collectionId:collection.id,workspaceId:collection.workspaceId,revision:collection.revision,complete:true,items};
  const output=await write(flags['--out'],encoded(report));stdout.write(JSON.stringify({collectionId:collection.id,files:items.length,reviewed:items.filter(i=>i.status==='REVIEWED').length,sourceReview:items.filter(i=>i.status==='SOURCE_REVIEW').length,output})+'\n');return;
 }
 const root=absolute(flags['--out']);await mkdir(root,{mode:0o700});
 const stat=await lstat(root);if(!stat.isDirectory()||stat.isSymbolicLink()||(stat.mode&0o077))problem('COLLECTION_DIRECTORY','Use the newly created private output directory.');
 const outputs=[];for(const item of collection.items){const directory=join(root,item.id);await mkdir(directory,{mode:0o700});const originals=join(directory,'original');await mkdir(originals,{mode:0o700});outputs.push(await write(join(originals,item.file.name),decodeBytes(item.file.dataBase64)));outputs.push(await write(join(directory,'interpretation.json'),encoded({id:item.id,mapping:item.mapping,included:item.included,note:item.note})));}
 outputs.push(await write(join(root,'collection.json'),encoded(collection)));
 stdout.write(JSON.stringify({collectionId:collection.id,originals:collection.items.length,outputs})+'\n');
}
