#!/usr/bin/env node
// MIT. Same original preparation; no service, database, browser or provider launch.
import {resolve} from 'node:path';
import {pathToFileURL} from 'node:url';
import {inspectMaterialInstallationFile,templateMaterialInstallationFiles,prepareMaterialInstallationFiles,reopenMaterialInstallation} from './files.mjs';
export const USAGE='material-installation inspect --bundle FILE --sha256 SHA | template --bundle FILE --sha256 SHA --seed FILE --case FILE --commissioning FILE [--packet FILE] [--attachments FILE] --operation ORIGINAL_ID --out NEW_DIRECTORY | prepare --bundle FILE --sha256 SHA --seed FILE --case FILE --commissioning FILE [--packet FILE] [--attachments FILE] --bindings FILE --selection FILE --out NEW_DIRECTORY | reopen --directory COMPLETE_DIRECTORY';
export function parseArguments(argv){
 const [command,...args]=argv;
 const allowed={inspect:['bundle','sha256'],template:['bundle','sha256','seed','case','commissioning','packet','attachments','operation','out'],prepare:['bundle','sha256','seed','case','commissioning','packet','attachments','bindings','selection','out'],reopen:['directory']};
 if(!allowed[command]||args.length%2)throw Error(USAGE);
 const options={};
 for(let i=0;i<args.length;i+=2){
  const key=args[i].startsWith('--')?args[i].slice(2):'';
  if(!allowed[command].includes(key)||!args[i+1]||args[i+1].startsWith('--')||Object.hasOwn(options,key))throw Error(USAGE);
  options[key]=args[i+1];
 }
 const required=allowed[command].filter(k=>!['packet','attachments'].includes(k));
 if(required.some(k=>!options[k]))throw Error(USAGE);
 return {command,options};
}
export async function run(argv){
 const {command,options}=parseArguments(argv);
 if(command==='inspect')return inspectMaterialInstallationFile(options.bundle,options.sha256);
 if(command==='template')return templateMaterialInstallationFiles(options);
 if(command==='prepare')return prepareMaterialInstallationFiles(options);
 return reopenMaterialInstallation(options.directory);
}
if(process.argv[1]&&import.meta.url===pathToFileURL(resolve(process.argv[1])).href)
 run(process.argv.slice(2)).then(x=>console.log(JSON.stringify(x,null,2))).catch(e=>{console.error(e.stack??e);process.exitCode=1;});
