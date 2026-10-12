// SPDX-License-Identifier: MIT
import {createHash} from 'node:crypto';
import {readFile,open,lstat,mkdir,realpath} from 'node:fs/promises';
import {isAbsolute,resolve,join} from 'node:path';

export const SCHEMA='stellar-forge.a2a-analysis-agent.v1';
export const PLAN_SCHEMA='stellar-forge.a2a-analysis-task.v1';
export const ID=/^[a-f0-9]{32}$/;
export const HASH=/^[a-f0-9]{64}$/;
export const NAME=/^[A-Za-z][A-Za-z0-9_-]{0,63}$/;
export const object=v=>v!==null&&typeof v==='object'&&!Array.isArray(v);
export function need(test,code){if(!test){const error=new Error(code);error.code=code;throw error;}}
export function canonical(value){
  if(Array.isArray(value))return '['+value.map(canonical).join(',')+']';
  if(object(value))return '{'+Object.keys(value).sort().map(k=>JSON.stringify(k)+':'+canonical(value[k])).join(',')+'}';
  need(value!==undefined,'A2A_ANALYSIS_UNDEFINED_JSON');
  return JSON.stringify(value);
}
export const sha=bytes=>createHash('sha256').update(bytes).digest('hex');
export const digest=value=>sha(canonical(value));
export const safeError=error=>/^[A-Z0-9_]{1,180}$/.test(error?.code??error?.message??'')?
  (error.code??error.message):'A2A_ANALYSIS_OPERATION_FAILED';
