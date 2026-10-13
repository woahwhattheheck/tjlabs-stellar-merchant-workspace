#!/usr/bin/env node
// SPDX-License-Identifier: MIT
import { readFile, mkdir } from 'node:fs/promises';
import { resolve, dirname } from 'node:path';
import { pathToFileURL, fileURLToPath } from 'node:url';
import { openWorkspace } from './workspace.mjs';
import { serve } from './server.mjs';
import { dispatch, ACTIONS } from './dispatch.mjs';
import { writeAtomic, writeJson, sha } from './io.mjs';

export const HELP='Economic client briefing workspace\n\n'+
'node cli.mjs create --project DIR [--label TITLE] [--config FILE]\n'+
'node cli.mjs serve --project DIR [--create true] [--config FILE] [--port 0] [--connection-file FILE]\n'+
'node cli.mjs ACTION --project DIR [--operation ORIGINAL_ID] [--input FILE] [--output FILE]\n'+
'node cli.mjs download --project DIR --id BRIEFING_ID --name briefing.html --output FILE\n'+
'node cli.mjs companion-download --project DIR --id COMPANION_ID --name oecd-project.zip --output FILE\n'+
'node cli.mjs review-download --project DIR --id PACKAGE_ID --name review.html --output FILE\n'+
'node cli.mjs review-receive --project DIR --operation ORIGINAL_ID --input RETURN.json [--output RECEIPT.json]\n'+
'node cli.mjs review-return-download --project DIR --id RETURN_ID --output FILE\n'+
'node cli.mjs export --project DIR --output COMPLETE.json.gz\n'+
'node cli.mjs import --project FRESH_DIR --input COMPLETE.json.gz [--config RECEIVER.json]\n\n'+
'Actions: '+ACTIONS.join(' ')+'\n'+
'An active browser owns its project; use that private connection for concurrent operator work.\n'+
'After an interruption repeat the exact original action/input/operation. Change the operation ID only for new work.\n';
function options(args){
  const out={};for(let i=0;i<args.length;i+=2){
    if(!/^--[a-z-]+$/.test(args[i])||args[i+1]===undefined||Object.hasOwn(out,args[i]))
      throw new Error('Use complete, unrepeated --option value pairs');
    out[args[i]]=args[i+1];
  }return out;
}
export async function main(args=process.argv.slice(2)){
  const command=args.shift();
  if(!command||['help','--help'].includes(command)){process.stdout.write(HELP);return 0;}
  const opt=options(args),allowed=new Set(['--project','--label','--config','--port','--connection-file','--operation','--input','--output','--id','--name','--create','--oecd-project','--python']);
  for(const name of Object.keys(opt))if(!allowed.has(name))throw new Error('Unknown option '+name);
  if(!opt['--project'])throw new Error('Select the original project directory');
  let config=opt['--config']?JSON.parse(await readFile(opt['--config'],'utf8')):undefined;
  if(opt['--oecd-project'])config={...config,oecd:{client_module:fileURLToPath(new URL('../../../stellar/scf-starforge-20261009/sf30-seller-sdk/sdmx/oecd/client.mjs',import.meta.url)),project_directory:resolve(opt['--oecd-project']),python:opt['--python']||'python3',create:true}};
  if(opt['--create']!==undefined&&!['true','false'].includes(opt['--create']))throw new Error('Use --create true or false');
  if(command==='serve'){
    const port=Number(opt['--port']||0);if(!Number.isInteger(port)||port<0||port>65535)throw new Error('Use a valid native port');
    const running=await serve({directory:opt['--project'],port,connectionFile:opt['--connection-file'],create:opt['--create']==='true',config,label:opt['--label']});
    process.stdout.write(JSON.stringify({event:'economic-client-ready',...running.connection,url:running.url,connection_file:running.connectionFile})+'\n');
    let ending=false;
    const close=async()=>{if(ending)return;ending=true;await running.close();};
    process.once('SIGINT',()=>close().catch(e=>{process.stderr.write(e.message+'\n');process.exitCode=1;}));
    process.once('SIGTERM',()=>close().catch(e=>{process.stderr.write(e.message+'\n');process.exitCode=1;}));
    return null;
  }
  const workspace=await openWorkspace(opt['--project'],{create:['create','import'].includes(command),label:opt['--label'],config});
  try{
    let result;
    if(command==='create')result=workspace.state();
    else if(command==='export'){
      if(!opt['--output'])throw new Error('Choose the complete project output');
      const body=await workspace.exportProject();await writeAtomic(resolve(opt['--output']),body);
      result={state:'COMPLETE',path:resolve(opt['--output']),bytes:body.length,sha256:sha(body)};
    }else if(command==='import'){
      if(!opt['--input'])throw new Error('Select the complete original project archive');
      result=await workspace.importProject(await readFile(opt['--input']),{config});
    }else if(command==='review-receive'){
      if(!opt['--input']||!opt['--operation'])throw new Error('Select the full original return and its receiving operation');
      result=await workspace.reviewReceive(opt['--operation'],await readFile(opt['--input']));
    }else if(['download','companion-download','review-download','review-return-download'].includes(command)){
      if(!opt['--output'])throw new Error('Choose the complete download output');
      const value=command==='review-download'?await workspace.reviewFile(opt['--id'],opt['--name']):command==='review-return-download'?await workspace.reviewReturnFile(opt['--id']):command==='download'?await workspace.file(opt['--id'],opt['--name']):await workspace.companionFile(opt['--id'],opt['--name']);
      await writeAtomic(resolve(opt['--output']),value.body);
      result={state:'COMPLETE',path:resolve(opt['--output']),...value.identity};
    }else{
      const input=opt['--input']?JSON.parse(await readFile(opt['--input'],'utf8')):{};
      result=await dispatch(workspace,command,input,opt['--operation']);
    }
    if(opt['--output']&&!['export','download','companion-download','review-download','review-return-download'].includes(command))await writeJson(resolve(opt['--output']),result);
    process.stdout.write(JSON.stringify(result)+'\n');return 0;
  }finally{await workspace.close();}
}
if(process.argv[1]&&import.meta.url===pathToFileURL(resolve(process.argv[1])).href)
  main().then(code=>{if(code!==null)process.exitCode=code;}).catch(error=>{process.stderr.write(error.stack+'\n');process.exitCode=1;});
