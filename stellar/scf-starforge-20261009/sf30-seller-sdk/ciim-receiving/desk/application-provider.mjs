// MIT. CIIM desk joins the maintained Applications lifecycle.
import { APPLICATION_PROVIDER_SCHEMA, observeApplicationStartup } from '../../../distribution/runtime-workspace/application-provider.mjs';
import { ciimDeskApplication, prepareCiimDeskApplication, ciimDeskStartup } from './application.mjs';

export default {
  schema:APPLICATION_PROVIDER_SCHEMA,id:'ciim-desk',order:21,
  catalog({common}){return [ciimDeskApplication(common)];},
  prepare(type,settings,context){return prepareCiimDeskApplication(settings,context);},
  resourceKey(type,settings,{hash}){return hash({family:'ciim-receiving-desk',directory:settings.workspaceDirectory});},
  matchRequest(request){return !request.pythonCommand && request.command==='ciim-desk' && request.args?.[0]==='serve';},
  createObserver(request,directory){
    return observeApplicationStartup(request,directory,text=>{
      if(!text.startsWith('{"schema":"tjl.ciim.desk-startup.v1",'))return null;
      return ()=>ciimDeskStartup(request,text);
    });
  },
};
