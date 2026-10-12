// MIT. Complete local operator CLI; all business inputs are explicit JSON files.
import {readFile,writeFile,mkdir} from 'node:fs/promises';
import {resolve,join,dirname} from 'node:path';
import {fileURLToPath,pathToFileURL} from 'node:url';
import {spawn} from 'node:child_process';
import {openDataGouvWorkspace,receiveArchive} from './workspace.mjs';
import {startDataGouvWorkspace} from './server.mjs';
import {need} from './capture.mjs';
const here=dirname(fileURLToPath(import.meta.url)),applicationRoot=resolve(here,'../../../..');
export const help='Publisher operations\n\n'+
  'node start-publisher.mjs init --directory ./workspace --title "Publisher operations"\n'+
  'node start-publisher.mjs serve --directory ./workspace --port 8429\n'+
  'node start-publisher.mjs capture --out ./source-capture --dataset DATASET --resource RESOURCE --operation ORIGINAL_OPERATION\n'+
  'node start-publisher.mjs import|plan|review|publish|select|compare|decide --directory ./workspace --input request.json\n'+
  'node start-publisher.mjs extract|recover|inspect --directory ./workspace --publication UUID\n'+
  'node start-publisher.mjs query --directory ./workspace --query "limit=250" [--publication UUID]\n'+
  'node start-publisher.mjs status|history --directory ./workspace\n'+
  'node start-publisher.mjs download --directory ./workspace --kind csv|original|manifest|comparison|config|candidate --id ID --output file\n'+
  'node start-publisher.mjs export --directory ./workspace --output publisher-workspace.datawork\n'+
  'node start-publisher.mjs receive --file publisher-workspace.datawork --directory ./received [--sha256 SHA256]\n'+
  'node start-publisher.mjs portal-prepare|portal-draft|portal-review|portal-publish|portal-reconcile|portal-inspect --directory ./workspace --input request.json\n\n'+
  'Every original mutation request JSON includes requestId (a version-4 UUID), except native extract/recover and provider methods, which retain their own original operation identity. API keys stay in the selected environment variable.\n';
export function argumentsFor(argv){const [command='help',...tail]=argv,out={command};for(let i=0;i<tail.length;i++){need(/^--[a-z0-9-]+$/.test(tail[i]),'Use named command arguments');const key=tail[i].slice(2);need(!Object.hasOwn(out,key),'Repeated command argument');if(key==='create')out[key]=true;else{need(i+1<tail.length&&!tail[i+1].startsWith('--'),'A value is required for '+tail[i]);out[key]=tail[++i];}}return out;}
const input=async file=>{need(typeof file==='string','Choose the original request JSON file');const raw=await readFile(resolve(file));need(raw.length<=1048576,'Request JSON exceeds 1 MiB');return JSON.parse(raw);};
async function saveOutput(file,bytes){const path=resolve(file);await mkdir(dirname(path),{recursive:true,mode:0o700});await writeFile(path,bytes,{flag:'wx',mode:0o600});return path;}
export async function runCommand(argv=process.argv.slice(2)){
  const args=argumentsFor(argv),command=args.command;
  if(['help','--help','-h'].includes(command)){process.stdout.write(help);return null;}
  if(command==='capture'){for(const key of ['out','dataset','resource','operation'])need(typeof args[key]==='string','Source capture requires --'+key);
    const code=await new Promise((done,reject)=>{const child=spawn(process.env.CODEX_PRIMARY_RUNTIME_PYTHON??'python3',[join(here,'capture.py'),'--out',resolve(args.out),'--dataset',args.dataset,'--resource',args.resource,'--operation',args.operation],{stdio:'inherit',shell:false});child.once('error',reject);child.once('exit',done);});need(code===0,'The original capture did not complete');return null;}
  if(command==='receive')return receiveArchive({file:args.file,directory:args.directory,expectedSha256:args.sha256});
  need(typeof args.directory==='string','Choose --directory for the original workspace');
  if(command==='serve'){const service=await startDataGouvWorkspace({directory:resolve(args.directory),create:args.create===true,title:args.title,port:Number(args.port??8429),sourceRoot:args['source-root']?resolve(args['source-root']):applicationRoot,apiBase:args['api-base'],tokenEnv:args['token-env']});
    process.stdout.write(JSON.stringify({state:'SERVING',url:service.url,directory:resolve(args.directory)})+'\n');let closing=false;for(const name of ['SIGINT','SIGTERM'])process.on(name,async()=>{if(closing)return;closing=true;await service.close();process.exit(0);});return null;}
  const workspace=await openDataGouvWorkspace({directory:resolve(args.directory),create:command==='init',title:args.title});
  try{
    if(command==='init'||command==='status')return workspace.status();
    if(command==='history')return workspace.history({offset:Number(args.offset??0),limit:Number(args.limit??100)});
    if(command==='import')return workspace.importCapture(await input(args.input));
    if(command==='plan')return workspace.preparePublication(await input(args.input));
    if(command==='extract')return workspace.extract(args.publication);
    if(command==='retry-extraction'){const body=await input(args.input);return workspace.retryExtraction(body.publicationId,body);}
    if(command==='inspect')return workspace.inspectPublication(args.publication,args.query??'limit=25');
    if(command==='review'){const body=await input(args.input);return workspace.review(body.publicationId,body);}
    if(command==='publish'){const body=await input(args.input);return workspace.publish(body.publicationId,body);}
    if(command==='recover')return workspace.recover(args.publication);
    if(command==='select')return workspace.select(await input(args.input));
    if(command==='compare')return workspace.compare(await input(args.input));
    if(command==='decide')return workspace.decide(await input(args.input));
    if(command==='query')return workspace.query({publicationId:args.publication,query:args.query??'limit=50'});
    if(command==='download'){need(typeof args.output==='string','Choose --output');const result=await workspace.download(args.kind,args.id);const path=await saveOutput(args.output,result.bytes);return {path,bytes:result.bytes.length,contentType:result.contentType};}
    if(command==='export'){need(typeof args.output==='string','Choose --output');const result=await workspace.exportArchive({sourceRoot:args['source-root']?resolve(args['source-root']):applicationRoot});const path=await saveOutput(args.output,result.bytes);return {path,bytes:result.bytes.length,...result.manifest};}
    if(command.startsWith('portal-')){const module=await import('./datagouv-publication.mjs'),publisher=module.createDataGouvPublisher({apiBase:args['api-base'],tokenEnv:args['token-env'],loadOperation:workspace.loadOperation,saveOperation:workspace.saveOperation});
      const method={'portal-prepare':'prepareDraft','portal-draft':'saveDraft','portal-review':'reviewDraft','portal-publish':'publish','portal-reconcile':'reconcile','portal-inspect':'inspect','portal-access':'inspectAccess','portal-locate':'locateDrafts'}[command];need(method,'Choose a supported original portal operation');return publisher[method](await input(args.input));}
    throw new Error('Unknown command. Run node start-publisher.mjs help');
  }finally{await workspace.close();}
}
if(process.argv[1]&&pathToFileURL(resolve(process.argv[1])).href===import.meta.url){try{const result=await runCommand();if(result!==null)process.stdout.write(JSON.stringify(result,null,2)+'\n');}catch(error){process.stderr.write(JSON.stringify({error:error.code??'PUBLISHER_OPERATION',message:error.message})+'\n');process.exitCode=1;}}
