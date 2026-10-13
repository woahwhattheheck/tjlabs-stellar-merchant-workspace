// MIT. Compose into the same original Central workspace, Store and listener.
import {openCentralWorkspace} from '../workspace.mjs';
import {createCentralReleaseOperations} from './model.mjs';
import {createCentralReleaseOperationsExtension} from './server.mjs';
export function composeCentralReleaseOperations({workspace,store,formReleases,fetchImpl,gitlabConnections=[]}={}){
 const operations=createCentralReleaseOperations({workspace,store,formReleases,fetchImpl,gitlabConnections});
 return {operations,extension:createCentralReleaseOperationsExtension({operations})};
}
export async function openCentralReleaseOperations({directory,fetchImpl,gitlabConnections=[],extend}={}){
 let operations;
 const workspace=await openCentralWorkspace({directory,fetchImpl,extend:async context=>{
  if(extend)await extend(context);
  operations=createCentralReleaseOperations({...context,formReleases:context.workspace.formReleases,fetchImpl,gitlabConnections});
 }});
 return {workspace,operations,extensions:[createCentralReleaseOperationsExtension({operations})],close:()=>workspace.close()};
}
