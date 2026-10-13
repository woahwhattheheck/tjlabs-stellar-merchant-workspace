// MIT. Selected original implementation and native workspace binding.
import {readdir,lstat,readFile,realpath} from 'node:fs/promises';
import {join,resolve,relative} from 'node:path';
import {fileURLToPath} from 'node:url';
import {createHash} from 'node:crypto';
import {need,json,sha256} from './contracts.mjs';
const roots=[fileURLToPath(new URL('./',import.meta.url)),fileURLToPath(new URL('../../sf88-operator-buyer-cli/research-dossiers/',import.meta.url)),fileURLToPath(new URL('../../sf88-operator-buyer-cli/node/',import.meta.url))];
const selected=/\.(?:mjs|cjs|js|json|mts|html|css)$/;
export async function zoteroSourceBinding(){
 const rows=[];
 for(let index=0;index<roots.length;index++){
  const root=await realpath(roots[index]);
  async function walk(path){
   for(const entry of (await readdir(path,{withFileTypes:true})).sort((a,b)=>a.name.localeCompare(b.name))){
    if(['node_modules','.git'].includes(entry.name))continue;
    const item=join(path,entry.name);
    if(entry.isDirectory())await walk(item);
    else if(selected.test(entry.name)){const before=await lstat(item,{bigint:true});need(before.isFile()&&!before.isSymbolicLink(),'ZOTERO_SOURCE_FILE_INVALID');
     const bytes=await readFile(item),after=await lstat(item,{bigint:true});
     need(['dev','ino','size','mtimeNs','ctimeNs'].every(key=>before[key]===after[key])&&BigInt(bytes.length)===after.size,'ZOTERO_IMPLEMENTATION_CHANGED');
     rows.push({path:index+'/'+relative(root,item).split('\\').join('/'),bytes:bytes.length,sha256:createHash('sha256').update(bytes).digest('hex')});
    }
   }
  }await walk(root);
 }
 return{schema:'stellar-forge.zotero-agent-source.v1',node:process.version,sha256:sha256(json(rows)),files:rows.length};
}
export async function zoteroWorkspaceBinding(directory){
 const actual=await realpath(directory);need(actual===resolve(directory),'ZOTERO_CANONICAL_DIRECTORY_REQUIRED');
 const directoryStat=await lstat(actual,{bigint:true}),database=await lstat(join(actual,'workspace.sqlite'),{bigint:true});
 need(directoryStat.isDirectory()&&!directoryStat.isSymbolicLink()&&database.isFile()&&!database.isSymbolicLink(),'ZOTERO_EXISTING_WORKSPACE_REQUIRED');
 return{directory:actual,directoryDevice:String(directoryStat.dev),directoryInode:String(directoryStat.ino),databaseDevice:String(database.dev),databaseInode:String(database.ino)};
}
