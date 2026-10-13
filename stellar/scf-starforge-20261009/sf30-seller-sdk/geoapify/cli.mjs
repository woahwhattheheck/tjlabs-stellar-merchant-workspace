// MIT. Address intake, original provider review, and native dataset delivery.
import {readFile} from 'node:fs/promises';
import {resolve} from 'node:path';
import {fileURLToPath} from 'node:url';
import {openGeoapifyOperator,startGeoapifyWorkspace,GEOAPIFY_ACTIONS} from './server.mjs';
const usage='Address quality workspace\n\n'+
 'node cli.mjs serve --dir /private/address-workspace [--port 0] [--key-env GEOAPIFY_API_KEY]\n'+
 'node cli.mjs status --dir /private/address-workspace\n'+
 'node cli.mjs act ACTION --dir /private/address-workspace --payload /private/action.json\n\n'+
 'Actions: '+[...GEOAPIFY_ACTIONS].join(', ')+'\n\n'+
 'intake.preview inspects actual original bytes and explicit mapping without provider calls or source adoption. Use its source.sha256 and mapped.mappingSha256 as expectedSourceSha256/expectedMappingSha256 on import or stage. inspectionId is an in-process paging handle; a separate CLI invocation must provide the original path/text/base64 again. '+
 'Keep the first original source in intake.import; source.stage/history/compare/activate retain following editions and explicit decision reuse. Source selection is independent from the selected frozen customer edition. Provider responses retain original generic-batch input IDs and full candidates. '+
 'provider.prepare records the explicit job options and input limit; provider.run uses its original ID and SHA-256 once. provider.poll continues the returned job after its saved poll time; provider.import joins an actual original acknowledgment or result. '+
 'customer.issue freezes original source groups for an offline reviewer; customer.export retains complete HTML/JSON; customer.receive retains the original returned draft; customer.preview shows baseline/current/customer differences; customer.adopt requires an explicit current preview and resolutions or readyAll. issue/adopt retain requestId for exact uncertain-result recovery. '+
 'Mutations require expectedRevision from status. The optional API key is read from the selected environment variable and stays outside saved state.\n';
function parse(args){
 const [command,...rest]=args;if(!['serve','status','act'].includes(command))throw new TypeError(usage);
 const action=command==='act'?rest.shift():null,options={};
 if(rest.length%2)throw new TypeError(usage);
 for(let i=0;i<rest.length;i+=2){
  if(!['--dir','--port','--key-env','--payload'].includes(rest[i])||Object.hasOwn(options,rest[i])||rest[i+1]===undefined)
    throw new TypeError(usage);options[rest[i]]=rest[i+1];
 }
 if(!options['--dir'])throw new TypeError(usage);
 if(options['--key-env']&&!/^[A-Za-z_][A-Za-z0-9_]{0,127}$/.test(options['--key-env']))throw new TypeError('Choose an environment variable name.');
 if(command==='act'&&(!GEOAPIFY_ACTIONS.has(action)||!options['--payload']))throw new TypeError(usage);
 return {command,action,options};
}
export async function main(args=process.argv.slice(2)){
 if(args.includes('--help')||!args.length){process.stdout.write(usage);return;}
 const {command,action,options}=parse(args),directory=resolve(options['--dir']);
 const apiKey=process.env[options['--key-env']??'GEOAPIFY_API_KEY'];
 if(command==='serve'){
  const server=await startGeoapifyWorkspace({directory,port:Number(options['--port']??0),apiKey});
  process.stdout.write(JSON.stringify({directory,url:server.url})+'\n');
  const done=async()=>{try{await server.close();}catch(error){process.stderr.write(error.message+'\n');process.exitCode=1;}};
  process.once('SIGINT',done);process.once('SIGTERM',done);return server;
 }
 const workspace=await openGeoapifyOperator({directory,apiKey});let retained=false;
 try{
  const value=command==='status'?await workspace.state():
    await workspace.act(action,JSON.parse(await readFile(resolve(options['--payload']),'utf8')));
  process.stdout.write(JSON.stringify(value,null,2)+'\n');
  if(action==='publisher.release.start'){
   retained=true;const done=async()=>{try{await workspace.close();}catch(error){process.stderr.write(error.message+'\n');process.exitCode=1;}};
   process.once('SIGINT',done);process.once('SIGTERM',done);
  }
  return value;
 }finally{if(!retained)await workspace.close();}
}
if(process.argv[1]&&resolve(process.argv[1])===fileURLToPath(import.meta.url))
 main().catch(error=>{process.stderr.write((error.code?error.code+': ':'')+error.message+'\n');process.exitCode=1;});
