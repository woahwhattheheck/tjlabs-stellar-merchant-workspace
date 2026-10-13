// SPDX-License-Identifier: MIT
/** Same-origin typed action client; full original requests are retained by the host. */
export class CommissioningClient{
  constructor({origin='',token,fetch:transport=globalThis.fetch}={}){this.origin=origin;this.token=token;this.transport=transport;}
  async request(path,{method='GET',body,raw=false}={}){
    const headers={...(this.token?{authorization:'Bearer '+this.token}:{}),...(body!==undefined?{'content-type':raw?'application/octet-stream':'application/json'}:{})};
    const response=await this.transport(this.origin+path,{method,headers,credentials:'same-origin',...(body!==undefined?{body:raw?body:JSON.stringify(body)}:{})});
    const value=await response.json();if(!response.ok)throw Object.assign(new Error(value.message??'The original operation could not complete.'),{code:value.error,status:response.status,body:value});return value;
  }
  authenticate(token){return this.request('/api/session',{method:'POST',body:{token}});}
  state(){return this.request('/api/state');}
  release(id){return this.request('/api/release?id='+encodeURIComponent(id));}
  history({kind='results',offset=0,limit=50,revision}={}){const p=new URLSearchParams({kind,offset:String(offset),limit:String(limit)});if(revision!==undefined)p.set('revision',String(revision));return this.request('/api/history?'+p);}
  installationReceivings(){return this.request('/api/installation-receivings');}
  installationReceiving({id,kind='summary',offset=0,limit=50,snapshotSha256}){const p=new URLSearchParams({id,kind,offset:String(offset),limit:String(limit)});if(snapshotSha256)p.set('snapshotSha256',snapshotSha256);return this.request('/api/installation-receiving?'+p);}
  installations(){return this.request('/api/installations');}
  installation({id,kind='summary',offset=0,limit=50}){return this.request('/api/installation?'+new URLSearchParams({id,kind,offset:String(offset),limit:String(limit)}));}
  installationArchiveURL(operationId){return this.origin+'/api/installation/archive?operationId='+encodeURIComponent(operationId);}
  prepare(command){return this.request('/api/requests',{method:'POST',body:command});}
  apply(command){return this.request('/api/action',{method:'POST',body:command});}
  receive(operationId){return this.request('/api/receive?operationId='+encodeURIComponent(operationId));}
  beginUpload(input){return this.request('/api/uploads',{method:'POST',body:input});}
  uploadState(id){return this.request('/api/uploads/'+encodeURIComponent(id));}
  uploadChunk(id,offset,body){return this.request('/api/uploads/'+encodeURIComponent(id)+'?offset='+offset,{method:'PUT',body,raw:true});}
  completeUpload(id){return this.request('/api/uploads/'+encodeURIComponent(id)+'/complete',{method:'POST',body:{}});}
  fileURL({kind,id,name,snapshotSha256}={}){const p=new URLSearchParams({kind});if(id)p.set('id',id);if(name)p.set('name',name);if(snapshotSha256)p.set('snapshotSha256',snapshotSha256);return this.origin+'/api/file?'+p;}
  archiveURL(operationId){return this.origin+'/api/archive?operationId='+encodeURIComponent(operationId);}
}
