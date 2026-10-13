import {readFile,writeFile} from 'node:fs/promises';
import {pathToFileURL} from 'node:url';
const cfg=JSON.parse(await readFile(process.argv[2],'utf8'));
const {createReceivablesServer}=await import(pathToFileURL(cfg.module).href);
const state=JSON.parse(await readFile(cfg.directory+'/workspace.json','utf8'));
const service=await createReceivablesServer({directory:cfg.directory,...state.sources,expectedWorkspaceId:cfg.workspaceId,expectedSourcesSha256:cfg.sourcesSha256,host:'127.0.0.1',port:0});
await writeFile(cfg.before,JSON.stringify(service.workspace.state,null,2)+'\n',{mode:0o600});
await writeFile(cfg.ready,JSON.stringify({baseUrl:new URL('/api/receivables',service.url).href,directory:service.workspace.directory})+'\n',{mode:0o600});
console.log(JSON.stringify({phase:'NATIVE_ACCOUNT_READY',directory:service.workspace.directory}));
let stopping=false;
async function stop(){if(stopping)return;stopping=true;try{await writeFile(cfg.after,JSON.stringify(service.workspace.state,null,2)+'\n',{mode:0o600});await service.close();console.log(JSON.stringify({phase:'NATIVE_ACCOUNT_CLOSED'}));}catch(error){console.error(error.stack);process.exitCode=1;}}
process.on('SIGTERM',stop);process.on('SIGINT',stop);
