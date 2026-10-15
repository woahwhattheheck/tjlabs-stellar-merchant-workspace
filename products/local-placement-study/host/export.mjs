// MIT. Read exact complete installed source before constructing a retained handover.
import {readFile,lstat} from 'node:fs/promises';
import {join} from 'node:path';
import {fileURLToPath} from 'node:url';
import {codec,core,originalSessions,sessions} from '../runtime.mjs';
import {buildLocalPlacementStudyDesk} from '../src/build-installed.mjs';
import {buildLocalPlacementStudyExport} from './export-core.mjs';
import zip from '../src/connected_zip.cjs';
const root=fileURLToPath(new URL('../',import.meta.url));
export async function moduleSources(){
 const raw=await readFile(join(root,'source-manifest.json'),'utf8'),manifest=JSON.parse(raw),files={};
 for(const e of manifest.files){
  if(typeof e.path!=='string'||e.path.startsWith('/')||e.path.split('/').some(x=>!x||x==='.'||x==='..')||e.path.includes('\\'))throw Error('Unsafe source path');
  let path=root;for(const part of e.path.split('/')){path=join(path,part);if((await lstat(path)).isSymbolicLink())throw Error('Source link is not an original file');}
  const b=await readFile(path);if(b.length!==e.bytes||codec.sha256Bytes(b)!==e.sha256)throw Error('Complete application source differs: '+e.path);
  const t=codec.utf8Decode(b);if(codec.toBase64(codec.utf8Encode(t))!==codec.toBase64(b))throw Error('Source is not exact UTF-8');files[e.path]=t;
 }files['source-manifest.json']=raw;return files;
}
export function buildExport(files,state,records=[],editions=[]){
 return buildLocalPlacementStudyExport(files,state,records,editions,{codec,core,originalSessions,sessions,buildDesk:buildLocalPlacementStudyDesk,zip});
}
