// SPDX-License-Identifier: MIT
import {realpath} from 'node:fs/promises';
import {join} from 'node:path';
import {pathToFileURL} from 'node:url';
import {inspectMerchantRuntime} from '../../stellar/scf-starforge-20261009/sf46-release/runtime-package.mjs';
import {APPLICATION_PROVIDER_SCHEMA,observeApplicationStartup} from '../../stellar/scf-starforge-20261009/distribution/runtime-workspace/application-provider.mjs';
import {need,fullPath,portNumber,READY_SCHEMA} from './workspace.mjs';
const SOURCE='products/project-portfolio';
function flags(request){
 need(!request.pythonCommand&&request.command==='project-portfolio'&&Array.isArray(request.args)&&request.args[0]==='serve',
  'PROJECT_PORTFOLIO_APPLICATION_REQUEST');
 const allowed=['--workspace','--control','--python','--profiles','--expected-selection-sha256','--port','--source-directory'],values={};
 for(let i=1;i<request.args.length;i+=2){
  const key=request.args[i],value=request.args[i+1];
  need(allowed.includes(key)&&!Object.hasOwn(values,key)&&typeof value==='string'&&value.length>0,
   'PROJECT_PORTFOLIO_APPLICATION_ARGUMENTS');values[key]=value;
 }
 for(const key of ['--workspace','--control','--python','--expected-selection-sha256','--source-directory'])
  need(values[key],'PROJECT_PORTFOLIO_APPLICATION_ARGUMENTS');
 portNumber(values['--port']??0);return values;
}
async function selectedModule(request){
 const source=await realpath(join(fullPath(request.releaseDirectory),'source',SOURCE));
 const original=await import(pathToFileURL(join(source,'workspace.mjs')).href);
 return {source,original};
}
async function inspectRequest(request){
 const values=flags(request),{source,original}=await selectedModule(request);
 const options={workspaceDirectory:fullPath(values['--workspace']),controlDirectory:fullPath(values['--control']),
  pythonExecutable:fullPath(values['--python']),profilesFile:values['--profiles']?fullPath(values['--profiles']):null,
  expectedSelectionSha256:values['--expected-selection-sha256'],port:portNumber(values['--port']??0),
  sourceDirectory:fullPath(values['--source-directory'])};
 const selected=await original.inspectProjectPortfolioSelection(options);
 need(selected.selection.sourceDirectory===options.sourceDirectory&&selected.executionSourceDirectory===source&&
  selected.selectionSha256===options.expectedSelectionSha256,
  'PROJECT_PORTFOLIO_APPLICATION_SELECTION_CHANGED');
 return {original,options,selected};
}
export default {
 schema:APPLICATION_PROVIDER_SCHEMA,id:'project-portfolio',order:470,
 catalog({common,field}){
  return [{id:'project-portfolio',command:'project-portfolio',title:'Project Portfolio',terminal:false,
   requiredSource:SOURCE+'/launch.py',
   description:'Open original project editions, review and deliver native migrations, publish reporting portfolios and receive complete saved workspaces.',
   fields:[
    field('workspaceDirectory','Project workspace','path',true,'Open the original project workspace or select a new private folder in an existing parent.'),
    field('profilesFile','Target profiles','path',false,'Private original Project Operations or MSPDI target configuration outside the portable workspace.'),
    field('pythonExecutable','Python environment','path',false,'Python 3.12 or later with the original pinned MPXJ and JPype packages.'),
    ...common
   ]}];
 },
 async prepare(type,settings,{inputPath,selectedExecutable,runtimeDirectory}){
  need(type.id==='project-portfolio','PROJECT_PORTFOLIO_APPLICATION_KIND');
  const runtime=await inspectMerchantRuntime(fullPath(runtimeDirectory),{load:false,source:false});
  const source=await realpath(join(runtime.sourceRoot,SOURCE));
  const original=await import(pathToFileURL(join(source,'workspace.mjs')).href);
  const workspace=await inputPath(settings.workspaceDirectory,'directory',true,true);
  const python=await selectedExecutable(settings.pythonExecutable??'/usr/bin/python3');
  const selected=await original.inspectProjectPortfolioSelection({
   workspaceDirectory:workspace.path,profilesFile:settings.profilesFile,pythonExecutable:python.executable
  });
  need(selected.selection.sourceDirectory===source,'PROJECT_PORTFOLIO_APPLICATION_SOURCE');
  const inputs=[workspace,...python.inputs];
  if(selected.selection.python.configuration)inputs.push(await inputPath(selected.selection.python.configuration.path,'file'));
  for(const file of selected.sourceFiles)inputs.push(await inputPath(file,'file'));
  if(selected.selection.profiles)inputs.push(await inputPath(selected.selection.profiles.path,'file',false,true));
  const control=await inputPath(selected.selection.controlDirectory,'directory',true,true);inputs.push(control);
  const args=['serve','--workspace',workspace.path,'--control',control.path,'--python',selected.selection.python.path,
   '--expected-selection-sha256',selected.selectionSha256,'--source-directory',selected.selection.sourceDirectory];
  if(selected.selection.profiles)args.push('--profiles',selected.selection.profiles.path);
  return {args,inputs,createDirectories:[...(!workspace.exists?[workspace.path]:[]),...(!control.exists?[control.path]:[])]};
 },
 matchRequest(request){
  return !request.pythonCommand&&request.command==='project-portfolio'&&Array.isArray(request.args)&&request.args[0]==='serve';
 },
 async verifyLaunch(request){await inspectRequest(request);},
 createObserver(request,directory){
  return observeApplicationStartup(request,directory,line=>{
   if(!line.startsWith('{"schema":"'+READY_SCHEMA+'",'))return null;
   return async()=>{
    const announcement=JSON.parse(line);
    if(announcement.state!=='LISTENING')return null;
    const {original,options}=await inspectRequest(request);
    if(options.port)need(new URL(announcement.url).port===String(options.port),'PROJECT_PORTFOLIO_APPLICATION_PORT');
    const result=await original.readProjectPortfolioLaunch(options,announcement);
    return {...result,workspaceId:announcement.workspaceId,
     connectionFile:join(options.controlDirectory,'connection.json')};
   };
  },{lineLimit:65536});
 }
};
