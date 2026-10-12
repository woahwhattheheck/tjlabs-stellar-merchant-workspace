// MIT. Source-owned Applications registration for the original Allium retained workspace.
import {join} from 'node:path';
import {APPLICATION_PROVIDER_SCHEMA,applicationPreparation,observeApplicationStartup}
  from '../../../distribution/runtime-workspace/application-provider.mjs';
import {alliumManagedOptions} from './managed.mjs';
import {ALLIUM_STARTUP_SCHEMA,ALLIUM_CONNECTION_FILENAME,alliumNeed,alliumPlain,
  readAlliumConnection,inspectAlliumListener,alliumReadPrivateJson} from './connection.mjs';

export const ALLIUM_APPLICATION_ID='allium-workspace';
export default {
  schema:APPLICATION_PROVIDER_SCHEMA,id:'allium',order:1020,
  catalog({common,field}) {
    return [{
      id:ALLIUM_APPLICATION_ID,command:'allium-managed',title:'Allium data workspace',terminal:false,
      requiredSource:'stellar/scf-starforge-20261009/partners/allium-explorer-pilot/workspace/managed.mjs',
      description:'Operate saved Allium query revisions, retained results, dataset versions, merchant terms and publisher handoffs in the original workspace.',
      fields:[
        field('workspaceDirectory','Allium workspace','path',true,
          'Existing private workspace created or received with the Allium workspace command.'),
        ...common,
      ],
    }];
  },
  validateSettings(_type,settings) {
    alliumManagedOptions(['--workspace',settings.workspaceDirectory]);
  },
  async prepare(_type,settings,{inputPath}) {
    const {args,inputs,createDirectories,path,option}=applicationPreparation(settings,inputPath);
    const workspace=await path('workspaceDirectory','directory',false,true);
    option('--workspace',workspace.path);
    // Pin the stable original workspace ID; its mutable state remains editable between starts.
    const state=(await alliumReadPrivateJson(join(workspace.path,'workspace.json'),32*1024*1024)).value;
    alliumNeed(state.schema==='stellar-forge.allium-workspace.v1' && /^allium-[a-f0-9-]{36}$/.test(state.id),
      'ALLIUM_WORKSPACE_INVALID','Select an original Allium workspace.');
    option('--workspace-id',state.id);
    return {args,inputs,createDirectories};
  },
  matchRequest(request) { return !request.pythonCommand && request.command==='allium-managed'; },
  createObserver(request,directory) {
    return observeApplicationStartup(request,directory,text=>{
      if (!text.startsWith('{"schema":"'+ALLIUM_STARTUP_SCHEMA+'",')) return null;
      return ()=>alliumApplicationStartup(request,text);
    });
  },
};
export async function alliumApplicationStartup(request,text) {
  if (request.command!=='allium-managed') return null;
  let announced; try { announced=JSON.parse(text); } catch { return null; }
  if (!alliumPlain(announced)||announced.schema!==ALLIUM_STARTUP_SCHEMA||announced.status!=='ALLIUM_WORKSPACE_READY') return null;
  const selected=alliumManagedOptions(request.args);
  alliumNeed(announced.directory===selected.directory &&
    announced.connectionFile===join(selected.directory,ALLIUM_CONNECTION_FILENAME),
  'ALLIUM_APPLICATION_STARTUP_CHANGED','The Allium launch differs from the reviewed application.',409);
  const connection=await readAlliumConnection(announced.connectionFile,{directory:selected.directory,workspaceId:selected.workspaceId});
  alliumNeed(connection.sha256===announced.connectionSha256 &&
    ['instanceId','pid','workspaceId','origin','url'].every(key=>connection.value[key]===announced[key]) &&
    (!selected.port||Number(new URL(connection.value.origin).port)===selected.port),
  'ALLIUM_APPLICATION_STARTUP_CHANGED','The original listener differs from its startup record.',409);
  const input=request.inputs?.find(value=>value.path===selected.directory&&value.kind==='directory');
  if(input?.exists) alliumNeed(connection.value.directoryIdentity.dev===String(input.dev)&&
    connection.value.directoryIdentity.ino===String(input.ino),
  'ALLIUM_APPLICATION_STARTUP_CHANGED','The original workspace directory changed after review.',409);
  await inspectAlliumListener(connection);
  return {url:connection.value.url,workspaceId:connection.value.workspaceId,connectionFile:connection.path,
    original:{schema:ALLIUM_STARTUP_SCHEMA,directory:selected.directory,workspaceId:connection.value.workspaceId,
      instanceId:connection.value.instanceId,pid:connection.value.pid,connectionSha256:connection.sha256}};
}
