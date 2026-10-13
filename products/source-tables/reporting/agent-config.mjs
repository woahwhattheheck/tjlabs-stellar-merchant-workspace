// MIT. Explicit host paths and private original reporting stores; no runtime opens here.
import {resolve,dirname,join,basename} from 'node:path';
import {mkdir,lstat,realpath,open,rename,rm,mkdtemp} from 'node:fs/promises';
import {identifier,line,exact,plain,writePrivate} from '../../../stellar-forge/mcp-merchant-operator/host-files.mjs';
import {readOriginalFile,privateDirectory} from './agent-store.mjs';
import {failure,canonical} from './agent-operations.mjs';

export const REPORTING_CONNECTION_SCHEMA='stellar-forge.reporting-programmes-connection.v1';
const fail=message=>{throw failure('CONFIGURATION',message);};
function selectedPath(value,base){
 if(typeof value!=='string'||!value||/[\x00-\x1f\x7f]/.test(value))fail('Declare the exact original host file or private directory path.');
 return resolve(base,value);
}
export async function readReportingProgrammeConfiguration(path){
 path=resolve(path);
 const raw=JSON.parse(new TextDecoder('utf-8',{fatal:true}).decode((await readOriginalFile(path,1048576)).bytes));
 exact(raw,['schema','workspaces'],['schema','workspaces']);
 if(raw.schema!==REPORTING_CONNECTION_SCHEMA||!plain(raw.workspaces)||Object.keys(raw.workspaces).length<1||Object.keys(raw.workspaces).length>32)
  fail('Declare one to 32 original reporting workspaces.');
 const base=dirname(path),workspaces=Object.create(null),directories=new Set();
 for(const [alias,value]of Object.entries(raw.workspaces)){
  identifier(alias,'Reporting workspace');exact(value,['label','directory','project','inputs'],['directory']);
  const directory=await privateDirectory(selectedPath(value.directory,base));
  if(directories.has(directory))fail('Give each original reporting store one alias.');directories.add(directory);
  if(value.inputs!==undefined&&(!plain(value.inputs)||Object.keys(value.inputs).length>64))fail('Declare at most 64 named original JSON inputs.');
  const inputs=Object.create(null);
  for(const [name,input]of Object.entries(value.inputs??{})){
   identifier(name,'Reporting input');exact(input,['path','label'],['path']);
   inputs[name]={path:selectedPath(input.path,base),label:line(input.label??name,'Reporting input label')};
  }
  // Missing or replaced input files must not prevent recovery from the original
  // complete retained request. Actual reads enforce descriptor identity and SHA.
  workspaces[alias]={label:line(value.label??alias,'Reporting workspace label'),directory,inputs,
   ...(value.project===undefined?{}:{project:selectedPath(value.project,base)})};
 }
 return {workspaces};
}
/** Prepare the ordinary merchant host; tools open the reporting lease explicitly. */
export async function initializeReportingProgrammeMerchant(options){
 exact(options,['directory','connection','name'],['directory','connection']);
 const directory=selectedPath(options.directory,process.cwd()),connection=selectedPath(options.connection,process.cwd());
 const name=line(options.name??'Reporting Programmes','Merchant name'),selected=await readReportingProgrammeConfiguration(connection);
 const {readMerchantConfig,CONFIG_SCHEMA}=await import('../../../stellar-forge/mcp-merchant-operator/config.mjs');
 const configuration=join(directory,'merchant-mcp.json'),raw={schema:CONFIG_SCHEMA,name,releaseStore:'./releases',exportsDirectory:'./customer-exports',sources:{},reportingProgrammesConnection:connection};
 async function result(reused){
  await readMerchantConfig(configuration);
  return {schema:CONFIG_SCHEMA,configuration,state:'INITIALIZED',reused,workspaces:Object.entries(selected.workspaces).map(([workspace,item])=>({workspace,label:item.label})),authoring:'OPENED_BY_MERCHANT_REPORTING_OPEN'};
 }
 let exists=true;try{await lstat(directory);}catch(error){if(error.code!=='ENOENT')throw error;exists=false;}
 if(exists){
  await privateDirectory(directory);
  const old=JSON.parse(new TextDecoder('utf-8',{fatal:true}).decode((await readOriginalFile(configuration,1048576)).bytes));
  if(canonical(old)!==canonical(raw))fail('The original merchant directory contains a different configuration.');
  return result(true);
 }
 if(await realpath(dirname(directory))!==dirname(directory))fail('Use the canonical parent of the new private merchant directory.');
 const temporary=await mkdtemp(join(dirname(directory),'.reporting-mcp-'));
 try{
  await (await import('../../../stellar/scf-starforge-20261009/sf82-seller-pilot/releases.mjs')).initReleaseStore(join(temporary,'releases'));
  await mkdir(join(temporary,'customer-exports'),{mode:0o700});
  await writePrivate(join(temporary,'merchant-mcp.json'),raw);
  await readMerchantConfig(join(temporary,'merchant-mcp.json'));
  // An existing destination is never edited by this initializer. Ordinary
  // installation chooses one new directory; the native provider owns its store.
  let appeared=false;try{await lstat(directory);appeared=true;}catch(error){if(error.code!=='ENOENT')throw error;}
  if(appeared)fail('The selected merchant directory appeared during preparation; inspect that original directory.');
  await rename(temporary,directory);
  const parent=await open(dirname(directory),'r');try{await parent.sync();}finally{await parent.close();}
  return result(false);
 }finally{await rm(temporary,{recursive:true,force:true});}
}
