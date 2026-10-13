// MIT. Additive source-owned registration; the original Applications runner owns each child.
import {APPLICATION_PROVIDER_SCHEMA,observeApplicationStartup} from '../../stellar/scf-starforge-20261009/distribution/runtime-workspace/application-provider.mjs';
import {lightdashApplication,prepareLightdashApplication,lightdashStartup,STARTUP_SCHEMA,
 lightdashOperatingApplication,prepareLightdashOperatingApplication,lightdashOperatingStartup,OPERATING_STARTUP_SCHEMA} from './application.mjs';
export default {
 schema:APPLICATION_PROVIDER_SCHEMA,id:'lightdash-commissioning',order:720,
 catalog({common}){return [lightdashApplication(common),lightdashOperatingApplication(common)];},
 prepare(type,settings,context){
  if(type==='lightdash-commissioning')return prepareLightdashApplication(settings,context);
  if(type==='lightdash-operating-plan')return prepareLightdashOperatingApplication(settings,context);
  throw new Error('Select a registered Lightdash application type.');
 },
 matchRequest(request){return !request.pythonCommand&&['lightdash-project','lightdash-operating-plan'].includes(request.command);},
 createObserver(request,directory){
  const operating=request.command==='lightdash-operating-plan',schema=operating?OPERATING_STARTUP_SCHEMA:STARTUP_SCHEMA,
   startup=operating?lightdashOperatingStartup:lightdashStartup;
  return observeApplicationStartup(request,directory,line=>line.startsWith('{"schema":"'+schema+'",')?
   ()=>startup(request,line):null,{lineLimit:32768});
 }
};
