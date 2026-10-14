// MIT. The maintained Runtime owns the original application process and recovery.
import {APPLICATION_PROVIDER_SCHEMA,observeApplicationStartup} from '../../stellar/scf-starforge-20261009/distribution/runtime-workspace/application-provider.mjs';
import {principalApplication,preparePrincipalApplication,principalStartup} from './application.mjs';
import {PRODUCT_SCHEMA,verifySelection} from './binding.mjs';
export default {
 schema:APPLICATION_PROVIDER_SCHEMA,id:'principal-protocol',order:650,
 catalog({common}){return [principalApplication(common)];},
 prepare(type,settings,context){return preparePrincipalApplication(settings,context);},
 matchRequest(request){return !request.pythonCommand&&request.command==='principal-protocol'&&request.args?.[0]==='launch';},
 async verifyLaunch(request){await verifySelection(request.args);},
 createObserver(request,directory){return observeApplicationStartup(request,directory,text=>text.startsWith('{')&&text.includes('"schema":"'+PRODUCT_SCHEMA+'.startup"')?()=>principalStartup(request,text):null);}
};
