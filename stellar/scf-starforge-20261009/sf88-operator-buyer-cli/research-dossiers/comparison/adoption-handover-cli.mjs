#!/usr/bin/env node
// MIT. Export a fixed native adoption generation and complete original return.
import {resolve} from 'node:path';
import {pathToFileURL} from 'node:url';
import {openDossierStore} from '../dossier.mjs';
import {need} from '../../node/store.mjs';
import {exportAdoptionHandover} from './adoption-handover.mjs';
export async function main(args=process.argv.slice(2)){
 const values={};
 for(let i=0;i<args.length;i+=2){
  need(['--store','--dossier','--revision','--plan','--operation','--directory','--python'].includes(args[i])&&
   args[i+1]!==undefined&&!values[args[i]],'ADOPTION_HANDOVER_ARGUMENTS');values[args[i]]=args[i+1];
 }
 for(const key of ['--store','--dossier','--revision','--plan','--operation','--directory'])need(values[key],'ADOPTION_HANDOVER_ARGUMENTS');
 need(/^[1-9][0-9]*$/.test(values['--revision']),'ADOPTION_HANDOVER_REVISION_REQUIRED');
 const store=await openDossierStore(resolve(values['--store']));
 const result=await exportAdoptionHandover(store,values['--dossier'],{
  directory:resolve(values['--directory']),operationId:values['--operation'],revision:Number(values['--revision']),
  planId:values['--plan'],...(values['--python']?{python:values['--python']}:{})});
 process.stdout.write(JSON.stringify(result,null,2)+'\n');
}
if(process.argv[1]&&pathToFileURL(resolve(process.argv[1])).href===import.meta.url)main().catch(error=>{process.stderr.write(JSON.stringify({error:{code:error.code??'ADOPTION_HANDOVER_FAILED'}})+'\n');process.exitCode=1;});
