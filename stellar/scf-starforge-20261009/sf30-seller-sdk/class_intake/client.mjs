export class ClassIntakeClient {
 constructor(baseUrl,{fetch=globalThis.fetch}={}){this.baseUrl=baseUrl.replace(/\/$/,"");this.fetch=fetch;this.token=null}
 async call(path,body,headers={}){if(body!==undefined&&!this.token)await this.state();const options=body===undefined?{}:{method:"POST",headers:{"X-Intake-Token":this.token,...headers},body};const r=await this.fetch(this.baseUrl+path,options);const result=await r.json();if(!r.ok){const error=new Error(result.error??"Class intake request failed");error.status=r.status;error.result=result;throw error}return result}
 async state(){const result=await this.call("/api/state");this.token=result.token;return result}
 view(id,revision){return this.call("/api/view?id="+encodeURIComponent(id)+(revision===undefined?"":"&revision="+revision))}
 history(id){return this.call("/api/history?id="+encodeURIComponent(id))}
 request(requestId){return this.call("/api/request?id="+encodeURIComponent(requestId))}
 json(path,body){return this.call(path,JSON.stringify(body),{"Content-Type":"application/json"})}
 save(request){return this.json("/api/save",request)}
 table(selection){return this.json("/api/table",selection)}
 compare(id,before,after){return this.json("/api/compare",{id,before,after})}
 export(id,revision,format="packet"){return this.json("/api/export",{id,revision,format})}
 receive(bytes){return this.call("/api/receive",bytes,{"Content-Type":"application/zip"})}
 addSource(bytes,metadata){const text=JSON.stringify(metadata);const data=new TextEncoder().encode(text);let binary="";for(const n of data)binary+=String.fromCharCode(n);return this.call("/api/source",bytes,{"X-Source-Metadata":btoa(binary),"Content-Type":"application/octet-stream"})}
 async download(descriptor){const r=await this.fetch(this.baseUrl+descriptor.url);if(!r.ok)throw new Error("Download failed");const bytes=new Uint8Array(await r.arrayBuffer());const hash=Array.from(new Uint8Array(await crypto.subtle.digest("SHA-256",bytes)),v=>v.toString(16).padStart(2,"0")).join("");if(bytes.length!==descriptor.bytes||hash!==descriptor.sha256)throw new Error("Artifact identity mismatch");return bytes}
}