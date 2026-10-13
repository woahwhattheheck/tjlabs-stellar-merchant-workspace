// MIT. Host-owned connections to the original managed Merchant project desk.
import {dirname,resolve,isAbsolute} from 'node:path';
import {lstat,realpath} from 'node:fs/promises';
import {readMerchantInput} from '../../products/x402api-merchant-workspace/application-inputs.mjs';
import {createMerchantIntakeClient,MERCHANT_INTAKE_CONNECTION_SCHEMA} from '../../products/x402api-merchant-workspace/project-intake-client.mjs';
import {parseJSONBytes} from '../../products/x402api-merchant-workspace/protocol.mjs';

export const MERCHANT_PROJECT_CONNECTION_SCHEMA='stellar-forge.merchant-project-agent.v1';
export const projectNeed=(value,code)=>{if(!value)throw Object.assign(new Error(code),{code});};
const SHA=/^[a-f0-9]{64}$/;
const plain=value=>value!==null&&typeof value==='object'&&!Array.isArray(value);
function exact(value,allowed,required=[]) {
  projectNeed(plain(value)&&Object.keys(value).every(key=>allowed.includes(key))&&
    required.every(key=>Object.hasOwn(value,key)),'MERCHANT_PROJECT_AGENT_FIELDS_INVALID');
}
export function projectPath(value,base='/') {
  projectNeed(typeof value==='string'&&value&&!value.includes('\0'),'MERCHANT_PROJECT_AGENT_PATH_REQUIRED');
  const path=resolve(base,value);projectNeed(isAbsolute(path),'MERCHANT_PROJECT_AGENT_PATH_REQUIRED');return path;
}
export async function projectPrivateDirectory(path) {
  const info=await lstat(path);
  projectNeed(info.isDirectory()&&!info.isSymbolicLink()&&!(info.mode&0o077)&&
    (process.getuid===undefined||info.uid===process.getuid())&&await realpath(path)===path,
    'MERCHANT_PROJECT_AGENT_PRIVATE_DIRECTORY_REQUIRED');return path;
}
export async function projectJSON(path,maximum=1024*1024) {
  const value=await readMerchantInput(path,{maximum,collect:true,privateOnly:true,allowMultipleLinks:true});
  return parseJSONBytes(value.raw,{maximumBytes:maximum});
}
export async function readMerchantProjectConfiguration(file) {
  file=projectPath(file);
  const raw=await projectJSON(file),base=dirname(file);
  exact(raw,['schema','projects'],['schema','projects']);
  projectNeed(raw.schema===MERCHANT_PROJECT_CONNECTION_SCHEMA&&plain(raw.projects)&&
    Object.keys(raw.projects).length>=1&&Object.keys(raw.projects).length<=32,'MERCHANT_PROJECT_AGENT_CONFIGURATION');
  const projects=Object.create(null),identities=new Set();
  for(const [alias,value] of Object.entries(raw.projects)) {
    projectNeed(/^[a-z0-9][a-z0-9_-]{0,63}$/.test(alias)&&!['constructor','prototype','__proto__'].includes(alias),
      'MERCHANT_PROJECT_AGENT_ALIAS_INVALID');
    exact(value,['label','connectionFile','selectionSha256','tokenEnvironment','exportsDirectory'],
      ['connectionFile','selectionSha256','tokenEnvironment','exportsDirectory']);
    projectNeed(SHA.test(value.selectionSha256??'')&&!identities.has(value.selectionSha256)&&
      typeof value.tokenEnvironment==='string'&&/^[A-Z][A-Z0-9_]{0,127}$/.test(value.tokenEnvironment)&&
      (value.label===undefined||typeof value.label==='string'&&value.label.length<=160),
      'MERCHANT_PROJECT_AGENT_CONFIGURATION');
    identities.add(value.selectionSha256);
    const entry={...value,label:value.label??alias,connectionFile:projectPath(value.connectionFile,base),
      exportsDirectory:projectPath(value.exportsDirectory,base)};
    await projectPrivateDirectory(entry.exportsDirectory);await readMerchantProjectConnection(entry);
    projects[alias]=entry;
  }
  return {file,projects};
}
/** Reading a current announcement never starts a listener, extracts an archive or imports its source. */
export async function readMerchantProjectConnection(definition) {
  const current=await projectJSON(definition.connectionFile,1024*1024);
  const accepted=current?.schema==='stellar-forge.merchant-project-intake.v1'&&current.mode==='intake'||
    current?.schema===MERCHANT_INTAKE_CONNECTION_SCHEMA;
  projectNeed(accepted&&current.selectionSha256===definition.selectionSha256&&typeof current.url==='string',
    'MERCHANT_PROJECT_AGENT_CONNECTION_CHANGED');
  const url=new URL(current.url);
  projectNeed(url.protocol==='http:'&&url.hostname==='127.0.0.1'&&url.port&&!url.username&&!url.password&&
    (url.href===url.origin+'/'||current.url===url.origin),'MERCHANT_PROJECT_AGENT_CONNECTION_ORIGIN');
  return {url:url.origin+'/',selectionSha256:definition.selectionSha256};
}
export async function connectMerchantProject(definition,environment=process.env) {
  const selected=await readMerchantProjectConnection(definition);
  return createMerchantIntakeClient({...selected,operatorToken:environment[definition.tokenEnvironment]});
}
