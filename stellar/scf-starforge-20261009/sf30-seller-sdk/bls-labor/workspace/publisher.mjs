// MIT. The original BLS dataset publisher within the complete labor workspace.
import {access} from 'node:fs/promises';
import {resolve} from 'node:path';
import {pathToFileURL} from 'node:url';
import {openBlsPublisher} from '../publisher/model.mjs';
import {blsPlanTemplate} from '../publisher/plan.mjs';
import {startPostgresPublisherServer} from '../../postgres/publisher/server.mjs';

export async function main(argv=process.argv.slice(2)) {
  const options={};
  for(let index=0;index<argv.length;index+=2){
    const key=argv[index], value=argv[index+1];
    if(!['--workspace','--source','--target','--projection','--port'].includes(key)||Object.hasOwn(options,key)||!value)
      throw new Error('Choose the original BLS publisher workspace, source, target, projection and port.');
    options[key]=value;
  }
  if(Object.keys(options).length!==5||!['laus','qcew','source_files'].includes(options['--projection']))
    throw new Error('Complete native publisher selection is required.');
  const directory=resolve(options['--workspace']), sourceFile=resolve(options['--source']),
    targetDirectory=resolve(options['--target']), port=Number(options['--port']);
  if(!Number.isSafeInteger(port)||port<0||port>65535)throw new Error('Choose a valid local port.');
  let create=false;
  try{await access(directory);}catch(issue){if(issue.code!=='ENOENT')throw issue;create=true;}
  const publisher=await openBlsPublisher({directory,create,sourceFile,targetDirectory,relativePaths:true});
  let service;
  try{
    if(create||(await publisher.status({limit:1})).plans.length===0){
      const plan=await blsPlanTemplate(sourceFile,options['--projection'],
        options['--projection']==='source_files'?'Complete original BLS sources':
          options['--projection']==='laus'?'Resident labor statistics':'Workplace employment and wages');
      await publisher.savePlan(plan);
    }
    service=await startPostgresPublisherServer({publisher,port});
    const result={schema:'stellar-forge.bls-native-publisher-launch.v1',workspace:directory,
      projection:options['--projection'],source:sourceFile,target:targetDirectory,url:service.url};
    process.stdout.write(JSON.stringify(result)+'\n');
    let closing;
    const close=()=>closing??=(async()=>{await service.close();})();
    for(const signal of ['SIGINT','SIGTERM'])process.once(signal,()=>close().catch(issue=>{
      process.stderr.write(String(issue.message)+'\n');process.exitCode=1;
    }));
    return {result,close};
  }catch(issue){await publisher.close();throw issue;}
}
if(process.argv[1]&&import.meta.url===pathToFileURL(resolve(process.argv[1])).href)
  main().catch(issue=>{process.stderr.write((issue.code??'BLS_PUBLISHER')+': '+issue.message+'\n');process.exitCode=1;});
