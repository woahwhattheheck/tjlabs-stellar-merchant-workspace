'use strict';
module.exports=async function publishPerformanceCheckpoint(value,phase,{api,branch,baseHead,compact,digest,persist=()=>{},progress=()=>{},source,oldHead=null}){
 const graph=compact(value),text=JSON.stringify(graph),identity=digest(text),weights=[];
 for(const [kind,data]of graph.nodes){if(kind==='p')weights.push(digest(JSON.stringify(data)).bytes);else if(kind==='a')weights.push(2+Math.max(0,data.length-1)+data.reduce((n,id)=>n+weights[id],0));else weights.push(2+Math.max(0,data.length-1)+data.reduce((n,[key,id])=>n+digest(JSON.stringify(key)).bytes+1+weights[id],0));}
 const root='receiving-checkpoints/distribution-lot-order-study/throughput-complete/'+phase+'/',parts=[];
 for(let at=0;at<text.length;){let end=Math.min(text.length,at+650000);if(end<text.length&&/[\uD800-\uDBFF]/.test(text[end-1]))end--;const content=text.slice(at,end),meta=digest(content);parts.push({path:root+'part-'+String(parts.length).padStart(3,'0')+'.jsonpart',...meta,content});at=end;}
 const manifest={schema:'installed-complete-course-checkpoint/v1',phase,sourceHead:source.head,sourceBank:source.bank,executionSources:source.executionSources,bytes:identity.bytes,sha256:identity.sha256,expandedBytes:weights[graph.root],checks:value.checks.length,requests:value.records.length,editions:value.editions.length,sequence:value.state.sequence,stateSha256:value.state.sha256,identity:'Every original value and property order is retained by the complete compact node bank',parts:parts.map(({content,...meta})=>meta)};
 await persist({graph,manifest});let head=oldHead||await api.getHead(branch);
 for(let at=0;at<parts.length;at+=4){const selected=parts.slice(at,at+4),complete=at+selected.length===parts.length,files=selected.map(p=>({path:p.path,mode:'100644',type:'blob',content:p.content}));
  files.push({path:root+(complete?'manifest.json':'progress.json'),mode:'100644',type:'blob',content:JSON.stringify(complete?manifest:{schema:'commons.compact-checkpoint-publication/v1',phase,bytes:identity.bytes,sha256:identity.sha256,parts:manifest.parts.slice(0,at+selected.length)},null,2)+'\n'});
  const tree=await api.createTree(await api.treeOf(head),files),next=await api.createCommit(head,tree,'Retain complete Distribution '+phase+' checkpoint parts '+at+'–'+(at+selected.length));
  await persist({pending:{parent:head,next,phase,partCount:at+selected.length}});
  try{await api.updateRef(branch,head,next);}catch(e){const actual=await api.getHead(branch);if(actual!==next){if(actual!==head)throw Error('Checkpoint branch moved');await api.updateRef(branch,head,next);}}
  const actual=await api.getHead(branch);if(actual!==next)throw Error('Checkpoint publication is not the expected immutable commit');head=next;
  await persist({head,phase,partCount:at+selected.length,pending:null});progress({phase,head,parts:at+selected.length,total:parts.length});
 }
 return{head,branch,path:root+'manifest.json',manifest,graph};
};
