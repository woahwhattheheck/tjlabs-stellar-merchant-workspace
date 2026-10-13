// MIT. Original Econdb installed workspace under managed Applications.
import {join} from 'node:path';
import {APPLICATION_PROVIDER_SCHEMA,applicationPreparation,observeApplicationStartup} from '../application-provider.mjs';
import {readJSON,need} from '../storage.mjs';
export default{
 schema:APPLICATION_PROVIDER_SCHEMA,id:'econdb',order:490,
 catalog({common,field}){return[{id:'econdb',command:'econdb',title:'Econdb maritime workspace',terminal:false,description:'Retain original maritime sources, analyze explicit periods and projects, publish typed datasets and receive original buyer returns.',fields:[field('workspaceDirectory','Original Econdb workspace','path',true),field('create','Initialize a new workspace','boolean'),...common]}]},
 validateSettings(type,settings){need(typeof settings.workspaceDirectory==='string'&&settings.workspaceDirectory.length>0,'APPLICATION_ECONDB_DIRECTORY_REQUIRED')},
 async prepare(type,settings,context){
  const {args,inputs,createDirectories,path,option}=applicationPreparation(settings,context.inputPath);
  const selected=await path('workspaceDirectory','directory',Boolean(settings.create),true);args.push('serve');option('--directory',settings.workspaceDirectory);
  let original=null;if(selected.exists)try{original=await readJSON(join(settings.workspaceDirectory,'workspace.json'))}catch(e){if(e.code!=='ENOENT'||!settings.create)throw e}
  if(!original){need(settings.create===true,'APPLICATION_ECONDB_ORIGINAL_REQUIRED');args.push('--create')}
  else{need(original.schema==='econdb.operator-workspace.v1'&&typeof original.id==='string','APPLICATION_ECONDB_IDENTITY_CHANGED');inputs.push(await context.inputPath(join(settings.workspaceDirectory,'workspace.json'),'file'));inputs.push(await context.inputPath(join(settings.workspaceDirectory,'state.json'),'file'))}
  return{args,inputs,createDirectories};
 },
 resourceKey(type,settings,{hash}){return hash({family:'econdb',directory:settings.workspaceDirectory})},
 matchRequest(request){return !request.pythonCommand&&request.command==='econdb'},
 createObserver(request,directory){return observeApplicationStartup(request,directory,text=>{const match=text.match(/"url"\s*:\s*"([^"]+)"/);return match?match[1]:null})}
};
