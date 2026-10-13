import { FamilyTuitionClient } from "./client.mjs";
/** Make-up ledger sharing the original family workspace, token and download verification. */
export class MakeupClient {
 constructor(url,options={}){this.family=new FamilyTuitionClient(url,options);}
 async state(){await this.family.state();return this.family.request("/api/makeup/state");}
 view(id,revision){return this.family.request("/api/makeup/view?id="+encodeURIComponent(id)+(revision===undefined?"":"&revision="+revision));}
 history(id){return this.family.request("/api/makeup/history?id="+encodeURIComponent(id));}
 originalRequest(id){return this.family.request("/api/makeup/request?id="+encodeURIComponent(id));}
 preview(definition){return this.family.request("/api/makeup/preview",{method:"POST",body:definition});}
 save(original){return this.family.request("/api/makeup/save",{method:"POST",body:original});}
 compare(id,before,after){return this.family.request("/api/makeup/compare",{method:"POST",body:{id,before,after}});}
 export(id,revision){return this.family.request("/api/makeup/export",{method:"POST",body:{id,revision}});}
 receive(bytes){return this.family.request("/api/makeup/receive",{method:"POST",body:bytes,headers:{"Content-Type":"application/zip"}});}
 download(file){return this.family.download(file);}
}
