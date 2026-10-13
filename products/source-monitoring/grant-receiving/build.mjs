// MIT. Reproduce the complete selected grant edition using the maintained source.
import {readFile,mkdir,writeFile} from 'node:fs/promises';
import {resolve,dirname} from 'node:path';
import {fileURLToPath,pathToFileURL} from 'node:url';
import {createHash} from 'node:crypto';
import {composeSourceMonitoringGrant} from './build-core.mjs';
const here=dirname(fileURLToPath(import.meta.url)),root=resolve(here,'../../..'),options={};
const need=(v,m)=>{if(!v)throw Error(m);},hash=b=>createHash('sha256').update(b).digest('hex');
const args=process.argv.slice(2);
for(let i=0;i<args.length;i+=2){need(['--base-dir','--output-dir','--at'].includes(args[i])&&!Object.hasOwn(options,args[i])&&args[i+1],'Use --base-dir DIR --output-dir DIR --at ORIGINAL_TIME.');options[args[i]]=args[i+1];}
need(options['--base-dir']&&options['--output-dir']&&options['--at'],'Select all three original receiving arguments.');
const selected=JSON.parse(await readFile(resolve(here,'SOURCE_SELECTION.json'),'utf8'));
need(options['--at']===selected.createdAt,'Use this exact selected edition creation time.');
const modulePacketRaw=await readFile(resolve(here,'MODULE_SOURCES.json'));
need(modulePacketRaw.length===selected.modulePacket.bytes&&hash(modulePacketRaw)===selected.modulePacket.sha256,'Select the complete maintained module packet.');
const modulePacket=JSON.parse(modulePacketRaw),moduleRows=new Map(modulePacket.files.map(f=>[f.path,f]));
need(moduleRows.size===selected.sourceModules.length,'Keep one complete original source per selected module.');
const input=resolve(options['--base-dir']),output=resolve(options['--output-dir']);
need(input!==output,'Keep the complete original inputs apart from the new output.');
await mkdir(output,{recursive:false});
const moduleRoot=resolve(output,'selected-source');
await mkdir(moduleRoot);
for(const item of selected.sourceModules){
  need(typeof item.path==='string'&&!item.path.startsWith('/')&&!item.path.split('/').some(x=>!x||x==='.'||x==='..')&&item.path.split(String.fromCharCode(92)).length===1,'Use a selected original relative module path.');
  const original=moduleRows.get(item.path),body=Buffer.from(original?.content??'','utf8');
  need(body.length===item.bytes&&hash(body)===item.sha256,'Select the complete original module: '+item.path);
  const destination=resolve(moduleRoot,item.path);await mkdir(dirname(destination),{recursive:true});await writeFile(destination,body,{flag:'wx'});
}
const H=await import(pathToFileURL(resolve(moduleRoot,'stellar-forge/developer-site/dist/grant-handover-source.mjs')));
const P=await import(pathToFileURL(resolve(moduleRoot,'stellar-forge/developer-site/dist/grant-product-sources-core.mjs')));
const G=await import(pathToFileURL(resolve(moduleRoot,'stellar-forge/developer-site/grant-customers.mjs')));
const S=await import(pathToFileURL(resolve(moduleRoot,'stellar-forge/developer-site/dist/grant-submission-core.mjs')));
const base={};
for(const item of selected.currentReviewerInputs){const body=await readFile(resolve(input,item.name));need(body.length===item.bytes&&hash(body)===item.sha256,'Select the complete original reviewer input: '+item.name);base[item.role]={content:body.toString('utf8'),sourceUrl:item.url};}
const composed={};
for(const item of selected.composedFiles){const body=await readFile(resolve(root,item.path));need(body.length===item.bytes&&hash(body)===item.sha256,'Select the complete original authored source: '+item.path);composed[item.role]=body.toString('utf8');}
const result=await composeSourceMonitoringGrant({base,...composed,at:options['--at'],productCommit:selected.productCommit,sourceModules:selected.sourceModules},
  {H,P,G,S,utf8:s=>Buffer.from(s,'utf8'),sha256:hash});
need(result.report.package.sha256===selected.package.sha256&&result.report.package.bytes===selected.package.bytes&&result.report.package.bundleId===selected.package.bundleId,'The complete rebuilt reviewer package differs from this selected edition.');
for(const [name,body]of Object.entries({'application.md':base.application.content,'source-index.json':result.indexText,'budget.csv':base.budget.content,
  'product-and-finance.md':result.companion,'source-monitoring-reviewer-source.json':result.packageText}))
  await writeFile(resolve(output,name),body,{flag:'wx'});
process.stdout.write(JSON.stringify({package:resolve(output,'source-monitoring-reviewer-source.json'),...result.report.package,
  chapters:result.report.composition.after,sources:result.report.sourcesAfter})+'\n');
