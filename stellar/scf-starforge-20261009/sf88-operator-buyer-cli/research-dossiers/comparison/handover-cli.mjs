#!/usr/bin/env node
// MIT. Export a selected original comparison generation as one complete handover.
import {resolve} from 'node:path';
import {openDossierStore} from '../dossier.mjs';
import {need} from '../../node/store.mjs';
import {exportComparisonHandover} from './handover.mjs';
const args=process.argv.slice(2),values={};
try{
 for(let i=0;i<args.length;i+=2){
  need(['--store','--dossier','--revision','--case','--case-version','--operation','--directory','--python'].includes(args[i])&&args[i+1]!==undefined&&!values[args[i]],'COMPARISON_HANDOVER_ARGUMENTS');
  values[args[i]]=args[i+1];
 }
 for(const key of ['--store','--dossier','--revision','--case','--case-version','--operation','--directory'])need(values[key],'COMPARISON_HANDOVER_ARGUMENTS');
 need(/^[1-9][0-9]*$/.test(values['--revision']),'COMPARISON_HANDOVER_REVISION_REQUIRED');
 const store=await openDossierStore(resolve(values['--store']));
 const result=await exportComparisonHandover(store,values['--dossier'],{
  directory:resolve(values['--directory']),operationId:values['--operation'],revision:Number(values['--revision']),
  caseId:values['--case'],caseVersionId:values['--case-version'],...(values['--python']?{python:values['--python']}:{})});
 process.stdout.write(JSON.stringify(result,null,2)+'\n');
}catch(error){process.stderr.write(JSON.stringify({error:{code:error.code??'COMPARISON_HANDOVER_FAILED'}})+'\n');process.exitCode=1;}
