// SPDX-License-Identifier: MIT
import {constants} from 'node:fs';
import {open} from 'node:fs/promises';
import {isAbsolute,resolve} from 'node:path';
import {randomUUID} from 'node:crypto';
import {PROFILE_LIMITS,createProfileLibrary,validateProfileLibrary,saveProfile,receiveProfileLibrary,previewProfileApplication,applyProfileApplication} from './public/source-profile-model.mjs';
import {receiveCollection,updateItem,canonical,sha256} from './public/source-collection-model.mjs';
const HELP='Saved bank source interpretations\n\n'+
 'starforge bank-statements profile create --workspace UUID --mapping /absolute/mapping.json --name NAME --actor OPERATOR --reason REASON --out /absolute/new-library.json\n'+
 'starforge bank-statements profile revise --library /absolute/library.json --profile UUID --expected-version N --mapping /absolute/mapping.json --name NAME --actor OPERATOR --reason REASON --out /absolute/new-library.json\n'+
 'starforge bank-statements profile inspect --library /absolute/library.json --out /absolute/complete-history.json\n'+
 'starforge bank-statements profile receive --library /absolute/receiving-library.json --source /absolute/incoming-library.json --out /absolute/new-library.json\n'+
 'starforge bank-statements profile review --library /absolute/library.json --profile UUID --version N --input /absolute/collection.json --items UUID,UUID --out /absolute/review.json\n'+
 'starforge bank-statements profile apply --library /absolute/library.json --input /absolute/collection.json --review /absolute/review.json --out /absolute/new-collection.json\n\n'+
 'Review lists every mapping change for the explicitly selected originals. Apply requires the same complete library, collection and review; each original keeps its exact bytes, inclusion and note. File-specific balance rows and excluded rows are cleared for a fresh source review. Library outputs include every saved version. All outputs are create-only. See SOURCE_PROFILES.md.\n';
