'use strict';
module.exports = async function publishProcurementCompleteArchive({tools,un,loader,bank,index,readObject,apiSource,options,store,notify}){
 const get=loader(bank),api=apiSource(tools,un,'woahwhattheheck/tjlabs-stellar-merchant-workspace',options.head,options.tree);
 let last=Date.now(),lastMember='';
 try{
  const result=await get('publish-prepared-git.cjs').publishPreparedToGit(index,readObject,api,{
   ...options,
   onProgress:async state=>{store('archive_output_publication_state',state);notify({head:state.head,parts:state.committedParts,members:state.verifiedMembers,complete:state.complete});},
   onInterrupted:async (state,error)=>{store('archive_output_publication_state',state);store('archive_output_publication_error',{message:String(error),stack:error?.stack});},
   observeMember:async (member,state)=>{lastMember=member.name;if(Date.now()-last>45000){last=Date.now();notify({members:state.verifiedMembers,parts:state.parts,lastMember});}}
  });
  store('archive_output_complete',result);store('archive_output_publication_error',null);return {head:result.head,bytes:result.receipt.bytes,sha256:result.receipt.sha256,members:result.receipt.members,parts:result.manifest.parts.length};
 }catch(error){store('archive_output_publication_error',{message:String(error),stack:error?.stack,lastMember,state:error?.publicationState});throw error;}
};
