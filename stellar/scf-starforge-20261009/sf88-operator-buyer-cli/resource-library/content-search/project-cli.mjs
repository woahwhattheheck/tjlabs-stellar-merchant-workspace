#!/usr/bin/env node
// MIT — Complete portable research projects; no original source mutation.
import {openLibrary} from '../library.mjs';
import {openContentSearch} from './engine.mjs';
import {saveProject,inspectProject,receiveProject} from './project.mjs';
const help=`Research projects — Node 22.16+ and Python 3.10+
  node content-search/project-cli.mjs export --state /private/library --out ./project.sfrp
  node content-search/project-cli.mjs inspect --archive ./project.sfrp
  node content-search/project-cli.mjs receive --archive ./project.sfrp --out /private/new-project
  node content-search/cli.mjs serve --state /private/new-project
Options: --python /path/to/python3; --maximumBytes N for inspect/receive.
Receive is create-only. Source files, search builds, all saved-query revisions and
resource-review history remain private. Research projects do not execute payments.
`;
const [command,...argv]=process.argv.slice(2),options={};
const controller=new AbortController(),stop=()=>controller.abort(new Error('INTERRUPTED'));
process.once('SIGINT',stop);process.once('SIGTERM',stop);
let library,search;
try{
 if(!command||command==='help'){console.log(help);}
 else{
  for(let i=0;i<argv.length;i+=2){const key=argv[i]?.slice(2);if(!argv[i]?.startsWith('--')||!['state','out','archive','python','maximumBytes'].includes(key)||argv[i+1]===undefined)throw new Error('Invalid named option');options[key]=argv[i+1];}
  if(options.maximumBytes!==undefined){options.maximumBytes=Number(options.maximumBytes);if(!Number.isSafeInteger(options.maximumBytes)||options.maximumBytes<1)throw new Error('Invalid maximumBytes');}
  options.signal=controller.signal;let result;
  if(command==='export'){
   if(!options.state||!options.out)throw new Error('--state and --out are required');
   library=await openLibrary({state:options.state});search=await openContentSearch(library);
   result=await saveProject(search,options.out,options);
  }else if(command==='inspect'||command==='receive'){
   if(!options.archive||(command==='receive'&&!options.out))throw new Error('--archive and a new --out for receive are required');
   result=command==='inspect'?await inspectProject(options.archive,options):await receiveProject(options.archive,options.out,options);
  }else throw new Error('Unknown command; use help');
  console.log(JSON.stringify(result));
 }
}catch(e){console.error(e.message);process.exitCode=1;}
finally{search?.close();await library?.close();process.removeListener('SIGINT',stop);process.removeListener('SIGTERM',stop);}