const problem=(code,message)=>{throw Object.assign(new Error(message),{code});};
const encoded=value=>Buffer.from(JSON.stringify(value),'utf8');
const digestValue=value=>sha256(encoded(canonical(value)));
const clone=value=>JSON.parse(JSON.stringify(value));
function absolute(path){if(typeof path!=='string'||!isAbsolute(path)||resolve(path)!==path||path==='/')problem('SOURCE_PROFILE_PATH','Use an absolute normalized file path.');return path;}
async function readJSON(path,limit){
 const handle=await open(absolute(path),constants.O_RDONLY|(constants.O_NOFOLLOW??0)|(constants.O_NONBLOCK??0));
 try{
  const before=await handle.stat();if(!before.isFile()||before.size<1||before.size>limit)problem('SOURCE_PROFILE_INPUT','Choose a complete regular file within the declared byte limit.');
  const bytes=await handle.readFile(),after=await handle.stat();if(bytes.length!==before.size||after.size!==before.size||after.mtimeMs!==before.mtimeMs)problem('SOURCE_PROFILE_INPUT_CHANGED','The selected file changed while being read.');
  let value;try{value=JSON.parse(new TextDecoder('utf-8',{fatal:true}).decode(bytes));}catch{problem('SOURCE_PROFILE_JSON','Use one complete UTF-8 JSON file.');}
  return {value,sha256:await sha256(bytes)};
 }finally{await handle.close();}
}
async function writeJSON(path,value){
 const bytes=encoded(value),handle=await open(absolute(path),constants.O_WRONLY|constants.O_CREAT|constants.O_EXCL|(constants.O_NOFOLLOW??0),0o600);
 try{await handle.writeFile(bytes);await handle.sync();}finally{await handle.close();}
 return {path,bytes:bytes.length,sha256:await sha256(bytes)};
}
function positive(value){if(typeof value!=='string'||!/^[1-9]\d*$/.test(value)||!Number.isSafeInteger(Number(value)))problem('SOURCE_PROFILE_VERSION','Use an explicit positive interpretation version.');return Number(value);}
const OPTIONS={
 create:['workspace','mapping','name','actor','reason','out'],
 revise:['library','profile','expected-version','mapping','name','actor','reason','out'],
 inspect:['library','out'],
 receive:['library','source','out'],
 review:['library','profile','version','input','items','out'],
 apply:['library','input','review','out']
};
export async function runBankProfileCli(argv,{stdout=process.stdout}={}){
 const [command='help',...rest]=argv;if(command==='help'||command==='--help'){stdout.write(HELP);return;}
 const allowed=OPTIONS[command];if(!allowed)problem('SOURCE_PROFILE_COMMAND','Choose create, revise, inspect, receive, review or apply.');
 const flags={};for(let n=0;n<rest.length;n+=2){const key=rest[n]?.replace(/^--/,'');if(!rest[n]?.startsWith('--')||!allowed.includes(key)||!rest[n+1]||rest[n+1].startsWith('--')||Object.hasOwn(flags,key))problem('SOURCE_PROFILE_ARGUMENT','Supply each documented option and value once.');flags[key]=rest[n+1];}
 if(allowed.some(key=>!Object.hasOwn(flags,key)))problem('SOURCE_PROFILE_ARGUMENT','Supply every documented option for this command.');absolute(flags.out);
 let record=null,library;
 if(command==='create')library=createProfileLibrary({id:randomUUID(),workspaceId:flags.workspace});
 else{record=await readJSON(flags.library,PROFILE_LIMITS.bytes);library=await validateProfileLibrary(record.value);}
 if(command==='create'||command==='revise'){
  const mapping=(await readJSON(flags.mapping,PROFILE_LIMITS.mappingBytes)).value;
  const profileId=command==='create'?randomUUID():flags.profile,version=command==='create'?0:positive(flags['expected-version']);
  const result=await saveProfile(library,{profileId,expectedRevision:library.revision,expectedVersion:version,name:flags.name,actor:flags.actor,reason:flags.reason,createdAt:new Date().toISOString(),mapping});
  const output=await writeJSON(flags.out,result);stdout.write(JSON.stringify({libraryId:result.id,revision:result.revision,profileId,version:version+1,output})+'\n');return;
 }
 if(command==='inspect'){
  const output=await writeJSON(flags.out,library);stdout.write(JSON.stringify({libraryId:library.id,workspaceId:library.workspaceId,revision:library.revision,profiles:library.profiles.map(p=>({id:p.id,origin:p.origin,versions:p.versions.length,head:p.versions.at(-1)})),output})+'\n');return;
 }
 if(command==='receive'){
  const incoming=(await readJSON(flags.source,PROFILE_LIMITS.bytes)).value;
  const result=await receiveProfileLibrary(library,incoming,{expectedRevision:library.revision,makeId:randomUUID});
  const output=await writeJSON(flags.out,result.library);stdout.write(JSON.stringify({libraryId:result.library.id,revision:result.library.revision,received:result.received,existing:result.existing,output})+'\n');return;
 }
 const source=await readJSON(flags.input,192000000);await receiveCollection(source.value);
 // Validation rereads every original; preserve unselected current working records verbatim.
 let collection=clone(source.value);
 if(collection.workspaceId!==library.workspaceId)problem('SOURCE_PROFILE_WORKSPACE','Receive the profile library into this collection workspace before applying it.');
 if(command==='review'){
  const ids=flags.items.split(',');if(!ids.length||ids.some(id=>!id)||new Set(ids).size!==ids.length)problem('SOURCE_PROFILE_SELECTION','Select each original collection item once.');
  const reviews=[];for(const id of ids){const item=collection.items.find(row=>row.id===id);if(!item)problem('SOURCE_PROFILE_SELECTION','A selected original is not in this collection.');
   reviews.push({itemId:id,review:await previewProfileApplication(library,{profileId:flags.profile,version:positive(flags.version),file:item.file,mapping:item.mapping})});}
  const review={schema:'stellar-forge.bank-source-profile-collection-review.v1',libraryId:library.id,librarySha256:record.sha256,collectionId:collection.id,workspaceId:collection.workspaceId,collectionRevision:collection.revision,collectionSha256:source.sha256,items:reviews};
  review.sha256=await digestValue(review);const output=await writeJSON(flags.out,review);
  stdout.write(JSON.stringify({collectionId:collection.id,selectedOriginals:reviews.length,reviewSha256:review.sha256,output})+'\n');return;
 }
 const review=(await readJSON(flags.review,192000000)).value;
 if(!review||review.schema!=='stellar-forge.bank-source-profile-collection-review.v1'||!Array.isArray(review.items)||!review.items.length||review.items.length>1000)problem('SOURCE_PROFILE_REVIEW','Use the complete original collection interpretation review.');
 const material=clone(review);delete material.sha256;
 if(review.sha256!==await digestValue(material)||review.libraryId!==library.id||review.librarySha256!==record.sha256||review.collectionId!==collection.id||review.workspaceId!==collection.workspaceId||review.collectionRevision!==collection.revision||review.collectionSha256!==source.sha256)problem('SOURCE_PROFILE_REVIEW_CHANGED','The complete library, original collection or selected interpretation review changed.');
 const ids=new Set();for(const selected of review.items){
  if(ids.has(selected.itemId))problem('SOURCE_PROFILE_SELECTION','Review each original once.');ids.add(selected.itemId);
  const item=collection.items.find(row=>row.id===selected.itemId);if(!item)problem('SOURCE_PROFILE_SELECTION','The reviewed original is missing from this collection.');
  const mapping=await applyProfileApplication(library,selected.review,{file:item.file,mapping:item.mapping});collection=updateItem(collection,item.id,{mapping});
 }
 const output=await writeJSON(flags.out,collection);stdout.write(JSON.stringify({collectionId:collection.id,revision:collection.revision,selectedOriginals:ids.size,reviewSha256:review.sha256,output})+'\n');
}
