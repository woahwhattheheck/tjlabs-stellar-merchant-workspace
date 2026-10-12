// MIT. Inspect the original quotation configuration and sources before managed launch.
import {lstat,realpath} from 'node:fs/promises';
import {dirname,basename,join} from 'node:path';
import {readResearchQuoteConfiguration,selectQuotePricing,assertQuoteDirectory,quotePath} from './configuration.mjs';
import {need,copy,same,fingerprint,hash} from './contracts.mjs';

export const RESEARCH_QUOTE_LAUNCH_SCHEMA='sf88-research-customer-quote-launch/v1';

/** Inspect a directory selection without creating any part of its native state. */
async function location(role,value,{privateTarget=false}={}){
 const path=quotePath(value),missing=[];let selected=path;
 for(;;){
  let stat;
  try{stat=await lstat(selected);}catch(error){
   if(error.code!=='ENOENT')throw error;
   need(selected!==dirname(selected),'RESEARCH_QUOTE_LOCATION_PARENT_REQUIRED');
   missing.unshift(basename(selected));selected=dirname(selected);continue;
  }
  need(stat.isDirectory()&&!stat.isSymbolicLink()&&await realpath(selected)===selected,
   'RESEARCH_QUOTE_LOCATION_CHANGED');
  if(!missing.length&&privateTarget)
   need(process.platform==='win32'||(stat.mode&0o077)===0,'RESEARCH_QUOTE_PRIVATE_CASE_DIRECTORY_REQUIRED');
  return {role,path,exists:missing.length===0,missing,
   anchor:{path:selected,device:String(stat.dev),inode:String(stat.ino)}};
 }
}
function reviewContent(binding,locations){
 const rows=[
  {label:'Research quotation directory',value:binding.directory},
  {label:'Original case store',value:binding.casesDirectory},
  {label:'Case store on this host',value:locations.find(row=>row.role==='case-store').exists?'Existing original store':'Created by the original case writer at launch'},
  {label:'Quotation configuration',value:binding.configurationFile??'Original empty-profile defaults'},
  {label:'Pricing profiles',value:binding.pricing.length},
 ];
 const sections=[{title:'Customer operation',rows}];
 for(const profile of binding.pricing){
  const native=profile.options,values=[
   {label:'Profile',value:profile.profile},{label:'Label',value:profile.label},
   {label:'Original pricing workspace',value:profile.directory.path},
   {label:'Observed source',value:native.snapshot?'Snapshot':'Saved history'},
  ];
  for(const file of profile.files)values.push({label:file.kind+' source',value:[
   file.path,String(file.bytes)+' bytes','SHA-256 '+file.sha256]});
  for(const key of ['nativeOutbox','sourcePackage','releaseStore'])
   if(native[key])values.push({label:key,value:native[key]});
  if(native.releaseRuntime!==undefined)
   values.push({label:'Release options',value:'The complete original native runtime options are retained.'});
  sections.push({title:profile.label,collapsed:binding.pricing.length>2,rows:values});
 }
 return {schema:'stellar-forge.application-review-content.v1',title:'Research customer quotations',
  summary:'The same customer case, observed pricing sources and Research history continue through quotation, commissioned work, paid publication and receiving.',
  sections};
}

/**
 * directory is the original <Research directory>/customer-quotes directory.
 * This reader opens no case store or pricing model and acquires no writer.
 * Mutable case/history contents and not-yet-created directories are deliberately
 * outside the startup digest: their original writers can finish first launch and
 * recover it. Applications separately pins their actual selected path identities.
 */
export async function inspectResearchQuoteLaunch({directory,configurationFile=null}={}){
 const root=quotePath(directory),configuration=await readResearchQuoteConfiguration(configurationFile,{directory:root}),
  pricing=[];
 for(const profile of Object.keys(configuration.pricing).sort()){
  const selected=await selectQuotePricing(configuration,profile);pricing.push(copy(selected.binding));
 }
 const locations=[await location('quote-workspace',root),
  await location('case-store',configuration.casesDirectory,{privateTarget:true})];
 for(const profile of pricing){
  await assertQuoteDirectory(profile.directory);
  locations.push({role:'pricing:'+profile.profile,path:profile.directory.path,exists:true,missing:[],
   anchor:copy(profile.directory)});
 }
 // A host file changed during the complete source read must be reviewed again.
 const current=await readResearchQuoteConfiguration(configuration.file,{directory:root});
 need(same(configuration,current),'RESEARCH_QUOTE_LAUNCH_CONFIGURATION_CHANGED',409);
 const binding={schema:RESEARCH_QUOTE_LAUNCH_SCHEMA,directory:root,
  configurationFile:configuration.file,configurationSha256:configuration.sha256,
  casesDirectory:configuration.casesDirectory,pricing};
 const bindingSha256=fingerprint(binding);
 return {schema:RESEARCH_QUOTE_LAUNCH_SCHEMA,binding,bindingSha256,
  configuration:copy(configuration),locations,review:reviewContent(binding,locations)};
}
export function assertResearchQuoteLaunch(inspection,expectedBindingSha256){
 hash(expectedBindingSha256);
 need(inspection?.schema===RESEARCH_QUOTE_LAUNCH_SCHEMA&&inspection.binding?.schema===RESEARCH_QUOTE_LAUNCH_SCHEMA&&
  inspection.bindingSha256===fingerprint(inspection.binding)&&inspection.bindingSha256===expectedBindingSha256,
  'RESEARCH_QUOTE_LAUNCH_SOURCE_CHANGED',409);
 return inspection;
}

/** Nonsecret selected source data for the original authenticated client and ready line. */
export function researchQuoteLaunchView(inspection){
 if(inspection===null||inspection===undefined)return null;
 assertResearchQuoteLaunch(inspection,inspection.bindingSha256);
 return {schema:RESEARCH_QUOTE_LAUNCH_SCHEMA,bindingSha256:inspection.bindingSha256,
  directory:inspection.binding.directory,configurationFile:inspection.binding.configurationFile,
  configurationSha256:inspection.binding.configurationSha256,casesDirectory:inspection.binding.casesDirectory,
  profiles:inspection.binding.pricing.map(profile=>({id:profile.profile,label:profile.label,
   directory:profile.directory.path,files:copy(profile.files)}))};
}
