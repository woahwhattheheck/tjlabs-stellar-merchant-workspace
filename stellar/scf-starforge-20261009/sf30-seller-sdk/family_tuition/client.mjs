/** Full source-bound family tuition operator client. No payment or provider operation. */
export class FamilyTuitionClient {
 constructor(url,{fetch:fetcher=globalThis.fetch}={}){this.url=url.replace(/\/$/,"");this.fetcher=fetcher;this.token=null;}
 async request(route,{method="GET",body,headers={}}={}){if(method!=="GET"&&!this.token)await this.state();const response=await this.fetcher(this.url+route,{method,headers:{...(method==="GET"?{}:{"X-Family-Token":this.token}),...(body instanceof Uint8Array?{}:body===undefined?{}:{"Content-Type":"application/json"}),...headers},body:body===undefined?undefined:body instanceof Uint8Array?body:JSON.stringify(body)});const data=await response.json();if(!response.ok){const error=new Error(data.error??"Request failed");Object.assign(error,{status:response.status,adoptionState:data.adoptionState});throw error;}return data;}
 async state(){const s=await this.request("/api/state");this.token=s.token;return s;}
 view(id,revision){return this.request("/api/view?id="+encodeURIComponent(id)+(revision===undefined?"":"&revision="+revision));}
 history(id){return this.request("/api/history?id="+encodeURIComponent(id));}
 rolloverPreview(id,revision){return this.request("/api/rollover-preview?id="+encodeURIComponent(id)+(revision===undefined?"":"&revision="+revision));}
 originalRequest(id){return this.request("/api/request?id="+encodeURIComponent(id));}
 source(bytes,metadata){const encoded=typeof Buffer==="function"?Buffer.from(JSON.stringify(metadata),"utf8").toString("base64"):btoa(unescape(encodeURIComponent(JSON.stringify(metadata))));return this.request("/api/source",{method:"POST",body:bytes,headers:{"X-Source-Metadata":encoded,"Content-Type":"application/octet-stream"}});}
 table(source,format,sheet){return this.request("/api/table",{method:"POST",body:{source,format,...(sheet?{sheet}:{})}});}
 preview(definition){return this.request("/api/preview",{method:"POST",body:definition});}
 save(original){return this.request("/api/save",{method:"POST",body:original});}
 compare(id,before,after){return this.request("/api/compare",{method:"POST",body:{id,before,after}});}
 export(id,revision){return this.request("/api/export",{method:"POST",body:{id,revision,format:"packet"}});}
 receive(bytes){return this.request("/api/receive",{method:"POST",body:bytes,headers:{"Content-Type":"application/zip"}});}
 async download(file){const response=await this.fetcher(this.url+file.url);if(!response.ok)throw new Error("Download failed");const bytes=new Uint8Array(await response.arrayBuffer());const digest=Array.from(new Uint8Array(await crypto.subtle.digest("SHA-256",bytes)),x=>x.toString(16).padStart(2,"0")).join("");if(bytes.length!==file.bytes||digest!==file.sha256)throw new Error("Complete download identity differs");return bytes;}
}
