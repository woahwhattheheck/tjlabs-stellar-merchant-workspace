#!/usr/bin/env node
import fs from 'node:fs/promises';
import path from 'node:path';
import {createMakerProductionCore} from './maker-production-core.mjs';
const core=createMakerProductionCore(),args=process.argv.slice(2),command=args.shift();
const options={};while(args.length){const k=args.shift();if(!k.startsWith('--')||!args.length)throw new Error('Expected --option value');if(k in options)throw new Error('Duplicate option '+k);options[k]=args.shift();}
function need(k){if(!options[k])throw new Error('Required '+k);return options[k];}
const decode=b=>new TextDecoder('utf-8',{fatal:true,ignoreBOM:true}).decode(b);
async function json(file){const text=decode(await fs.readFile(file));return JSON.parse(text.charCodeAt(0)===65279?text.slice(1):text);}
let retainedBrowserInput=null;
async function existing(){const original=decode(await fs.readFile(need('--workspace'))),body=JSON.parse(original.charCodeAt(0)===65279?original.slice(1):original);if(body&&body.schema==='tjlabs.maker-production-desk.v1'){if(!body.workspace||typeof body.workspace!=='object'||Array.isArray(body.workspace)||!body.session||typeof body.session!=='object'||Array.isArray(body.session))throw new Error('Invalid complete browser wrapper');const opened=core.reopen(body.workspace);retainedBrowserInput=original;return opened;}return core.reopen(body);}
async function packageOutput(workspace,selection,out){const full=core.reopen(workspace),plan=core.plan(full,selection),dir=path.resolve(out);await fs.mkdir(dir,{recursive:false});
const put=(p,t)=>fs.writeFile(path.join(dir,p),t,{encoding:'utf8',flag:'wx'});
await put('workspace.json',JSON.stringify(full,null,2)+'\n');if(retainedBrowserInput!==null)await put('browser-input-workspace.json',retainedBrowserInput);await put('plan.json',JSON.stringify(plan,null,2)+'\n');await put('report.html',core.report(full,selection));
for(const kind of ['orders','stages','capacity','observations','decisions'])await put(kind+'.csv',core.csv(full,selection,kind));
for(let i=0;i<full.editions.length;i++){const e=full.editions[i],folder='edition-'+String(i+1).padStart(3,'0');await fs.mkdir(path.join(dir,folder));await put(folder+'/metadata.json',JSON.stringify({id:e.id,label:e.label,notes:e.notes,settings:e.settings,sourceHash:e.sourceHash,files:Object.fromEntries(Object.entries(e.sources).map(([k,v])=>[k,{name:v.name,bytes:v.bytes,sha256:v.sha256}]))},null,2));for(const [k,v]of Object.entries(e.sources))await put(folder+'/'+k+'.csv',v.text);}
await put('COMPLETE.json',JSON.stringify({schema:'maker.production-native-package.v1',workspaceId:full.id,workspaceHead:full.head,selection,editionCount:full.editions.length,decisionCount:full.decisions.length,browserInput:retainedBrowserInput===null?null:{path:'browser-input-workspace.json',bytes:Buffer.byteLength(retainedBrowserInput,'utf8'),sha256:core.hash(retainedBrowserInput)}},null,2));
process.stdout.write(JSON.stringify({directory:dir,summary:plan.summary,head:full.head})+'\n');}
async function main(){let w,selection;
if(command==='receive'){const manifestPath=path.resolve(need('--manifest')),m=await json(manifestPath);w=options['--workspace']?await existing():core.create(m.workspace);const sources={};for(const table of Object.keys(core.columns)){if(typeof m.sources?.[table]!=='string')throw new Error('Missing source path '+table);const file=path.resolve(path.dirname(manifestPath),m.sources[table]);sources[table]={name:path.basename(file),text:decode(await fs.readFile(file))};}w=core.addEdition(w,{...m.edition,sources,settings:m.settings});selection={...m.selection,editionId:m.edition.id};}
else if(command==='decide'){w=await existing();const d=await json(need('--decision'));w=core.decide(w,d);selection={editionId:d.editionId,...(d.asOf?{asOf:d.asOf}:{})};}
else if(command==='report'){w=await existing();selection=await json(need('--selection'));}
else throw new Error('Usage: node cli.mjs receive --manifest manifest.json [--workspace prior.json] --out NEW_DIR | decide --workspace prior.json --decision decision.json --out NEW_DIR | report --workspace prior.json --selection selection.json --out NEW_DIR');
await packageOutput(w,selection,need('--out'));}
main().catch(e=>{process.stderr.write(e.message+'\n');process.exitCode=1;});
