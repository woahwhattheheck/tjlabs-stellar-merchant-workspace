// MIT. Keep the selected original Python environment for the BLS application.
import {spawn} from 'node:child_process';
import {resolve} from 'node:path';
import {fileURLToPath,pathToFileURL} from 'node:url';
export async function main(argv=process.argv.slice(2)){
  let python='python3';const args=[...argv];
  const at=args.indexOf('--python');
  if(at!==-1){if(!args[at+1])throw new Error('--python needs the original executable.');python=args.splice(at,2)[1];}
  const child=spawn(python,[fileURLToPath(new URL('./cli.py',import.meta.url)),...args],
    {shell:false,stdio:'inherit',env:{...process.env,PYTHONDONTWRITEBYTECODE:'1',PYTHONUNBUFFERED:'1'}});
  const forward=signal=>{if(child.exitCode===null)child.kill(signal);};
  const term=()=>forward('SIGTERM'),interrupt=()=>forward('SIGINT');
  process.on('SIGTERM',term);process.on('SIGINT',interrupt);
  try{return await new Promise((resolveExit,reject)=>{child.once('error',reject);child.once('close',(code,signal)=>{process.exitCode=code??1;resolveExit({code,signal});});});}
  finally{process.removeListener('SIGTERM',term);process.removeListener('SIGINT',interrupt);}
}
if(process.argv[1]&&import.meta.url===pathToFileURL(resolve(process.argv[1])).href)
  main().catch(issue=>{process.stderr.write('BLS_WORKSPACE: '+issue.message+'\n');process.exitCode=1;});
