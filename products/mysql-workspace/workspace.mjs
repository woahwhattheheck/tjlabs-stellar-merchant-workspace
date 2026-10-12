// MIT. Complete product entry through the original merchant owner and transport.
import { randomUUID } from 'node:crypto';
import { atomicJson, need, stamp, SESSION_SCHEMA } from './setup.mjs';
import { inspectMysqlLaunch } from './managed.mjs';
export { initializeMysqlProduct,inspectMysqlProduct,readMysqlProduct } from './setup.mjs';
export { inspectMysqlArchive,restoreMysqlArchive } from './receiving.mjs';
export { inspectMysqlLaunch,openMysqlManaged } from './managed.mjs';

/** The merchant provider owns the sole product lease; this wrapper never acquires a second lease. */
export async function openMysqlProduct(options={}, {environment=process.env}={}){
  const first=await inspectMysqlLaunch(options,{environment});
  if(options.expectedBindingSha256!==undefined)need(options.expectedBindingSha256===first.bindingSha256,
    'MYSQL_PRODUCT_BINDING_CHANGED','Review the current original source before starting.');
  let owned,started,closing,initial,operator;
  const save=value=>atomicJson(first.directory,'connection.json',value);
  try{
    if(first.options.browserOnly){
      const{openMerchantOperator}=await import('../../stellar-forge/mcp-merchant-operator/operator.mjs');
      owned=operator=await openMerchantOperator(first.paths.configuration);
    }else{
      const{startMerchantMcp}=await import('../../stellar-forge/mcp-merchant-operator/serve.mjs');
      owned=await startMerchantMcp({configPath:first.paths.configuration,port:first.options.port,
        tokenEnv:first.options.tokenEnv,environment});operator=owned.operator;
    }
    const result=await operator.call('merchant_mysql_product_open',{workspace:first.profile.workspace});
    need(result.open===true&&result.productId===first.profile.productId&&typeof result.browserUrl==='string',
      'MYSQL_PRODUCT_OPEN_FAILED');
    initial={schema:SESSION_SCHEMA,productId:first.profile.productId,workspace:first.profile.workspace,
      instanceId:randomUUID(),startedAt:stamp(),bindingSha256:first.bindingSha256,resourceId:first.resourceId,
      directory:first.directory,workspaceDirectory:first.paths.workspaceDirectory,configuration:first.paths.configuration,
      connectionFile:first.paths.sessionFile,tokenEnv:first.options.tokenEnv,browserOnly:first.options.browserOnly,
      port:first.options.port,nativeInstanceId:result.instanceId};
    await save({...initial,state:'STARTING',browserUrl:null,mcpUrl:null});
    const after=await inspectMysqlLaunch(options,{environment});
    need(after.bindingSha256===first.bindingSha256,'MYSQL_PRODUCT_BINDING_CHANGED',
      'The original source configuration changed during startup.');
    started={state:'OPEN',browserUrl:result.browserUrl,mcpUrl:first.options.browserOnly?null:new URL('/mcp',owned.url).href};
    await save({...initial,...started});
    return{...initial,...started,name:first.profile.name,operator,
      close(){
        if(!closing)closing=(async()=>{
          await owned.close();
        })().catch(error=>{closing=null;throw error;});
        return closing;
      }};
  }catch(error){
    let saveError;
    if(initial)try{await save({...initial,...started,state:'FAILED',endedAt:stamp(),
      error:{code:error.code??'MYSQL_PRODUCT_OPEN_FAILED',message:error.message}});}catch(issue){saveError=issue;}
    try{await owned?.close();}
    catch(cleanup){throw new AggregateError([error,...(saveError?[saveError]:[]),cleanup],'MySQL native startup cleanup is incomplete.');}
    if(saveError)throw new AggregateError([error,saveError],'MySQL startup failed and its session record could not be retained.');
    throw error;
  }
}
