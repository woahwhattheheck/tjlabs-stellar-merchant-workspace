// MIT. Original Applications review binds setup and native launch configuration.
import { lstat, realpath } from 'node:fs/promises';
import { join, dirname, resolve, isAbsolute } from 'node:path';
import { readMysqlProduct, readPrivate, readJson, digest, identity, absolute, need, object } from './setup.mjs';
export const MYSQL_PRODUCT_LAUNCH_SCHEMA='stellar-forge.mysql-product-launch.v1';
const ENV=/^[A-Za-z_][A-Za-z0-9_]{0,127}$/;
function settings(input){
  const port=input.port??0,tokenEnv=input.tokenEnv??'MCP_ACCESS_TOKEN',browserOnly=input.browserOnly??false;
  need(Number.isInteger(port)&&port>=0&&port<=65535&&ENV.test(tokenEnv)&&typeof browserOnly==='boolean',
    'MYSQL_PRODUCT_LAUNCH_INVALID');
  need(!browserOnly||port===0,'MYSQL_PRODUCT_BROWSER_ONLY_PORT');
  return{directory:absolute(resolve(input.directory)),port,tokenEnv,browserOnly};
}
async function file(role,path,maximum=1048576){
  const actual=await realpath(path),raw=await readPrivate(actual,maximum);
  need(actual===path,'MYSQL_PRODUCT_BINDING_SYMLINK');
  return{role,path:actual,bytes:raw.length,sha256:digest(raw)};
}
async function directory(role,path){
  const actual=await realpath(path),stat=await lstat(actual);
  need(actual===path&&stat.isDirectory()&&!(stat.mode&0o077),'MYSQL_PRODUCT_BINDING_DIRECTORY');
  return{role,path:actual,dev:String(stat.dev),ino:String(stat.ino)};
}
async function observe(value,options,environment){
  const{profile,paths:p}=value;
  const files=await Promise.all([
    ['product',join(p.directory,'product.json')],['setup',join(p.directory,'product.setup.json')],
    ['mysqlSource',p.sourceFile],['originalMysqlSource',join(p.sourceDirectory,'original-source.json')],
    ['merchantConfiguration',p.configuration],['mysqlConnection',p.connection],
    ...(profile.caSha256?[['databaseCA',join(p.sourceDirectory,'database-ca.pem')]]:[])
  ].map(([role,path])=>file(role,path)));
  const raw=await readJson(p.configuration);
  need(raw.schema==='stellar-forge.merchant-mcp.v1'&&raw.name===profile.name&&object(raw.sources)&&
    Object.keys(raw.sources).length===0&&Object.keys(raw).every(key=>[
      'schema','name','releaseStore','exportsDirectory','sources','mysqlProductConnection'].includes(key))&&
    resolve(dirname(p.configuration),raw.releaseStore)===join(p.directory,'operator','releases')&&
    resolve(dirname(p.configuration),raw.exportsDirectory)===join(p.directory,'operator','customer-exports')&&
    resolve(dirname(p.configuration),raw.mysqlProductConnection)===p.connection,
    'MYSQL_PRODUCT_NATIVE_CONFIGURATION_CHANGED','Use this product’s original source-owned merchant configuration.');
  const connection=await readJson(p.connection);
  need(Object.keys(connection.workspaces??{}).length===1&&
    resolve(dirname(p.connection),connection.workspaces[profile.workspace]?.directory??'')===p.directory,
    'MYSQL_PRODUCT_CONNECTION_CHANGED');
  const oauth=options.browserOnly?null:environment.MCP_OAUTH_CONFIG||null;
  if(oauth){need(typeof oauth==='string'&&isAbsolute(oauth),'MYSQL_PRODUCT_OAUTH_CONFIGURATION');
    files.push(await file('mcpOAuth',oauth,262144));}
  const directories=await Promise.all(Object.entries({product:p.directory,mysql:p.workspaceDirectory,
    publications:p.publicationDirectory,receiving:p.receivingDirectory,operator:dirname(p.configuration),
    releases:join(p.directory,'operator','releases'),exports:join(p.directory,'operator','customer-exports')})
    .map(([role,path])=>directory(role,path)));
  return{files,directories,selection:{workspace:profile.workspace,sourceSha256:profile.sourceSha256,
    caSha256:profile.caSha256,runtime:profile.runtime,requiredEnvironment:[value.declaration.config.connection.passwordEnv]},
    authorization:{mode:options.browserOnly?'browser-only':oauth?'oauth':'fixed-bearer',
      tokenEnv:options.tokenEnv,oauthConfig:oauth,clientOrigins:options.browserOnly?[]:
        String(environment.MCP_CLIENT_ORIGINS??'').split(',').map(x=>x.trim()).filter(Boolean)}};
}
export async function inspectMysqlLaunch(input={}, {environment=process.env}={}){
  const options=settings(input),first=await readMysqlProduct(options.directory);
  const observed=await observe(first,options,environment),last=await readMysqlProduct(options.directory),
    confirmed=await observe(last,options,environment);
  need(identity(first.profile)===identity(last.profile)&&identity(observed)===identity(confirmed),
    'MYSQL_PRODUCT_BINDING_CHANGED','The source configuration changed during review.');
  const resourceId=identity({schema:'stellar-forge.mysql-product-resource.v1',directory:first.paths.directory});
  const binding={schema:MYSQL_PRODUCT_LAUNCH_SCHEMA,resourceId,profile:first.profile,options,...observed};
  const profile={...first.profile,directory:first.paths.directory,workspaceDirectory:first.paths.workspaceDirectory,
    configuration:first.paths.configuration,connection:first.paths.connection,connectionFile:first.paths.sessionFile,
    receivingDirectory:first.paths.receivingDirectory};
  return{schema:MYSQL_PRODUCT_LAUNCH_SCHEMA,profile,paths:first.paths,directory:options.directory,options,resourceId,binding,
    bindingSha256:identity(binding),...observed,review:{name:profile.name,workspace:profile.workspace,
      database:first.declaration.config.connection.database,host:first.declaration.config.connection.host,
      ownership:'ORIGINAL_MYSQL_EDITOR_PUBLISHER_AND_VERSIONED_SELLER',
      browser:'The original MySQL authoring browser and original publication consoles.',
      receiving:'Complete native drafts, SQL packages, publication candidates/reviews, schedules and retained snapshots.'}};
}
export async function openMysqlManaged(input={},options={}){
  need(/^[a-f0-9]{64}$/.test(input.expectedBindingSha256??''),'MYSQL_PRODUCT_BINDING_REQUIRED');
  return(await import('./workspace.mjs')).openMysqlProduct(input,options);
}
