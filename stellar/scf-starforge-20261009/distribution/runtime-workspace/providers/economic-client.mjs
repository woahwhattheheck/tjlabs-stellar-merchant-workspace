// SPDX-License-Identifier: MIT
import {join,resolve} from 'node:path';
import {APPLICATION_PROVIDER_SCHEMA,applicationPreparation,observeApplicationStartup} from '../application-provider.mjs';
import {readJSON,need} from '../storage.mjs';
export default {
 schema:APPLICATION_PROVIDER_SCHEMA,id:'economic-client',order:437,
 catalog({common,field}){
  return [{id:'economic-client',command:'economic-client',title:'Economic client briefing and customer review',terminal:false,
   description:'Retain exact economic sources, save client editions, edit complete offline customer reviews and reconcile returns in the original project.',
   fields:[field('workspaceDirectory','Economic client project','path',true),field('create','Initialize a new project','boolean'),
    field('configurationFile','Optional source configuration JSON','path'),field('oecdProjectDirectory','Original OECD project','path'),
    field('pythonExecutable','Original Python executable','text'),...common]}];
 },
 async prepare(type,settings,context){
  const {args,inputs,createDirectories,path,option}=applicationPreparation(settings,context.inputPath);
  const workspace=await path('workspaceDirectory','directory',Boolean(settings.create),true);
  args.push('serve');option('--project',settings.workspaceDirectory);
  let retained=null;
  if(workspace.exists){
   try{retained=await readJSON(join(settings.workspaceDirectory,'project.json'));}
   catch(error){if(error.code!=='ENOENT'||!settings.create)throw error;}
  }
  if(retained){
   need(retained.schema==='tjl.economic-client-workspace.v1'&&typeof retained.project_id==='string','APPLICATION_ECONOMIC_CLIENT_IDENTITY');
   inputs.push(await context.inputPath(join(settings.workspaceDirectory,'project.json'),'file'));
   if(settings.oecdProjectDirectory)need(resolve(retained.config?.oecd?.project_directory||'')===resolve(settings.oecdProjectDirectory),'APPLICATION_ECONOMIC_CLIENT_ORIGINAL_OECD');
   if(settings.configurationFile){
    const config=await readJSON(settings.configurationFile);
    need(Object.entries(config).every(([key,value])=>JSON.stringify(retained.config[key])===JSON.stringify(value)),'APPLICATION_ECONOMIC_CLIENT_ORIGINAL_CONFIG');
   }
  }else{
   need(settings.create,'APPLICATION_ECONOMIC_CLIENT_CREATE');
   option('--create','true');option('--config',settings.configurationFile);
   option('--oecd-project',settings.oecdProjectDirectory);option('--python',settings.pythonExecutable);
  }
  if(settings.configurationFile)await path('configurationFile','file');
  if(settings.oecdProjectDirectory)await path('oecdProjectDirectory','directory',Boolean(settings.create),true);
  return {args,inputs,createDirectories};
 },
 resourceKey(type,settings,{hash}){return hash({family:'economic-client',directory:settings.workspaceDirectory});},
 matchRequest(request){return !request.pythonCommand&&request.command==='economic-client';},
 createObserver(request,directory){
  return observeApplicationStartup(request,directory,line=>{
   try{const value=JSON.parse(line);return value.event==='economic-client-ready'?{url:value.url,workspaceId:value.project_directory,connectionFile:value.connection_file}:null;}
   catch{return null;}
  });
 }
};
