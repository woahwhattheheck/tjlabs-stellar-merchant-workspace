// MIT. Commissioning uses one original AccountingWorkspace and its existing customer ledgers.
import {createServer} from 'node:http';
import {resolve} from 'node:path';
import {openAccountingWorkspace} from '../../workspace/store.mjs';
import {ReceivablesWorkspace} from '../store.mjs';
import {createReceivablesHttpHandler} from '../server.mjs';
import {CustomerStatementWorkspace} from '../../customer-statements/store.mjs';
import {XeroReceivablesWorkspace} from '../xero/store.mjs';
import {createXeroReceivablesHandler} from '../xero/server.mjs';
import {CommissioningCollectionsWorkspace} from './workspace.mjs';
import {need} from '../core.mjs';
import {createCommissioningCollectionsHandler,commissioningBasePath,commissioningSecurityHeaders,
  commissioningJson,commissioningPublicError} from './http.mjs';
export {COMMISSIONING_OPERATOR_REQUEST_BYTES,COMMISSIONING_OPERATOR_SOURCE_BYTES,
  commissioningCollectionsAsset,handleCommissioningCollectionsRequest,createCommissioningCollectionsHandler} from './http.mjs';

async function owners(workspace, options = {}) {
  const receivables = options.receivables || await new ReceivablesWorkspace(workspace).init();
  need(receivables.workspace === workspace, 'COMMISSIONING_WORKSPACE_MISMATCH',
    'Use the receivables controller from this original accounting workspace.', 409);
  const xero = options.xero || new XeroReceivablesWorkspace(receivables);
  need(xero.workspace === workspace && xero.receivables.workspace === workspace,
    'COMMISSIONING_WORKSPACE_MISMATCH', 'Use the Xero controller from this original accounting workspace.', 409);
  const controller = options.controller || new CommissioningCollectionsWorkspace(receivables, {xero});
  need(controller.workspace === workspace, 'COMMISSIONING_WORKSPACE_MISMATCH',
    'Use the commissioning controller from this original accounting workspace.', 409);
  await controller.init();
  return {receivables,xero,controller};
}

/** Borrow the supplied accounting owner without acquiring or closing another lease. */
export async function createCommissioningCollectionsHttpHandler(workspace, options = {}) {
  const {controller} = await owners(workspace, options);
  return createCommissioningCollectionsHandler(controller, options);
}

