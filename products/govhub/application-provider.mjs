// SPDX-License-Identifier: Apache-2.0
import {join,resolve} from 'node:path';
import {APPLICATION_PROVIDER_SCHEMA,applicationPreparation,observeApplicationStartup}
 from '../../stellar/scf-starforge-20261009/distribution/runtime-workspace/application-provider.mjs';
import {need} from '../../stellar/scf-starforge-20261009/distribution/runtime-workspace/storage.mjs';
export default {
 schema:APPLICATION_PROVIDER_SCHEMA,id:'govhub',order:450,
 catalog({common,field}){return [{id:'govhub',command:'govhub',title:'GovHub site operations',terminal:false,
  description:'Open the same private site operations workspace, native source and recovery queue, content and complete receiving history.',
  fields:[field('workspaceDirectory','Existing private GovHub workspace','path',true),
   field('sourceDirectory','Original supplied-input directory','path',true),
   field('pythonExecutable','Installed Python executable or PATH name','text'),...common]}];},
 async prepare(type,settings,context){
  const {args,inputs,createDirectories,path,option}=applicationPreparation(settings,context.inputPath);
  await path('workspaceDirectory','directory',false,true);await path('sourceDirectory','directory',false,true);
  need(resolve(settings.workspaceDirectory)!==resolve(settings.sourceDirectory),'APPLICATION_GOVHUB_INPUT_DIRECTORY',
   'Select the original distinct workspace and supplied-input directories.');
  inputs.push(await context.inputPath(join(settings.workspaceDirectory,'assessment.sqlite3'),'file'));
  if(settings.pythonExecutable)option('--python',settings.pythonExecutable);
  args.push('serve');option('--workspace',settings.workspaceDirectory);option('--source-root',settings.sourceDirectory);
  return {args,inputs,createDirectories};
 },
 resourceKey(type,settings,{hash}){return hash({family:'govhub',directory:settings.workspaceDirectory});},
 matchRequest(request){return !request.pythonCommand&&request.command==='govhub';},
 createObserver(request,directory){return observeApplicationStartup(request,directory,line=>{
  try{const value=JSON.parse(line);return typeof value.url==='string'&&typeof value.workspace==='string'
   ?{url:value.url,workspaceId:value.workspace}:null;}catch{return null;}
 });}
};
