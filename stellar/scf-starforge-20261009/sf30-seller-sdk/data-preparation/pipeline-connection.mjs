// MIT. The original PipelineClient on the private Applications connection.
import {PipelineClient} from './pipelines/client.mjs';
import {PreparationWorkspaceClient,preparationNeed} from './connection.mjs';

const apiPath=path=>{
  preparationNeed(typeof path==='string'&&path.startsWith('/api/')&&!path.startsWith('//'),
    'PREPARATION_PIPELINE_ROUTE','Use an original pipeline operation.');
  return '/api/pipelines/'+path.slice(5);
};
const filePath=path=>{
  if(/^\/downloads\/[a-f0-9]{32}\.(zip|html)$/.test(path))return '/api/pipelines'+path;
  if(/^\/api\/pipelines\/downloads\/[a-f0-9]{32}\.(zip|html)$/.test(path))return path;
  if(path.startsWith('/api/result?'))return apiPath(path);
  preparationNeed(path.startsWith('/api/pipelines/result?'),
    'PREPARATION_PIPELINE_FILE','Choose a completed pipeline download or original stage result.');
  return path;
};

export class PreparationPipelineClient extends PipelineClient {
  #preparation;
  constructor(preparation){
    preparationNeed(preparation instanceof PreparationWorkspaceClient,
      'PREPARATION_PIPELINE_CONNECTION','Attach the current PreparationWorkspaceClient first.');
    // Every native public method uses request, importFile or download below.
    // There is no unauthenticated fallback transport for this managed view.
    super(preparation.origin,{fetch:()=>{throw new Error('Use the managed pipeline request or complete-file method.');}});
    this.#preparation=preparation;
  }
  get connection(){return this.#preparation.connection;}
  request(path,{body,signal}={}){
    return this.#preparation.request(apiPath(path),{
      method:body===undefined?'GET':'POST',
      ...(body===undefined?{}:{headers:{'Content-Type':'application/json','X-Preparation-Request':'1'},body:JSON.stringify(body)}),
      signal,
    });
  }
  browser(){return this.#preparation.pipelineBrowser();}
  status(options){return this.#preparation.pipelineStatus(options);}
  importFile(path,options={}){return this.#preparation.importFile(path,options);}
  receiveProject(path,options={}){return this.#preparation.receivePipelineProject(path,options);}
  resultURL(id,stage,file='result.jsonl'){return apiPath(super.resultURL(id,stage,file));}
  download(relative,destination,options={}){return this.#preparation.downloadOriginal(filePath(relative),destination,options);}
  downloadLink(relative,options){return this.#preparation.downloadLink(filePath(relative),options);}
  exportDelivery(value,options){return this.#preparation.exportPipelineDelivery(value,options);}
}
// Closing the owning PreparationWorkspaceClient drains this view's calls and
// complete-file transfers together with the other original workspace operations.
