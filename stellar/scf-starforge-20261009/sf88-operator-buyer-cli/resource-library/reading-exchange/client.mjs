// MIT — Original authenticated research transport, complete handover operations.
export class ReadingExchangeClient{
  constructor(researchClient){if(!researchClient||typeof researchClient.request!=='function')throw new TypeError('Use the original ResearchClient.');this.client=researchClient;}
  status(options){return this.client.request('/api/reading-exchange/status',options);}
  capture(value,options){return this.client.request('/api/reading-exchange/capture',{...options,method:'POST',body:value});}
  show(captureSha256,options){return this.client.request('/api/reading-exchange/capture?sha='+encodeURIComponent(captureSha256),options);}
  prepare(value,options){return this.client.request('/api/reading-exchange/prepare',{...options,method:'POST',body:value});}
  operation(operationId,options){return this.client.request('/api/reading-exchange/operation?id='+encodeURIComponent(operationId),options);}
  download(operationId,options){return this.client.request('/api/reading-exchange/download',{...options,method:'POST',body:{operationId}});}
}
