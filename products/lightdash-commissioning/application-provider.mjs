// MIT. Additive source-owned registration; the original Applications runner owns the child.
import {APPLICATION_PROVIDER_SCHEMA,observeApplicationStartup} from '../../stellar/scf-starforge-20261009/distribution/runtime-workspace/application-provider.mjs';
import {lightdashApplication,prepareLightdashApplication,lightdashStartup,STARTUP_SCHEMA} from './application.mjs';
export default {
 schema:APPLICATION_PROVIDER_SCHEMA,id:'lightdash-commissioning',order:720,
 catalog({common}){return [lightdashApplication(common)];},
 prepare(type,settings,context){return prepareLightdashApplication(settings,context);},
 matchRequest(request){return !request.pythonCommand&&request.command==='lightdash-project';},
 createObserver(request,directory){
  return observeApplicationStartup(request,directory,line=>line.startsWith('{"schema":"'+STARTUP_SCHEMA+'",')?
   ()=>lightdashStartup(request,line):null,{lineLimit:32768});
 }
};
