#!/usr/bin/env node
import {readFile,lstat} from 'node:fs/promises';
import {resolve,dirname} from 'node:path';
import {buildProject,verifyProject,rebuildProject} from './maritime-project-native.mjs';

try{
 const args=process.argv.slice(2),command=args.shift(),options={};
 for(let i=0;i<args.length;i+=2){
  if(!args[i]?.startsWith('--')||args[i+1]===undefined||args[i+1].startsWith('--'))throw new Error('Use --name value pairs');
  const key=args[i].slice(2);if(Object.hasOwn(options,key))throw new Error('Repeated option --'+key);options[key]=args[i+1];
 }
 const need=name=>{if(!options[name])throw new Error('Missing --'+name);return options[name]};
 const allow=names=>{for(const key of Object.keys(options))if(!names.includes(key))throw new Error('Unknown option --'+key)};
 let result;
 if(command==='build'){
  allow(['project','out']);
  const path=resolve(need('project')),s=await lstat(path);
  if(!s.isFile()||s.isSymbolicLink()||s.size>2*1024*1024)throw new Error('Project JSON must be a regular file within 2 MiB');
  const config=JSON.parse(new TextDecoder('utf-8',{fatal:true}).decode(await readFile(path)));
  result=await buildProject({config,baseDirectory:dirname(path),directory:need('out')});
 }else if(command==='inspect'){
  allow(['project']);
  const received=await verifyProject(need('project'));
  result={directory:received.directory,project_id:received.project_id,input_sha256:received.input_sha256,
   files:received.manifest.files.length,bytes:received.manifest.total_bytes,source_modules:received.manifest.source_modules};
 }else if(command==='reopen'){
  allow(['project','out']);
  result=await rebuildProject({directory:need('project'),destination:need('out')});
 }else throw new Error('Commands: build --project project.json --out NEW_PROJECT; inspect --project RECEIVED_PROJECT; reopen --project RECEIVED_PROJECT --out NEW_PROJECT. Node 22+ and Linux flock are required. Existing exact completed targets are verified; changed or incomplete published targets are preserved and refused.');
 process.stdout.write(JSON.stringify(result,null,2)+'\n');
}catch(error){process.stderr.write(error.message+'\n');process.exitCode=1}
