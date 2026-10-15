function buildProgrammeArtifacts({input,coreSource,codecSource,operatorSource,style,shell}){
 const factory=new Function(codecSource+"\n"+coreSource+"\nreturn createProspectProgrammeCore;");
 const core=factory()();
 input=core.unpack(input);
 const workspace=input.schema==="tjlabs.prospect-workspace.v3"?core.reopen(input):core.create(input);
 const safe=s=>s.replace(/<\/script/gi,"<\\/script");
 const tokens={"__STYLE__":style,"__PROGRAMME_JSON__":JSON.stringify(core.pack(workspace)).replace(/</g,"\\u003c"),"__RUNTIME__":safe(codecSource+"\n"+coreSource+"\n"+operatorSource)};
 let html=shell;for(const[token,value]of Object.entries(tokens)){if(html.split(token).length!==2)throw Error("Missing/repeated template token "+token);html=html.replace(token,()=>value);}
 const outputs={"Manufacturing_Pilot_Desk.html":html,"Complete_Workspace.json":JSON.stringify(workspace,null,2)+"\n","Working_Profiles.csv":core.csv(workspace,"all",true),"Working_Report.html":'<!doctype html><html lang="en"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1"><title>Manufacturing study working report</title><style>'+style+'</style></head><body><main>'+core.report(workspace,"all",true)+'</main></body></html>'};
 const index=[];
 workspace.editions.forEach((edition,i)=>{const prefix="customer/edition-"+String(i+1).padStart(3,"0");const members=[];for(const[type,file]of Object.entries(edition.outputs)){const path=prefix+"."+type;outputs[path]=file.content;members.push({path,sha256:file.sha256});}index.push({id:edition.id,brief_id:edition.payload.brief.brief_id,brief_sha256:edition.payload.brief_sha256,group:edition.payload.group,profile_ids:edition.payload.profile_ids,payload_sha256:edition.payload_sha256,files:members});});
 outputs["Customer_Editions.json"]=JSON.stringify({operation_id:workspace.programme.operation_id,editions:index},null,2)+"\n";
 return outputs;
}
export {buildProgrammeArtifacts};
