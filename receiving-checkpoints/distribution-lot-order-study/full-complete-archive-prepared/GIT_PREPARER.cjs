'use strict';
module.exports=async function commitPreparedFiles(api,branch,head,directory,objects,manifest,acknowledged,options={}){
 let pending=[],size=0,count=0;
 const publish=async(last=false)=>{
   if(!pending.length&&!last)return;
   if(last)pending.push({path:directory+'checkpoint.json',mode:'100644',type:'blob',content:JSON.stringify(manifest,null,2)+'\n'});
   const actual=await api.getHead(branch);if(actual!==head)throw Error('Prepared branch changed');
   const tree=await api.createTree(await api.treeOf(head),pending);
   const next=await api.createCommit(head,tree,'Retain complete Distribution export groups '+manifest.completedGroups+(last?' and checkpoint':' source fragments'));
   await api.updateRef(branch,head,next);head=next;
   for(const row of pending)if(row.path.startsWith(directory+'objects/'))acknowledged.add(row.path.slice(directory.length));
   count+=pending.length;pending=[];size=0;
   if(options.onCommit)await options.onCommit({head,completedGroups:manifest.completedGroups,entries:manifest.entries,done:manifest.done,objects:acknowledged.size,checkpointPublished:last});
 };
 for(const [path,content]of Object.entries(objects)){
   if(acknowledged.has(path))continue;
   if(size+content.length>1950000&&pending.length)await publish();
   pending.push({path:directory+path,mode:'100644',type:'blob',content});size+=content.length;
 }
 await publish(true);return {head,publishedFiles:count};
};
