// MIT. Select an existing Python interpreter; the receiver uses only its standard library.
import {spawn} from 'node:child_process';
import {fileURLToPath,pathToFileURL} from 'node:url';
import {resolve} from 'node:path';
const script=fileURLToPath(new URL('./coops_model.py',import.meta.url));
export async function runCoastalPython(args=process.argv.slice(2)){
 const index=args.indexOf('--python');
 if(index<0||!args[index+1]||args[index+1].startsWith('--')){
  if(args.includes('--help')||args.includes('-h')){
   process.stdout.write('Coastal model receiving\n\nstarforge coops-model --python /selected/python3 --directory /private/receiver --startup /private/coops-session.json receive-study --release RELEASE_ID\n\nPass --python plus --help to read the complete original Python CLI.\n');
   return 0;
  }
  throw new Error('Select the existing Python 3.10+ interpreter with --python PATH.');
 }
 const selected=args[index+1],forward=[...args.slice(0,index),...args.slice(index+2)];
 return new Promise((done,reject)=>{
  const child=spawn(selected,['-B',script,...forward],{stdio:'inherit',env:{...process.env,PYTHONDONTWRITEBYTECODE:'1'}});
  const interrupt=signal=>{if(child.exitCode===null&&!child.killed)child.kill(signal);};
  const onInt=()=>interrupt('SIGINT'),onTerm=()=>interrupt('SIGTERM');
  process.once('SIGINT',onInt);process.once('SIGTERM',onTerm);
  const cleanup=()=>{process.removeListener('SIGINT',onInt);process.removeListener('SIGTERM',onTerm);};
  child.once('error',error=>{cleanup();reject(error);});
  child.once('exit',(code,signal)=>{cleanup();if(signal)reject(new Error('The selected Python receiving process ended by '+signal+'. Its original journal remains retained.'));else done(code??1);});
 });
}
if(process.argv[1]&&pathToFileURL(resolve(process.argv[1])).href===import.meta.url){
 runCoastalPython().then(code=>{process.exitCode=code;}).catch(error=>{process.stderr.write(JSON.stringify({error:'COOPS_PYTHON_LAUNCH',message:error.message})+'\n');process.exitCode=1;});
}
