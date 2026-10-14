#!/usr/bin/env node
// MIT. Installed entrypoint delegates all product operations to the unchanged original CLI.
import {resolve} from 'node:path';
import {pathToFileURL} from 'node:url';
import {PRODUCT_SCHEMA,PRODUCT_ROOT,OPERATOR_ROOT,sourceBinding,verifySelection,requireValue} from './binding.mjs';
export async function main(argv=process.argv.slice(2)){
 if(argv[0]==='source'){requireValue(argv.length===1,'CLI_OPTIONS');process.stdout.write(JSON.stringify(await sourceBinding(),null,2)+'\n');return;}
 if(argv[0]!=='launch'){const original=await import('./operator/cli.mjs');return original.main([...argv]);}
 const {selected,source,workspace,token}=await verifySelection(argv);
 requireValue(resolve(selected['source-root'])===resolve(PRODUCT_ROOT),'PRINCIPAL_APPLICATION_SOURCE_ROOT_CHANGED','Start the original selected installed command source.');
 const {startServer}=await import('./operator/server.mjs');
 let server,stopping=false,resolveStop;
 const stopped=new Promise(resolve=>{resolveStop=resolve;});
 const stop=()=>{stopping=true;resolveStop();};
 process.once('SIGINT',stop);process.once('SIGTERM',stop);
 try{
  server=await startServer({directory:workspace.directory,token:token.token,host:'127.0.0.1',port:selected.port,sourceDirectory:OPERATOR_ROOT});
  const actual=server.workspace.read();
  requireValue(actual.workspace.id===workspace.workspaceId&&actual.apiSha256===workspace.apiSha256,'PRINCIPAL_APPLICATION_BINDING_CHANGED');
  if(!stopping)process.stdout.write(JSON.stringify({schema:PRODUCT_SCHEMA+'.startup',state:'LISTENING',url:server.url+'/',sourceRoot:resolve(PRODUCT_ROOT),directory:workspace.directory,workspaceId:workspace.workspaceId,apiSha256:workspace.apiSha256,sourceEdition:source.edition,sourceManifestSha256:source.manifestSha256})+'\n');
  await stopped;
 }finally{
  process.removeListener('SIGINT',stop);process.removeListener('SIGTERM',stop);
  if(server)await server.close();
 }
}
if(process.argv[1]&&import.meta.url===pathToFileURL(resolve(process.argv[1])).href)main().catch(error=>{process.stderr.write(JSON.stringify({error:{code:error.code??'PRINCIPAL_APPLICATION_ERROR',message:error.message}})+'\n');process.exitCode=1;});
