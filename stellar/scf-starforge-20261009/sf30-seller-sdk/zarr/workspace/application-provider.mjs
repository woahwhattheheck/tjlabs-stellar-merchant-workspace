/** The shared Applications model retains the original command and process. */
import {APPLICATION_PROVIDER_SCHEMA,observeApplicationStartup} from '../../../distribution/runtime-workspace/application-provider.mjs';
import {zarrApplication,prepareZarrApplication,zarrApplicationStartup} from './application.mjs';
import {ZARR_STARTUP_SCHEMA,ZARR_COMMAND} from './launch.mjs';
export default{
 schema:APPLICATION_PROVIDER_SCHEMA,id:'zarr-workspace',order:1260,
 catalog({common}){return [zarrApplication(common)];},
 prepare(_type,settings,context){return prepareZarrApplication(settings,context);},
 matchRequest(request){return !request.pythonCommand&&request.command===ZARR_COMMAND;},
 createObserver(request,directory){
  return observeApplicationStartup(request,directory,line=>line.startsWith('{"schema":"'+ZARR_STARTUP_SCHEMA+'",')?
   ()=>zarrApplicationStartup(request,line):null,{lineLimit:1024*1024});
 }
};
