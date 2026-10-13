// MIT. Capture the same declared browser runtime for the original native export.
import {readFile,stat} from 'node:fs/promises';
import {resolve,dirname} from 'node:path';
import {fileURLToPath} from 'node:url';
import {collectOfflineRuntime,createOfflineEditor,MAX_RUNTIME_FILE_BYTES} from './dist/grant-offline-package.mjs';
const home=dirname(fileURLToPath(import.meta.url));
async function textFile(path,maximum){
  const before=await stat(path);
  if(!before.isFile()||before.size>maximum)throw new Error('Retain a complete regular editor source: '+path);
  const bytes=await readFile(path);
  const after=await stat(path);
  if(bytes.length!==before.size||after.size!==before.size||after.mtimeMs!==before.mtimeMs)throw new Error('Keep the editor source stable during export: '+path);
  return new TextDecoder('utf-8',{fatal:true,ignoreBOM:true}).decode(bytes);
}
export async function readOfflineRuntime({directory=home}={}){
  const declaration=JSON.parse(await textFile(resolve(directory,'browser-assets.json'),MAX_RUNTIME_FILE_BYTES));
  if(declaration.schema!=='stellar-forge.browser-assets.v1'||typeof declaration.root!=='string'||!Array.isArray(declaration.routes))throw new Error('Use the original browser asset declaration.');
  const routes=new Map();
  for(const entry of declaration.routes){
    if(!Array.isArray(entry)||typeof entry[0]!=='string'||!Array.isArray(entry[1])||typeof entry[1][0]!=='string')throw new Error('Retain complete declared browser asset routes.');
    if(routes.has(entry[0]))throw new Error('Reconcile the repeated browser asset route '+entry[0]+'.');
    routes.set(entry[0],entry[1][0]);
  }
  const root=resolve(directory,declaration.root);
  return collectOfflineRuntime({readText:async(route,maximum)=>{
    const original=routes.get(route);if(!original)throw new Error('The installed editor is missing its declared dependency '+route+'. Rebuild from the complete source.');
    return textFile(resolve(root,original),maximum);
  }});
}
export async function createNativeOfflineEditor({envelope,runtime,directory,planningOptions,exportedAt}){
  return createOfflineEditor({envelope,runtime:runtime||await readOfflineRuntime({directory}),planningOptions,exportedAt});
}
