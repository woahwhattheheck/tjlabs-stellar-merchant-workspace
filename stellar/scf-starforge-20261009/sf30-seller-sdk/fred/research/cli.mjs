#!/usr/bin/env node
// MIT. Complete research catalogue actions in the original FRED project.
import { readFile, writeFile } from 'node:fs/promises';
import { resolve } from 'node:path';
import { pathToFileURL } from 'node:url';
import { readFredProject, exportFredProject, receiveFredProject } from '../project.mjs';
import { runResearchAction, researchView, researchEntry, researchCsv, researchSourceDownload } from './project.mjs';
import { need, key } from './model.mjs';
const help='research catalog --project DIR [--query TEXT --topic TOPIC --geography REGION --due --offset N]\nresearch entry --project DIR --entry ID\nresearch action --project DIR --request COMPLETE_ACTION.json\nresearch upload --project DIR --request UPLOAD_ACTION.json --file ORIGINAL_FILE\nresearch csv --project DIR --out NEW.csv\nresearch source --project DIR --source ID --out NEW_FILE\nresearch export --project DIR --out COMPLETE_PROJECT.json\nresearch receive --project EMPTY_DIR --file COMPLETE_PROJECT.json\nActions retain original request ID, expectedRevision and source definition. Full project exports include every original source, definition, review and research-product edition.';
export async function main(argv=process.argv.slice(2)){const command=argv.shift(),args={};for(let i=0;i<argv.length;i++){const k=argv[i];need(k.startsWith('--'),'Use named command options.');if(k==='--due'){args.due=true;continue;}need(argv[i+1]!==undefined&&!argv[i+1].startsWith('--'),'Supply the complete option value.');args[k.slice(2)]=argv[++i];}
if(!command||command==='help'||command==='--help'){process.stdout.write(help+'\n');return;}need(args.project,'Select the original economic project.');const directory=resolve(args.project);let result;
if(command==='catalog')result=await researchView(directory,{query:args.query??'',topic:args.topic??'',geography:args.geography??'',due:args.due===true,offset:Number(args.offset??0),limit:Number(args.limit??100)});
else if(command==='entry')result=await researchEntry(directory,key(args.entry));
else if(command==='action'||command==='upload'){need(args.request,'Choose the complete original action JSON.');const request=JSON.parse(await readFile(resolve(args.request),'utf8'));if(command==='upload'){need(args.file&&request.action==='research-source-upload','Choose an original upload action and file.');request.bodyBase64=(await readFile(resolve(args.file))).toString('base64');}result=await runResearchAction({directory,request});}
else if(command==='csv'){need(args.out,'Choose a new CSV path.');const content=await researchCsv(directory);await writeFile(resolve(args.out),content,{flag:'wx',mode:0o600});result={path:resolve(args.out),bytes:Buffer.byteLength(content)};}
else if(command==='source'){need(args.out&&args.source,'Select a retained source and a new output path.');const source=await researchSourceDownload(directory,args.source);await writeFile(resolve(args.out),source.bytes,{flag:'wx',mode:0o600});result={path:resolve(args.out),bytes:source.bytes.length,contentType:source.contentType};}
else if(command==='export'){need(args.out,'Choose a new complete project path.');const bundle=await exportFredProject({directory});await writeFile(resolve(args.out),JSON.stringify(bundle,null,2)+'\n',{flag:'wx',mode:0o600});result={path:resolve(args.out),projectId:bundle.state.id,revision:bundle.state.revision,bundleSha256:bundle.bundleSha256};}
else if(command==='receive'){need(args.file,'Select the complete original project bundle.');result=await receiveFredProject({directory,bundle:JSON.parse(await readFile(resolve(args.file),'utf8'))});}
else throw new Error(help);process.stdout.write(JSON.stringify(result,null,2)+'\n');return result;}
if(process.argv[1]&&import.meta.url===pathToFileURL(resolve(process.argv[1])).href)main().catch(error=>{process.stderr.write(JSON.stringify({code:error.code??'RESEARCH_FAILED',message:error.message})+'\n');process.exitCode=1;});
