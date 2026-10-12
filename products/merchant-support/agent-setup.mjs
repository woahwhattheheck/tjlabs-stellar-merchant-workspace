#!/usr/bin/env node
// MIT. Configure the original Merchant Support provider for an existing case collection.
import {mkdir,readdir,realpath} from 'node:fs/promises';
import {resolve,join,dirname,isAbsolute,relative,sep} from 'node:path';
import {fileURLToPath} from 'node:url';
import {parseArgs} from 'node:util';
import {createHash} from 'node:crypto';
import {CONFIG_SCHEMA,readSupportConfiguration,readMerchantConfig} from '../../stellar-forge/mcp-merchant-operator/config.mjs';
import {fileBytes,line,privateSupportDirectory,failure} from '../../stellar-forge/mcp-merchant-operator/host-files.mjs';
import {retainCaseArtifact} from '../../stellar/scf-starforge-20261009/sf74-merchant-support-console/case-store.mjs';
import {initReleaseStore} from '../../stellar/scf-starforge-20261009/sf82-seller-pilot/releases.mjs';

export const SUPPORT_AGENT_SETUP_SCHEMA='stellar-forge.merchant-support-agent-setup.v1';
const encode=value=>Buffer.from(JSON.stringify(value,null,2)+'\n');
const digest=bytes=>createHash('sha256').update(bytes).digest('hex');
function absolute(value,label) {
  if(typeof value!=='string'||!isAbsolute(value)||resolve(value)!==value||value===resolve(value,'..')||
    /[\u0000-\u001f\u007f]/.test(value))
    throw failure('SUPPORT_SETUP_PATH','Choose an absolute normalized '+label+'.');
  return value;
}
const inside=(child,parent)=>{const value=relative(parent,child);return value===''||!isAbsolute(value)&&value!=='..'&&!value.startsWith('..'+sep);};
async function folder(path) {
  try{await mkdir(path,{mode:0o700});}catch(error){if(error.code!=='EEXIST')throw error;}
  await privateSupportDirectory(path);
  if(await realpath(path)!==path)throw failure('SUPPORT_SETUP_PATH','Use canonical private directories without symbolic links.');
  return path;
}
async function originalConnection(path) {
  const before=await fileBytes(path,1024*1024),selected=await readSupportConfiguration(path);
  const after=await fileBytes(path,1024*1024);
  if(!before.equals(after))throw failure('SUPPORT_SETUP_SOURCE_CHANGED','The Support connection changed during selection.');
  return {selected,sha256:digest(before)};
}

/** Every write uses the existing release initializer or immutable case-artifact publisher. */
export async function initializeSupportAgent({directory,connection,name='Merchant Support'}={}) {
  const root=absolute(directory,'agent directory'),source=absolute(connection,'Support connection file');
  name=line(name,'Merchant Support name');
  const selected=await originalConnection(source);
  for(const path of [selected.selected.casesDirectory,selected.selected.sourceDirectory,selected.selected.packagesDirectory])
    if(inside(root,path)||inside(path,root))
      throw failure('SUPPORT_SETUP_OVERLAP','Choose an agent directory separate from the original case, source and package stores.');
  if(await realpath(dirname(root))!==dirname(root))
    throw failure('SUPPORT_SETUP_PATH','Use an existing canonical parent for the private agent directory.');
  await folder(root);
  const requestPath=join(root,'support-agent-setup.json'),entries=await readdir(root);
  if(entries.length&&!entries.includes('support-agent-setup.json'))
    throw failure('SUPPORT_SETUP_OUTPUT','Use a new empty agent directory or this setup\'s retained directory.');
  const request={schema:SUPPORT_AGENT_SETUP_SCHEMA,name,connection:source,connectionSha256:selected.sha256};
  await retainCaseArtifact(requestPath,encode(request));
  // The original Linux initializer resumes its first state under its native lease.
  await initReleaseStore(join(root,'releases'),{resume:true});
  await folder(join(root,'customer-exports'));
  const configuration=join(root,'merchant-mcp.json');
  await retainCaseArtifact(configuration,encode({schema:CONFIG_SCHEMA,name,releaseStore:'./releases',
    exportsDirectory:'./customer-exports',sources:{},supportConnection:source}));
  await readMerchantConfig(configuration);
  return {schema:SUPPORT_AGENT_SETUP_SCHEMA,state:'READY',configuration,connection:source,
    connectionSha256:selected.sha256,casesDirectory:selected.selected.casesDirectory,
    sourceDirectory:selected.selected.sourceDirectory,packagesDirectory:selected.selected.packagesDirectory};
}

/** Current host configuration can evolve after setup; inspection uses the original provider reader. */
export async function inspectSupportAgent({configuration}={}) {
  const path=absolute(configuration,'merchant configuration file');
  const raw=JSON.parse(new TextDecoder('utf-8',{fatal:true}).decode(await fileBytes(path,1024*1024)));
  await readMerchantConfig(path);
  if(typeof raw.supportConnection!=='string')throw failure('SUPPORT_SETUP_CONNECTION','Select a merchant host containing its original Support connection.');
  const connection=resolve(dirname(path),raw.supportConnection),selected=await originalConnection(connection);
  return {schema:SUPPORT_AGENT_SETUP_SCHEMA,state:'READY',configuration:path,connection,
    connectionSha256:selected.sha256,casesDirectory:selected.selected.casesDirectory,
    sourceDirectory:selected.selected.sourceDirectory,packagesDirectory:selected.selected.packagesDirectory,
    incidentSourcesFile:selected.selected.incidentSourcesFile??null,
    packageSourcesFile:selected.selected.packageSourcesFile??null};
}

export async function supportAgentCli(argv=process.argv.slice(2)) {
  const {values,positionals}=parseArgs({args:argv,strict:true,allowPositionals:true,
    options:{out:{type:'string'},connection:{type:'string'},name:{type:'string'},config:{type:'string'},help:{type:'boolean'}}});
  if(values.help) {
    if(positionals.length||Object.keys(values).length!==1)throw failure('SUPPORT_SETUP_OPTIONS','Use --help on its own.');
    return {command:'merchant-support-agent',
      setup:'setup --out /private/support-agent --connection /private/support-connection.json [--name NAME]',
      inspect:'inspect --config /private/support-agent/merchant-mcp.json',
      continuation:'Repeat setup with its original output, connection bytes and name. Inspect the original host after deliberately updating its connection.',
      guide:'products/merchant-support/OPERATING.md'};
  }
  if(positionals.length!==1||!['setup','inspect'].includes(positionals[0]))
    throw failure('SUPPORT_SETUP_OPTIONS','Choose setup or inspect.');
  const action=positionals[0],allowed=action==='setup'?['out','connection','name']:['config'];
  if(Object.keys(values).some(key=>!allowed.includes(key)))
    throw failure('SUPPORT_SETUP_OPTIONS','Use only the options for the selected action.');
  return action==='setup'?initializeSupportAgent({directory:values.out,connection:values.connection,name:values.name}):
    inspectSupportAgent({configuration:values.config});
}
if(process.argv[1]&&resolve(process.argv[1])===fileURLToPath(import.meta.url)) {
  try{process.stdout.write(JSON.stringify(await supportAgentCli(),null,2)+'\n');}
  catch(error){process.stderr.write((error.code??'SUPPORT_SETUP_FAILED')+': '+error.message+'\n');process.exitCode=1;}
}