/** Existing receivables and Xero desks are available from the same local service. */
export async function prepareCommissioningCollectionsServer(options = {}) {
  const port = Number(options.port ?? 8452), host = String(options.host || '127.0.0.1');
  if (!Number.isInteger(port) || port < 0 || port > 65535) throw new TypeError('Use a valid local port.');
  if (!['127.0.0.1', 'localhost'].includes(host)) throw new TypeError('The commissioning workspace binds to loopback.');
  const apiPath = commissioningBasePath(options.apiPath, '/api/receivables/commissioning');
  const uiPath = commissioningBasePath(options.uiPath, '/receivables/commissioning');
  const receivablesApiPath = commissioningBasePath(options.receivablesApiPath, '/api/receivables');
  const receivablesUiPath = commissioningBasePath(options.receivablesUiPath, '/receivables');
  const xeroApiPath = commissioningBasePath(options.xeroApiPath, '/api/receivables/xero');
  const xeroUiPath = commissioningBasePath(options.xeroUiPath, '/receivables/xero');
  const ownsWorkspace = !options.workspace;
  const workspace = options.workspace || await openAccountingWorkspace({
    directory: resolve(options.directory || '.'),
    ...(options.expectedWorkspaceId ? {expectedWorkspaceId:options.expectedWorkspaceId} : {}),
    ...(options.expectedSourcesSha256 ? {expectedSourcesSha256:options.expectedSourcesSha256} : {}),
    ...(options.outboxDir ? {outboxDir:resolve(options.outboxDir)} : {}),
    ...(options.proofDir ? {proofDir:resolve(options.proofDir)} : {}),
    ...(options.termsFile ? {termsFile:resolve(options.termsFile)} : {}),
    ...(options.recoveredDir ? {recoveredDir:resolve(options.recoveredDir)} : {}),
  });
  let receivables,xero,controller,handler,statements;
  try {
    ({receivables,xero,controller} = await owners(workspace, options));
    const sharedOptions = {...options,apiPath,uiPath,receivablesApiPath,receivablesUiPath,xeroApiPath,xeroUiPath,port:port || undefined};
    const commissioning = await createCommissioningCollectionsHandler(controller, sharedOptions);
    let xeroHandlerPromise,receivablesHandlerPromise;
    const starts = (path, base) => path === base || path.startsWith(base + '/');
    handler = async (request, response) => {
      if (await commissioning(request,response)) return true;
      let url; try { url = new URL(request.url || '/', 'http://localhost'); } catch { return false; }
      if (options.includeXero !== false && (starts(url.pathname,xeroApiPath) || starts(url.pathname,xeroUiPath))) {
        if (!xeroHandlerPromise) {
          xeroHandlerPromise = createXeroReceivablesHandler(xero,{
            ...sharedOptions,apiPath:xeroApiPath,uiPath:xeroUiPath,
          }).catch(error => { xeroHandlerPromise = undefined; throw error; });
        }
        return (await xeroHandlerPromise)(request,response);
      }
      if (options.includeReceivables !== false &&
          (starts(url.pathname,receivablesApiPath) || starts(url.pathname,receivablesUiPath) ||
           starts(url.pathname,'/customer-statements'))) {
        if (!receivablesHandlerPromise) {
          receivablesHandlerPromise = (async()=>{
            if (options.includeCustomerStatements !== false) statements = options.statements || await new CustomerStatementWorkspace(workspace).init();
            return createReceivablesHttpHandler(workspace,{
              ...sharedOptions,apiPath:receivablesApiPath,uiPath:receivablesUiPath,statements,
            });
          })().catch(error=>{receivablesHandlerPromise=undefined;throw error;});
        }
        return (await receivablesHandlerPromise)(request,response);
      }
      return false;
    };
  } catch (error) { if (ownsWorkspace) await workspace.close(); throw error; }
  const server = createServer(async(request,response)=>{
    try {
      if (!(await handler(request,response))) {
        commissioningSecurityHeaders(response);
        commissioningJson(response,404,{error:{code:'NOT_FOUND',message:'Open the commissioning desk at '+uiPath+'/'}});
      }
    } catch (error) {
      if (!response.headersSent) {
        commissioningSecurityHeaders(response);
        const failure=commissioningPublicError(error);commissioningJson(response,failure.status,failure.value);
      } else response.end();
    }
  });
  server.requestTimeout=60000;server.headersTimeout=15000;
  let closed=false,closing;
  const close=async()=>{
    if(closed)return;
    if(closing)return closing;
    const attempt=(async()=>{
      if(server.listening)await new Promise((accept,reject)=>server.close(error=>error?reject(error):accept()));
      if(ownsWorkspace)await workspace.close();
      closed=true;
    })();
    closing=attempt;
    try{return await attempt;}catch(error){if(closing===attempt)closing=undefined;throw error;}
  };
  const service={server,workspace,receivables,xero,controller,handler,port,close,
    get statements(){return statements;},
    async listen(){
      need(!closed,'COMMISSIONING_SERVER_CLOSED','Start a new service to reopen this local desk.',409);
      if(!server.listening)await new Promise((accept,reject)=>{
        const fail=error=>{server.off('listening',ready);reject(error);};
        const ready=()=>{server.off('error',fail);accept();};
        server.once('error',fail);server.once('listening',ready);server.listen(port,host);
      });
      service.url='http://'+host+':'+server.address().port+uiPath+'/';
      return service.url;
    }};
  return service;
}
export async function createCommissioningCollectionsServer(options = {}) {
  const service=await prepareCommissioningCollectionsServer(options);
  try{await service.listen();return service;}catch(error){await service.close();throw error;}
}
export const startCommissioningCollectionsServer=createCommissioningCollectionsServer;