export function exactKeys(value,allowed,required=allowed){
  need(object(value)&&Object.keys(value).every(k=>allowed.includes(k))&&required.every(k=>Object.hasOwn(value,k)),
    'A2A_ANALYSIS_FIELDS_INVALID');
}
function label(value,limit=300){need(typeof value==='string'&&value.trim().length>0&&value.length<=limit&&!/[\u0000-\u0008\u000b\u000c\u000e-\u001f]/.test(value),'A2A_ANALYSIS_TEXT_INVALID');return value;}
export function absolute(value){
  need(typeof value==='string'&&isAbsolute(value)&&resolve(value)===value&&value!=='/'&&!value.includes('\0'),
    'A2A_ANALYSIS_PRIVATE_PATH_REQUIRED');
  return value;
}
export async function privateDirectory(path,{create=false}={}){
  absolute(path);if(create)await mkdir(path,{recursive:true,mode:0o700});
  const info=await lstat(path);
  need(info.isDirectory()&&!info.isSymbolicLink()&&(info.mode&0o077)===0&&
    (process.getuid===undefined||info.uid===process.getuid())&&await realpath(path)===path,
    'A2A_ANALYSIS_PRIVATE_DIRECTORY_REQUIRED');
  return path;
}
export async function saveNew(path,value){
  const raw=typeof value==='string'||Buffer.isBuffer(value)?value:JSON.stringify(value,null,2)+'\n';
  const f=await open(path,'wx',0o600);try{await f.writeFile(raw);await f.sync();}finally{await f.close();}
}
export async function readPrivateJSON(path,maximum=2*1024*1024){
  absolute(path);const info=await lstat(path);
  need(info.isFile()&&!info.isSymbolicLink()&&(info.mode&0o077)===0&&info.nlink===1&&info.size<=maximum&&
    (process.getuid===undefined||info.uid===process.getuid()),'A2A_ANALYSIS_PRIVATE_FILE_REQUIRED');
  return JSON.parse(await readFile(path,'utf8'));
}
export function parametersText(value){
  need(typeof value==='string'&&Buffer.byteLength(value)<=128*1024,'A2A_ANALYSIS_PARAMETERS_TEXT_REQUIRED');
  let parsed;try{parsed=JSON.parse(value);}catch{need(false,'A2A_ANALYSIS_PARAMETERS_JSON_INVALID');}
  need(Array.isArray(parsed)||object(parsed),'A2A_ANALYSIS_PARAMETERS_CONTAINER_REQUIRED');
  // Validation only. The unchanged original text is sent to Python, which preserves exact integers.
  return value;
}
export function queryRecord(value){
  need(object(value)&&NAME.test(value.name??'')&&Number.isSafeInteger(value.revision)&&value.revision>0&&
    typeof value.sql==='string'&&value.sql.trim()&&Buffer.byteLength(value.sql)<=128*1024&&
    Number.isSafeInteger(value.max_rows)&&value.max_rows>=1&&value.max_rows<=100000&&typeof value.saved_at==='string',
    'A2A_ANALYSIS_SAVED_QUERY_INVALID');
  return {name:value.name,revision:value.revision,sql:value.sql,
    parameters_text:parametersText(value.parameters_text),max_rows:value.max_rows,saved_at:value.saved_at};
}
export function viewSelection(views){
  need(Array.isArray(views)&&views.length<=1000,'A2A_ANALYSIS_VIEW_SELECTION_REQUIRED');
  const names=new Set();
  for(const v of views){
    need(object(v)&&NAME.test(v.name??'')&&HASH.test(v.version_id??'')&&
      Number.isSafeInteger(v.revision)&&v.revision>0&&!names.has(v.name),'A2A_ANALYSIS_VIEW_SELECTION_INVALID');
    names.add(v.name);
  }
  // Keep the original complete records and ordering: the native engine compares this exact selection.
  return structuredClone(views);
}
export function procedureRecord(p){
  need(object(p)&&NAME.test(p.id??'')&&NAME.test(p.workspace??'')&&ID.test(p.workspaceId??'')&&
    ['query','report'].includes(p.kind),'A2A_ANALYSIS_PROCEDURE_INVALID');
  label(p.name);label(p.description,4000);viewSelection(p.views);
  need(Array.isArray(p.formats)&&p.formats.length>=1&&p.formats.length<=3&&new Set(p.formats).size===p.formats.length&&
    p.formats.every(f=>(p.kind==='query'?['jsonl','csv','sqlite']:['json','html','csv']).includes(f)),
    'A2A_ANALYSIS_EXPORT_FORMATS_INVALID');
  need(Number.isSafeInteger(p.maxOutputBytes)&&p.maxOutputBytes>=1024&&p.maxOutputBytes<=256*1024*1024&&
    typeof p.timeoutSeconds==='number'&&p.timeoutSeconds>0&&p.timeoutSeconds<=86400,
    'A2A_ANALYSIS_EXPORT_LIMIT_INVALID');
  if(p.kind==='query'){
    queryRecord(p.query);
    need(typeof p.allowParameters==='boolean','A2A_ANALYSIS_PARAMETER_POLICY_REQUIRED');
  }else{
    need(object(p.report)&&object(p.report.definition)&&HASH.test(p.report.sha256??'')&&
      NAME.test(p.report.definition.name??'')&&Number.isSafeInteger(p.report.definition.revision)&&
      p.report.definition.revision>0,'A2A_ANALYSIS_REPORT_DEFINITION_INVALID');
  }
  const keep=['id','workspace','workspaceId','kind','name','description','views','formats','maxOutputBytes','timeoutSeconds'];
  const result=Object.fromEntries(keep.map(k=>[k,structuredClone(p[k])]));
  if(p.kind==='query')Object.assign(result,{query:queryRecord(p.query),allowParameters:p.allowParameters});
  else result.report=structuredClone(p.report);
  return result;
}
export function validateConfig(value){
  need(object(value)&&value.schema===SCHEMA,'A2A_ANALYSIS_CONFIG_SCHEMA_INVALID');
  const config=structuredClone(value);
  absolute(config.directory);label(config.name);label(config.description,4000);
  let url;try{url=new URL(config.publicUrl);}catch{need(false,'A2A_ANALYSIS_PUBLIC_URL_INVALID');}
  need(!url.username&&!url.password&&!url.search&&!url.hash&&
    (url.protocol==='https:'||url.protocol==='http:'&&['127.0.0.1','localhost','[::1]'].includes(url.hostname))&&
    url.pathname==='/a2a','A2A_ANALYSIS_PUBLIC_URL_INVALID');
  config.publicUrl=url.href;
  need(object(config.listen)&&typeof config.listen.host==='string'&&
    Number.isSafeInteger(config.listen.port)&&config.listen.port>=0&&config.listen.port<=65535,
    'A2A_ANALYSIS_LISTEN_INVALID');
  need(Array.isArray(config.workspaces)&&config.workspaces.length>0,'A2A_ANALYSIS_WORKSPACES_REQUIRED');
  const workspaces=new Map();
  for(const w of config.workspaces){
    need(object(w)&&NAME.test(w.name??'')&&ID.test(w.workspaceId??'')&&!workspaces.has(w.name),
      'A2A_ANALYSIS_WORKSPACE_INVALID');
    absolute(w.database);workspaces.set(w.name,w);
  }
  need(Array.isArray(config.procedures)&&config.procedures.length>0&&config.procedures.length<=256,
    'A2A_ANALYSIS_PROCEDURES_REQUIRED');
  const ids=new Set();
  config.procedures=config.procedures.map(p=>{
    const normalized=procedureRecord(p);
    need(!ids.has(p.id)&&workspaces.get(p.workspace)?.workspaceId===p.workspaceId,
      'A2A_ANALYSIS_PROCEDURE_WORKSPACE_CHANGED');
    ids.add(p.id);return normalized;
  });
  need(Array.isArray(config.principals)&&config.principals.length>0,'A2A_ANALYSIS_PRINCIPALS_REQUIRED');
  const principals=new Set();
  for(const p of config.principals){
    need(object(p)&&NAME.test(p.name??'')&&!principals.has(p.name)&&
      /^[A-Z][A-Z0-9_]{0,127}$/.test(p.tokenEnv??'')&&Array.isArray(p.procedures)&&p.procedures.length>0&&
      p.procedures.every(id=>id==='*'||ids.has(id)),'A2A_ANALYSIS_PRINCIPAL_INVALID');
    principals.add(p.name);
  }
  config.pollMs=config.pollMs??500;
  need(Number.isSafeInteger(config.pollMs)&&config.pollMs>=50&&config.pollMs<=10000,'A2A_ANALYSIS_POLL_INVALID');
  return config;
}
export async function loadConfig(path){return validateConfig(await readPrivateJSON(path));}
export function principal(config,context){
  const selected=config.principals.find(p=>p.name===context?.user?.userName);
  need(selected&&context?.user?.isAuthenticated===true,'A2A_ANALYSIS_AUTHENTICATED_PRINCIPAL_REQUIRED');
  return selected;
}
export function allowedProcedures(config,context){
  const p=principal(config,context);
  return config.procedures.filter(v=>p.procedures.includes('*')||p.procedures.includes(v.id));
}
export function publicProcedure(p){
  return {id:p.id,name:p.name,description:p.description,kind:p.kind,workspace:p.workspace,
    workspaceId:p.workspaceId,views:p.views,formats:p.formats,procedureSha256:digest(procedureRecord(p)),
    parametersAllowed:p.kind==='query'&&p.allowParameters,
    ...(p.kind==='query'?{query:{name:p.query.name,revision:p.query.revision}}:
      {report:{name:p.report.definition.name,revision:p.report.definition.revision,sha256:p.report.sha256}})};
}
export const statePaths=config=>({database:join(config.directory,'tasks.sqlite3'),
  native:join(config.directory,'native-analysis')});
