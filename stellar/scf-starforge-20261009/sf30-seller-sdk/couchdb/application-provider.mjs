// MIT. Source-owned CouchDB registration in the existing Applications lifecycle.
import { APPLICATION_PROVIDER_SCHEMA, observeApplicationStartup } from '../../distribution/runtime-workspace/application-provider.mjs';
import { couchdbApplication, prepareCouchdbApplication, couchdbStartup } from './managed.mjs';
export default {
  schema:APPLICATION_PROVIDER_SCHEMA,id:'couchdb',order:358,appendPort:false,
  catalog({common}){return [couchdbApplication(common)];},
  prepare(type,settings,context){return prepareCouchdbApplication(settings,context);},
  matchRequest(request){return !request.pythonCommand&&request.command==='couchdb-workspace';},
  createObserver(request,directory){
    return observeApplicationStartup(request,directory,line=>line.startsWith('{"schema":"stellar-forge.couchdb-workspace-startup.v1",')?()=>couchdbStartup(request,line):null,{lineLimit:32768});
  }
};
