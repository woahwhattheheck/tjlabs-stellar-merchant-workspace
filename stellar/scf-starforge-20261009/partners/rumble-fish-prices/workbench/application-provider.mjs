// MIT. Source-owned Applications registration for the original Rumble retained workspace.
import {join} from 'node:path';
import {APPLICATION_PROVIDER_SCHEMA,applicationPreparation,observeApplicationStartup}
  from '../../../distribution/runtime-workspace/application-provider.mjs';
import {rumbleManagedOptions} from './managed.mjs';
import {RUMBLE_STARTUP_SCHEMA,RUMBLE_CONNECTION_FILENAME,rumbleNeed,rumblePlain,
  readRumbleConnection,inspectRumbleListener,rumbleReadPrivateJson} from './connection.mjs';

export const RUMBLE_APPLICATION_ID='rumble-workspace';
export default {
  schema:APPLICATION_PROVIDER_SCHEMA,id:'rumble',order:1140,
  catalog({common,field}) {
    return [{
      id:RUMBLE_APPLICATION_ID,command:'rumble-managed',title:'Rumble data workspace',terminal:false,
      requiredSource:'stellar/scf-starforge-20261009/partners/rumble-fish-prices/workbench/managed.mjs',
      description:'Operate retained source prices, customer books, exact valuations, reviewed editions, wallet feeds and complete receiving in the original customer workspace.',
      fields:[
        field('workspaceDirectory','Rumble workspace','path',true,
          'Existing private workspace created or received with the Rumble workspace command.'),
        ...common,
      ],
    }];
  },
  validateSettings(_type,settings) {
    rumbleManagedOptions(['--workspace',settings.workspaceDirectory]);
  },
  async prepare(_type,settings,{inputPath}) {
    const {args,inputs,createDirectories,path,option}=applicationPreparation(settings,inputPath);
    const workspace=await path('workspaceDirectory','directory',false,true);
    option('--workspace',workspace.path);
    // Pin the stable original workspace ID; its mutable state remains editable between starts.
    const state=(await rumbleReadPrivateJson(join(workspace.path,'workspace.json'),32*1024*1024)).value;
    rumbleNeed(state.schema==='tjlabs.prices-workbench.workspace.v1' && /^workspace-[a-f0-9]{24}$/.test(state.id),
      'RUMBLE_WORKSPACE_INVALID','Select an original Rumble workspace.');
    option('--workspace-id',state.id);
    return {args,inputs,createDirectories};
  },
  matchRequest(request) { return !request.pythonCommand && request.command==='rumble-managed'; },
  createObserver(request,directory) {
    return observeApplicationStartup(request,directory,text=>{
      if (!text.startsWith('{"schema":"'+RUMBLE_STARTUP_SCHEMA+'",')) return null;
      return ()=>rumbleApplicationStartup(request,text);
    });
  },
};
export async function rumbleApplicationStartup(request,text) {
  if (request.command!=='rumble-managed') return null;
  let announced; try { announced=JSON.parse(text); } catch { return null; }
  if (!rumblePlain(announced)||announced.schema!==RUMBLE_STARTUP_SCHEMA||announced.status!=='RUMBLE_WORKSPACE_READY') return null;
  const selected=rumbleManagedOptions(request.args);
  rumbleNeed(announced.directory===selected.directory &&
    announced.connectionFile===join(selected.directory,RUMBLE_CONNECTION_FILENAME),
  'RUMBLE_APPLICATION_STARTUP_CHANGED','The Rumble launch differs from the reviewed application.',409);
  const connection=await readRumbleConnection(announced.connectionFile,{directory:selected.directory,workspaceId:selected.workspaceId});
  rumbleNeed(connection.sha256===announced.connectionSha256 &&
    ['instanceId','pid','workspaceId','origin','url'].every(key=>connection.value[key]===announced[key]) &&
    (!selected.port||Number(new URL(connection.value.origin).port)===selected.port),
  'RUMBLE_APPLICATION_STARTUP_CHANGED','The original listener differs from its startup record.',409);
  const input=request.inputs?.find(value=>value.path===selected.directory&&value.kind==='directory');
  if(input?.exists) rumbleNeed(connection.value.directoryIdentity.dev===String(input.dev)&&
    connection.value.directoryIdentity.ino===String(input.ino),
  'RUMBLE_APPLICATION_STARTUP_CHANGED','The original workspace directory changed after review.',409);
  await inspectRumbleListener(connection);
  return {url:connection.value.url,workspaceId:connection.value.workspaceId,connectionFile:connection.path,
    original:{schema:RUMBLE_STARTUP_SCHEMA,directory:selected.directory,workspaceId:connection.value.workspaceId,
      instanceId:connection.value.instanceId,pid:connection.value.pid,connectionSha256:connection.sha256}};
}
