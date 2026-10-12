// MIT — Typed research client; all-page iterators pin the original content build.
export class ResearchClient {
  constructor({origin,token,fetch:transport=globalThis.fetch}){
    const u=new URL(origin);if(!['http:','https:'].includes(u.protocol)||u.username||u.password||u.pathname!=='/'||u.search||u.hash)throw new TypeError('A server origin is required');
    if(typeof token!=='string'||!token)throw new TypeError('A private session token is required');
    this.origin=u.origin;this.token=token;this.transport=transport;
  }
  async request(path,{method='GET',body,signal}={}){
    const response=await this.transport(this.origin+path,{method,signal,redirect:'error',headers:{Authorization:'Bearer '+this.token,...(body===undefined?{}:{'Content-Type':'application/json'})},...(body===undefined?{}:{body:JSON.stringify(body)})});
    const value=await response.json();if(!response.ok){const e=new Error(value.error??'Research request failed');e.code=value.error;e.status=response.status;throw e;}return value;
  }
  query(route,options={}){const p=new URLSearchParams();for(const [k,v]of Object.entries(options))if(v!==undefined&&k!=='signal')p.set(k,String(v));return this.request('/api/content-search/'+route+'?'+p,{signal:options.signal});}
  status(options){return this.request('/api/content-search/status',options);}
  index(options){return this.request('/api/content-search/index',{...options,method:'POST',body:{}});}
  cancel(options){return this.request('/api/content-search/cancel',{...options,method:'POST',body:{}});}
  search(options){return this.query('search',options);}
  passages(options){return this.query('passages',options);}
  page(options){return this.query('page',options);}
  async *allResults(options){let offset=0,build=options?.build;while(true){const r=await this.search({...options,build,offset,limit:100});build=r.build;yield* r.items;if(r.nextOffset===null)return;offset=r.nextOffset;}}
  async *allPassages(options){let offset=0,build=options?.build;while(true){const r=await this.passages({...options,build,offset,limit:100});build=r.build;yield* r.items;if(r.nextOffset===null)return;offset=r.nextOffset;}}
  saved(options){return this.request('/api/content-search/saved',options);}
  save(value,options){return this.request('/api/content-search/saved',{...options,method:'PUT',body:value});}
  delete(value,options){return this.request('/api/content-search/saved',{...options,method:'DELETE',body:value});}
  export(value,options){return this.request('/api/content-search/export',{...options,method:'POST',body:value});}
}
