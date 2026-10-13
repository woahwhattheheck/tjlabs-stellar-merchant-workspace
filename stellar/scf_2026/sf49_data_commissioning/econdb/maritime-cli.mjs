#!/usr/bin/env node
import {readFile} from 'node:fs/promises';
import {resolve} from 'node:path';
import {receiveEdition,captureEdition,captureCatalogue,analyzeEdition,listEditions} from './maritime-native.mjs';
const args=process.argv.slice(2),command=args.shift(),options={};
for(let i=0;i<args.length;i+=2){if(!args[i]?.startsWith('--')||args[i+1]===undefined||args[i+1].startsWith('--'))throw new Error('Use --name value pairs');const key=args[i].slice(2);if(Object.hasOwn(options,key))throw new Error('Repeated option '+key);options[key]=args[i+1]}
const need=name=>{if(!options[name])throw new Error('Missing --'+name);return options[name]};
const allow=names=>{for(const key of Object.keys(options))if(!names.includes(key))throw new Error('Unknown option --'+key)};
try{
 let result;
 if(command==='capture'){
  allow(['requests','out']);const jobs=JSON.parse(await readFile(need('requests'),'utf8'));if(!Array.isArray(jobs)||!jobs.length)throw new Error('Requests file must be a nonempty array of {id,request}');
  if(new Set(jobs.map(x=>x.id)).size!==jobs.length)throw new Error('Duplicate capture edition ID');
  result=[];
  for(const job of jobs){const next=job.request.kind==='ports'?await captureCatalogue({directory:need('out'),id:job.id}):await captureEdition({directory:need('out'),id:job.id,request:job.request});result.push({id:job.id,directory:next.directory,resumed:next.resumed||false,status:next.status||'retained',validation_error:next.validation_error||null});process.stderr.write('Retained '+job.id+'\n')}
 }else if(command==='receive'){
  allow(['source','descriptor','out']);const r=await receiveEdition({sourcePath:need('source'),descriptorPath:need('descriptor'),directory:need('out')});result={id:r.id,directory:r.directory,resumed:r.resumed,status:r.status,validation_error:r.validation_error};
 }else if(command==='analyze'){
  allow(['edition','from','until','out','before-from','before-until','after-from','after-until','previous']);
  const wantsComparison=['before-from','before-until','after-from','after-until'].some(k=>options[k]);
  result=await analyzeEdition({editionDirectory:need('edition'),selection:{from:need('from'),until:need('until')},directory:need('out'),before:wantsComparison?{from:need('before-from'),until:need('before-until')}:null,after:wantsComparison?{from:need('after-from'),until:need('after-until')}:null,previousDirectory:options.previous||null});
 }else if(command==='list'){
  allow(['root']);result=await listEditions(need('root'));
 }else throw new Error('Commands: capture --requests file --out root; receive --source raw.json --descriptor descriptor.json --out root; analyze --edition directory --from YYYY-MM-DD --until YYYY-MM-DD --out directory [--before-from date --before-until date --after-from date --after-until date] [--previous directory]; list --root directory');
 process.stdout.write(JSON.stringify(result,null,2)+'\n');
}catch(error){process.stderr.write(error.message+'\n');process.exitCode=1}
