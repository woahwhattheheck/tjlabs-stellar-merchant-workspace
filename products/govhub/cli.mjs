#!/usr/bin/env node
// SPDX-License-Identifier: Apache-2.0
import {spawn} from 'node:child_process';
import {fileURLToPath,pathToFileURL} from 'node:url';
import {resolve} from 'node:path';
import {constants} from 'node:os';

const root=fileURLToPath(new URL('./application/',import.meta.url));
const programs=Object.freeze({
 serve:'workspace/server.py', cli:'workspace/cli.py', build:'workspace/build_application.py',
 cutover:'cutover.py', 'pantheon-receive':'workspace/pantheon_receive.py',
 'skpr-receive':'workspace/skpr_receive.py', 'tugboat-receive':'workspace/tugboat_receive.py',
 'upsun-receive':'workspace/upsun_receive.py', 'castor-receive':'workspace/castor_receive.py', 'static-releases':'workspace/static_release_cli.py',
 'dnn':'workspace/dnn_maintenance/desk.py'
});
export const help=`GovHub site operations

  govhub [--python EXECUTABLE] serve --workspace ABS --source-root ABS [--port 0]
  govhub [--python EXECUTABLE] cli --workspace ABS --source-root ABS --username NAME [--password-env NAME] init|call|export|backup|worker ...
  govhub [--python EXECUTABLE] build lock|build|verify ...
  govhub [--python EXECUTABLE] cutover ...
  govhub [--python EXECUTABLE] pantheon-receive|skpr-receive|tugboat-receive|upsun-receive|castor-receive ...
  govhub [--python EXECUTABLE] static-releases|dnn ...

Arguments after the selected command reach the maintained Python programme unchanged.
Python 3.11+ on a POSIX host is required. Select the actual existing native provider tools
and private account references in the original GovHub profile. No provider is installed
or authenticated by this launcher. GOVHUB_PYTHON selects the default Python executable.
Use COMMAND --help for the complete original programme arguments.
`;
export function command(argv,environment=process.env){
 const args=[...argv];let python=environment.GOVHUB_PYTHON||'python3';
 if(args[0]==='--python'){
  args.shift();python=args.shift();
  if(typeof python!=='string'||!python||python.startsWith('-')||python.includes('\0'))throw new TypeError('Select the original Python executable.');
 }
 const name=args.shift();
 if(!name||name==='--help'||name==='-h')return {help};
 if(!Object.hasOwn(programs,name))throw new TypeError('Unknown GovHub command: '+name);
 return {executable:python,args:['-B',resolve(root,programs[name]),...args],program:name};
}
export async function runGovHub(argv=process.argv.slice(2)){
 const selected=command(argv);
 if(selected.help){process.stdout.write(selected.help);return 0;}
 const child=spawn(selected.executable,selected.args,{stdio:'inherit',shell:false,env:process.env});
 const forward=signal=>()=>{if(child.exitCode===null&&child.signalCode===null)child.kill(signal);};
 const signals=new Map(['SIGINT','SIGTERM','SIGHUP'].map(s=>[s,forward(s)]));
 for(const [s,fn]of signals)process.on(s,fn);
 try{
  return await new Promise((yes,no)=>{
   child.once('error',no);
   child.once('exit',(code,signal)=>yes(code??128+(constants.signals[signal]||1)));
  });
 }finally{for(const [s,fn]of signals)process.off(s,fn);}
}
if(process.argv[1]&&import.meta.url===pathToFileURL(resolve(process.argv[1])).href){
 try{process.exitCode=await runGovHub();}catch(error){console.error(JSON.stringify({error:error.message}));process.exitCode=2;}
}
